import {withApiPermission} from '../../../../../lib/authorization';
import {listOwnedRecords,ownedQuerySchema,MaintenanceError} from '../../../../../lib/database-management';
import {databaseResponse} from '../_shared';
export const GET=withApiPermission(async(request,_context,session)=>databaseResponse(async()=>{
 const params=new URL(request.url).searchParams;
 if([...params.keys()].some(key=>params.getAll(key).length>1))throw new MaintenanceError(400,'DUPLICATE_PARAMETER');
 const {limit,cursor,...filter}=ownedQuerySchema.parse(Object.fromEntries(params));
 return listOwnedRecords(session,filter,{limit,cursor});
}),'database:read');
