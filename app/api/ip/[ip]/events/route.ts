import { NextResponse } from 'next/server';
import { getIpEvents } from '@/lib/db';
import { validateIpOrCidr } from '@/lib/ip-validator';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: Request,
  props: { params: Promise<{ ip: string }> }
) {
  const params = await props.params;
  const rawIp = decodeURIComponent(params.ip || '').trim();

  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { allowed } = checkRateLimit(`events:${clientIp}`, 60, 1);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const validation = validateIpOrCidr(rawIp);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid IP address' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const alertType = searchParams.get('alert_type') || undefined;
  const outcome = searchParams.get('outcome') || undefined;
  const targetHost = searchParams.get('target_host') || undefined;
  const days = searchParams.get('days') ? parseInt(searchParams.get('days')!, 10) : undefined;

  try {
    const { events, total } = await getIpEvents(rawIp, {
      limit,
      offset,
      alertType,
      outcome,
      targetHost,
      days,
    });

    return NextResponse.json({
      success: true,
      ip: rawIp,
      events,
      total,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error(`[API /ip/${rawIp}/events Error]`, err);
    return NextResponse.json({ error: 'Failed to retrieve events' }, { status: 500 });
  }
}
