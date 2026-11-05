import { normalizeIp } from './ip-validator';
import type { TelemetryScope } from './telemetry-aggregates';

export class ApiInputError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function apiError(error: unknown): Response {
  return Response.json({error:error instanceof ApiInputError ? error.message : 'Request failed'}, {status:error instanceof ApiInputError ? error.status : 500});
}
export async function readJsonBody(request: Request, maxBytes = 65536): Promise<Record<string, unknown>> {
  const size = request.headers.get('content-length');
  if (size && Number(size) > maxBytes) throw new ApiInputError('Payload too large',413);
  const reader = request.body?.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new ApiInputError('Payload too large',413); }
      chunks.push(value);
    }
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string,unknown>;
  } catch { throw new ApiInputError('Invalid JSON object'); }
}
export function parseIpBatch(body: Record<string,unknown>, max: number): string[] {
  const raw = Array.isArray(body.ips) ? body.ips : typeof body.ip === 'string' ? [body.ip] : typeof body.text === 'string' ? body.text.split(/[\s,;]+/).filter(Boolean) : null;
  if (!raw || !raw.length) throw new ApiInputError('Provide one or more exact IP addresses');
  if (raw.length > max) throw new ApiInputError(`Batch limit is ${max} indicators`);
  try { return [...new Set(raw.map((value: unknown) => { if (typeof value !== 'string') throw new Error(); return normalizeIp(value); }))]; }
  catch { throw new ApiInputError('Every indicator must be a valid exact IP string (CIDR is unsupported)'); }
}
export function exactIp(value: string): string { try { return normalizeIp(value); } catch { throw new ApiInputError('Invalid exact IP address'); } }
export function integerParam(params: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(raw)) throw new ApiInputError(`Invalid ${key}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ApiInputError(`${key} must be between ${min} and ${max}`);
  return value;
}
function utcTimestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) throw new ApiInputError('Use UTC ISO timestamps');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,19) !== value.slice(0,19)) throw new ApiInputError('Invalid timestamp');
  return date.toISOString();
}
export function parseTelemetryScope(params: URLSearchParams, now = new Date()): TelemetryScope {
  if ((params.has('from') || params.has('to')) && params.has('days')) throw new ApiInputError('Use days or from/to, not both');
  let from: string, to: string;
  if (params.has('from') || params.has('to')) {
    if (!params.get('from') || !params.get('to')) throw new ApiInputError('Both from and to are required');
    from = utcTimestamp(params.get('from')!); to = utcTimestamp(params.get('to')!);
  } else {
    const days = integerParam(params,'days',30,1,3660);
    to = now.toISOString(); from = new Date(now.getTime()-days*86400000).toISOString();
  }
  if (from >= to) throw new ApiInputError('from must precede to');
  const scope: TelemetryScope = {from,to};
  for (const [key,field] of [['alert_type','alertType'],['outcome','outcome'],['target_host','targetHost']] as const) {
    const value = params.get(key);
    if (value !== null) { if (!value || value.length>256 || /[\r\n\0]/.test(value)) throw new ApiInputError(`Invalid ${key}`); scope[field]=value; }
  }
  return scope;
}
