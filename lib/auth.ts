import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'soc_session';
const DEFAULT_USER = {
  username: 'analyst',
  name: 'SOC Analyst',
  role: 'L1 Incident Responder',
};

export async function getSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf8'));
    return data;
  } catch {
    return null;
  }
}

export function createSessionToken(user = DEFAULT_USER) {
  return Buffer.from(JSON.stringify({ ...user, loginAt: new Date().toISOString() })).toString('base64');
}

export const AUTH_COOKIE_NAME = SESSION_COOKIE_NAME;
