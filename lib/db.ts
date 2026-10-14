/**
 * Database client and repository queries.
 * Enforces server-side execution, parameterized queries, and read-only behavior.
 */

import { Pool } from 'pg';
import { MOCK_IP_CACHE, MOCK_IP_EVENTS, IpIntelCacheRow, IpIntelEventRow } from './mock-data';

const isMock = process.env.USE_MOCK_DATA === 'true';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL || 'postgresql://soc_readonly:REDACTED_PASSWORD@127.0.0.1:5432/abuseip';

    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]', err);
    });
  }
  return pool;
}

/**
 * Execute a read-only parameterized query against PostgreSQL.
 */
export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  if (isMock) {
    throw new Error('Direct query called in mock mode. Use repository methods.');
  }

  // Safety check: ensure query is strictly a SELECT
  const trimmed = text.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
    throw new Error('Security Violation: Only SELECT/WITH read-only queries are permitted.');
  }

  const client = await getPool().connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } finally {
    client.release();
  }
}

// -------------------------------------------------------------
// REPOSITORY METHODS
// -------------------------------------------------------------

export async function getIpIntel(ip: string): Promise<IpIntelCacheRow | null> {
  const cleanIp = ip.trim();
  if (isMock) {
    const found = MOCK_IP_CACHE.find((item) => item.ip === cleanIp);
    return found ? { ...found } : null;
  }

  const rows = await query<IpIntelCacheRow>(
    `SELECT ip, first_seen, last_seen, last_alert_id, reputation_source,
            abuse_score, vt_malicious, country_code, isp, geo_json,
            reputation_json, attack_types, mitre_tactics, target_hosts,
            endpoints_targeted, http_methods_used, total_alert_count,
            notes, reputation_checked_at
       FROM ip_intel_cache
      WHERE ip = $1
      LIMIT 1`,
    [cleanIp]
  );

  return rows[0] || null;
}

export interface EventsFilter {
  limit?: number;
  offset?: number;
  alertType?: string;
  outcome?: string;
  targetHost?: string;
  days?: number;
}

