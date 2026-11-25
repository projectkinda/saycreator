// The writer route's guard (dev only): it answers only this computer and only the app's own page, it stops after a per-run cap of calls, and it writes one line per
// call (time, duration, prompt size) that never holds the prompt text, the answer or a key. Tested with a fake fetch (no model is called, no key is real) and, for the
// browser case, against the real dev server with a request from another origin that is refused before anything runs. ZERO writer calls reach a model.
import { expect, test } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { carouselHandler, DEFAULT_CALL_CAP } from '../../server/carousel-writer';

const KEY = 'sk-ant-guard-0123456789abcdefghijkl';
const SECRET_PROMPT = 'PROMPT-TEXT-THAT-MUST-NOT-BE-LOGGED';

async function serve(env: NodeJS.ProcessEnv) {
  const calls: number[] = [];
  const lines: string[] = [];
  const fetchImpl = (async () => {
    calls.push(1);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ANSWER-TEXT' }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const h = carouselHandler('api', { env: { ANTHROPIC_API_KEY: KEY, ...env }, fetchImpl, log: (l) => lines.push(l) });
  const server = http.createServer((req, res) => h(req, res, () => { res.statusCode = 404; res.end('{}'); }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  // http.request, so the Host, Origin and Sec-Fetch-Site headers are exactly what the test says
  const post = (headers: Record<string, string>, body = JSON.stringify({ prompt: SECRET_PROMPT })) =>
    new Promise<{ status: number; body: { error?: string; kind?: string; text?: string } }>((resolve, reject) => {
      const rq = http.request({ host: '127.0.0.1', port, path: '/write', method: 'POST', headers: { 'content-type': 'text/plain', ...headers } }, (rs) => {
        let s = '';
        rs.on('data', (d) => (s += d));
        rs.on('end', () => resolve({ status: rs.statusCode ?? 0, body: JSON.parse(s) }));
      });
      rq.on('error', reject);
      rq.end(body);
    });
  return { port, calls, lines, post, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test('a request from another web page or addressed to another host is refused before anything runs; the app own page and local tools are answered', async () => {
  const s = await serve({});
  try {
    const own = `127.0.0.1:${s.port}`;
    const refused = [
      { origin: 'https://evil.example', host: own },
      { origin: 'null', host: own },
      { origin: `http://localhost:${s.port}`, host: own }, // another origin on this computer (a different host name is a different origin)
      { origin: `http://127.0.0.1:${s.port + 1}`, host: own }, // another port
      { host: `evil.example:${s.port}` }, // DNS rebinding: a page on another name that points here
      { host: own, 'sec-fetch-site': 'cross-site' }, // a browser that leaves out Origin but says the request is cross-site
      { host: own, 'sec-fetch-site': 'same-site' },
    ];
    for (const h of refused) {
      const r = await s.post(h);
      expect(r.status, JSON.stringify(h)).toBe(403);
      expect(r.body.kind).toBe('unavailable');
      expect(r.body.error).toMatch(/only answers/);
    }
    expect(s.calls.length, 'no model call for a refused request').toBe(0);
    // the app's own page (same origin), a same-origin fetch with Sec-Fetch-Site, and a local tool that sends no Origin (node fetch, the scripts)
    for (const h of [{ host: own, origin: `http://${own}` }, { host: own, origin: `http://${own}`, 'sec-fetch-site': 'same-origin' }, { host: own }, { host: `localhost:${s.port}` }]) {
      const r = await s.post(h);
      expect(r.status, JSON.stringify(h)).toBe(200);
      expect(r.body.text).toBe('ANSWER-TEXT');
    }
    expect(s.calls.length).toBe(4);
  } finally {
    await s.close();
  }
});

test('the per-run cap: default 50, WRITER_CALL_CAP changes it, the call over it is refused with a plain message and calls nothing', async () => {
  expect(DEFAULT_CALL_CAP).toBe(50);
  const s = await serve({ WRITER_CALL_CAP: '2' });
  try {
    const host = `127.0.0.1:${s.port}`;
    expect((await s.post({ host })).status).toBe(200);
    expect((await s.post({ host })).status).toBe(200);
    const over = await s.post({ host });
    expect(over.status).toBe(429);
    expect(over.body.kind).toBe('unavailable');
    expect(over.body.error).toMatch(/made 2 calls since the dev server started.*Restart the dev server/);
    expect(s.calls.length).toBe(2);
    // a request with no prompt is refused as before and does not use up the cap
    const s2 = await serve({ WRITER_CALL_CAP: '1' });
    try {
      const h2 = { host: `127.0.0.1:${s2.port}` };
      expect((await s2.post(h2, JSON.stringify({}))).status).toBe(400);
      expect((await s2.post(h2)).status).toBe(200);
      expect((await s2.post(h2)).status).toBe(429);
    } finally {
      await s2.close();
    }
  } finally {
    await s.close();
  }
});

test('one log line per call: time, call number, duration and prompt size; never the prompt text, the answer or the key', async () => {
  const s = await serve({ WRITER_CALL_CAP: '1' });
  try {
    const host = `127.0.0.1:${s.port}`;
    await s.post({ host });
    await s.post({ host }); // over the cap
    await s.post({ host, origin: 'https://evil.example' }); // refused
    expect(s.lines.length).toBe(3);
    expect(s.lines[0]).toMatch(/^\[writer api\] \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z call 1\/1 write ok \d+\.\d s, prompt 35 chars, 0 pictures$/);
    expect(s.lines[1]).toMatch(/refused: the cap of 1 calls is reached/);
    expect(s.lines[2]).toMatch(/refused a request: .*another web page/);
    for (const l of s.lines) {
      expect(l).not.toContain(SECRET_PROMPT);
      expect(l).not.toContain('ANSWER-TEXT');
      expect(l).not.toContain(KEY);
      expect(l).not.toMatch(/sk-ant-/);
    }
  } finally {
    await s.close();
  }
});

test('in the real dev server, a page on another origin cannot make the writer run (refused, 403), not even with a no-cors text/plain post', async ({ page }) => {
  const statuses: number[] = [];
  page.on('response', (r) => { if (/\/__carousel\/write/.test(r.url())) statuses.push(r.status()); });
  await page.goto('/tests/image-engine/harness/index.html');
  const port = new URL(page.url()).port;
  // the harness is on localhost:<port>; other.localhost:<port> is another origin (and another Host), like any other web page would be
  const r = await page.evaluate(async (port) => {
    const res = await fetch(`http://other.localhost:${port}/__carousel/write`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ prompt: 'x' }) }).catch((e) => String(e));
    await fetch(`http://other.localhost:${port}/__carousel/write`, { method: 'POST', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ prompt: 'x' }) }).catch(() => null);
    return typeof res === 'string' ? res : res.status;
  }, port);
  // the browser may hide the answer from the page (CORS); what the server answered is seen on the network
  expect(typeof r === 'number' ? [r] : [], String(r)).not.toContain(200);
  await expect.poll(() => statuses.length).toBe(2);
  expect(statuses).toEqual([403, 403]);
});
