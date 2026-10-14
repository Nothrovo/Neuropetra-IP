'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Shield, Search, LogOut, Activity, FileDown, Layers, Building2, Sparkles, Command } from 'lucide-react';
import { validateIpOrCidr } from '@/lib/ip-validator';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on '/' shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && 
          document.activeElement?.tagName !== 'INPUT' && 
          document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const clean = searchQuery.trim();
    if (!clean) return;
    const v = validateIpOrCidr(clean);
    if (v.valid) {
      router.push(`/ip/${encodeURIComponent(clean)}`);
    } else {
      router.push(`/providers?q=${encodeURIComponent(clean)}`);
    }
    setSearchQuery('');
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      router.push('/login');
    }
  }

  if (pathname === '/login') return null;

  const navLinks = [
    { href: '/', label: 'Overview', icon: Search },
    { href: '/enrich', label: 'Investigation & Enrich', icon: Sparkles },
    { href: '/bulk', label: 'Bulk Lookup', icon: Layers },
    { href: '/providers', label: 'Providers / ASN', icon: Building2 },
    { href: '/dashboard', label: 'Analytics', icon: Activity },
    { href: '/blocklist', label: 'Blocklist Feeds', icon: FileDown },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.07] bg-[#090a0f]/85 backdrop-blur-md">
      <div className="mx-auto flex h-13 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Left Navigation */}
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-2 text-zinc-100 hover:text-white transition group">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.06] border border-white/[0.08] text-zinc-200 group-hover:border-white/[0.18] transition">
              <Shield className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1.5 font-mono text-sm tracking-tight font-semibold">
              <span className="text-zinc-100">IP</span>
              <span className="text-zinc-400 font-normal">INTEL</span>
              <span className="rounded bg-white/[0.06] px-1.5 py-0.2 text-[9px] font-mono font-medium text-zinc-400 border border-white/[0.08]">
                SOC L1
              </span>
            </div>
          </Link>

          {/* Desktop Nav Tabs */}
          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                    isActive
                      ? 'bg-white/[0.08] text-zinc-100 border border-white/[0.08]'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 opacity-70" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Global Quick Omnibar & Session Profile */}
        <div className="flex items-center space-x-3">
          <form onSubmit={handleSearch} className="relative w-44 sm:w-60 lg:w-72">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search IP, CIDR, or ASN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-white/[0.08] bg-[#0e111a] py-1.5 pl-8 pr-8 font-mono text-xs text-zinc-200 placeholder-zinc-500 focus:border-white/[0.25] focus:outline-none focus:ring-1 focus:ring-white/[0.15] transition"
            />
            <kbd className="absolute right-2 top-2 hidden sm:inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.2 text-[9px] font-mono text-zinc-500">
              /
            </kbd>
          </form>

          {/* Analyst Status & Logout */}
          <div className="flex items-center space-x-2 pl-3 border-l border-white/[0.08]">
            <div className="hidden lg:flex flex-col text-right">
              <span className="text-[11px] font-medium text-zinc-300">analyst</span>
              <span className="text-[9px] font-mono text-emerald-400/90 flex items-center justify-end gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> read-only
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Logout session"
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav Scroller */}
      <div className="md:hidden flex items-center space-x-1 overflow-x-auto px-4 py-1.5 border-t border-white/[0.05] bg-[#090a0f]">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center space-x-1 shrink-0 px-2.5 py-1 rounded text-xs font-medium transition ${
                isActive
                  ? 'bg-white/[0.08] text-zinc-100 border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="h-3 w-3 opacity-70" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
