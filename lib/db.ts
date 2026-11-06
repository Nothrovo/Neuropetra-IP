/**
 * Database client and repository queries.
 * Enforces server-side execution, parameterized queries, and read-only behavior.
 */

import { getReadPool } from './db-pool';
import { getMockReputation, getMockReputations, saveReputation, type ReputationWrite } from './reputation-repository';
import { normalizeIp } from './ip-validator';
import { eventPredicate, filterEvents, type TelemetryScope } from './telemetry-aggregates';
import { MOCK_IP_CACHE, MOCK_IP_EVENTS, IpIntelCacheRow, IpIntelEventRow } from './mock-data';
export type IntelRow = Omit<IpIntelCacheRow, 'first_seen'|'last_seen'|'geo_json'|'reputation_json'> & {first_seen:string|null;last_seen:string|null;geo_json:(Record<string,unknown> & {country?:string;countryCode?:string;isp?:string;as?:string})|null;reputation_json:Record<string,unknown>|null};
const mergedSelect = `SELECT COALESCE(c.ip,r.ip) AS ip,c.first_seen,c.last_seen,c.last_alert_id,
 CASE WHEN r.ip IS NOT NULL THEN 'abuseipdb' ELSE c.reputation_source END AS reputation_source,
 COALESCE(r.abuse_score,c.abuse_score) AS abuse_score,c.vt_malicious,COALESCE(r.country_code,c.country_code) AS country_code,
 COALESCE(r.isp,c.isp) AS isp,COALESCE(r.geo_json,c.geo_json) AS geo_json,COALESCE(r.reputation_json,c.reputation_json) AS reputation_json,
 COALESCE(c.attack_types,ARRAY[]::text[]) AS attack_types,COALESCE(c.mitre_tactics,ARRAY[]::text[]) AS mitre_tactics,
 COALESCE(c.target_hosts,ARRAY[]::text[]) AS target_hosts,COALESCE(c.endpoints_targeted,ARRAY[]::text[]) AS endpoints_targeted,
 COALESCE(c.http_methods_used,ARRAY[]::text[]) AS http_methods_used,COALESCE(c.total_alert_count,0) AS total_alert_count,c.notes,
 COALESCE(r.reputation_checked_at,c.reputation_checked_at) AS reputation_checked_at
 FROM ip_intel_cache c FULL OUTER JOIN ip_intel_reputation r ON c.ip=r.ip`;
function mockIntel(ip:string):IntelRow|null {
 const c=MOCK_IP_CACHE.find(row=>row.ip===ip),r=getMockReputation(ip);
 if(!c&&!r)return null;
 const base:IntelRow=c?{...c}:{ip,first_seen:null,last_seen:null,last_alert_id:null,reputation_source:null,abuse_score:null,vt_malicious:null,country_code:null,isp:null,geo_json:null,reputation_json:null,attack_types:[],mitre_tactics:[],target_hosts:[],endpoints_targeted:[],http_methods_used:[],total_alert_count:0,notes:null,reputation_checked_at:null};
 return r?{...base,...r,country_code:r.country_code??base.country_code,isp:r.isp??base.isp,geo_json:r.geo_json??base.geo_json,reputation_json:r.reputation_json??base.reputation_json,reputation_source:'abuseipdb'}:base;
}

function mockIntels():IntelRow[] {
 const ips=new Set([...MOCK_IP_CACHE.map(row=>row.ip),...getMockReputations().map(row=>row.ip)]);
 return [...ips].map(ip=>mockIntel(ip)!);
}
const intelRelation = `(${mergedSelect}) intel`;

const isMock = process.env.USE_MOCK_DATA === 'true';

/**
 * Execute a read-only parameterized query against PostgreSQL.
 */
