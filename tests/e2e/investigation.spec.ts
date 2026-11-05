import { test as base, expect, type Page } from '@playwright/test';

// Browser interception fixtures are synthetic UI contracts, not database evidence.
// The last test deliberately leaves /api/bulk and all detail reads unmocked.
const LOCAL_IP = '203.0.113.240';
const SECOND_IP = '2001:db8::240';
const PUBLIC_IP = '8.8.8.8';
type Safety = { enrichRequests: number; externalRequests: number; allowSyntheticEnrich: boolean };
const test = base.extend<{ safety: Safety }>({
  safety: async ({}, provideFixture) => {
    const safety = { enrichRequests: 0, externalRequests: 0, allowSyntheticEnrich: false };
    await provideFixture(safety);
    expect(safety.externalRequests, 'No browser traffic may leave the disposable app').toBe(0);
    expect(safety.enrichRequests, 'Only the explicit intercepted enrichment test may submit enrichment').toBe(safety.allowSyntheticEnrich ? 1 : 0);
  },
  page: async ({ page, context, baseURL, safety }, provideFixture) => {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== baseURL) {
        safety.externalRequests++;
        await route.abort('blockedbyclient');
        return;
      }
      if (url.pathname === '/api/enrich') {
        safety.enrichRequests++;
        if (!safety.allowSyntheticEnrich) {
          await route.abort('blockedbyclient');
          return;
        }
        // Never forward this request: server-side provider egress must be impossible.
        await route.fulfill({ json: { success: true, results: [{
          ip: PUBLIC_IP, status: 'cached', source: 'cache', abuseScore: 0,
          compositeScore: 0, verdict: 'Low risk', totalAlertCount: 0,
          reputationSource: 'synthetic fixture', freshness: 'Fresh cache', savedToDb: false,
        }] } });
        return;
      }
      await route.continue();
    });
    await provideFixture(page);
  },
});

