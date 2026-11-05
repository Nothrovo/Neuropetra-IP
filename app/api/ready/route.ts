import { getAuthPool, getReadPool, getMaintenancePool } from '../../../lib/db-pool';
import { getAppOrigin, hasDatabase } from '../../../lib/config';
export async function GET() {
 try {
  getAppOrigin();
  const auth=await getAuthPool().query('SELECT singleton FROM ip_intel_installation WHERE singleton');
  const required = ['001','002','004'];
  if (hasDatabase('maintenance')) required.push('003');
  const schema=await getReadPool().query<{version:string}>('SELECT version FROM ip_intel_schema_migrations WHERE version = ANY($1::text[])',[required]);
  const applied = new Set(schema.rows.map(row => row.version));
  if(auth.rows.length!==1 || required.some(version => !applied.has(version)))throw new Error();
  // A ledger entry alone cannot prove the relations still exist. LIMIT 0
  // validates consumed columns and scoped-role access without reading records.
  await Promise.all([
   getAuthPool().query('SELECT id,username,password_hash,role,disabled FROM ip_intel_users LIMIT 0'),
   getAuthPool().query('SELECT token_hash,user_id,expires_at,revoked_at,recent_auth_at FROM ip_intel_sessions LIMIT 0'),
   getAuthPool().query('SELECT bucket,window_start,attempts FROM ip_intel_auth_attempts LIMIT 0'),
   getAuthPool().query('SELECT id,token_hash,scopes,expires_at,revoked_at FROM app_feed_tokens LIMIT 0'),
   getReadPool().query('SELECT ip,first_seen,last_seen,total_alert_count FROM ip_intel_cache LIMIT 0'),
   getReadPool().query('SELECT id,ip,seen_at FROM ip_intel_events LIMIT 0'),
   getReadPool().query('SELECT ip,revision,reputation_checked_at FROM ip_intel_reputation LIMIT 0'),
  ]);
  if (hasDatabase('maintenance')) {
   await Promise.all([
    getMaintenancePool().query('SELECT id,actor_id,plan_json,expires_at,state,created_at FROM ip_intel_maintenance_plans LIMIT 0'),
    getMaintenancePool().query('SELECT id,plan_id,actor_id,idempotency_key,job_json,status,created_at FROM ip_intel_maintenance_jobs LIMIT 0'),
    getMaintenancePool().query('SELECT id,actor_id,cutoff,enabled,job_id,created_at FROM ip_intel_retention_policies LIMIT 0'),
    getMaintenancePool().query('SELECT id,actor_id,action,scope_fingerprint,matched_count,affected_count,outcome,created_at FROM ip_intel_maintenance_audit LIMIT 0'),
   ]);
  }
  return Response.json({status:'ready'},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
