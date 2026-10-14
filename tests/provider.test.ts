import { describe, it, expect, beforeAll } from 'vitest';

describe('Provider Intelligence Repository (Mock Mode)', () => {
  let searchProviders: typeof import('../lib/db').searchProviders;
  let getProviderDetail: typeof import('../lib/db').getProviderDetail;

  beforeAll(async () => {
    process.env.USE_MOCK_DATA = 'true';
    const db = await import('../lib/db');
    searchProviders = db.searchProviders;
    getProviderDetail = db.getProviderDetail;
  });

  it('searches providers with empty query and returns top providers', async () => {
    const { providers, total } = await searchProviders('', 10, 0);

    expect(total).toBeGreaterThan(0);
    expect(providers.length).toBeLessThanOrEqual(10);
    expect(providers[0]).toHaveProperty('isp');
    expect(providers[0]).toHaveProperty('ip_count');
    expect(providers[0]).toHaveProperty('total_alerts');
    expect(providers[0]).toHaveProperty('avg_abuse_score');
    expect(providers[0].total_alerts).toBeGreaterThanOrEqual(providers[providers.length - 1].total_alerts);
  });

  it('filters providers by ISP name substring (case-insensitive)', async () => {
    const { providers } = await searchProviders('tor', 10, 0);

    expect(providers.length).toBeGreaterThan(0);
    const hasTor = providers.some((p) => p.isp.toLowerCase().includes('tor'));
    expect(hasTor).toBe(true);
  });

  it('filters providers by ASN substring', async () => {
    const { providers } = await searchProviders('AS208294', 10, 0);

    expect(providers.length).toBeGreaterThan(0);
    const hasAsn = providers.some((p) => p.asns.some((a) => a.includes('AS208294')));
    expect(hasAsn).toBe(true);
  });

  it('retrieves detailed provider forensic information and IP roster', async () => {
    const detail = await getProviderDetail('Tor Exit Node Relay Operator');

    expect(detail.summary).not.toBeNull();
    expect(detail.summary?.isp).toBe('Tor Exit Node Relay Operator');
    expect(detail.ips.length).toBeGreaterThan(0);
    expect(detail.attackTypes.length).toBeGreaterThan(0);
    expect(detail.targetHosts.length).toBeGreaterThan(0);
  });

  it('returns empty details for non-existent provider', async () => {
    const detail = await getProviderDetail('NonExistentISP_123456789');

    expect(detail.summary).toBeNull();
    expect(detail.ips).toHaveLength(0);
    expect(detail.attackTypes).toHaveLength(0);
  });
});
