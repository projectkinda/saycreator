// The server side of the one-shot writer, tested with stand-ins: a fake Claude Code program and a fake fetch. No real call is made
// and no key is used. Also: the guard that fails when a key-shaped string or the key variable reaches client code or the build.
import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiStatus, carouselHandler, cliStatus, findClaudeCli, writeWithApi, writeWithCli, WriterFailure } from '../../server/carousel-writer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cw-'));
const fakeCli = (body: string) => {
  const dir = tmp();
  const file = path.join(dir, 'fake-claude.cjs');
  fs.writeFileSync(file, body);
  return { bin: process.execPath, args: [file] };
};
const never = new AbortController().signal;

test.describe('the dev provider (Claude Code on this computer), with a stand-in program', () => {
  test('it sends the prompt on stdin and returns the text from the JSON result', async () => {
    const l = fakeCli(`let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.stringify({result:'got:'+s.length+':'+s.slice(0,5),is_error:false})))`);
    const r = await writeWithCli('hello world', never, {}, 20_000, l);
    expect(r.text).toBe('got:11:hello');
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });
  test('a program that fails says so in plain words, with its first line', async () => {
    const l = fakeCli(`process.stderr.write('Not logged in\\nmore');process.exit(1)`);
    await expect(writeWithCli('x', never, {}, 20_000, l)).rejects.toMatchObject({ status: 502, kind: 'failed', message: expect.stringMatching(/did not return a script \(exit code 1\): Not logged in/) });
    const l2 = fakeCli(`process.stdout.write(JSON.stringify({result:'Credit balance is too low',is_error:true}))`);
    await expect(writeWithCli('x', never, {}, 20_000, l2)).rejects.toMatchObject({ kind: 'failed', message: expect.stringMatching(/Credit balance is too low/) });
    const l3 = fakeCli(`process.stdout.write('not json at all')`);
    await expect(writeWithCli('x', never, {}, 20_000, l3)).rejects.toMatchObject({ kind: 'failed' });
  });
  test('it gives up after the time limit and stops the program', async () => {
    const l = fakeCli(`setTimeout(()=>{}, 60000)`);
    const t0 = Date.now();
    await expect(writeWithCli('x', never, {}, 700, l)).rejects.toMatchObject({ status: 504, kind: 'timeout', message: expect.stringMatching(/did not answer within 1 seconds/) });
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  test('cancelling stops the program at once', async () => {
    const l = fakeCli(`setTimeout(()=>{}, 60000)`);
    const ctl = new AbortController();
    const t0 = Date.now();
    const p = writeWithCli('x', ctl.signal, {}, 30_000, l);
    setTimeout(() => ctl.abort(), 300);
    await expect(p).rejects.toMatchObject({ kind: 'cancelled' });
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  test('a missing command line tool is reported plainly, not as a crash', async () => {
    const env = { CLAUDE_BIN: path.join(tmp(), 'no-such-claude.exe') };
    expect(findClaudeCli(env)).toBeNull();
    expect(cliStatus(env)).toMatchObject({ available: false, reason: expect.stringMatching(/was not found on this computer.*CLAUDE_BIN/) });
    await expect(writeWithCli('x', never, env)).rejects.toMatchObject({ status: 503, kind: 'unavailable' });
  });
  test('a tool named by CLAUDE_BIN is found', () => {
    const l = fakeCli('');
    expect(findClaudeCli({ CLAUDE_BIN: l.args[0] })).toBe(l.args[0]);
    expect(cliStatus({ CLAUDE_BIN: l.args[0] })).toEqual({ available: true });
  });
});

test.describe('the API provider (key on the server only), with a fake fetch', () => {
  const KEY = 'sk-ant-test-0123456789abcdefghijklmnop';
  test('off without a key: status says so and a write is refused, and the network is never touched', async () => {
    expect(apiStatus({})).toMatchObject({ available: false });
    let touched = false;
    await expect(writeWithApi('x', never, {}, (async () => { touched = true; return new Response('{}'); }) as typeof fetch)).rejects.toMatchObject({ status: 503, kind: 'unavailable' });
    expect(touched).toBe(false);
  });
  test('with a key it sends the key in a header to the Messages API and returns only the text', async () => {
    expect(apiStatus({ ANTHROPIC_API_KEY: KEY })).toEqual({ available: true });
    let seen: { url: string; headers: Record<string, string>; body: { model: string; messages: { content: string }[] } } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ok":true}' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await writeWithApi('the prompt', never, { ANTHROPIC_API_KEY: KEY }, f);
    expect(r.text).toBe('{"ok":true}');
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(seen!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(seen!.headers['x-api-key']).toBe(KEY);
    expect(seen!.body.messages[0].content).toBe('the prompt');
    expect(seen!.body.model).toBe('claude-sonnet-5-5');
  });
  test('an error from the API never carries the key into the message', async () => {
    const f = (async () => new Response(JSON.stringify({ error: { message: `invalid x-api-key ${KEY}` } }), { status: 401 })) as unknown as typeof fetch;
    const e = (await writeWithApi('x', never, { ANTHROPIC_API_KEY: KEY }, f).catch((x) => x)) as WriterFailure;
    expect(e).toBeInstanceOf(WriterFailure);
    expect(e.message).toMatch(/refused the request \(401\)/);
    expect(e.message).not.toContain(KEY);
  });
});

test.describe('the HTTP routes', () => {
  async function serve(provider: 'dev-cli' | 'api', env: NodeJS.ProcessEnv, fetchImpl?: typeof fetch) {
    const h = carouselHandler(provider, { env, fetchImpl });
    const server = http.createServer((req, res) => h(req, res, () => { res.statusCode = 404; res.end('{}'); }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
  }
  test('status and write answer in plain JSON; a missing prompt is refused; the key never appears in any answer', async () => {
    const KEY = 'sk-ant-route-0123456789abcdefghijkl';
    const fetchImpl = (async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'script' }] }), { status: 200 })) as unknown as typeof fetch;
    const s = await serve('api', { ANTHROPIC_API_KEY: KEY }, fetchImpl);
    try {
      const st = await fetch(s.base + '/status');
      expect(await st.json()).toEqual({ available: true });
      const w = await fetch(s.base + '/write', { method: 'POST', body: JSON.stringify({ prompt: 'hi' }) });
      const wt = await w.text();
      expect(JSON.parse(wt).text).toBe('script');
      expect(wt).not.toContain(KEY);
      const bad = await fetch(s.base + '/write', { method: 'POST', body: JSON.stringify({}) });
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toMatch(/no prompt/);
      expect((await fetch(s.base + '/other')).status).toBe(404);
    } finally {
      await s.close();
    }
    const off = await serve('api', {});
    try {
      expect(await (await fetch(off.base + '/status')).json()).toMatchObject({ available: false });
      const w = await fetch(off.base + '/write', { method: 'POST', body: JSON.stringify({ prompt: 'hi' }) });
      expect(w.status).toBe(503);
    } finally {
      await off.close();
    }
  });
});

test.describe('the secrets guard', () => {
  const guard = (root: string) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-secrets.mjs'), '--root', root], { encoding: 'utf8' });
  const tree = (files: Record<string, string>) => {
    const dir = tmp();
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return dir;
  };
  const FAKE = 'sk-ant-api03-' + 'A1b2C3d4'.repeat(6);
  test('a clean tree passes; server and .env.example may name the variable', () => {
    const r = guard(tree({ 'src/a.ts': 'export const a = 1;', 'dist/assets/x.js': 'console.log(1)', 'server/w.ts': 'const k = process.env.ANTHROPIC_API_KEY;', '.env.example': 'ANTHROPIC_API_KEY=\n' }));
    expect(r.status, r.stderr).toBe(0);
  });
  test('fails on a key-shaped string in src, dist, public, index.html, server or .env.example', () => {
    for (const where of ['src/a.ts', 'dist/assets/x.js', 'public/b.txt', 'index.html', 'server/w.ts', '.env.example']) {
      const r = guard(tree({ [where]: `const x = "${FAKE}";` }));
      expect(r.status, where).toBe(1);
      expect(r.stderr, where).toContain('shaped like an API key');
    }
  });
  test('fails when client code or the build names the key variable or header', () => {
    for (const where of ['src/a.ts', 'dist/assets/x.js']) {
      const r = guard(tree({ [where]: 'const k = import.meta.env.ANTHROPIC_API_KEY;' }));
      expect(r.status, where).toBe(1);
      expect(r.stderr).toContain('mentions the API key variable');
    }
    expect(guard(tree({ 'src/a.ts': "headers: { 'x-api-key': k }" })).status).toBe(1);
  });
  test('the real repository is clean (src/, public/, index.html, server/, .env.example, and dist/ when it exists)', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-secrets.mjs')], { encoding: 'utf8', cwd: ROOT });
    expect(r.status, r.stderr).toBe(0);
  });
});
