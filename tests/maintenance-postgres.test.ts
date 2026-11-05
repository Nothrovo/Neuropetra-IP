import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
import {MaintenanceRepository} from '../lib/maintenance-repository';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);

// Deliberately no environment DSN fallback. Writes require the exact synthetic data directory.
const suite=process.env.RUN_MAINTENANCE_SYNTHETIC_PG==='yes'?describe:describe.skip;
const pool=new Pool({host:'127.0.0.1',port:55439,database:'postgres',user:'nothrovo'});
const read=new Pool({host:'127.0.0.1',port:55439,database:'postgres',user:'ip_intel_read'});
const write=new Pool({host:'127.0.0.1',port:55439,database:'postgres',user:'ip_intel_maintenance'});
const reputation=new Pool({host:'127.0.0.1',port:55439,database:'postgres',user:'ip_intel_reputation'});
const actor={userId:'synthetic-admin',role:'admin'};
const repo=new MaintenanceRepository(read,()=>write,{ownershipVerified:true,recoveryCheckpoint:'synthetic-recovery'},async()=>true);
// SQL barriers observe actual blocked sessions, not timing guesses or mocked repositories.
async function waitForBlockedMaintenance(count:number):Promise<void> {
 const deadline=Date.now()+2000;
 while(Date.now()<deadline){
  const result=await pool.query<{count:number}>(`SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename='ip_intel_maintenance' AND wait_event_type='Lock'`);
  if(result.rows[0].count>=count)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw new Error(`Expected ${count} maintenance sessions blocked at SQL barrier`);
}
async function queued(ip:string,operation:'invalidate'|'delete'='invalidate') {
 await reputation.query(`INSERT INTO ip_intel_reputation(ip,reputation_checked_at) VALUES ($1,'2020-01-01') ON CONFLICT(ip) DO UPDATE SET reputation_checked_at=EXCLUDED.reputation_checked_at`,[ip]);
 const plan=await repo.preview(actor,{operation,ips:[ip],olderThan:'2021-01-01T00:00:00Z',retention:true});
 const job=await repo.execute(actor,{planId:plan.id,confirmation:plan.confirmation,idempotencyKey:randomUUID()});
 return {plan,job};
}
async function raceAtPlan<T,U>(planId:string,first:()=>Promise<T>,second:()=>Promise<U>) {
 const gate=await pool.connect();
 const pending:Promise<unknown>[]=[];
 try {
  await gate.query('BEGIN');
  await gate.query('SELECT id FROM ip_intel_maintenance_plans WHERE id=$1 FOR UPDATE',[planId]);
  // Capture rejections immediately so a losing transaction cannot be unhandled.
  const a=Promise.allSettled([first()]);pending.push(a);
  await waitForBlockedMaintenance(1);
  const b=Promise.allSettled([second()]);pending.push(b);
  await waitForBlockedMaintenance(2);
  await gate.query('COMMIT');
  return [(await a)[0],(await b)[0]] as const;
 } finally {
  await gate.query('ROLLBACK');gate.release();
  await Promise.allSettled(pending);
 }
}
suite('isolated PostgreSQL maintenance',()=>{
 beforeAll(async()=>{
  const location=await pool.query<{data_directory:string}>('SHOW data_directory');
  if(location.rows[0].data_directory!==new URL('../.maintenance-pg',import.meta.url).pathname)throw new Error('Refusing non-fixture database');
  for(const name of ['001_initial.sql','002_auth.sql','003_maintenance.sql','004_feed_tokens.sql'])await pool.query(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  await pool.query(readFileSync(new URL('../migrations/003_maintenance.sql',import.meta.url),'utf8'));
  for(const role of ['ip_intel_read','ip_intel_maintenance','ip_intel_reputation'])await pool.query(`ALTER ROLE ${role} LOGIN`);
  await pool.query(`INSERT INTO ip_intel_cache(ip,first_seen,last_seen) VALUES ('192.0.2.10',now(),now()) ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO ip_intel_events(ip,seen_at,raw_summary) VALUES ('192.0.2.10',now(),'SYNTHETIC_EVIDENCE')`);
  await reputation.query(`INSERT INTO ip_intel_reputation(ip,abuse_score,reputation_checked_at,reputation_json) VALUES ('192.0.2.10',0,'2020-01-01','{"synthetic":"not-for-browser"}'),('192.0.2.11',10,'2020-01-01',null),('192.0.2.12',20,now(),null) ON CONFLICT(ip) DO UPDATE SET reputation_checked_at=EXCLUDED.reputation_checked_at`);
 });
 afterAll(async()=>{await Promise.all([pool.end(),read.end(),write.end(),reputation.end()]);});
 it('runs status/browse/preview/execute and protects telemetry/audit under exact scoped roles',async()=>{
  const status=await repo.status();expect(status.schemaVersion).toBe('004');expect(status.capabilities.maintenance).toBe(true);
  expect(JSON.stringify(await repo.list({limit:1}))).not.toContain('not-for-browser');
  const events=await pool.query('SELECT count(*)::int AS count FROM ip_intel_events');
  const reputationBefore=await pool.query('SELECT * FROM ip_intel_reputation ORDER BY ip');
  const auditBefore=await pool.query('SELECT * FROM ip_intel_maintenance_audit ORDER BY id');
  const preview=await repo.preview(actor,{operation:'delete',ips:['192.0.2.10'],retention:false});
  expect((await pool.query('SELECT * FROM ip_intel_reputation ORDER BY ip')).rows).toEqual(reputationBefore.rows);
  expect((await pool.query('SELECT * FROM ip_intel_maintenance_audit ORDER BY id')).rows).toEqual(auditBefore.rows);
  expect((await pool.query('SELECT plan_json FROM ip_intel_maintenance_plans WHERE id=$1',[preview.id])).rows[0].plan_json).toEqual(preview);
  const input={planId:preview.id,confirmation:preview.confirmation,idempotencyKey:randomUUID()};
  const completed=await repo.execute(actor,input);expect(completed.affectedCount).toBe(1);
  expect(await repo.execute(actor,input)).toEqual(completed);
  expect((await pool.query('SELECT count(*)::int AS count FROM ip_intel_events')).rows).toEqual(events.rows);
  expect((await pool.query(`SELECT count(*)::int AS count FROM ip_intel_cache WHERE ip='192.0.2.10'`)).rows[0].count).toBe(1);
  expect((await pool.query(`SELECT count(*)::int AS count FROM ip_intel_reputation WHERE ip='192.0.2.12'`)).rows[0].count).toBe(1);
  await expect(write.query('DELETE FROM ip_intel_maintenance_audit')).rejects.toThrow();
  await expect(write.query('DELETE FROM ip_intel_events')).rejects.toThrow();
  await expect(read.query('DELETE FROM ip_intel_reputation')).rejects.toThrow();
  await expect(reputation.query('DELETE FROM ip_intel_reputation')).rejects.toThrow();
 });
 it('blocks bulk delete without operator recovery and refuses inbound cascade dependencies',async()=>{
  const blocked=new MaintenanceRepository(read,()=>write,{ownershipVerified:true,recoveryCheckpoint:null});
  const preview=await blocked.preview(actor,{operation:'delete',ips:['192.0.2.11','192.0.2.12'],retention:false});
  expect(preview.recoveryRequired).toBe(true);
  await expect(blocked.execute(actor,{planId:preview.id,confirmation:preview.confirmation,idempotencyKey:randomUUID()})).rejects.toThrow('RECOVERY_CHECKPOINT_REQUIRED');
  await pool.query('CREATE TABLE IF NOT EXISTS synthetic_reputation_dependency (ip text REFERENCES ip_intel_reputation(ip) ON DELETE CASCADE)');
  try {await expect(repo.preview(actor,{operation:'delete',ips:['192.0.2.11'],retention:false})).rejects.toThrow('UNSAFE_REPUTATION_DEPENDENCIES');}
  finally {await pool.query('DROP TABLE synthetic_reputation_dependency');}
 });
 it('rejects a concurrently refreshed snapshot and executes approved one-run invalidation',async()=>{
  const preview=await repo.preview(actor,{operation:'invalidate',ips:['192.0.2.11'],retention:false});
  await reputation.query(`UPDATE ip_intel_reputation SET abuse_score=11 WHERE ip='192.0.2.11'`);
  await expect(repo.execute(actor,{planId:preview.id,confirmation:preview.confirmation,idempotencyKey:randomUUID()})).rejects.toThrow('TARGETS_CHANGED');
  const retention=await repo.preview(actor,{operation:'invalidate',ips:['192.0.2.11'],olderThan:'2021-01-01T00:00:00Z',retention:true});
  const job=await repo.execute(actor,{planId:retention.id,confirmation:retention.confirmation,idempotencyKey:randomUUID()});expect(job.status).toBe('queued');
  const completed=await repo.runOne();expect(completed?.affectedCount).toBe(1);expect(completed?.status).toBe('completed');
  expect((await pool.query(`SELECT reputation_checked_at FROM ip_intel_reputation WHERE ip='192.0.2.11'`)).rows[0].reputation_checked_at).toBeNull();
 });
 it('binds real plans to actors and serializes concurrent idempotent execution without reuse',async()=>{
  await reputation.query(`INSERT INTO ip_intel_reputation(ip,reputation_checked_at) VALUES ('192.0.2.30','2020-01-01') ON CONFLICT(ip) DO UPDATE SET reputation_checked_at=EXCLUDED.reputation_checked_at`);
  const preview=await repo.preview(actor,{operation:'invalidate',ips:['192.0.2.30'],retention:false});
  const input={planId:preview.id,confirmation:preview.confirmation,idempotencyKey:randomUUID()};
  await expect(repo.execute({...actor,userId:'other-synthetic-admin'},input)).rejects.toThrow('FORBIDDEN');
  await expect(repo.execute(actor,{...input,confirmation:'INVALIDATE 2'})).rejects.toThrow('CONFIRMATION_REQUIRED');
  expect((await pool.query(`SELECT reputation_checked_at IS NOT NULL AS checked FROM ip_intel_reputation WHERE ip='192.0.2.30'`)).rows[0].checked).toBe(true);
  const [first,replay]=await Promise.all([repo.execute(actor,input),repo.execute(actor,input)]);
  expect(replay).toEqual(first);expect(first.affectedCount).toBe(1);
  await expect(repo.execute(actor,{...input,idempotencyKey:randomUUID()})).rejects.toThrow('PLAN_ALREADY_USED');
  const other=await repo.preview(actor,{operation:'invalidate',ips:['192.0.2.12'],retention:false});
  await expect(repo.execute(actor,{...input,planId:other.id})).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');
  expect((await pool.query('SELECT count(*)::int AS count FROM ip_intel_maintenance_jobs WHERE plan_id=$1',[preview.id])).rows[0].count).toBe(1);
 });
 it('fails queued expiry without deleting targets and disables the durable policy',async()=>{
  const {plan,job}=await queued('192.0.2.50','delete');
  const before=await pool.query(`SELECT * FROM ip_intel_reputation WHERE ip='192.0.2.50'`);
  // Advance only the application clock: SQL, immutable plan and worker remain real.
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(plan.expiresAt)+1);
  try {expect(await repo.runOne()).toMatchObject({id:job.id,status:'failed',errorCode:'PLAN_EXPIRED',affectedCount:0});}
  finally {clock.mockRestore();}
  expect((await pool.query(`SELECT * FROM ip_intel_reputation WHERE ip='192.0.2.50'`)).rows).toEqual(before.rows);
  expect((await pool.query('SELECT state FROM ip_intel_maintenance_plans WHERE id=$1',[plan.id])).rows[0].state).toBe('failed');
  expect((await pool.query('SELECT enabled FROM ip_intel_retention_policies WHERE job_id=$1',[job.id])).rows[0].enabled).toBe(false);
  expect((await pool.query('SELECT job_json FROM ip_intel_maintenance_jobs WHERE id=$1',[job.id])).rows[0].job_json).toMatchObject({status:'failed',errorCode:'PLAN_EXPIRED',affectedCount:0});
  expect((await pool.query('SELECT outcome,affected_count FROM ip_intel_maintenance_audit WHERE scope_fingerprint=$1 ORDER BY created_at',[plan.fingerprint])).rows).toEqual([{outcome:'queued',affected_count:0},{outcome:'PLAN_EXPIRED',affected_count:0}]);
 });
 it('detects real delete/reinsert ABA even with identical visible reputation values',async()=>{
  await reputation.query(`INSERT INTO ip_intel_reputation(ip,reputation_checked_at) VALUES ('192.0.2.51','2020-01-01') ON CONFLICT(ip) DO UPDATE SET reputation_checked_at=EXCLUDED.reputation_checked_at`);
  const plan=await repo.preview(actor,{operation:'delete',ips:['192.0.2.51'],retention:false});
  const original=(await pool.query(`SELECT * FROM ip_intel_reputation WHERE ip='192.0.2.51'`)).rows[0];
  await pool.query(`DELETE FROM ip_intel_reputation WHERE ip='192.0.2.51'`);
  await pool.query(`INSERT INTO ip_intel_reputation SELECT (jsonb_populate_record(NULL::ip_intel_reputation,$1::jsonb)).*`,[JSON.stringify(original)]);
  const replacement=(await pool.query(`SELECT * FROM ip_intel_reputation WHERE ip='192.0.2.51'`)).rows[0];
  expect(String(replacement.revision)).not.toBe(plan.targets[0].revision);
  expect({...replacement,revision:original.revision}).toEqual(original);
  await expect(repo.execute(actor,{planId:plan.id,confirmation:plan.confirmation,idempotencyKey:randomUUID()})).rejects.toThrow('TARGETS_CHANGED');
  expect((await pool.query(`SELECT * FROM ip_intel_reputation WHERE ip='192.0.2.51'`)).rows[0]).toEqual(replacement);
  expect((await pool.query('SELECT count(*)::int AS count FROM ip_intel_maintenance_jobs WHERE plan_id=$1',[plan.id])).rows[0].count).toBe(0);
 });
 it('serializes competing live workers to one mutation and one terminal audit',async()=>{
  const {plan,job}=await queued('192.0.2.52');
  const results=await raceAtPlan(plan.id,()=>repo.runOne(),()=>repo.runOne());
  expect(results[0]).toMatchObject({status:'fulfilled',value:{id:job.id,status:'completed',affectedCount:1}});
  expect(results[1]).toEqual({status:'fulfilled',value:null});
  expect((await pool.query(`SELECT reputation_checked_at FROM ip_intel_reputation WHERE ip='192.0.2.52'`)).rows[0].reputation_checked_at).toBeNull();
  expect((await pool.query('SELECT job_json FROM ip_intel_maintenance_jobs WHERE id=$1',[job.id])).rows[0].job_json).toMatchObject({status:'completed',affectedCount:1});
  expect((await pool.query('SELECT outcome,affected_count FROM ip_intel_maintenance_audit WHERE scope_fingerprint=$1 ORDER BY created_at',[plan.fingerprint])).rows).toEqual([{outcome:'queued',affected_count:0},{outcome:'completed',affected_count:1}]);
  expect((await pool.query('SELECT enabled FROM ip_intel_retention_policies WHERE job_id=$1',[job.id])).rows[0].enabled).toBe(false);
 });
 it.each(['cancel-first','worker-first'] as const)('serializes concurrent cancellation and worker: %s',async(order)=>{
  const ip=order==='cancel-first'?'192.0.2.53':'192.0.2.54';
  const {plan,job}=await queued(ip);
  const cancel=()=>repo.cancel(actor,job.id),worker=()=>repo.runOne();
  const results=await raceAtPlan(plan.id,order==='cancel-first'?cancel:worker,order==='cancel-first'?worker:cancel);
  const expected=order==='cancel-first'?'cancelled':'completed';
  expect(results[0]).toMatchObject({status:'fulfilled',value:{status:expected,affectedCount:order==='cancel-first'?0:1}});
  if(order==='cancel-first')expect(results[1]).toEqual({status:'fulfilled',value:null});
  else {
   expect(results[1].status).toBe('rejected');
   if(results[1].status==='rejected')expect(results[1].reason.message).toBe('JOB_NOT_QUEUED');
  }
  expect((await pool.query('SELECT state FROM ip_intel_maintenance_plans WHERE id=$1',[plan.id])).rows[0].state).toBe(expected);
  expect((await pool.query('SELECT job_json FROM ip_intel_maintenance_jobs WHERE id=$1',[job.id])).rows[0].job_json.status).toBe(expected);
  expect((await pool.query('SELECT enabled FROM ip_intel_retention_policies WHERE job_id=$1',[job.id])).rows[0].enabled).toBe(false);
  expect((await pool.query('SELECT reputation_checked_at IS NULL AS invalidated FROM ip_intel_reputation WHERE ip=$1',[ip])).rows[0].invalidated).toBe(order==='worker-first');
  expect((await pool.query('SELECT outcome,affected_count FROM ip_intel_maintenance_audit WHERE scope_fingerprint=$1 ORDER BY created_at',[plan.fingerprint])).rows).toEqual([{outcome:'queued',affected_count:0},{outcome:expected,affected_count:order==='cancel-first'?0:1}]);
 });
 it('executes the real bounded worker CLI once and disables the approved retention policy',async()=>{
  const workerActor={userId:randomUUID(),role:'admin'};
  await pool.query(`ALTER ROLE ip_intel_auth LOGIN`);
  await pool.query(`INSERT INTO ip_intel_users(id,username,password_hash,role) VALUES ($1,$2,'synthetic-unusable-password','admin')`,[workerActor.userId,'worker-'+workerActor.userId]);
  await reputation.query(`INSERT INTO ip_intel_reputation(ip,reputation_checked_at) VALUES ('192.0.2.40','2020-01-01') ON CONFLICT(ip) DO UPDATE SET reputation_checked_at=EXCLUDED.reputation_checked_at`);
  const preview=await repo.preview(workerActor,{operation:'invalidate',ips:['192.0.2.40'],olderThan:'2021-01-01T00:00:00Z',retention:true});
  const job=await repo.execute(workerActor,{planId:preview.id,confirmation:preview.confirmation,idempotencyKey:randomUUID()});
  const env:NodeJS.ProcessEnv={NODE_ENV:'test',PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,MAINTENANCE_OWNERSHIP:'ip-intel-owned-v1',AUTH_DATABASE_URL:'postgresql://ip_intel_auth@127.0.0.1:55439/postgres',MAINTENANCE_DATABASE_URL:'postgresql://ip_intel_maintenance@127.0.0.1:55439/postgres',READ_DATABASE_URL:'postgresql://ip_intel_read@127.0.0.1:55439/postgres'};
  const result=await execFileAsync(process.execPath,['--import','tsx','scripts/maintenance-worker.mjs','--max-jobs','1'],{env,timeout:30000});
  expect(JSON.parse(result.stdout)).toEqual({processed:1,jobs:[{id:job.id,status:'completed',matchedCount:1,affectedCount:1}]});
  expect((await pool.query('SELECT enabled FROM ip_intel_retention_policies WHERE job_id=$1',[job.id])).rows[0].enabled).toBe(false);
  expect((await pool.query(`SELECT reputation_checked_at FROM ip_intel_reputation WHERE ip='192.0.2.40'`)).rows[0].reputation_checked_at).toBeNull();
  const replay=await execFileAsync(process.execPath,['--import','tsx','scripts/maintenance-worker.mjs','--max-jobs','1'],{env,timeout:30000});
  expect(JSON.parse(replay.stdout)).toEqual({processed:0,jobs:[]});
  await reputation.query(`UPDATE ip_intel_reputation SET reputation_checked_at='2020-01-01' WHERE ip='192.0.2.40'`);
  const revokedPlan=await repo.preview(workerActor,{operation:'invalidate',ips:['192.0.2.40'],olderThan:'2021-01-01T00:00:00Z',retention:true});
  const revokedJob=await repo.execute(workerActor,{planId:revokedPlan.id,confirmation:revokedPlan.confirmation,idempotencyKey:randomUUID()});
  await pool.query('UPDATE ip_intel_users SET disabled=true WHERE id=$1',[workerActor.userId]);
  const revoked=await execFileAsync(process.execPath,['--import','tsx','scripts/maintenance-worker.mjs','--max-jobs','1'],{env,timeout:30000});
  expect(JSON.parse(revoked.stdout)).toEqual({processed:1,jobs:[{id:revokedJob.id,status:'failed',matchedCount:1,affectedCount:0}]});
  const durable=await pool.query('SELECT job_json FROM ip_intel_maintenance_jobs WHERE id=$1',[revokedJob.id]);
  expect(durable.rows[0].job_json.errorCode).toBe('ACTOR_PERMISSION_REVOKED');
  expect((await pool.query(`SELECT reputation_checked_at IS NOT NULL AS checked FROM ip_intel_reputation WHERE ip='192.0.2.40'`)).rows[0].checked).toBe(true);
  expect((await pool.query('SELECT enabled FROM ip_intel_retention_policies WHERE job_id=$1',[revokedJob.id])).rows[0].enabled).toBe(false);
 });
});
