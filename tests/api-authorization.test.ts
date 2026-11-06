import {describe,it,expect,vi} from 'vitest';
const {requireSession}=vi.hoisted(()=>({requireSession:vi.fn()}));
vi.mock('../lib/auth',async importOriginal=>({...await importOriginal<typeof import('../lib/auth')>(),requireSession}));
import {AuthError,type Session} from '../lib/auth';
import {GET as ip} from '../app/api/ip/[ip]/route';
import {GET as events} from '../app/api/ip/[ip]/events/route';
import {GET as summary} from '../app/api/ip/[ip]/summary/route';
import {GET as providers} from '../app/api/providers/route';
import {GET as provider} from '../app/api/providers/[name]/route';
import {GET as providerExport} from '../app/api/providers/[name]/export/route';
import {GET as blocklist} from '../app/api/blocklist/route';
import {GET as stats} from '../app/api/stats/route';
import {GET as dashboard} from '../app/api/dashboard/route';
import {POST as bulk} from '../app/api/bulk/route';
import {POST as enrich} from '../app/api/enrich/route';
import {GET as settingsEnrichmentGet, POST as settingsEnrichmentPost} from '../app/api/admin/settings/enrichment/route';
const analyst:Session={userId:'test-analyst',username:'test-analyst',role:'analyst',expiresAt:Date.now()+60000,recentAuthAt:Date.now(),sessionId:'synthetic'};
describe('actual authorization wrappers cover every existing sensitive API',()=>{
 it('denies missing/forged sessions directly at all data/feed handlers',async()=>{
  requireSession.mockRejectedValue(new AuthError(401,'Unauthorized'));
  const request=new Request('http://localhost/api/test');
  for(const handler of [providers,stats,dashboard,bulk,enrich,blocklist,settingsEnrichmentGet,settingsEnrichmentPost])expect((await handler(request,undefined)).status).toBe(401);
  for(const handler of [ip,events,summary])expect((await handler(request,{params:Promise.resolve({ip:'8.8.8.8'})})).status).toBe(401);
  for(const handler of [provider,providerExport])expect((await handler(request,{params:Promise.resolve({name:'fixture'})})).status).toBe(401);
 });
 it('denies analyst enrichment/export/feed even with valid origin and direct invocation',async()=>{
  requireSession.mockResolvedValue(analyst);
  const request=new Request('http://localhost/api/test',{method:'POST',headers:{origin:'http://localhost'},body:'{}'});
  expect((await enrich(request,undefined)).status).toBe(403);
  expect((await settingsEnrichmentGet(new Request('http://localhost/api/test'),undefined)).status).toBe(403);
  expect((await settingsEnrichmentPost(request,undefined)).status).toBe(403);
  expect((await providerExport(new Request('http://localhost/api/test'),{params:Promise.resolve({name:'fixture'})})).status).toBe(403);
  expect((await blocklist(new Request('http://localhost/api/test'),undefined)).status).toBe(403);
 });
});
