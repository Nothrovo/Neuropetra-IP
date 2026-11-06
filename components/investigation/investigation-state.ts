import type { BulkIpItem } from '../../lib/charlie-ioc-formatter';
import { parseIndicatorInput } from '../../lib/investigation-input';
import { formatAlphaIocMarkdown, formatCharlieIocMarkdown } from '../../lib/charlie-ioc-formatter';
import { encodeCsvCell } from '../../lib/export';
import { isGlobalIp } from '../../lib/ip-validator';
import { z } from 'zod';

// Validate the actual /api/bulk and /api/enrich wire contracts before confirming
// an outcome. Unknown evidence fields remain intact; no values are coerced.
const score = z.number().int().min(0).max(100);
const count = z.number().int().nonnegative();
const text = z.string().nullable();
const timestamp = z.iso.datetime({ offset: true });
const verdict = z.enum(['Malicious', 'Suspicious', 'Low risk', 'Unknown']);
const verdictColor = z.enum(['red', 'amber', 'emerald', 'slate']);
const localFields = {
  ip: z.string(), verdict, compositeScore: score,
  countryCode: text, countryName: text, isp: text, asn: text,
  totalAlertCount: count, topAttackType: text, lastSeen: timestamp.nullable(),
  abuseScore: score.nullable(), vtMalicious: count.nullable(), reputationSource: text,
};
const localOutcome = z.discriminatedUnion('found', [
  z.looseObject({ ...localFields, found: z.literal(false), verdict: z.literal('Unknown'), compositeScore: z.literal(0), countryCode: z.null(), countryName: z.null(), isp: z.null(), asn: z.null(), totalAlertCount: z.literal(0), topAttackType: z.null(), lastSeen: z.null(), abuseScore: z.null(), vtMalicious: z.null(), reputationSource: z.null() }),
  z.looseObject({ ...localFields, found: z.literal(true), verdictColor,
    reputationCheckedAt: timestamp.nullable(), reputationFresh: z.boolean(),
    scoreScope: z.looseObject({ from: timestamp, to: timestamp }).refine(scope => Date.parse(scope.from) < Date.parse(scope.to)),
    telemetryEventCount: count,
  }),
]);
const externalOutcome = z.looseObject({
  ip: z.string(), status: z.enum(['cached', 'enriched', 'private', 'rate_limited', 'error']),
  source: z.enum(['cache', 'abuseipdb_live', 'local_private']),
  abuseScore: score.nullable(), compositeScore: score, verdict, verdictColor,
  countryCode: text, countryName: text, isp: text, domain: text, usageType: text,
  totalReports: count, numDistinctUsers: count, lastReportedAt: timestamp.nullable(),
  isTor: z.boolean(), isWhitelisted: z.boolean(), savedToDb: z.boolean(),
  checkedAt: timestamp.nullable(), scoreContext: z.literal('reputation-only'),
  reputationSource: z.enum(['abuseipdb']).nullable(), error: text.optional(),
}).refine(row => {
  if (row.status === 'cached' || row.status === 'enriched') {
    if (row.abuseScore === null || row.checkedAt === null || row.reputationSource !== 'abuseipdb') return false;
    if (row.status === 'cached') return row.source === 'cache' && row.savedToDb && row.error == null;
    return row.source === 'abuseipdb_live' && (row.savedToDb ? row.error == null : typeof row.error === 'string' && row.error.length > 0);
  }
  return row.source === (row.status === 'private' ? 'local_private' : 'abuseipdb_live') &&
    row.abuseScore === null && row.checkedAt === null && row.reputationSource === null && !row.savedToDb &&
    row.compositeScore === 0 && row.verdict === 'Unknown' && row.verdictColor === 'slate' &&
    row.countryCode === null && row.countryName === null && row.isp === null && row.domain === null && row.usageType === null &&
    row.totalReports === 0 && row.numDistinctUsers === 0 && row.lastReportedAt === null && !row.isTor && !row.isWhitelisted &&
    typeof row.error === 'string' && row.error.length > 0;
});

export type InvestigationMode = 'local' | 'external';
export type InvestigationSubmission = { ips: string[]; mode: InvestigationMode; cachePolicy: 'fresh-first' | 'force-refresh'; chunkSize?: number };
export type InvestigationResult = Omit<BulkIpItem, 'countryCode'> & {
  countryCode?: string | null; source?: string; status?: string; error?: string | null;
  checkedAt?: string | null; reputationCheckedAt?: string | null; freshness?: string;
  reputationFresh?: boolean; scoreContext?: string;
  savedToDb?: boolean; attack_types?: string[]; evidence?: unknown;
};
export type InvestigationProgress = { results: InvestigationResult[]; completed: number; total: number; status: 'running' | 'completed' | 'partial' | 'cancelled' | 'failed' };

