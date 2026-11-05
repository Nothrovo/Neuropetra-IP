import { describe, it, expect } from 'vitest';
import { MaintenanceRepository } from '../lib/maintenance-repository';
import type { MaintenancePlan } from '../lib/database-management';
import type { Pool } from 'pg';

const target={ip:'192.0.2.1',revision:'1'};
const actor={userId:'admin-test',role:'admin'};
const plan:MaintenancePlan={id:'c554dc93-4883-45fe-a5be-9a3bbd06e179',actorId:actor.userId,operation:'delete',resource:'ip_intel_reputation',targets:[target],fingerprint:'',matchedCount:1,dependencyCount:0,expiresAt:'2099-01-01T00:00:00Z',state:'previewed',recoveryRequired:false,recoveryAvailable:false,confirmation:'DELETE 1',olderThan:null,retention:false};

describe('immutable maintenance plans',()=>{
  it('binds actor, expiry, versions, confirmation, single use and recovery',()=>{
    const current={...plan,fingerprint:fingerprint([target])};
    expect(()=>assertExecutablePlan(current,actor,'DELETE 1',[target])).not.toThrow();
    for(const patch of [{actorId:'other'},{expiresAt:'2000-01-01T00:00:00Z'},{state:'completed' as const},{recoveryRequired:true}]) expect(()=>assertExecutablePlan({...current,...patch},actor,'DELETE 1',[target])).toThrow(MaintenanceError);
    expect(()=>assertExecutablePlan(current,actor,'DELETE 1',[{...target,revision:'2'}])).toThrow('TARGETS_CHANGED');
    expect(()=>assertExecutablePlan(current,actor,'DELETE 2',[target])).toThrow('CONFIRMATION_REQUIRED');
    expect(()=>assertExecutablePlan(current,{...actor,role:'analyst'},'DELETE 1',[target])).toThrow('FORBIDDEN');
  });
});

describe('repository preview',()=>{
  it('snapshots only safe owned columns and writes only plan/audit, with no data mutation',async()=>{
    const calls:{sql:string;values:unknown[]}[]=[];
    const query=async(sql:string,values:unknown[]=[])=>{
      calls.push({sql,values});
      if(sql.includes('pg_constraint')) return {rows:[{compatible:true}],rowCount:1};
      if(sql.includes('FROM public.ip_intel_reputation')) return {rows:[target],rowCount:1};
      return {rows:[],rowCount:1};
    };
    const client={query,release:()=>{}};
    const pool={query,connect:async()=>client} as unknown as Pool;
    const repo=new MaintenanceRepository(pool,()=>pool,{ownershipVerified:true,recoveryCheckpoint:null});
    const preview=await repo.preview(actor,{operation:'delete',ips:['192.0.2.1'],retention:false});
    expect(preview.matchedCount).toBe(1);
    expect(preview.fingerprint).toBe(fingerprint([target]));
    expect(preview.confirmation).toBe('DELETE 1');
    expect(calls.some(c=>/^\s*(DELETE|UPDATE)\s/i.test(c.sql))).toBe(false);
    expect(calls.some(c=>c.sql.includes('INSERT INTO public.ip_intel_maintenance_plans'))).toBe(true);
    expect(calls.map(c=>c.sql).join(' ')).not.toMatch(/raw_summary|reputation_json|geo_json|DELETE FROM.*events/);
  });
});
import { maintenanceRequestSchema, ownedQuerySchema, fingerprint, assertExecutablePlan, MaintenanceError } from '../lib/database-management';

describe('repository execution',()=>{
  it('executes exact targets atomically, writes protected audit, and replays idempotently',async()=>{
    const calls:{sql:string;values:unknown[]}[]=[];
    let storedJob:Record<string,unknown>|null=null;
    let storedPlan={...plan,fingerprint:fingerprint([target])};
    const query=async(sql:string,values:unknown[]=[])=>{
      calls.push({sql,values});
      if(sql.includes('FROM public.ip_intel_maintenance_jobs')) return {rows:storedJob?[{job_json:storedJob}]:[],rowCount:storedJob?1:0};
      if(sql.includes('FROM public.ip_intel_maintenance_plans')) return {rows:[{plan_json:storedPlan,state:storedPlan.state}],rowCount:1};
      if(sql.includes('pg_constraint')) return {rows:[{compatible:true}],rowCount:1};
      if(sql.includes('SELECT ip,revision')) return {rows:[target],rowCount:1};
      if(sql.startsWith('DELETE FROM public.ip_intel_reputation')) return {rows:[],rowCount:1};
      if(sql.startsWith('INSERT INTO public.ip_intel_maintenance_jobs')) storedJob=JSON.parse(String(values[4]));
      if(sql.startsWith('UPDATE public.ip_intel_maintenance_plans')) storedPlan={...storedPlan,state:'completed'};
      return {rows:[],rowCount:1};
    };
    const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
    const repo=new MaintenanceRepository(pool,()=>pool,{ownershipVerified:true,recoveryCheckpoint:null});
    const input={planId:plan.id,confirmation:'DELETE 1',idempotencyKey:'67694065-f403-4a4c-a344-d3f0efdf413b'};
    const job=await repo.execute(actor,input);
    expect(job.affectedCount).toBe(1);
    expect(job.status).toBe('completed');
    expect(await repo.execute(actor,input)).toEqual(job);
    expect(calls.filter(c=>c.sql.startsWith('DELETE FROM public.ip_intel_reputation'))).toHaveLength(1);
    expect(calls.some(c=>c.sql.startsWith('INSERT INTO public.ip_intel_maintenance_audit'))).toBe(true);
    expect(calls.map(c=>c.sql).join(' ')).not.toMatch(/DELETE FROM public\.ip_intel_(events|cache|users)/);
  });
  it('rolls back a changed snapshot and never mutates data',async()=>{
    const calls:string[]=[];
    const query=async(sql:string)=>{
      calls.push(sql);
      if(sql.includes('FROM public.ip_intel_maintenance_plans'))return {rows:[{plan_json:{...plan,fingerprint:fingerprint([target])},state:'previewed'}]};
      if(sql.includes('pg_constraint'))return {rows:[{compatible:true}]};
      if(sql.includes('SELECT ip,revision'))return {rows:[{...target,revision:'2'}]};
      return {rows:[],rowCount:0};
    };
    const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
    await expect(new MaintenanceRepository(pool,()=>pool,{ownershipVerified:true,recoveryCheckpoint:null}).execute(actor,{planId:plan.id,confirmation:'DELETE 1',idempotencyKey:'67694065-f403-4a4c-a344-d3f0efdf413b'})).rejects.toThrow('TARGETS_CHANGED');
    expect(calls).toContain('ROLLBACK');
    expect(calls.some(sql=>sql.startsWith('INSERT INTO public.ip_intel_maintenance_audit'))).toBe(true);
    expect(calls.some(sql=>sql.startsWith('DELETE FROM'))).toBe(false);
  });
});

