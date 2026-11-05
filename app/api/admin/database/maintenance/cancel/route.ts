import {z} from 'zod';
import {withApiPermission,readAuthJson,requireRecentAuth} from '../../../../../../lib/authorization';
import {maintenanceRepository} from '../../../../../../lib/maintenance-repository';
import {databaseResponse} from '../../_shared';
const schema=z.object({jobId:z.uuid()}).strict();
export const POST=withApiPermission(async(request,_context,session)=>{
 requireRecentAuth(session);
 return databaseResponse(async()=>maintenanceRepository().cancel(session,schema.parse(await readAuthJson(request)).jobId));
},'database:manage');
