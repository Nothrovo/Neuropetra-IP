import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { Pool } from 'pg';
import { hashToken, opaqueToken } from '../lib/auth';
const enabled=globalThis.process.env.RUN_DATABASE_TESTS==='1';
const password=enabled ? readFileSync('.secrets/review-db.env','utf8').match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1]?.trim() : 'unused';
if(!password)throw new Error('Synthetic database secret missing');
const base=`postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:55437/`;
const admin=new Pool({connectionString:base+'ip_intel_test'});
const database='ip_intel_http_test';
let pool:Pool|undefined;let process:ChildProcess|undefined;
async function stop(){if(process && process.exitCode===null){process.kill('SIGTERM');await new Promise<void>(resolve=>process!.once('exit',()=>resolve()));}process=undefined;}
afterAll(async()=>{if(!enabled){await admin.end();return;}await stop();await pool?.end();await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);await admin.end();});
describe.skipIf(!enabled)('real Next HTTP account lifecycle with synthetic PostgreSQL persistence',()=>{
 it('boots, sets up once, logs in, reauthenticates, revokes, survives application restart and rejects stale cookies',async()=>{
  await admin.query(`CREATE DATABASE ${database}`);
  pool=new Pool({connectionString:base+database});
  for(const file of ['001_initial.sql','002_auth.sql','003_maintenance.sql','004_feed_tokens.sql'])await pool.query(readFileSync('migrations/'+file,'utf8'));
  const net=createServer();await new Promise<void>(resolve=>net.listen(0,'127.0.0.1',resolve));
  const address=net.address();if(!address||typeof address==='string')throw new Error('Port reservation failed');
  const port=address.port;await new Promise<void>(resolve=>net.close(()=>resolve()));
  const origin=`http://127.0.0.1:${port}`;
  async function start(){
   process=spawn(globalThis.process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{
    env:{...globalThis.process.env,APP_ORIGIN:origin,AUTH_DATABASE_URL:base+database,READ_DATABASE_URL:base+database,REPUTATION_DATABASE_URL:base+database,AUTH_DATABASE_URL_FILE:'',READ_DATABASE_URL_FILE:'',REPUTATION_DATABASE_URL_FILE:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:'pipe',
   });
   // Capture only bounded diagnostics, never dump environment or database URLs.
   let output='';process.stdout?.on('data',chunk=>{output=(output+chunk.toString()).slice(-2000);});process.stderr?.on('data',chunk=>{output=(output+chunk.toString()).slice(-2000);});
   for(let i=0;i<120;i++){
    try{if((await fetch(origin+'/api/health')).ok)return;}catch{}
    if(process.exitCode!==null)throw new Error('Synthetic Next process exited before healthcheck');
    await new Promise(resolve=>setTimeout(resolve,500));
   }
   throw new Error('Synthetic Next healthcheck timed out');
  }
  await start();
  const post=(path:string,body:unknown,cookie='')=>fetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)});
  expect((await fetch(origin+'/api/ready')).status).toBe(200);
  expect((await fetch(origin+'/api/stats',{headers:{cookie:'soc_session=forged'}})).status).toBe(401);
  expect((await post('/api/setup',{token:'x'.repeat(43),username:'http-owner',password:'synthetic HTTP passphrase'})).status).toBe(403);
  const bootstrap=opaqueToken();
  await pool.query("UPDATE ip_intel_installation SET bootstrap_hash=$1,bootstrap_expires_at=now()+interval '30 minutes'",[hashToken(bootstrap)]);
  expect((await post('/api/setup',{token:bootstrap,username:'http-owner',password:'synthetic HTTP passphrase'})).status).toBe(201);
  const login=await post('/api/auth/login',{username:'http-owner',password:'synthetic HTTP passphrase'});expect(login.status).toBe(200);
  const cookie=login.headers.get('set-cookie')?.split(';')[0];expect(cookie).toBeTruthy();
  expect(login.headers.get('set-cookie')).toContain('HttpOnly');expect(login.headers.get('set-cookie')).not.toContain('Secure');
  const identity=await fetch(origin+'/api/auth/session',{headers:{cookie:cookie!}});
  expect((await identity.json()).user.username).toBe('http-owner');
  await pool.query("UPDATE ip_intel_sessions SET recent_auth_at=now()-interval '1 hour'");
  expect((await post('/api/auth/reauth',{password:'synthetic HTTP passphrase'},cookie!)).status).toBe(200);
  expect((await pool.query("SELECT recent_auth_at>now()-interval '1 minute' AS fresh FROM ip_intel_sessions")).rows[0].fresh).toBe(true);
  await stop();await start();
  expect((await fetch(origin+'/api/auth/session',{headers:{cookie:cookie!}})).status).toBe(200);
  expect((await post('/api/setup',{token:bootstrap,username:'other-owner',password:'other synthetic passphrase'})).status).toBe(409);
  expect((await post('/api/auth/logout',{},cookie!)).status).toBe(200);
  expect((await fetch(origin+'/api/auth/session',{headers:{cookie:cookie!}})).status).toBe(401);
  expect((await pool.query('SELECT count(*) FROM ip_intel_users')).rows[0].count).toBe('1');
 },120000);
});
