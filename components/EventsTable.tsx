'use client';

import React, { useState } from 'react';
import { IpIntelEventRow } from '@/lib/mock-data';
import { isCriticalOutcome } from '@/lib/scoring';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CheckCircle, HelpCircle, AlertCircle } from 'lucide-react';

export default function EventsTable({
  events,
  total,
  page,
  limit,
  onPageChange,
  onFilterChange,
  availableHosts = [],
}: {
  events: IpIntelEventRow[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (newPage: number) => void;
  onFilterChange: (filters: { alertType?: string; outcome?: string; targetHost?: string }) => void;
  availableHosts?: string[];
}) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedHost, setSelectedHost] = useState<string>('');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('');

  const totalPages = Math.ceil(total / limit) || 1;

  function handleFilter(type: string, host: string, outcome: string) {
    setSelectedType(type);
    setSelectedHost(host);
    setSelectedOutcome(outcome);
    onFilterChange({
      alertType: type || undefined,
      targetHost: host || undefined,
      outcome: outcome || undefined,
    });
  }

  function getOutcomeBadge(outcome?: string | null) {
    if (!outcome) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-400">
          <HelpCircle className="h-3 w-3" />
          <span>unspecified</span>
        </span>
      );
    }
    const clean = outcome.toLowerCase();
    if (isCriticalOutcome(clean)) {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-red-800/80 bg-red-950/60 px-2 py-0.5 text-[10px] font-mono font-bold text-red-300 uppercase">
          <AlertCircle className="h-3 w-3" />
          <span>{clean}</span>
        </span>
      );
    }
    if (['blocked', 'denied', 'dropped', 'filtered', '403'].some((s) => clean.includes(s))) {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-emerald-800/60 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
          <CheckCircle className="h-3 w-3" />
          <span>{clean}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 text-[10px] font-mono text-amber-400">
        <span>{clean}</span>
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4 font-sans">
      {/* Table Header and Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <span>Granular Incident Logs</span>
            <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-white/[0.08]">
              {total} Total Logs
            </span>
          </h3>
          <p className="text-[11px] text-zinc-400">
            Per-alert incident audit trail captured from Wazuh detection rules
          </p>
        </div>

        {/* Filter Selects */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Alert Type filter */}
          <select
            value={selectedType}
            onChange={(e) => handleFilter(e.target.value, selectedHost, selectedOutcome)}
            className="rounded-md border border-white/[0.08] bg-[#141824] px-2.5 py-1 text-xs text-zinc-200 focus:border-white/[0.25] focus:outline-none"
          >
            <option value="">All Alert Types</option>
            <option value="attack">attack</option>
            <option value="system">system</option>
          </select>

          {/* Target Host filter */}
          {availableHosts.length > 0 && (
            <select
              value={selectedHost}
              onChange={(e) => handleFilter(selectedType, e.target.value, selectedOutcome)}
              className="rounded-md border border-white/[0.08] bg-[#141824] px-2.5 py-1 text-xs text-zinc-200 focus:border-white/[0.25] focus:outline-none"
            >
              <option value="">All Target Hosts</option>
              {availableHosts.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          )}

          {/* Outcome filter */}
          <select
            value={selectedOutcome}
            onChange={(e) => handleFilter(selectedType, selectedHost, e.target.value)}
            className="rounded-md border border-white/[0.08] bg-[#141824] px-2.5 py-1 text-xs text-zinc-200 focus:border-white/[0.25] focus:outline-none"
          >
            <option value="">All Outcomes</option>
            <option value="blocked">blocked</option>
            <option value="failed">failed</option>
            <option value="success">success</option>
          </select>
        </div>
      </div>

      {/* Events Table */}
      {events.length === 0 ? (
        <div className="py-12 text-center text-xs text-zinc-500 font-sans">
          No alert events found matching the active criteria.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] font-medium text-zinc-400 font-sans">
                <th className="pb-2 pl-2">Time (WIB/UTC)</th>
                <th className="pb-2">Classification</th>
                <th className="pb-2">MITRE</th>
                <th className="pb-2">Target Host</th>
                <th className="pb-2">Endpoint</th>
                <th className="pb-2">Outcome</th>
                <th className="pb-2 pr-2 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] font-mono">
              {events.map((ev) => {
                const isExpanded = expandedRow === ev.id;
                return (
                  <React.Fragment key={ev.id}>
                    <tr
                      className={`hover:bg-white/[0.03] transition cursor-pointer ${
                        isExpanded ? 'bg-white/[0.04]' : ''
                      }`}
                      onClick={() => setExpandedRow(isExpanded ? null : ev.id)}
                    >
                      <td className="py-2.5 pl-2 text-zinc-300 whitespace-nowrap text-[11px] font-tabular">
                        {new Date(ev.seen_at).toLocaleString('id-ID', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-col">
                          <span className="text-zinc-200 font-semibold">{ev.alert_type || 'N/A'}</span>
                          <span className="text-[10px] text-zinc-500 font-sans">
                            {ev.attack_subtype || 'general'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {ev.mitre && ev.mitre.length > 0 ? (
                            ev.mitre.map((m) => (
                              <span
                                key={m}
                                className="rounded bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.2 text-[10px] font-mono text-amber-300/90"
                              >
                                {m}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-zinc-600">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 text-zinc-300 font-sans text-xs">
                        {ev.target_host || 'Unknown'}
                      </td>
                      <td className="py-2.5 max-w-[200px] truncate text-zinc-400 text-[11px]" title={ev.endpoint || ''}>
                        {ev.endpoint || '/'}
                      </td>
                      <td className="py-2.5">{getOutcomeBadge(ev.outcome)}</td>
                      <td className="py-2.5 pr-2 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedRow(isExpanded ? null : ev.id);
                          }}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable row with plain text raw_summary */}
                    {isExpanded && (
                      <tr className="bg-[#090a0f]">
                        <td colSpan={7} className="p-3">
                          <div className="rounded-lg border border-white/[0.08] bg-[#141824] p-3 space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-sans font-semibold text-zinc-400">
                              <span>Raw Alert Summary & Forensic Evidence</span>
                              <span className="text-[10px] font-mono text-zinc-500">Event ID #{ev.id}</span>
                            </div>
                            {/* Strictly plain text rendering - NO innerHTML */}
                            <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-300 max-h-48 overflow-y-auto leading-relaxed select-text bg-[#090a0f] p-2.5 rounded border border-white/[0.05]">
                              {ev.raw_summary || 'No raw summary log attached for this alert event.'}
                            </pre>
                            {ev.endpoint && (
                              <div className="text-[10px] text-zinc-400 font-sans">
                                <span className="font-semibold text-zinc-300">Targeted Resource / URL:</span>{' '}
                                <code className="text-zinc-200 font-mono">{ev.endpoint}</code>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-xs text-zinc-400 font-sans">
        <span>
          Showing page {page} of {totalPages} ({total} events)
        </span>
        <div className="flex items-center gap-1 font-mono">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded border border-white/[0.08] bg-[#141824] px-2.5 py-1 text-zinc-300 hover:bg-white/[0.06] disabled:opacity-30 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Prev</span>
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 rounded border border-white/[0.08] bg-[#141824] px-2.5 py-1 text-zinc-300 hover:bg-white/[0.06] disabled:opacity-30 transition"
          >
            <span>Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
