#!/usr/bin/env node
// Run: node --import tsx scripts/maintenance-worker.mjs --max-jobs 10
// Reads only operator-configured scoped connections. No SQL, tables or paths from CLI.
import {pathToFileURL} from 'node:url';
/** @param {{runOne:()=>Promise<{id:string,status:string,matchedCount:number,affectedCount:number}|null>}} repository @param {number} maxJobs */
export async function runWorker(repository,maxJobs=10){
 if(!Number.isInteger(maxJobs)||maxJobs<1||maxJobs>200)throw new Error('Invalid worker bound');
 const results=[];
 for(let index=0;index<maxJobs;index++){
  const job=await repository.runOne();if(!job)break;
  results.push({id:job.id,status:job.status,matchedCount:job.matchedCount,affectedCount:job.affectedCount});
 }
 return results;
}
async function main(){
 const args=process.argv.slice(2);
 if(args.includes('--help')){console.log('node --import tsx scripts/maintenance-worker.mjs [--max-jobs 1..200]\nProcesses only explicitly approved one-run reputation-retention jobs. No recurring cleanup.');return;}
 if(args.length && (args.length!==2||args[0]!=='--max-jobs'))throw new Error('Invalid worker arguments');
 const maxJobs=args.length?Number(args[1]):10;
 const {maintenanceRepository}=await import('../lib/maintenance-repository.ts');
 const {closePools}=await import('../lib/db-pool.ts');
 try{const results=await runWorker(maintenanceRepository(),maxJobs);console.log(JSON.stringify({processed:results.length,jobs:results}));}
 finally{await closePools();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(()=>{console.error('Maintenance worker unavailable; check scoped configuration, schema and privileges. No raw error details are printed.');process.exitCode=1;});
}
