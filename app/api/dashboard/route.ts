import {getDashboardAnalytics} from '@/lib/db';
import {withApiPermission} from '@/lib/authorization';
import {apiError,parseTelemetryScope} from '@/lib/api-input';
import {checkRateLimit} from '@/lib/rate-limit';
export const GET=withApiPermission(async(request,_context,session)=>{
 if(!checkRateLimit(`dashboard:${session.userId}`,30,0.5).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try{const scope=parseTelemetryScope(new URL(request.url).searchParams);return Response.json({success:true,...await getDashboardAnalytics(30,scope)});}catch(error){return apiError(error);}
},'read');
