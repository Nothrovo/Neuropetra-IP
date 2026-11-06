import { readFileSync } from 'node:fs';
import ipaddr from 'ipaddr.js';

export type DatabaseScope = 'auth' | 'read' | 'reputation' | 'maintenance';
const databaseKeys: Record<DatabaseScope, string> = {
  auth: 'AUTH_DATABASE_URL', read: 'READ_DATABASE_URL',
  reputation: 'REPUTATION_DATABASE_URL', maintenance: 'MAINTENANCE_DATABASE_URL',
};

/** Docker secrets and direct env are mutually exclusive; error text never contains values. */
export function readSecret(name: string): string | undefined {
  const direct = process.env[name];
  const file = process.env[`${name}_FILE`];
  if (direct && file) throw new Error(`Configure only one source for ${name}`);
  if (file) {
    try {
      const value = readFileSync(file, 'utf8').trim();
      if (!value) throw new Error('empty');
      return value;
    } catch { throw new Error(`Cannot read ${name} secret file`); }
  }
  return direct || undefined;
}

export function databaseUrl(scope: DatabaseScope): string {
  const key = databaseKeys[scope];
  const value = readSecret(key);
  if (!value) throw new Error(`Missing ${key}`);
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
  } catch { throw new Error(`Invalid ${key}`); }
  return value;
}

export function hasDatabase(scope: DatabaseScope): boolean {
  return Boolean(readSecret(databaseKeys[scope]));
}

export function isSafeHttpHost(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  const rawHost = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (!ipaddr.isValid(rawHost)) return false;
  try {
    const range = ipaddr.parse(rawHost).range();
    return range === 'loopback' || range === 'private' || range === 'uniqueLocal';
  } catch {
    return false;
  }
}

export function getAppOrigin(): string {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new Error('Missing APP_ORIGIN');
  try {
    const url = new URL(value);
    const safeHost = isSafeHttpHost(url.hostname);
    if (url.origin !== value || url.username || url.password ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && safeHost))) throw new Error();
    return url.origin;
  } catch { throw new Error('Invalid APP_ORIGIN: use HTTPS or private/loopback HTTP origin without a path'); }
}

export function getCapabilities() {
  return {
    externalEnrichment: process.env.ENABLE_EXTERNAL_ENRICHMENT === 'true' && process.env.USE_MOCK_DATA !== 'true' && Boolean(readSecret('ABUSEIPDB_API_KEY')) && hasDatabase('reputation'),
    maintenance: hasDatabase('maintenance'),
  };
}
