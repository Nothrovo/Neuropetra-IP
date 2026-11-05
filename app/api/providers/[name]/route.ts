import {getProviderDetail} from '@/lib/db';
import {withApiPermission} from '@/lib/authorization';
import {apiError,ApiInputError,integerParam} from '@/lib/api-input';
import {checkRateLimit} from '@/lib/rate-limit';
export const GET=withApiPermission<{params:Promise<{name:string}>}>(async(request,context,session)=>{
 if(!checkRateLimit(`provider-detail:${session.userId}`).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try{const name=(await context.params).name.trim();if(!name||name.length>512)throw new ApiInputError('Invalid provider name');const params=new URL(request.url).searchParams,limit=integerParam(params,'limit',100,1,100),offset=integerParam(params,'offset',0,0,1000000),detail=await getProviderDetail(name,limit,offset);if(!detail.summary)return Response.json({success:false,message:'Provider not found'},{status:404});return Response.json({success:true,provider:detail.summary,attackTypes:detail.attackTypes,targetHosts:detail.targetHosts,ips:detail.ips,total:detail.summary.ip_count,limit,offset,hasMore:offset+detail.ips.length<detail.summary.ip_count});}catch(error){return apiError(error);}
},'read');
