'use client';

import React from 'react';
import { AlertOctagon } from 'lucide-react';

export default function OutcomePanel({
  outcomes,
  hasCritical,
}: {
  outcomes: { outcome: string; count: number }[];
  hasCritical: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* High-Severity Escalation Alert (Crisp, not blinking) */}
      {hasCritical && (
        <div className="rounded-xl border border-red-800/80 bg-red-950/40 p-4 text-red-200 shadow-md flex items-start gap-3">
          <div className="p-1 rounded bg-red-900/60 border border-red-700/60 text-red-300 shrink-0">
            <AlertOctagon className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-red-300 font-sans">
              Critical Security Warning: Potential Host Compromise / Allowed Intrusion
            </h4>
            <p className="text-xs text-red-200/90 leading-relaxed font-sans">
              Telemetric analysis contains one or more alerts where the outcome status was evaluated as
              &apos;success&apos; or &apos;allowed&apos;. Immediate containment and escalation to SOC Level 2 is strongly advised.
            </p>
          </div>
        </div>
      )}

      {/* Outcome Distribution Row */}
      {outcomes.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-4 space-y-2">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <h4 className="text-xs font-semibold text-zinc-200">Alert Outcome Distribution</h4>
            <span className="text-[10px] text-zinc-500 font-mono">Defensive enforcement vs adversary success</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
            {outcomes.map((item) => {
              const isCritical = ['success', 'compromised', 'allowed'].includes(item.outcome.toLowerCase());
              const isBlocked = ['blocked', 'denied', 'dropped'].some((b) => item.outcome.toLowerCase().includes(b));
              return (
                <div
                  key={item.outcome}
                  className={`rounded-lg border p-2.5 flex flex-col justify-between ${
                    isCritical
                      ? 'border-red-800/60 bg-red-950/30 text-red-300'
                      : isBlocked
                      ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-300'
                      : 'border-white/[0.06] bg-[#141824] text-zinc-300'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-sans">
                    {item.outcome}
                  </span>
                  <span className="text-base font-bold font-tabular mt-1">
                    {item.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
