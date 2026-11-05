import {describe,it,expect} from 'vitest';
import {Pool} from 'pg';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from '@playwright/test';
import {hashPassword,hashToken,opaqueToken} from '../lib/auth';
import {randomUUID} from 'node:crypto';
const suite=process.env.RUN_MAINTENANCE_SYNTHETIC_PG==='yes'?describe:describe.skip;
suite('real browser scoped database maintenance',()=>{
 it('admin browse/select/preview/password/execute persists across restart and denies analyst',async()=>{
  const pool=new Pool({host:'127.0.0.1',port:55439,user:'nothrovo',database:'postgres'});
  const location=await pool.query('SHOW data_directory');
  if(location.rows[0].data_directory!==new URL('../.maintenance-pg',import.meta.url).pathname)throw new Error('Refusing non-fixture database');
  const password='Synthetic browser passphrase 2026';
  const id=randomUUID(),analyst=randomUUID(),token=opaqueToken(),analystToken=opaqueToken();
  await pool.query('ALTER ROLE ip_intel_auth LOGIN');
  await pool.query('UPDATE ip_intel_installation SET installed_at=now() WHERE singleton');
  await pool.query('INSERT INTO ip_intel_users(id,username,password_hash,role) VALUES ($1,$2,$3,$4),($5,$6,$3,$7)',[id,'maintenance-'+id,await hashPassword(password),'admin',analyst,'analyst-'+analyst,'analyst']);
  await pool.query(`INSERT INTO ip_intel_sessions(token_hash,user_id,expires_at,recent_auth_at) VALUES ($1,$2,now()+interval '1 hour',now()-interval '1 hour'),($3,$4,now()+interval '1 hour',now())`,[hashToken(token),id,hashToken(analystToken),analyst]);
  await pool.query(`INSERT INTO ip_intel_reputation(ip,abuse_score,reputation_checked_at) VALUES ('198.51.100.101',0,'2020-01-01') ON CONFLICT(ip) DO UPDATE SET reputation_checked_at=EXCLUDED.reputation_checked_at`);
  const net=createServer();await new Promise<void>(resolve=>net.listen(0,'127.0.0.1',resolve));const address=net.address();if(!address||typeof address==='string')throw new Error();const port=address.port;await new Promise<void>(resolve=>net.close(()=>resolve()));
  const origin=`http://127.0.0.1:${port}`;
  let server:ChildProcess|undefined;
  async function stop(){if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise<void>(resolve=>server!.once('exit',()=>resolve()));}server=undefined;}
  async function start(){
   server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{env:{NODE_ENV:'development',PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,APP_ORIGIN:origin,AUTH_DATABASE_URL:'postgresql://ip_intel_auth@127.0.0.1:55439/postgres',READ_DATABASE_URL:'postgresql://ip_intel_read@127.0.0.1:55439/postgres',REPUTATION_DATABASE_URL:'postgresql://ip_intel_reputation@127.0.0.1:55439/postgres',MAINTENANCE_DATABASE_URL:'postgresql://ip_intel_maintenance@127.0.0.1:55439/postgres',MAINTENANCE_OWNERSHIP:'ip-intel-owned-v1',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
   for(let attempt=0;attempt<120;attempt++){try{const response=await fetch(origin+'/api/admin/database/status');if(response.status===401)return;}catch{}if(server?.exitCode!==null)throw new Error('Synthetic Next exited');await new Promise(resolve=>setTimeout(resolve,500));}throw new Error('Synthetic Next startup timeout');
  }
  const browser=await chromium.launch({headless:true});
  try {
   await start();
   const context=await browser.newContext();await context.addCookies([{name:'soc_session',value:token,url:origin}]);
   const page=await context.newPage();await page.goto(origin+'/settings/database');
   await page.getByText('Scoped maintenance available',{exact:true}).waitFor();
   await page.getByLabel('Exact IP',{exact:false}).fill('198.51.100.101');await page.getByRole('button',{name:'Search records'}).click();
   await page.getByRole('checkbox',{name:'Select 198.51.100.101'}).check();
   const previewResponse=page.waitForResponse(response=>response.url().endsWith('/api/admin/database/maintenance/preview')&&response.request().method()==='POST');
   await page.getByRole('button',{name:'Preview exact scope'}).click();await page.getByLabel('Typed confirmation',{exact:false}).waitFor();
   const plan=await (await previewResponse).json();
   expect(plan.targets.map((target:{ip:string})=>target.ip)).toEqual(['198.51.100.101']);
   const executePath=origin+'/api/admin/database/maintenance/execute';
   const executeBody={planId:plan.id,confirmation:plan.confirmation,idempotencyKey:randomUUID()};
   const crossOrigin=await context.request.post(executePath,{headers:{origin:'https://attacker.invalid'},data:executeBody});expect(crossOrigin.status()).toBe(403);
   const staleAuth=await context.request.post(executePath,{headers:{origin},data:executeBody});expect(staleAuth.status()).toBe(403);
   expect((await pool.query(`SELECT reputation_checked_at IS NOT NULL AS checked FROM ip_intel_reputation WHERE ip='198.51.100.101'`)).rows[0].checked).toBe(true);
   await page.getByLabel('Typed confirmation',{exact:false}).fill('INVALIDATE 1');await page.getByLabel('Administrator password',{exact:false}).fill(password);
   await page.getByRole('button',{name:'Reauthenticate & execute once'}).click();await page.getByRole('status').filter({hasText:'completed: 1 of 1'}).waitFor();
   expect(await page.getByLabel('Administrator password',{exact:false}).inputValue()).toBe('');
   expect((await pool.query(`SELECT reputation_checked_at FROM ip_intel_reputation WHERE ip='198.51.100.101'`)).rows[0].reputation_checked_at).toBeNull();
   // A live Next dev page reconnects HMR and reloads itself after restart; close it
   // before stopping so that reconnect cannot race the persistence navigation.
   await page.close();await stop();await start();
   const restartedPage=await context.newPage();await restartedPage.goto(origin+'/settings/database');
   await restartedPage.getByText('Scoped maintenance available',{exact:true}).waitFor();
   const audit=await context.request.get(origin+'/api/admin/database/status');expect((await audit.json()).audit.some((row:{actorId:string;outcome:string})=>row.actorId===id&&row.outcome==='completed')).toBe(true);
   const denied=await fetch(origin+'/api/admin/database/status',{headers:{cookie:'soc_session='+analystToken}});expect(denied.status).toBe(403);
   await context.close();
  }finally{await browser.close();await stop();await pool.end();}
 },180000);
});
