'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Building2, FileDown, LogOut, Search, Settings, Shield, ScanSearch } from 'lucide-react';
import { validateIpOrCidr } from '../lib/ip-validator';
import type { InvestigationSession } from './investigation/investigation-state';

export function NavbarView({ pathname, session, searchQuery, onSearchChange, onSearch, onLogout, searchInputRef }: {
  pathname: string; session: InvestigationSession | null; searchQuery: string;
  onSearchChange: (query: string) => void; onSearch: (event: React.FormEvent) => void;
  onLogout: () => void; searchInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  if (pathname === '/login' || pathname === '/setup') return null;
  const links = [
    { href: '/investigate', label: 'Investigate', icon: ScanSearch },
    { href: '/providers', label: 'Providers / ASN', icon: Building2 },
    { href: '/dashboard', label: 'Analytics', icon: Activity },
    { href: '/blocklist', label: 'Blocklist Feeds', icon: FileDown },
  ];
  if (session?.user.role === 'admin' && (session.permissions.includes('database:read') || session.permissions.includes('database:manage'))) {
    links.push({ href: '/settings/database', label: 'Settings', icon: Settings });
  }
  const renderLinks = () => links.map(link => {
    const Icon = link.icon;
    const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
    return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition focus-visible:ring-2 focus-visible:ring-white/40 ${active ? 'bg-white/10 text-zinc-100' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />{link.label}
    </Link>;
  });
  return <header className="sticky top-0 z-50 border-b border-white/10 bg-[#090a0f]/95 backdrop-blur-md">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-4">
        <Link href="/" aria-label="Neuropetra IP home" aria-current={pathname === '/' ? 'page' : undefined} className="flex shrink-0 items-center gap-2 rounded-md font-mono text-sm font-semibold focus-visible:ring-2 focus-visible:ring-white/50">
          <Shield aria-hidden="true" className="h-5 w-5 text-zinc-300" /><span>NEUROPETRA <span className="font-normal text-zinc-400">IP</span></span>
        </Link>
        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">{renderLinks()}</nav>
      </div>
      <div className="flex items-center gap-3">
        <form onSubmit={onSearch} role="search" className="relative w-40 sm:w-52">
          <Search aria-hidden="true" className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input ref={searchInputRef} aria-label="Search IP or ASN" value={searchQuery} onChange={e => onSearchChange(e.target.value)} placeholder="Search IP or ASN…" className="w-full rounded-md border border-white/10 bg-[#0e111a] py-2 pl-8 pr-2 font-mono text-xs" />
        </form>
        <div className="hidden flex-col text-right sm:flex">
          <span className="text-xs text-zinc-300">{session?.user.username ?? 'Session unavailable'}</span>
          <span className="text-[10px] text-zinc-500">{session ? `${session.user.role} · ${session.permissions.join(', ')}` : 'Permissions unavailable'}</span>
        </div>
        <button type="button" aria-label="Log out" onClick={onLogout} className="rounded-md p-2 text-zinc-400 hover:bg-white/5"><LogOut aria-hidden="true" className="h-4 w-4" /></button>
      </div>
    </div>
    <nav aria-label="Mobile navigation" className="flex gap-1 overflow-x-auto border-t border-white/5 px-4 py-2 lg:hidden">{renderLinks()}</nav>
  </header>;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [session, setSession] = useState<InvestigationSession | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (pathname === '/login' || pathname === '/setup') return;
    const abort = new AbortController();
    fetch('/api/auth/session', { cache: 'no-store', signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Session unavailable');
      const result = await response.json();
      if (!abort.signal.aborted) setSession(result.user && Array.isArray(result.permissions) ? result : null);
    }).catch(() => { if (!abort.signal.aborted) setSession(null); });
    return () => abort.abort();
  }, [pathname]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      if (event.key === '/' || (event.key === 'k' && (event.metaKey || event.ctrlKey))) { event.preventDefault(); searchInputRef.current?.focus(); }
    };
    window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey);
  }, []);
  return <NavbarView pathname={pathname} session={pathname === '/login' || pathname === '/setup' ? null : session} searchQuery={query} onSearchChange={setQuery} searchInputRef={searchInputRef}
    onSearch={event => {
      event.preventDefault(); const value = query.trim(); if (!value) return;
      const validated = validateIpOrCidr(value);
      router.push(validated.valid && validated.type !== 'cidr' ? `/ip/${encodeURIComponent(validated.cleanValue)}` : `/providers?q=${encodeURIComponent(value)}`);
      setQuery('');
    }} onLogout={async () => {
      try { const response = await fetch('/api/auth/logout', { method: 'POST' }); if (!response.ok) return; setSession(null); router.push('/login'); router.refresh(); }
      catch { /* Keep the current session visible if logout did not succeed. */ }
    }} />;
}
