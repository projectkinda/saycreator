import { defineConfig } from '@playwright/test';

// Real Chrome (already installed), not a download. One worker so the PNGs written to out/ never race.
// E2E_PORT lets a second dev server (for example one with READER_LOG set) run beside the usual one.
const PORT = process.env.E2E_PORT ?? '5199';
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: '../../test-results/image-engine',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome', viewport: { width: 900, height: 700 }, storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'creator.groups', value: 'all' }] }] } },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://localhost:${PORT}/tests/image-engine/harness/index.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