async function openWorkbench(page: Page) {
  await page.goto('/investigate');
  await expect(page.getByRole('heading', { name: 'Investigate', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Local Lookup', exact: true })).toBeChecked();
}

async function mockLocalLookup(page: Page) {
  const submissions: unknown[] = [];
  await page.route('**/api/bulk', async route => {
    const body = route.request().postDataJSON() as { ips: string[] };
    submissions.push(body);
    await route.fulfill({ json: { success: true, results: body.ips.map(ip => ({
      ip, found: false, abuseScore: null, totalAlertCount: 0,
      compositeScore: 0, verdict: 'Unknown', reputationSource: null,
    })) } });
  });
  return submissions;
}

test('desktop navigation has one visible Investigate, Analytics, no Overview, and brand home', async ({ page }) => {
  await openWorkbench(page);
  const primary = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(primary).toBeVisible();
  await expect(page.getByRole('link', { name: 'Investigate', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Overview', exact: true })).toHaveCount(0);
  await expect(primary.getByRole('link', { name: 'Investigate', exact: true })).toHaveAttribute('aria-current', 'page');
  await primary.getByRole('link', { name: 'Analytics', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Global Threat Telemetry & Macro Analytics' })).toBeVisible();
  await expect(primary.getByRole('link', { name: 'Analytics', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Neuropetra IP home', exact: true }).click();
  await expect(page).toHaveURL(new URL('/', process.env.IP_INTEL_E2E_ORIGIN!).href);
});

for (const [legacy, mode, radio] of [
  ['bulk', 'local', 'Local Lookup'],
  ['enrich', 'external', 'External Enrichment'],
] as const) {
  test(`legacy /${legacy} redirects preserve indicators and intended mode but drop secret query values`, async ({ page }) => {
    // This is a harmless canary, never a real key or a credential.
    const canary = 'synthetic-secret-canary-not-a-credential';
    const query = new URLSearchParams({ ip: LOCAL_IP, ips: `${SECOND_IP}, ${canary}`, apiKey: canary, token: canary, unrelated: canary });
    await page.goto(`/${legacy}?${query}`);
    await expect(page.getByRole('heading', { name: 'Investigate', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: radio, exact: true })).toBeChecked();
    await expect(page.getByRole('textbox', { name: 'IP indicators', exact: true })).toHaveValue(`${LOCAL_IP}\n${SECOND_IP}`);
    const destination = new URL(page.url());
    expect(destination.pathname).toBe('/investigate');
    expect(destination.searchParams.get('mode')).toBe(mode);
    expect([...destination.searchParams.keys()].sort()).toEqual(['ips', 'mode']);
    expect(destination.href).not.toContain(canary);
  });
}

test('one shared input accepts a single IP then mixed bulk; local submit filters invalid and duplicate values', async ({ page }) => {
  const submissions = await mockLocalLookup(page);
  await openWorkbench(page);
  const input = page.getByRole('textbox', { name: 'IP indicators', exact: true });
  await expect(input).toHaveCount(1);
  await input.fill(LOCAL_IP);
  await expect(page.locator('#input-accounting')).toHaveText('1 valid · 0 invalid · 0 duplicates removed');
  await page.getByRole('button', { name: 'Search Local', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Results (1)', exact: true })).toBeVisible();
  expect(submissions).toEqual([{ ips: [LOCAL_IP] }]);
  await input.fill(`${LOCAL_IP}, ${SECOND_IP}; ${LOCAL_IP}\ninvalid-value\n10.0.0.0/8`);
  await expect(page.locator('#input-accounting')).toHaveText('2 valid · 2 invalid · 1 duplicate removed');
  await page.getByText('Invalid values will not be submitted', { exact: true }).click();
  await expect(page.getByText('invalid-value\n10.0.0.0/8', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Search Local', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Results (2)', exact: true })).toBeVisible();
  expect(submissions).toEqual([{ ips: [LOCAL_IP] }, { ips: [LOCAL_IP, SECOND_IP] }]);
  await page.getByRole('radio', { name: 'External Enrichment', exact: true }).check();
  await expect(input).toHaveValue(`${LOCAL_IP}, ${SECOND_IP}; ${LOCAL_IP}\ninvalid-value\n10.0.0.0/8`);
  await expect(page.getByText('Results are from Local Lookup; switching modes does not send requests.', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Local Lookup', exact: true }).check();
  expect(submissions).toHaveLength(2);
});

test('invalid-only, over-200 unique input and oversize uploads cannot submit or silently truncate', async ({ page }) => {
  const submissions = await mockLocalLookup(page);
  await openWorkbench(page);
  const input = page.getByRole('textbox', { name: 'IP indicators', exact: true });
  await input.fill('invalid-only 10.0.0.0/8');
  await expect(page.getByRole('button', { name: 'Search Local', exact: true })).toBeDisabled();
  const batch = Array.from({ length: 201 }, (_, index) => `198.51.100.${index + 1}`).join('\n');
  await input.fill(batch);
  await expect(page.getByRole('alert').filter({ hasText: 'Limit: 200 unique IPs.' })).toHaveText('Limit: 200 unique IPs. All 201 are retained; split this input before submitting.');
  await expect(input).toHaveValue(batch);
  await expect(page.getByRole('button', { name: 'Search Local', exact: true })).toBeDisabled();
  await page.getByLabel('Upload CSV or TXT', { exact: true }).setInputFiles({ name: 'oversize.txt', mimeType: 'text/plain', buffer: Buffer.alloc(1024 * 1024 + 1, 'x') });
  await expect(page.getByText('File exceeds 1 MiB. Split the file; no input was imported.', { exact: true })).toBeVisible();
  await expect(input).toHaveValue(batch);
  await page.getByLabel('Upload CSV or TXT', { exact: true }).setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(`ip\n${LOCAL_IP}\n${LOCAL_IP}\n${SECOND_IP}\ninvalid-value`) });
  await expect(page.locator('#input-accounting')).toHaveText('2 valid · 1 invalid · 1 duplicate removed');
  expect(submissions).toEqual([]);
});

test('real installation capability disables explicit enrichment with a reason and mode switches never submit', async ({ page }) => {
  await openWorkbench(page);
  await page.getByRole('textbox', { name: 'IP indicators', exact: true }).fill(PUBLIC_IP);
  await page.getByRole('radio', { name: 'External Enrichment', exact: true }).check();
  await expect(page.getByText('External enrichment is not configured for this installation.', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: `Select input ${PUBLIC_IP}`, exact: true }).check();
  await expect(page.getByRole('button', { name: 'Enrich Selected', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: 'Local Lookup', exact: true }).check();
  await expect(page.getByRole('textbox', { name: 'IP indicators', exact: true })).toHaveValue(PUBLIC_IP);
});

test('synthetic enabled session requires explicit public selection and click before intercepted enrichment', async ({ page, safety }) => {
  safety.allowSyntheticEnrich = true;
  await page.route('**/api/auth/session', route => route.fulfill({ json: {
    user: { userId: 'synthetic-ui-only', username: 'synthetic-ui-only', role: 'admin' },
    permissions: ['read', 'enrich', 'export'], capabilities: { externalEnrichment: true, maintenance: false },
  } }));
  await openWorkbench(page);
  await page.getByRole('textbox', { name: 'IP indicators', exact: true }).fill(`${PUBLIC_IP}\n10.0.0.1`);
  await page.getByRole('radio', { name: 'External Enrichment', exact: true }).check();
  const enrich = page.getByRole('button', { name: 'Enrich Selected', exact: true });
  await expect(enrich).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Select input 10.0.0.1', exact: true }).check();
  await expect(enrich).toBeDisabled();
  await page.getByRole('checkbox', { name: `Select input ${PUBLIC_IP}`, exact: true }).check();
  await expect(enrich).toBeEnabled();
  expect(safety.enrichRequests).toBe(0);
  const outgoing = page.waitForRequest(request => new URL(request.url()).pathname === '/api/enrich');
  await enrich.click();
  const request = await outgoing;
  expect(request.method()).toBe('POST');
  expect(request.postDataJSON()).toEqual({ ips: [PUBLIC_IP], checkCacheFirst: true });
  await expect(page.getByRole('heading', { name: 'Results (1)', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Investigation results' }).getByText('Not saved', { exact: true })).toBeVisible();
});

test('real local API empty state flows through Chromium result evidence link without any enrichment', async ({ page }) => {
  // No route fulfillment for bulk or detail: this must exercise real authenticated HTTP.
  await openWorkbench(page);
  await page.getByRole('textbox', { name: 'IP indicators', exact: true }).fill(LOCAL_IP);
  const bulkResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/bulk' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Search Local', exact: true }).click();
  const response = await bulkResponse;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ ips: [LOCAL_IP] });
  const payload = await response.json();
  expect(payload.totalRequested).toBe(1);
  expect(payload.foundCount).toBe(0);
  expect(payload.results).toEqual([expect.objectContaining({ ip: LOCAL_IP, found: false, totalAlertCount: 0, abuseScore: null, verdict: 'Unknown' })]);
  const results = page.getByRole('region', { name: 'Investigation results' });
  await expect(results.getByText('Local miss', { exact: true })).toBeVisible();
  const detailResponse = page.waitForResponse(item => new URL(item.url()).pathname === `/api/ip/${LOCAL_IP}`);
  await results.getByRole('link', { name: LOCAL_IP, exact: true }).click();
  const detail = await detailResponse;
  expect(detail.status()).toBe(200);
  expect(await detail.json()).toMatchObject({ found: false, ip: LOCAL_IP });
  await expect(page).toHaveURL(new RegExp(`/ip/${LOCAL_IP.replaceAll('.', '\\.')}\\?*`));
  await expect(page.getByRole('heading', { name: `No Telemetry Recorded for ${LOCAL_IP}`, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Live Enrich Externally →', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'External Enrichment', exact: true })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'IP indicators', exact: true })).toHaveValue(LOCAL_IP);
  await expect(page.getByRole('button', { name: 'Enrich Selected', exact: true })).toBeDisabled();
});
