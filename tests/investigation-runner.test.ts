import { describe, expect, it, vi } from 'vitest';
import { runInvestigation } from '../components/investigation/investigation-state';

function externalRow(ip: string, overrides: Record<string, unknown> = {}) {
  return { ip, status: 'enriched', source: 'abuseipdb_live', abuseScore: 98, compositeScore: 64, verdict: 'Malicious', verdictColor: 'red', countryCode: 'US', countryName: 'United States', isp: 'Fixture ISP', domain: null, usageType: null, totalReports: 2, numDistinctUsers: 1, lastReportedAt: null, isTor: false, isWhitelisted: false, savedToDb: true, checkedAt: '2026-11-04T12:00:00Z', scoreContext: 'reputation-only', reputationSource: 'abuseipdb', ...overrides };
}
function localMiss(ip: string) {
  return { ip, found: false, verdict: 'Unknown', compositeScore: 0, countryCode: null, countryName: null, isp: null, asn: null, totalAlertCount: 0, topAttackType: null, lastSeen: null, abuseScore: null, vtMalicious: null, reputationSource: null };
}

function localHit(ip: string, overrides: Record<string, unknown> = {}) {
  return { ...localMiss(ip), found: true, verdictColor: 'slate', reputationCheckedAt: null, reputationFresh: false, scoreScope: { from: '2026-10-05T12:00:00Z', to: '2026-11-04T12:00:00Z' }, telemetryEventCount: 0, ...overrides };
}
function externalFailure(overrides: Record<string, unknown> = {}) {
  return externalRow('8.8.8.8', { status: 'error', abuseScore: null, compositeScore: 0, verdict: 'Unknown', verdictColor: 'slate', countryCode: null, countryName: null, isp: null, totalReports: 0, numDistinctUsers: 0, savedToDb: false, checkedAt: null, reputationSource: null, error: 'External enrichment is disabled or not configured', ...overrides });
}
async function runRow(row: Record<string, unknown>, mode: 'local' | 'external') {
  const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true, results: [row] })));
  return runInvestigation({ ips: ['8.8.8.8'], mode, cachePolicy: 'fresh-first' }, new AbortController().signal, vi.fn(), request);
}

const invalidFields: [string, unknown][] = [
  ['abuseScore', 'not-a-number'], ['abuseScore', -1], ['abuseScore', 101], ['abuseScore', 1.5],
  ['compositeScore', '64'], ['compositeScore', Infinity], ['compositeScore', -1], ['compositeScore', 101],
  ['verdict', 'Safe'], ['countryCode', 42], ['isp', {}],
];

describe('investigation outcome field validation', () => {
  for (const mode of ['local', 'external'] as const) {
    const valid = mode === 'local' ? localHit('8.8.8.8') : externalRow('8.8.8.8');
    const fields = mode === 'local'
      ? [...invalidFields, ['totalAlertCount', -4], ['totalAlertCount', 0.5], ['vtMalicious', -1], ['vtMalicious', '1'], ['lastSeen', 'yesterday'], ['reputationCheckedAt', '2026-02-30T12:00:00Z'], ['reputationFresh', 'false'], ['telemetryEventCount', -1], ['scoreScope', { from: 'bad', to: 'bad' }]] as [string, unknown][]
      : [...invalidFields, ['abuseScore', null], ['checkedAt', null], ['checkedAt', 'not-a-date'], ['checkedAt', '2026-02-30T12:00:00Z'], ['totalReports', -1], ['numDistinctUsers', 1.5], ['isTor', 'false'], ['savedToDb', 'true'], ['source', 'cache'], ['reputationSource', null], ['scoreContext', 'local'], ['lastReportedAt', 'bad'], ['error', 42]] as [string, unknown][];
    for (const [field, value] of fields) {
      it(`rejects ${mode} ${field}=${JSON.stringify(value)} despite a valid discriminator`, async () => {
        const result = await runRow({ ...valid, [field]: value }, mode);
        expect(result.completed).toBe(0); expect(result.status).toBe('failed');
        expect(result.results[0]?.error).toContain('unconfirmed');
      });
    }
    for (const field of Object.keys(valid).filter(field => field !== 'ip')) {
      it(`rejects ${mode} outcomes missing required ${field}`, async () => {
        const row: Record<string, unknown> = { ...valid }; delete row[field];
        const result = await runRow(row, mode);
        expect(result.completed).toBe(0); expect(result.results[0]?.error).toContain('unconfirmed');
      });
    }
  }
  it('rejects a bare cached discriminator and malformed cached reputation', async () => {
    for (const row of [{ ip: '8.8.8.8', status: 'cached' }, externalRow('8.8.8.8', { status: 'cached', source: 'cache', abuseScore: 'not-a-number' }), externalRow('8.8.8.8', { status: 'cached', source: 'cache', checkedAt: null })]) {
      const result = await runRow(row, 'external'); expect(result.completed).toBe(0); expect(result.results[0]?.error).toContain('unconfirmed');
    }
  });
  it('accepts actual bulk miss and nullable local-hit contracts without enrichment-only fields', async () => {
    for (const row of [localMiss('8.8.8.8'), localHit('8.8.8.8'), localHit('8.8.8.8', { abuseScore: 100, vtMalicious: 0, totalAlertCount: 4 })]) {
      const result = await runRow(row, 'local'); expect(result.completed).toBe(1); expect(result.status).toBe('completed'); expect(result.results[0]).toEqual(row);
    }
  });
  it('accepts cached, enriched and persistence-warning route contracts', async () => {
    for (const row of [externalRow('8.8.8.8'), externalRow('8.8.8.8', { status: 'cached', source: 'cache' }), externalRow('8.8.8.8', { abuseScore: 0, savedToDb: false, error: 'Provider result retrieved but reputation persistence failed' })]) {
      const result = await runRow(row, 'external'); expect(result.completed).toBe(1); expect(result.results[0]).toEqual(row); expect(result.status).toBe('error' in row && row.error ? 'partial' : 'completed');
    }
  });
  it('confirms legitimate disabled, rate-limited and private route outcomes without treating errors as success', async () => {
    for (const row of [externalFailure(), externalFailure({ status: 'rate_limited', error: 'Provider quota or rate limit reached' }), externalFailure({ status: 'private', source: 'local_private', error: 'Non-global indicator; no external lookup performed' })]) {
      const result = await runRow(row, 'external'); expect(result.completed).toBe(1); expect(result.status).toBe('partial'); expect(result.results[0]).toEqual(row);
    }
  });
  it('does not confirm malformed error outcomes or contradictory status fields', async () => {
    for (const row of [externalFailure({ error: null }), externalFailure({ totalReports: -1 }), externalFailure({ checkedAt: 'bad' }), externalRow('8.8.8.8', { status: 'cached', source: 'cache', savedToDb: false }), externalRow('8.8.8.8', { savedToDb: false }), externalRow('8.8.8.8', { savedToDb: true, error: 'unexpected' })]) {
      const result = await runRow(row, 'external'); expect(result.completed).toBe(0); expect(result.results[0]?.error).toContain('unconfirmed');
    }
  });
});

