import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import {readFileSync} from 'node:fs';

// No Docker, production DSN, PostgreSQL environment defaults or credential files.
const suite=process.env.RUN_DATABASE_TESTS==='1'?describe:describe.skip;
const ip='203.0.113.240';
// Only authorization is intercepted; route serialization and database reads stay real.
vi.mock('../lib/authorization',()=>({withApiPermission:(handler:(...args:unknown[])=>Promise<Response>)=>(request:Request,context:unknown)=>handler(request,context,{userId:'synthetic-sql-reader',role:'admin'})}));
suite('actual isolated PostgreSQL data seams',()=>{
 let fixture:Pool|undefined, verified=false;
 let db:typeof import('../lib/db');let aggregate:typeof import('../lib/telemetry-aggregates');let pools:typeof import('../lib/db-pool')|undefined;
 const sql=async(text:string)=>(await fixture!.query(text)).rows;
 beforeAll(async()=>{
  const target=process.env.SYNTHETIC_TEST_DATABASE_URL;
  if(!target)throw new Error('Explicit SYNTHETIC_TEST_DATABASE_URL required');
  let url:URL;
  try{url=new URL(target);}catch{throw new Error('Invalid synthetic database target');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.port||!url.username||url.pathname!=='/ip_intel_synthetic_test'||url.search||url.hash)throw new Error('Refusing non-synthetic database target');
  fixture=new Pool({connectionString:target,connectionTimeoutMillis:3000,statement_timeout:10000});
  const marker=await sql("SELECT purpose FROM public.ip_intel_synthetic_fixture");
  if(marker.length!==1||marker[0].purpose!=='disposable-backend-tests')throw new Error('Synthetic fixture marker required');
  verified=true;
  for(const name of ['001_initial.sql','002_auth.sql','004_feed_tokens.sql'])await sql(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  vi.stubEnv('USE_MOCK_DATA','false');
  for(const name of ['READ_DATABASE_URL','REPUTATION_DATABASE_URL','AUTH_DATABASE_URL']){
   vi.stubEnv(name,target);vi.stubEnv(name+'_FILE','');
  }
  vi.resetModules();db=await import('../lib/db');aggregate=await import('../lib/telemetry-aggregates');pools=await import('../lib/db-pool');
  await sql(`DELETE FROM ip_intel_events WHERE ip='${ip}';DELETE FROM ip_intel_cache WHERE ip='${ip}';DELETE FROM ip_intel_reputation WHERE ip IN ('${ip}','203.0.113.241');`);
  await sql(`INSERT INTO ip_intel_cache(ip,first_seen,last_seen,total_alert_count,target_hosts) VALUES ('${ip}','2026-01-01Z','2026-01-02Z',66,ARRAY['included']) ON CONFLICT(ip) DO NOTHING;INSERT INTO ip_intel_events(ip,seen_at,target_host,outcome) SELECT '${ip}','2026-01-02Z','included','blocked' FROM generate_series(1,65);INSERT INTO ip_intel_events(ip,seen_at,target_host,outcome) VALUES ('${ip}','2026-01-01Z','included','compromised'),('${ip}','2026-01-03Z','included','success'),('${ip}','2026-01-02Z','excluded','success');`);
 });
 afterAll(async()=>{
  try{if(verified)await sql(`DELETE FROM ip_intel_events WHERE ip='${ip}';DELETE FROM ip_intel_cache WHERE ip='${ip}';DELETE FROM ip_intel_reputation WHERE ip IN ('${ip}','203.0.113.241');`);}
  finally{await pools?.closePools();await fixture?.end();vi.unstubAllEnvs();}
 });
 it('enforces read-only transactions even for data-modifying WITH queries',async()=>{
  await expect(db.query(`WITH changed AS (UPDATE ip_intel_cache SET total_alert_count=999 WHERE ip=$1 RETURNING ip) SELECT * FROM changed`,[ip])).rejects.toThrow(/read-only/);
 });
 it('matches scoped page totals, summary and older critical outcome in PostgreSQL',async()=>{
  const scope={from:'2026-01-01T00:00:00.000Z',to:'2026-01-03T00:00:00.000Z',targetHost:'included'};
  const summary=await aggregate.getIpSummary(ip,scope),page=await db.getIpEvents(ip,{...scope,limit:15,offset:15});expect(summary.eventCount).toBe(66);expect(summary.hasCriticalOutcome).toBe(true);expect(page.total).toBe(summary.eventCount);expect(page.events).toHaveLength(15);expect(page.events.map(event=>Number(event.id))).toEqual([...page.events.map(event=>Number(event.id))].sort((a,b)=>b-a));expect(summary.timeline.reduce((n,p)=>n+p.count,0)).toBe(66);
 });
 it('migrates and authorizes scoped expiring/revocable machine feed tokens in PostgreSQL',async()=>{
  const migration=readFileSync('migrations/004_feed_tokens.sql','utf8');await sql(migration);await sql(migration);
  const {createHash}=await import('node:crypto'),{requireFeedToken}=await import('../lib/feed-auth');
  const token='z'.repeat(43),hash=createHash('sha256').update(token).digest('hex'),id='00000000-0000-4000-8000-000000000240';
  await sql(`INSERT INTO app_feed_tokens(id,token_hash,scopes,expires_at) VALUES ('${id}','${hash}',ARRAY['feed:read'],now()+interval '1 hour') ON CONFLICT(id) DO UPDATE SET revoked_at=NULL,expires_at=now()+interval '1 hour';`);
  const request=new Request('http://localhost/api/blocklist',{headers:{authorization:'Bearer '+token}});
  try{expect(await requireFeedToken(request)).toEqual({id});await sql(`UPDATE app_feed_tokens SET revoked_at=now() WHERE id='${id}'`);await expect(requireFeedToken(request)).rejects.toMatchObject({status:401});await sql(`UPDATE app_feed_tokens SET revoked_at=NULL,expires_at=now()-interval '1 second' WHERE id='${id}'`);await expect(requireFeedToken(request)).rejects.toMatchObject({status:401});}finally{await sql(`DELETE FROM app_feed_tokens WHERE id='${id}'`);}
 });
 it('runs uniform scoped dashboard SQL against actual synthetic events',async()=>{
  const scope={from:'2026-01-01T00:00:00.000Z',to:'2026-01-03T00:00:00.000Z',targetHost:'included'};
  const data=await db.getDashboardAnalytics(30,scope);expect(data.timeline.reduce((n,p)=>n+p.attacks,0)).toBeGreaterThanOrEqual(66);expect(data.units.topCountries).toBe('events');
 });
 it('merges reputation across SQL provider membership, roster/export and observed feed without changing telemetry',async()=>{
  const observed='203.0.113.242',only='203.0.113.243',provider='Synthetic SQL merged provider';
  const cleanup=()=>sql(`DELETE FROM ip_intel_reputation WHERE ip IN ('${observed}','${only}');DELETE FROM ip_intel_cache WHERE ip='${observed}';`);
  await cleanup();
  try{
   await sql(`INSERT INTO ip_intel_cache(ip,first_seen,last_seen,total_alert_count,isp,abuse_score,vt_malicious,attack_types,target_hosts) VALUES ('${observed}',now()-interval '2 days',now()-interval '1 hour',7,'Synthetic SQL previous provider',NULL,0,ARRAY['synthetic-probe'],ARRAY['synthetic-target']);`);
   const before=await sql(`SELECT * FROM ip_intel_cache WHERE ip='${observed}'`),events=await sql(`SELECT * FROM ip_intel_events WHERE ip IN ('${observed}','${only}') ORDER BY id`);
   await db.upsertIpIntelReputation({ip:observed,abuseScore:99,isp:provider});
   await db.upsertIpIntelReputation({ip:only,abuseScore:40,isp:provider});
   expect(await db.getIpIntel(observed)).toMatchObject({abuse_score:99,isp:provider,total_alert_count:7});
   expect((await db.getBulkIntel([observed]))[0]).toMatchObject({abuse_score:99,isp:provider});
   const directory=await db.searchProviders(provider),detail=await db.getProviderDetail(provider),roster=await db.getProviderIps(provider);
   expect(directory.total).toBe(1);expect(directory.providers[0]).toMatchObject({ip_count:2,total_alerts:7,max_abuse_score:99,avg_abuse_score:70});
   expect(detail.summary).toEqual(directory.providers[0]);expect(detail.ips.find(row=>row.ip===observed)?.abuse_score).toBe(99);expect(roster.total).toBe(2);
   expect(roster.items.find(row=>row.ip===only)).toMatchObject({first_seen:null,last_seen:null,total_alert_count:0,attack_types:[],target_hosts:[]});
   expect((await db.searchProviders('Synthetic SQL previous provider')).total).toBe(0);expect((await db.getProviderIps('Synthetic SQL previous provider')).total).toBe(0);
   const feed=await db.getBlocklistData({minScore:75,minAlerts:0});expect(feed.find(row=>row.ip===observed)?.abuse_score).toBe(99);expect(feed.some(row=>row.ip===only)).toBe(false);
   const {GET}=await import('../app/api/providers/[name]/export/route');const response=await GET(new Request('http://localhost/api/providers/x/export?format=csv'),{params:Promise.resolve({name:provider})});expect(response.status).toBe(200);expect(await response.text()).toContain(`"${observed}","99","0","7"`);
   expect(await sql(`SELECT * FROM ip_intel_cache WHERE ip='${observed}'`)).toEqual(before);expect(await sql(`SELECT * FROM ip_intel_events WHERE ip IN ('${observed}','${only}') ORDER BY id`)).toEqual(events);
  }finally{await cleanup();}
 });
 it('preserves SQL null scores, real zero and known-only averages including VT-qualified exports',async()=>{
  const provider='Synthetic SQL null provider',a='203.0.113.244',b='203.0.113.245',c='203.0.113.246';
  const cleanup=()=>sql(`DELETE FROM ip_intel_reputation WHERE ip IN ('${a}','${b}','${c}');DELETE FROM ip_intel_cache WHERE ip IN ('${a}','${b}','${c}');`);
  await cleanup();
  try{
   await sql(`INSERT INTO ip_intel_cache(ip,first_seen,last_seen,total_alert_count,isp,abuse_score,vt_malicious) VALUES ('${a}',now()-interval '2 days',now()-interval '1 hour',1,'${provider}',NULL,6),('${b}',now()-interval '2 days',now()-interval '1 hour',1,'${provider}',NULL,6),('${c}',now()-interval '2 days',now()-interval '1 hour',1,'${provider}',NULL,6);`);
   const check=async(max:number|null,avg:number|null)=>{const summary=(await db.searchProviders(provider)).providers[0];expect(summary).toMatchObject({max_abuse_score:max,avg_abuse_score:avg});expect((await db.getProviderDetail(provider)).summary).toEqual(summary);};
   await check(null,null);
   const {serializeFeed}=await import('../lib/export');const feed=(await db.getBlocklistData({minScore:100})).filter(row=>row.ip===b);expect(feed[0]).toMatchObject({abuse_score:null,vt_malicious:6});expect(serializeFeed(feed,'csv')).toContain('"","6"');expect(serializeFeed(feed,'cdb')).toContain('Score_unknown');
   await db.upsertIpIntelReputation({ip:a,abuseScore:0});await check(0,0);
   await db.upsertIpIntelReputation({ip:b,abuseScore:80});await check(80,40);
  }finally{await cleanup();}
 });
 it('persists reputation without touching evidence timestamps/count and merges reputation-only reads',async()=>{
  const before=await sql(`SELECT first_seen,last_seen,total_alert_count FROM ip_intel_cache WHERE ip='${ip}';`);
  await db.upsertIpIntelReputation({ip,abuseScore:0});expect((await db.getIpIntel(ip))?.abuse_score).toBe(0);expect(await sql(`SELECT first_seen,last_seen,total_alert_count FROM ip_intel_cache WHERE ip='${ip}';`)).toEqual(before);
  await db.upsertIpIntelReputation({ip:'203.0.113.241',abuseScore:12,isp:'Synthetic SQL reputation-only provider'});expect(await db.getIpIntel('203.0.113.241')).toMatchObject({total_alert_count:0,first_seen:null,last_seen:null});
  const summary=(await db.searchProviders('Synthetic SQL reputation-only provider')).providers[0];expect(summary).toMatchObject({ip_count:1,total_alerts:0,last_seen:null,max_abuse_score:12,avg_abuse_score:12});expect((await db.getProviderDetail('Synthetic SQL reputation-only provider')).summary).toEqual(summary);
 });
});
