#!/usr/bin/env node
// Local provisioning operator only. No DSN/password arguments or values in output.
import pg from 'pg';
import { readFileSync } from 'node:fs';
function secret(name){if(process.env[name]&&process.env[name+'_FILE'])throw new Error();return process.env[name+'_FILE']?readFileSync(process.env[name+'_FILE'],'utf8').trim():process.env[name];}
const ident=v=>`"${v.replaceAll('"','""')}"`;const literal=v=>`'${v.replaceAll("'","''")}'`;
let client;
try {
 const url=secret('PROVISION_DATABASE_URL');if(!url)throw new Error();
 const passwords=JSON.parse(readFileSync(process.env.ROLE_PASSWORDS_FILE ?? '.runtime/secrets/role-passwords.json','utf8'));
 for(const key of ['migration','auth','read','reputation','maintenance'])if(typeof passwords[key]!=='string'||!/^[a-f0-9]{64}$/.test(passwords[key]))throw new Error();
 client=new pg.Client({connectionString:url});await client.connect();await client.query('BEGIN');
 for(const scope of ['auth','read','reputation','maintenance']) {
  const role=`ip_intel_${scope}`;
  if(!(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await client.query(`CREATE ROLE ${ident(role)} NOLOGIN`);
 }
 for(const [scope,password] of Object.entries(passwords)) {
  const role=`ip_intel_${scope}_login`;
  if((await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)throw new Error('Existing login requires explicit operator rotation');
  await client.query(`CREATE ROLE ${ident(role)} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
  if(scope!=='migration')await client.query(`GRANT ${ident('ip_intel_'+scope)} TO ${ident(role)}`);
 }
 // Dedicated application database required. Never point provisioning at shared operational databases.
 await client.query('ALTER SCHEMA public OWNER TO ip_intel_migration_login');
 await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
 const database=(await client.query('SELECT current_database() AS name')).rows[0].name;
 await client.query(`GRANT CONNECT ON DATABASE ${ident(database)} TO ip_intel_migration_login,ip_intel_auth_login,ip_intel_read_login,ip_intel_reputation_login,ip_intel_maintenance_login`);
 await client.query('COMMIT');console.log('Scoped roles provisioned; run the explicit migration job next.');
}catch{if(client)await client.query('ROLLBACK').catch(()=>{});console.error('Provisioning failed; check dedicated database, operator privileges, role existence and secret files. No credentials are printed.');process.exitCode=1;}
finally{await client?.end();}
