/**
 * IP and CIDR validation and defang utilities.
 */

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const IPV6_REGEX =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

export function isValidIPv4(ip: string): boolean {
  return IPV4_REGEX.test(ip.trim());
}

export function isValidIPv6(ip: string): boolean {
  return IPV6_REGEX.test(ip.trim());
}

export function isValidIP(ip: string): boolean {
  const clean = ip.trim();
  return isValidIPv4(clean) || isValidIPv6(clean);
}

export function isValidCIDR(cidr: string): boolean {
  const parts = cidr.trim().split('/');
  if (parts.length !== 2) return false;
  const [ip, prefixStr] = parts;
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix)) return false;

  if (isValidIPv4(ip)) {
    return prefix >= 0 && prefix <= 32;
  }
  if (isValidIPv6(ip)) {
    return prefix >= 0 && prefix <= 128;
  }
  return false;
}

export function validateIpOrCidr(input: string): {
  valid: boolean;
  type: 'ipv4' | 'ipv6' | 'cidr' | 'invalid';
  cleanValue: string;
} {
  const clean = input.trim();
  if (clean.includes('/')) {
    if (isValidCIDR(clean)) return { valid: true, type: 'cidr', cleanValue: clean };
  } else if (isValidIPv4(clean)) {
    return { valid: true, type: 'ipv4', cleanValue: clean };
  } else if (isValidIPv6(clean)) {
    return { valid: true, type: 'ipv6', cleanValue: clean };
  }
  return { valid: false, type: 'invalid', cleanValue: clean };
}

/**
 * Safely defangs an IP address, domain, or URL to prevent accidental clicks or execution.
 * Example: 198.51.100.23 -> 198.51.100[.]23, https:// -> hxxps://
 */
export function defang(target: string): string {
  if (!target) return '';
  let result = target.trim();
  // Defang URL protocols
  result = result.replace(/https:\/\//gi, 'hxxps://').replace(/http:\/\//gi, 'hxxp://');
  // Defang IPv4
  if (isValidIPv4(result)) {
    const parts = result.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}[.]${parts[3]}`;
  }
  // Generic dot defanging for domains
  return result.replace(/\./g, '[.]');
}

/**
 * Returns the /24 subnet prefix for an IPv4 address.
 * Example: 198.51.100.23 -> 198.51.100.0/24
 */
export function getSubnet24(ip: string): string | null {
  if (!isValidIPv4(ip)) return null;
  const parts = ip.trim().split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

/**
 * Detects private, loopback, link-local, or unroutable IP addresses (RFC1918 / RFC3927 / RFC4291).
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.trim();
  return /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|0\.0\.0\.0|localhost|::1|fe80:)/i.test(clean);
}

