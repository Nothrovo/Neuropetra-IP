'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Sliders, Database } from 'lucide-react';
import DefangButton from '@/components/DefangButton';

export default function BlocklistPage() {
  const [minScore, setMinScore] = useState(75);
  const [minAlerts, setMinAlerts] = useState(0);
  const [days, setDays] = useState(30);

  // Fetch blocklist preview
  const { data: previewData } = useQuery({
    queryKey: ['blocklist-preview', minScore, minAlerts, days],
    queryFn: async () => {
      const res = await fetch(
        `/api/blocklist?format=csv&min_score=${minScore}&min_alerts=${minAlerts}&days=${days}&include_reputation=true`
      );
      if (!res.ok) throw new Error('Failed to load blocklist preview');
      const text = await res.text();
      const lines = text.trim().split('\n');
      const rows = lines.slice(1).map((line) => {
        const parts = line.split(',');
        return {
          ip: parts[0]?.replace(/"/g, ''),
          score: parts[1],
          alerts: parts[2],
          country: parts[3]?.replace(/"/g, ''),
          primaryAttack: parts[4]?.replace(/"/g, ''),
        };
      }).filter((r) => r.ip);
      return rows;
    },
  });

  const matchingRows = previewData || [];

  function getDownloadUrl(format: 'txt' | 'csv' | 'cdb') {
    return `/api/blocklist?format=${format}&min_score=${minScore}&min_alerts=${minAlerts}&days=${days}&include_reputation=true`;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              Dynamic SOC Threat Feeds & Blocklist Export
            </h1>
            <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-white/[0.08]">
              Automated Feed
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Filter and generate real-time threat intelligence feeds for firewalls, edge proxies, and Wazuh CDB-lists
          </p>
        </div>
      </div>

      {/* Filter and Download Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Filter Sliders & Options (5 cols) */}
        <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-5">
          <div className="border-b border-white/[0.06] pb-3">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-zinc-400" />
              <span>Feed Generation Criteria</span>
            </h2>
            <p className="text-[11px] text-zinc-400">Tune confidence and alert volume thresholds</p>
          </div>

          <div className="space-y-4 text-xs font-sans">
            {/* Min Abuse Score */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-mono">
                <label className="text-zinc-300 font-medium font-sans">Minimum Threat Score:</label>
                <span className="text-red-400 font-bold font-tabular">&ge; {minScore}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={minScore}
                onChange={(e) => setMinScore(parseInt(e.target.value, 10))}
                className="w-full accent-white"
              />
              <span className="text-[10px] text-zinc-500 block">
                75+ recommended for high-confidence active malicious actors.
              </span>
            </div>

            {/* Min Alert Count */}
            <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
              <div className="flex justify-between font-mono">
                <label className="text-zinc-300 font-medium font-sans">Minimum Alert Count:</label>
                <span className="text-zinc-200 font-bold font-tabular">
                  {minAlerts === 0 ? '0 (All Threat Intel)' : `≥ ${minAlerts} alerts`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={minAlerts}
                onChange={(e) => setMinAlerts(parseInt(e.target.value, 10))}
                className="w-full accent-white"
              />
              <span className="text-[10px] text-zinc-500 block">
                0 includes both pure external threat reputation and local observed alerts.
              </span>
            </div>

            {/* Active Within Days */}
            <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
              <div className="flex justify-between font-mono">
                <label className="text-zinc-300 font-medium font-sans">Active Window:</label>
                <span className="text-zinc-200 font-bold">Past {days} Days</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[7, 14, 30, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className={`rounded py-1 text-xs font-mono font-medium border transition ${
                      days === d
                        ? 'bg-white/[0.12] text-white border-white/[0.2]'
                        : 'border-white/[0.06] bg-[#141824] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Download Buttons Card (7 cols) */}
        <div className="lg:col-span-7 rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Database className="h-4 w-4 text-zinc-400" />
                  <span>Export Formats</span>
                </h2>
                <p className="text-[11px] text-zinc-400">Download formatted feeds for security controls</p>
              </div>
              <div className="rounded bg-white/[0.06] px-2 py-0.5 text-xs font-mono text-zinc-200 border border-white/[0.08]">
                {matchingRows.length} Qualified
              </div>
            </div>

            {/* Download Action Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
              {/* Wazuh CDB */}
              <a
                href={getDownloadUrl('cdb')}
                download="wazuh_blocklist.cdb"
                className="rounded-lg border border-white/[0.08] bg-[#141824] p-3 hover:border-white/[0.18] transition flex flex-col justify-between group space-y-2"
              >
                <div className="space-y-1">
                  <span className="text-xs font-bold text-zinc-200 uppercase font-mono block">
                    Wazuh CDB-List
                  </span>
                  <p className="text-[10px] text-zinc-400 font-sans">
                    Formatted as <code className="text-zinc-200 font-mono">ip:desc</code> for Wazuh ruleset lists
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 text-xs text-zinc-300 group-hover:text-white font-medium pt-1">
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .cdb</span>
                </div>
              </a>

              {/* Plain Text IP list */}
              <a
                href={getDownloadUrl('txt')}
                download="ip_blocklist.txt"
                className="rounded-lg border border-white/[0.08] bg-[#141824] p-3 hover:border-white/[0.18] transition flex flex-col justify-between group space-y-2"
              >
                <div className="space-y-1">
                  <span className="text-xs font-bold text-zinc-200 uppercase font-mono block">
                    Plain Text (TXT)
                  </span>
                  <p className="text-[10px] text-zinc-400 font-sans">
                    One IP per line, ready for iptables, pfSense, or Fortigate
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 text-xs text-zinc-300 group-hover:text-white font-medium pt-1">
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .txt</span>
                </div>
              </a>

              {/* CSV Spreadsheet */}
              <a
                href={getDownloadUrl('csv')}
                download="ip_intel_blocklist.csv"
                className="rounded-lg border border-white/[0.08] bg-[#141824] p-3 hover:border-white/[0.18] transition flex flex-col justify-between group space-y-2"
              >
                <div className="space-y-1">
                  <span className="text-xs font-bold text-zinc-200 uppercase font-mono block">
                    CSV Spreadsheet
                  </span>
                  <p className="text-[10px] text-zinc-400 font-sans">
                    Full columns: IP, score, alert count, country, attack type
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 text-xs text-zinc-300 group-hover:text-white font-medium pt-1">
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .csv</span>
                </div>
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-[#141824] p-2.5 text-[11px] text-zinc-400 font-mono">
            Feed URL: <code className="text-zinc-200">{getDownloadUrl('cdb')}</code>
          </div>
        </div>
      </div>

      {/* Live Preview Table */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <span>Matching Indicators Preview</span>
              <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-white/[0.08]">
                {matchingRows.length} IPs Qualified
              </span>
            </h2>
            <p className="text-[11px] text-zinc-400">Sample of indicators meeting export thresholds</p>
          </div>
        </div>

        {matchingRows.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500 font-mono">
            No indicators in PostgreSQL match the selected threshold criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-[11px] font-medium text-zinc-400">
                  <th className="pb-2">IP Address</th>
                  <th className="pb-2">Threat Score</th>
                  <th className="pb-2">Alert Count</th>
                  <th className="pb-2">Country</th>
                  <th className="pb-2">Primary Attack Vector</th>
                  <th className="pb-2 pr-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] font-mono">
                {matchingRows.slice(0, 20).map((row) => (
                  <tr key={row.ip} className="hover:bg-white/[0.03] transition">
                    <td className="py-2.5 font-bold text-zinc-200">{row.ip}</td>
                    <td className="py-2.5 text-red-400 font-bold font-tabular">{row.score}%</td>
                    <td className="py-2.5 text-zinc-200 font-tabular">{row.alerts}</td>
                    <td className="py-2.5 text-zinc-300">{row.country}</td>
                    <td className="py-2.5 font-sans text-zinc-400 text-[11px]">
                      {row.primaryAttack || 'unspecified'}
                    </td>
                    <td className="py-2.5 pr-2 text-right">
                      <DefangButton ip={row.ip} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
