import { describe, it, expect } from 'vitest';
import { normalizeIp, isGlobalIp, isValidCIDR } from '../lib/ip-validator';
import { calculateVerdictScore } from '../lib/scoring';

describe('indicator egress boundary', () => {
  it('normalizes IPv6 and rejects ambiguous literals and malformed CIDR', () => {
    expect(normalizeIp(' 2001:4860:4860:0:0:0:0:8888 ')).toBe('2001:4860:4860::8888');
    for (const ip of ['::ffff:012.0.0.1', '::192.168.001.1', '012.0.0.1', '127.1', 'fe80::1%eth0', '1.2.3.4/24', 'no']) expect(() => normalizeIp(ip)).toThrow();
    for (const cidr of ['1.2.3.4/24x', '1.2.3.4/1.5', '::/']) expect(isValidCIDR(cidr)).toBe(false);
  });
  it('allows only global unicast for provider egress', () => {
    for (const ip of ['0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.1.1','172.16.0.1','192.168.1.1','192.0.0.1','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','240.0.0.1','::','::1','fc00::1','fe80::1','ff02::1','2001:db8::1','::ffff:10.0.0.1','::ffff:8.8.8.8','64:ff9b::a00:1','2002:a00:1::','2001::1']) expect(isGlobalIp(ip), ip).toBe(false);
    for (const ip of ['8.8.8.8','1.1.1.1','2001:4860:4860::8888']) expect(isGlobalIp(ip)).toBe(true);
  });
});

describe('truthful reputation-only scoring', () => {
  it('adds no synthetic volume or spread and preserves unknown versus known zero', () => {
    const zero = calculateVerdictScore({ abuseScore: 0, totalAlertCount: 0, distinctTargetsCount: 4 });
    expect(zero.components.localSignal.rawScore).toBe(0);
    expect(zero.components.localSignal.details.volumeScore).toBe(0);
    expect(zero.components.localSignal.details.targetSpreadScore).toBe(0);
    expect(zero.components.abuseipdb.rawScore).toBe(0);
    expect(calculateVerdictScore({}).components.abuseipdb.rawScore).toBeNull();
    expect(calculateVerdictScore({}).verdict).toBe('Unknown');
  });
  it('accepts an injected clock for deterministic recency', () => {
    const input = { totalAlertCount: 20, distinctTargetsCount: 2, lastSeen: '2026-01-01T00:00:00Z' };
    expect(calculateVerdictScore(input, new Date('2026-01-01T01:00:00Z')).components.localSignal.details.recencyMultiplier).toBe(1);
    expect(calculateVerdictScore(input, new Date('2026-03-01T01:00:00Z')).components.localSignal.details.recencyMultiplier).toBe(0.2);
  });
});
