import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppOrigin, readSecret, databaseUrl, getCapabilities } from '../lib/config';

afterEach(() => vi.unstubAllEnvs());
describe('runtime configuration fails closed', () => {
  it('enables external capability only with explicit opt-in, key, writer and real mode',()=>{
    vi.stubEnv('ABUSEIPDB_API_KEY','synthetic-key');vi.stubEnv('ABUSEIPDB_API_KEY_FILE','');vi.stubEnv('REPUTATION_DATABASE_URL','postgresql://synthetic.invalid/db');vi.stubEnv('REPUTATION_DATABASE_URL_FILE','');
    vi.stubEnv('ENABLE_EXTERNAL_ENRICHMENT','false');vi.stubEnv('USE_MOCK_DATA','false');
    expect(getCapabilities().externalEnrichment).toBe(false);
    vi.stubEnv('ENABLE_EXTERNAL_ENRICHMENT','true');expect(getCapabilities().externalEnrichment).toBe(true);
    vi.stubEnv('USE_MOCK_DATA','true');expect(getCapabilities().externalEnrichment).toBe(false);
  });
  it('requires explicit scoped database DSNs, never a pg fallback', () => {
    vi.stubEnv('AUTH_DATABASE_URL', ''); vi.stubEnv('AUTH_DATABASE_URL_FILE', '');
    vi.stubEnv('DATABASE_URL', 'postgresql://must-not-fallback.invalid/db');
    expect(() => databaseUrl('auth')).toThrow('AUTH_DATABASE_URL');
  });
  it('requires a canonical safe origin and permits plain HTTP only on loopback', () => {
    vi.stubEnv('APP_ORIGIN', ''); expect(() => getAppOrigin()).toThrow();
    vi.stubEnv('APP_ORIGIN', 'http://example.invalid'); expect(() => getAppOrigin()).toThrow();
    vi.stubEnv('APP_ORIGIN', 'https://example.invalid/path'); expect(() => getAppOrigin()).toThrow();
    vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3000'); expect(getAppOrigin()).toBe('http://127.0.0.1:3000');
  });
  it('rejects conflicting secret sources and malformed DSNs without exposing values', () => {
    vi.stubEnv('SYNTHETIC_SECRET', 'private-marker'); vi.stubEnv('SYNTHETIC_SECRET_FILE', '/not-used');
    expect(() => readSecret('SYNTHETIC_SECRET')).toThrow('Configure only one');
    vi.stubEnv('AUTH_DATABASE_URL', 'private-marker');
    vi.stubEnv('AUTH_DATABASE_URL_FILE', '');
    expect(() => databaseUrl('auth')).toThrow('Invalid AUTH_DATABASE_URL');
  });
});
