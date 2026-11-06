import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import InvestigationWorkbench from '../components/investigation/InvestigationWorkbench';
import IndicatorInput from '../components/investigation/IndicatorInput';
import InvestigationResults from '../components/investigation/InvestigationResults';

const session = { user: { userId: 'a', username: 'Ada', role: 'analyst' }, permissions: ['read', 'enrich', 'export'], capabilities: { externalEnrichment: true, maintenance: false } };
const noop = () => {};

describe('rendered investigation workbench', () => {
  it('has one shared input and defaults to local with no external request on render', () => {
    const html = renderToStaticMarkup(<InvestigationWorkbench initialInput="8.8.8.8" session={session} />);
    expect(html.match(/<textarea/g)).toHaveLength(1);
    expect(html).toContain('Search Local');
    expect(html).toContain('Local Lookup');
    expect(html).toContain('External Enrichment');
    expect(html).toContain('zero provider requests');
    expect(html).not.toContain('API Key');
  });
  it('renders external egress, fresh-first and force-refresh warnings with disabled reason', () => {
    const html = renderToStaticMarkup(<InvestigationWorkbench initialMode="external" initialInput="8.8.8.8" session={{ ...session, permissions: ['read'] }} />);
    expect(html).toContain('Enrich Selected');
    expect(html).toContain('Reuse fresh cache');
    expect(html).toContain('Force refresh');
    expect(html).toContain('leave this installation');
    expect(html).toContain('permission');
    expect(html).not.toContain('VirusTotal');
    expect(html).toMatch(/disabled=""[^>]*>Enrich Selected/);
  });
  it('shows full input accounting and rejects oversized input visibly rather than truncating', () => {
    const html = renderToStaticMarkup(<IndicatorInput value={'8.8.8.8\n8.8.8.8\nbad'} onChange={noop} disabled={false} />);
    expect(html).toContain('1 valid'); expect(html).toContain('1 invalid'); expect(html).toContain('1 duplicate');
    expect(html).toContain('bad'); expect(html).toContain('.csv,.txt');
    const large = renderToStaticMarkup(<IndicatorInput value={Array.from({ length: 201 }, (_, i) => `8.8.0.${i}`).join('\n')} onChange={noop} disabled={false} />);
    expect(large).toContain('201 valid'); expect(large).toContain('200 unique IPs');
  });
  it('preserves evidence drilldown and distinct provider/local metrics, per-item failures and freshness', () => {
    const html = renderToStaticMarkup(<InvestigationResults results={[
      { ip: '8.8.8.8', found: true, abuseScore: 0, totalAlertCount: 0, compositeScore: 0, source: 'cache', checkedAt: '2026-11-04T00:00:00Z', freshness: 'fresh', savedToDb: false },
      { ip: '1.1.1.1', found: false, status: 'error', error: 'Quota exhausted' },
    ]} selected={[]} onSelectionChange={noop} disabled={false} canExport={true} />);
    expect(html).toContain('/ip/8.8.8.8'); expect(html).toContain('Provider score'); expect(html).toContain('Local alerts');
    expect(html).toContain('Quota exhausted'); expect(html).toContain('fresh'); expect(html).toContain('Not saved');
    expect(html).toContain('CSV'); expect(html).toContain('Alpha'); expect(html).toContain('Charlie');
    expect(html).toContain('Copy TSV'); expect(html).toContain('Copy .md IoC');
    expect(html).toContain('Local miss');
  });
  it('distinguishes persistence warnings from provider failures without dropping scores', () => {
    const html = renderToStaticMarkup(<InvestigationResults results={[
      { ip: '8.8.8.8', status: 'enriched', abuseScore: 98, savedToDb: false, error: 'Provider result retrieved but reputation persistence failed' },
    ]} selected={[]} onSelectionChange={noop} disabled={false} canExport={true} />);
    expect(html).toContain('98%'); expect(html).toContain('enriched');
    expect(html).toContain('Persistence warning'); expect(html).toContain('Not saved');
    expect(html).not.toContain('Not Enriched');
  });
  it('labels backend cached and live checkedAt contracts truthfully and rejects invalid freshness assumptions', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T00:00:00Z'));
    try {
      const render = (row: React.ComponentProps<typeof InvestigationResults>['results'][number]) => renderToStaticMarkup(<InvestigationResults results={[row]} selected={[]} onSelectionChange={noop} disabled={false} canExport={true} />);
      const cached = render({ ip: '8.8.8.8', status: 'cached', source: 'cache', checkedAt: '2026-11-04T12:00:00Z' });
      expect(cached).toContain('Fresh cache'); expect(cached).toContain('2026-11-04T12:00:00Z');
      const live = render({ ip: '8.8.8.8', status: 'enriched', source: 'abuseipdb_live', checkedAt: '2026-11-04T12:00:00Z' });
      expect(live).toContain('Fresh provider result'); expect(live).not.toContain('Freshness unknown');
      const oldLive = render({ ip: '8.8.8.8', status: 'enriched', checkedAt: '2026-01-01T00:00:00Z' });
      expect(oldLive).toContain('Stale provider result');
      for (const checkedAt of [null, 'invalid', '2026-12-01T00:00:00Z']) {
        const invalid = render({ ip: '8.8.8.8', status: 'cached', checkedAt });
        expect(invalid).toContain('Freshness unknown'); expect(invalid).not.toContain('Fresh cache');
      }
    } finally { vi.useRealTimers(); }
  });
  it('renders server-provided freshness and reputation-only score context without inventing freshness', () => {
    const html = renderToStaticMarkup(<InvestigationResults results={[
      { ip: '8.8.8.8', found: true, reputationFresh: false, reputationCheckedAt: '2026-01-01T00:00:00Z' },
      { ip: '1.1.1.1', status: 'enriched', scoreContext: 'reputation-only', abuseScore: 0 },
    ]} selected={[]} onSelectionChange={noop} disabled={false} canExport={false} />);
    expect(html).toContain('Stale cache');
    expect(html).toContain('Reputation only');
    expect(html).toContain('Freshness unknown');
  });
});
