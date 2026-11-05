import { NextResponse } from 'next/server';
import { login, AUTH_COOKIE_NAME, SESSION_TTL_SECONDS, AuthError } from '../../../../lib/auth';
import { apiError, readAuthJson, validateOrigin } from '../../../../lib/authorization';
import { getAppOrigin } from '../../../../lib/config';
export async function POST(request: Request) {
 try {
  validateOrigin(request);
  const {username,password}=await readAuthJson(request);
  if(typeof username!=='string' || typeof password!=='string')throw new AuthError(400,'Invalid request');
  const {token}=await login(username,password);
  const response=NextResponse.json({success:true},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(AUTH_COOKIE_NAME,token,{httpOnly:true,secure:getAppOrigin().startsWith('https:'),sameSite:'lax',path:'/',maxAge:SESSION_TTL_SECONDS});
  return response;
 }catch(error){return apiError(error);}
}
