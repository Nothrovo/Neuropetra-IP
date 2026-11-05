import { getAuthPool } from './db-pool';
import type { Role, Session } from './auth';
export interface UserRecord { id: string; username: string; password_hash: string; role: Role; disabled: boolean }
export async function findUser(username: string): Promise<UserRecord | null> {
 const result = await getAuthPool().query<UserRecord>('SELECT id,username,password_hash,role,disabled FROM ip_intel_users WHERE username=$1', [username]);
 return result.rows[0] ?? null;
}
export async function findUserById(id: string): Promise<UserRecord | null> {
 const result = await getAuthPool().query<UserRecord>('SELECT id,username,password_hash,role,disabled FROM ip_intel_users WHERE id=$1', [id]);
 return result.rows[0] ?? null;
}
/** Serialize session creation with password reset's UPDATE on this user row. */
export async function storeSession(hash: string, userId: string, expiresAt: number, verifiedPasswordHash: string): Promise<boolean> {
 const client = await getAuthPool().connect();
 try {
  await client.query('BEGIN');
  // Do the expensive KDF before locking, then recheck its exact credential
  // snapshot under the same row lock reset holds through session revocation.
  const result = await client.query<Pick<UserRecord, 'password_hash' | 'disabled'>>(
   'SELECT password_hash,disabled FROM ip_intel_users WHERE id=$1 FOR UPDATE', [userId]);
  const current = result.rows[0];
  if (!current || current.disabled || current.password_hash !== verifiedPasswordHash) {
   await client.query('ROLLBACK');
   return false;
  }
  await client.query('INSERT INTO ip_intel_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)',[hash,userId,new Date(expiresAt)]);
  await client.query('COMMIT');
  return true;
 } catch (error) {
  await client.query('ROLLBACK');
  throw error;
 } finally { client.release(); }
}
export async function loadSession(hash: string): Promise<Session | null> {
 const result = await getAuthPool().query<{id:string;username:string;role:Role;expires_at:Date;recent_auth_at:Date}>(
  `SELECT u.id,u.username,u.role,s.expires_at,s.recent_auth_at FROM ip_intel_sessions s
   JOIN ip_intel_users u ON u.id=s.user_id CROSS JOIN ip_intel_installation i
   WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND NOT u.disabled AND i.singleton AND i.installed_at IS NOT NULL`,[hash]);
 const row=result.rows[0];
 return row ? {userId:row.id,username:row.username,role:row.role,expiresAt:row.expires_at.getTime(),recentAuthAt:row.recent_auth_at.getTime(),sessionId:hash} : null;
}
/** Shared database counter; no trust in arbitrary forwarded identity headers. */
export async function consumeAttempt(bucket: string, limit: number): Promise<boolean> {
 const result=await getAuthPool().query<{attempts:number}>(
  `INSERT INTO ip_intel_auth_attempts(bucket,window_start,attempts) VALUES($1,now(),1)
   ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN ip_intel_auth_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE ip_intel_auth_attempts.attempts+1 END,
   window_start=CASE WHEN ip_intel_auth_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE ip_intel_auth_attempts.window_start END RETURNING attempts`,[bucket]);
 return result.rows[0].attempts <= limit;
}
