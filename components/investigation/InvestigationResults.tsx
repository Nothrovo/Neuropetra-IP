'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import {
  exportInvestigationResults,
  investigationFreshness,
  isPersistenceWarning,
  type InvestigationResult,
} from './investigation-state';

export default function InvestigationResults({
  results,
  selected,
  onSelectionChange,
  disabled,
  canExport,
}: {
  results: InvestigationResult[];
  selected: string[];
  onSelectionChange: (selected: string[]) => void;
  disabled: boolean;
  canExport: boolean;
}) {
  const [format, setFormat] = useState<'csv' | 'alpha' | 'charlie'>('csv');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');

  const exportRows = scope === 'selected' ? results.filter(row => selected.includes(row.ip)) : results;
  const toggle = (ip: string) =>
    onSelectionChange(selected.includes(ip) ? selected.filter(value => value !== ip) : [...selected, ip]);

  const exportDisabled = disabled || !canExport || !exportRows.length;
  const content = () => exportInvestigationResults(exportRows, format);

  const renderVerdictBadge = (row: InvestigationResult) => {
    const verdict = row.verdict ?? 'Unknown';
    const score = row.compositeScore ?? row.abuseScore;

    if (verdict === 'Malicious') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Malicious ({score != null ? `${score}%` : 'Unknown'})</span>
          <span className="sr-only"> / {verdict}</span>
        </span>
      );
    }

    if (verdict === 'Suspicious') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Suspicious ({score != null ? `${score}%` : 'Unknown'})</span>
          <span className="sr-only"> / {verdict}</span>
        </span>
      );
    }

    if (verdict === 'Low risk') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Low risk ({score != null ? `${score}%` : '0%'})</span>
          <span className="sr-only"> / {verdict}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-xs font-medium text-zinc-400">
        <HelpCircle className="h-3.5 w-3.5 shrink-0" />
        <span>Unknown</span>
        <span className="sr-only"> / Unknown</span>
      </span>
    );
  };

  const renderStatusBadge = (row: InvestigationResult) => {
    if (row.found === false) {
      return <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400 border border-zinc-700">Local miss</span>;
    }
    if (row.status === 'enriched') {
      return <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-300 border border-indigo-500/30">enriched</span>;
    }
    if (row.status === 'cached') {
      return <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300 border border-sky-500/30">cached</span>;
    }
    if (row.found) {
      return <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300 border border-emerald-500/30">Local hit</span>;
    }
    return <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400">{row.status ?? 'Unknown'}</span>;
  };

  return (
    <section className="space-y-4" aria-label="Investigation results">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-white">Investigation Results</h2>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-mono text-zinc-300">
            {results.length} indicators
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-zinc-400">
            Format
            <select
              aria-label="Export format"
              value={format}
              onChange={e => setFormat(e.target.value as typeof format)}
              className="rounded-md border border-white/10 bg-[#141824] px-2.5 py-1.5 text-zinc-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="csv">CSV</option>
              <option value="alpha">Alpha IoC Markdown</option>
              <option value="charlie">Charlie IoC Markdown</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-zinc-400">
            Scope
            <select
              aria-label="Export scope"
              value={scope}
              onChange={e => setScope(e.target.value as typeof scope)}
              className="rounded-md border border-white/10 bg-[#141824] px-2.5 py-1.5 text-zinc-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All results</option>
              <option value="selected">Selected ({selected.length})</option>
            </select>
          </label>

          <button
            type="button"
            disabled={exportDisabled}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([content()], {
                  type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8',
                })
              );
              const link = document.createElement('a');
              link.href = url;
              link.download = `investigation-${format}.${format === 'csv' ? 'csv' : 'md'}`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download</span>
          </button>

          <button
            type="button"
            disabled={exportDisabled}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(content());
                setCopied(true);
                setNotice('Copied export to clipboard.');
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setNotice('Clipboard unavailable. Use Download instead.');
              }
            }}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-40"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {!canExport && <p className="text-xs text-amber-300">Export requires export permission.</p>}
      {notice && <p role="status" className="text-xs text-zinc-400">{notice}</p>}

      {/* Results Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0e111a] shadow-sm">
        <table className="w-full min-w-[1050px] text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.02] text-zinc-400">
            <tr>
              <th className="p-3.5">
                <input
                  type="checkbox"
                  aria-label="Select all results"
                  disabled={disabled || !results.length}
                  checked={results.length > 0 && results.every(row => selected.includes(row.ip))}
                  onChange={e => onSelectionChange(e.target.checked ? results.map(row => row.ip) : [])}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-500"
                />
              </th>
              <th scope="col" className="p-3.5 font-medium">IP / evidence</th>
              <th scope="col" className="p-3.5 font-medium">Status</th>
              <th scope="col" className="p-3.5 font-medium">Provider score</th>
              <th scope="col" className="p-3.5 font-medium">Local alerts</th>
              <th scope="col" className="p-3.5 font-medium">Composite / verdict</th>
              <th scope="col" className="p-3.5 font-medium">Country / ISP</th>
              <th scope="col" className="p-3.5 font-medium">Source / freshness</th>
              <th scope="col" className="p-3.5 font-medium">Persistence / error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {results.map(row => (
              <tr key={row.ip} className="transition hover:bg-white/[0.02]">
                <td className="p-3.5">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.ip}`}
                    checked={selected.includes(row.ip)}
                    disabled={disabled}
                    onChange={() => toggle(row.ip)}
                    className="rounded border-zinc-700 bg-zinc-900 text-indigo-500"
                  />
                </td>
                <td className="p-3.5 font-mono">
                  <Link
                    href={`/ip/${encodeURIComponent(row.ip)}`}
                    className="font-semibold text-indigo-400 hover:text-indigo-300 underline decoration-indigo-400/40 underline-offset-4"
                  >
                    {row.ip}
                  </Link>
                </td>
                <td className="p-3.5">{renderStatusBadge(row)}</td>
                <td className="p-3.5">
                  {row.abuseScore == null ? (
                    <span className="text-zinc-500">Unknown</span>
                  ) : (
                    <div>
                      <span
                        className={`font-mono font-bold ${
                          row.abuseScore >= 75
                            ? 'text-red-400'
                            : row.abuseScore >= 25
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {row.abuseScore}%
                      </span>
                      <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={`h-full ${
                            row.abuseScore >= 75
                              ? 'bg-red-500'
                              : row.abuseScore >= 25
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.max(4, row.abuseScore)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {row.vtMalicious != null && (
                    <div className="mt-0.5 text-[10px] text-zinc-500">Cached VT detections: {row.vtMalicious}</div>
                  )}
                </td>
                <td className="p-3.5 font-mono">
                  {row.totalAlertCount ?? 'Not loaded'}
                </td>
                <td className="p-3.5">
                  <div className="space-y-1">
                    {renderVerdictBadge(row)}
                    {row.scoreContext === 'reputation-only' && (
                      <div className="text-[10px] text-zinc-500">Reputation only</div>
                    )}
                  </div>
                </td>
                <td className="p-3.5">
                  <div className="font-medium text-zinc-200">{row.countryCode ?? 'Unknown'}</div>
                  <div className="max-w-48 truncate text-[11px] text-zinc-400" title={row.isp ?? undefined}>
                    {row.isp ?? 'Unknown'}
                  </div>
                </td>
                <td className="p-3.5">
                  <div className="text-zinc-300">{row.reputationSource ?? row.source ?? 'No reputation source'}</div>
                  <div className="text-[11px] text-zinc-400">{investigationFreshness(row)}</div>
                  {(row.checkedAt ?? row.reputationCheckedAt) && (
                    <time className="text-[10px] text-zinc-500">{row.checkedAt ?? row.reputationCheckedAt}</time>
                  )}
                </td>
                <td className="max-w-64 p-3.5 text-[11px]">
                  <span className={row.savedToDb ? 'text-emerald-400' : 'text-zinc-400'}>
                    {row.savedToDb === false ? 'Not saved' : row.savedToDb ? 'Saved' : 'Read only'}
                  </span>
                  {row.error && (
                    <div className="mt-1 text-amber-300">
                      {isPersistenceWarning(row) && 'Persistence warning: '}
                      {row.error}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!results.length && (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
          Submit indicators above to inspect local evidence or execute live reputation enrichment.
        </div>
      )}
    </section>
  );
}
