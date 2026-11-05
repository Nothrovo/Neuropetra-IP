import {getGlobalStats,getTopAttackers,getRecentEvents} from '@/lib/db';
import {withApiPermission} from '@/lib/authorization';
import {apiError} from '@/lib/api-input';
import {checkRateLimit} from '@/lib/rate-limit';
export const GET=withApiPermission(async(_request,_context,session)=>{
 if(!checkRateLimit(`stats:${session.userId}`,30,0.5).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try{const [stats,topAttackers,recentEvents]=await Promise.all([getGlobalStats(),getTopAttackers(10),getRecentEvents(10)]);return Response.json({success:true,stats,topAttackers,recentEvents,scopeLabels:{ipsTracked:'all-time telemetry cache',maliciousCount:'all-time telemetry cache',distinctTargetHosts:'all-time telemetry cache',topAttackers:'all-time telemetry cache',recentEvents:'latest 10 events'}});}catch(error){return apiError(error);}
},'read');
