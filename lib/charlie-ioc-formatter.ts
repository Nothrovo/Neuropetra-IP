/**
 * Charlie Reporter - Indicator of Compromise (IoC) Markdown Table Formatter
 * 
 * Conforms 100% to the official SOC Level 1 Incident Report standard:
 * - Template Report ASOC.md (Section 4.2: INDICATOR OF COMPROMISE)
 * - Charlie Reporter (Build IRIS Markdown Prompt.js / generateIocRows)
 * - Gold Standard SOC Incident Reports
 */

import { isPrivateIp } from './ip-validator';

export interface BulkIpItem {
  ip: string;
  found?: boolean;
  verdict?: string;
  compositeScore?: number;
  countryCode?: string;
  countryName?: string | null;
  isp?: string | null;
  asn?: string | null;
  totalAlertCount?: number;
  topAttackType?: string;
  lastSeen?: string | null;
  abuseScore?: number | null;
  vtMalicious?: number | null;
  reputationSource?: string | null;
}

export interface CharlieIocFormatOptions {
  /**
   * Include the section title header (**2. INDICATOR OF COMPROMISE**)
   * Default: true
   */
  includeSectionHeader?: boolean;

  /**
   * Include the Hash indicator placeholder row
   * Default: true
   */
  includeHashRow?: boolean;

  /**
   * Include the standard threat intel validation footnote note
   * Default: true
   */
  includeFootnote?: boolean;

  /**
   * Include observed request volume and attack type context
   * e.g. "(34 requests - sql_injection)"
   * Default: true
   */
  includeActivityContext?: boolean;

  /**
   * Report format variant: 'alpha' (Alpha Reporter) or 'charlie' (Charlie Reporter).
   * Default: 'alpha'
   */
  reportVariant?: 'alpha' | 'charlie';
}

const ALPHA3_MAP: Record<string, string> = {
  USA: 'United States',
  GBR: 'United Kingdom',
  IDN: 'Indonesia',
  SGP: 'Singapore',
  FRA: 'France',
  DEU: 'Germany',
  CHN: 'China',
  RUS: 'Russia',
  NLD: 'Netherlands',
  AUS: 'Australia',
  CAN: 'Canada',
  JPN: 'Japan',
};

/**
 * Converts ISO alpha-2/3 country code to full English country name.
 * Matches Charlie Reporter getFullCountryName implementation.
 */
export function getFullCountryName(codeOrName?: string | null): string {
  if (!codeOrName || typeof codeOrName !== 'string') return 'Unknown';
  const trimmed = codeOrName.trim();
  if (!trimmed || trimmed === 'Unknown' || trimmed === 'N/A' || trimmed === 'XX') return 'Unknown';

  if (trimmed.length === 2 && /^[A-Za-z]{2}$/.test(trimmed)) {
    try {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
      return regionNames.of(trimmed.toUpperCase()) || trimmed;
    } catch {
      return trimmed;
    }
  }

  if (ALPHA3_MAP[trimmed.toUpperCase()]) {
    return ALPHA3_MAP[trimmed.toUpperCase()];
  }

  return trimmed;
}

/**
 * Classifies threat confidence score into Charlie Reporter severity levels.
 * Matches Charlie Reporter classifyThreatScore implementation.
 */
export function classifyThreatScore(score: number | string | null | undefined): string {
  if (score === undefined || score === null || score === '') return 'Not Enriched';
  const num = typeof score === 'number' ? score : parseInt(String(score).replace('%', ''), 10);
  if (isNaN(num)) return 'Not Enriched';
  if (num >= 70) return 'Malicious / High Risk';
  if (num >= 20) return 'Suspicious / Moderate Risk';
  if (num === 0) return 'Clean / 0% Abuse Confidence';
  return 'Low Reported Abuse Score';
}

/**
 * Resolves the effective threat score and reputation source name for an IP item.
 */
export function resolveEffectiveScore(item: BulkIpItem): {
  sourceName: string;
  scoreVal: number | null;
  scoreStr: string;
} {
  const isVT =
    item.reputationSource === 'virustotal' ||
    (item.vtMalicious !== null && item.vtMalicious !== undefined && item.vtMalicious > 0 && item.abuseScore == null);

  if (isVT) {
    const sourceName = 'VirusTotal';
    let scoreVal: number | null = null;
    if (item.vtMalicious !== null && item.vtMalicious !== undefined) {
      scoreVal = item.vtMalicious >= 5 ? 100 : item.vtMalicious >= 2 ? 60 : item.vtMalicious >= 1 ? 25 : 0;
    } else if (item.compositeScore !== undefined && item.compositeScore !== null) {
      scoreVal = item.compositeScore;
    }
    const scoreStr = scoreVal !== null ? `${scoreVal}%` : 'N/A';
    return { sourceName, scoreVal, scoreStr };
  }

  const sourceName = 'AbuseIPDB';
  let scoreVal: number | null = null;
  if (item.abuseScore !== null && item.abuseScore !== undefined) {
    scoreVal = Number(item.abuseScore);
  } else if (item.compositeScore !== undefined && item.compositeScore !== null) {
    scoreVal = item.compositeScore;
  }
  const scoreStr = scoreVal !== null ? `${scoreVal}%` : 'N/A';
  return { sourceName, scoreVal, scoreStr };
}

/**
 * Formats a single IP into a Charlie Reporter markdown table row.
 * Example output:
 * | IP | 185.220.101.5 | Germany (AS208294 Tor Network) | Threat Intel AbuseIPDB Score: 100% [Malicious / High Risk] (89 requests - sql_injection) |
 */