export async function query<T = Record<string,unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (isMock) {
    throw new Error('Direct query called in mock mode. Use repository methods.');
  }

  // Safety check: ensure query is strictly a SELECT
  const trimmed = text.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
    throw new Error('Security Violation: Only SELECT/WITH read-only queries are permitted.');
  }

  const client = await getReadPool().connect();
  try {
    await client.query('BEGIN READ ONLY');
    const res = await client.query(text, params);
    await client.query('COMMIT');
    return res.rows;
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// -------------------------------------------------------------
// REPOSITORY METHODS
// -------------------------------------------------------------

export async function getIpIntel(ip:string):Promise<IntelRow|null> {
 const cleanIp=normalizeIp(ip);
 if(isMock)return mockIntel(cleanIp);
 const rows=await query<IntelRow>(`${mergedSelect} WHERE COALESCE(c.ip,r.ip) = $1 LIMIT 1`,[cleanIp]);
 return rows[0]??null;
}

export interface EventsFilter {
  limit?: number;
  offset?: number;
  alertType?: string;
  outcome?: string;
  targetHost?: string;
  days?: number;
  from?: string;
  to?: string;
}

export async function getIpEvents(
  ip: string,
  filter: EventsFilter = {}
): Promise<{ events: IpIntelEventRow[]; total: number }> {
  const cleanIp = ip.trim();
  const limit = Math.min(100, Math.max(1, filter.limit || 20));
  const offset = Math.max(0, filter.offset || 0);

  const to=filter.to??new Date().toISOString();
  const scope:TelemetryScope={from:filter.from??new Date(Date.parse(to)-(filter.days??30)*86400000).toISOString(),to,alertType:filter.alertType,outcome:filter.outcome,targetHost:filter.targetHost};
  if(isMock){const list=filterEvents(MOCK_IP_EVENTS.filter(e=>e.ip===cleanIp),scope).sort((a,b)=>Date.parse(b.seen_at)-Date.parse(a.seen_at)||b.id-a.id);return {events:list.slice(offset,offset+limit),total:list.length};}
  const {where:whereClause,params}=eventPredicate(cleanIp,scope);
  let paramIdx=params.length+1;

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
      ORDER BY seen_at DESC, id DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    dataParams
  );

  return { events, total };
}

