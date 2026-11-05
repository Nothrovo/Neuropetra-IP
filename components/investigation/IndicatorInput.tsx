'use client';

import React, { useRef, useState } from 'react';
import { parseIndicatorInput } from '../../lib/investigation-input';

export default function IndicatorInput({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const parsed = parseIndicatorInput(value);
  const [error, setError] = useState('');
  const revision = useRef(0);
  return <section className="space-y-3">
    <label htmlFor="indicator-input" className="block text-sm font-medium">IP indicators</label>
    <textarea id="indicator-input" value={value} disabled={disabled} onChange={e => { revision.current++; onChange(e.target.value); }} rows={6}
      placeholder="One IP or a batch of IPv4 / IPv6 addresses" className="w-full rounded-lg border border-white/15 bg-[#090a0f] p-3 font-mono text-sm" aria-describedby="input-accounting input-help" />
    <p id="input-help" className="text-xs text-zinc-400">Paste addresses separated by whitespace, commas or semicolons, or upload CSV/TXT. CSV: IP cells and an optional ip header; other cells are reported as invalid. Exact IPs only, no CIDR.</p>
    <label className="block text-sm">Upload CSV or TXT
      <input aria-label="Upload CSV or TXT" className="ml-3 max-w-full text-xs" type="file" accept=".csv,.txt,text/csv,text/plain" disabled={disabled} onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        const version = ++revision.current;
        if (!/\.(csv|txt)$/i.test(file.name)) { setError('Choose a CSV or TXT file.'); return; }
        if (file.size > 1024 * 1024) { setError('File exceeds 1 MiB. Split the file; no input was imported.'); return; }
        try { const text = await file.text(); if (version === revision.current) { onChange(text); setError(''); } }
        catch { setError('Unable to read this file. No input was imported.'); }
      }} />
    </label>
    <p id="input-accounting" role="status" className="text-sm text-zinc-300">{parsed.valid.length} valid · {parsed.invalid.length} invalid · {parsed.duplicateCount} duplicate{parsed.duplicateCount === 1 ? '' : 's'} removed</p>
    {parsed.invalid.length > 0 && <details className="text-xs text-amber-300"><summary>Invalid values will not be submitted</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{parsed.invalid.join('\n')}</pre></details>}
    {parsed.valid.length > 200 && <p role="alert" className="text-sm text-amber-300">Limit: 200 unique IPs. All {parsed.valid.length} are retained; split this input before submitting.</p>}
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
  </section>;
}
