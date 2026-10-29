import { defineConfig } from '@playwright/test';

// Real Chrome (already installed), not a download. One worker so the PNGs written to out/ never race.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: '../../test-results/image-engine',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', channel: 'chrome', viewport: { width: 900, height: 700 }, storageState: { cookies: [], origins: [{ origin: 'http://localhost:5199', localStorage: [{ name: 'creator.groups', value: 'all' }] }] } },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    cwd: '../..',
    url: 'http://localhost:5199/tests/image-engine/harness/index.html',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
