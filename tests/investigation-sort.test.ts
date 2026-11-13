import { describe, expect, it } from 'vitest';
import { isLocalIndicator, sortInvestigationResults, type InvestigationResult } from '../components/investigation/investigation-state';

describe('threat sorting and local indicator detection', () => {
  describe('isLocalIndicator', () => {
    it('identifies RFC 1918, loopback, and reserved Class E addresses as local', () => {
      expect(isLocalIndicator({ ip: '127.0.0.1' })).toBe(true);
      expect(isLocalIndicator({ ip: '10.20.100.117' })).toBe(true);
      expect(isLocalIndicator({ ip: '192.168.1.1' })).toBe(true);
      expect(isLocalIndicator({ ip: '172.16.5.10' })).toBe(true);
      expect(isLocalIndicator({ ip: '242.166.173.87' })).toBe(true); // Class E / reserved
    });

    it('identifies status private and source local_private as local', () => {
      expect(isLocalIndicator({ ip: '8.8.8.8', status: 'private' })).toBe(true);
      expect(isLocalIndicator({ ip: '1.1.1.1', source: 'local_private' })).toBe(true);
    });

    it('identifies globally routable public IPs as non-local', () => {
      expect(isLocalIndicator({ ip: '8.8.8.8' })).toBe(false);
      expect(isLocalIndicator({ ip: '1.1.1.1' })).toBe(false);
      expect(isLocalIndicator({ ip: '172.81.132.189' })).toBe(false);
      expect(isLocalIndicator({ ip: '130.49.215.84' })).toBe(false);
    });
  });

  describe('sortInvestigationResults', () => {
    it('orders from most malicious down to benign, with local indicators at the very bottom', () => {
      const rows: InvestigationResult[] = [
        { ip: '192.168.1.1', verdict: 'Unknown', compositeScore: 0, found: false },
        { ip: '1.1.1.1', verdict: 'Low risk', compositeScore: 10, abuseScore: 10, found: true },
        { ip: '172.81.132.189', verdict: 'Malicious', compositeScore: 100, abuseScore: 100, found: true },
        { ip: '242.166.173.87', status: 'private', source: 'local_private', verdict: 'Unknown', compositeScore: 0 },
        { ip: '130.49.215.84', verdict: 'Suspicious', compositeScore: 55, abuseScore: 55, found: true },
        { ip: '8.8.8.8', verdict: 'Malicious', compositeScore: 82, abuseScore: 82, found: true },
        { ip: '9.9.9.9', verdict: 'Unknown', compositeScore: 0, abuseScore: 0, found: true },
      ];

      const sorted = sortInvestigationResults(rows);

      // Verify exact order:
      // 1. 172.81.132.189 (Malicious, 100)
      // 2. 8.8.8.8 (Malicious, 82)
      // 3. 130.49.215.84 (Suspicious, 55)
      // 4. 1.1.1.1 (Low risk / Benign, 10)
      // 5. 9.9.9.9 (Unknown, 0)
      // 6. 192.168.1.1 (Local)
      // 7. 242.166.173.87 (Local)
      expect(sorted.map((r: InvestigationResult) => r.ip)).toEqual([
        '172.81.132.189',
        '8.8.8.8',
        '130.49.215.84',
        '1.1.1.1',
        '9.9.9.9',
        '192.168.1.1',
        '242.166.173.87',
      ]);
    });

    it('uses alert count as secondary tie-breaker for identical verdict and score', () => {
      const rows: InvestigationResult[] = [
        { ip: '1.2.3.4', verdict: 'Malicious', compositeScore: 90, totalAlertCount: 5, found: true },
        { ip: '5.6.7.8', verdict: 'Malicious', compositeScore: 90, totalAlertCount: 42, found: true },
      ];

      const sorted = sortInvestigationResults(rows);
      expect(sorted[0].ip).toBe('5.6.7.8');
      expect(sorted[1].ip).toBe('1.2.3.4');
    });

    it('does not mutate the original results array', () => {
      const rows: InvestigationResult[] = [
        { ip: '10.0.0.1', verdict: 'Unknown', compositeScore: 0 },
        { ip: '8.8.8.8', verdict: 'Malicious', compositeScore: 99 },
      ];
      const clone = [...rows];
      sortInvestigationResults(rows);
      expect(rows).toEqual(clone);
    });
  });
});
