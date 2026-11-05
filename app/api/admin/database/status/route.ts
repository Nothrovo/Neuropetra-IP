import {withApiPermission} from '../../../../../lib/authorization';
import {getDatabaseStatus} from '../../../../../lib/database-management';
import {databaseResponse} from '../_shared';
export const GET=withApiPermission(async(_request,_context,session)=>databaseResponse(()=>getDatabaseStatus(session)),'database:read');
