import {describe,it,expect,vi} from 'vitest';
vi.mock('../lib/authorization',()=>({withApiPermission:(handler:(...args:unknown[])=>Promise<Response>)=>(request:Request,context:unknown)=>handler(request,context,{userId:'synthetic-export-admin',role:'admin'})}));
vi.mock('../lib/feed-auth',()=>({requireFeedToken:async()=>({id:'synthetic-feed'})}));
import {GET as roster} from '../app/api/providers/[name]/route';
import {GET as exportProvider} from '../app/api/providers/[name]/export/route';
import {GET as blocklist} from '../app/api/blocklist/route';
import {GET as dashboard} from '../app/api/dashboard/route';
import {MOCK_IP_CACHE} from '../lib/mock-data';
const context={params:Promise.resolve({name:'Synthetic Export'})};
describe('bounded roster and feed HTTP contracts',()=>{
 it('rejects invalid formats and numeric filters explicitly',async()=>{
  expect((await blocklist(new Request('http://localhost/api/blocklist?format=bad'),undefined)).status).toBe(400);
  expect((await blocklist(new Request('http://localhost/api/blocklist?min_score=NaN'),undefined)).status).toBe(400);
  expect((await exportProvider(new Request('http://localhost/api/providers/x/export?format=wat'),context)).status).toBe(400);
  expect((await roster(new Request('http://localhost/api/providers/x?offset=-1'),context)).status).toBe(400);
  expect((await dashboard(new Request('http://localhost/api/dashboard?days=1x'),undefined)).status).toBe(400);
 });
 it('returns explicit pagination totals and refuses incomplete exports at the bound',async()=>{
  const fixtures=Array.from({length:105},(_,i)=>({...MOCK_IP_CACHE[0],ip:`198.51.100.${i+1}`,isp:'Synthetic Export'}));MOCK_IP_CACHE.push(...fixtures);
  try{
   const first=await (await roster(new Request('http://localhost/api/providers/x?limit=100'),context)).json();expect(first.ips).toHaveLength(100);expect(first.total).toBe(105);expect(first.hasMore).toBe(true);
   const last=await (await roster(new Request('http://localhost/api/providers/x?limit=100&offset=100'),context)).json();expect(last.ips).toHaveLength(5);expect(last.hasMore).toBe(false);
   expect((await exportProvider(new Request('http://localhost/api/providers/x/export?max_rows=100'),context)).status).toBe(413);
   const csv=await exportProvider(new Request('http://localhost/api/providers/x/export?format=csv'),context);expect(csv.status).toBe(200);expect((await csv.text()).split('\r\n')).toHaveLength(106);
  }finally{for(const r of fixtures)MOCK_IP_CACHE.splice(MOCK_IP_CACHE.indexOf(r),1);}
 });
});
