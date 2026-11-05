import { AuthError, requireSession, reauthenticate } from '../../../../lib/auth';
import { apiError, readAuthJson, validateOrigin } from '../../../../lib/authorization';
export async function POST(request: Request) {
 try {
  validateOrigin(request);const session=await requireSession(request);
  const {password}=await readAuthJson(request);
  if(typeof password!=='string')throw new AuthError(400,'Invalid request');
  await reauthenticate(session,password);
  return Response.json({success:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiError(error);}
}
