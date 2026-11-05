import { randomUUID } from 'node:crypto';
import { AuthError, hashPassword, hashToken, opaqueToken, throttleAuth, validatePassword, validateUsername } from './auth';
import { getAuthPool } from './db-pool';
export async function getInstallationState(): Promise<'setup-required'|'ready'> {
 const result=await getAuthPool().query<{installed_at:Date|null}>('SELECT installed_at FROM ip_intel_installation WHERE singleton');
 if(result.rows.length!==1)throw new Error('Installation state unavailable; operator migration required');
 return result.rows[0].installed_at ? 'ready' : 'setup-required';
}
/** Operator CLI only. No route may expose this function. */
export async function createBootstrapToken(): Promise<string> {
 const token=opaqueToken();
 const result=await getAuthPool().query(`UPDATE ip_intel_installation SET bootstrap_hash=$1,bootstrap_expires_at=now()+interval '30 minutes'
  WHERE singleton AND installed_at IS NULL AND NOT EXISTS(SELECT 1 FROM ip_intel_users)`,[hashToken(token)]);
 if(result.rowCount!==1)throw new AuthError(409,'Setup is closed or installation requires operator recovery');
 return token;
}
export async function completeBootstrap(input:{token:string;username:string;password:string}): Promise<void> {
 await throttleAuth('bootstrap:global',10);
 validateUsername(input.username); validatePassword(input.password);
 if(typeof input.token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token))throw new AuthError(403,'Setup authorization invalid or expired');
 const client=await getAuthPool().connect();
 try {
  await client.query('BEGIN');
  const result=await client.query<{installed_at:Date|null;authorized:boolean}>(`SELECT installed_at,
   (bootstrap_hash=$1 AND bootstrap_expires_at>now()) AS authorized FROM ip_intel_installation WHERE singleton FOR UPDATE`,[hashToken(input.token)]);
  const row=result.rows[0];
  if(!row)throw new Error('Installation state unavailable');
  if(row.installed_at)throw new AuthError(409,'Setup is closed');
  if(!row.authorized)throw new AuthError(403,'Setup authorization invalid or expired');
  const existing=await client.query('SELECT 1 FROM ip_intel_users LIMIT 1');
  if(existing.rowCount)throw new AuthError(409,'Existing accounts require operator recovery');
  const passwordHash=await hashPassword(input.password);
  await client.query("INSERT INTO ip_intel_users(id,username,password_hash,role) VALUES($1,$2,$3,'admin')",[randomUUID(),input.username,passwordHash]);
  await client.query('UPDATE ip_intel_installation SET installed_at=now(),bootstrap_hash=NULL,bootstrap_expires_at=NULL WHERE singleton');
  await client.query('COMMIT');
 } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