export async function getTopAttackers(limit: number = 10): Promise<IntelRow[]> {
  const safeLimit = Math.min(100, Math.max(1, limit));
  if (isMock) {
    return mockIntels()
      .sort((a, b) => b.total_alert_count - a.total_alert_count)
      .slice(0, safeLimit);
  }

  return query<IntelRow>(
    `SELECT ip, first_seen, last_seen, reputation_source,
            abuse_score, vt_malicious, country_code, isp,
            attack_types, mitre_tactics, target_hosts, total_alert_count
       FROM ${intelRelation}
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
      ipsTracked: mockIntels().length,
      maliciousCount: mockIntels().filter((c) => (c.abuse_score ?? -1) >= 75 || (c.vt_malicious ?? 0)>=5).length,
      events24h: MOCK_IP_EVENTS.filter((e) => new Date(e.seen_at).getTime() < Date.now() && Date.now() - new Date(e.seen_at).getTime() <= 86400000).length,
      events7d: MOCK_IP_EVENTS.filter((e) => new Date(e.seen_at).getTime() < Date.now() && Date.now() - new Date(e.seen_at).getTime() <= 7 * 86400000).length,
      events30d: MOCK_IP_EVENTS.filter(e=>Date.parse(e.seen_at)<Date.now() && Date.parse(e.seen_at)>=Date.now()-30*86400000).length,
      distinctTargetHosts: new Set(mockIntels().flatMap((c) => c.target_hosts)).size,
    };
  }

  const [cacheCounts, event24hRow, event7dRow, event30dRow, hostsRow] = await Promise.all([
    query<{ total: string; malicious: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE abuse_score >= 75 OR vt_malicious >= 5) AS malicious
         FROM ${intelRelation}`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ip_intel_events WHERE seen_at >= NOW() - INTERVAL '24 hours' AND seen_at < NOW()`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ip_intel_events WHERE seen_at >= NOW() - INTERVAL '7 days' AND seen_at < NOW()`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ip_intel_events WHERE seen_at >= NOW() - INTERVAL '30 days' AND seen_at < NOW()`
    ),
    query<{ count: string }>(
      `SELECT COUNT(DISTINCT h) AS count
         FROM (SELECT unnest(target_hosts) AS h FROM ${intelRelation}) sub`
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

export async function getBulkIntel(ips:string[]):Promise<IntelRow[]> {
 if(!ips.length)return [];
 const clean=ips.map(normalizeIp);
 if(isMock)return clean.map(mockIntel).filter((r):r is IntelRow=>r!==null);
 return query<IntelRow>(`${mergedSelect} WHERE COALESCE(c.ip,r.ip) = ANY($1::text[])`,[clean]);
}

export async function getRelatedIps(
  currentIp: string,
  subnet24: string | null,
  isp: string | null
): Promise<IntelRow[]> {
  if (isMock) {
    return mockIntels().filter((c) => c.ip !== currentIp && ((isp !== null && c.isp === isp) || (subnet24 && c.ip.startsWith(subnet24.replace('.0/24','')+'.')))).slice(0,10);
  }

  const prefix = subnet24 ? subnet24.replace('.0/24', '') : null;
  return query<IntelRow>(
    `SELECT ip, abuse_score, vt_malicious, country_code, isp, total_alert_count, last_seen
       FROM ${intelRelation}
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
  maxRows?: number;
  includeReputation?: boolean;
}): Promise<{ ip: string; abuse_score: number|null; vt_malicious: number|null; total_alert_count: number; country_code: string|null; attack_types: string[] }[]> {
  const minScore = options.minScore ?? 75;
  const minAlerts = options.minAlerts ?? 1;
  const maxAgeDays = options.maxAgeDays ?? 30;
  const includeRep = options.includeReputation === true;

  if (isMock) {
    return mockIntels().filter(
      (c) => ((c.abuse_score ?? -1) >= minScore || (c.vt_malicious ?? 0) >= 5) &&
             c.total_alert_count >= minAlerts &&
             (
               (c.last_seen && Date.parse(c.last_seen) >= Date.now() - maxAgeDays * 86400000 && Date.parse(c.last_seen) < Date.now()) ||
               (includeRep && !c.last_seen && c.reputation_checked_at && Date.parse(c.reputation_checked_at) >= Date.now() - maxAgeDays * 86400000 && Date.parse(c.reputation_checked_at) < Date.now())
             )
    ).map((c) => ({
      ip: c.ip,
      abuse_score: c.abuse_score,
      vt_malicious: c.vt_malicious,
      total_alert_count: c.total_alert_count,
      country_code: c.country_code,
      attack_types: c.attack_types || [],
    }));
  }

  return query(
    `SELECT ip, abuse_score, vt_malicious, total_alert_count, country_code, attack_types
       FROM ${intelRelation}
      WHERE (abuse_score >= $1 OR vt_malicious >= 5)
        AND total_alert_count >= $2
        AND (
          (last_seen >= NOW() - ($3 || ' days')::INTERVAL AND last_seen < NOW())
          OR
          ($5::boolean = true AND last_seen IS NULL AND reputation_checked_at >= NOW() - ($3 || ' days')::INTERVAL AND reputation_checked_at < NOW())
        )
      ORDER BY total_alert_count DESC, abuse_score DESC LIMIT $4`,
    [minScore, minAlerts, maxAgeDays.toString(), (options.maxRows ?? 10000) + 1, includeRep]
  );
}

