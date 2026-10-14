import { NextResponse } from 'next/server';
import { createSessionToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    // Default demo credentials or environment credentials
    const validUser = process.env.AUTH_USER || 'analyst';
    const validPass = process.env.AUTH_PASS || 'soc123';

    if (username === validUser && password === validPass) {
      const token = createSessionToken({
        username,
        name: 'SOC Analyst',
        role: 'L1 Incident Responder',
      });

      // Detect if the request came through HTTPS (e.g. reverse proxy or direct TLS)
      const isHttps =
        request.headers.get('x-forwarded-proto') === 'https' ||
        request.url.startsWith('https://');

      const response = NextResponse.json({ success: true, username });
      response.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isHttps, // Only set secure if served over HTTPS to allow LAN HTTP access
        sameSite: 'lax',
        path: '/',
        maxAge: 86400 * 7, // 7 days
      });
      return response;
    }

    return NextResponse.json({ error: 'Invalid credentials. Default is analyst / soc123' }, { status: 401 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
