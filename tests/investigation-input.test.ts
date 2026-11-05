import { describe, expect, it } from 'vitest';
import { parseIndicatorInput } from '../lib/investigation-input';

describe('shared investigation input', () => {
  it('uses the same normalization and accounting for a single IP or pasted batch', () => {
    expect(parseIndicatorInput(' 8.8.8.8 ')).toEqual({ valid: ['8.8.8.8'], invalid: [], duplicateCount: 0 });
    expect(parseIndicatorInput('8.8.8.8, 1.1.1.1\n8.8.8.8;not-an-ip 10.0.0.0/8')).toEqual({
      valid: ['8.8.8.8', '1.1.1.1'], invalid: ['not-an-ip', '10.0.0.0/8'], duplicateCount: 1,
    });
  });

  it('accounts for CSV headers, quoted cells, IPv6 equivalents and invalid columns', () => {
    expect(parseIndicatorInput('ip\n"2001:4860:4860:0:0:0:0:8888"\n2001:4860:4860::8888\n"8.8.8.8",notes')).toEqual({
      valid: ['2001:4860:4860::8888', '8.8.8.8'], invalid: ['notes'], duplicateCount: 1,
    });
  });

  it('does not repair malformed quotes or accept CIDR / scoped IPv6 as exact indicators', () => {
    expect(parseIndicatorInput('"8.8.8.8 1.1.1.1" 10.0.0.0/8 fe80::1%eth0').valid).toEqual([]);
    expect(parseIndicatorInput('"8.8.8.8').valid).toEqual([]);
  });

  it('retains all oversized input instead of silently truncating it', () => {
    const ips = Array.from({ length: 201 }, (_, i) => `8.8.0.${i}`);
    expect(parseIndicatorInput(ips.join('\n')).valid).toEqual(ips);
  });
});