export async function getDashboardAnalytics(days=30,explicitScope?:TelemetryScope) {
 const to=new Date().toISOString(),scope=explicitScope??{from:new Date(Date.parse(to)-days*86400000).toISOString(),to};
 const rank=(values:(string|null|undefined)[])=>{const map=new Map<string,number>();for(const v of values)if(v)map.set(v,(map.get(v)??0)+1);return [...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10);};
 if(isMock){
  const events=filterEvents(MOCK_IP_EVENTS,scope),cache=new Map(mockIntels().map(c=>[c.ip,c]));
  const countries=rank(events.map(e=>cache.get(e.ip)?.country_code)),asns=rank(events.map(e=>cache.get(e.ip)?.isp)),types=rank(events.map(e=>e.attack_subtype)),mitre=rank(events.flatMap(e=>e.mitre)),outcomes=rank(events.map(e=>e.outcome??'unspecified'));
  const timeline=new Map<string,number>();for(const e of events){const d=new Date(e.seen_at).toISOString().slice(0,10);timeline.set(d,(timeline.get(d)??0)+1);}
  return {scope,units:{topCountries:'events',topAsns:'events',topAttackTypes:'events',topMitre:'event-technique associations',outcomeDistribution:'events',timeline:'events'},topCountries:countries.map(([code,count])=>({code,count})),topAsns:asns.map(([name,count])=>({name,count})),topAttackTypes:types.map(([type,count])=>({type,count})),topMitre:mitre.map(([id,count])=>({id,count})),outcomeDistribution:outcomes.map(([outcome,count])=>({outcome,count})),timeline:[...timeline].sort().map(([date,attacks])=>({date,attacks}))};
 }
 const {where,params}=eventPredicate(null,scope);
 const aggregate=async(expression:string,join='')=>query<{key:string;count:string}>(`WITH scoped AS (SELECT * FROM ip_intel_events WHERE ${where}) SELECT ${expression} AS key,COUNT(*) AS count FROM scoped e ${join} GROUP BY key ORDER BY count DESC,key LIMIT 10`,params);
 const [types,mitre]=await Promise.all([
  aggregate('e.attack_subtype','WHERE e.attack_subtype IS NOT NULL'),
  aggregate('m.id','CROSS JOIN LATERAL unnest(e.mitre) m(id)')
 ]);
 let [countries,asns,outcomes,timeline]=await Promise.all([
  aggregate('intel.country_code',`JOIN ${intelRelation} ON intel.ip=e.ip WHERE intel.country_code IS NOT NULL`),
  aggregate('intel.isp',`JOIN ${intelRelation} ON intel.ip=e.ip WHERE intel.isp IS NOT NULL`),
  aggregate("COALESCE(e.outcome,'unspecified')"),
  query<{date:string;count:string}>(`SELECT TO_CHAR(seen_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS date,COUNT(*) AS count FROM ip_intel_events WHERE ${where} GROUP BY date ORDER BY date`,params)
 ]);
 if (countries.length === 0 && timeline.length === 0) {
  const eventsExist = await query<{exists:boolean}>('SELECT EXISTS(SELECT 1 FROM ip_intel_events LIMIT 1) AS exists');
  if (!eventsExist[0]?.exists) {
   const [repCountries, repAsns, repOutcomes, repTimeline] = await Promise.all([
    query<{key:string;count:string}>(`SELECT country_code AS key, COUNT(*) AS count FROM ${intelRelation} WHERE country_code IS NOT NULL AND COALESCE(last_seen, reputation_checked_at) >= $1::timestamptz AND COALESCE(last_seen, reputation_checked_at) < $2::timestamptz GROUP BY country_code ORDER BY count DESC, country_code LIMIT 10`, [scope.from, scope.to]),
    query<{key:string;count:string}>(`SELECT isp AS key, COUNT(*) AS count FROM ${intelRelation} WHERE isp IS NOT NULL AND COALESCE(last_seen, reputation_checked_at) >= $1::timestamptz AND COALESCE(last_seen, reputation_checked_at) < $2::timestamptz GROUP BY isp ORDER BY count DESC, isp LIMIT 10`, [scope.from, scope.to]),
    query<{key:string;count:string}>(`SELECT CASE WHEN abuse_score >= 75 THEN 'malicious' WHEN abuse_score >= 40 THEN 'suspicious' WHEN abuse_score IS NOT NULL THEN 'low-risk' ELSE 'unknown' END AS key, COUNT(*) AS count FROM ${intelRelation} WHERE COALESCE(last_seen, reputation_checked_at) >= $1::timestamptz AND COALESCE(last_seen, reputation_checked_at) < $2::timestamptz GROUP BY key ORDER BY count DESC`, [scope.from, scope.to]),
    query<{date:string;count:string}>(`SELECT TO_CHAR(COALESCE(last_seen, reputation_checked_at) AT TIME ZONE 'UTC','YYYY-MM-DD') AS date, COUNT(*) AS count FROM ${intelRelation} WHERE COALESCE(last_seen, reputation_checked_at) >= $1::timestamptz AND COALESCE(last_seen, reputation_checked_at) < $2::timestamptz GROUP BY date ORDER BY date`, [scope.from, scope.to])
   ]);
   if (repCountries.length > 0 || repTimeline.length > 0) {
    countries = repCountries;
    asns = repAsns;
    outcomes = repOutcomes;
    timeline = repTimeline;
   }
  }
 }
 return {scope,units:{topCountries:'events',topAsns:'events',topAttackTypes:'events',topMitre:'event-technique associations',outcomeDistribution:'events',timeline:'events'},topCountries:countries.map(r=>({code:r.key,count:Number(r.count)})),topAsns:asns.map(r=>({name:r.key,count:Number(r.count)})),topAttackTypes:types.map(r=>({type:r.key,count:Number(r.count)})),topMitre:mitre.map(r=>({id:r.key,count:Number(r.count)})),outcomeDistribution:outcomes.map(r=>({outcome:r.key,count:Number(r.count)})),timeline:timeline.map(r=>({date:r.date,attacks:Number(r.count)}))};
}

