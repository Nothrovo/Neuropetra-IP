import { describe, it, expect } from 'vitest';
import { calculateVerdictScore, isCriticalOutcome } from '../lib/scoring';

describe('Threat Verdict Scoring Engine', () => {
  it('should correctly classify high abuse and high VT as Malicious', () => {
    const result = calculateVerdictScore({
      abuseScore: 100,
      vtMalicious: 12,
      totalAlertCount: 15,
      distinctTargetsCount: 3,
      lastSeen: new Date().toISOString(),
    });

    expect(result.compositeScore).toBeGreaterThanOrEqual(75);
    expect(result.verdict).toBe('Malicious');
    expect(result.verdictColor).toBe('red');
    expect(result.components.abuseipdb.rawScore).toBe(100);
    expect(result.components.virustotal.rawScore).toBe(100);
  });

  it('should automatically re-normalize weights when VirusTotal is missing', () => {
    const result = calculateVerdictScore({
      abuseScore: 80,
      vtMalicious: null,
      totalAlertCount: 5,
      distinctTargetsCount: 2,
      lastSeen: new Date().toISOString(),
    });

    // Weight of VT should be 0, AbuseIPDB and Local Signal should sum to 1
    expect(result.components.virustotal.weight).toBe(0);
    expect(result.components.abuseipdb.weight).toBeGreaterThan(0.5);
    expect(result.components.abuseipdb.weight + result.components.localSignal.weight).toBeCloseTo(1.0, 1);
  });

  it('should grant Malicious verdict immediately if a critical outcome is present', () => {
    const result = calculateVerdictScore({
      abuseScore: 10,
      vtMalicious: 0,
      totalAlertCount: 2,
      distinctTargetsCount: 1,
      hasCriticalOutcome: true,
    });

    expect(result.verdict).toBe('Malicious');
    expect(result.verdictColor).toBe('red');
    expect(result.components.localSignal.details.criticalOutcomeBonus).toBe(35);
  });

  it('should classify clean, low alert counts as Low risk or Unknown', () => {
    const result = calculateVerdictScore({
      abuseScore: 0,
      vtMalicious: 0,
      totalAlertCount: 1,
      distinctTargetsCount: 1,
      lastSeen: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
    });

    expect(result.compositeScore).toBeLessThan(40);
    expect(['Low risk', 'Unknown']).toContain(result.verdict);
  });

  it('identifies critical outcome strings correctly', () => {
    expect(isCriticalOutcome('success')).toBe(true);
    expect(isCriticalOutcome('Compromised')).toBe(true);
    expect(isCriticalOutcome('allowed')).toBe(true);
    expect(isCriticalOutcome('blocked')).toBe(false);
    expect(isCriticalOutcome(null)).toBe(false);
  });
});
