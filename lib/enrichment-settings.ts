import { getAuthPool } from './db-pool';
import { readSecret, hasDatabase } from './config';

export interface EnrichmentConfig {
  enabled: boolean;
  hasKey: boolean;
  maskedKey: string | null;
  source: 'database' | 'environment' | 'none';
}

function maskKey(key: string): string {
  const clean = key.trim();
  if (clean.length <= 8) return '••••••••';
  return clean.slice(0, 4) + '•'.repeat(Math.max(4, clean.length - 8)) + clean.slice(-4);
}

export async function getActiveEnrichmentConfig(): Promise<EnrichmentConfig> {
  const envKey = readSecret('ABUSEIPDB_API_KEY')?.trim() || null;
  const envEnabled = process.env.ENABLE_EXTERNAL_ENRICHMENT === 'true';

  try {
    const res = await getAuthPool().query<{
      abuseipdb_api_key: string | null;
      external_enrichment_enabled: boolean | null;
    }>('SELECT abuseipdb_api_key, external_enrichment_enabled FROM ip_intel_installation WHERE singleton');

    if (res.rows.length > 0) {
      const dbRow = res.rows[0];
      const dbKey = dbRow.abuseipdb_api_key?.trim() || null;
      const dbEnabled = dbRow.external_enrichment_enabled === true;

      // DB-configured key takes precedence
      if (dbKey) {
        return {
          enabled: dbEnabled,
          hasKey: true,
          maskedKey: maskKey(dbKey),
          source: 'database',
        };
      }

      // If key is only in env, but user toggled enabled in DB
      if (envKey && dbRow.external_enrichment_enabled !== null) {
        return {
          enabled: dbEnabled,
          hasKey: true,
          maskedKey: maskKey(envKey),
          source: 'environment',
        };
      }
    }
  } catch {
    // Column might not exist yet before migration
  }

  return {
    enabled: envEnabled && Boolean(envKey),
    hasKey: Boolean(envKey),
    maskedKey: envKey ? maskKey(envKey) : null,
    source: envKey ? 'environment' : 'none',
  };
}

export async function getActiveApiKey(): Promise<string | null> {
  try {
    const res = await getAuthPool().query<{ abuseipdb_api_key: string | null }>(
      'SELECT abuseipdb_api_key FROM ip_intel_installation WHERE singleton'
    );
    if (res.rows.length > 0 && res.rows[0].abuseipdb_api_key?.trim()) {
      return res.rows[0].abuseipdb_api_key.trim();
    }
  } catch {}
  return readSecret('ABUSEIPDB_API_KEY')?.trim() || null;
}

export async function isEnrichmentActive(): Promise<boolean> {
  if (process.env.USE_MOCK_DATA === 'true') return false;
  if (!hasDatabase('reputation')) return false;
  const config = await getActiveEnrichmentConfig();
  return config.enabled && config.hasKey;
}

export async function saveEnrichmentConfig(input: { enabled: boolean; apiKey?: string | null }): Promise<void> {
  const pool = getAuthPool();
  if (input.apiKey !== undefined) {
    const cleanKey = typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey.trim() : null;
    await pool.query(
      'UPDATE ip_intel_installation SET external_enrichment_enabled = $1, abuseipdb_api_key = $2 WHERE singleton',
      [input.enabled, cleanKey]
    );
  } else {
    await pool.query(
      'UPDATE ip_intel_installation SET external_enrichment_enabled = $1 WHERE singleton',
      [input.enabled]
    );
  }
}

export async function testAbuseIpDbConnection(apiKeyToTest?: string): Promise<{ success: boolean; status: string; message: string }> {
  const key = apiKeyToTest?.trim() || await getActiveApiKey();
  if (!key) {
    return { success: false, status: 'missing_key', message: 'No API key provided or configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch('https://api.abuseipdb.com/api/v2/check?ipAddress=1.1.1.1&maxAgeInDays=90', {
      method: 'GET',
      headers: { Key: key, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (res.status === 200) {
      return { success: true, status: 'valid', message: 'API key verified successfully. AbuseIPDB responded 200 OK.' };
    }
    if (res.status === 401 || res.status === 403) {
      return { success: false, status: 'invalid_key', message: 'AbuseIPDB rejected the API key (401 Unauthorized).' };
    }
    if (res.status === 429) {
      return { success: false, status: 'rate_limited', message: 'AbuseIPDB rate limit or daily quota reached (429).' };
    }
    return { success: false, status: 'error', message: `AbuseIPDB returned HTTP ${res.status}` };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, status: 'timeout', message: 'Connection to AbuseIPDB timed out (6s).' };
    }
    return { success: false, status: 'network_error', message: 'Network connection to AbuseIPDB failed.' };
  } finally {
    clearTimeout(timer);
  }
}