export interface ProviderSummary {
  isp: string;
  ip_count: number;
  total_alerts: number;
  max_abuse_score: number|null;
  avg_abuse_score: number|null;
  countries: string[];
  asns: string[];
  last_seen: string|null;
}

export interface ProviderDetail {
  summary: ProviderSummary | null;
  attackTypes: { type: string; count: number }[];
  targetHosts: { host: string; count: number }[];
  ips: IntelRow[];
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
      last_seen: string|null;
    }>();

    for (const row of mockIntels()) {
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
      p.total_alerts += row.total_alert_count ?? 0;
      if (row.abuse_score !== null) p.scores.push(row.abuse_score);
      if (row.country_code) p.countries.add(row.country_code);
      if (row.geo_json?.as) p.asns.add(row.geo_json.as);
      if (row.last_seen !== null && (p.last_seen === null || row.last_seen > p.last_seen)) {
        p.last_seen = row.last_seen;
      }
    }

    const all = Array.from(map.values())
      .map((p) => ({
        isp: p.isp,
        ip_count: p.ips.length,
        total_alerts: p.total_alerts,
        max_abuse_score: p.scores.length > 0 ? Math.max(...p.scores) : null,
        avg_abuse_score:
          p.scores.length > 0 ? Math.round(p.scores.reduce((a, b) => a + b, 0) / p.scores.length) : null,
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
         FROM ${intelRelation}
        WHERE isp IS NOT NULL
          AND ($1 = '' OR isp ILIKE '%' || $1 || '%' OR (geo_json->>'as') ILIKE '%' || $1 || '%')`,
      [clean]
    ),
    query<{
      isp: string;
      ip_count: string;
      total_alerts: string;
      max_abuse_score: string|null;
      avg_abuse_score: string|null;
      countries: string[];
      asns: string[];
      last_seen: string|null;
    }>(
      `SELECT isp,
              COUNT(*)::int AS ip_count,
              SUM(total_alert_count)::int AS total_alerts,
              MAX(abuse_score)::int AS max_abuse_score,
              ROUND(AVG(abuse_score))::int AS avg_abuse_score,
              ARRAY_AGG(DISTINCT country_code) FILTER (WHERE country_code IS NOT NULL) AS countries,
              ARRAY_AGG(DISTINCT (geo_json->>'as')) FILTER (WHERE geo_json->>'as' IS NOT NULL) AS asns,
              MAX(last_seen) AS last_seen
         FROM ${intelRelation}
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
    max_abuse_score: r.max_abuse_score == null ? null : Number(r.max_abuse_score),
    avg_abuse_score: r.avg_abuse_score == null ? null : Number(r.avg_abuse_score),
    countries: r.countries || [],
    asns: r.asns || [],
    last_seen: r.last_seen,
  }));

  return { providers, total };
}