describe('safe browse and status',()=>{
 it('exposes only allowlisted columns, bounded pagination and safe identities',async()=>{
  const calls:string[]=[];
  const query=async(sql:string)=>{
   calls.push(sql);
   if(sql.includes('pg_constraint'))return {rows:[{compatible:true}]};
   if(sql.includes('COUNT(*)'))return {rows:[{count:'3',bytes:'500',freshness:null}]};
   if(sql.includes('SELECT ip,abuse_score'))return {rows:[{...target,abuse_score:0,country_code:'ZZ',isp:'Synthetic',reputation_checked_at:null},{ip:'192.0.2.2',revision:'2'}]};
   return {rows:[]};
  };
  const pool={query} as unknown as Pool;
  const repo=new MaintenanceRepository(pool,()=>{throw new Error('password=synthetic-secret');},{ownershipVerified:true,recoveryCheckpoint:null});
  const page=await repo.list({limit:1});
  expect(page.items).toHaveLength(1);expect(page.nextCursor).toBe(target.ip);
  const status=await repo.status();
  expect(status.capabilities.maintenance).toBe(false);
  const unverified=await new MaintenanceRepository(pool,()=>pool,{ownershipVerified:false,recoveryCheckpoint:null}).status();
  expect(unverified.resources[0].ownership).toBe('unverified-read-only');
  expect(unverified.capabilities.maintenance).toBe(false);
  expect(JSON.stringify(status)).not.toMatch(/password|synthetic-secret|postgres:\/\//);
  expect(calls.join(' ')).not.toMatch(/raw_summary|reputation_json|geo_json|SELECT \*/);
 });
});

describe('capability checks',()=>{
 it('does not advertise writes for a configured but read-only role',async()=>{
  const query=async(sql:string)=>{
   if(sql.includes('pg_constraint'))return {rows:[{compatible:true}]};
   if(sql.includes('COUNT(*)'))return {rows:[{count:'0',bytes:'0',freshness:null}]};
   if(sql.includes('has_table_privilege'))return {rows:[{allowed:false}]};
   return {rows:[]};
  };
  const pool={query} as unknown as Pool;
  expect((await new MaintenanceRepository(pool,()=>pool,{ownershipVerified:true,recoveryCheckpoint:null}).status()).capabilities.maintenance).toBe(false);
 });
});

describe('maintenance boundary', () => {
  it('requires a bounded explicit owned selection and rejects arbitrary resource, SQL and invalid dates', () => {
    expect(maintenanceRequestSchema.safeParse({operation:'delete'}).success).toBe(false);
    expect(maintenanceRequestSchema.safeParse({operation:'delete',ips:['192.0.2.1'],table:'events'}).success).toBe(false);
    expect(maintenanceRequestSchema.safeParse({operation:'drop',ips:['192.0.2.1']}).success).toBe(false);
    expect(maintenanceRequestSchema.safeParse({operation:'delete',ips:['x; DELETE FROM events']}).success).toBe(false);
    expect(maintenanceRequestSchema.safeParse({operation:'invalidate',olderThan:'yesterday'}).success).toBe(false);
    expect(maintenanceRequestSchema.safeParse({operation:'invalidate',ips:Array(201).fill('192.0.2.1')}).success).toBe(false);
    expect(ownedQuerySchema.safeParse({limit:'201'}).success).toBe(false);
    expect(ownedQuerySchema.safeParse({sort:'DROP TABLE users'}).success).toBe(false);
    expect(maintenanceRequestSchema.parse({operation:'invalidate',ips:['192.0.2.1']})).toEqual({operation:'invalidate',ips:['192.0.2.1'],retention:false});
  });
});
