import {getProviderIps} from '@/lib/db';
import {withApiPermission} from '@/lib/authorization';
import {apiError,ApiInputError,integerParam} from '@/lib/api-input';
import {feedFormat,serializeFeed} from '@/lib/export';
import {checkRateLimit} from '@/lib/rate-limit';
export const GET=withApiPermission<{params:Promise<{name:string}>}>(async(request,context,session)=>{
 if(!checkRateLimit(`provider-export:${session.userId}`,30,0.5).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try{const name=(await context.params).name.trim();if(!name||name.length>512)throw new ApiInputError('Invalid provider name');const params=new URL(request.url).searchParams,format=feedFormat(params.get('format')),maxRows=integerParam(params,'max_rows',10000,1,10000),page=await getProviderIps(name,maxRows,0);if(page.total>maxRows)throw new ApiInputError(`Export exceeds ${maxRows} rows; narrow selection or use paginated roster`,413);if(!page.total)return Response.json({error:'No indicators found'},{status:404});const slug=name.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);return new Response(serializeFeed(page.items,format),{headers:{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="${slug}.${format}"`,'X-Export-Count':String(page.total)}});}catch(error){return apiError(error);}
},'export');
