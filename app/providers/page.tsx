'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Search,
  ShieldAlert,
  Globe2,
  Activity,
  Layers,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';

function ProvidersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'high' | 'active'>('all');

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchTerm.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['providers-list', debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`/api/providers?q=${encodeURIComponent(debouncedQuery)}&limit=100`);
      if (!res.ok) throw new Error('Failed to load provider directory');
      return res.json();
    },
  });

  const rawProviders = data?.providers || [];

  // Filter client-side by severity or activity
  const filteredProviders = rawProviders.filter((p: any) => {
    if (filterSeverity === 'high') {
      return p.avg_abuse_score >= 75 || p.max_abuse_score >= 75;
    }
    if (filterSeverity === 'active') {
      return p.total_alerts >= 10;
    }
    return true;
  });

  // Calculate high-level summary metrics
  const totalProviders = data?.total || rawProviders.length;
  const totalIps = rawProviders.reduce((acc: number, curr: any) => acc + (curr.ip_count || 0), 0);
  const highRiskCount = rawProviders.filter((p: any) => p.avg_abuse_score >= 75 || p.max_abuse_score >= 75).length;
  const totalAlerts = rawProviders.reduce((acc: number, curr: any) => acc + (curr.total_alerts || 0), 0);

  function getScoreColor(score: number) {
    if (score >= 75) return 'text-red-400 bg-red-950/40 border-red-800/60';
    if (score >= 40) return 'text-amber-400 bg-amber-950/40 border-amber-800/60';
    return 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60';
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Network Providers & ASN Directory
            </h1>
            <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-white/[0.08]">
              {totalProviders} Networks Monitored
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Aggregate threat actors by Autonomous System and Internet Service Provider to analyze adversary infrastructure.
          </p>
        </div>

        {/* Aggregate KPI Ribbon */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="rounded-lg border border-white/[0.08] bg-[#0e111a] px-3 py-1.5">
            <span className="text-[10px] text-zinc-500 uppercase block font-sans">Unique IPs</span>
            <span className="text-sm font-semibold text-zinc-200 font-tabular">
              {isLoading ? '...' : totalIps.toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg border border-red-950/60 bg-red-950/20 px-3 py-1.5">
            <span className="text-[10px] text-red-400 uppercase block font-sans">High-Risk ASNs</span>
            <span className="text-sm font-semibold text-red-400 font-tabular">
              {isLoading ? '...' : highRiskCount.toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#0e111a] px-3 py-1.5">
            <span className="text-[10px] text-zinc-500 uppercase block font-sans">Total Alerts</span>
            <span className="text-sm font-semibold text-zinc-200 font-tabular">
              {isLoading ? '...' : totalAlerts.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Search Bar & Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search provider name (e.g. DigitalOcean, Hostkey) or ASN..."
            className="w-full rounded-lg border border-white/[0.1] bg-[#0e111a] py-2.5 pl-9 pr-20 font-mono text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:border-white/[0.25] focus:outline-none focus:ring-1 focus:ring-white/[0.15] transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 rounded px-2 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-white bg-[#141824] border border-white/[0.06]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-[#0e111a] p-1 rounded-lg border border-white/[0.08] self-start sm:self-auto font-mono text-xs">
          <button
            onClick={() => setFilterSeverity('all')}
            className={`px-3 py-1 rounded transition ${
              filterSeverity === 'all'
                ? 'bg-white/[0.1] text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All ({rawProviders.length})
          </button>
          <button
            onClick={() => setFilterSeverity('high')}
            className={`px-3 py-1 rounded transition ${
              filterSeverity === 'high'
                ? 'bg-red-950/60 text-red-300 font-semibold border border-red-800/50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            High Risk (≥75)
          </button>
          <button
            onClick={() => setFilterSeverity('active')}
            className={`px-3 py-1 rounded transition ${
              filterSeverity === 'active'
                ? 'bg-amber-950/60 text-amber-300 font-semibold border border-amber-800/50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Active (≥10 alerts)
          </button>
        </div>
      </div>

      {/* Provider List / Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 text-zinc-500 space-y-3 font-mono text-xs">
          <Activity className="h-6 w-6 text-zinc-400 animate-spin" />
          <span>Querying PostgreSQL provider telemetry...</span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center text-red-400 text-sm">
          Failed to load provider intelligence.
          <button onClick={() => refetch()} className="ml-3 underline font-mono text-xs">
            Retry
          </button>
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-12 text-center text-zinc-400 space-y-2">
          <Building2 className="h-7 w-7 text-zinc-600 mx-auto" />
          <p className="text-sm font-medium text-zinc-300">No providers matching query &quot;{searchTerm}&quot;</p>
          <p className="text-xs text-zinc-500">Try searching with a partial name or Autonomous System identifier.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredProviders.map((provider: any) => {
            const scoreClass = getScoreColor(provider.avg_abuse_score);
            return (
              <div
                key={provider.isp}
                className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-4 hover:border-white/[0.18] transition group flex flex-col justify-between space-y-3 shadow-md"
              >
                <div className="space-y-2.5">
                  {/* Top Bar: Title & Severity Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1 min-w-0">
                      <h3
                        className="font-bold text-sm text-zinc-200 group-hover:text-white transition truncate"
                        title={provider.isp}
                      >
                        {provider.isp}
                      </h3>
                      {/* ASN & Country Tags */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {provider.countries?.slice(0, 3).map((code: string) => (
                          <span
                            key={code}
                            className="rounded bg-[#141824] px-1.5 py-0.2 text-[10px] font-mono text-zinc-300 border border-white/[0.06]"
                          >
                            {code}
                          </span>
                        ))}
                        {provider.asns?.slice(0, 1).map((asn: string) => (
                          <span
                            key={asn}
                            className="rounded bg-[#141824] px-1.5 py-0.2 text-[10px] font-mono text-zinc-400 border border-white/[0.06] truncate max-w-[140px]"
                            title={asn}
                          >
                            {asn}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div
                      className={`rounded-lg border px-2 py-0.5 text-center font-mono ${scoreClass}`}
                      title={`Average Abuse Score: ${provider.avg_abuse_score} / Max: ${provider.max_abuse_score}`}
                    >
                      <span className="text-[9px] block uppercase opacity-70 font-sans">Avg Score</span>
                      <span className="text-xs font-bold font-tabular">{provider.avg_abuse_score}%</span>
                    </div>
                  </div>

                  {/* Metadata Stats */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.06] text-center font-mono">
                    <div className="rounded bg-[#141824] p-1.5">
                      <span className="text-[9px] text-zinc-500 uppercase block font-sans">IPs</span>
                      <span className="text-xs font-bold text-zinc-200 font-tabular">{provider.ip_count}</span>
                    </div>
                    <div className="rounded bg-[#141824] p-1.5">
                      <span className="text-[9px] text-zinc-500 uppercase block font-sans">Alerts</span>
                      <span className="text-xs font-bold text-zinc-200 font-tabular">{provider.total_alerts}</span>
                    </div>
                    <div className="rounded bg-[#141824] p-1.5">
                      <span className="text-[9px] text-zinc-500 uppercase block font-sans">Peak</span>
                      <span className="text-xs font-bold text-red-400 font-tabular">{provider.max_abuse_score}%</span>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <Link
                  href={`/providers/${encodeURIComponent(provider.isp)}`}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#141824] px-3 py-1.5 text-xs font-medium text-zinc-300 group-hover:text-white group-hover:border-white/[0.14] transition"
                >
                  <span>Investigate Provider Telemetry</span>
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-500 group-hover:text-white transition" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProvidersPage() {
  return (
    <Suspense
      fallback={
        <div className="p-16 text-center font-mono text-xs text-zinc-500">
          Loading provider intelligence directory...
        </div>
      }
    >
      <ProvidersContent />
    </Suspense>
  );
}