describe('investigation transport', () => {
  it('rejects false or missing success envelopes and malformed matching indicator outcomes', async () => {
    for (const mode of ['local', 'external'] as const) {
      for (const payload of [
        { success: false, results: [mode === 'local' ? localMiss('8.8.8.8') : externalRow('8.8.8.8')] },
        { results: [mode === 'local' ? localMiss('8.8.8.8') : externalRow('8.8.8.8')] },
        { success: true, results: [{ ip: '8.8.8.8' }] },
        { success: true, results: [{ ip: '8.8.8.8', found: 'true', status: 'invented' }] },
      ]) {
        const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload)));
        const result = await runInvestigation({ ips: ['8.8.8.8'], mode, cachePolicy: 'fresh-first' }, new AbortController().signal, vi.fn(), request);
        expect(result.status).toBe('failed'); expect(result.completed).toBe(0);
        expect(result.results[0]?.error).toContain('unconfirmed');
      }
    }
  });
  it('does not count duplicate, missing or unknown indicators as confirmed success', async () => {
    for (const rows of [[externalRow('8.8.8.8'), externalRow('8.8.8.8')], [], [externalRow('9.9.9.9')]]) {
      const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true, results: rows })));
      const result = await runInvestigation({ ips: ['8.8.8.8'], mode: 'external', cachePolicy: 'fresh-first' }, new AbortController().signal, vi.fn(), request);
      expect(result.status).toBe('failed'); expect(result.completed).toBe(0);
      expect(result.results).toHaveLength(1); expect(result.results[0]?.ip).toBe('8.8.8.8');
      expect(result.results[0]?.error).toContain('unconfirmed');
    }
  });
  it('retains confirmed rows while missing outcomes remain unconfirmed', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true, results: [externalRow('8.8.8.8')] })));
    const result = await runInvestigation({ ips: ['8.8.8.8', '1.1.1.1'], mode: 'external', cachePolicy: 'fresh-first' }, new AbortController().signal, vi.fn(), request);
    expect(result.status).toBe('partial'); expect(result.completed).toBe(1);
    expect(result.results[0]?.abuseScore).toBe(98); expect(result.results[1]?.error).toContain('unconfirmed');
  });
  it('blocks non-public external indicators before any transport and honours cancellation before the first batch', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(runInvestigation({ ips: ['10.0.0.1'], mode: 'external', cachePolicy: 'fresh-first' }, new AbortController().signal, vi.fn(), request)).rejects.toThrow();
    const controller = new AbortController(); controller.abort();
    const result = await runInvestigation({ ips: ['8.8.8.8'], mode: 'external', cachePolicy: 'fresh-first' }, controller.signal, vi.fn(), request);
    expect(result.status).toBe('cancelled'); expect(result.completed).toBe(0); expect(request).not.toHaveBeenCalled();
  });
  it('does not claim completion when an in-flight request is aborted', async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>(async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); });
    const result = await runInvestigation({ ips: ['8.8.8.8'], mode: 'external', cachePolicy: 'fresh-first' }, controller.signal, vi.fn(), request);
    expect(result.status).toBe('cancelled'); expect(result.completed).toBe(0); expect(result.results).toEqual([]);
  });
  it('rejects unsafe or oversized submissions without issuing requests', async () => {
    const request = vi.fn<typeof fetch>();
    for (const submission of [
      { ips: [], mode: 'local', cachePolicy: 'fresh-first' },
      { ips: ['bad'], mode: 'local', cachePolicy: 'fresh-first' },
      { ips: ['8.8.8.8'], mode: 'local', cachePolicy: 'force-refresh' },
      { ips: Array.from({ length: 201 }, (_, i) => `8.8.0.${i}`), mode: 'external', cachePolicy: 'fresh-first' },
    ] as const) {
      await expect(runInvestigation({ ...submission, ips: [...submission.ips] }, new AbortController().signal, vi.fn(), request)).rejects.toThrow();
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps completed batches when cancellation prevents later requests', async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      controller.abort();
      return new Response(JSON.stringify({ success: true, results: JSON.parse(init!.body as string).ips.map((ip: string) => externalRow(ip)) }));
    });
    const result = await runInvestigation({ ips: Array.from({ length: 101 }, (_, i) => `8.8.0.${i}`), mode: 'external', cachePolicy: 'fresh-first' }, controller.signal, vi.fn(), request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('cancelled');
    expect(result.completed).toBe(100);
    expect(result.results).toHaveLength(100);
  });

  it('marks per-item errors and omitted response rows as partial instead of claiming success', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true, results: [externalFailure({ status: 'rate_limited', error: 'Quota exhausted' })] })));
    const result = await runInvestigation({ ips: ['8.8.8.8', '1.1.1.1'], mode: 'external', cachePolicy: 'fresh-first' }, new AbortController().signal, vi.fn(), request);
    expect(result.status).toBe('partial');
    expect(result.results.map(r => r.ip)).toEqual(['8.8.8.8', '1.1.1.1']);
    expect(result.results[1]?.error).toBeTruthy();
  });

  it('preserves earlier results and reports transport failure honestly', async () => {
    const request = vi.fn<typeof fetch>(async (_url, init) => new Response(JSON.stringify({ success: true, results: JSON.parse(init!.body as string).ips.map((ip: string) => externalRow(ip)) })))
      .mockImplementationOnce(async (_url, init) => new Response(JSON.stringify({ success: true, results: JSON.parse(init!.body as string).ips.map((ip: string) => externalRow(ip)) })))
      .mockRejectedValueOnce(new Error('network'));
    const result = await runInvestigation({ ips: Array.from({ length: 101 }, (_, i) => `8.8.0.${i}`), mode: 'external', cachePolicy: 'fresh-first' }, new AbortController().signal, vi.fn(), request);
    expect(result.status).toBe('partial');
    expect(result.completed).toBe(100);
    expect(result.results).toHaveLength(101);
    expect(result.results[100]?.error).toContain('failed');
  });
  it('posts local input only to bulk and never falls back for misses', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true, results: [localMiss('8.8.8.8')] })));
    const progress = vi.fn();
    const result = await runInvestigation({ ips: ['8.8.8.8'], mode: 'local', cachePolicy: 'fresh-first' }, new AbortController().signal, progress, request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe('/api/bulk');
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string)).toEqual({ ips: ['8.8.8.8'] });
    expect(result.status).toBe('completed');
    expect(result.results[0]?.found).toBe(false);
    expect(progress.mock.calls.at(-1)?.[0].completed).toBe(1);
  });

  it('chunks explicit external submissions to 100 with fresh-first or force-refresh and forwards cancellation', async () => {
    for (const cachePolicy of ['fresh-first', 'force-refresh'] as const) {
      const ips = Array.from({ length: 101 }, (_, i) => `8.8.0.${i}`);
      const signal = new AbortController().signal;
      const request = vi.fn<typeof fetch>(async (_url, init) => new Response(JSON.stringify({ success: true, results: JSON.parse(init!.body as string).ips.map((ip: string) => externalRow(ip)) })));
      const progress = vi.fn();
      const result = await runInvestigation({ ips, mode: 'external', cachePolicy }, signal, progress, request);
      expect(request.mock.calls.map(([url]) => url)).toEqual(['/api/enrich', '/api/enrich']);
      expect(request.mock.calls.map(([, init]) => JSON.parse(init!.body as string).ips.length)).toEqual([100, 1]);
      expect(JSON.parse(request.mock.calls[0]![1]!.body as string).checkCacheFirst).toBe(cachePolicy === 'fresh-first');
      expect(request.mock.calls[0]![1]!.signal).toBe(signal);
      expect(progress.mock.calls.map(([p]) => p.completed)).toEqual([0, 100, 101, 101]);
      expect(result.status).toBe('completed');
    }
  });
});
