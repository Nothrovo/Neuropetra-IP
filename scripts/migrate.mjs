#!/usr/bin/env node
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
let client;
try {
 if(process.env.MIGRATION_DATABASE_URL && process.env.MIGRATION_DATABASE_URL_FILE)throw new Error();
 const url=process.env.MIGRATION_DATABASE_URL_FILE?readFileSync(process.env.MIGRATION_DATABASE_URL_FILE,'utf8').trim():process.env.MIGRATION_DATABASE_URL;
 if(!url)throw new Error();
 client=new pg.Client({connectionString:url,statement_timeout:60000});await client.connect();
 await client.query("SELECT pg_advisory_lock(hashtext('ip-intel-migrations'))");
 await client.query('CREATE TABLE IF NOT EXISTS ip_intel_migration_history (name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const directory=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(directory).filter(n=>/^\d{3}_[a-z0-9_-]+\.sql$/.test(n)).sort()) {
  const sql=readFileSync(join(directory.pathname,name),'utf8');const checksum=createHash('sha256').update(sql).digest('hex');
  const previous=await client.query('SELECT checksum FROM ip_intel_migration_history WHERE name=$1',[name]);
  if(previous.rowCount){if(previous.rows[0].checksum!==checksum)throw new Error('Migration checksum changed');continue;}
  await client.query('BEGIN');
  try{await client.query(sql);await client.query('INSERT INTO ip_intel_migration_history(name,checksum) VALUES($1,$2)',[name,checksum]);await client.query('COMMIT');}
  catch(error){await client.query('ROLLBACK');throw error;}
  console.log(`Applied ${name}`);
 }
 console.log('Migrations are current.');
}catch{console.error('Migration failed; check connectivity, migration privileges and schema compatibility. Existing telemetry is never altered automatically.');process.exitCode=1;}
finally{await client?.end();}
