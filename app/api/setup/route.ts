import { completeBootstrap, getInstallationState } from '../../../lib/bootstrap';
import { AuthError } from '../../../lib/auth';
import { apiError, readAuthJson, validateOrigin } from '../../../lib/authorization';
export async function GET() {
 try {return Response.json({state:await getInstallationState()},{headers:{'Cache-Control':'no-store'}});}
 catch(error){return apiError(error);}
}
export async function POST(request:Request) {
 try {
  validateOrigin(request);const {token,username,password}=await readAuthJson(request);
  if(typeof token!=='string' || typeof username!=='string' || typeof password!=='string')throw new AuthError(400,'Invalid request');
  await completeBootstrap({token,username,password});
  return Response.json({success:true},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiError(error);}
}
