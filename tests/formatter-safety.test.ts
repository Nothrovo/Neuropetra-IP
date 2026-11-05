import { describe, expect, it } from 'vitest';
import { formatSingleIocRow } from '../lib/charlie-ioc-formatter';

describe('IoC export safety', () => {
  it('escapes user-controlled markdown cells and prevents extra rows', () => {
    const row = formatSingleIocRow({ ip: '8.8.8.8', countryName: '<img src=x>|Injected\nrow', asn: '[click](https://bad.invalid)', topAttackType: '*bold*|\r\nnext', abuseScore: 10 });
    expect(row.split('\n')).toHaveLength(1);
    expect(row).not.toContain('<img');
    expect(row).toContain('&#124;');
    expect(row).toContain('&#91;click&#93;');
    expect(row).not.toContain('*bold*');
  });
  it.each(['127.0.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fe80::1'])('does not describe %s as RFC1918', ip => {
    expect(formatSingleIocRow({ ip })).toContain('Non-global IP');
    expect(formatSingleIocRow({ ip })).not.toContain('RFC1918');
  });
  it('identifies private IPv6 ULA without calling it RFC1918', () => {
    expect(formatSingleIocRow({ ip: 'fd00::1' })).toContain('Private IPv6 ULA');
  });
});
