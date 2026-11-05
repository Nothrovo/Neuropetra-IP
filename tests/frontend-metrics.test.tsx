import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseQueryOptions } from '@tanstack/react-query';
import HomePage from '../app/page';
import DashboardPage from '../app/dashboard/page';
import ProviderDetailPage from '../app/providers/[name]/page';
import ProvidersPage from '../app/providers/page';
import ScoreGauge from '../components/ScoreGauge';
import { calculateVerdictScore } from '../lib/scoring';

const state = vi.hoisted(() => ({ data: {} as unknown, error: false, query: {} as UseQueryOptions, offset: 0 }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: UseQueryOptions) => { state.query = options; return { data: state.data, isLoading: false, isError: state.error }; } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, use: () => ({ name: 'Synthetic ISP' }), useState: (initial: unknown) => actual.useState(initial === 0 ? state.offset : initial) };
});
vi.mock('recharts', () => ({ ResponsiveContainer: () => null, BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null }));
const provider = { isp: 'Synthetic ISP', ip_count: 201, total_alerts: 0, avg_abuse_score: null, max_abuse_score: null, countries: [], asns: [], last_seen: null };
const indicator = { ip: '203.0.113.1', abuse_score: null, vt_malicious: null, total_alert_count: 0, attack_types: [], last_seen: null };

beforeEach(() => { state.data = {}; state.error = false; state.offset = 0; });
describe('truthful frontend telemetry', () => {
  it('preserves zero alert counts on the home feed and advertises exact IP only', () => {
    state.data = { stats: {}, topAttackers: [{ ...indicator, isp: null }], recentEvents: [] };
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain('Threat Triage');
    expect(html).toMatch(/font-tabular">0<\/td>/);
    expect(html).not.toContain('CIDR');
    expect(html).toContain('/investigate?mode=local');
    expect(html).toContain('/investigate?mode=external');
  });
  it('labels dashboard countries as scoped events and ISP aggregates honestly', () => {
    state.data = { scope: { from: '2026-01-01T00:00:00Z', to: '2026-01-31T00:00:00Z' }, topCountries: [{ code: 'XX', count: 4 }], topAsns: [{ name: 'Synthetic ISP', count: 4 }] };
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).not.toContain('Unique IPs');
    expect(html).toContain('4 events');
    expect(html).toContain('Top ISPs');
    expect(html).toContain('Synthetic ISP');
    expect(html).toContain('UTC');
  });
  it('shows provider roster page scope, zero alerts and unknown observations', () => {
    state.data = { provider, ips: [indicator], total: 201, limit: 100, offset: 0, hasMore: true, attackTypes: [], targetHosts: [] };
    const html = renderToStaticMarkup(<ProviderDetailPage params={Promise.resolve({ name: 'Synthetic ISP' })} />);
    expect(html).toContain('Copy page (1)');
    expect(html).toContain('Filter this page');
    expect(html).toContain('Sort page');
    expect(html).toContain('Next page');
    expect(html).toContain('Unknown');
    expect(html).not.toContain('1970');
    expect(html).toMatch(/font-tabular">0<\/td>/);
  });
  it('distinguishes provider request failure from a missing provider', () => {
    state.error = true;
    const html = renderToStaticMarkup(<ProviderDetailPage params={Promise.resolve({ name: 'Synthetic ISP' })} />);
    expect(html).toContain('Failed to load provider details');
    expect(html).not.toContain('Provider Not Found');
  });
  it('includes the current roster offset in both request and cache identity', async () => {
    state.offset = 100;
    state.data = { provider, ips: [indicator], total: 201, limit: 100, offset: 100, hasMore: true, attackTypes: [], targetHosts: [] };
    renderToStaticMarkup(<ProviderDetailPage params={Promise.resolve({ name: 'Synthetic ISP' })} />);
    expect(state.query.queryKey).toContain(100);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(state.data));
    await (state.query.queryFn as () => Promise<unknown>)();
    expect(String(fetchMock.mock.calls[0][0])).toContain('offset=100');
    fetchMock.mockRestore();
  });
  it('labels provider directory summaries as current-page values and offers paging', () => {
    state.data = { providers: [provider], total: 201, limit: 100, offset: 0 };
    const html = renderToStaticMarkup(<ProvidersPage />);
    expect(html).toContain('Page IPs');
    expect(html).toContain('Next page');
  });
  it('does not label analytics request errors as empty data', () => {
    state.error = true;
    expect(renderToStaticMarkup(<DashboardPage />)).toContain('Failed to load dashboard data');
    expect(renderToStaticMarkup(<HomePage />)).toContain('Failed to load SOC statistics');
  });
  it('does not turn missing VT into zero detections or claim zero is clean', () => {
    const scoring = calculateVerdictScore({ abuseScore: null, vtMalicious: null, totalAlertCount: 0, lastSeen: null, hasCriticalOutcome: false });
    const html = renderToStaticMarkup(<ScoreGauge scoring={scoring} />);
    expect(html).not.toContain('0 (Clean)');
    expect(html).toMatch(/VirusTotal Normalized Signal<\/span><span[^>]*>N\/A<\/span>/);
    expect(html).toContain('N/A');
  });
});
