import {withApiPermission,readAuthJson} from '../../../../../../lib/authorization';
import {previewMaintenance,maintenanceRequestSchema} from '../../../../../../lib/database-management';
import {databaseResponse} from '../../_shared';
export const POST=withApiPermission(async(request,_context,session)=>databaseResponse(async()=>previewMaintenance(session,maintenanceRequestSchema.parse(await readAuthJson(request)))),'database:manage');
