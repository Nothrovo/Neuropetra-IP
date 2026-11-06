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
  it('requires a canonical safe origin and permits plain HTTP on loopback and private LAN', () => {
    vi.stubEnv('APP_ORIGIN', ''); expect(() => getAppOrigin()).toThrow();
    vi.stubEnv('APP_ORIGIN', 'http://example.invalid'); expect(() => getAppOrigin()).toThrow();
    vi.stubEnv('APP_ORIGIN', 'http://8.8.8.8:3000'); expect(() => getAppOrigin()).toThrow();
    vi.stubEnv('APP_ORIGIN', 'http://169.254.169.254:3000'); expect(() => getAppOrigin()).toThrow();
    vi.stubEnv('APP_ORIGIN', 'http://[fe80::1]:3000'); expect(() => getAppOrigin()).toThrow();
    vi.stubEnv('APP_ORIGIN', 'https://example.invalid/path'); expect(() => getAppOrigin()).toThrow();
    vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3000'); expect(getAppOrigin()).toBe('http://127.0.0.1:3000');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000'); expect(getAppOrigin()).toBe('http://localhost:3000');
    vi.stubEnv('APP_ORIGIN', 'http://[::1]:3000'); expect(getAppOrigin()).toBe('http://[::1]:3000');
    vi.stubEnv('APP_ORIGIN', 'http://10.20.100.117:3000'); expect(getAppOrigin()).toBe('http://10.20.100.117:3000');
    vi.stubEnv('APP_ORIGIN', 'http://192.168.1.50:3000'); expect(getAppOrigin()).toBe('http://192.168.1.50:3000');
    vi.stubEnv('APP_ORIGIN', 'http://[fd00::1]:3000'); expect(getAppOrigin()).toBe('http://[fd00::1]:3000');
    vi.stubEnv('APP_ORIGIN', 'https://example.invalid'); expect(getAppOrigin()).toBe('https://example.invalid');
  });
  it('rejects conflicting secret sources and malformed DSNs without exposing values', () => {
    vi.stubEnv('SYNTHETIC_SECRET', 'private-marker'); vi.stubEnv('SYNTHETIC_SECRET_FILE', '/not-used');
    expect(() => readSecret('SYNTHETIC_SECRET')).toThrow('Configure only one');
    vi.stubEnv('AUTH_DATABASE_URL', 'private-marker');
    vi.stubEnv('AUTH_DATABASE_URL_FILE', '');
    expect(() => databaseUrl('auth')).toThrow('Invalid AUTH_DATABASE_URL');
  });
});
