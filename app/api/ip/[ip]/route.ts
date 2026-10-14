import { NextResponse } from 'next/server';
import { getIpIntel, getRelatedIps, getIpEvents } from '@/lib/db';
import { validateIpOrCidr, getSubnet24 } from '@/lib/ip-validator';
import { calculateVerdictScore, isCriticalOutcome } from '@/lib/scoring';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: Request,
  props: { params: Promise<{ ip: string }> }
) {
  const params = await props.params;
  const rawIp = decodeURIComponent(params.ip || '').trim();

  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { allowed } = checkRateLimit(`ip:${clientIp}`, 60, 1);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const validation = validateIpOrCidr(rawIp);
  if (!validation.valid || validation.type === 'invalid') {
    return NextResponse.json(
      { error: `Invalid IP format: '${rawIp}'. Expected valid IPv4 or IPv6.` },
      { status: 400 }
    );
  }

  try {
    const row = await getIpIntel(rawIp);
    if (!row) {
      return NextResponse.json({
        found: false,
        ip: rawIp,
        message: 'No threat intelligence recorded yet for this IP address.',
      });
    }

    // Check for critical outcomes from events
    const recentEvents = await getIpEvents(rawIp, { limit: 50 });
    const hasCritical = recentEvents.events.some((e) => isCriticalOutcome(e.outcome));

    // Calculate score & breakdown
    const scoreBreakdown = calculateVerdictScore({
      abuseScore: row.abuse_score,
      vtMalicious: row.vt_malicious,
      totalAlertCount: row.total_alert_count,
      distinctTargetsCount: row.target_hosts?.length || 1,
      lastSeen: row.last_seen,
      hasCriticalOutcome: hasCritical,
    });

    // Compute TTL freshness (7-day TTL)
    let cacheFreshness = null;
    if (row.reputation_checked_at) {
      const checkedAt = new Date(row.reputation_checked_at);
      const ageHours = Math.max(0, (Date.now() - checkedAt.getTime()) / (1000 * 3600));
      const ageDays = (ageHours / 24).toFixed(1);
      const ttlDaysLeft = Math.max(0, 7 - ageHours / 24).toFixed(1);
      cacheFreshness = {
        checkedAt: row.reputation_checked_at,
        ageHours: Math.round(ageHours),
        ageDays,
        ttlDaysLeft,
        isExpired: ageHours > 7 * 24,
      };
    }

    // Related IPs in same /24 or same ISP
    const subnet24 = getSubnet24(rawIp);
    const relatedIps = await getRelatedIps(rawIp, subnet24, row.isp);

    return NextResponse.json({
      found: true,
      intel: row,
      scoring: scoreBreakdown,
      cacheFreshness,
      hasCriticalOutcome: hasCritical,
      subnet24,
      relatedIps,
    });
  } catch (err: any) {
    console.error(`[API /ip/${rawIp} Error]`, err);
    return NextResponse.json({ error: 'Internal database error' }, { status: 500 });
  }
}
