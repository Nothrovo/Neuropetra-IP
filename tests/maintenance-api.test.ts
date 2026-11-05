import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),recent:vi.fn(),status:vi.fn(),preview:vi.fn(),execute:vi.fn(),list:vi.fn()}));
vi.mock('../lib/auth',()=>({AuthError:class extends Error{constructor(public status:number,message:string){super(message);}},requireSession:mocks.session,requireRecentAuth:mocks.recent}));
vi.mock('../lib/config',()=>({getAppOrigin:()=> 'https://synthetic.invalid'}));
vi.mock('../lib/maintenance-repository',()=>({maintenanceRepository:()=>({status:mocks.status,preview:mocks.preview,execute:mocks.execute,list:mocks.list})}));
import {GET as status} from '../app/api/admin/database/status/route';
import {GET as records} from '../app/api/admin/database/records/route';
import {POST as preview} from '../app/api/admin/database/maintenance/preview/route';
import {POST as execute} from '../app/api/admin/database/maintenance/execute/route';
import {AuthError} from '../lib/auth';
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({userId:'test',role:'admin'});mocks.status.mockResolvedValue({connected:true});});
const post=(path:string,body:unknown,origin='https://synthetic.invalid')=>new Request('https://synthetic.invalid'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
it('returns 401 for unauthenticated and 403 for analyst before repository calls',async()=>{
 mocks.session.mockRejectedValue(new AuthError(401,'Unauthorized'));
 expect((await status(new Request('https://synthetic.invalid/api/admin/database/status'),undefined)).status).toBe(401);
 mocks.session.mockResolvedValue({userId:'test',role:'analyst'});
 expect((await status(new Request('https://synthetic.invalid/api/admin/database/status'),undefined)).status).toBe(403);
 expect(mocks.status).not.toHaveBeenCalled();
});
it('checks origin and recent auth before execution and rejects arbitrary payload',async()=>{
 const body={planId:'67d69ce2-b957-4a3c-834b-313b168b67fb',confirmation:'DELETE 1',idempotencyKey:'c8a991da-9378-4c18-9da1-beac76503d31'};
 expect((await execute(post('/execute',body,'https://attacker.invalid'),undefined)).status).toBe(403);
 mocks.recent.mockImplementation(()=>{throw new AuthError(403,'Reauthentication required');});
 expect((await execute(post('/execute',body),undefined)).status).toBe(403);
 expect(mocks.execute).not.toHaveBeenCalled();
 mocks.recent.mockImplementation(()=>{});
 expect((await preview(post('/preview',{operation:'delete',ips:['192.0.2.1'],table:'events'}),undefined)).status).toBe(400);
 expect((await records(new Request('https://synthetic.invalid/records?sort=raw_summary'),undefined)).status).toBe(400);
 expect(mocks.preview).not.toHaveBeenCalled();
});
it('returns typed conflict and safe unavailable response without database errors',async()=>{
 const {MaintenanceError}=await import('../lib/database-management');
 mocks.preview.mockRejectedValue(new MaintenanceError(409,'TARGETS_CHANGED'));
 const response=await preview(post('/preview',{operation:'delete',ips:['192.0.2.1']}),undefined);
 expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'TARGETS_CHANGED'});
 mocks.status.mockRejectedValue(new Error('postgres://synthetic-password@private-host'));
 const failed=await status(new Request('https://synthetic.invalid/status'),undefined);
 expect(failed.status).toBe(503);expect(JSON.stringify(await failed.json())).not.toMatch(/postgres|password|private-host/);
});
