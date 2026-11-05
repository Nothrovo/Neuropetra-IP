import { NextResponse, type NextRequest } from 'next/server';
import { AuthError, requireSession } from './lib/auth';
import { apiError } from './lib/authorization';
import { requireFeedToken } from './lib/feed-auth';
const publicPaths=new Set(['/login','/setup','/api/setup','/api/health','/api/ready','/api/auth/login','/api/auth/logout','/api/auth/session','/api/auth/reauth']);
export async function proxy(request: NextRequest) {
 const {pathname}=request.nextUrl;
 if(pathname.startsWith('/_next/') || pathname==='/favicon.ico' || publicPaths.has(pathname))return NextResponse.next();
 try {
  if(pathname==='/api/blocklist' && request.method==='GET' && request.headers.has('authorization')) {
   await requireFeedToken(request);return NextResponse.next();
  }
  await requireSession(request);return NextResponse.next();
 }
 catch(error){
  if(!(error instanceof AuthError) || error.status!==401 || pathname.startsWith('/api/'))return apiError(error);
  const url=new URL('/login',request.url);url.searchParams.set('from',pathname+request.nextUrl.search);
  return NextResponse.redirect(url);
 }
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
