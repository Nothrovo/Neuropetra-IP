import { randomUUID } from 'node:crypto';
import { getReadPool, getMaintenancePool } from './db-pool';
import { ownedQuerySchema, type OwnedQuery, type OwnedRecord, type DatabaseStatus, type MaintenanceJob } from './database-management';

export function maintenanceConfig():MaintenanceConfig {
  // Set only by a host operator after an isolated recovery drill, never a browser boolean.
  const checkpoint=process.env.MAINTENANCE_RECOVERY_CHECKPOINT_ID;
  const verifiedAt=process.env.MAINTENANCE_RECOVERY_VERIFIED_AT;
  const verified=Boolean(checkpoint && /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(checkpoint) && verifiedAt && Number.isFinite(Date.parse(verifiedAt)) && Date.parse(verifiedAt)<=Date.now());
  return {ownershipVerified:process.env.MAINTENANCE_OWNERSHIP==='ip-intel-owned-v1',recoveryCheckpoint:verified?checkpoint!:null};
}
import type { Pool, PoolClient } from 'pg';
import { assertExecutablePlan, fingerprint, MAX_TARGETS, MaintenanceError, maintenanceRequestSchema, requireDatabaseAdmin, type MaintenanceActor, type MaintenanceRequest, type MaintenancePlan, type TargetVersion } from './database-management';

