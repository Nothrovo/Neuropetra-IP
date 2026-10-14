import { NextResponse } from 'next/server';
import { getIpIntel, upsertIpIntelReputation } from '@/lib/db';
import { isValidIP, isPrivateIp } from '@/lib/ip-validator';
import { calculateVerdictScore } from '@/lib/scoring';
import { getFullCountryName } from '@/lib/charlie-ioc-formatter';
import { checkRateLimit } from '@/lib/rate-limit';

const DEFAULT_ABUSE_KEY =
  process.env.ABUSEIPDB_API_KEY ||
  '[REDACTED_ABUSEIPDB_KEY]';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface EnrichedIpResult {
  ip: string;
  source: 'cache' | 'abuseipdb_live' | 'local_private';
  status: 'cached' | 'enriched' | 'private' | 'rate_limited' | 'error';
  abuseScore: number | null;
  compositeScore: number;
  verdict: 'Malicious' | 'Suspicious' | 'Low risk' | 'Unknown';
  verdictColor: 'red' | 'amber' | 'emerald' | 'slate';
  countryCode: string | null;
  countryName: string | null;
  isp: string | null;
  domain: string | null;
  usageType: string | null;
  totalReports: number;
  numDistinctUsers: number;
  lastReportedAt: string | null;
  isTor: boolean;
  isWhitelisted: boolean;
  savedToDb: boolean;
  checkedAt: string;
  error?: string | null;
}

