import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError, requireRecentAuth, type Session } from '../lib/auth';
import { requirePermission, permissionsFor, validateOrigin, withApiPermission, apiError, safeReturnPath } from '../lib/authorization';
vi.mock('../lib/auth',async(importOriginal)=>({...await importOriginal<typeof import('../lib/auth')>(),requireSession:vi.fn()}));
import { requireSession } from '../lib/auth';
const session:Session={userId:'synthetic',username:'reader',role:'analyst',expiresAt:Date.now()+10000,recentAuthAt:Date.now(),sessionId:'hash'};
afterEach(()=>vi.unstubAllEnvs());
describe('authorization boundary',()=>{
 it('gives analysts read only and admins all explicit permissions including feeds',()=>{
  expect(permissionsFor('analyst')).toEqual(['read']);
  expect(()=>requirePermission(session,'enrich')).toThrowError('Forbidden');
  for(const p of ['read','enrich','export','feed:read','database:read','database:manage'] as const)expect(()=>requirePermission({...session,role:'admin'},p)).not.toThrow();
 });
 it('enforces configured exact Origin for mutations without trusting forwarded values',()=>{
  vi.stubEnv('APP_ORIGIN','https://intel.example.invalid');
  expect(()=>validateOrigin(new Request('http://internal/api',{headers:{origin:'https://intel.example.invalid'}}))).not.toThrow();
  for(const origin of [undefined,'null','https://attacker.invalid','https://intel.example.invalid/'])expect(()=>validateOrigin(new Request('http://internal/api',{headers:{...(origin?{origin}:{}),'x-forwarded-host':'intel.example.invalid'}}))).toThrow();
  vi.stubEnv('APP_ORIGIN','');expect(()=>validateOrigin(new Request('http://internal/api',{headers:{origin:'http://internal'}}))).toThrow();
 });
 it('checks sessions/permissions in direct handlers and hides internal failures',async()=>{
  const handler=vi.fn(async(_req:Request,_ctx:{params:Promise<{id:string}>},actor:Session)=>Response.json({id:actor.userId}));
  const wrapped=withApiPermission(handler,'database:manage'); const ctx={params:Promise.resolve({id:'1'})};
  vi.mocked(requireSession).mockRejectedValueOnce(new AuthError(401,'Unauthorized'));
  expect((await wrapped(new Request('http://local'),ctx)).status).toBe(401);
  vi.mocked(requireSession).mockResolvedValueOnce(session);
  expect((await wrapped(new Request('http://local'),ctx)).status).toBe(403);expect(handler).not.toHaveBeenCalled();
  vi.mocked(requireSession).mockResolvedValueOnce({...session,role:'admin'});
  expect((await wrapped(new Request('http://local'),ctx)).status).toBe(200);
  expect(await apiError(new Error('secret-DSN')).text()).not.toContain('secret-DSN');
 });
 it('requires server-side recent authentication and confines return redirects',()=>{
  expect(()=>requireRecentAuth({...session,recentAuthAt:Date.now()-301000})).toThrow();
  expect(()=>requireRecentAuth({...session,recentAuthAt:NaN})).toThrow();
  expect(()=>requireRecentAuth(session)).not.toThrow();
  for(const path of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/%2f%2fevil.invalid','/login','/setup'])expect(safeReturnPath(path)).toBe('/');
  expect(safeReturnPath('/investigate?mode=local')).toBe('/investigate?mode=local');
 });
});
