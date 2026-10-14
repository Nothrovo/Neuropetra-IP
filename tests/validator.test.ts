import { describe, it, expect } from 'vitest';
import {
  isValidIPv4,
  isValidIPv6,
  isValidCIDR,
  validateIpOrCidr,
  defang,
  getSubnet24,
} from '../lib/ip-validator';

describe('IP and CIDR Validator & Defanger', () => {
  it('validates standard IPv4 addresses', () => {
    expect(isValidIPv4('192.168.1.1')).toBe(true);
    expect(isValidIPv4('8.8.8.8')).toBe(true);
    expect(isValidIPv4('256.0.0.1')).toBe(false);
    expect(isValidIPv4('1.2.3')).toBe(false);
    expect(isValidIPv4('abc.def.ghi.jkl')).toBe(false);
  });

  it('validates standard IPv6 addresses', () => {
    expect(isValidIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    expect(isValidIPv6('::1')).toBe(true);
    expect(isValidIPv6('not-an-ipv6')).toBe(false);
  });

  it('validates CIDR notation', () => {
    expect(isValidCIDR('192.168.1.0/24')).toBe(true);
    expect(isValidCIDR('10.0.0.0/8')).toBe(true);
    expect(isValidCIDR('192.168.1.0/33')).toBe(false);
    expect(isValidCIDR('2001:db8::/32')).toBe(true);
  });

  it('categorizes input correctly via validateIpOrCidr', () => {
    expect(validateIpOrCidr('10.10.10.1')).toEqual({
      valid: true,
      type: 'ipv4',
      cleanValue: '10.10.10.1',
    });
    expect(validateIpOrCidr('10.0.0.0/16')).toEqual({
      valid: true,
      type: 'cidr',
      cleanValue: '10.0.0.0/16',
    });
    expect(validateIpOrCidr('malicious-payload')).toEqual({
      valid: false,
      type: 'invalid',
      cleanValue: 'malicious-payload',
    });
  });

  it('defangs IPs and URLs safely for analyst copying', () => {
    expect(defang('198.51.100.23')).toBe('198.51.100[.]23');
    expect(defang('http://evil.com/shell.sh')).toBe('hxxp://evil[.]com/shell[.]sh');
    expect(defang('https://evil.com/test')).toBe('hxxps://evil[.]com/test');
  });

  it('extracts /24 subnet prefix properly', () => {
    expect(getSubnet24('198.51.100.23')).toBe('198.51.100.0/24');
    expect(getSubnet24('invalid')).toBe(null);
  });
});
