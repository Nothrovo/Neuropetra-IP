import {withApiPermission,readAuthJson,requireRecentAuth,validateOrigin} from '../../../../../../lib/authorization';
import {executeMaintenance,executeSchema} from '../../../../../../lib/database-management';
import {databaseResponse} from '../../_shared';
export const POST=withApiPermission(async(request,_context,session)=>{
 validateOrigin(request);requireRecentAuth(session);
 return databaseResponse(async()=>{const input=executeSchema.parse(await readAuthJson(request));return executeMaintenance(session,input.planId,input.confirmation,input.idempotencyKey);});
},'database:manage');
