import { describe, it, expect } from 'vitest';
import { upsertIpIntelReputation, getIpIntel } from '../lib/db';
import { isValidIP, isPrivateIp, defang } from '../lib/ip-validator';
import { calculateVerdictScore } from '../lib/scoring';
import { formatAlphaIocMarkdown, BulkIpItem, classifyThreatScore } from '../lib/charlie-ioc-formatter';

describe('Live AbuseIPDB Enrichment Engine', () => {
  it('validates public vs private IPs correctly', () => {
    expect(isValidIP('195.201.245.94')).toBe(true);
    expect(isValidIP('98.86.120.236')).toBe(true);
    expect(isValidIP('invalid-ip')).toBe(false);

    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.5.10')).toBe(true);
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('195.201.245.94')).toBe(false);
  });

  it('calculates threat verdicts and classifications accurately', () => {
    // Abuse score classification
    expect(classifyThreatScore(100)).toBe('Malicious / High Risk');
    expect(classifyThreatScore(4)).toBe('Low Reported Abuse Score');
    expect(classifyThreatScore(0)).toBe('0% Reported Abuse Confidence (not a safety verdict)');

    // High telemetry malicious verdict
    const mal = calculateVerdictScore({
      abuseScore: 100,
      totalAlertCount: 25,
      hasCriticalOutcome: true,
      lastSeen: new Date(),
    });
    expect(mal.verdict).toBe('Malicious');
    expect(mal.verdictColor).toBe('red');
    expect(mal.compositeScore).toBeGreaterThanOrEqual(75);

    // 0% Clean
    const clean = calculateVerdictScore({ abuseScore: 0 });
    expect(clean.verdict).toBe('Unknown');
    expect(clean.components.localSignal.rawScore).toBe(0);
  });

  it('upserts reputation to cache in mock mode', async () => {
    const testIp = '198.51.100.99';
    await upsertIpIntelReputation({
      ip: testIp,
      abuseScore: 85,
      countryCode: 'US',
      isp: 'Test Hosting Provider',
      domain: 'testhost.net',
      totalReports: 12,
      numDistinctUsers: 5,
      lastReportedAt: new Date().toISOString(),
      reputationJson: { abuseConfidenceScore: 85, totalReports: 12 },
      geoJson: { country: 'United States', countryCode: 'US' },
    });

    const cached = await getIpIntel(testIp);
    expect(cached).not.toBeNull();
    expect(cached?.ip).toBe(testIp);
    expect(cached?.abuse_score).toBe(85);
    expect(cached?.reputation_source).toBe('abuseipdb');
    expect(cached?.country_code).toBe('US');
  });

  it('generates compliant Alpha Reporter IoC markdown for enriched indicators', () => {
    const items: BulkIpItem[] = [
      {
        ip: '195.201.245.94',
        found: true,
        verdict: 'Malicious',
        compositeScore: 100,
        abuseScore: 100,
        countryCode: 'DE',
        countryName: 'Germany',
        isp: 'Hetzner Online GmbH',
        asn: 'Hetzner Online GmbH',
        totalAlertCount: 1,
        reputationSource: 'abuseipdb',
      },
      {
        ip: '98.86.120.236',
        found: true,
        verdict: 'Low risk',
        compositeScore: 4,
        abuseScore: 4,
        countryCode: 'US',
        countryName: 'United States',
        isp: 'Amazon Data Services',
        asn: 'Amazon Data Services',
        totalAlertCount: 1,
        reputationSource: 'abuseipdb',
      },
    ];

    const markdown = formatAlphaIocMarkdown(items, {
      includeSectionHeader: true,
      includeHashRow: true,
      includeFootnote: true,
    });

    expect(markdown).toContain('**2. INDICATOR OF COMPROMISE**');
    expect(markdown).toContain('| Tipe IoC | Nilai | Negara (ASN) | Keterangan |');
    expect(markdown).toContain('| IP | 195.201.245.94 | Germany (Hetzner Online GmbH) |');
    expect(markdown).toContain('| IP | 98.86.120.236 | United States (Amazon Data Services) |');
    expect(markdown).toContain('Malicious / High Risk');
    expect(markdown).toContain('Low Reported Abuse Score');
    expect(markdown).toContain('| Hash | Tidak ditemukan indicator terkait | N/A | N/A |');
  });

  it('defangs IPs correctly with dot brackets', () => {
    expect(defang('195.201.245.94')).toBe('195.201.245[.]94');
    expect(defang('8.8.8.8')).toBe('8.8.8[.]8');
    expect(defang('https://example.com')).toBe('hxxps://example[.]com');
  });
});