export function formatSingleIocRow(
  item: BulkIpItem,
  options?: { includeActivityContext?: boolean }
): string {
  const includeActivity = options?.includeActivityContext !== false;

  // 1. Private / Internal IP Handling
  if (isPrivateIp(item.ip)) {
    return `| IP | ${item.ip} | Local Network | Private IP RFC1918 [Internal Network Context] |`;
  }

  // 2. Geolocation & ASN Handling
  const country = item.countryName || getFullCountryName(item.countryCode);
  const rawAsn = item.asn || item.isp;
  const hasAsn = Boolean(rawAsn && rawAsn !== 'Unknown' && rawAsn !== 'N/A');

  let countryAsn = 'External Network';
  if (country !== 'Unknown' && hasAsn) {
    countryAsn = `${country} (${rawAsn})`;
  } else if (country !== 'Unknown') {
    countryAsn = country;
  } else if (hasAsn) {
    countryAsn = `External Network (${rawAsn})`;
  }

  // 3. Not Found / Un-enriched Handling
  if (item.found === false) {
    return `| IP | ${item.ip} | ${countryAsn} | External Source IP [Reputation Not Enriched] |`;
  }

  // 4. Reputation & Threat Intel Scoring
  const { sourceName, scoreVal, scoreStr } = resolveEffectiveScore(item);
  const threatLabel = classifyThreatScore(scoreVal);
  let desc = `Threat Intel ${sourceName} Score: ${scoreStr} [${threatLabel}]`;

  // 5. Activity Context (Attack Type only; request counts removed per SOC reporting standard)
  if (includeActivity && item.topAttackType && item.topAttackType !== 'None' && item.topAttackType !== 'Unspecified') {
    desc += ` (${item.topAttackType})`;
  }

  return `| IP | ${item.ip} | ${countryAsn} | ${desc} |`;
}

/**
 * Formats a list of bulk IP lookup results into the complete Charlie Reporter IoC Markdown structure.
 */
export function formatCharlieIocMarkdown(
  items: BulkIpItem[],
  options: CharlieIocFormatOptions = {}
): string {
  const {
    includeSectionHeader = true,
    includeHashRow = true,
    includeFootnote = true,
    includeActivityContext = true,
    reportVariant = 'charlie',
  } = options;

  const footnoteText =
    reportVariant === 'charlie'
      ? '| * | Catatan: Validasi reputasi dan geolokasi IP diverifikasi melalui AbuseIPDB, VirusTotal, dan ip-api.com. |'
      : '| * | Catatan: IP sumber dicatat dari telemetri host internal/sistem; reputasi dan atribut jaringan diverifikasi melalui threat intelligence bila tersedia. |';

  if (!items || items.length === 0) {
    let emptyResult = '';
    if (includeSectionHeader) {
      emptyResult += '**2. INDICATOR OF COMPROMISE**\n\n';
    }
    emptyResult += '| Tipe IoC | Nilai | Negara (ASN) | Keterangan |\n';
    emptyResult += '| ----- | ----- | ----- | ----- |\n';
    emptyResult += '| IP | Tidak ditemukan indicator terkait | N/A | N/A |\n';
    if (includeHashRow) {
      emptyResult += '| Hash | Tidak ditemukan indicator terkait | N/A | N/A |\n';
    }
    if (includeFootnote) {
      emptyResult += `\n${footnoteText}\n`;
      emptyResult += '| :---- | :---- |\n';
    }
    return emptyResult.trimEnd();
  }

  // Separate non-private and private IPs
  const nonPrivateList: BulkIpItem[] = [];
  const privateList: BulkIpItem[] = [];

  for (const item of items) {
    if (isPrivateIp(item.ip)) {
      privateList.push(item);
    } else {
      nonPrivateList.push(item);
    }
  }

  // Sort non-private IPs descending: highest threat score on top (matching Charlie Reporter generateIocRows)
  nonPrivateList.sort((a, b) => {
    const scoreA = resolveEffectiveScore(a).scoreVal ?? -1;
    const scoreB = resolveEffectiveScore(b).scoreVal ?? -1;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    const alertsA = a.totalAlertCount || 0;
    const alertsB = b.totalAlertCount || 0;
    if (alertsB !== alertsA) {
      return alertsB - alertsA;
    }
    return a.ip.localeCompare(b.ip);
  });

  // Build markdown table
  let md = '';
  if (includeSectionHeader) {
    md += '**2. INDICATOR OF COMPROMISE**\n\n';
  }

  md += '| Tipe IoC | Nilai | Negara (ASN) | Keterangan |\n';
  md += '| ----- | ----- | ----- | ----- |\n';

  // Add non-private IP rows
  for (const item of nonPrivateList) {
    md += `${formatSingleIocRow(item, { includeActivityContext })}\n`;
  }

  // Add private IP rows at the bottom
  for (const item of privateList) {
    md += `${formatSingleIocRow(item, { includeActivityContext })}\n`;
  }

  // Hash indicator row
  if (includeHashRow) {
    md += '| Hash | Tidak ditemukan indicator terkait | N/A | N/A |\n';
  }

  // Footnote note
  if (includeFootnote) {
    md += `\n${footnoteText}\n`;
    md += '| :---- | :---- |\n';
  }

  return md.trimEnd();
}

/**
 * Formats a list of bulk IP lookup results into Alpha Reporter IoC Markdown structure.
 */
export function formatAlphaIocMarkdown(
  items: BulkIpItem[],
  options: CharlieIocFormatOptions = {}
): string {
  return formatCharlieIocMarkdown(items, {
    reportVariant: 'alpha',
    ...options,
  });
}
