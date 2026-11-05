import {searchProviders} from '@/lib/db';
import {withApiPermission} from '@/lib/authorization';
import {apiError,ApiInputError,integerParam} from '@/lib/api-input';
import {checkRateLimit} from '@/lib/rate-limit';
export const GET=withApiPermission(async(request,_context,session)=>{
 if(!checkRateLimit(`providers:${session.userId}`).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try{const params=new URL(request.url).searchParams,q=params.get('q')??'';if(q.length>256)throw new ApiInputError('Search is too long');const limit=integerParam(params,'limit',20,1,100),offset=integerParam(params,'offset',0,0,1000000);return Response.json({success:true,query:q,...await searchProviders(q,limit,offset),limit,offset});}catch(error){return apiError(error);}
},'read');
