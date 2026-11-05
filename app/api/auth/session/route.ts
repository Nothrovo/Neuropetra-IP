import { requireSession } from '../../../../lib/auth';
import { apiError, permissionsFor } from '../../../../lib/authorization';
import { getCapabilities } from '../../../../lib/config';
export async function GET(request: Request) {
 try {
  const session=await requireSession(request);
  return Response.json({user:{userId:session.userId,username:session.username,role:session.role},permissions:permissionsFor(session.role),capabilities:getCapabilities()},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiError(error);}
}