export async function getProviderIps(name:string,limit=100,offset=0):Promise<{items:IntelRow[];total:number}> {
 if(!Number.isInteger(limit)||limit<1||limit>10000||!Number.isInteger(offset)||offset<0||offset>1000000)throw new Error('Invalid roster bounds');
 if(isMock){const all=mockIntels().filter(c=>c.isp===name).sort((a,b)=>b.total_alert_count-a.total_alert_count||a.ip.localeCompare(b.ip));return {items:all.slice(offset,offset+limit),total:all.length};}
 const [count,items]=await Promise.all([query<{count:string}>(`SELECT COUNT(*) AS count FROM ${intelRelation} WHERE isp=$1`,[name]),query<IntelRow>(`SELECT * FROM ${intelRelation} WHERE isp=$1 ORDER BY total_alert_count DESC,ip LIMIT $2 OFFSET $3`,[name,limit,offset])]);return {items,total:Number(count[0]?.count??0)};
}
export async function getProviderDetail(ispName: string,limit=100,offset=0): Promise<ProviderDetail> {
  const cleanIsp = ispName.trim();

  if (isMock) {
    const ips = mockIntels().filter((c) => c.isp === cleanIsp);
    if (ips.length === 0) {
      return { summary: null, attackTypes: [], targetHosts: [], ips: [] };
    }

    const scores = ips.map((c) => c.abuse_score).filter((score):score is number=>score!==null);
    const totalAlerts = ips.reduce((sum, c) => sum + (c.total_alert_count ?? 0), 0);
    const countries = Array.from(new Set(ips.map((c) => c.country_code).filter(Boolean))) as string[];
    const asns = Array.from(new Set(ips.map((c) => c.geo_json?.as).filter(Boolean))) as string[];
    const lastSeen = ips.reduce<string|null>((latest, c) => (c.last_seen !== null && (latest === null || c.last_seen > latest) ? c.last_seen : latest), null);

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
        max_abuse_score: scores.length ? Math.max(...scores) : null,
        avg_abuse_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        countries,
        asns,
        last_seen: lastSeen,
      },
      attackTypes,
      targetHosts,
      ips: [...ips].sort((a, b) => b.total_alert_count - a.total_alert_count).slice(offset,offset+limit),
    };
  }

  const [sumRes, attacksRes, hostsRes, ipList] = await Promise.all([
    query<{
      isp: string;
      ip_count: string;
      total_alerts: string;
      max_abuse_score: string|null;
      avg_abuse_score: string|null;
      countries: string[];
      asns: string[];
      last_seen: string|null;
    }>(
      `SELECT isp,
              COUNT(*)::int AS ip_count,
              SUM(total_alert_count)::int AS total_alerts,
              MAX(abuse_score)::int AS max_abuse_score,
              ROUND(AVG(abuse_score))::int AS avg_abuse_score,
              ARRAY_AGG(DISTINCT country_code) FILTER (WHERE country_code IS NOT NULL) AS countries,
              ARRAY_AGG(DISTINCT (geo_json->>'as')) FILTER (WHERE geo_json->>'as' IS NOT NULL) AS asns,
              MAX(last_seen) AS last_seen
         FROM ${intelRelation}
        WHERE isp = $1
        GROUP BY isp`,
      [cleanIsp]
    ),
    query<{ type: string; count: string }>(
      `SELECT unnest(attack_types) AS type, COUNT(*)::int AS count
         FROM ${intelRelation}
        WHERE isp = $1
        GROUP BY type
        ORDER BY count DESC
        LIMIT 10`,
      [cleanIsp]
    ),
    query<{ host: string; count: string }>(
      `SELECT unnest(target_hosts) AS host, COUNT(*)::int AS count
         FROM ${intelRelation}
        WHERE isp = $1
        GROUP BY host
        ORDER BY count DESC
        LIMIT 10`,
      [cleanIsp]
    ),
    query<IntelRow>(
      `SELECT ip, first_seen, last_seen, reputation_source,
              abuse_score, vt_malicious, country_code, isp,
              attack_types, mitre_tactics, target_hosts, total_alert_count
         FROM ${intelRelation}
        WHERE isp = $1
        ORDER BY total_alert_count DESC, abuse_score DESC NULLS LAST LIMIT $2 OFFSET $3`,
      [cleanIsp,limit,offset]
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
    max_abuse_score: r.max_abuse_score == null ? null : Number(r.max_abuse_score),
    avg_abuse_score: r.avg_abuse_score == null ? null : Number(r.avg_abuse_score),
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

export interface UpsertReputationParams extends ReputationWrite { domain?:string|null;usageType?:string|null;totalReports?:number;numDistinctUsers?:number;lastReportedAt?:string|null }
export async function upsertIpIntelReputation(params:UpsertReputationParams):Promise<void> { await saveReputation(params); }
