import {it,expect} from 'vitest';
import {runWorker} from '../scripts/maintenance-worker.mjs';
it('runs a bounded number of real queued jobs and stops when empty',async()=>{
 let calls=0;
 const result=await runWorker({runOne:async()=>{calls++;return calls===1?{id:'synthetic-job',status:'completed',matchedCount:1,affectedCount:1}:null;}},3);
 expect(calls).toBe(2);expect(result).toEqual([{id:'synthetic-job',status:'completed',matchedCount:1,affectedCount:1}]);
 await expect(runWorker({runOne:async()=>null},201)).rejects.toThrow('Invalid worker bound');
});
