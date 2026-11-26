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
  // actionTimeout: a click or fill on a control that is not there fails after 20 s, not after the whole test timeout (some tests allow 5 minutes): a stale locator no longer burns minutes.
  use: { actionTimeout: 20_000, baseURL: `http://localhost:${PORT}`, channel: 'chrome', viewport: { width: 900, height: 700 }, storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'creator.groups', value: 'all' }, { name: 'creator.carousel.describe.v1', value: 'off' }] }] } },
  // Round AE: no test makes a real picture description: the switch starts off in every test browser (above), and this server refuses every describe call (PICTURE_CAP=0).
  // A test that checks describing turns the switch on and answers the route itself.
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    env: { PICTURE_CAP: '0' },
    cwd: '../..',
    url: `http://localhost:${PORT}/tests/image-engine/harness/index.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
