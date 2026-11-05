import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {AuthError} from '../../../../lib/auth';
import {MaintenanceError} from '../../../../lib/database-management';
export async function databaseResponse(run:()=>Promise<unknown>):Promise<NextResponse> {
 try {return NextResponse.json(await run(),{headers:{'Cache-Control':'no-store'}});}
 catch(error){
  if(error instanceof AuthError)throw error;
  const status=error instanceof ZodError?400:error instanceof MaintenanceError?error.status:503;
  const message=error instanceof ZodError?'INVALID_REQUEST':error instanceof MaintenanceError?error.code:'DATABASE_UNAVAILABLE';
  return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
 }
}
