'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { exportInvestigationResults, investigationFreshness, isPersistenceWarning, type InvestigationResult } from './investigation-state';

export default function InvestigationResults({ results, selected, onSelectionChange, disabled, canExport }: {
  results: InvestigationResult[]; selected: string[]; onSelectionChange: (selected: string[]) => void; disabled: boolean; canExport: boolean;
}) {
  const [format, setFormat] = useState<'csv' | 'alpha' | 'charlie'>('csv');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [notice, setNotice] = useState('');
  const exportRows = scope === 'selected' ? results.filter(row => selected.includes(row.ip)) : results;
  const toggle = (ip: string) => onSelectionChange(selected.includes(ip) ? selected.filter(value => value !== ip) : [...selected, ip]);
  const exportDisabled = disabled || !canExport || !exportRows.length;
  const content = () => exportInvestigationResults(exportRows, format);
  return <section className="space-y-4" aria-label="Investigation results">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Results ({results.length})</h2>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label>Export format <select aria-label="Export format" value={format} onChange={e => setFormat(e.target.value as typeof format)} className="rounded border border-white/15 bg-[#141824] p-2"><option value="csv">CSV</option><option value="alpha">Alpha IoC Markdown</option><option value="charlie">Charlie IoC Markdown</option></select></label>
        <label>Scope <select aria-label="Export scope" value={scope} onChange={e => setScope(e.target.value as typeof scope)} className="rounded border border-white/15 bg-[#141824] p-2"><option value="all">All results</option><option value="selected">Selected results</option></select></label>
        <button type="button" disabled={exportDisabled} className="rounded border border-white/15 p-2 disabled:opacity-40" onClick={() => {
          const url = URL.createObjectURL(new Blob([content()], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8' }));
          const link = document.createElement('a'); link.href = url; link.download = `investigation-${format}.${format === 'csv' ? 'csv' : 'md'}`;
          link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Download</button>
        <button type="button" disabled={exportDisabled} className="rounded border border-white/15 p-2 disabled:opacity-40" onClick={async () => {
          try { await navigator.clipboard.writeText(content()); setNotice('Copied export to clipboard.'); }
          catch { setNotice('Clipboard unavailable. Use Download instead.'); }
        }}>Copy</button>
      </div>
    </div>
    {!canExport && <p className="text-xs text-amber-300">Export requires export permission.</p>}
    {notice && <p role="status" className="text-xs text-zinc-300">{notice}</p>}
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full min-w-[1000px] text-left text-xs">
        <thead className="bg-white/5 text-zinc-400"><tr>
          <th className="p-3"><input type="checkbox" aria-label="Select all results" disabled={disabled || !results.length} checked={results.length > 0 && results.every(row => selected.includes(row.ip))} onChange={e => onSelectionChange(e.target.checked ? results.map(row => row.ip) : [])} /></th>
          {['IP / evidence', 'Status', 'Provider score', 'Local alerts', 'Composite / verdict', 'Country / ISP', 'Source / freshness', 'Persistence / error'].map(label => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-white/5">{results.map(row => <tr key={row.ip}>
          <td className="p-3"><input type="checkbox" aria-label={`Select ${row.ip}`} checked={selected.includes(row.ip)} disabled={disabled} onChange={() => toggle(row.ip)} /></td>
          <td className="p-3 font-mono"><Link href={`/ip/${encodeURIComponent(row.ip)}`} className="text-sky-300 underline decoration-sky-300/40 underline-offset-4">{row.ip}</Link></td>
          <td className="p-3">{row.found === false ? 'Local miss' : row.status ?? (row.found ? 'Local hit' : 'Unknown')}</td>
          <td className="p-3">{row.abuseScore == null ? 'Unknown' : `${row.abuseScore}%`}{row.vtMalicious != null && <div className="text-zinc-500">Cached VT detections: {row.vtMalicious}</div>}</td>
          <td className="p-3">{row.totalAlertCount ?? 'Not loaded'}</td>
          <td className="p-3">{row.compositeScore ?? 'Unknown'} / {row.verdict ?? 'Unknown'}{row.scoreContext === 'reputation-only' && <div className="text-zinc-500">Reputation only</div>}</td>
          <td className="p-3">{row.countryCode ?? 'Unknown'}<div className="max-w-48 break-words text-zinc-400">{row.isp ?? 'Unknown'}</div></td>
          <td className="p-3">{row.reputationSource ?? row.source ?? 'No reputation source'}<div className="text-zinc-400">{investigationFreshness(row)}</div>{(row.checkedAt ?? row.reputationCheckedAt) && <time className="text-zinc-500">{row.checkedAt ?? row.reputationCheckedAt}</time>}</td>
          <td className="max-w-64 break-words p-3">{row.savedToDb === false ? 'Not saved' : row.savedToDb ? 'Saved' : 'Read only'}{row.error && <div className="text-amber-300">{isPersistenceWarning(row) && 'Persistence warning: '}{row.error}</div>}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!results.length && <p className="text-sm text-zinc-500">Submit indicators to inspect local evidence or explicit enrichment outcomes.</p>}
  </section>;
}
