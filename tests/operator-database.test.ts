import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { Pool } from 'pg';
const temp=mkdtempSync(join(process.cwd(),'.operator-db-test-'));
const enabled=process.env.RUN_DATABASE_TESTS==='1';
const password=enabled ? readFileSync('.secrets/review-db.env','utf8').match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1]?.trim() : 'unused';
if(!password)throw new Error('Synthetic database secret missing');
const base=`postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:55437/`;
const admin=new Pool({connectionString:base+'ip_intel_test'});
const database='ip_intel_operator_test';
const command=(script:string,env:Record<string,string>)=>execFileSync(process.execPath,[script],{env:{...process.env,...env},encoding:'utf8',stdio:['pipe','pipe','pipe']});
afterAll(async()=>{if(!enabled){await admin.end();rmSync(temp,{recursive:true,force:true});return;}await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);for(const scope of ['auth','read','reputation','maintenance','migration'])await admin.query(`DROP ROLE IF EXISTS ip_intel_${scope}_login`);await admin.end();rmSync(temp,{recursive:true,force:true});});
describe.skipIf(!enabled)('local provisioning and migration operator against isolated empty database',()=>{
 it('provisions unique scoped logins, migrates as non-superuser, replays and enforces runtime grants',async()=>{
  await admin.query(`CREATE DATABASE ${database}`);
  execFileSync(process.execPath,['scripts/install.mjs','--directory',temp,'--host','127.0.0.1','--port','55437','--database',database],{stdio:'pipe'});
  const env={PROVISION_DATABASE_URL:base+database,ROLE_PASSWORDS_FILE:join(temp,'role-passwords.json')};
  expect(command('scripts/db-bootstrap.mjs',env)).toContain('Scoped roles provisioned');
  expect(()=>command('scripts/db-bootstrap.mjs',env)).toThrow();
  const migrateEnv={MIGRATION_DATABASE_URL_FILE:join(temp,'migration-database-url'),MIGRATION_DATABASE_URL:''};
  expect(command('scripts/migrate.mjs',migrateEnv)).toContain('Migrations are current');
  expect(command('scripts/migrate.mjs',migrateEnv)).not.toContain('Applied');
  for(const scope of ['auth','read','reputation','maintenance']){
   const pool=new Pool({connectionString:readFileSync(join(temp,scope+'-database-url'),'utf8').trim()});
   try{
    expect((await pool.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper).toBe(false);
    await expect(pool.query('CREATE TABLE forbidden (id int)')).rejects.toMatchObject({code:'42501'});
    if(scope==='read'){
     expect((await pool.query('SELECT count(*) FROM ip_intel_events')).rows[0].count).toBe('0');
     await expect(pool.query("INSERT INTO ip_intel_cache(ip,first_seen,last_seen) VALUES('192.0.2.1',now(),now())")).rejects.toMatchObject({code:'42501'});
    }else{
     await expect(pool.query('DELETE FROM ip_intel_events')).rejects.toMatchObject({code:'42501'});
    }
    if(scope==='reputation'){
     await pool.query("INSERT INTO ip_intel_reputation(ip,abuse_score) VALUES('192.0.2.10',0)");
     expect(Number((await pool.query("SELECT revision FROM ip_intel_reputation WHERE ip='192.0.2.10'")).rows[0].revision)).toBeGreaterThanOrEqual(1);
     await expect(pool.query('SELECT * FROM ip_intel_users')).rejects.toMatchObject({code:'42501'});
    }
    if(scope==='auth')expect((await pool.query('SELECT installed_at FROM ip_intel_installation')).rows[0].installed_at).toBeNull();
   }finally{await pool.end();}
  }
 },30000);
});
