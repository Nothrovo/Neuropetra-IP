import {describe,it,expect,vi,beforeEach} from 'vitest';
const {lookup,save,read}=vi.hoisted(()=>({lookup:vi.fn(),save:vi.fn(),read:vi.fn()}));
vi.mock('../lib/authorization',()=>({withApiPermission:(handler:(...args:unknown[])=>Promise<Response>)=>(request:Request,context:unknown)=>handler(request,context,{userId:'synthetic-provider-fixture',role:'admin'})}));
vi.mock('../lib/db',()=>({getIpIntel:read,upsertIpIntelReputation:save}));
vi.mock('../lib/provider-client',async original=>({...await original<typeof import('../lib/provider-client')>(),lookupReputation:lookup}));
import {POST} from '../app/api/enrich/route';
beforeEach(()=>{vi.clearAllMocks();read.mockResolvedValue(null);});
const req=()=>new Request('http://localhost/api/enrich',{method:'POST',body:JSON.stringify({ips:['1.1.1.1'],checkCacheFirst:false})});
describe('provider fixture -> persistence -> response',()=>{
 it('does not report persistence success when configured writer fails',async()=>{
  lookup.mockResolvedValue({ip:'1.1.1.1',abuseScore:12,countryCode:'US',isp:'Synthetic provider',checkedAt:'2026-01-01T00:00:00Z',metadata:{ipAddress:'1.1.1.1',abuseConfidenceScore:12,totalReports:0}});
  save.mockRejectedValue(new Error('synthetic write failure'));
  const data=await (await POST(req(),undefined)).json();expect(data.results[0]).toMatchObject({status:'enriched',savedToDb:false,scoreContext:'reputation-only'});expect(data.savedCount).toBe(0);expect(data.errorCount).toBe(1);
  const payload=save.mock.calls[0][0];expect(payload).not.toHaveProperty('lastSeen');expect(payload).not.toHaveProperty('first_seen');expect(payload).not.toHaveProperty('totalAlertCount');
 });
 it('persists validated zero score and reports success only after writer completes',async()=>{
  lookup.mockResolvedValue({ip:'1.1.1.1',abuseScore:0,countryCode:'US',isp:'Synthetic provider',checkedAt:'2026-01-01T00:00:00Z',metadata:{ipAddress:'1.1.1.1',abuseConfidenceScore:0}});save.mockResolvedValue(undefined);
  const data=await (await POST(req(),undefined)).json();expect(data.results[0]).toMatchObject({abuseScore:0,savedToDb:true,verdict:'Unknown'});expect(data.savedCount).toBe(1);expect(data.errorCount).toBe(0);
 });
 it('provider failure never persists manufactured default-zero data',async()=>{
  lookup.mockRejectedValue(new Error('synthetic malformed provider'));const data=await (await POST(req(),undefined)).json();expect(data.results[0]).toMatchObject({status:'error',abuseScore:null,savedToDb:false});expect(save).not.toHaveBeenCalled();
 });
});
