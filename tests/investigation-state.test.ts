import { describe, expect, it } from 'vitest';
import { externalDisabledReason, initialInvestigationState, updateInvestigationInput, switchInvestigationMode, legacyInvestigationUrl, queryIndicatorInput, exportInvestigationResults } from '../components/investigation/investigation-state';

const session = { user: { userId: 'a', username: 'Ada', role: 'analyst' }, permissions: ['read', 'enrich', 'export'], capabilities: { externalEnrichment: true, maintenance: false } };

describe('workbench state and permissions', () => {
  it('defaults to local, retains input and selections on mode switch without invoking fetch', () => {
    const state = { ...initialInvestigationState('8.8.8.8'), selected: ['8.8.8.8'] };
    expect(state.mode).toBe('local');
    expect(switchInvestigationMode(state, 'external')).toEqual({ ...state, mode: 'external' });
    expect(updateInvestigationInput(state, '1.1.1.1')).toMatchObject({ input: '1.1.1.1', selected: [] });
  });
  it('fails closed for missing session, denied permission or missing runtime provider configuration', () => {
    expect(externalDisabledReason(null)).toBeTruthy();
    expect(externalDisabledReason({ ...session, permissions: ['read'] })).toContain('permission');
    expect(externalDisabledReason({ ...session, capabilities: { ...session.capabilities, externalEnrichment: false } })).toContain('configured');
    expect(externalDisabledReason(session)).toBeNull();
  });
  it('preserves only supported IP input in legacy redirects, never secrets or arbitrary query values', () => {
    const query = { ip: '8.8.8.8', ips: ['1.1.1.1', '2001:4860:4860::8888'], apiKey: 'secret', key: 'secret', returnTo: 'https://example.invalid' };
    const url = new URL(legacyInvestigationUrl('external', query), 'http://fixture.invalid');
    expect(url.pathname).toBe('/investigate');
    expect(url.searchParams.get('mode')).toBe('external');
    expect(queryIndicatorInput(Object.fromEntries(url.searchParams))).toBe('8.8.8.8\n1.1.1.1\n2001:4860:4860::8888');
    expect(url.toString()).not.toContain('secret');
    expect(legacyInvestigationUrl('local', {})).toBe('/investigate?mode=local');
  });
  it('uses safe CSV cells and existing Alpha/Charlie formatters without claiming unrelated live providers', () => {
    const rows = [{ ip: '8.8.8.8', found: true, abuseScore: 0, totalAlertCount: 0, isp: '=FORMULA,"x"' }];
    const csv = exportInvestigationResults(rows, 'csv');
    expect(csv).toContain('"\'=FORMULA,""x"""');
    expect(exportInvestigationResults(rows, 'alpha')).toContain('INDICATOR OF COMPROMISE');
    const charlie = exportInvestigationResults(rows, 'charlie');
    expect(charlie).toContain('8.8.8.8');
    expect(charlie).not.toContain('ip-api.com');
  });
  it('preserves backend-shaped local evidence and stale VT reputation in every export', () => {
    const rows = [
      { ip: '8.8.8.8', found: true, abuseScore: null, vtMalicious: null, reputationSource: null, totalAlertCount: 12, topAttackType: 'sql_injection', attack_types: ['sql_injection', 'xss'], evidence: { rule: 'fixture|<script>\nalert' }, lastSeen: '2026-11-04T12:00:00Z', reputationCheckedAt: null, reputationFresh: false },
      { ip: '1.1.1.1', found: true, abuseScore: null, vtMalicious: 7, reputationSource: 'virustotal', reputationCheckedAt: '2026-01-01T00:00:00Z', reputationFresh: false },
    ];
    for (const format of ['csv', 'alpha', 'charlie'] as const) {
      const output = exportInvestigationResults(rows, format);
      for (const value of ['sql_injection', 'xss', '2026-11-04T12:00:00Z', 'virustotal', '2026-01-01T00:00:00Z', '7', 'false', 'fixture']) expect(output).toContain(value);
      if (format === 'csv') {
        for (const column of ['vtMalicious', 'attack_types', 'evidence', 'reputationCheckedAt', 'reputationFresh']) expect(output.split('\r\n')[0]).toContain(column);
      } else {
        expect(output).toContain('(sql_injection)');
        expect(output).toContain('Stale cache');
        expect(output).toContain('Local evidence');
        expect(output).not.toContain('<script>');
        expect(output).not.toContain('fixture|');
      }
    }
  });
  it('keeps local attack context even when a provider warning is supplied', () => {
    for (const format of ['alpha', 'charlie'] as const) {
      const output = exportInvestigationResults([{ ip: '8.8.8.8', found: true, abuseScore: null, topAttackType: 'sql_injection', totalAlertCount: 12, error: 'Provider unavailable; local telemetry remains available' }], format);
      expect(output).toContain('(sql_injection)');
      expect(output).toContain('Reputation Unknown');
      expect(output).toContain('Local evidence');
      expect(output).not.toContain('0%');
    }
  });
  it('retains retrieved reputation when only persistence failed', () => {
    const row = { ip: '8.8.8.8', status: 'enriched', source: 'abuseipdb_live', reputationSource: 'abuseipdb', abuseScore: 98, savedToDb: false, checkedAt: '2026-11-04T12:00:00Z', error: 'Provider result retrieved but reputation persistence failed' };
    for (const format of ['alpha', 'charlie'] as const) {
      const output = exportInvestigationResults([row], format);
      expect(output).toContain('Score: 98%');
      expect(output).not.toContain('Not Enriched');
      expect(output).toContain('Persistence warning');
      expect(output).toContain('persistence failed');
    }
  });
  it('does not convert unknown reputation or failed enrichment into a known clean score on IoC export', () => {
    const markdown = exportInvestigationResults([{ ip: '8.8.8.8', status: 'error', error: 'Quota', abuseScore: null, compositeScore: 0 }], 'alpha');
    expect(markdown).not.toContain('0%');
    expect(markdown).not.toContain('Clean');
  });
  it('exports valid TSV for spreadsheets and clean IoC report markdown for reports', () => {
    const rows = [
      { ip: '195.178.110.159', found: true, abuseScore: 100, compositeScore: 100, verdict: 'Malicious' as const, countryCode: 'ID', isp: 'Internet Rakyat' },
      { ip: '8.8.8.8', found: true, abuseScore: 0, compositeScore: 0, verdict: 'Unknown' as const, countryCode: 'US', isp: 'Google LLC' },
    ];
    const tsv = exportInvestigationResults(rows, 'tsv');
    expect(tsv).toContain('ip\tfound\tstatus');
    expect(tsv).toContain('195.178.110.159\ttrue\t');
    expect(tsv).toContain('Internet Rakyat');

    const mdReport = exportInvestigationResults(rows, 'md');
    expect(mdReport).toContain('**2. INDICATOR OF COMPROMISE**');
    expect(mdReport).toContain('| Tipe IoC | Nilai | Negara (ASN) | Keterangan |');
    expect(mdReport).toContain('195.178.110.159');
    expect(mdReport).toContain('Internet Rakyat');
    expect(mdReport).toContain('Catatan: Validasi reputasi dan geolokasi IP diverifikasi melalui AbuseIPDB');
  });
});