export async function POST(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { allowed } = checkRateLimit(`enrich:${clientIp}`, 30, 0.5);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait a moment.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    let rawList: string[] = [];

    if (Array.isArray(body.ips)) {
      rawList = body.ips;
    } else if (typeof body.ip === 'string') {
      rawList = [body.ip];
    } else if (typeof body.text === 'string') {
      rawList = body.text
        .split(/[\r\n,\s;]+/)
        .map((s: string) => s.trim())
        .filter(Boolean);
    }

    const checkCacheFirst = body.checkCacheFirst !== false; // default true
    const customKey = typeof body.apiKey === 'string' && body.apiKey.trim().length > 10 ? body.apiKey.trim() : null;
    const apiKey = customKey || DEFAULT_ABUSE_KEY;

    // Filter valid unique IPs up to 100 max per batch
    const uniqueIps = Array.from(new Set(rawList.map((ip) => ip.trim()).filter(isValidIP))).slice(0, 100);

    if (uniqueIps.length === 0) {
      return NextResponse.json(
        { error: 'No valid IPv4 or IPv6 addresses provided.' },
        { status: 400 }
      );
    }

    const results: EnrichedIpResult[] = [];
    let cachedCount = 0;
    let enrichedCount = 0;
    let savedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < uniqueIps.length; i++) {
      const ip = uniqueIps[i];

      // 1. Check DB Cache First (if enabled)
      if (checkCacheFirst) {
        try {
          const cached = await getIpIntel(ip);
          if (cached && (cached.abuse_score !== null || cached.reputation_source)) {
            const scoring = calculateVerdictScore({
              abuseScore: cached.abuse_score,
              vtMalicious: cached.vt_malicious,
              totalAlertCount: cached.total_alert_count,
              distinctTargetsCount: cached.target_hosts?.length || 1,
              lastSeen: cached.last_seen,
            });

            const repJson = (cached.reputation_json || {}) as any;
            const geoJson = (cached.geo_json || {}) as any;

            results.push({
              ip,
              source: 'cache',
              status: 'cached',
              abuseScore: cached.abuse_score ?? 0,
              compositeScore: scoring.compositeScore,
              verdict: scoring.verdict,
              verdictColor: scoring.verdictColor,
              countryCode: cached.country_code || geoJson.countryCode || null,
              countryName: geoJson.country || getFullCountryName(cached.country_code),
              isp: cached.isp || geoJson.isp || 'Unknown',
              domain: repJson.domain || geoJson.domain || null,
              usageType: repJson.usageType || geoJson.usageType || null,
              totalReports: repJson.totalReports || 0,
              numDistinctUsers: repJson.numDistinctUsers || 0,
              lastReportedAt: repJson.lastReportedAt || null,
              isTor: Boolean(repJson.isTor),
              isWhitelisted: Boolean(repJson.isWhitelisted),
              savedToDb: true,
              checkedAt: cached.reputation_checked_at || cached.last_seen || new Date().toISOString(),
            });

            cachedCount++;
            continue;
          }
        } catch (dbErr) {
          console.warn(`[Enrich Cache Check Error for ${ip}]`, dbErr);
        }
      }

      // 2. Private IP evaluation
      if (isPrivateIp(ip)) {
        results.push({
          ip,
          source: 'local_private',
          status: 'private',
          abuseScore: 0,
          compositeScore: 0,
          verdict: 'Low risk',
          verdictColor: 'emerald',
          countryCode: 'LAN',
          countryName: 'Local Network (RFC1918)',
          isp: 'Private Local Network',
          domain: null,
          usageType: 'Private / Intranet',
          totalReports: 0,
          numDistinctUsers: 0,
          lastReportedAt: null,
          isTor: false,
          isWhitelisted: true,
          savedToDb: false,
          checkedAt: new Date().toISOString(),
        });
        continue;
      }

      // 3. Public IP: Live AbuseIPDB API Query
      try {
        // Pacing delay (250ms) between external requests to avoid 429
        if (enrichedCount > 0) {
          await sleep(250);
        }

        const abuseUrl = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90&verbose`;
        const response = await fetch(abuseUrl, {
          method: 'GET',
          headers: {
            Key: apiKey,
            Accept: 'application/json',
          },
        });

        if (response.status === 429) {
          results.push({
            ip,
            source: 'abuseipdb_live',
            status: 'rate_limited',
            abuseScore: null,
            compositeScore: 0,
            verdict: 'Unknown',
            verdictColor: 'slate',
            countryCode: null,
            countryName: null,
            isp: null,
            domain: null,
            usageType: null,
            totalReports: 0,
            numDistinctUsers: 0,
            lastReportedAt: null,
            isTor: false,
            isWhitelisted: false,
            savedToDb: false,
            checkedAt: new Date().toISOString(),
            error: 'AbuseIPDB Rate Limit (429): Daily quota reached or request rate too fast.',
          });
          errorCount++;
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          let parsedError = `HTTP ${response.status}: AbuseIPDB lookup failed`;
          try {
            const errJson = JSON.parse(errText);
            if (errJson.errors?.[0]?.detail) {
              parsedError = errJson.errors[0].detail;
            }
          } catch {}

          results.push({
            ip,
            source: 'abuseipdb_live',
            status: 'error',
            abuseScore: null,
            compositeScore: 0,
            verdict: 'Unknown',
            verdictColor: 'slate',
            countryCode: null,
            countryName: null,
            isp: null,
            domain: null,
            usageType: null,
            totalReports: 0,
            numDistinctUsers: 0,
            lastReportedAt: null,
            isTor: false,
            isWhitelisted: false,
            savedToDb: false,
            checkedAt: new Date().toISOString(),
            error: parsedError,
          });
          errorCount++;
          continue;
        }

        const resData = await response.json();
        const data = resData.data;

        if (!data) {
          throw new Error('Invalid response payload from AbuseIPDB');
        }

        const score = typeof data.abuseConfidenceScore === 'number' ? data.abuseConfidenceScore : 0;
        const scoring = calculateVerdictScore({
          abuseScore: score,
          lastSeen: new Date(),
        });

        const geoObj = {
          country: getFullCountryName(data.countryCode),
          countryCode: data.countryCode || null,
          isp: data.isp || 'Unknown',
          as: data.isp || 'Unknown',
          usageType: data.usageType || null,
          domain: data.domain || null,
        };

        // Persist immediately into PostgreSQL cache
        let isSaved = false;
        try {
          await upsertIpIntelReputation({
            ip,
            abuseScore: score,
            countryCode: data.countryCode || null,
            isp: data.isp || null,
            domain: data.domain || null,
            usageType: data.usageType || null,
            totalReports: data.totalReports || 0,
            numDistinctUsers: data.numDistinctUsers || 0,
            lastReportedAt: data.lastReportedAt || null,
            reputationJson: data,
            geoJson: geoObj,
          });
          isSaved = true;
          savedCount++;
        } catch (saveErr: any) {
          console.error(`[Enrich DB Save Error for ${ip}]`, saveErr.message);
        }

        results.push({
          ip,
          source: 'abuseipdb_live',
          status: 'enriched',
          abuseScore: score,
          compositeScore: scoring.compositeScore,
          verdict: scoring.verdict,
          verdictColor: scoring.verdictColor,
          countryCode: data.countryCode || null,
          countryName: geoObj.country,
          isp: data.isp || 'Unknown',
          domain: data.domain || null,
          usageType: data.usageType || null,
          totalReports: data.totalReports || 0,
          numDistinctUsers: data.numDistinctUsers || 0,
          lastReportedAt: data.lastReportedAt || null,
          isTor: Boolean(data.isTor),
          isWhitelisted: Boolean(data.isWhitelisted),
          savedToDb: isSaved,
          checkedAt: new Date().toISOString(),
        });

        enrichedCount++;
      } catch (reqErr: any) {
        console.error(`[Enrich Request Error for ${ip}]`, reqErr);
        results.push({
          ip,
          source: 'abuseipdb_live',
          status: 'error',
          abuseScore: null,
          compositeScore: 0,
          verdict: 'Unknown',
          verdictColor: 'slate',
          countryCode: null,
          countryName: null,
          isp: null,
          domain: null,
          usageType: null,
          totalReports: 0,
          numDistinctUsers: 0,
          lastReportedAt: null,
          isTor: false,
          isWhitelisted: false,
          savedToDb: false,
          checkedAt: new Date().toISOString(),
          error: reqErr.message || 'Network request failed',
        });
        errorCount++;
      }
    }

    return NextResponse.json({
      success: true,
      totalRequested: uniqueIps.length,
      cachedCount,
      enrichedCount,
      savedCount,
      errorCount,
      results,
    });
  } catch (err: any) {
    console.error('[API /api/enrich Error]', err);
    return NextResponse.json({ error: 'Internal server error while enriching IPs' }, { status: 500 });
  }
}
