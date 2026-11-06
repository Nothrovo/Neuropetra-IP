import { requireSession } from '../../../../lib/auth';
import { apiError, permissionsFor } from '../../../../lib/authorization';
import { getCapabilities } from '../../../../lib/config';
import { isEnrichmentActive } from '../../../../lib/enrichment-settings';
export async function GET(request: Request) {
 try {
  const session=await requireSession(request);
  const staticCaps = getCapabilities();
  const dynamicEnrichment = await isEnrichmentActive().catch(() => staticCaps.externalEnrichment);
  return Response.json({
    user:{userId:session.userId,username:session.username,role:session.role},
    permissions:permissionsFor(session.role),
    capabilities: { ...staticCaps, externalEnrichment: dynamicEnrichment }
  },{headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiError(error);}
}
