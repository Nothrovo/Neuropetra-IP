'use client';

import React, { useEffect, useRef, useState } from 'react';
import { parseIndicatorInput } from '../../lib/investigation-input';
import { isGlobalIp } from '../../lib/ip-validator';
import IndicatorInput from './IndicatorInput';
import InvestigationResults from './InvestigationResults';
import { externalDisabledReason, initialInvestigationState, runInvestigation, switchInvestigationMode, updateInvestigationInput, type InvestigationMode, type InvestigationProgress, type InvestigationSession, type InvestigationSubmission } from './investigation-state';

export default function InvestigationWorkbench({ initialInput = '', initialMode = 'local', session: suppliedSession }: {
  initialInput?: string; initialMode?: InvestigationMode; session?: InvestigationSession | null;
}) {
  const [state, setState] = useState(() => initialInvestigationState(initialInput, initialMode));
  const [session, setSession] = useState<InvestigationSession | null>(suppliedSession ?? null);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [cachePolicy, setCachePolicy] = useState<InvestigationSubmission['cachePolicy']>('fresh-first');
  const [progress, setProgress] = useState<InvestigationProgress | null>(null);
  const [snapshot, setSnapshot] = useState<{ input: string; submission: InvestigationSubmission } | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const job = useRef(0);
  useEffect(() => {
    if (suppliedSession !== undefined) return;
    const abort = new AbortController();
    fetch('/api/auth/session', { cache: 'no-store', signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Session unavailable');
      const result = await response.json();
      if (!abort.signal.aborted) setSession(result.user && Array.isArray(result.permissions) ? result : null);
    }).catch(() => { if (!abort.signal.aborted) setSession(null); });
    return () => abort.abort();
  }, [suppliedSession, sessionAttempt]);
  useEffect(() => () => { job.current++; controller.current?.abort(); }, []);
  const parsed = parseIndicatorInput(state.input);
  const running = progress?.status === 'running';
  const stale = snapshot !== null && snapshot.input !== state.input;
  const externalReason = externalDisabledReason(session);
  const eligible = parsed.valid.filter(isGlobalIp);
  const selectedEligible = eligible.filter(ip => state.selected.includes(ip));
  const disabled = running || !parsed.valid.length || parsed.valid.length > 200 || (state.mode === 'external' && (!!externalReason || !selectedEligible.length));

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (disabled) return;
    const submission: InvestigationSubmission = { ips: state.mode === 'local' ? parsed.valid : selectedEligible, mode: state.mode, cachePolicy: state.mode === 'local' ? 'fresh-first' : cachePolicy, chunkSize: state.mode === 'external' ? 10 : 200 };
    const id = ++job.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setSnapshot({ input: state.input, submission }); setError('');
    try { await runInvestigation(submission, abort.signal, next => { if (id === job.current) setProgress(next); }); }
    catch { if (id === job.current) { setError('Unable to submit investigation. Check input and retry.'); setProgress(null); } }
  }

  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
    <div><h1 className="text-2xl font-semibold tracking-tight">Investigate</h1><p className="mt-2 text-sm text-zinc-400">One IP or a batch. Inspect local telemetry first; external enrichment is always explicit.</p></div>
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-white/10 bg-[#0e111a] p-5">
      <fieldset disabled={running} className="flex flex-wrap gap-4"><legend className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Data mode</legend>
        {(['local', 'external'] as const).map(mode => <label key={mode} className="flex items-center gap-2 text-sm"><input type="radio" name="investigation-mode" value={mode} checked={state.mode === mode} onChange={() => setState(previous => switchInvestigationMode(previous, mode))} />{mode === 'local' ? 'Local Lookup' : 'External Enrichment'}</label>)}
      </fieldset>
      {state.mode === 'local' ? <p className="text-sm text-emerald-300">Local telemetry and cached reputation only: zero provider requests, no reputation writes. Local misses never trigger external enrichment.</p> : <div className="space-y-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-sm">
        <p className="text-amber-200">Selected public indicators may leave this installation for the configured AbuseIPDB provider, consume quota and update the configured reputation store.</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={cachePolicy === 'fresh-first'} disabled={running} onChange={e => setCachePolicy(e.target.checked ? 'fresh-first' : 'force-refresh')} />Reuse fresh cache (default)</label>
        <p className="text-xs text-zinc-400">Fresh-first reuses eligible fresh results; stale or missing reputation may be requested externally.</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={cachePolicy === 'force-refresh'} disabled={running} onChange={e => setCachePolicy(e.target.checked ? 'force-refresh' : 'fresh-first')} />Force refresh — bypass cache; sends selected indicators externally and consumes quota again.</label>
        {externalReason && <p role="status" className="text-amber-300">{externalReason}</p>}
      </div>}
      <IndicatorInput value={state.input} onChange={input => setState(previous => updateInvestigationInput(previous, input))} disabled={running} />
      {parsed.valid.length > 0 && <details open={state.mode === 'external'} className="rounded-lg border border-white/10 p-3 text-xs">
        <summary>Indicator selection: {state.selected.length} selected · {eligible.length} eligible public IPs</summary>
        <label className="my-3 flex items-center gap-2"><input type="checkbox" aria-label="Select all input indicators" disabled={running} checked={parsed.valid.length > 0 && parsed.valid.every(ip => state.selected.includes(ip))} onChange={e => setState(previous => ({ ...previous, selected: e.target.checked ? parsed.valid : [] }))} />Select all valid input</label>
        <div className="grid max-h-40 gap-2 overflow-auto sm:grid-cols-3">{parsed.valid.map(ip => <label key={ip} className="flex items-center gap-2 font-mono"><input type="checkbox" aria-label={`Select input ${ip}`} disabled={running} checked={state.selected.includes(ip)} onChange={e => setState(previous => ({ ...previous, selected: e.target.checked ? [...previous.selected, ip] : previous.selected.filter(value => value !== ip) }))} />{ip}{!isGlobalIp(ip) && <span className="text-zinc-500">local only</span>}</label>)}</div>
        {state.mode === 'external' && <p className="mt-3 text-zinc-400">Only selected globally routable IPs are submitted externally. Non-public indicators remain local-only, not automatically safe.</p>}
      </details>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={disabled} className="rounded-lg border border-white/15 bg-white/10 px-5 py-2 text-sm font-medium hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40">{state.mode === 'local' ? 'Search Local' : 'Enrich Selected'}</button>
        {running && <button type="button" onClick={() => controller.current?.abort()} className="rounded-lg border border-white/15 px-4 py-2 text-sm">Cancel remaining work</button>}
        {!session && <button type="button" className="text-xs text-zinc-400 underline" onClick={() => setSessionAttempt(value => value + 1)}>Retry session permissions</button>}
        {state.mode === 'external' && !selectedEligible.length && <span className="text-xs text-zinc-400">Select at least one public IP to enrich.</span>}
      </div>
      {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
    </form>
    {snapshot && <section className="space-y-2 rounded-lg border border-white/10 p-4 text-xs" aria-label="Submitted snapshot">
      <p className="font-medium">Submitted snapshot — {snapshot.submission.mode === 'local' ? 'Local Lookup' : 'External Enrichment'} · {snapshot.submission.ips.length} IPs · {snapshot.submission.cachePolicy}</p>
      <details><summary>Submitted indicators</summary><pre className="max-h-32 overflow-auto whitespace-pre-wrap">{snapshot.submission.ips.join('\n')}</pre></details>
      {stale && <p role="status" className="text-amber-300">Input changed. Results below belong to the submitted snapshot, not current input. Selection cleared; submit again to refresh.</p>}
      {snapshot.submission.mode !== state.mode && <p className="text-amber-300">Results are from {snapshot.submission.mode === 'local' ? 'Local Lookup' : 'External Enrichment'}; switching modes does not send requests.</p>}
      {progress && (
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${progress.status === 'running' ? 'animate-pulse bg-indigo-400' : progress.status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="capitalize">{progress.status}</span>: {progress.completed} / {progress.total} indicators processed{progress.status === 'partial' ? ' — some results failed or remain unprocessed.' : ''}
            </span>
            <span className="font-semibold text-white">
              {Math.round(((progress.completed || 0) / (progress.total || 1)) * 100)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800 border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400 transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.round(((progress.completed || 0) / (progress.total || 1)) * 100))}%` }}
            />
          </div>
          <progress className="sr-only" max={progress.total || 1} value={progress.completed} aria-label="Investigation progress" />
        </div>
      )}
      {progress?.status === 'cancelled' && <p className="text-amber-300">Cancelled remaining work. Completed results are retained. In-flight external work may already have consumed quota or saved reputation; cancellation does not roll it back.</p>}
    </section>}
    <InvestigationResults results={progress?.results ?? []} selected={state.selected} onSelectionChange={selected => setState(previous => ({ ...previous, selected }))} disabled={running || stale} canExport={!!session?.permissions?.includes('export')} />
  </div>;
}
