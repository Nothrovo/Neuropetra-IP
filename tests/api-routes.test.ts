import { describe,it,expect,vi,afterEach } from 'vitest';
vi.mock('../lib/authorization',()=>({withApiPermission:(handler:(...args:unknown[])=>Promise<Response>)=>(request:Request,context:unknown)=>handler(request,context,{userId:'synthetic-admin',role:'admin'})}));
import {POST as bulk} from '../app/api/bulk/route';
import {POST as enrich} from '../app/api/enrich/route';
import {GET as detail} from '../app/api/ip/[ip]/route';
import {GET as events} from '../app/api/ip/[ip]/events/route';
import { MOCK_IP_EVENTS } from '../lib/mock-data';
import {upsertIpIntelReputation} from '../lib/db';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const req=(body:unknown)=>new Request('http://localhost/api/test',{method:'POST',headers:{origin:'http://localhost'},body:JSON.stringify(body)});
describe('direct handler input and cache contracts',()=>{
 it('returns 400 for malformed/nonstring/overlimit instead of filtering or 500',async()=>{
  for(const body of [{ips:[42]},{ips:['bad']},{ips:Array(201).fill('8.8.8.8')}])expect((await bulk(req(body),undefined)).status).toBe(400);
  expect((await bulk(new Request('http://localhost',{method:'POST',body:'{'}),undefined)).status).toBe(400);
  expect((await enrich(req({ips:Array(101).fill('8.8.8.8')}),undefined)).status).toBe(400);
 });
 it('local lookup never fetches or writes and preserves zero-alert reputation-only result',async()=>{
  await upsertIpIntelReputation({ip:'198.51.100.202',abuseScore:0});
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const response=await bulk(req({ips:['198.51.100.202']}),undefined);const data=await response.json();
  expect(data.results[0]).toMatchObject({found:true,totalAlertCount:0,abuseScore:0,lastSeen:null});expect(fetcher).not.toHaveBeenCalled();
 });
 it('reuses only fresh reputation and mock mode never egresses even when enabled',async()=>{
  vi.stubEnv('USE_MOCK_DATA','true');vi.stubEnv('ENABLE_EXTERNAL_ENRICHMENT','true');vi.stubEnv('ABUSEIPDB_API_KEY','synthetic');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await upsertIpIntelReputation({ip:'1.1.1.1',abuseScore:0});
  const response=await enrich(req({ips:['1.1.1.1','8.8.8.8','fc00::1']}),undefined);const data=await response.json();
  expect(data.results[0]).toMatchObject({status:'cached',abuseScore:0});expect(data.results[1].status).toBe('error');
  expect(data.results[2]).toMatchObject({status:'private',isWhitelisted:false,verdict:'Unknown',abuseScore:null});expect(fetcher).not.toHaveBeenCalled();
 });
 it('rejects CIDR and bad numeric params and detects older critical event independently of first50',async()=>{
  expect((await detail(new Request('http://localhost/api/ip/test'),{params:Promise.resolve({ip:'8.8.8.8/32'})})).status).toBe(400);
  expect((await events(new Request('http://localhost/api/ip/test/events?limit=NaN'),{params:Promise.resolve({ip:'8.8.8.8'})})).status).toBe(400);
  const fixtures=Array.from({length:65},(_,i)=>({...MOCK_IP_EVENTS[0],id:100000+i,seen_at:new Date(Date.now()-(i+1)*3600000).toISOString(),outcome:i===64?'compromised':'blocked'}));MOCK_IP_EVENTS.push(...fixtures);
  try{const data=await (await detail(new Request('http://localhost/api/ip/test?days=30'),{params:Promise.resolve({ip:fixtures[0].ip})})).json();expect(data.hasCriticalOutcome).toBe(true);expect(data.scoring.verdict).toBe('Malicious');}finally{for(const f of fixtures)MOCK_IP_EVENTS.splice(MOCK_IP_EVENTS.indexOf(f),1);}
 });
});
