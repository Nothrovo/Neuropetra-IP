import {it,expect} from 'vitest';
import {MaintenanceRepository} from '../lib/maintenance-repository';
import {fingerprint,type MaintenancePlan} from '../lib/database-management';
import type {Pool} from 'pg';

const actor={userId:'admin-test',role:'admin'};
const target={ip:'192.0.2.1',revision:'1'};
const plan:MaintenancePlan={id:'78582775-98cb-42d4-b4ae-7176d4808d86',actorId:actor.userId,operation:'invalidate',resource:'ip_intel_reputation',targets:[target],fingerprint:fingerprint([target]),matchedCount:1,dependencyCount:0,expiresAt:'2099-01-01T00:00:00Z',state:'previewed',recoveryRequired:false,recoveryAvailable:false,confirmation:'INVALIDATE 1',olderThan:'2020-01-01T00:00:00Z',retention:true};

it('queues one-run approved retention, processes only snapshotted targets and disables policy',async()=>{
 const calls:string[]=[];let job:Record<string,unknown>|undefined;let state='previewed';
 const query=async(sql:string,values:unknown[]=[])=>{
  calls.push(sql);
  if(sql.includes('FROM public.ip_intel_maintenance_jobs'))return {rows:job?[{job_json:job,actor_id:actor.userId,idempotency_key:'818da2d0-9683-43fd-b5c5-246dc4ab33d3'}]:[]};
  if(sql.includes('FROM public.ip_intel_maintenance_plans'))return {rows:[{plan_json:plan,state}]};
  if(sql.includes('pg_constraint'))return {rows:[{compatible:true}]};
  if(sql.includes('SELECT ip,revision'))return {rows:[target]};
  if(sql.startsWith('INSERT INTO public.ip_intel_maintenance_jobs'))job=JSON.parse(String(values[4]));
  if(sql.startsWith('UPDATE public.ip_intel_maintenance_jobs'))job=JSON.parse(String(values[2]));
  if(sql.startsWith('UPDATE public.ip_intel_maintenance_plans'))state=String(values[1]);
  return {rows:[],rowCount:1};
 };
 const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
 const repo=new MaintenanceRepository(pool,()=>pool,{ownershipVerified:true,recoveryCheckpoint:null},async()=>true);
 const result=await repo.execute(actor,{planId:plan.id,confirmation:plan.confirmation,idempotencyKey:'818da2d0-9683-43fd-b5c5-246dc4ab33d3'});
 expect(result.status).toBe('queued');expect(result.affectedCount).toBe(0);
 expect(calls.some(sql=>sql.startsWith('UPDATE public.ip_intel_reputation'))).toBe(false);
 expect(calls.some(sql=>sql.startsWith('INSERT INTO public.ip_intel_retention_policies'))).toBe(true);
 const worked=await repo.runOne();expect(worked?.status).toBe('completed');expect(worked?.affectedCount).toBe(1);
 expect(calls.some(sql=>sql.includes('SET enabled=false'))).toBe(true);
});
it('rejects revoked administrators before queued mutation and audits the failure',async()=>{
 const calls:string[]=[];
 const job={id:'job',planId:plan.id,status:'queued',matchedCount:1,affectedCount:0};
 const query=async(sql:string)=>{calls.push(sql);
  if(sql.includes('FROM public.ip_intel_maintenance_jobs'))return {rows:[{job_json:job,actor_id:actor.userId,idempotency_key:'818da2d0-9683-43fd-b5c5-246dc4ab33d3'}]};
  if(sql.includes('FROM public.ip_intel_maintenance_plans'))return {rows:[{plan_json:plan,state:'queued'}]};
  if(sql.includes('pg_constraint'))return {rows:[{compatible:true}]};
  if(sql.includes('SELECT ip,revision'))return {rows:[target]};
  return {rows:[],rowCount:1};
 };
 const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
 const result=await new MaintenanceRepository(pool,()=>pool,{ownershipVerified:true,recoveryCheckpoint:null},async()=>false).runOne();
 expect(result?.status).toBe('failed');expect(result?.errorCode).toBe('ACTOR_PERMISSION_REVOKED');
 expect(calls.some(sql=>sql.startsWith('UPDATE public.ip_intel_reputation'))).toBe(false);
 expect(calls.some(sql=>sql.startsWith('INSERT INTO public.ip_intel_maintenance_audit'))).toBe(true);
});
it('cancels queued jobs with zero committed changes and durable audit',async()=>{
 const calls:string[]=[];
 const query=async(sql:string)=>{
  calls.push(sql);
  if(sql.includes('FROM public.ip_intel_maintenance_jobs'))return {rows:[{job_json:{id:'job',planId:plan.id,status:'queued',affectedCount:0}}]};
  if(sql.includes('FROM public.ip_intel_maintenance_plans'))return {rows:[{plan_json:plan,state:'queued'}]};
  return {rows:[],rowCount:1};
 };
 const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
 expect((await new MaintenanceRepository(pool,()=>pool,{ownershipVerified:true,recoveryCheckpoint:null}).cancel(actor,'job')).status).toBe('cancelled');
 expect(calls.some(sql=>sql.startsWith('INSERT INTO public.ip_intel_maintenance_audit'))).toBe(true);
 expect(calls.some(sql=>sql.startsWith('DELETE FROM'))).toBe(false);
});
