// The reference reader's routes (dev only) have the writer's guard: /__reference/read and /__reference/log answer only this computer and only the app's own page,
// and /read stops after READER_CALL_CAP calls per run of the dev server (default 50). The dev-cli provider is run with a stand-in program in place of Claude Code
// (it counts its own runs in a file), and the real dev server is sent a request from another origin with a body the reader would refuse anyway. ZERO real calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CALL_CAP } from '../../server/carousel-writer';
import { referenceHandler } from '../../server/reference-reader';

const SECRET_PROMPT = 'PROMPT-TEXT-THAT-MUST-NOT-BE-LOGGED';

async function serve(env: NodeJS.ProcessEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-guard-'));
  const runs = path.join(dir, 'runs.txt');
  const file = path.join(dir, 'fake-claude.cjs');
  fs.writeFileSync(file, `require('fs').appendFileSync(${JSON.stringify(runs)},'1');let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.stringify({is_error:false,result:'STAND-IN-ANSWER'})))`);
  const lines: string[] = [];
  const h = referenceHandler('dev-cli', { env, log: (l) => lines.push(l), launcher: { bin: process.execPath, args: [file] } });
  const server = http.createServer((req, res) => h(req, res, () => { res.statusCode = 404; res.end('{}'); }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const post = (route: string, headers: Record<string, string>, body = JSON.stringify({ prompt: SECRET_PROMPT, images: [] })) =>
    new Promise<{ status: number; body: { error?: string; kind?: string; text?: string; ok?: boolean } }>((resolve, reject) => {
      const rq = http.request({ host: '127.0.0.1', port, path: route, method: 'POST', headers: { 'content-type': 'text/plain', ...headers } }, (rs) => {
        let s = '';
        rs.on('data', (d) => (s += d));
        rs.on('end', () => resolve({ status: rs.statusCode ?? 0, body: JSON.parse(s) }));
      });
      rq.on('error', reject);
      rq.end(body);
    });
  const ran = () => (fs.existsSync(runs) ? fs.readFileSync(runs, 'utf8').length : 0);
  return { port, lines, post, ran, close: () => new Promise<void>((r) => server.close(() => { fs.rmSync(dir, { recursive: true, force: true }); r(); })) };
}

test('a read or log request from another web page or addressed to another host is refused before anything runs; the app own page is answered', async () => {
  const s = await serve({});
  try {
    const own = `127.0.0.1:${s.port}`;
    const refused = [
      { origin: 'https://evil.example', host: own },
      { origin: 'null', host: own },
      { origin: `http://localhost:${s.port}`, host: own },
      { host: `evil.example:${s.port}` },
      { host: own, 'sec-fetch-site': 'cross-site' },
    ];
    for (const route of ['/read', '/log']) {
      for (const h of refused) {
        const r = await s.post(route, h);
        expect(r.status, `${route} ${JSON.stringify(h)}`).toBe(403);
        expect(r.body.kind).toBe('unavailable');
        expect(r.body.error).toMatch(/^The reference reader only answers/);
      }
    }
    expect(s.ran(), 'the stand-in never ran for a refused request').toBe(0);
    for (const h of [{ host: own, origin: `http://${own}` }, { host: own, origin: `http://${own}`, 'sec-fetch-site': 'same-origin' }, { host: `localhost:${s.port}` }]) {
      const r = await s.post('/read', h);
      expect(r.status, JSON.stringify(h)).toBe(200);
      expect(r.body.text).toBe('STAND-IN-ANSWER');
    }
    expect((await s.post('/log', { host: own, origin: `http://${own}` }, 'a log line')).body.ok).toBe(true);
    expect(s.ran()).toBe(3);
    for (const l of s.lines) expect(l).not.toContain(SECRET_PROMPT);
  } finally {
    await s.close();
  }
});

test('the per-run cap: default 50, READER_CALL_CAP changes it, the read over it is refused with a plain message and runs nothing', async () => {
  expect(DEFAULT_CALL_CAP).toBe(50);
  const s = await serve({ READER_CALL_CAP: '2' });
  try {
    const host = `127.0.0.1:${s.port}`;
    expect((await s.post('/read', { host }, JSON.stringify({ images: [] }))).status, 'a request with no prompt is refused as before and does not use up the cap').toBe(400);
    expect((await s.post('/read', { host })).status).toBe(200);
    expect((await s.post('/read', { host })).status).toBe(200);
    const over = await s.post('/read', { host });
    expect(over.status).toBe(429);
    expect(over.body.kind).toBe('unavailable');
    expect(over.body.error).toMatch(/made 2 calls since the dev server started.*Restart the dev server to read again/);
    expect(s.ran()).toBe(2);
    expect(s.lines.some((l) => /refused: the cap of 2 calls is reached/.test(l))).toBe(true);
  } finally {
    await s.close();
  }
});

test('in the real dev server, a page on another origin cannot reach the reference reader (refused, 403)', async ({ page }) => {
  const statuses: number[] = [];
  page.on('response', (r) => { if (/\/__reference\/(read|log)/.test(r.url())) statuses.push(r.status()); });
  await page.goto('/tests/image-engine/harness/index.html');
  const port = new URL(page.url()).port;
  // a body with no prompt: even without the guard the reader would refuse it (400) and nothing would run
  await page.evaluate(async (port) => {
    for (const route of ['read', 'log']) await fetch(`http://other.localhost:${port}/__reference/${route}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }).catch(() => null);
  }, port);
  await expect.poll(() => statuses.length).toBe(2);
  expect(statuses).toEqual([403, 403]);
});