export interface MaintenanceConfig { ownershipVerified:boolean; recoveryCheckpoint:string|null }
export class MaintenanceRepository {
  constructor(private readonly reader:Pool, private readonly writer:()=>Pool, private readonly config:MaintenanceConfig, private readonly actorStillAdmin:(userId:string)=>Promise<boolean>=async()=>false) {} 
  // Workers must recheck the durable account immediately before taking their plan lock;
  // runtime maintenance credentials deliberately have no account-table privileges.
  private async scope(client:Pool|PoolClient):Promise<void> {
    if (!this.config.ownershipVerified) throw new MaintenanceError(503,'OWNERSHIP_NOT_VERIFIED');
    // Any inbound FK is unsafe: deletion must never cascade into another resource.
    const result=await client.query<{compatible:boolean}>(`SELECT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.ip_intel_reputation'::regclass) AS compatible`);
    if (!result.rows[0]?.compatible) throw new MaintenanceError(503,'UNSAFE_REPUTATION_DEPENDENCIES');
  }
  async list(input:OwnedQuery):Promise<{items:OwnedRecord[];nextCursor:string|null}> {
    const query=ownedQuerySchema.parse(input);
    const result=await this.reader.query<OwnedRecord>(`SELECT ip,abuse_score,country_code,isp,reputation_checked_at,revision::text AS revision FROM public.ip_intel_reputation WHERE ($1::text IS NULL OR ip>$1) AND ($2::text IS NULL OR ip=$2) AND ($3::timestamptz IS NULL OR reputation_checked_at<$3) ORDER BY ip LIMIT $4`,[query.cursor??null,query.ip??null,query.olderThan??null,query.limit+1]);
    const items=result.rows.slice(0,query.limit);
    return {items,nextCursor:result.rows.length>query.limit?items.at(-1)!.ip:null};
  }
  async status():Promise<DatabaseStatus> {
    await this.reader.query('SELECT 1');
    const version=await this.reader.query<{version:string}>('SELECT version FROM public.ip_intel_schema_migrations ORDER BY version DESC LIMIT 1');
    const resources:DatabaseStatus['resources']=[];
    // Fixed SQL only: never interpolate a client-supplied identifier.
    for (const [name,sql,ownership] of [
      ['ip_intel_reputation',`SELECT COUNT(*)::text AS count,pg_total_relation_size('public.ip_intel_reputation')::text AS bytes,max(reputation_checked_at)::text AS freshness FROM public.ip_intel_reputation`,'owned'],
      ['ip_intel_cache',`SELECT COUNT(*)::text AS count,pg_total_relation_size('public.ip_intel_cache')::text AS bytes,max(last_seen)::text AS freshness FROM public.ip_intel_cache`,'shared-read-only'],
      ['ip_intel_events',`SELECT COUNT(*)::text AS count,pg_total_relation_size('public.ip_intel_events')::text AS bytes,max(seen_at)::text AS freshness FROM public.ip_intel_events`,'shared-read-only'],
    ] as const) {
      const result=await this.reader.query<{count:string;bytes:string;freshness:string|null}>(sql);
      const row=result.rows[0];
      resources.push({name,ownership,count:Number(row.count),bytes:Number(row.bytes),freshness:row.freshness});
    }
    let maintenance=false;let reason:string|null=null;
    let verified=false;
    try {await this.scope(this.reader);verified=true;}catch{}
    if(!verified)resources[0].ownership='unverified-read-only';
    try {
      const writer=this.writer();await this.scope(writer);
      const privileges=await writer.query<{allowed:boolean}>(`SELECT has_table_privilege(current_user,'public.ip_intel_reputation','DELETE') AND has_column_privilege(current_user,'public.ip_intel_reputation','reputation_checked_at','UPDATE') AND has_table_privilege(current_user,'public.ip_intel_maintenance_plans','INSERT') AND has_table_privilege(current_user,'public.ip_intel_maintenance_jobs','INSERT') AND has_table_privilege(current_user,'public.ip_intel_maintenance_audit','INSERT') AS allowed`);
      if(!privileges.rows[0]?.allowed)throw new MaintenanceError(503,'MAINTENANCE_PRIVILEGES_UNAVAILABLE');
      maintenance=true;
    } catch { reason='Maintenance role or verified ownership is unavailable. Ask the host operator to configure and revalidate it.'; }
    const jobs=await this.reader.query<{job_json:MaintenanceJob}>('SELECT job_json FROM public.ip_intel_maintenance_jobs ORDER BY created_at DESC LIMIT 30');
    const policies=await this.reader.query<DatabaseStatus['policies'][number]>(`SELECT id,enabled,cutoff::text,'UTC' AS timezone,'ip_intel_reputation' AS scope,CASE WHEN enabled THEN created_at::text ELSE NULL END AS "nextRunAt",job_id AS "jobId",created_at::text AS "createdAt" FROM public.ip_intel_retention_policies ORDER BY created_at DESC LIMIT 30`);
    const audit=await this.reader.query<DatabaseStatus['audit'][number]>(`SELECT id,actor_id AS "actorId",action,scope_fingerprint AS fingerprint,matched_count AS "matchedCount",affected_count AS "affectedCount",outcome,created_at::text AS "createdAt" FROM public.ip_intel_maintenance_audit ORDER BY created_at DESC LIMIT 30`);
    return {connected:true,identity:{deployment:'configured',databaseAlias:'Neuropetra IP',schemaAlias:'public'},schemaVersion:version.rows[0]?.version??'unknown',resources,capabilities:{browse:true,maintenance,reason,bulkDelete:maintenance&&Boolean(this.config.recoveryCheckpoint)},recovery:{available:Boolean(this.config.recoveryCheckpoint),instructions:'Host operator: restore the verified owned-reputation checkpoint using the installation recovery runbook. No browser restore or arbitrary filesystem path is accepted.'},jobs:jobs.rows.map(r=>r.job_json),policies:policies.rows,audit:audit.rows};
  }
  async preview(actor:MaintenanceActor, input:MaintenanceRequest):Promise<MaintenancePlan> {
    requireDatabaseAdmin(actor);
    const request=maintenanceRequestSchema.parse(input);
    const pool=this.writer();
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      await this.scope(client);
      const result=await client.query<TargetVersion>(`SELECT ip,revision::text AS revision FROM public.ip_intel_reputation WHERE ($1::text[] IS NULL OR ip=ANY($1::text[])) AND ($2::timestamptz IS NULL OR reputation_checked_at < $2::timestamptz) ORDER BY ip LIMIT 201`,[request.ips??null,request.olderThan??null]);
      if(result.rows.length>MAX_TARGETS) throw new MaintenanceError(400,'TOO_MANY_TARGETS_NARROW_SELECTION');
      const targets=result.rows;
      const id=randomUUID();
      const plan:MaintenancePlan={id,actorId:actor.userId,operation:request.operation,resource:'ip_intel_reputation',targets,fingerprint:fingerprint(targets),matchedCount:targets.length,dependencyCount:0,expiresAt:new Date(Date.now()+10*60_000).toISOString(),state:'previewed',recoveryRequired:request.operation==='delete'&&targets.length>1,recoveryAvailable:Boolean(this.config.recoveryCheckpoint),confirmation:`${request.operation.toUpperCase()} ${targets.length}`,olderThan:request.olderThan??null,retention:request.retention};
      await client.query(`INSERT INTO public.ip_intel_maintenance_plans (id,actor_id,plan_json,expires_at,state) VALUES ($1,$2,$3::jsonb,$4,'previewed')`,[id,actor.userId,JSON.stringify(plan),plan.expiresAt]);
      await client.query('COMMIT');
      return plan;
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async execute(actor:MaintenanceActor,input:{planId:string;confirmation:string;idempotencyKey:string}, worker=false):Promise<import('./database-management').MaintenanceJob> {
    requireDatabaseAdmin(actor);
    const client=await this.writer().connect();
    let attemptedPlan:MaintenancePlan|undefined;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '10000ms'");
      await client.query("SET LOCAL lock_timeout = '3000ms'");
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor.userId+input.idempotencyKey]);
      const existing=await client.query<{job_json:import('./database-management').MaintenanceJob}>(`SELECT job_json FROM public.ip_intel_maintenance_jobs WHERE actor_id=$1 AND idempotency_key=$2`,[actor.userId,input.idempotencyKey]);
      if(existing.rows[0] && !worker) {
        if(existing.rows[0].job_json.planId!==input.planId) throw new MaintenanceError(409,'IDEMPOTENCY_KEY_REUSED');
        await client.query('COMMIT'); return existing.rows[0].job_json;
      }
      const result=await client.query<{plan_json:MaintenancePlan;state:MaintenancePlan['state']}>(`SELECT plan_json,state FROM public.ip_intel_maintenance_plans WHERE id=$1 FOR UPDATE`,[input.planId]);
      if(!result.rows[0]) throw new MaintenanceError(404,'PLAN_NOT_FOUND');
      const plan={...result.rows[0].plan_json,state:result.rows[0].state};
      attemptedPlan=plan;
      if(plan.state==='queued'&&!worker) throw new MaintenanceError(409,'PLAN_ALREADY_USED');
      if(worker && !(await this.actorStillAdmin(actor.userId))) throw new MaintenanceError(409,'ACTOR_PERMISSION_REVOKED');
      if(worker && plan.state!=='queued') throw new MaintenanceError(409,'PLAN_ALREADY_USED');
      if(plan.targets.length>MAX_TARGETS) throw new MaintenanceError(409,'TOO_MANY_TARGETS');
      await this.scope(client);
      const current=await client.query<TargetVersion>(`SELECT ip,revision::text AS revision FROM public.ip_intel_reputation WHERE ip=ANY($1::text[]) ORDER BY ip FOR UPDATE`,[plan.targets.map(t=>t.ip)]);
      // Verify recovery on each execution, never trust the preview's old capability.
      plan.recoveryAvailable=Boolean(this.config.recoveryCheckpoint);
      assertExecutablePlan(plan,actor,input.confirmation,current.rows);
      const now=new Date().toISOString();
      const queued=plan.retention&&!worker;
      const job:import('./database-management').MaintenanceJob={id:existing.rows[0]?.job_json.id??randomUUID(),planId:plan.id,status:queued?'queued':'completed',matchedCount:plan.matchedCount,affectedCount:0,createdAt:existing.rows[0]?.job_json.createdAt??now,finishedAt:queued?null:now,errorCode:null};
      if(!queued && plan.targets.length) {
        const mutation=plan.operation==='delete'
          ? await client.query('DELETE FROM public.ip_intel_reputation WHERE ip=ANY($1::text[])',[plan.targets.map(t=>t.ip)])
          : await client.query('UPDATE public.ip_intel_reputation SET reputation_checked_at=NULL WHERE ip=ANY($1::text[])',[plan.targets.map(t=>t.ip)]);
        if(mutation.rowCount!==plan.targets.length) throw new MaintenanceError(409,'TARGETS_CHANGED');
        job.affectedCount=mutation.rowCount;
      }
      if(worker) {
        await client.query(`UPDATE public.ip_intel_maintenance_jobs SET status=$2,job_json=$3::jsonb WHERE id=$1`,[job.id,job.status,JSON.stringify(job)]);
        await client.query(`UPDATE public.ip_intel_retention_policies SET enabled=false WHERE job_id=$1`,[job.id]);
      } else {
        await client.query(`INSERT INTO public.ip_intel_maintenance_jobs (id,plan_id,actor_id,idempotency_key,job_json,status) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,[job.id,plan.id,actor.userId,input.idempotencyKey,JSON.stringify(job),job.status]);
      }
      await client.query(`UPDATE public.ip_intel_maintenance_plans SET state=$2 WHERE id=$1`,[plan.id,job.status]);
      if(queued) await client.query(`INSERT INTO public.ip_intel_retention_policies (id,actor_id,cutoff,enabled,job_id) VALUES ($1,$2,$3,true,$4)`,[randomUUID(),actor.userId,plan.olderThan,job.id]);
      await this.audit(client,actor,plan,job.status,job.affectedCount);
      await client.query('COMMIT');
      return job;
    } catch(error) {
      await client.query('ROLLBACK');
      if(attemptedPlan&&!worker) await this.audit(client,actor,attemptedPlan,error instanceof MaintenanceError?error.code:'MAINTENANCE_FAILED',0);
      throw error;
    }
    finally { client.release(); }
  }
  async cancel(actor:MaintenanceActor,jobId:string):Promise<MaintenanceJob> {
    requireDatabaseAdmin(actor);
    const client=await this.writer().connect();
    try {
      await client.query('BEGIN');
      const lookup=await client.query<{job_json:MaintenanceJob}>('SELECT job_json FROM public.ip_intel_maintenance_jobs WHERE id=$1',[jobId]);
      if(!lookup.rows[0]) throw new MaintenanceError(404,'JOB_NOT_FOUND');
      // Same plan lock ordering as execution prevents cancel/worker deadlocks.
      const result=await client.query<{plan_json:MaintenancePlan;state:string}>('SELECT plan_json,state FROM public.ip_intel_maintenance_plans WHERE id=$1 FOR UPDATE',[lookup.rows[0].job_json.planId]);
      if(result.rows[0]?.state!=='queued') throw new MaintenanceError(409,'JOB_NOT_QUEUED');
      const job={...lookup.rows[0].job_json,status:'cancelled' as const,finishedAt:new Date().toISOString()};
      await client.query('UPDATE public.ip_intel_maintenance_jobs SET status=$2,job_json=$3::jsonb WHERE id=$1',[jobId,job.status,JSON.stringify(job)]);
      await client.query("UPDATE public.ip_intel_maintenance_plans SET state='cancelled' WHERE id=$1",[job.planId]);
      await client.query('UPDATE public.ip_intel_retention_policies SET enabled=false WHERE job_id=$1',[jobId]);
      await this.audit(client,actor,result.rows[0].plan_json,'cancelled',0);
      await client.query('COMMIT');return job;
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  }
  async runOne():Promise<MaintenanceJob|null> {
    const pool=this.writer();
    const result=await pool.query<{job_json:MaintenanceJob;actor_id:string;idempotency_key:string}>("SELECT job_json,actor_id,idempotency_key FROM public.ip_intel_maintenance_jobs WHERE status='queued' ORDER BY created_at LIMIT 1");
    const row=result.rows[0];if(!row)return null;
    const planResult=await pool.query<{plan_json:MaintenancePlan}>('SELECT plan_json FROM public.ip_intel_maintenance_plans WHERE id=$1',[row.job_json.planId]);
    const plan=planResult.rows[0]?.plan_json;if(!plan)throw new MaintenanceError(409,'PLAN_NOT_FOUND');
    try {
      return await this.execute({userId:row.actor_id,role:'admin'},{planId:plan.id,confirmation:plan.confirmation,idempotencyKey:row.idempotency_key},true);
    } catch(error) {
      if(error instanceof MaintenanceError && ['PLAN_ALREADY_USED'].includes(error.code)) return null;
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const state=await client.query<{state:string}>('SELECT state FROM public.ip_intel_maintenance_plans WHERE id=$1 FOR UPDATE',[plan.id]);
        if(state.rows[0]?.state!=='queued'){await client.query('ROLLBACK');return null;}
        const failed={...row.job_json,status:'failed' as const,affectedCount:0,finishedAt:new Date().toISOString(),errorCode:error instanceof MaintenanceError?error.code:'MAINTENANCE_FAILED'};
        await client.query('UPDATE public.ip_intel_maintenance_jobs SET status=$2,job_json=$3::jsonb WHERE id=$1',[failed.id,failed.status,JSON.stringify(failed)]);
        await client.query("UPDATE public.ip_intel_maintenance_plans SET state='failed' WHERE id=$1",[plan.id]);
        await client.query('UPDATE public.ip_intel_retention_policies SET enabled=false WHERE job_id=$1',[failed.id]);
        await this.audit(client,{userId:row.actor_id,role:'admin'},plan,failed.errorCode,0);
        await client.query('COMMIT');return failed;
      } catch(failure) {await client.query('ROLLBACK');throw failure;} finally {client.release();}
    }
  }
  private async audit(client:PoolClient,actor:MaintenanceActor,plan:MaintenancePlan,outcome:string,affected:number):Promise<void> {
    await client.query(`INSERT INTO public.ip_intel_maintenance_audit (id,actor_id,action,scope_fingerprint,matched_count,affected_count,outcome) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),actor.userId,plan.operation,plan.fingerprint,plan.matchedCount,affected,outcome]);
  }
}

export function maintenanceRepository():MaintenanceRepository {
  return new MaintenanceRepository(getReadPool(),getMaintenancePool,maintenanceConfig(),async userId=>{
    const user=await (await import('./user-repository')).findUserById(userId);
    return Boolean(user && !user.disabled && user.role==='admin');
  });

}