export async function getIpEvents(
  ip: string,
  filter: EventsFilter = {}
): Promise<{ events: IpIntelEventRow[]; total: number }> {
  const cleanIp = ip.trim();
  const limit = Math.min(100, Math.max(1, filter.limit || 20));
  const offset = Math.max(0, filter.offset || 0);

  if (isMock) {
    let list = MOCK_IP_EVENTS.filter((e) => e.ip === cleanIp);
    if (filter.alertType) {
      list = list.filter((e) => e.alert_type === filter.alertType);
    }
    if (filter.targetHost) {
      list = list.filter((e) => e.target_host === filter.targetHost);
    }
    if (filter.outcome) {
      list = list.filter((e) => e.outcome === filter.outcome);
    }
    const total = list.length;
    const paginated = list
      .sort((a, b) => new Date(b.seen_at).getTime() - new Date(a.seen_at).getTime())
      .slice(offset, offset + limit);
    return { events: paginated, total };
  }

  const conditions: string[] = ['ip = $1'];
  const params: any[] = [cleanIp];
  let paramIdx = 2;

  if (filter.alertType) {
    conditions.push(`alert_type = $${paramIdx++}`);
    params.push(filter.alertType);
  }
  if (filter.targetHost) {
    conditions.push(`target_host = $${paramIdx++}`);
    params.push(filter.targetHost);
  }
  if (filter.outcome) {
    conditions.push(`outcome = $${paramIdx++}`);
    params.push(filter.outcome);
  }
  if (filter.days) {
    conditions.push(`seen_at >= NOW() - ($${paramIdx++} || ' days')::INTERVAL`);
    params.push(filter.days.toString());
  }

  const whereClause = conditions.join(' AND ');

  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ip_intel_events WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRows[0]?.count || '0', 10);

  const dataParams = [...params, limit, offset];
  const events = await query<IpIntelEventRow>(
    `SELECT id, ip, seen_at, alert_type, attack_subtype, mitre,
            target_host, endpoint, outcome, raw_summary
       FROM ip_intel_events
      WHERE ${whereClause}
      ORDER BY seen_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    dataParams
  );

  return { events, total };
}

export async function getTopAttackers(limit: number = 10): Promise<IpIntelCacheRow[]> {
  const safeLimit = Math.min(100, Math.max(1, limit));
  if (isMock) {
    return [...MOCK_IP_CACHE]
      .sort((a, b) => b.total_alert_count - a.total_alert_count)
      .slice(0, safeLimit);
  }

  return query<IpIntelCacheRow>(
    `SELECT ip, first_seen, last_seen, reputation_source,
            abuse_score, vt_malicious, country_code, isp,
            attack_types, mitre_tactics, target_hosts, total_alert_count
       FROM ip_intel_cache
      ORDER BY total_alert_count DESC, abuse_score DESC NULLS LAST
      LIMIT $1`,
    [safeLimit]
  );
}

export async function getRecentEvents(limit: number = 10): Promise<IpIntelEventRow[]> {
  const safeLimit = Math.min(100, Math.max(1, limit));
  if (isMock) {
    return [...MOCK_IP_EVENTS]
      .sort((a, b) => new Date(b.seen_at).getTime() - new Date(a.seen_at).getTime())
      .slice(0, safeLimit);
  }

  return query<IpIntelEventRow>(
    `SELECT id, ip, seen_at, alert_type, attack_subtype, mitre,
            target_host, endpoint, outcome, raw_summary
       FROM ip_intel_events
      ORDER BY seen_at DESC
      LIMIT $1`,
    [safeLimit]
  );
}

export interface GlobalStats {
  ipsTracked: number;
  maliciousCount: number;
  events24h: number;
  events7d: number;
  events30d: number;
  distinctTargetHosts: number;
}

export async function getGlobalStats(): Promise<GlobalStats> {
  if (isMock) {
    return {
      ipsTracked: MOCK_IP_CACHE.length,
      maliciousCount: MOCK_IP_CACHE.filter((c) => (c.abuse_score || 0) >= 75).length,
      events24h: MOCK_IP_EVENTS.filter((e) => Date.now() - new Date(e.seen_at).getTime() < 86400000).length,
      events7d: MOCK_IP_EVENTS.filter((e) => Date.now() - new Date(e.seen_at).getTime() < 7 * 86400000).length,
      events30d: MOCK_IP_EVENTS.length,
      distinctTargetHosts: new Set(MOCK_IP_CACHE.flatMap((c) => c.target_hosts)).size,
    };
  }

  const [cacheCounts, event24hRow, event7dRow, event30dRow, hostsRow] = await Promise.all([
    query<{ total: string; malicious: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE abuse_score >= 75 OR vt_malicious >= 5) AS malicious
         FROM ip_intel_cache`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ip_intel_events WHERE seen_at >= NOW() - INTERVAL '24 hours'`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ip_intel_events WHERE seen_at >= NOW() - INTERVAL '7 days'`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ip_intel_events WHERE seen_at >= NOW() - INTERVAL '30 days'`
    ),
    query<{ count: string }>(
      `SELECT COUNT(DISTINCT h) AS count
         FROM (SELECT unnest(target_hosts) AS h FROM ip_intel_cache) sub`
    ),
  ]);

  return {
    ipsTracked: parseInt(cacheCounts[0]?.total || '0', 10),
    maliciousCount: parseInt(cacheCounts[0]?.malicious || '0', 10),
    events24h: parseInt(event24hRow[0]?.count || '0', 10),
    events7d: parseInt(event7dRow[0]?.count || '0', 10),
    events30d: parseInt(event30dRow[0]?.count || '0', 10),
    distinctTargetHosts: parseInt(hostsRow[0]?.count || '0', 10),
  };
}

export async function getBulkIntel(ips: string[]): Promise<IpIntelCacheRow[]> {
  if (ips.length === 0) return [];
  const cleanIps = ips.map((ip) => ip.trim()).filter(Boolean);

  if (isMock) {
    return MOCK_IP_CACHE.filter((c) => cleanIps.includes(c.ip));
  }

  return query<IpIntelCacheRow>(
    `SELECT ip, first_seen, last_seen, reputation_source,
            abuse_score, vt_malicious, country_code, isp, geo_json,
            attack_types, mitre_tactics, target_hosts, total_alert_count
       FROM ip_intel_cache
      WHERE ip = ANY($1)`,
    [cleanIps]
  );
}

export async function getRelatedIps(
  currentIp: string,
  subnet24: string | null,
  isp: string | null
): Promise<IpIntelCacheRow[]> {
  if (isMock) {
    return MOCK_IP_CACHE.filter((c) => c.ip !== currentIp && (c.isp === isp || (subnet24 && c.ip.startsWith(subnet24.slice(0, 10)))));
  }

  const prefix = subnet24 ? subnet24.replace('.0/24', '') : null;
  return query<IpIntelCacheRow>(
    `SELECT ip, abuse_score, vt_malicious, country_code, isp, total_alert_count, last_seen
       FROM ip_intel_cache
      WHERE ip != $1
        AND (
          ($2::text IS NOT NULL AND ip LIKE $2 || '.%')
          OR ($3::text IS NOT NULL AND isp = $3)
        )
      ORDER BY total_alert_count DESC
      LIMIT 10`,
    [currentIp, prefix, isp]
  );
}

export async function getBlocklistData(options: {
  minScore?: number;
  minAlerts?: number;
  maxAgeDays?: number;
}): Promise<{ ip: string; abuse_score: number; total_alert_count: number; country_code: string; attack_types: string[] }[]> {
  const minScore = options.minScore || 75;
  const minAlerts = options.minAlerts || 1;
  const maxAgeDays = options.maxAgeDays || 30;

  if (isMock) {
    return MOCK_IP_CACHE.filter(
      (c) => (c.abuse_score || 0) >= minScore && c.total_alert_count >= minAlerts
    ).map((c) => ({
      ip: c.ip,
      abuse_score: c.abuse_score || 0,
      total_alert_count: c.total_alert_count,
      country_code: c.country_code || 'XX',
      attack_types: c.attack_types || [],
    }));
  }

  return query(
    `SELECT ip, abuse_score, total_alert_count, country_code, attack_types
       FROM ip_intel_cache
      WHERE (abuse_score >= $1 OR vt_malicious >= 5)
        AND total_alert_count >= $2
        AND last_seen >= NOW() - ($3 || ' days')::INTERVAL
      ORDER BY total_alert_count DESC, abuse_score DESC`,
    [minScore, minAlerts, maxAgeDays.toString()]
  );
}

export async function getDashboardAnalytics(days: number = 30) {
  if (isMock) {
    return {
      topCountries: [
        { code: 'DE', count: 1 },
        { code: 'RU', count: 1 },
        { code: 'NL', count: 1 },
        { code: 'ID', count: 1 },
        { code: 'US', count: 1 },
      ],
      topAsns: [
        { name: 'AS208294 Tor Network', count: 1 },
        { name: 'AS57523 Hostkey', count: 1 },
        { name: 'AS50673 Serverius', count: 1 },
        { name: 'AS24434 Telkomsel', count: 1 },
      ],
      topAttackTypes: [
        { type: 'path_traversal', count: 3 },
        { type: 'sql_injection', count: 2 },
        { type: 'command_injection', count: 1 },
      ],
      topMitre: [
        { id: 'T1190', name: 'Exploit Public-Facing Application', count: 3 },
        { id: 'T1595.002', name: 'Vulnerability Scanning', count: 2 },
        { id: 'T1083', name: 'File and Directory Discovery', count: 2 },
      ],
      outcomeDistribution: [
        { outcome: 'blocked', count: 3 },
        { outcome: 'failed', count: 1 },
        { outcome: 'unspecified', count: 4 },
      ],
      timeline: [
        { date: 'Day -5', attacks: 12 },
        { date: 'Day -4', attacks: 25 },
        { date: 'Day -3', attacks: 18 },
        { date: 'Day -2', attacks: 42 },
        { date: 'Day -1', attacks: 31 },
        { date: 'Today', attacks: 15 },
      ],
    };
  }

  const [countries, attackTypes, mitre, outcomes, timeline] = await Promise.all([
    query<{ code: string; count: string }>(
      `SELECT country_code AS code, COUNT(*) AS count
         FROM ip_intel_cache
        WHERE country_code IS NOT NULL
        GROUP BY country_code
        ORDER BY count DESC
        LIMIT 10`
    ),
    query<{ type: string; count: string }>(
      `SELECT unnest(attack_types) AS type, COUNT(*) AS count
         FROM ip_intel_cache
        GROUP BY type
        ORDER BY count DESC
        LIMIT 10`
    ),
    query<{ id: string; count: string }>(
      `SELECT unnest(mitre_tactics) AS id, COUNT(*) AS count
         FROM ip_intel_cache
        GROUP BY id
        ORDER BY count DESC
        LIMIT 10`
    ),
    query<{ outcome: string; count: string }>(
      `SELECT COALESCE(outcome, 'unspecified') AS outcome, COUNT(*) AS count
         FROM ip_intel_events
        GROUP BY outcome
        ORDER BY count DESC`
    ),
    query<{ date: string; count: string }>(
      `SELECT TO_CHAR(seen_at, 'YYYY-MM-DD') AS date, COUNT(*) AS count
         FROM ip_intel_events
        WHERE seen_at >= NOW() - ($1 || ' days')::INTERVAL
        GROUP BY date
        ORDER BY date ASC`,
      [days.toString()]
    ),
  ]);

  return {
    topCountries: countries.map((c) => ({ code: c.code, count: parseInt(c.count, 10) })),
    topAttackTypes: attackTypes.map((a) => ({ type: a.type, count: parseInt(a.count, 10) })),
    topMitre: mitre.map((m) => ({ id: m.id, count: parseInt(m.count, 10) })),
    outcomeDistribution: outcomes.map((o) => ({ outcome: o.outcome, count: parseInt(o.count, 10) })),
    timeline: timeline.map((t) => ({ date: t.date, attacks: parseInt(t.count, 10) })),
  };
}

export interface ProviderSummary {
  isp: string;
  ip_count: number;
  total_alerts: number;
  max_abuse_score: number;
  avg_abuse_score: number;
  countries: string[];
  asns: string[];
  last_seen: string;
}

export interface ProviderDetail {
  summary: ProviderSummary | null;
  attackTypes: { type: string; count: number }[];
  targetHosts: { host: string; count: number }[];
  ips: IpIntelCacheRow[];
}

export async function searchProviders(
  searchQuery: string = '',
  limit: number = 20,
  offset: number = 0
): Promise<{ providers: ProviderSummary[]; total: number }> {
  const clean = searchQuery.trim();
  const safeLimit = Math.min(100, Math.max(1, limit));
  const safeOffset = Math.max(0, offset);

  if (isMock) {
    const s = clean.toLowerCase();
    const map = new Map<string, {
      isp: string;
      ips: string[];
      total_alerts: number;
      scores: number[];
      countries: Set<string>;
      asns: Set<string>;
      last_seen: string;
    }>();

    for (const row of MOCK_IP_CACHE) {
      if (!row.isp) continue;
      const matches =
        !clean ||
        row.isp.toLowerCase().includes(s) ||
        (row.geo_json?.as && row.geo_json.as.toLowerCase().includes(s));

      if (!matches) continue;

      if (!map.has(row.isp)) {
        map.set(row.isp, {
          isp: row.isp,
          ips: [],
          total_alerts: 0,
          scores: [],
          countries: new Set(),
          asns: new Set(),
          last_seen: row.last_seen,
        });
      }

      const p = map.get(row.isp)!;
      p.ips.push(row.ip);
      p.total_alerts += row.total_alert_count || 1;
      if (row.abuse_score !== null) p.scores.push(row.abuse_score);
      if (row.country_code) p.countries.add(row.country_code);
      if (row.geo_json?.as) p.asns.add(row.geo_json.as);
      if (new Date(row.last_seen) > new Date(p.last_seen)) {
        p.last_seen = row.last_seen;
      }
    }

    const all = Array.from(map.values())
      .map((p) => ({
        isp: p.isp,
        ip_count: p.ips.length,
        total_alerts: p.total_alerts,
        max_abuse_score: p.scores.length > 0 ? Math.max(...p.scores) : 0,
        avg_abuse_score:
          p.scores.length > 0 ? Math.round(p.scores.reduce((a, b) => a + b, 0) / p.scores.length) : 0,
        countries: Array.from(p.countries),
        asns: Array.from(p.asns),
        last_seen: p.last_seen,
      }))
      .sort((a, b) => b.total_alerts - a.total_alerts || b.ip_count - a.ip_count);

    return {
      providers: all.slice(safeOffset, safeOffset + safeLimit),
      total: all.length,
    };
  }

  const [countRes, listRes] = await Promise.all([
    query<{ total: string }>(
      `SELECT COUNT(DISTINCT isp) AS total
         FROM ip_intel_cache
        WHERE isp IS NOT NULL
          AND ($1 = '' OR isp ILIKE '%' || $1 || '%' OR (geo_json->>'as') ILIKE '%' || $1 || '%')`,
      [clean]
    ),
    query<{
      isp: string;
      ip_count: string;
      total_alerts: string;
      max_abuse_score: string;
      avg_abuse_score: string;
      countries: string[];
      asns: string[];
      last_seen: string;
    }>(
      `SELECT isp,
              COUNT(*)::int AS ip_count,
              SUM(total_alert_count)::int AS total_alerts,
              MAX(abuse_score)::int AS max_abuse_score,
              ROUND(AVG(COALESCE(abuse_score, 0)))::int AS avg_abuse_score,
              ARRAY_AGG(DISTINCT country_code) FILTER (WHERE country_code IS NOT NULL) AS countries,
              ARRAY_AGG(DISTINCT (geo_json->>'as')) FILTER (WHERE geo_json->>'as' IS NOT NULL) AS asns,
              MAX(last_seen) AS last_seen
         FROM ip_intel_cache
        WHERE isp IS NOT NULL
          AND ($1 = '' OR isp ILIKE '%' || $1 || '%' OR (geo_json->>'as') ILIKE '%' || $1 || '%')
        GROUP BY isp
        ORDER BY total_alerts DESC, ip_count DESC
        LIMIT $2 OFFSET $3`,
      [clean, safeLimit, safeOffset]
    ),
  ]);

  const total = parseInt(countRes[0]?.total || '0', 10);
  const providers: ProviderSummary[] = listRes.map((r) => ({
    isp: r.isp,
    ip_count: parseInt(r.ip_count, 10),
    total_alerts: parseInt(r.total_alerts, 10),
    max_abuse_score: parseInt(r.max_abuse_score || '0', 10),
    avg_abuse_score: parseInt(r.avg_abuse_score || '0', 10),
    countries: r.countries || [],
    asns: r.asns || [],
    last_seen: r.last_seen,
  }));

  return { providers, total };
}

export async function getProviderDetail(ispName: string): Promise<ProviderDetail> {
  const cleanIsp = ispName.trim();

  if (isMock) {
    const ips = MOCK_IP_CACHE.filter((c) => c.isp === cleanIsp);
    if (ips.length === 0) {
      return { summary: null, attackTypes: [], targetHosts: [], ips: [] };
    }

    const scores = ips.map((c) => c.abuse_score || 0);
    const totalAlerts = ips.reduce((sum, c) => sum + (c.total_alert_count || 1), 0);
    const countries = Array.from(new Set(ips.map((c) => c.country_code).filter(Boolean))) as string[];
    const asns = Array.from(new Set(ips.map((c) => c.geo_json?.as).filter(Boolean))) as string[];
    const lastSeen = ips.reduce((latest, c) => (c.last_seen > latest ? c.last_seen : latest), ips[0].last_seen);

    const attackMap = new Map<string, number>();
    for (const row of ips) {
      for (const t of row.attack_types || []) {
        attackMap.set(t, (attackMap.get(t) || 0) + 1);
      }
    }
    const attackTypes = Array.from(attackMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    const hostMap = new Map<string, number>();
    for (const row of ips) {
      for (const h of row.target_hosts || []) {
        hostMap.set(h, (hostMap.get(h) || 0) + 1);
      }
    }
    const targetHosts = Array.from(hostMap.entries())
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count);

    return {
      summary: {
        isp: cleanIsp,
        ip_count: ips.length,
        total_alerts: totalAlerts,
        max_abuse_score: Math.max(...scores),
        avg_abuse_score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        countries,
        asns,
        last_seen: lastSeen,
      },
      attackTypes,
      targetHosts,
      ips: [...ips].sort((a, b) => b.total_alert_count - a.total_alert_count),
    };
  }

  const [sumRes, attacksRes, hostsRes, ipList] = await Promise.all([
    query<{
      isp: string;
      ip_count: string;
      total_alerts: string;
      max_abuse_score: string;
      avg_abuse_score: string;
      countries: string[];
      asns: string[];
      last_seen: string;
    }>(
      `SELECT isp,
              COUNT(*)::int AS ip_count,
              SUM(total_alert_count)::int AS total_alerts,
              MAX(abuse_score)::int AS max_abuse_score,
              ROUND(AVG(COALESCE(abuse_score, 0)))::int AS avg_abuse_score,
              ARRAY_AGG(DISTINCT country_code) FILTER (WHERE country_code IS NOT NULL) AS countries,
              ARRAY_AGG(DISTINCT (geo_json->>'as')) FILTER (WHERE geo_json->>'as' IS NOT NULL) AS asns,
              MAX(last_seen) AS last_seen
         FROM ip_intel_cache
        WHERE isp = $1
        GROUP BY isp`,
      [cleanIsp]
    ),
    query<{ type: string; count: string }>(
      `SELECT unnest(attack_types) AS type, COUNT(*)::int AS count
         FROM ip_intel_cache
        WHERE isp = $1
        GROUP BY type
        ORDER BY count DESC
        LIMIT 10`,
      [cleanIsp]
    ),
    query<{ host: string; count: string }>(
      `SELECT unnest(target_hosts) AS host, COUNT(*)::int AS count
         FROM ip_intel_cache
        WHERE isp = $1
        GROUP BY host
        ORDER BY count DESC
        LIMIT 10`,
      [cleanIsp]
    ),
    query<IpIntelCacheRow>(
      `SELECT ip, first_seen, last_seen, reputation_source,
              abuse_score, vt_malicious, country_code, isp,
              attack_types, mitre_tactics, target_hosts, total_alert_count
         FROM ip_intel_cache
        WHERE isp = $1
        ORDER BY total_alert_count DESC, abuse_score DESC NULLS LAST`,
      [cleanIsp]
    ),
  ]);

  if (!sumRes[0]) {
    return { summary: null, attackTypes: [], targetHosts: [], ips: [] };
  }

  const r = sumRes[0];
  const summary: ProviderSummary = {
    isp: r.isp,
    ip_count: parseInt(r.ip_count, 10),
    total_alerts: parseInt(r.total_alerts, 10),
    max_abuse_score: parseInt(r.max_abuse_score || '0', 10),
    avg_abuse_score: parseInt(r.avg_abuse_score || '0', 10),
    countries: r.countries || [],
    asns: r.asns || [],
    last_seen: r.last_seen,
  };

  return {
    summary,
    attackTypes: attacksRes.map((a) => ({ type: a.type, count: parseInt(a.count, 10) })),
    targetHosts: hostsRes.map((h) => ({ host: h.host, count: parseInt(h.count, 10) })),
    ips: ipList,
  };
}

export interface UpsertReputationParams {
  ip: string;
  abuseScore: number;
  countryCode?: string | null;
  isp?: string | null;
  domain?: string | null;
  usageType?: string | null;
  totalReports?: number;
  numDistinctUsers?: number;
  lastReportedAt?: string | null;
  reputationJson?: any;
  geoJson?: any;
}

let localSyncPool: Pool | null = null;
function getLocalSyncPool(): Pool {
  if (!localSyncPool) {
    localSyncPool = new Pool({
      connectionString: 'postgresql://soc_readonly:REDACTED_PASSWORD@127.0.0.1:5432/abuseip',
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 2000,
    });
    localSyncPool.on('error', () => {});
  }
  return localSyncPool;
}

/**
 * Upsert threat intelligence reputation data for an IP into PostgreSQL ip_intel_cache.
 * Synchronizes primary database (remote 10.0.0.1) and local database if available.
 */
export async function upsertIpIntelReputation(params: UpsertReputationParams): Promise<void> {
  const cleanIp = params.ip.trim();

  if (isMock) {
    const existing = MOCK_IP_CACHE.find((c) => c.ip === cleanIp);
    if (existing) {
      existing.abuse_score = params.abuseScore;
      existing.reputation_source = 'abuseipdb';
      existing.country_code = params.countryCode || existing.country_code;
      existing.isp = params.isp || existing.isp;
      existing.reputation_checked_at = new Date().toISOString();
      existing.reputation_json = params.reputationJson;
      existing.geo_json = params.geoJson;
    } else {
      MOCK_IP_CACHE.push({
        ip: cleanIp,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        last_alert_id: null,
        reputation_source: 'abuseipdb',
        abuse_score: params.abuseScore,
        vt_malicious: null,
        country_code: params.countryCode || 'XX',
        isp: params.isp || 'Unknown',
        geo_json: params.geoJson || null,
        reputation_json: params.reputationJson || null,
        attack_types: [],
        mitre_tactics: [],
        target_hosts: [],
        endpoints_targeted: [],
        http_methods_used: [],
        total_alert_count: 0,
        notes: null,
        reputation_checked_at: new Date().toISOString(),
      });
    }
    return;
  }

  const sql = `
    INSERT INTO ip_intel_cache (
      ip, last_seen, reputation_checked_at, reputation_source,
      abuse_score, country_code, isp, geo_json, reputation_json,
      total_alert_count, attack_types, mitre_tactics, target_hosts,
      endpoints_targeted, http_methods_used
    ) VALUES ($1, NOW(), NOW(), 'abuseipdb', $2, $3, $4, $5, $6, 0, ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[])
    ON CONFLICT (ip) DO UPDATE SET
      reputation_checked_at = NOW(),
      reputation_source = 'abuseipdb',
      abuse_score = EXCLUDED.abuse_score,
      country_code = COALESCE(EXCLUDED.country_code, ip_intel_cache.country_code),
      isp = COALESCE(EXCLUDED.isp, ip_intel_cache.isp),
      geo_json = COALESCE(EXCLUDED.geo_json, ip_intel_cache.geo_json),
      reputation_json = EXCLUDED.reputation_json
  `;

  const values = [
    cleanIp,
    params.abuseScore,
    params.countryCode || null,
    params.isp || null,
    params.geoJson ? JSON.stringify(params.geoJson) : null,
    params.reputationJson ? JSON.stringify(params.reputationJson) : null,
  ];

  // 1. Primary DB (pointed by DATABASE_URL, e.g. 10.0.0.1)
  const client = await getPool().connect();
  try {
    await client.query(sql, values);
  } finally {
    client.release();
  }

  // 2. Parity sync to local DB if primary is remote
  const primaryConn = process.env.DATABASE_URL || '';
  if (primaryConn && !primaryConn.includes('127.0.0.1') && !primaryConn.includes('localhost')) {
    try {
      const localClient = await getLocalSyncPool().connect();
      try {
        await localClient.query(sql, values);
      } finally {
        localClient.release();
      }
    } catch {
      // Local sync is best-effort fallback
    }
  }
}

