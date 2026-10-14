import { NextResponse } from 'next/server';
import { getProviderDetail } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: Request,
  props: { params: Promise<{ name: string }> }
) {
  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { allowed } = checkRateLimit(`provider-detail:${clientIp}`, 60, 2);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const params = await props.params;
  const rawName = decodeURIComponent(params.name || '').trim();

  if (!rawName) {
    return NextResponse.json({ error: 'Provider name is required' }, { status: 400 });
  }

  try {
    const detail = await getProviderDetail(rawName);
    if (!detail.summary) {
      return NextResponse.json(
        { success: false, message: `No threat intelligence found for provider '${rawName}'` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      provider: detail.summary,
      attackTypes: detail.attackTypes,
      targetHosts: detail.targetHosts,
      ips: detail.ips,
    });
  } catch (err: any) {
    console.error(`[API /api/providers/${rawName} Error]`, err);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  }
}
