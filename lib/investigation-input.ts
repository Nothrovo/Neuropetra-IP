import { isValidIP, normalizeIp } from './ip-validator';

export function parseIndicatorInput(text: string): { valid: string[]; invalid: string[]; duplicateCount: number } {
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicateCount = 0;
  const seen = new Set<string>();
  const tokens = text.replace(/^\uFEFF/, '').match(/"(?:[^"]|"")*"|[^\s,;]+/g) ?? [];
  if (tokens.length && /^(?:ip|ips|ip_address|ip address)$/i.test(tokens[0]!.replace(/^"|"$/g, ''))) tokens.shift();
  for (const token of tokens) {
    const value = token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1).replace(/""/g, '"').trim() : token.trim();
    if (!value) continue;
    if (!isValidIP(value)) { invalid.push(value); continue; }
    const ip = normalizeIp(value);
    if (seen.has(ip)) { duplicateCount++; continue; }
    seen.add(ip);
    valid.push(ip);
  }
  return { valid, invalid, duplicateCount };
}
