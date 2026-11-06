import {getBlocklistData} from '@/lib/db';
import {withApiPermission,apiError as authError} from '@/lib/authorization';
import {requireFeedToken} from '@/lib/feed-auth';
import {apiError,ApiInputError,integerParam} from '@/lib/api-input';
import {feedFormat,serializeFeed} from '@/lib/export';
import {checkRateLimit} from '@/lib/rate-limit';
async function feed(request:Request,identity:string):Promise<Response> {
 if(!checkRateLimit(`blocklist:${identity}`,30,0.5).allowed)return Response.json({error:'Rate limit exceeded'},{status:429});
 try{const params=new URL(request.url).searchParams,format=feedFormat(params.get('format')),minScore=integerParam(params,'min_score',75,0,100),isRepRequested=params.get('include_reputation')==='true',defaultMinAlerts=isRepRequested?0:1,minAlerts=integerParam(params,'min_alerts',defaultMinAlerts,0,1000000000),maxAgeDays=integerParam(params,'days',30,1,3660),maxRows=integerParam(params,'max_rows',10000,1,10000);const includeReputation=isRepRequested||minAlerts===0;const rows=await getBlocklistData({minScore,minAlerts,maxAgeDays,maxRows,includeReputation});if(rows.length>maxRows)throw new ApiInputError(`Feed exceeds ${maxRows} rows; narrow filters`,413);return new Response(serializeFeed(rows,format),{headers:{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="ip_blocklist.${format}"`,'Cache-Control':'no-store','X-Export-Count':String(rows.length)}});}catch(error){return apiError(error);}
}
const interactive=withApiPermission(async(request,_context,session)=>feed(request,`session:${session.userId}`),'feed:read');
export async function GET(request:Request,context:unknown):Promise<Response> {
 if(request.headers.has('authorization')){try{const token=await requireFeedToken(request);return await feed(request,`token:${token.id}`);}catch(error){return authError(error);}}
 return interactive(request,context);
}
