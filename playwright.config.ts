import { defineConfig, devices } from '@playwright/test';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

// Never default to an operational service or start/rebuild Next from this suite.
const suppliedOrigin = process.env.IP_INTEL_E2E_ORIGIN;
if (!suppliedOrigin) throw new Error('Set IP_INTEL_E2E_ORIGIN to the disposable synthetic app origin.');
const target = new URL(suppliedOrigin);
const explicitTestLoopback = process.env.IP_INTEL_E2E_ALLOW_TEST_LOOPBACK === '1'
  && target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
  && !!target.port && !['3000', '3001'].includes(target.port);
if ((suppliedOrigin !== 'http://127.0.0.1:3308' && !explicitTestLoopback)
  || target.username || target.password || target.pathname !== '/' || target.search || target.hash
  || suppliedOrigin !== target.origin) {
  throw new Error('Refusing a non-synthetic E2E origin.');
}
const state = process.env.IP_INTEL_E2E_STORAGE_STATE;
if (!state) throw new Error('Provide IP_INTEL_E2E_STORAGE_STATE from synthetic owner setup; no credentials belong in tests.');
const statePath = path.resolve(state);
const secretDirectory = path.resolve('.secrets');
if (!existsSync(statePath) || !realpathSync(statePath).startsWith(secretDirectory + path.sep)) {
  throw new Error('Synthetic storage state must exist inside this workspace .secrets directory.');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'investigation.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results/investigation',
  use: {
    baseURL: target.origin,
    storageState: statePath,
    serviceWorkers: 'block',
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
});
