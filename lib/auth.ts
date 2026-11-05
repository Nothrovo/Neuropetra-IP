import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { findUser, loadSession, storeSession, consumeAttempt, findUserById } from './user-repository';
import { getAuthPool } from './db-pool';
export type Role = 'analyst' | 'admin';
export interface Session { userId: string; username: string; role: Role; expiresAt: number; recentAuthAt: number; sessionId: string }
export class AuthError extends Error {
 constructor(public readonly status: number, message: string) { super(message); this.name='AuthError'; }
}
export const AUTH_COOKIE_NAME = 'soc_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 12;
export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function opaqueToken(): string { return randomBytes(32).toString('base64url'); }
export function validateUsername(value: unknown): asserts value is string {
 if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$/.test(value))
  throw new AuthError(400,'Username must be 3–64 letters, digits, dots, underscores or hyphens');
}
export function validatePassword(value: unknown): asserts value is string {
 if (typeof value !== 'string' || [...value].length<15 || [...value].length>128)
  throw new AuthError(400,'Password must be 15–128 characters');
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
 return new Promise((resolve,reject)=>scrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024},(err,key)=>err?reject(err):resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
 validatePassword(password); const salt=randomBytes(16); const key=await derive(password,salt);
 return `scrypt$131072$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
 if (typeof password!=='string' || [...password].length>128) return false;
 const match=/^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(hash);
 if (!match) return false;
 const key=await derive(password,Buffer.from(match[1],'hex'));
 return timingSafeEqual(key,Buffer.from(match[2],'hex'));
}
export async function throttleAuth(bucket: string, limit: number): Promise<void> {
 if (!await consumeAttempt(bucket,limit)) throw new AuthError(429,'Too many attempts; try again later');
}
export async function login(username: string, password: string): Promise<{token:string;session:Session}> {
 await throttleAuth('login:global',100);
 if (typeof username!=='string' || username.length>64 || typeof password!=='string' || [...password].length>128)
  throw new AuthError(401,'Invalid credentials');
 await throttleAuth(`login:${hashToken(username)}`,10);
 const user=await findUser(username);
 // Fixed dummy hash only equalizes unknown-user KDF cost; never authenticates.
 const dummy='scrypt$131072$8$1$'+'0'.repeat(32)+'$'+'0'.repeat(128);
 const valid=await verifyPassword(password,user?.password_hash ?? dummy);
 if (!valid || !user || user.disabled) throw new AuthError(401,'Invalid credentials');
 const installed=await getAuthPool().query('SELECT 1 FROM ip_intel_installation WHERE singleton AND installed_at IS NOT NULL');
 if (!installed.rowCount) throw new AuthError(401,'Invalid credentials');
 const token=opaqueToken(); const expiresAt=Date.now()+SESSION_TTL_SECONDS*1000;
 if (!await storeSession(hashToken(token),user.id,expiresAt,user.password_hash)) throw new AuthError(401,'Invalid credentials');
 const session=await loadSession(hashToken(token));
 if (!session) throw new AuthError(401,'Unauthorized');
 return {token,session};
}
export async function requireSession(request: Request): Promise<Session> {
 const values=(request.headers.get('cookie') ?? '').split(';').map(v=>v.trim()).filter(v=>v.startsWith(AUTH_COOKIE_NAME+'='));
 if (values.length!==1) throw new AuthError(401,'Unauthorized');
 const token=values[0].slice(AUTH_COOKIE_NAME.length+1);
 if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError(401,'Unauthorized');
 const session=await loadSession(hashToken(token));
 if (!session || !['admin','analyst'].includes(session.role) || session.expiresAt<=Date.now()) throw new AuthError(401,'Unauthorized');
 return session;
}
export async function getSession(): Promise<Session|null> {
 const { headers }=await import('next/headers');
 try {return await requireSession(new Request('http://internal.invalid',{headers:await headers()}));}
 catch(error) {if(error instanceof AuthError && error.status===401)return null; throw error;}
}
export async function revokeSession(session: Session): Promise<void> {
 await getAuthPool().query('UPDATE ip_intel_sessions SET revoked_at=now() WHERE token_hash=$1',[session.sessionId]);
}
export function requireRecentAuth(session: Session): void {
 const age=Date.now()-session.recentAuthAt;
 if (!Number.isFinite(age) || age<0 || age>5*60*1000) throw new AuthError(403,'Recent reauthentication required');
}
export async function reauthenticate(session: Session, password: string): Promise<void> {
 await throttleAuth(`reauth:${session.userId}`,10);
 const user=await findUserById(session.userId);
 if (!user || user.disabled || !await verifyPassword(password,user.password_hash)) throw new AuthError(401,'Invalid credentials');
 const result=await getAuthPool().query('UPDATE ip_intel_sessions SET recent_auth_at=now() WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()',[session.sessionId]);
 if(!result.rowCount)throw new AuthError(401,'Unauthorized');
}
