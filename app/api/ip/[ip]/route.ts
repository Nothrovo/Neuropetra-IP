import { getIpIntel,getRelatedIps } from '@/lib/db';
import { getSubnet24 } from '@/lib/ip-validator';
import { calculateVerdictScore } from '@/lib/scoring';
import { withApiPermission } from '@/lib/authorization';
import { apiError,exactIp,parseTelemetryScope } from '@/lib/api-input';
import { getIpSummary } from '@/lib/telemetry-aggregates';
import { isReputationFresh,REPUTATION_TTL_HOURS } from '@/lib/provider-client';
import { checkRateLimit } from '@/lib/rate-limit';
export const GET=withApiPermission<{params:Promise<{ip:string}>}>(async(request,context,session)=>{
 if(!checkRateLimit(`ip:${session.userId}`).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try {
  const ip=exactIp((await context.params).ip),scope=parseTelemetryScope(new URL(request.url).searchParams),row=await getIpIntel(ip);
  if(!row)return Response.json({found:false,ip,message:'No local intelligence recorded for this indicator'});
  const summary=await getIpSummary(ip,scope),scoring=calculateVerdictScore({abuseScore:row.abuse_score,vtMalicious:row.vt_malicious,totalAlertCount:summary.eventCount,distinctTargetsCount:summary.distinctTargetsCount,lastSeen:summary.lastSeen,hasCriticalOutcome:summary.hasCriticalOutcome});
  const now=new Date(),ageHours=row.reputation_checked_at?(now.getTime()-Date.parse(row.reputation_checked_at))/3600000:NaN;
  const cacheFreshness=Number.isFinite(ageHours)?{checkedAt:row.reputation_checked_at,ageHours:Math.round(Math.max(0,ageHours)),ageDays:(Math.max(0,ageHours)/24).toFixed(1),ttlDaysLeft:(Math.max(0,REPUTATION_TTL_HOURS-ageHours)/24).toFixed(1),isExpired:!isReputationFresh(row.reputation_checked_at,now)}:null;
  const subnet24=getSubnet24(ip),relatedIps=await getRelatedIps(ip,subnet24,row.isp);
  return Response.json({found:true,intel:row,scoring,cacheFreshness,hasCriticalOutcome:summary.hasCriticalOutcome,scope,summary,subnet24,relatedIps});
 }catch(error){return apiError(error);}
},'read');
