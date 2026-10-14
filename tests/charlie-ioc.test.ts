import { describe, it, expect } from 'vitest';
import {
  classifyThreatScore,
  getFullCountryName,
  formatSingleIocRow,
  formatCharlieIocMarkdown,
  formatAlphaIocMarkdown,
  BulkIpItem,
} from '../lib/charlie-ioc-formatter';

describe('Charlie Reporter IoC Formatter', () => {
  describe('classifyThreatScore', () => {
    it('classifies >= 70 as Malicious / High Risk', () => {
      expect(classifyThreatScore(100)).toBe('Malicious / High Risk');
      expect(classifyThreatScore(70)).toBe('Malicious / High Risk');
      expect(classifyThreatScore('85%')).toBe('Malicious / High Risk');
    });

    it('classifies 20-69 as Suspicious / Moderate Risk', () => {
      expect(classifyThreatScore(20)).toBe('Suspicious / Moderate Risk');
      expect(classifyThreatScore(55)).toBe('Suspicious / Moderate Risk');
      expect(classifyThreatScore(69)).toBe('Suspicious / Moderate Risk');
    });

    it('classifies 0 as Clean / 0% Abuse Confidence', () => {
      expect(classifyThreatScore(0)).toBe('Clean / 0% Abuse Confidence');
      expect(classifyThreatScore('0')).toBe('Clean / 0% Abuse Confidence');
    });

    it('classifies 1-19 as Low Reported Abuse Score', () => {
      expect(classifyThreatScore(5)).toBe('Low Reported Abuse Score');
      expect(classifyThreatScore(19)).toBe('Low Reported Abuse Score');
    });

    it('handles null, undefined, and un-enriched values', () => {
      expect(classifyThreatScore(null)).toBe('Not Enriched');
      expect(classifyThreatScore(undefined)).toBe('Not Enriched');
      expect(classifyThreatScore('')).toBe('Not Enriched');
    });
  });

  describe('getFullCountryName', () => {
    it('resolves 2-letter ISO codes to full country names', () => {
      expect(getFullCountryName('DE')).toBe('Germany');
      expect(getFullCountryName('ID')).toBe('Indonesia');
      expect(getFullCountryName('US')).toBe('United States');
      expect(getFullCountryName('SG')).toBe('Singapore');
      expect(getFullCountryName('NL')).toBe('Netherlands');
    });

    it('resolves 3-letter codes via fallback map', () => {
      expect(getFullCountryName('IDN')).toBe('Indonesia');
      expect(getFullCountryName('DEU')).toBe('Germany');
    });

    it('handles unknown or empty codes safely', () => {
      expect(getFullCountryName(null)).toBe('Unknown');
      expect(getFullCountryName('')).toBe('Unknown');
      expect(getFullCountryName('XX')).toBe('Unknown');
      expect(getFullCountryName('N/A')).toBe('Unknown');
    });
  });

  describe('formatSingleIocRow', () => {
    it('formats RFC1918 private IPs as Local Network', () => {
      const privateItem: BulkIpItem = {
        ip: '192.168.1.159',
        found: false,
      };
      const row = formatSingleIocRow(privateItem);
      expect(row).toBe(
        '| IP | 192.168.1.159 | Local Network | Private IP RFC1918 [Internal Network Context] |'
      );
    });

    it('formats un-enriched external IPs', () => {
      const unenrichedItem: BulkIpItem = {
        ip: '198.51.100.23',
        found: false,
      };
      const row = formatSingleIocRow(unenrichedItem);
      expect(row).toBe(
        '| IP | 198.51.100.23 | External Network | External Source IP [Reputation Not Enriched] |'
      );
    });

    it('formats enriched AbuseIPDB IP with country, ASN, score, and alert details', () => {
      const item: BulkIpItem = {
        ip: '185.220.101.5',
        found: true,
        countryCode: 'DE',
        asn: 'AS208294 Tor Network',
        reputationSource: 'abuseipdb',
        abuseScore: 100,
        totalAlertCount: 89,
        topAttackType: 'sql_injection',
      };
      const row = formatSingleIocRow(item);
      expect(row).toBe(
        '| IP | 185.220.101.5 | Germany (AS208294 Tor Network) | Threat Intel AbuseIPDB Score: 100% [Malicious / High Risk] (sql_injection) |'
      );
    });

    it('formats clean enriched IP without any request count suffix', () => {
      const cleanItem: BulkIpItem = {
        ip: '1.1.1.1',
        found: true,
        countryCode: 'AU',
        asn: 'Cloudflare',
        reputationSource: 'abuseipdb',
        abuseScore: 0,
        totalAlertCount: 1,
      };
      const row = formatSingleIocRow(cleanItem);
      expect(row).toBe(
        '| IP | 1.1.1.1 | Australia (Cloudflare) | Threat Intel AbuseIPDB Score: 0% [Clean / 0% Abuse Confidence] |'
      );
      expect(row).not.toContain('requests');
    });

    it('formats enriched VirusTotal IP when vt is the source', () => {
      const item: BulkIpItem = {
        ip: '194.26.29.112',
        found: true,
        countryCode: 'NL',
        asn: 'AS50673 Serverius',
        reputationSource: 'virustotal',
        vtMalicious: 6,
        totalAlertCount: 12,
        topAttackType: 'path_traversal',
      };
      const row = formatSingleIocRow(item);
      expect(row).toBe(
        '| IP | 194.26.29.112 | Netherlands (AS50673 Serverius) | Threat Intel VirusTotal Score: 100% [Malicious / High Risk] (path_traversal) |'
      );
    });
  });

  describe('formatCharlieIocMarkdown', () => {
    const sampleItems: BulkIpItem[] = [
      {
        ip: '192.168.1.1',
        found: false,
      },
      {
        ip: '45.154.255.89',
        found: true,
        countryCode: 'RU',
        asn: 'AS57523 Hostkey',
        reputationSource: 'abuseipdb',
        abuseScore: 85,
        totalAlertCount: 34,
        topAttackType: 'sql_injection',
      },
      {
        ip: '185.220.101.5',
        found: true,
        countryCode: 'DE',
        asn: 'AS208294 Tor Network',
        reputationSource: 'abuseipdb',
        abuseScore: 100,
        totalAlertCount: 89,
        topAttackType: 'sql_injection',
      },
    ];

    it('generates complete Charlie Reporter IoC table with sorting and footer', () => {
      const md = formatCharlieIocMarkdown(sampleItems);

      // Section title check
      expect(md).toContain('**2. INDICATOR OF COMPROMISE**');

      // Table header check
      expect(md).toContain('| Tipe IoC | Nilai | Negara (ASN) | Keterangan |');
      expect(md).toContain('| ----- | ----- | ----- | ----- |');

      // Sorting check: 185.220.101.5 (100%) must come before 45.154.255.89 (85%)
      const idx100 = md.indexOf('185.220.101.5');
      const idx85 = md.indexOf('45.154.255.89');
      const idxPriv = md.indexOf('192.168.1.1');
      expect(idx100).toBeGreaterThan(-1);
      expect(idx85).toBeGreaterThan(-1);
      expect(idxPriv).toBeGreaterThan(-1);
      expect(idx100).toBeLessThan(idx85);
      // Private IP must be at the very bottom
      expect(idx85).toBeLessThan(idxPriv);

      // Hash row check
      expect(md).toContain('| Hash | Tidak ditemukan indicator terkait | N/A | N/A |');

      // Footnote check
      expect(md).toContain('Catatan: Validasi reputasi dan geolokasi IP diverifikasi melalui AbuseIPDB, VirusTotal, dan ip-api.com.');
    });

    it('respects options to exclude header, hash, or footnote for table-only copying', () => {
      const tableOnly = formatCharlieIocMarkdown(sampleItems, {
        includeSectionHeader: false,
        includeHashRow: false,
        includeFootnote: false,
      });

      expect(tableOnly).not.toContain('**2. INDICATOR OF COMPROMISE**');
      expect(tableOnly).not.toContain('| Hash |');
      expect(tableOnly).not.toContain('Catatan:');
      expect(tableOnly.startsWith('| Tipe IoC | Nilai | Negara (ASN) | Keterangan |')).toBe(true);
    });

    it('handles empty results list gracefully', () => {
      const emptyMd = formatCharlieIocMarkdown([]);
      expect(emptyMd).toContain('| IP | Tidak ditemukan indicator terkait | N/A | N/A |');
      expect(emptyMd).toContain('| Hash | Tidak ditemukan indicator terkait | N/A | N/A |');
    });

    it('formats Alpha Reporter IoC variant with Alpha footnote', () => {
      const alphaMd = formatAlphaIocMarkdown(sampleItems);
      expect(alphaMd).toContain('**2. INDICATOR OF COMPROMISE**');
      expect(alphaMd).toContain('Catatan: IP sumber dicatat dari telemetri host internal/sistem; reputasi dan atribut jaringan diverifikasi melalui threat intelligence bila tersedia.');
      expect(alphaMd).toContain('| IP | 185.220.101.5 |');
    });
  });
});
