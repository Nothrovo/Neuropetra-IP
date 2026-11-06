import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/authorization', () => ({
  withApiPermission: (handler: (...args: unknown[]) => Promise<Response>) =>
    (request: Request, context: unknown) => handler(request, context, { userId: 'synthetic-merged-reader', role: 'admin' }),
}));

let db: typeof import('../lib/db');
let cache: typeof import('../lib/mock-data').MOCK_IP_CACHE;
let events: typeof import('../lib/mock-data').MOCK_IP_EVENTS;
beforeEach(async () => {
  vi.resetModules();
  db = await import('../lib/db');
  ({ MOCK_IP_CACHE: cache, MOCK_IP_EVENTS: events } = await import('../lib/mock-data'));
});

describe('merged reputation read model in mock mode', () => {
  it.each([
    { label: 'all unknown', scores: [null, null], max: null, avg: null },
    { label: 'known zero', scores: [0, null], max: 0, avg: 0 },
    { label: 'mixed known and unknown', scores: [0, 80, null], max: 80, avg: 40 },
  ])('preserves $label provider scores and VT-only unknown feed scores', async ({ scores, max, avg }) => {
    const provider = 'Synthetic unknown-score provider';
    cache.push(...scores.map((score, index) => ({ ...cache[0], ip: `203.0.113.${230 + index}`,
      isp: provider, abuse_score: score, vt_malicious: 6, total_alert_count: 1,
      last_seen: new Date(Date.now() - 1000).toISOString() })));
    const summary = (await db.searchProviders(provider)).providers[0];
    expect(summary).toMatchObject({ max_abuse_score: max, avg_abuse_score: avg });
    expect((await db.getProviderDetail(provider)).summary).toEqual(summary);
    const feed = await db.getBlocklistData({ minScore: 100 });
    expect(feed.find(row => row.ip === `203.0.113.${229 + scores.length}`)).toMatchObject({ abuse_score: null, vt_malicious: 6 });
    const { serializeFeed } = await import('../lib/export');
    const unknown = feed.filter(row => row.ip === `203.0.113.${229 + scores.length}`);
    expect(serializeFeed(unknown, 'csv')).toContain('"","6"');
    expect(serializeFeed(unknown, 'cdb')).toContain('Score_unknown');
  });

  it('does not invent provider observations for reputation-only records', async () => {
    await db.upsertIpIntelReputation({ ip: '203.0.113.222', abuseScore: 0, isp: 'Synthetic reputation-only provider' });
    const summary = (await db.searchProviders('Synthetic reputation-only provider')).providers[0];
    expect(summary).toMatchObject({ ip_count: 1, total_alerts: 0, last_seen: null, max_abuse_score: 0, avg_abuse_score: 0 });
    expect(await db.getProviderDetail('Synthetic reputation-only provider')).toMatchObject({ summary, attackTypes: [], targetHosts: [] });
    expect((await db.getBlocklistData({ minScore: 0, minAlerts: 0 })).some(row => row.ip === '203.0.113.222')).toBe(false);
    expect((await db.getBlocklistData({ minScore: 0, minAlerts: 0, includeReputation: true })).some(row => row.ip === '203.0.113.222')).toBe(true);
  });

  it('reads a reputation write consistently across IP, provider, roster, export and observed feed without changing telemetry', async () => {
    const ip = '203.0.113.220', provider = 'Synthetic merged provider';
    cache.push({ ...cache[0], ip, isp: 'Synthetic previous provider', abuse_score: null, vt_malicious: 0,
      first_seen: '2026-01-01T00:00:00.000Z', last_seen: new Date(Date.now() - 1000).toISOString(), total_alert_count: 7 });
    const telemetryBefore = structuredClone({ cache, events });
    await db.upsertIpIntelReputation({ ip, abuseScore: 99, isp: provider });
    await db.upsertIpIntelReputation({ ip: '203.0.113.221', abuseScore: 40, isp: provider });
    expect(await db.getIpIntel(ip)).toMatchObject({ abuse_score: 99, isp: provider, total_alert_count: 7 });
    expect((await db.getBulkIntel([ip]))[0]).toMatchObject({ abuse_score: 99, isp: provider });
    const directory = await db.searchProviders(provider);
    expect(directory.total).toBe(1);
    expect(directory.providers[0]).toMatchObject({ ip_count: 2, total_alerts: 7, max_abuse_score: 99, avg_abuse_score: 70 });
    const detail = await db.getProviderDetail(provider);
    expect(detail.summary).toEqual(directory.providers[0]);
    expect(detail.ips.find(row => row.ip === ip)?.abuse_score).toBe(99);
    const roster = await db.getProviderIps(provider);
    expect(roster.total).toBe(2);
    expect(roster.items.find(row => row.ip === '203.0.113.221')).toMatchObject({ first_seen: null, last_seen: null, total_alert_count: 0, attack_types: [], target_hosts: [] });
    expect((await db.getProviderIps('Synthetic previous provider')).total).toBe(0);
    expect((await db.searchProviders('Synthetic previous provider')).total).toBe(0);
    const feed = await db.getBlocklistData({ minScore: 75 });
    expect(feed.find(row => row.ip === ip)?.abuse_score).toBe(99);
    expect(feed.some(row => row.ip === '203.0.113.221')).toBe(false);
    const { GET } = await import('../app/api/providers/[name]/export/route');
    const response = await GET(new Request('http://localhost/api/providers/x/export?format=csv'), { params: Promise.resolve({ name: provider }) });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`"${ip}","99","0","7"`);
    expect({ cache, events }).toEqual(telemetryBefore);
  });
});
