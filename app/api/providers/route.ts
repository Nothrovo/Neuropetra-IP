import { NextResponse } from 'next/server';
import { searchProviders } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { allowed } = checkRateLimit(`providers-search:${clientIp}`, 60, 2);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    const { providers, total } = await searchProviders(q, limit, offset);
    return NextResponse.json({
      success: true,
      query: q,
      total,
      limit,
      offset,
      providers,
    });
  } catch (err: any) {
    console.error('[API /api/providers Error]', err);
    return NextResponse.json({ error: 'Failed to search providers' }, { status: 500 });
  }
}
