'use client';

import React, { useState } from 'react';
import { ScoreBreakdown } from '@/lib/scoring';
import { ChevronDown, ChevronUp, ShieldAlert, AlertTriangle, ShieldCheck, HelpCircle, Info } from 'lucide-react';

export default function ScoreGauge({ scoring }: { scoring: ScoreBreakdown }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { compositeScore, verdict, verdictColor, components } = scoring;

  const colorMap = {
    red: {
      bar: 'bg-red-500',
      text: 'text-red-400',
      badgeBg: 'bg-red-950/50 border-red-800/60 text-red-400',
      icon: ShieldAlert,
    },
    amber: {
      bar: 'bg-amber-500',
      text: 'text-amber-400',
      badgeBg: 'bg-amber-950/50 border-amber-800/60 text-amber-400',
      icon: AlertTriangle,
    },
    emerald: {
      bar: 'bg-emerald-500',
      text: 'text-emerald-400',
      badgeBg: 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400',
      icon: ShieldCheck,
    },
    slate: {
      bar: 'bg-zinc-600',
      text: 'text-zinc-400',
      badgeBg: 'bg-zinc-900 border-zinc-700 text-zinc-400',
      icon: HelpCircle,
    },
  };

  const currentTheme = colorMap[verdictColor];
  const IconComponent = currentTheme.icon;

  return (
    <div className="w-full space-y-3 font-sans">
      {/* Top Row: Score & Verdict */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-extrabold tracking-tight text-white font-tabular">
            {compositeScore}
          </span>
          <span className="text-xs text-zinc-500 font-mono">/100</span>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${currentTheme.badgeBg}`}
          >
            <IconComponent className="h-3.5 w-3.5" />
            <span>{verdict}</span>
          </div>
        </div>

        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition py-1 px-2 rounded hover:bg-white/[0.04]"
        >
          <span>Score Breakdown</span>
          {showBreakdown ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Linear Segmented Progress Meter */}
      <div className="space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06] border border-white/[0.08]">
          <div
            className={`h-full transition-all duration-700 ease-out ${currentTheme.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, compositeScore))}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-zinc-500">
          <span>0 (Clean)</span>
          <span>40 (Suspicious)</span>
          <span>75 (Malicious)</span>
          <span>100</span>
        </div>
      </div>

      {/* Micro Metrics Ribbon */}
      <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-xs">
        <div className="rounded-lg border border-white/[0.06] bg-[#141824] p-2 space-y-0.5">
          <span className="text-[10px] text-zinc-400 uppercase font-sans block truncate">Abuse Confidence</span>
          <span className="font-semibold text-zinc-200 font-tabular">
            {components.abuseipdb.rawScore !== null ? `${components.abuseipdb.rawScore}%` : 'N/A'}
          </span>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-[#141824] p-2 space-y-0.5">
          <span className="text-[10px] text-zinc-400 uppercase font-sans block truncate">VirusTotal Detections</span>
          <span className="font-semibold text-zinc-200 font-tabular">
            {components.virustotal.rawScore !== null ? `${components.virustotal.rawScore}/100` : '0/100'}
          </span>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-[#141824] p-2 space-y-0.5">
          <span className="text-[10px] text-zinc-400 uppercase font-sans block truncate">Local SOC Weight</span>
          <span className="font-semibold text-zinc-200 font-tabular">
            {components.localSignal.rawScore}/100
          </span>
        </div>
      </div>

      {/* Expandable Breakdown Drawer */}
      {showBreakdown && (
        <div className="rounded-lg border border-white/[0.08] bg-[#141824] p-3 text-xs space-y-2 animate-in fade-in duration-200">
          <div className="text-[11px] font-semibold text-zinc-300 border-b border-white/[0.06] pb-1">
            Engine Weight Attribution
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans">AbuseIPDB ({Math.round(components.abuseipdb.weight * 100)}% wt)</span>
              <span className="font-tabular font-medium text-zinc-200">
                +{components.abuseipdb.weightedScore} pts
              </span>
            </div>

            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans">VirusTotal ({Math.round(components.virustotal.weight * 100)}% wt)</span>
              <span className="font-tabular font-medium text-zinc-200">
                +{components.virustotal.weightedScore} pts
              </span>
            </div>

            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans">Local Telemetry ({Math.round(components.localSignal.weight * 100)}% wt)</span>
              <span className="font-tabular font-medium text-zinc-200">
                +{components.localSignal.weightedScore} pts
              </span>
            </div>

            {components.localSignal.details.criticalOutcomeBonus > 0 && (
              <div className="rounded bg-red-950/40 border border-red-800/50 p-1.5 text-[10px] text-red-300 font-sans">
                ⚠ Critical Compromise outcome detected (+35 pts bonus applied).
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
