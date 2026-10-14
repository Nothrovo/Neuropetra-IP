import { NextResponse } from 'next/server';
import { getDashboardAnalytics } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { allowed } = checkRateLimit(`dashboard:${clientIp}`, 30, 0.5);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30', 10);

  try {
    const data = await getDashboardAnalytics(days);
    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    console.error('[API /dashboard Error]', err);
    return NextResponse.json({ error: 'Failed to retrieve analytics' }, { status: 500 });
  }
}
