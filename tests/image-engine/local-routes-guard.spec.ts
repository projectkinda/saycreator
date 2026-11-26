// The other dev routes that do work on request, /__cutout/infer (background removal on this computer) and /__image/generate (picture generation with the key on
// the server), have the writer's guard: only this computer and only the app's own page. Tested with bodies that never run the model and a picture address on this
// computer that nothing listens on, so nothing leaves the computer even if a check were wrong. ZERO model calls.
import { expect, test } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { cutoutHandler } from '../../server/cutout-dev';
import { imageHandler } from '../../server/image-dev';

type H = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<unknown>;
async function serve(h: H) {
  const server = http.createServer((req, res) => void h(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const post = (route: string, headers: Record<string, string>, body: string) =>
    new Promise<{ status: number; body: { error?: string } }>((resolve, reject) => {
      const rq = http.request({ host: '127.0.0.1', port, path: route, method: 'POST', headers: { 'content-type': 'text/plain', ...headers } }, (rs) => {
        let s = '';
        rs.on('data', (d) => (s += d));
        rs.on('end', () => resolve({ status: rs.statusCode ?? 0, body: JSON.parse(s || '{}') }));
      });
      rq.on('error', reject);
      rq.end(body);
    });
  return { port, post, close: () => new Promise<void>((r) => server.close(() => r())) };
}
const refusedFor = (port: number) => {
  const own = `127.0.0.1:${port}`;
  return [
    { origin: 'https://evil.example', host: own },
    { origin: 'null', host: own },
    { origin: `http://localhost:${port}`, host: own },
    { host: `evil.example:${port}` },
    { host: own, 'sec-fetch-site': 'cross-site' },
  ];
};

test('background removal: a request from another web page or addressed to another host is refused (403); the app own page reaches the usual checks', async () => {
  const s = await serve(cutoutHandler({ env: { CUTOUT_MODEL: 'Z:/no/such/model.onnx' } }));
  try {
    for (const h of refusedFor(s.port)) {
      const r = await s.post('/infer', h, 'too short');
      expect(r.status, JSON.stringify(h)).toBe(403);
      expect(r.body.error).toMatch(/^Background removal only answers/);
    }
    // allowed: the request goes on to the usual checks (no weights here: 503; with weights: the short body is a 400). Never 403.
    const own = `127.0.0.1:${s.port}`;
    for (const h of [{ host: own, origin: `http://${own}` }, { host: `localhost:${s.port}` }]) expect([400, 503]).toContain((await s.post('/infer', h, 'too short')).status);
  } finally {
    await s.close();
  }
});

test('picture generation: a request from another web page or addressed to another host is refused (403) before the key is used; the app own page reaches the usual checks', async () => {
  let fetched = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetched++;
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  const s = await serve(imageHandler({ env: { IMAGE_API_KEY: 'test-key-not-real', IMAGE_MODEL: 'test-model', IMAGE_API_URL: 'http://127.0.0.1:1/none' } }));
  try {
    for (const h of refusedFor(s.port)) {
      const r = await s.post('/generate', h, JSON.stringify({ prompt: 'a cat', w: 1024, h: 1024 }));
      expect(r.status, JSON.stringify(h)).toBe(403);
      expect(r.body.error).toMatch(/^Picture generation only answers/);
    }
    expect(fetched, 'no picture service call for a refused request').toBe(0);
    const own = `127.0.0.1:${s.port}`;
    const ok = await s.post('/generate', { host: own, origin: `http://${own}` }, JSON.stringify({ prompt: '' }));
    expect(ok.status, 'allowed, and refused later only because the prompt is empty').toBe(400);
    expect(fetched).toBe(0);
  } finally {
    globalThis.fetch = realFetch;
    await s.close();
  }
});

test('in the real dev server, a page on another origin cannot reach background removal or picture generation (refused, 403)', async ({ page }) => {
  const statuses: Record<string, number> = {};
  page.on('response', (r) => { const m = /\/(__cutout\/infer|__image\/generate)$/.exec(r.url()); if (m) statuses[m[1]] = r.status(); });
  await page.goto('/tests/image-engine/harness/index.html');
  const port = new URL(page.url()).port;
  // bodies the routes refuse anyway (a short cutout input, an empty prompt): even without the guard nothing would run
  await page.evaluate(async (port) => {
    await fetch(`http://other.localhost:${port}/__cutout/infer`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' }).catch(() => null);
    await fetch(`http://other.localhost:${port}/__image/generate`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"prompt":""}' }).catch(() => null);
  }, port);
  await expect.poll(() => Object.keys(statuses).length).toBe(2);
  expect(statuses).toEqual({ '__cutout/infer': 403, '__image/generate': 403 });
});
