'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ShieldAlert,
  Server,
  Activity,
  ArrowRight,
  TrendingUp,
  Globe2,
  Clock,
  Layers,
  ChevronRight,
  Building2,
  Shield,
  FileDown,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import DefangButton from '@/components/DefangButton';
import { validateIpOrCidr } from '@/lib/ip-validator';

export default function HomePage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchMode, setSearchMode] = useState<'auto' | 'ip' | 'provider'>('auto');

  const { data, isLoading } = useQuery({
    queryKey: ['soc-stats'],
    queryFn: async () => {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed to load SOC statistics');
      return res.json();
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const clean = searchInput.trim();
    if (!clean) return;

    if (searchMode === 'provider') {
      router.push(`/providers?q=${encodeURIComponent(clean)}`);
      return;
    }

    if (searchMode === 'ip') {
      router.push(`/ip/${encodeURIComponent(clean)}`);
      return;
    }

    // Auto-detect mode
    const v = validateIpOrCidr(clean);
    if (v.valid) {
      router.push(`/ip/${encodeURIComponent(clean)}`);
    } else {
      router.push(`/providers?q=${encodeURIComponent(clean)}`);
    }
  }

  const stats = data?.stats;
  const topAttackers = data?.topAttackers || [];
  const recentEvents = data?.recentEvents || [];

  const placeholderText =
    searchMode === 'provider'
      ? 'Search network provider or ASN (e.g. Hostkey, DigitalOcean, AS208294)...'
      : searchMode === 'ip'
      ? 'Enter IP address or CIDR block (e.g. 185.220.101.5, 192.168.1.0/24)...'
      : 'Search IP, CIDR, or Provider (e.g. 185.220.101.5, Tor, AS208294)...';

  // Calculate malicious percentage
  const totalTracked = stats?.ipsTracked || 0;
  const maliciousCount = stats?.maliciousCount || 0;
  const malPct = totalTracked > 0 ? Math.round((maliciousCount / totalTracked) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Bar: Operational Status & Metrics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Threat Triage & Incident Telemetry
            </h1>
            <span className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-400 border border-white/[0.08]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live Telemetry
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time correlation against PostgreSQL incident logs, AbuseIPDB confidence, and MITRE ATT&CK vectors.
          </p>
        </div>

        {/* Compact Quick Stats Ribbon */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="rounded-lg border border-white/[0.08] bg-[#0e111a] px-3 py-1.5">
            <span className="text-[10px] text-zinc-500 uppercase block font-sans">Tracked IPs</span>
            <span className="text-sm font-semibold text-zinc-200 font-tabular">
              {isLoading ? '...' : totalTracked.toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg border border-red-950/60 bg-red-950/20 px-3 py-1.5">
            <span className="text-[10px] text-red-400 uppercase block font-sans">Malicious Ratio</span>
            <span className="text-sm font-semibold text-red-400 font-tabular">
              {isLoading ? '...' : `${maliciousCount.toLocaleString()} (${malPct}%)`}
            </span>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0e111a] px-3 py-1.5">
            <span className="text-[10px] text-zinc-500 uppercase block font-sans">24h Events</span>
            <span className="text-sm font-semibold text-zinc-200 font-tabular">
              {isLoading ? '...' : stats?.events24h?.toLocaleString() || '0'}
            </span>
          </div>
        </div>
      </div>

      {/* Investigation Omnibar (Actionable, Keyboard-friendly) */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-4 space-y-3 shadow-lg">
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            {/* Mode Switcher */}
            <div className="inline-flex rounded-lg border border-white/[0.08] bg-[#141824] p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setSearchMode('auto')}
                className={`rounded-md px-3 py-1 transition ${
                  searchMode === 'auto'
                    ? 'bg-white/[0.12] text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Auto Detect
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('ip')}
                className={`rounded-md px-3 py-1 transition font-mono ${
                  searchMode === 'ip'
                    ? 'bg-white/[0.12] text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                IP / CIDR
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('provider')}
                className={`rounded-md px-3 py-1 transition flex items-center gap-1 ${
                  searchMode === 'provider'
                    ? 'bg-white/[0.12] text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Building2 className="h-3 w-3" />
                Provider / ASN
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 text-xs">
              <Link
                href="/enrich"
                className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded border border-white/[0.08] bg-[#141824] hover:bg-white/[0.04] transition"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400/90" />
                <span>Batch Investigation</span>
              </Link>
              <Link
                href="/blocklist"
                className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded border border-white/[0.08] bg-[#141824] hover:bg-white/[0.04] transition"
              >
                <FileDown className="h-3.5 w-3.5 text-zinc-400" />
                <span>Export Blocklist</span>
              </Link>
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setSearchError('');
              }}
              placeholder={placeholderText}
              className="w-full rounded-lg border border-white/[0.12] bg-[#141824] py-3 pl-10 pr-24 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-white/[0.3] focus:outline-none focus:ring-1 focus:ring-white/[0.2] transition"
            />
            <button
              type="submit"
              className="absolute right-1.5 rounded-md bg-white/[0.12] hover:bg-white/[0.18] text-white px-4 py-2 text-xs font-semibold border border-white/[0.12] transition"
            >
              Investigate
            </button>
          </div>
          {searchError && (
            <p className="text-xs text-red-400 font-mono">{searchError}</p>
          )}

          {/* Suggested Fast Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-zinc-400">
            <div className="flex flex-wrap items-center gap-1.5 font-mono">
              <span className="text-zinc-500 font-sans">Recent queries:</span>
              {['185.220.101.5', '45.154.255.89', '194.26.29.112', '103.145.22.40'].map((ip) => (
                <button
                  key={ip}
                  type="button"
                  onClick={() => router.push(`/ip/${ip}`)}
                  className="rounded border border-white/[0.08] bg-[#141824] px-2 py-0.5 text-zinc-300 hover:text-white hover:border-white/[0.2] transition"
                >
                  {ip}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-zinc-500">Popular providers:</span>
              {['Tor Exit Nodes', 'Hostkey', 'Serverius', 'Telkomsel'].map((prov) => (
                <button
                  key={prov}
                  type="button"
                  onClick={() => router.push(`/providers?q=${encodeURIComponent(prov)}`)}
                  className="rounded border border-white/[0.08] bg-[#141824] px-2 py-0.5 text-zinc-300 hover:text-white hover:border-white/[0.2] transition"
                >
                  {prov}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>

      {/* Main Grid: Active Threat Actors & Real-Time Incident Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Top Attackers Triage Table (7 cols) */}
        <div className="lg:col-span-7 rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>Active Adversary Feed</span>
                <span className="rounded bg-red-950/40 px-2 py-0.5 text-[10px] font-mono text-red-400 border border-red-800/40">
                  Priority Triage
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">High-frequency threat sources detected across client perimeters</p>
            </div>
            <Link
              href="/dashboard"
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition"
            >
              <span>Trends & Analytics</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-[11px] font-medium text-zinc-400">
                  <th className="pb-2">IP Address</th>
                  <th className="pb-2">ISP / Country</th>
                  <th className="pb-2">Abuse Score</th>
                  <th className="pb-2">Alerts</th>
                  <th className="pb-2 pr-1 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] font-mono">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-zinc-500 font-sans">
                      Loading threat actors...
                    </td>
                  </tr>
                ) : (
                  topAttackers.map((att: any) => {
                    const score = att.abuse_score ?? 0;
                    const isHigh = score >= 75;
                    const isMedium = score >= 40 && score < 75;
                    return (
                      <tr key={att.ip} className="hover:bg-white/[0.03] transition group">
                        <td className="py-2.5">
                          <Link
                            href={`/ip/${encodeURIComponent(att.ip)}`}
                            className="font-bold text-zinc-100 group-hover:text-white group-hover:underline flex items-center gap-1.5"
                          >
                            <span>{att.ip}</span>
                          </Link>
                        </td>
                        <td className="py-2.5 font-sans">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-white/[0.06] px-1 py-0.2 text-[10px] font-mono text-zinc-400 border border-white/[0.08]">
                              {att.country_code || 'XX'}
                            </span>
                            <span className="text-[11px] text-zinc-300 max-w-[130px] truncate" title={att.isp}>
                              {att.isp || 'Unknown ISP'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold border ${
                              isHigh
                                ? 'bg-red-950/40 text-red-400 border-red-800/50'
                                : isMedium
                                ? 'bg-amber-950/40 text-amber-400 border-amber-800/50'
                                : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                            }`}
                          >
                            {att.abuse_score !== null ? `${att.abuse_score}%` : 'N/A'}
                          </span>
                        </td>
                        <td className="py-2.5 text-zinc-300 font-tabular">{att.total_alert_count || 1}</td>
                        <td className="py-2.5 pr-1 text-right">
                          <DefangButton ip={att.ip} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Recent Incident Stream (5 cols) */}
        <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>Recent Wazuh Security Logs</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </h2>
              <p className="text-[11px] text-zinc-400">Live incoming events captured by detection rules</p>
            </div>
          </div>

          <div className="space-y-2">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-sans">Loading recent events...</div>
            ) : recentEvents.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-sans">No recent events observed.</div>
            ) : (
              recentEvents.map((ev: any) => (
                <div
                  key={ev.id}
                  className="rounded-lg border border-white/[0.06] bg-[#141824] p-3 hover:border-white/[0.14] transition space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/ip/${encodeURIComponent(ev.ip)}`}
                      className="font-mono text-xs font-semibold text-zinc-200 hover:text-white hover:underline"
                    >
                      {ev.ip}
                    </Link>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(ev.seen_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-zinc-300 text-[11px] font-medium truncate max-w-[180px]">
                      {ev.target_host || 'Unspecified Host'}
                    </span>
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.2 text-[10px] font-mono text-zinc-400 border border-white/[0.08]">
                      {ev.alert_type || 'alert'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono truncate" title={ev.raw_summary}>
                    {ev.raw_summary || ev.endpoint || 'Triggered detection rule'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