export type InvestigationSession = {
  user: { userId: string; username: string; role: string };
  permissions: string[];
  capabilities: { externalEnrichment: boolean; maintenance: boolean };
};
export type InvestigationState = { input: string; mode: InvestigationMode; selected: string[] };
export type InvestigationQuery = Record<string, string | string[] | undefined>;
export function initialInvestigationState(input = '', mode: InvestigationMode = 'local'): InvestigationState {
  return { input, mode, selected: [] };
}
export function updateInvestigationInput(state: InvestigationState, input: string): InvestigationState {
  return { ...state, input, selected: input === state.input ? state.selected : [] };
}
export function switchInvestigationMode(state: InvestigationState, mode: InvestigationMode): InvestigationState {
  return { ...state, mode };
}
export function externalDisabledReason(session: InvestigationSession | null): string | null {
  if (!session) return 'Session permissions are unavailable. Sign in again or retry.';
  if (!session.permissions?.includes('enrich')) return 'Your account does not have enrichment permission.';
  if (!session.capabilities?.externalEnrichment) return 'External enrichment is not configured for this installation.';
  return null;
}
export function queryIndicatorInput(query: InvestigationQuery): string {
  return ['ip', 'ips'].flatMap(key => {
    const value = query[key];
    return Array.isArray(value) ? value : value ? [value] : [];
  }).join('\n');
}
export function legacyInvestigationUrl(mode: InvestigationMode, query: InvestigationQuery): string {
  const params = new URLSearchParams({ mode });
  const input = queryIndicatorInput(query);
  // Only exact indicators cross the redirect; arbitrary values may be secrets.
  const parsed = parseIndicatorInput(input);
  if (parsed.valid.length) params.set('ips', parsed.valid.join('\n'));
  return `/investigate?${params}`;
}
export function isPersistenceWarning(row: InvestigationResult): boolean {
  return row.status === 'enriched' && row.savedToDb === false && row.abuseScore != null && Boolean(row.error);
}
export function investigationFreshness(row: InvestigationResult): string {
  if (row.freshness) return row.freshness;
  const checkedAt = row.reputationCheckedAt ?? row.checkedAt;
  const age = checkedAt ? Date.now() - Date.parse(checkedAt) : NaN;
  if (!Number.isFinite(age) || age < 0) return 'Freshness unknown';
  if (row.reputationFresh === true) return 'Fresh cache';
  if (row.reputationFresh === false) return 'Stale cache';
  // Match the API's 168-hour reputation TTL without importing server-only configuration.
  const fresh = age < 168 * 3600000;
  if (row.status === 'cached') return fresh ? 'Fresh cache' : 'Stale cache';
  if (row.status === 'enriched') return fresh ? 'Fresh provider result' : 'Stale provider result';
  return 'Freshness unknown';
}
function exportValue(value: unknown): string {
  return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function markdownValue(value: unknown): string {
  return exportValue(value).replace(/&/g, '&amp;').replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/[|<>\[\]*`\\]/g, character => `&#${character.charCodeAt(0)};`);
}
export function exportInvestigationResults(rows: InvestigationResult[], format: 'csv' | 'alpha' | 'charlie'): string {
  const normalized = rows.map(row => ({ ...row, freshness: investigationFreshness(row) }));
  // Retain all supplied evidence fields, including fields introduced by the backend.
  const columns = [...new Set(['ip', 'found', 'status', 'abuseScore', 'vtMalicious', 'compositeScore', 'verdict', 'countryCode', 'isp', 'totalAlertCount', 'topAttackType', 'attack_types', 'evidence', 'lastSeen', 'reputationSource', 'source', 'checkedAt', 'reputationCheckedAt', 'reputationFresh', 'freshness', 'savedToDb', 'error', ...rows.flatMap(row => Object.keys(row))])];
  if (format !== 'csv') {
    const items = normalized.map(row => ({ ...row, countryCode: row.countryCode ?? undefined, compositeScore: undefined, found: row.found }));
    const formatter = format === 'alpha' ? formatAlphaIocMarkdown : formatCharlieIocMarkdown;
    const summary = formatter(items, { includeFootnote: false }).replaceAll('Threat Intel AbuseIPDB Score: N/A [Not Enriched]', 'Reputation Unknown [Not Enriched]');
    const evidence = normalized.map(row => {
      const values = row as Record<string, unknown>;
      return `${isPersistenceWarning(row) ? 'Persistence warning: retrieved reputation was not saved.\n\n' : ''}### ${markdownValue(row.ip)} — ${row.found === true ? 'Local evidence' : row.found === false ? 'Local miss' : 'External reputation'}\n\n| Field | Supplied evidence / provenance |\n| ----- | ----- |\n${columns.filter(key => values[key] !== undefined).map(key => `| ${markdownValue(key)} | ${markdownValue(values[key])} |`).join('\n')}`;
    });
    return `${summary}\n\n${evidence.join('\n\n')}`;
  }
  return [columns.map(encodeCsvCell).join(','), ...normalized.map(row => {
    const values = row as Record<string, unknown>;
    return columns.map(key => encodeCsvCell(exportValue(values[key]))).join(',');
  })].join('\r\n');
}

export async function runInvestigation(
  submission: InvestigationSubmission,
  signal: AbortSignal,
  onProgress: (progress: InvestigationProgress) => void,
  request: typeof fetch = fetch,
): Promise<InvestigationProgress> {
  const parsed = parseIndicatorInput(submission.ips.join('\n'));
  if (submission.mode === 'external' && submission.ips.some(ip => !isGlobalIp(ip))) throw new Error('External enrichment requires public IP indicators.');
  if (!submission.ips.length || submission.ips.length > 200 || parsed.invalid.length || parsed.duplicateCount || parsed.valid.length !== submission.ips.length || (submission.mode === 'local' && submission.cachePolicy !== 'fresh-first')) {
    throw new Error('Submit 1–200 unique valid IPs. Local lookup cannot force refresh.');
  }
  let progress: InvestigationProgress = { results: [], completed: 0, total: submission.ips.length, status: 'running' };
  onProgress(progress);
  const chunkSize = Math.max(1, submission.chunkSize ?? (submission.mode === 'external' ? 100 : 200));
  for (let offset = 0; offset < submission.ips.length; offset += chunkSize) {
    if (signal.aborted) { progress = { ...progress, status: 'cancelled' }; break; }
    const ips = submission.ips.slice(offset, offset + chunkSize);
    try {
      const response = await request(submission.mode === 'external' ? '/api/enrich' : '/api/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission.mode === 'external' ? { ips, checkCacheFirst: submission.cachePolicy === 'fresh-first' } : { ips }), signal,
      });
      if (!response.ok) throw new Error('Investigation request failed.');
      const payload = await response.json();
      if (!payload || payload.success !== true || !Array.isArray(payload.results)) throw new Error('Invalid investigation response.');
      const rows = new Map<string, InvestigationResult>();
      const duplicates = new Set<string>();
      for (const value of payload.results as unknown[]) {
        if (!value || typeof value !== 'object' || !('ip' in value) || typeof value.ip !== 'string' || !ips.includes(value.ip)) throw new Error('Unexpected investigation indicator.');
        if (rows.has(value.ip)) duplicates.add(value.ip);
        rows.set(value.ip, value as InvestigationResult);
      }
      let confirmed = 0;
      const results = ips.map(ip => {
        const row = rows.get(ip);
        const valid = row && !duplicates.has(ip) &&
          (submission.mode === 'local' ? localOutcome : externalOutcome).safeParse(row).success;
        if (!valid) return { ip, status: 'error', error: 'Invalid or missing investigation result; outcome unconfirmed.' };
        confirmed++;
        return row;
      });
      progress = { ...progress, results: [...progress.results, ...results], completed: progress.completed + confirmed };
      onProgress(progress);
    } catch {
      if (signal.aborted) { progress = { ...progress, status: 'cancelled' }; break; }
      progress = { ...progress, status: progress.completed ? 'partial' : 'failed', results: [...progress.results, ...ips.map(ip => ({ ip, status: 'error', error: 'Investigation request failed; outcome unconfirmed.' }))] };
      break;
    }
  }
  if (progress.status === 'running') progress = { ...progress, status: !progress.completed ? 'failed' : progress.results.some(row => row.error || row.status === 'error' || row.status === 'rate_limited') ? 'partial' : 'completed' };
  onProgress(progress);
  return progress;
}
