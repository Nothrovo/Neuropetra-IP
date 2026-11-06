import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getActiveEnrichmentConfig,
  testAbuseIpDbConnection,
} from '../lib/enrichment-settings';

describe('enrichment settings management', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('falls back cleanly to environment variables when database is not populated', async () => {
    vi.stubEnv('ENABLE_EXTERNAL_ENRICHMENT', 'true');
    vi.stubEnv('ABUSEIPDB_API_KEY', 'test-api-key-12345678');

    const config = await getActiveEnrichmentConfig();
    expect(config.hasKey).toBe(true);
    expect(config.enabled).toBe(true);
    expect(config.source).toBe('environment');
    expect(config.maskedKey).toContain('••••');
    expect(config.maskedKey).not.toBe('test-api-key-12345678');
  });

  it('reports disabled when environment variables are unset', async () => {
    vi.stubEnv('ENABLE_EXTERNAL_ENRICHMENT', 'false');
    vi.stubEnv('ABUSEIPDB_API_KEY', '');

    const config = await getActiveEnrichmentConfig();
    expect(config.enabled).toBe(false);
    expect(config.hasKey).toBe(false);
    expect(config.maskedKey).toBeNull();
  });

  it('tests AbuseIPDB connection and returns valid status on 200 OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: { ipAddress: '1.1.1.1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testAbuseIpDbConnection('dummy-key-for-test-12345');
    expect(result.success).toBe(true);
    expect(result.status).toBe('valid');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api.abuseipdb.com'),
      expect.objectContaining({
        headers: expect.objectContaining({ Key: 'dummy-key-for-test-12345' }),
      })
    );
  });

  it('detects invalid API key when AbuseIPDB returns 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testAbuseIpDbConnection('bad-key');
    expect(result.success).toBe(false);
    expect(result.status).toBe('invalid_key');
  });

  it('detects rate limits when AbuseIPDB returns 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testAbuseIpDbConnection('quota-exceeded-key');
    expect(result.success).toBe(false);
    expect(result.status).toBe('rate_limited');
  });
});
