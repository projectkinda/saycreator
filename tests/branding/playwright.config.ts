import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: 'branding.spec.ts', workers: 1, timeout: 30_000, reporter: [['list']],
  use: { baseURL: 'http://localhost:5203', channel: 'chrome', viewport: { width: 1280, height: 900 } },
  webServer: { command: 'npx vite --port 5203 --strictPort', cwd: '../..', url: 'http://localhost:5203/branding', reuseExistingServer: true, timeout: 60_000 },
});
