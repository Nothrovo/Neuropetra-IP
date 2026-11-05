import { getIpEvents } from '@/lib/db';
import { withApiPermission } from '@/lib/authorization';
import { apiError,exactIp,integerParam,parseTelemetryScope } from '@/lib/api-input';
import { checkRateLimit } from '@/lib/rate-limit';
export const GET=withApiPermission<{params:Promise<{ip:string}>}>(async(request,context,session)=>{
 if(!checkRateLimit(`events:${session.userId}`).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try{const ip=exactIp((await context.params).ip),params=new URL(request.url).searchParams,limit=integerParam(params,'limit',20,1,100),offset=integerParam(params,'offset',0,0,1000000),scope=parseTelemetryScope(params);const data=await getIpEvents(ip,{...scope,limit,offset});return Response.json({success:true,ip,...data,limit,offset,scope});}catch(error){return apiError(error);}
},'read');
