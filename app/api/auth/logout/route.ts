import { NextResponse } from 'next/server';
import { requireSession, revokeSession, AUTH_COOKIE_NAME } from '../../../../lib/auth';
import { apiError, validateOrigin } from '../../../../lib/authorization';
import { getAppOrigin } from '../../../../lib/config';
export async function POST(request: Request) {
 try {
  validateOrigin(request);
  await revokeSession(await requireSession(request));
  const response=NextResponse.json({success:true},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(AUTH_COOKIE_NAME,'',{httpOnly:true,secure:getAppOrigin().startsWith('https:'),sameSite:'lax',path:'/',maxAge:0});
  return response;
 }catch(error){return apiError(error);}
}
