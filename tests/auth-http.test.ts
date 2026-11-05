import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('../lib/auth',async(original)=>({...await original<typeof import('../lib/auth')>(),login:vi.fn(),requireSession:vi.fn(),revokeSession:vi.fn(),reauthenticate:vi.fn()}));
vi.mock('../lib/feed-auth',()=>({requireFeedToken:vi.fn()}));
import { requireFeedToken } from '../lib/feed-auth';
vi.mock('../lib/bootstrap',()=>({completeBootstrap:vi.fn(),getInstallationState:vi.fn()}));
vi.mock('../lib/db-pool',()=>({getReadPool:vi.fn(),getAuthPool:vi.fn()}));
import { AuthError, login, requireSession, revokeSession, reauthenticate, type Session } from '../lib/auth';
import { completeBootstrap, getInstallationState } from '../lib/bootstrap';
import { POST as signIn } from '../app/api/auth/login/route';
import { POST as logout } from '../app/api/auth/logout/route';
import { GET as session } from '../app/api/auth/session/route';
import { POST as setup, GET as setupStatus } from '../app/api/setup/route';
import { POST as reauth } from '../app/api/auth/reauth/route';
import { GET as ready } from '../app/api/ready/route';
import { GET as health } from '../app/api/health/route';
import { proxy } from '../proxy';
const actor:Session={userId:'synthetic',username:'operator',role:'admin',expiresAt:Date.now()+10000,recentAuthAt:Date.now(),sessionId:'private-session-hash'};
const req=(path:string,body:unknown,origin='https://intel.example.invalid')=>new Request(`https://intel.example.invalid${path}`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();process.env.APP_ORIGIN='https://intel.example.invalid';process.env.MAINTENANCE_DATABASE_URL='';process.env.MAINTENANCE_DATABASE_URL_FILE='';process.env.ABUSEIPDB_API_KEY='';vi.mocked(requireSession).mockResolvedValue(actor);});
describe('direct authentication handlers and proxy',()=>{
 it('login validates Origin/body and uses configured secure cookies, never forwarded TLS',async()=>{
  vi.mocked(login).mockResolvedValue({token:'x'.repeat(43),session:actor});
  const response=await signIn(req('/api/auth/login',{username:'operator',password:'long synthetic password'}));
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/);expect(response.headers.get('set-cookie')).toMatch(/Secure/);expect(response.headers.get('set-cookie')).toMatch(/SameSite=lax/i);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await signIn(req('/api/auth/login',{username:'operator',password:'long synthetic password'},'https://evil.invalid'))).status).toBe(403);
  expect((await signIn(req('/api/auth/login',{username:[],password:'pw'}))).status).toBe(400);
  expect((await signIn(req('/api/auth/login',{username:'a',password:'x'.repeat(9000)}))).status).toBe(413);
  vi.mocked(login).mockRejectedValue(new AuthError(401,'Invalid credentials'));
  expect(await (await signIn(req('/api/auth/login',{username:'operator',password:'wrong'}))).json()).toEqual({error:'Invalid credentials'});
 });
 it('session returns only approved identity, permission and capability DTO',async()=>{
  const response=await session(new Request('https://intel.example.invalid/api/auth/session'));
  expect(await response.json()).toEqual({user:{userId:'synthetic',username:'operator',role:'admin'},permissions:['read','enrich','export','feed:read','database:read','database:manage'],capabilities:{externalEnrichment:false,maintenance:false}});
  vi.mocked(requireSession).mockRejectedValue(new AuthError(401,'Unauthorized'));
  expect((await session(new Request('https://intel.example.invalid/api/auth/session'))).status).toBe(401);
 });
 it('logout revokes server-side token and reauthentication updates existing session only',async()=>{
  expect((await logout(req('/api/auth/logout',{}))).status).toBe(200);expect(revokeSession).toHaveBeenCalledWith(actor);
  expect((await reauth(req('/api/auth/reauth',{password:'long synthetic password'}))).status).toBe(200);expect(reauthenticate).toHaveBeenCalledWith(actor,'long synthetic password');
  expect((await reauth(req('/api/auth/reauth',{password:'x'},'null'))).status).toBe(403);
 });
 it('setup does not expose secrets and never converts dependency errors into setup-required',async()=>{
  vi.mocked(getInstallationState).mockResolvedValue('setup-required');
  expect(await (await setupStatus()).json()).toEqual({state:'setup-required'});
  expect((await setup(req('/api/setup',{token:'x'.repeat(43),username:'owner',password:'long synthetic password'}))).status).toBe(201);
  expect(completeBootstrap).toHaveBeenCalledWith({token:'x'.repeat(43),username:'owner',password:'long synthetic password'});
  vi.mocked(getInstallationState).mockRejectedValue(new Error('postgresql://private-marker'));
  const failed=await setupStatus();expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('private-marker');
  expect(await (await health()).json()).toEqual({status:'ok'});
  const unavailable=await ready();expect(unavailable.status).toBe(503);expect(await unavailable.text()).not.toContain('postgresql');
 });
 it('proxy accepts validated feed tokens only for the exact feed GET route',async()=>{
  vi.mocked(requireSession).mockRejectedValue(new AuthError(401,'Unauthorized'));
  vi.mocked(requireFeedToken).mockResolvedValue({id:'synthetic-feed'});
  const headers={authorization:'Bearer '+'x'.repeat(43)};
  expect((await proxy(new NextRequest('https://intel.example.invalid/api/blocklist',{headers}))).headers.get('x-middleware-next')).toBe('1');
  expect(requireFeedToken).toHaveBeenCalledTimes(1);
  expect((await proxy(new NextRequest('https://intel.example.invalid/api/stats',{headers}))).status).toBe(401);
  expect((await proxy(new NextRequest('https://intel.example.invalid/api/blocklist',{method:'POST',headers}))).status).toBe(401);
  vi.mocked(requireFeedToken).mockRejectedValue(new AuthError(401,'Unauthorized'));
  expect((await proxy(new NextRequest('https://intel.example.invalid/api/blocklist',{headers}))).status).toBe(401);
 });
 it('proxy verifies cookie contents and protects direct API routes, exempting only exact public paths',async()=>{
  vi.mocked(requireSession).mockRejectedValue(new AuthError(401,'Unauthorized'));
  const denied=await proxy(new NextRequest('https://intel.example.invalid/api/private',{headers:{cookie:'soc_session=forged'}}));expect(denied.status).toBe(401);
  const redirect=await proxy(new NextRequest('https://intel.example.invalid/investigate?mode=local'));
  expect(redirect.headers.get('location')).toContain('/login?from=');
  expect((await proxy(new NextRequest('https://intel.example.invalid/api/auth/arbitrary'))).status).toBe(401);
  expect((await proxy(new NextRequest('https://intel.example.invalid/setup'))).headers.get('x-middleware-next')).toBe('1');
  vi.mocked(requireSession).mockRejectedValue(new Error('secret-DSN'));
  expect((await proxy(new NextRequest('https://intel.example.invalid/investigate'))).status).toBe(503);
 });
});
