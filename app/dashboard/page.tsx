'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Globe2,
  TrendingUp,
  Server,
  Layers,
  ShieldAlert,
  Building2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import MitreHeatmap from '@/components/MitreHeatmap';

export default function DashboardPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ['soc-analytics', days],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?days=${days}`);
      if (!res.ok) throw new Error('Failed to load dashboard data');
      return res.json();
    },
  });

  const timeline = data?.timeline || [];
  const topCountries = data?.topCountries || [];
  const topAttackTypes = data?.topAttackTypes || [];
  const topMitre = data?.topMitre || [];
  const outcomeDist = data?.outcomeDistribution || [];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-sans">
      {/* Header and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              Global Threat Telemetry & Macro Analytics
            </h1>
            <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-white/[0.08]">
              {days}d Window
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Macro-level incident volume, adversary origin geographies, and tactical attack vectors
          </p>
        </div>

        {/* Actions & Date Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/providers"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#0e111a] px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.06] transition"
          >
            <Building2 className="h-3.5 w-3.5 text-zinc-400" />
            <span>Providers Directory →</span>
          </Link>

          <div className="inline-flex rounded-lg border border-white/[0.08] bg-[#0e111a] p-1 text-xs font-mono">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  days === d
                    ? 'bg-white/[0.12] text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Incident Volume Trend (Full width) */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-zinc-400" />
              <span>Incident Attack Volume ({days} Days)</span>
            </h2>
            <p className="text-[11px] text-zinc-400">Daily frequency of triggered Wazuh security rules</p>
          </div>
        </div>

        <div className="h-60 w-full pt-2">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-zinc-500 font-mono">
              Loading trend telemetry...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke="#71717a" fontSize={10} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#141824',
                    borderColor: 'rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#f4f4f6',
                  }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="attacks" name="Attacks" fill="#ef4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Two Column Grid: Top Attack Categories & Top Countries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Attack Classes */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
          <div className="border-b border-white/[0.06] pb-3">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              <span>Top Attack Categories</span>
            </h3>
            <p className="text-[11px] text-zinc-400">Prevalent exploitation vectors identified in Wazuh logs</p>
          </div>

          <div className="space-y-3 pt-1">
            {topAttackTypes.map((item: any) => {
              const max = topAttackTypes[0]?.count || 1;
              const pct = Math.round((item.count / max) * 100);
              return (
                <div key={item.type} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-zinc-200 font-sans">{item.type}</span>
                    <span className="text-zinc-200 font-bold font-tabular">{item.count} alerts</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Attacker Countries */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
          <div className="border-b border-white/[0.06] pb-3">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-zinc-400" />
              <span>Adversary Origin Geographies</span>
            </h3>
            <p className="text-[11px] text-zinc-400">Threat actor origin country distribution</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            {topCountries.map((c: any) => (
              <div
                key={c.code}
                className="rounded-lg border border-white/[0.06] bg-[#141824] p-3 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold font-mono text-zinc-100">{c.code}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">CC</span>
                </div>
                <div className="mt-2 text-xs font-mono font-medium text-zinc-300 font-tabular">
                  {c.count} Unique IPs
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Global MITRE Matrix Heatmap Card */}
      <MitreHeatmap techniques={topMitre.map((m: any) => m.id)} />

      {/* Outcome Ratios Card */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
        <div className="border-b border-white/[0.06] pb-3">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Layers className="h-4 w-4 text-zinc-400" />
            <span>Attack Resolution & Outcome Ratios</span>
          </h3>
          <p className="text-[11px] text-zinc-400">Proportion of blocked, attempted, or succeeded attacks</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
          {outcomeDist.map((item: any) => {
            const isCritical = ['success', 'compromised', 'allowed'].includes(item.outcome.toLowerCase());
            const isBlocked = ['blocked', 'denied', 'dropped'].some((b) => item.outcome.toLowerCase().includes(b));
            return (
              <div
                key={item.outcome}
                className={`rounded-lg border p-4 flex flex-col justify-between space-y-1 ${
                  isCritical
                    ? 'border-red-800/60 bg-red-950/20 text-red-300'
                    : isBlocked
                    ? 'border-emerald-800/60 bg-emerald-950/20 text-emerald-300'
                    : 'border-white/[0.06] bg-[#141824] text-zinc-300'
                }`}
              >
                <span className="text-xs uppercase tracking-wider text-zinc-400 font-sans">
                  {item.outcome}
                </span>
                <span className="text-2xl font-bold font-tabular">
                  {item.count}
                </span>
                <span className="text-[10px] text-zinc-500 font-sans">
                  Wazuh security detection status
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
