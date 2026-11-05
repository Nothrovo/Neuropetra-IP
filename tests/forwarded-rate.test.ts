import {describe,it,expect,vi} from 'vitest';
vi.mock('../lib/authorization',()=>({withApiPermission:(handler:(...args:unknown[])=>Promise<Response>)=>(request:Request,context:unknown)=>handler(request,context,{userId:'forwarded-rate-fixture',role:'admin'})}));
import {POST} from '../app/api/enrich/route';
describe('rate-limit identity is a verified actor, not forwarded input',()=>{
 it('cannot reset a bucket by forging x-forwarded-for',async()=>{
  let denied=0;
  for(let i=0;i<35;i++){
   const response=await POST(new Request('http://localhost/api/enrich',{method:'POST',headers:{'x-forwarded-for':`198.51.100.${i}`},body:JSON.stringify({ips:['10.0.0.1']})}),undefined);
   if(response.status===429)denied++;
  }
  expect(denied).toBeGreaterThan(0);
 });
});
