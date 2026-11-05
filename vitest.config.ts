import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    env: { USE_MOCK_DATA: 'true' },
    exclude: ['**/node_modules/**', '**/.next/**', '**/tests/e2e/**', '**/playwright-report/**', '**/test-results/**'],
  },
});
