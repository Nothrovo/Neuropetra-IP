'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, KeyRound } from 'lucide-react';

export function SettingsNav() {
  const pathname = usePathname();

  const tabs = [
    {
      href: '/settings/enrichment',
      label: 'External Enrichment',
      description: 'AbuseIPDB API key and live reputation provider',
      icon: KeyRound,
    },
    {
      href: '/settings/database',
      label: 'Database Management',
      description: 'Maintenance plans, audits, and retention policies',
      icon: Database,
    },
  ];

  return (
    <div className="border-b border-white/[0.08] pb-1">
      <nav className="flex space-x-2" aria-label="Settings Tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-xs font-medium transition ${
                active
                  ? 'border-indigo-500 bg-white/[0.04] text-white shadow-sm'
                  : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:bg-white/[0.02] hover:text-zinc-200'
              }`}
            >
              <Icon
                className={`h-4 w-4 transition ${
                  active ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300'
                }`}
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
