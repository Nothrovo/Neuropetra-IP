import { withApiPermission } from '@/lib/authorization';
import { apiError,exactIp,parseTelemetryScope } from '@/lib/api-input';
import { getIpSummary } from '@/lib/telemetry-aggregates';
import { checkRateLimit } from '@/lib/rate-limit';
export const GET=withApiPermission<{params:Promise<{ip:string}>}>(async(request,context,session)=>{
 if(!checkRateLimit(`summary:${session.userId}`).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try {const ip=exactIp((await context.params).ip),scope=parseTelemetryScope(new URL(request.url).searchParams);return Response.json({success:true,ip,scope,...await getIpSummary(ip,scope)});}catch(error){return apiError(error);}
},'read');
