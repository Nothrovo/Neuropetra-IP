'use client';

import React, { useState, useMemo, use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  ArrowLeft,
  ShieldAlert,
  Globe2,
  Activity,
  FileDown,
  Copy,
  Check,
  ExternalLink,
  Search,
  Server,
  Layers,
  Calendar,
  AlertTriangle,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import DefangButton from '@/components/DefangButton';

type SortOption = 'score_desc' | 'score_asc' | 'alerts_desc' | 'ip_asc' | 'last_seen_desc';

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
    return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
  }
  return 0;
}

export default function ProviderDetailPage(props: { params: Promise<{ name: string }> }) {
  const params = use(props.params);
  const providerName = decodeURIComponent(params.name || '');

  const [copied, setCopied] = useState(false);
  const [ipFilter, setIpFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('score_desc');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['provider-detail', providerName],
    queryFn: async () => {
      const res = await fetch(`/api/providers/${encodeURIComponent(providerName)}`);
      if (!res.ok) throw new Error('Failed to load provider details');
      return res.json();
    },
  });

  const provider = data?.provider;
  const attackTypes = data?.attackTypes || [];
  const targetHosts = data?.targetHosts || [];
  const rawIps = data?.ips || [];

  // Filter and sort IPs
  const processedIps = useMemo(() => {
    let list = rawIps.filter((item: any) => {
      if (!ipFilter) return true;
      const term = ipFilter.toLowerCase();
      return (
        item.ip.toLowerCase().includes(term) ||
        (item.attack_types && item.attack_types.some((t: string) => t.toLowerCase().includes(term)))
      );
    });

    return list.sort((a: any, b: any) => {
      switch (sortBy) {
        case 'score_desc':
          return (b.abuse_score ?? 0) - (a.abuse_score ?? 0);
        case 'score_asc':
          return (a.abuse_score ?? 0) - (b.abuse_score ?? 0);
        case 'alerts_desc':
          return (b.total_alert_count || 1) - (a.total_alert_count || 1);
        case 'ip_asc':
          return ipToNumber(a.ip) - ipToNumber(b.ip);
        case 'last_seen_desc':
          return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
        default:
          return 0;
      }
    });
  }, [rawIps, ipFilter, sortBy]);

  async function handleCopyAllIps() {
    if (!rawIps.length) return;
    const text = rawIps.map((i: any) => i.ip).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  }

  function getScoreBadge(score: number | null) {
    const val = score ?? 0;
    if (val >= 75) {
      return (
        <span className="rounded bg-red-950/40 px-2 py-0.5 text-xs font-mono font-bold text-red-400 border border-red-800/60 font-tabular">
          {val}%
        </span>
      );
    }
    if (val >= 40) {
      return (
        <span className="rounded bg-amber-950/40 px-2 py-0.5 text-xs font-mono font-bold text-amber-400 border border-amber-800/60 font-tabular">
          {val}%
        </span>
      );
    }
    return (
      <span className="rounded bg-emerald-950/40 px-2 py-0.5 text-xs font-mono font-bold text-emerald-400 border border-emerald-800/60 font-tabular">
        {val}%
      </span>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 flex flex-col items-center justify-center space-y-3 font-mono text-xs text-zinc-500">
        <Activity className="h-6 w-6 text-zinc-400 animate-spin" />
        <span>Correlating provider telemetry & historical indicators...</span>
      </div>
    );
  }

  if (isError || !provider) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 space-y-4 font-sans">
        <Link
          href="/providers"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Providers Directory
        </Link>
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-8 text-center text-red-400 space-y-3">
          <AlertTriangle className="h-8 w-8 mx-auto text-red-400" />
          <h2 className="text-base font-bold">Provider Not Found</h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            No indicators currently mapped to network provider &quot;{providerName}&quot;.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Navigation & Metadata Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
        <Link
          href="/providers"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Provider Directory</span>
        </Link>
        <span className="text-xs font-mono text-zinc-500">
          Last Active: {new Date(provider.last_seen).toLocaleDateString('id-ID')}
        </span>
      </div>

      {/* Provider Dossier Header */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-6 space-y-5 shadow-lg font-sans">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-white/[0.06] px-2 py-0.5 text-xs font-mono font-medium text-zinc-300 border border-white/[0.08] flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-zinc-400" /> ASN & ISP ATTRIBUTION
              </span>
              {provider.countries?.map((c: string) => (
                <span
                  key={c}
                  className="rounded bg-[#141824] px-2 py-0.5 text-xs font-mono text-zinc-300 border border-white/[0.08]"
                >
                  {c}
                </span>
              ))}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">
              {provider.isp}
            </h1>

            {provider.asns?.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-mono text-zinc-500">Autonomous Systems:</span>
                {provider.asns.map((asn: string) => (
                  <span
                    key={asn}
                    className="rounded bg-[#141824] px-2 py-0.5 text-xs font-mono text-zinc-300 border border-white/[0.06]"
                  >
                    {asn}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions Bar */}
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <button
              onClick={handleCopyAllIps}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141824] px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.06] transition"
              title="Copy all IPs for firewall rule creation"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
              <span>{copied ? 'Copied' : `Copy All (${rawIps.length})`}</span>
            </button>

            {/* Blocklist Export Downloads */}
            <div className="inline-flex rounded-lg border border-white/[0.08] bg-[#141824] p-0.5 text-xs">
              <a
                href={`/api/providers/${encodeURIComponent(provider.isp)}/export?format=cdb`}
                download
                className="px-2.5 py-1.5 text-zinc-300 hover:text-white hover:bg-white/[0.06] rounded transition flex items-center gap-1"
                title="Download Wazuh CDB-list format"
              >
                <FileDown className="h-3 w-3" /> Wazuh CDB
              </a>
              <a
                href={`/api/providers/${encodeURIComponent(provider.isp)}/export?format=csv`}
                download
                className="px-2.5 py-1.5 text-zinc-300 hover:text-white hover:bg-white/[0.06] rounded transition"
              >
                CSV
              </a>
              <a
                href={`/api/providers/${encodeURIComponent(provider.isp)}/export?format=txt`}
                download
                className="px-2.5 py-1.5 text-zinc-300 hover:text-white hover:bg-white/[0.06] rounded transition"
              >
                TXT
              </a>
            </div>
          </div>
        </div>

        {/* Aggregate KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/[0.06] font-mono">
          <div className="rounded-lg bg-[#141824] p-3 space-y-0.5 border border-white/[0.04]">
            <span className="text-[10px] uppercase font-sans text-zinc-400 block">Observed IPs</span>
            <p className="text-xl font-bold text-zinc-100 font-tabular">{provider.ip_count}</p>
          </div>

          <div className="rounded-lg bg-[#141824] p-3 space-y-0.5 border border-white/[0.04]">
            <span className="text-[10px] uppercase font-sans text-zinc-400 block">Cumulative Alerts</span>
            <p className="text-xl font-bold text-zinc-100 font-tabular">{provider.total_alerts}</p>
          </div>

          <div className="rounded-lg bg-[#141824] p-3 space-y-0.5 border border-white/[0.04]">
            <span className="text-[10px] uppercase font-sans text-zinc-400 block">Avg Abuse Confidence</span>
            <p className="text-xl font-bold text-amber-400 font-tabular">{provider.avg_abuse_score}%</p>
          </div>

          <div className="rounded-lg bg-[#141824] p-3 space-y-0.5 border border-white/[0.04]">
            <span className="text-[10px] uppercase font-sans text-zinc-400 block">Peak Threat Score</span>
            <p className="text-xl font-bold text-red-400 font-tabular">{provider.max_abuse_score}%</p>
          </div>
        </div>
      </div>

      {/* Two-Column Telemetry: Attack Vectors & Targeted Assets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Attack Vectors */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4 font-sans">
          <div className="border-b border-white/[0.06] pb-3">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <span>Attack Vectors From This Provider</span>
            </h3>
            <p className="text-[11px] text-zinc-400">Tactics and exploit techniques originating from this network</p>
          </div>

          {attackTypes.length === 0 ? (
            <p className="text-xs text-zinc-500 font-mono py-4">No specific exploit categories identified yet.</p>
          ) : (
            <div className="space-y-2.5">
              {attackTypes.map((item: any) => {
                const max = attackTypes[0]?.count || 1;
                const pct = Math.round((item.count / max) * 100);
                return (
                  <div key={item.type} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-zinc-300 font-sans">{item.type}</span>
                      <span className="text-zinc-200 font-tabular font-medium">{item.count} IPs</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Targeted Hosts */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4 font-sans">
          <div className="border-b border-white/[0.06] pb-3">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Server className="h-4 w-4 text-zinc-400" />
              <span>Targeted Internal Assets</span>
            </h3>
            <p className="text-[11px] text-zinc-400">Local machines & endpoints probed by this ISP</p>
          </div>

          {targetHosts.length === 0 ? (
            <p className="text-xs text-zinc-500 font-mono py-4">No internal host telemetry recorded.</p>
          ) : (
            <div className="space-y-2 font-mono">
              {targetHosts.map((h: any) => (
                <div
                  key={h.host}
                  className="flex items-center justify-between rounded-lg bg-[#141824] p-2.5 text-xs border border-white/[0.06]"
                >
                  <span className="text-zinc-200 font-semibold">{h.host}</span>
                  <span className="text-zinc-400 font-tabular text-[11px]">{h.count} IPs targeting</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Complete IP Roster Table with Multi-Attribute Sorting */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4 font-sans">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Layers className="h-4 w-4 text-zinc-400" />
              <span>Attributed Threat Indicators</span>
              <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-white/[0.08]">
                {processedIps.length} of {rawIps.length} IPs
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              IP addresses actively monitored in PostgreSQL belonging to {provider.isp}
            </p>
          </div>

          {/* Controls: Filter + Sort */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-zinc-500 font-sans flex items-center gap-1 text-[11px]">
                <ArrowUpDown className="h-3 w-3" /> Sort:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-md border border-white/[0.08] bg-[#141824] px-2.5 py-1 text-xs text-zinc-200 focus:border-white/[0.25] focus:outline-none"
              >
                <option value="score_desc">Malicious Score (High → Low)</option>
                <option value="score_asc">Malicious Score (Low → High)</option>
                <option value="alerts_desc">Alert Volume (Highest)</option>
                <option value="ip_asc">IP Address / Octet Range</option>
                <option value="last_seen_desc">Last Observed Date</option>
              </select>
            </div>

            {/* Quick Text Filter */}
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={ipFilter}
                onChange={(e) => setIpFilter(e.target.value)}
                placeholder="Filter IP or attack type..."
                className="w-full rounded-md border border-white/[0.08] bg-[#141824] py-1 pl-8 pr-3 font-mono text-xs text-zinc-200 placeholder-zinc-500 focus:border-white/[0.25] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* IP Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.08] text-zinc-400 uppercase text-[10px] tracking-wider font-sans">
                <th className="py-2.5 px-3">IP Address</th>
                <th className="py-2.5 px-3">Abuse Score</th>
                <th className="py-2.5 px-3">VirusTotal</th>
                <th className="py-2.5 px-3">Alerts</th>
                <th className="py-2.5 px-3">Attack Categories</th>
                <th className="py-2.5 px-3">Last Seen</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-zinc-300">
              {processedIps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500 font-sans">
                    No IP addresses found matching active filter.
                  </td>
                </tr>
              ) : (
                processedIps.map((row: any) => (
                  <tr key={row.ip} className="hover:bg-white/[0.03] transition">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/ip/${encodeURIComponent(row.ip)}`}
                          className="font-bold text-zinc-200 hover:text-white hover:underline"
                        >
                          {row.ip}
                        </Link>
                        <DefangButton ip={row.ip} />
                      </div>
                    </td>
                    <td className="py-3 px-3">{getScoreBadge(row.abuse_score)}</td>
                    <td className="py-3 px-3">
                      {row.vt_malicious !== null ? (
                        <span
                          className={`font-tabular font-medium ${
                            row.vt_malicious >= 5 ? 'text-red-400' : 'text-zinc-400'
                          }`}
                        >
                          {row.vt_malicious} / 70
                        </span>
                      ) : (
                        <span className="text-zinc-600">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-medium text-zinc-200 font-tabular">
                      {row.total_alert_count || 1}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {row.attack_types?.slice(0, 2).map((t: string) => (
                          <span
                            key={t}
                            className="rounded bg-[#141824] px-1.5 py-0.2 text-[10px] text-zinc-300 border border-white/[0.06]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-zinc-400 text-[11px] font-tabular">
                      {new Date(row.last_seen).toLocaleDateString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/ip/${encodeURIComponent(row.ip)}`}
                        className="inline-flex items-center gap-1 text-zinc-400 hover:text-white transition text-[11px]"
                      >
                        <span>Investigate</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
