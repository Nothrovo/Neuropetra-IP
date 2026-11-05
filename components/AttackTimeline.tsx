'use client';

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export default function AttackTimeline({timeline,rangeDays,onRangeChange}:{timeline:{date:string;count:number}[];rangeDays:number;onRangeChange:(days:number)=>void}) {
  const chartData=timeline;
  const total=timeline.reduce((sum,point)=>sum+point.count,0);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Incident Activity Frequency</h3>
          <p className="text-[11px] text-zinc-400">{total} events across selected filters; daily buckets in UTC</p>
        </div>

        {/* 30d / 90d toggle */}
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-[#141824] p-0.5 text-xs font-mono">
          <button
            onClick={() => onRangeChange(30)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              rangeDays === 30 ? 'bg-white/[0.12] text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => onRangeChange(90)}
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
            <Bar dataKey="count" name="Events" fill="#ef4444" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
