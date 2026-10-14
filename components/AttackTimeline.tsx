'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface TimelineEvent {
  seen_at: string;
  alert_type?: string | null;
}

export default function AttackTimeline({
  events,
  initialDays = 30,
}: {
  events: TimelineEvent[];
  initialDays?: number;
}) {
  const [rangeDays, setRangeDays] = useState(initialDays);

  // Bucket events by day
  const cutoff = Date.now() - rangeDays * 86400 * 1000;
  const filteredEvents = events.filter((e) => new Date(e.seen_at).getTime() >= cutoff);

  // Group by YYYY-MM-DD
  const countsMap = new Map<string, { date: string; attack: number; system: number; other: number }>();

  // Initialize previous days with 0 for smooth chart
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000);
    const key = d.toISOString().slice(5, 10); // MM-DD
    countsMap.set(key, { date: key, attack: 0, system: 0, other: 0 });
  }

  for (const ev of filteredEvents) {
    const key = new Date(ev.seen_at).toISOString().slice(5, 10);
    const item = countsMap.get(key) || { date: key, attack: 0, system: 0, other: 0 };
    if (ev.alert_type === 'attack') item.attack += 1;
    else if (ev.alert_type === 'system') item.system += 1;
    else item.other += 1;
    countsMap.set(key, item);
  }

  const chartData = Array.from(countsMap.values());

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Incident Activity Frequency</h3>
          <p className="text-[11px] text-zinc-400">Daily chronological distribution of security rule triggers</p>
        </div>

        {/* 30d / 90d toggle */}
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-[#141824] p-0.5 text-xs font-mono">
          <button
            onClick={() => setRangeDays(30)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              rangeDays === 30 ? 'bg-white/[0.12] text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setRangeDays(90)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              rangeDays === 90 ? 'bg-white/[0.12] text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            90 Days
          </button>
        </div>
      </div>

      <div className="h-52 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
            <Bar dataKey="attack" name="Attack Events" fill="#ef4444" stackId="a" radius={[2, 2, 0, 0]} />
            <Bar dataKey="system" name="System Events" fill="#38bdf8" stackId="a" radius={[2, 2, 0, 0]} />
            <Bar dataKey="other" name="Other Events" fill="#71717a" stackId="a" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
