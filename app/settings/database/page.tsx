'use client';

import React,{useCallback,useEffect,useState} from 'react';
import { SettingsNav } from '@/components/settings/SettingsNav';
import type {DatabaseStatus,OwnedRecord,MaintenancePlan,MaintenanceJob} from '../../../lib/database-management';

async function api<T>(url:string,body?:unknown):Promise<T> {
 const response=await fetch(url,{method:body===undefined?'GET':'POST',cache:'no-store',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json();
 if(!response.ok)throw new Error(typeof result.error==='string'?result.error:`Request failed (${response.status})`);
 return result as T;
}
const base='/api/admin/database';
const control='rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 disabled:opacity-40';
export default function DatabasePage(){
 const [status,setStatus]=useState<DatabaseStatus|null>(null);
 const [records,setRecords]=useState<OwnedRecord[]>([]);
 const [next,setNext]=useState<string|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [ip,setIp]=useState('');
 const [cutoff,setCutoff]=useState('');
 const [operation,setOperation]=useState<'invalidate'|'delete'>('invalidate');
 const [retention,setRetention]=useState(false);
 const [plan,setPlan]=useState<MaintenancePlan|null>(null);
 const [confirmation,setConfirmation]=useState('');
 const [password,setPassword]=useState('');
 const [key,setKey]=useState('');
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>setStatus(await api<DatabaseStatus>(base+'/status')),[]);
 useEffect(()=>{let active=true;api<DatabaseStatus>(base+'/status').then(value=>{if(active)setStatus(value);}).catch(()=>{if(active)setError('Database status unavailable or access denied. Sign in as an administrator and retry.');});return ()=>{active=false;};},[]);
 function resetPlan(){setPlan(null);setConfirmation('');setPassword('');setMessage('');}
 async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(err){setError(err instanceof Error?err.message:'Request failed');}finally{setBusy(false);}}
 async function browse(cursor?:string){
  const params=new URLSearchParams({limit:'50'});if(ip)params.set('ip',ip);if(cutoff)params.set('olderThan',cutoff);if(cursor)params.set('cursor',cursor);
  const page=await api<{items:OwnedRecord[];nextCursor:string|null}>(base+'/records?'+params);
  setRecords(page.items);setNext(page.nextCursor);setSelected([]);resetPlan();
 }
 async function preview(){
  const value=await api<MaintenancePlan>(base+'/maintenance/preview',{operation,...(selected.length?{ips:selected}:{}),...(cutoff?{olderThan:cutoff}:{}),retention});
  setPlan(value);setConfirmation('');setKey(crypto.randomUUID());setMessage('Preview saved. No reputation data was changed.');
 }
 async function execute(){
  if(!plan)return;
  try {
   await api('/api/auth/reauth',{password});setPassword('');
   const job=await api<MaintenanceJob>(base+'/maintenance/execute',{planId:plan.id,confirmation,idempotencyKey:key});
   setMessage(`${job.status}: ${job.affectedCount} of ${job.matchedCount} reputation entries changed. Job ${job.id}`);
   setPlan(null);setSelected([]);await refresh();
  }finally{setPassword('');}
 }
 async function cancel(jobId:string){
  try {await api('/api/auth/reauth',{password});setPassword('');await api(base+'/maintenance/cancel',{jobId});await refresh();setMessage('Queued job cancelled. No batch committed.');}finally{setPassword('');}
 }
 return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8 text-zinc-100">
  <header>
    <p className="text-xs font-mono uppercase tracking-wider text-zinc-500">Settings / Administrator</p>
    <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Database Management</h1>
    <p className="mt-1.5 text-sm text-zinc-400">No shared telemetry, indicator identity, accounts or audit records can be deleted here. Only Neuropetra IP-owned reputation metadata is writable.</p>
  </header>
  <SettingsNav />
  {error&&<div role="alert" className="rounded border border-red-500 p-3">{error} — Retry the connection check; for a changed/expired preview, preview the selection again.</div>}
  {message&&<p role="status" className="rounded border border-emerald-600 p-3">{message}</p>}
  <section aria-label="Database connection" className="space-y-3 rounded border border-slate-700 p-4">
   <button className={control} disabled={busy} onClick={()=>run(refresh)}>Test connection &amp; capabilities</button>
   {status&&<><p>{status.identity.databaseAlias} / {status.identity.schemaAlias} · Connected · Migration {status.schemaVersion}</p><p>{status.capabilities.reason??'Scoped maintenance available'}</p>
    <p>Recovery checkpoint: {status.recovery.available?'operator verified':'not configured — bulk deletion disabled'}. {status.recovery.instructions}</p>
    <ul>{status.resources.map(r=><li key={r.name}>{r.name} — {r.ownership} — {r.count} records; {r.bytes} bytes (technical storage estimate); latest {r.freshness??'unknown'}</li>)}</ul></>}
  </section>
  <section className="space-y-3 rounded border border-slate-700 p-4"><h2 className="text-xl font-semibold">Browse owned reputation</h2>
   <label className="block">Exact IP <input className={control} value={ip} onChange={e=>{setIp(e.target.value);setSelected([]);setRecords([]);resetPlan();}} placeholder="192.0.2.1"/></label>
   <label className="block">UTC cutoff (ISO 8601, exclusive) <input className={control} value={cutoff} onChange={e=>{setCutoff(e.target.value);setSelected([]);setRecords([]);resetPlan();}} placeholder="2026-01-01T00:00:00Z"/></label>
   <button className={control} disabled={busy||!status?.capabilities.browse} onClick={()=>run(()=>browse())}>Search records</button>
   <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Select','IP','Score','Country','ISP','Reputation checked','Version'].map(v=><th className="p-2" key={v}>{v}</th>)}</tr></thead><tbody>{records.map(r=><tr key={r.ip}><td><input type="checkbox" aria-label={'Select '+r.ip} checked={selected.includes(r.ip)} onChange={e=>{setSelected(e.target.checked?[...selected,r.ip]:selected.filter(v=>v!==r.ip));resetPlan();}}/></td><td>{r.ip}</td><td>{r.abuse_score??'unknown'}</td><td>{r.country_code??'—'}</td><td>{r.isp??'—'}</td><td>{r.reputation_checked_at??'stale / unknown'}</td><td>{r.revision}</td></tr>)}</tbody></table></div>
   <p>{selected.length} selected on this page. No raw provider payload or telemetry is shown.</p><button className={control} disabled={busy||!next} onClick={()=>run(()=>browse(next!))}>Next page</button>
  </section>
  <section className="space-y-3 rounded border border-slate-700 p-4"><h2 className="text-xl font-semibold">Scoped maintenance</h2><p>Typed confirmation and recent administrator reauthentication are required after preview.</p>
   <label>Operation <select className={control} value={operation} onChange={e=>{setOperation(e.target.value as 'invalidate'|'delete');resetPlan();}}><option value="invalidate">Invalidate reputation (mark stale)</option><option value="delete">Delete reputation metadata only</option></select></label>
   <p>Selected IPs take precedence; a UTC cutoff further narrows them. Without a selection the cutoff is required. At most 200 targets per atomic transaction. Nothing new matching later can be added.</p>
   <label className="block"><input type="checkbox" checked={retention} onChange={e=>{setRetention(e.target.checked);resetPlan();}}/> Queue approved one-run retention policy (cutoff required)</label>
   <p>Retention defaults disabled. This release supports explicitly approved one-run cutoff jobs, not recurring automatic deletion. The operator runs the worker before the ten-minute preview expires; scope changes fail closed.</p>
   <button className={control} disabled={busy||!status?.capabilities.maintenance||(!selected.length&&!cutoff)||(retention&&!cutoff)} onClick={()=>run(preview)}>Preview exact scope</button>
   {plan&&<div className="space-y-2 rounded border border-amber-500 p-4"><p>{plan.operation}: {plan.matchedCount} owned reputation entries; dependencies {plan.dependencyCount}; cutoff {plan.olderThan??'selected IPs only'}; expires {plan.expiresAt}</p><p>Scope SHA-256: <code className="break-all">{plan.fingerprint}</code></p><p>{plan.recoveryRequired&&!plan.recoveryAvailable?'Blocked: verified operator recovery checkpoint required.':'No telemetry or identities will change.'}</p><p>Type exactly: <strong>{plan.confirmation}</strong></p><label>Typed confirmation <input className={control} autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label></div>}
   <label className="block">Administrator password (reauthentication) <input className={control} type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <button className={control} disabled={busy||!plan||!password||confirmation!==plan.confirmation||(plan.recoveryRequired&&!plan.recoveryAvailable)} onClick={()=>run(execute)}>Reauthenticate &amp; {retention?'queue approved job':'execute once'}</button>
  </section>
  {status&&<><section className="space-y-3 rounded border border-slate-700 p-4"><h2 className="text-xl font-semibold">Maintenance jobs &amp; retention</h2><p>Refresh connection status for current state. Cancellation stops queued jobs; a completed atomic transaction cannot be undone.</p>{status.jobs.length===0&&<p>No maintenance jobs.</p>}{status.jobs.map(job=><div key={job.id}><code>{job.id}</code> — {job.status}; {job.affectedCount}/{job.matchedCount} committed {job.errorCode&&`— ${job.errorCode}`} {job.status==='queued'&&<button className={control} disabled={busy||!password} onClick={()=>run(()=>cancel(job.id))}>Reauthenticate &amp; cancel queued job</button>}</div>)}{status.policies.map(policy=><p key={policy.id}>One-run policy {policy.id} · {policy.enabled?'pending':'disabled / finished'} · {policy.scope} · cutoff {policy.cutoff} {policy.timezone} · next {policy.nextRunAt??'none'}</p>)}</section>
  <section className="space-y-3 rounded border border-slate-700 p-4"><h2 className="text-xl font-semibold">Protected audit (latest 30)</h2>{status.audit.length===0&&<p>No maintenance audit entries.</p>}{status.audit.map(a=><p key={a.id}>{a.createdAt} · actor {a.actorId} · {a.action} · {a.outcome} · {a.affectedCount}/{a.matchedCount} · <code className="break-all">{a.fingerprint}</code></p>)}</section></>}
 </main>;
}
