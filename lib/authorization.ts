import { AuthError, requireSession, type Role, type Session } from './auth';
import { getAppOrigin } from './config';
export { requireRecentAuth } from './auth';
export type Permission = 'read' | 'enrich' | 'export' | 'feed:read' | 'database:read' | 'database:manage';
const permissions: Record<Role, readonly Permission[]> = {
 analyst: ['read'],
 admin: ['read','enrich','export','feed:read','database:read','database:manage'],
};
export function permissionsFor(role: Role): Permission[] { return [...(permissions[role] ?? [])]; }
export function requirePermission(session: Session, permission: Permission): void {
 if (!permissionsFor(session.role).includes(permission)) throw new AuthError(403,'Forbidden');
}
export function validateOrigin(request: Request): void {
 const expected=getAppOrigin();
 if (request.headers.get('origin')!==expected || request.headers.get('sec-fetch-site')==='cross-site')
  throw new AuthError(403,'Untrusted request origin');
}
export function apiError(error: unknown): Response {
 const known=error instanceof AuthError;
 return Response.json({error: known ? error.message : 'Service unavailable'}, {
  status:known?error.status:503,headers:{'Cache-Control':'no-store',...(known&&error.status===429?{'Retry-After':'900'}:{})},
 });
}
export function withApiPermission<C = unknown>(
 handler: (request: Request, context: C, session: Session) => Promise<Response> | Response,
 permission: Permission,
): (request: Request, context: C) => Promise<Response> {
 return async(request,context)=>{
  try {
   const session=await requireSession(request);
   requirePermission(session,permission);
   if(!['GET','HEAD','OPTIONS'].includes(request.method)) validateOrigin(request);
   const response=await handler(request,context,session);
   response.headers.set('Cache-Control','no-store');
   return response;
  } catch(error) {return apiError(error);}
 };
}
/** Accept local absolute paths only; URLs, protocol-relative paths and browser normalization tricks are rejected. */
export function safeReturnPath(value: string | null | undefined): string {
 if(!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s\u0000-\u001f]/.test(value) || /%(?:2f|5c|0[ad])/i.test(value)) return '/';
 try {
  const parsed=new URL(value,'https://return.invalid');
  if(parsed.origin!=='https://return.invalid' || ['/login','/setup'].includes(parsed.pathname))return '/';
  return parsed.pathname+parsed.search+parsed.hash;
 }catch{return '/';}
}
/** Bounded streaming JSON parser. Reject before buffering an unbounded request. */
export async function readAuthJson(request: Request): Promise<Record<string,unknown>> {
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new AuthError(415,'Expected application/json');
 const reader=request.body?.getReader(); if(!reader)throw new AuthError(400,'Invalid request');
 const chunks:Uint8Array[]=[];let size=0;
 try {
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>8192){await reader.cancel();throw new AuthError(413,'Request too large');}chunks.push(value);}
  const data:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!data || typeof data!=='object' || Array.isArray(data))throw new Error();
  return data as Record<string,unknown>;
 }catch(error){if(error instanceof AuthError)throw error;throw new AuthError(400,'Invalid request');}
 finally {reader.releaseLock();}
}
