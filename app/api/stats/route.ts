import { NextResponse } from 'next/server';
import { getGlobalStats, getTopAttackers, getRecentEvents } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { allowed } = checkRateLimit(`stats:${ip}`, 30, 0.5);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const [stats, topAttackers, recentEvents] = await Promise.all([
      getGlobalStats(),
      getTopAttackers(10),
      getRecentEvents(10),
    ]);

    return NextResponse.json({
      success: true,
      stats,
      topAttackers,
      recentEvents,
    });
  } catch (err: any) {
    console.error('[API /stats Error]', err);
    return NextResponse.json({ error: 'Failed to retrieve stats' }, { status: 500 });
  }
}
