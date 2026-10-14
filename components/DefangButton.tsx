'use client';

import React, { useState } from 'react';
import { defang } from '@/lib/ip-validator';
import { Copy, Check, ShieldCheck } from 'lucide-react';

export default function DefangButton({ ip }: { ip: string }) {
  const [copiedType, setCopiedType] = useState<'raw' | 'defanged' | null>(null);

  const defangedIp = defang(ip);

  function copyToClipboard(text: string, type: 'raw' | 'defanged') {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  }

  return (
    <div className="inline-flex items-center gap-1 font-mono text-[11px]">
      {/* Copy standard IP */}
      <button
        onClick={() => copyToClipboard(ip, 'raw')}
        className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-[#141824] px-2 py-0.5 text-zinc-300 hover:bg-white/[0.06] hover:text-white transition"
        title="Copy raw IP"
      >
        {copiedType === 'raw' ? (
          <>
            <Check className="h-3 w-3 text-emerald-400" />
            <span className="text-emerald-400">Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3 text-zinc-500" />
            <span>Copy</span>
          </>
        )}
      </button>

      {/* Copy defanged IP */}
      <button
        onClick={() => copyToClipboard(defangedIp, 'defanged')}
        className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-[#141824] px-2 py-0.5 text-zinc-300 hover:bg-white/[0.06] hover:text-white transition"
        title={`Copy defanged: ${defangedIp}`}
      >
        {copiedType === 'defanged' ? (
          <>
            <Check className="h-3 w-3 text-emerald-400" />
            <span className="text-emerald-400">Defanged</span>
          </>
        ) : (
          <>
            <ShieldCheck className="h-3 w-3 text-zinc-500" />
            <span>Defang</span>
          </>
        )}
      </button>
    </div>
  );
}
