'use client';

import React from 'react';
import { groupTechniquesByTactic, MITRE_TACTICS } from '@/lib/mitre-matrix';
import { ExternalLink, Shield, ArrowRight } from 'lucide-react';

export default function MitreHeatmap({ techniques }: { techniques: string[] }) {
  if (!techniques || techniques.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-6 text-center">
        <Shield className="mx-auto h-7 w-7 text-zinc-600 mb-2 opacity-50" />
        <p className="text-xs text-zinc-400">No MITRE ATT&CK techniques associated with this activity.</p>
      </div>
    );
  }

  const grouped = groupTechniquesByTactic(techniques);
  // Sort tactics by their canonical enterprise kill chain order
  const tacticsList = Object.values(grouped).sort((a, b) => a.tactic.order - b.tactic.order);

  // All 14 tactics for pipeline visualization
  const allOrderedTactics = Object.values(MITRE_TACTICS).sort((a, b) => a.order - b.order);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <span>MITRE ATT&CK&reg; Matrix Alignment</span>
            <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-white/[0.08]">
              {techniques.length} Techniques Detected
            </span>
          </h3>
          <p className="text-[11px] text-zinc-400">
            Enterprise attack sequence ordered sequentially across the cyber kill chain
          </p>
        </div>
      </div>

      {/* Kill Chain Pipeline Strip */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-center gap-1 min-w-[700px] text-[10px] font-mono">
          {allOrderedTactics.map((t, idx) => {
            const isHit = Boolean(grouped[t.id]);
            const isLast = idx === allOrderedTactics.length - 1;
            return (
              <React.Fragment key={t.id}>
                <div
                  className={`flex-1 rounded px-2 py-1.5 text-center transition truncate border ${
                    isHit
                      ? 'bg-amber-950/40 border-amber-700/60 text-amber-300 font-semibold'
                      : 'bg-[#141824]/50 border-white/[0.04] text-zinc-500'
                  }`}
                  title={`${t.name} (${t.id})`}
                >
                  <span className="block text-[8px] opacity-60">#{t.order}</span>
                  <span className="truncate block font-sans text-[10px]">{t.name}</span>
                </div>
                {!isLast && <ArrowRight className="h-3 w-3 shrink-0 text-zinc-700" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Detected Tactics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
        {tacticsList.map(({ tactic, techniques: techList }) => (
          <div
            key={tactic.id}
            className="rounded-lg border border-white/[0.08] bg-[#141824] p-3.5 flex flex-col justify-between space-y-2.5"
          >
            {/* Tactic Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <span className="text-xs font-semibold text-zinc-200 tracking-wide">
                {tactic.name}
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {tactic.id} &bull; Step {tactic.order}
              </span>
            </div>

            {/* Techniques */}
            <div className="space-y-2">
              {techList.map((tech) => (
                <div
                  key={tech.id}
                  className="rounded border border-white/[0.06] bg-[#0e111a] p-2.5 hover:border-white/[0.14] transition space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-amber-400">
                      {tech.id}
                    </span>
                    <a
                      href={tech.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-500 hover:text-zinc-300 transition"
                      title="View on attack.mitre.org"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <p className="text-[11px] font-medium text-zinc-200 font-sans">
                    {tech.name}
                  </p>
                  <p className="text-[10px] text-zinc-400 font-sans line-clamp-2">
                    {tech.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
