import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NavbarView } from '../components/Navbar';
import BulkPage from '../app/bulk/page';
import EnrichPage from '../app/enrich/page';
import InvestigatePage from '../app/investigate/page';

const analyst = { user: { userId: 'a', username: 'Ada', role: 'analyst' }, permissions: ['read', 'export'], capabilities: { externalEnrichment: false, maintenance: false } };
const noop = () => {};

describe('unified navigation', () => {
  it('has one Investigate destination in desktop and mobile, no Overview, and accessible brand home', () => {
    const html = renderToStaticMarkup(<NavbarView pathname="/" session={analyst} searchQuery="" onSearchChange={noop} onSearch={noop} onLogout={noop} />);
    expect(html).not.toContain('Overview'); expect(html).not.toContain('/enrich'); expect(html).not.toContain('/bulk');
    expect(html.match(/href="\/investigate"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="IP INTEL home"'); expect(html).toContain('aria-current="page"');
    expect(html).toContain('/dashboard'); expect(html).toContain('Analytics');
    expect(html).toContain('Ada'); expect(html).toContain('analyst'); expect(html).not.toContain('read-only');
    expect(html).not.toContain('/settings/database');
  });
  it('shows Settings only for an authorized administrator and hides navigation on setup/login', () => {
    const admin = { ...analyst, user: { ...analyst.user, role: 'admin' }, permissions: ['read', 'database:read'] };
    const props = { session: admin, searchQuery: '', onSearchChange: noop, onSearch: noop, onLogout: noop };
    expect(renderToStaticMarkup(<NavbarView {...props} pathname="/investigate" />)).toContain('/settings/database');
    expect(renderToStaticMarkup(<NavbarView {...props} pathname="/login" />)).toBe('');
    expect(renderToStaticMarkup(<NavbarView {...props} pathname="/setup" />)).toBe('');
  });
  it('redirects both legacy page implementations with correct mode and only IP query values', async () => {
    for (const [Page, mode] of [[BulkPage, 'local'], [EnrichPage, 'external']] as const) {
      let digest = '';
      try { await Page({ searchParams: Promise.resolve({ ip: '8.8.8.8', apiKey: 'never-preserve' }) }); }
      catch (error) { digest = (error as { digest: string }).digest; }
      expect(digest).toContain('NEXT_REDIRECT'); expect(digest).toContain(`mode=${mode}`); expect(digest).toContain('8.8.8.8'); expect(digest).not.toContain('never-preserve');
    }
  });
  it('passes awaited query input and mode to the same workbench without automatic lookup', async () => {
    const page = await InvestigatePage({ searchParams: Promise.resolve({ mode: 'external', ip: '8.8.8.8' }) });
    expect(page.props.initialMode).toBe('external'); expect(page.props.initialInput).toBe('8.8.8.8');
    const next = await InvestigatePage({ searchParams: Promise.resolve({ mode: 'local', ip: '1.1.1.1' }) });
    expect(next.key).not.toBe(page.key);
    const html = renderToStaticMarkup(page);
    expect(html).toContain('Enrich Selected'); expect(html).toContain('IP indicators');
  });
});
