import { NextResponse } from 'next/server';
import { getBulkIntel } from '@/lib/db';
import { isValidIP } from '@/lib/ip-validator';
import { calculateVerdictScore } from '@/lib/scoring';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { allowed } = checkRateLimit(`bulk:${clientIp}`, 15, 0.2);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const body = await request.json();
    let rawList: string[] = [];

    if (Array.isArray(body.ips)) {
      rawList = body.ips;
    } else if (typeof body.text === 'string') {
      rawList = body.text
        .split(/[\r\n,]+/)
        .map((s: string) => s.trim())
        .filter(Boolean);
    }

    // Limit to 200 max to prevent abuse
    const uniqueIps = Array.from(new Set(rawList.filter(isValidIP))).slice(0, 200);

    if (uniqueIps.length === 0) {
      return NextResponse.json(
        { error: 'No valid IPv4 or IPv6 addresses provided.' },
        { status: 400 }
      );
    }

    const rows = await getBulkIntel(uniqueIps);
    const rowMap = new Map(rows.map((r) => [r.ip, r]));

    const results = uniqueIps.map((ip) => {
      const row = rowMap.get(ip);
      if (!row) {
        return {
          ip,
          found: false,
          verdict: 'Unknown',
          compositeScore: 0,
          countryCode: 'N/A',
          countryName: null,
          isp: 'Unknown',
          asn: 'N/A',
          totalAlertCount: 0,
          topAttackType: 'None',
          lastSeen: null,
          abuseScore: null,
          vtMalicious: null,
          reputationSource: null,
        };
      }

      const scoring = calculateVerdictScore({
        abuseScore: row.abuse_score,
        vtMalicious: row.vt_malicious,
        totalAlertCount: row.total_alert_count,
        distinctTargetsCount: row.target_hosts?.length || 1,
        lastSeen: row.last_seen,
      });

      const asn = (row.geo_json && (row.geo_json.as || row.geo_json.isp)) || row.isp || 'Unknown';
      const countryName = row.geo_json?.country || null;

      return {
        ip,
        found: true,
        verdict: scoring.verdict,
        verdictColor: scoring.verdictColor,
        compositeScore: scoring.compositeScore,
        countryCode: row.country_code || 'XX',
        countryName,
        isp: row.isp || 'Unknown',
        asn,
        totalAlertCount: row.total_alert_count || 1,
        topAttackType: row.attack_types?.[0] || 'Unspecified',
        lastSeen: row.last_seen,
        abuseScore: row.abuse_score ?? null,
        vtMalicious: row.vt_malicious ?? null,
        reputationSource: row.reputation_source ?? (row.abuse_score !== null ? 'abuseipdb' : row.vt_malicious !== null ? 'virustotal' : null),
      };
    });

    return NextResponse.json({
      success: true,
      totalRequested: uniqueIps.length,
      foundCount: rows.length,
      results,
    });
  } catch (err: any) {
    console.error('[API /bulk Error]', err);
    return NextResponse.json({ error: 'Failed to process bulk lookup' }, { status: 500 });
  }
}
