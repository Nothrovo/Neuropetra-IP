import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';

export const MAX_TARGETS = 200;
const ip = z.string().max(45).refine(value => isIP(value) !== 0, 'Expected an exact IP address');
export const maintenanceRequestSchema = z.object({
  operation: z.enum(['invalidate', 'delete']),
  ips: z.array(ip).min(1).max(MAX_TARGETS).optional(),
  olderThan: z.iso.datetime({offset:true}).optional(),
  retention: z.boolean().default(false),
}).strict().refine(value => Boolean(value.ips || value.olderThan), 'Select IPs or a UTC cutoff')
  .refine(value => !value.retention || Boolean(value.olderThan), 'Retention requires an explicit cutoff');
export const ownedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: ip.optional(),
  ip: ip.optional(),
  olderThan: z.iso.datetime({offset:true}).optional(),
}).strict();
export const executeSchema = z.object({
  planId:z.uuid(), confirmation:z.string().min(1).max(100), idempotencyKey:z.uuid(),
}).strict();
export type MaintenanceRequest = z.infer<typeof maintenanceRequestSchema>;
export type OwnedQuery = z.infer<typeof ownedQuerySchema>;
export type MaintenanceActor = {userId:string; role:string};
export type TargetVersion = {ip:string; revision:string};
export class MaintenanceError extends Error {
  constructor(public status:number, public code:string) { super(code); }
}
export function requireDatabaseAdmin(actor:MaintenanceActor):void {
  if (actor.role !== 'admin') throw new MaintenanceError(403,'FORBIDDEN');
}

export interface MaintenancePlan {
  id:string; actorId:string; operation:'invalidate'|'delete'; resource:'ip_intel_reputation';
  targets:TargetVersion[]; fingerprint:string; matchedCount:number; dependencyCount:0;
  expiresAt:string; state:'previewed'|'queued'|'completed'|'cancelled'|'failed';
  recoveryRequired:boolean; recoveryAvailable:boolean; confirmation:string;
  olderThan:string|null; retention:boolean;
}
export interface MaintenanceJob {
  id:string; planId:string; status:'queued'|'completed'|'cancelled'|'failed';
  matchedCount:number; affectedCount:number; createdAt:string; finishedAt:string|null;
  errorCode:string|null;
}
export interface OwnedRecord {
  ip:string; abuse_score:number|null; country_code:string|null; isp:string|null;
  reputation_checked_at:string|null; revision:string;
}
export interface DatabaseStatus {
  connected:boolean; identity:{deployment:'configured';databaseAlias:'IP Intel';schemaAlias:'public'};
  schemaVersion:string; resources:{name:string;ownership:'owned'|'shared-read-only'|'unverified-read-only';count:number;bytes:number;freshness:string|null}[];
  capabilities:{browse:boolean;maintenance:boolean;reason:string|null;bulkDelete:boolean};
  recovery:{available:boolean;instructions:string};
  jobs:MaintenanceJob[];
  policies:{id:string;enabled:boolean;cutoff:string;timezone:'UTC';scope:'ip_intel_reputation';nextRunAt:string|null;jobId:string|null;createdAt:string}[];
  audit:{id:string;actorId:string;action:string;fingerprint:string;matchedCount:number;affectedCount:number;outcome:string;createdAt:string}[];
}

export function fingerprint(targets:TargetVersion[]):string {
  return createHash('sha256').update(JSON.stringify([...targets].sort((a,b)=>a.ip.localeCompare(b.ip)).map(t=>[t.ip,t.revision]))).digest('hex');
}
export function assertExecutablePlan(plan:MaintenancePlan, actor:MaintenanceActor, confirmation:string, current:TargetVersion[], now=Date.now()):void {
  requireDatabaseAdmin(actor);
  if (plan.actorId !== actor.userId) throw new MaintenanceError(403,'FORBIDDEN');
  if (plan.state !== 'previewed' && plan.state !== 'queued') throw new MaintenanceError(409,'PLAN_ALREADY_USED');
  if (new Date(plan.expiresAt).getTime() <= now) throw new MaintenanceError(409,'PLAN_EXPIRED');
  if (confirmation !== plan.confirmation) throw new MaintenanceError(400,'CONFIRMATION_REQUIRED');
  if (current.length !== plan.targets.length || fingerprint(current) !== plan.fingerprint || fingerprint(plan.targets) !== plan.fingerprint) throw new MaintenanceError(409,'TARGETS_CHANGED');
  if (plan.recoveryRequired && !plan.recoveryAvailable) throw new MaintenanceError(409,'RECOVERY_CHECKPOINT_REQUIRED');
}

export async function getDatabaseStatus(actor:MaintenanceActor):Promise<DatabaseStatus> {
  requireDatabaseAdmin(actor);
  return (await import('./maintenance-repository')).maintenanceRepository().status();
}
export async function listOwnedRecords(actor:MaintenanceActor, filter:Omit<OwnedQuery,'limit'|'cursor'>, page:{limit:number;cursor?:string}) {
  requireDatabaseAdmin(actor);
  return (await import('./maintenance-repository')).maintenanceRepository().list(ownedQuerySchema.parse({...filter,...page}));
}
export async function previewMaintenance(actor:MaintenanceActor, request:MaintenanceRequest):Promise<MaintenancePlan> {
  requireDatabaseAdmin(actor);
  return (await import('./maintenance-repository')).maintenanceRepository().preview(actor,maintenanceRequestSchema.parse(request));
}
export async function executeMaintenance(actor:MaintenanceActor, planId:string, confirmation:string, idempotencyKey:string):Promise<MaintenanceJob> {
  requireDatabaseAdmin(actor);
  const input=executeSchema.parse({planId,confirmation,idempotencyKey});
  return (await import('./maintenance-repository')).maintenanceRepository().execute(actor,input);
}
