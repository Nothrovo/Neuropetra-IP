/** Canonical exact-IP parsing and conservative provider-egress policy. */
import ipaddr from 'ipaddr.js';

export function normalizeIp(input: string): string {
  if (typeof input !== 'string') throw new Error('Expected an IP string');
  const clean = input.trim();
  if (!clean || clean.includes('%') || clean.includes('/') || !ipaddr.isValid(clean)) throw new Error('Invalid exact IP address');
  const dotted = clean.includes('.') ? clean.slice(clean.lastIndexOf(':') + 1) : clean;
  if ((!clean.includes(':') || clean.includes('.')) && (!/^\d+\.\d+\.\d+\.\d+$/.test(dotted) || dotted.split('.').some(p => String(Number(p)) !== p))) throw new Error('Invalid IPv4 literal');
  return ipaddr.parse(clean).toString();
}
export function isValidIPv4(ip: string): boolean { try { return ipaddr.parse(normalizeIp(ip)).kind() === 'ipv4'; } catch { return false; } }
export function isValidIPv6(ip: string): boolean { try { return ipaddr.parse(normalizeIp(ip)).kind() === 'ipv6'; } catch { return false; } }
export function isValidIP(ip: string): boolean { try { normalizeIp(ip); return true; } catch { return false; } }
export function isValidCIDR(cidr: string): boolean {
  if (typeof cidr !== 'string') return false;
  const parts = cidr.trim().split('/');
  if (parts.length !== 2 || !/^(0|[1-9]\d*)$/.test(parts[1]) || !isValidIP(parts[0])) return false;
  return Number(parts[1]) <= (isValidIPv4(parts[0]) ? 32 : 128);
}
export function validateIpOrCidr(input: string): {valid: boolean; type: 'ipv4'|'ipv6'|'cidr'|'invalid'; cleanValue: string} {
  const clean = typeof input === 'string' ? input.trim() : '';
  if (isValidCIDR(clean)) return {valid:true,type:'cidr',cleanValue:clean};
  if (isValidIP(clean)) return {valid:true,type:isValidIPv4(clean)?'ipv4':'ipv6',cleanValue:normalizeIp(clean)};
  return {valid:false,type:'invalid',cleanValue:clean};
}
export function isGlobalIp(ip: string): boolean {
  try {
    const parsed = ipaddr.parse(normalizeIp(ip));
    if (parsed.range() !== 'unicast') return false;
    if (parsed.kind() === 'ipv6') {
      const v6 = parsed as ipaddr.IPv6;
      if (!v6.match(ipaddr.IPv6.parse('2000::'), 3)) return false;
      for (const cidr of ['2001::/23','2001:db8::/32','2002::/16','3fff::/20']) {
        const [network,bits] = ipaddr.parseCIDR(cidr);
        if (v6.match(network as ipaddr.IPv6,bits)) return false;
      }
    }
    return true;
  } catch { return false; }
}
/** Legacy name means non-global, never safe/whitelisted. */
export function isPrivateIp(ip: string): boolean { return !isGlobalIp(ip); }
export function defang(target: string): string {
  if (!target) return '';
  const result = target.trim().replace(/https:\/\//gi, 'hxxps://').replace(/http:\/\//gi, 'hxxp://');
  if (isValidIPv4(result)) { const p = result.split('.'); return `${p[0]}.${p[1]}.${p[2]}[.]${p[3]}`; }
  return result.replace(/\./g, '[.]');
}
export function getSubnet24(ip: string): string | null {
  if (!isValidIPv4(ip)) return null;
  return `${ip.trim().split('.').slice(0,3).join('.')}.0/24`;
}
