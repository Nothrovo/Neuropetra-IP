'use client';

import React, { useEffect, useState } from 'react';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { ShieldAlert, CheckCircle2, AlertCircle, Eye, EyeOff, Zap } from 'lucide-react';

interface EnrichmentStatus {
  success: boolean;
  enabled: boolean;
  hasKey: boolean;
  maskedKey: string | null;
  source: 'database' | 'environment' | 'none';
}

export default function EnrichmentSettingsPage() {
  const [status, setStatus] = useState<EnrichmentStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/settings/enrichment', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load settings');
        const data: EnrichmentStatus = await res.json();
        if (active) {
          setStatus(data);
          setEnabled(data.enabled);
          if (!data.hasKey) setIsEditingKey(true);
        }
      })
      .catch(() => {
        if (active) {
          setMessage({
            type: 'error',
            text: 'Failed to load enrichment settings. Make sure you are signed in as an administrator.',
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const payload: { action: 'save'; enabled: boolean; apiKey?: string } = {
        action: 'save',
        enabled,
      };

      if (isEditingKey && apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      const res = await fetch('/api/admin/settings/enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to save configuration');

      setMessage({ type: 'success', text: result.message || 'Configuration updated successfully.' });
      setIsEditingKey(false);
      setApiKey('');
      setStatus(result);
      setEnabled(result.enabled);
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);

    try {
      const keyToTest = isEditingKey && apiKey.trim() ? apiKey.trim() : undefined;
      const res = await fetch('/api/admin/settings/enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', apiKey: keyToTest }),
      });

      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: result.message });
      } else {
        setMessage({ type: 'error', text: result.message || 'Connection test failed' });
      }
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8 text-zinc-100">
      {/* Header & Breadcrumb */}
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-zinc-500">Settings / Administrator</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">External Enrichment &amp; Threat Intelligence</h1>
        <p className="mt-1.5 text-sm text-zinc-400">
          Manage AbuseIPDB API key and server-side reputation lookups. Lookups are securely executed by the backend and cached locally for 7 days.
        </p>
      </div>

      {/* Tabs */}
      <SettingsNav />

      {/* Alerts */}
      {message && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-lg border p-4 text-xs font-medium ${
            message.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/20 bg-red-500/10 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Main Configuration Card */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Form */}
        <div className="space-y-6 lg:col-span-2">
          <form onSubmit={handleSave} className="space-y-6 rounded-xl border border-white/[0.08] bg-[#0e111a] p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-base font-semibold text-white">AbuseIPDB Integration</h2>
                <p className="text-xs text-zinc-400">Query global unicast IP reputation scores and malicious report telemetry.</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    status?.enabled && status?.hasKey
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      status?.enabled && status?.hasKey ? 'bg-emerald-400' : 'bg-zinc-500'
                    }`}
                  />
                  {status?.enabled && status?.hasKey ? 'Active' : 'Disabled'}
                </span>
              </div>
            </div>

            {/* Toggle Enable */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <label htmlFor="enrichment-toggle" className="text-sm font-medium text-zinc-200">
                  Enable External Enrichment
                </label>
                <p className="text-xs text-zinc-400">
                  Allow SOC analysts to query AbuseIPDB for live reputation scoring.
                </p>
              </div>
              <input
                id="enrichment-toggle"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500"
              />
            </div>

            {/* API Key Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-200">AbuseIPDB API Key</label>
                {status?.hasKey && !isEditingKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingKey(true);
                      setApiKey('');
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Change Key
                  </button>
                )}
              </div>

              {status?.hasKey && !isEditingKey ? (
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#090a0f] px-3.5 py-2.5 font-mono text-xs text-zinc-300">
                  <span>{status.maskedKey}</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Source: {status.source}
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter AbuseIPDB API key (e.g. 80-character hex token)…"
                    className="w-full rounded-lg border border-white/10 bg-[#090a0f] px-3.5 py-2.5 pr-10 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}
              <p className="text-[11px] text-zinc-500">
                Register a free account at <a href="https://www.abuseipdb.com/account/api" target="_blank" rel="noreferrer" className="text-indigo-400 underline">abuseipdb.com</a> to generate your API key (1,000 queries/day on free tier).
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving || loading}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Configuration'}
              </button>

              <button
                type="button"
                onClick={handleTest}
                disabled={testing || (!status?.hasKey && !apiKey.trim())}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <Zap className={`h-3.5 w-3.5 ${testing ? 'animate-pulse text-amber-400' : 'text-zinc-400'}`} />
                <span>{testing ? 'Testing connection…' : 'Test API Key'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right 1 Col: OPSEC & Architecture Notice */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <ShieldAlert className="h-4 w-4 text-indigo-400" />
              <span>OPSEC &amp; Privacy Rules</span>
            </div>
            <ul className="space-y-2 text-xs text-zinc-400">
              <li className="flex items-start gap-1.5">
                <span className="text-indigo-400">•</span>
                <span><strong>No Egress for Private IPs:</strong> RFC 1918, CGNAT, loopback, and LAN addresses are automatically rejected from external lookup.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-indigo-400">•</span>
                <span><strong>7-Day Local Cache:</strong> Queried indicators are persisted in PostgreSQL to conserve API quota and avoid duplicate external traffic.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-indigo-400">•</span>
                <span><strong>Zero Backend Restarts:</strong> Keys configured here are saved directly to PostgreSQL and take effect immediately across all analyst sessions.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
