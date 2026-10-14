'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Lock, User, ArrowRight, AlertCircle, KeyRound } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Hard navigation ensures browser cookie jar is immediately applied to proxy/middleware
      window.location.href = from;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleQuickFill() {
    setUsername('analyst');
    setPassword('soc123');
    setError('');
  }

  return (
    <div className="w-full max-w-sm space-y-6 font-sans">
      {/* Brand Identity */}
      <div className="text-center space-y-2">
        <div className="inline-flex p-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-zinc-100 mb-1">
          <Shield className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white font-mono">
          IP<span className="text-zinc-400 font-normal">INTEL</span> PLATFORM
        </h1>
        <p className="text-xs text-zinc-400">
          ACAD CSIRT / SGU SOC Threat Intelligence Access
        </p>
      </div>

      {/* Login Card */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-6 shadow-xl space-y-5">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/30 p-2.5 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              SOC Analyst ID
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="analyst"
                className="w-full rounded-md border border-white/[0.08] bg-[#141824] py-2 pl-9 pr-3 font-mono text-xs text-zinc-200 placeholder-zinc-500 focus:border-white/[0.25] focus:outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-white/[0.08] bg-[#141824] py-2 pl-9 pr-3 font-mono text-xs text-zinc-200 placeholder-zinc-500 focus:border-white/[0.25] focus:outline-none transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-white/[0.12] hover:bg-white/[0.18] py-2 text-xs font-semibold text-white border border-white/[0.12] disabled:opacity-50 transition"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to Session'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>

        {/* Quick Fill Box for Analysts */}
        <div className="border-t border-white/[0.06] pt-3">
          <button
            type="button"
            onClick={handleQuickFill}
            className="w-full flex items-center justify-center gap-1.5 rounded-md border border-white/[0.06] bg-[#141824] py-1.5 text-xs font-mono text-zinc-400 hover:text-white hover:border-white/[0.14] transition"
          >
            <KeyRound className="h-3.5 w-3.5 text-zinc-400" />
            <span>Use Demo Creds (analyst / soc123)</span>
          </button>
        </div>
      </div>

      <p className="text-center text-[10px] text-zinc-600 font-mono">
        Strictly authorized personnel only &bull; Read-only audit telemetry
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <Suspense fallback={<div className="text-xs text-zinc-500 font-mono">Loading authentication...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
