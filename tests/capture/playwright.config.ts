import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'capture.spec.ts',
  outputDir: '../../test-results/capture',
  workers: 1,
  timeout: 45_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5200',
    channel: 'chrome',
    viewport: { width: 1200, height: 850 },
    permissions: ['camera', 'microphone'],
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
  webServer: {
    command: 'npx vite --port 5200 --strictPort',
    cwd: '../..',
    url: 'http://localhost:5200/videos/record',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
