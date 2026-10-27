// The server side of the reference reader, without any model: request checking, the command-line provider with a stand-in program (it proves
// the images are written to an empty temporary folder and only there), and the API provider with a fake fetch (it proves the key goes only
// in the request header, is never echoed, and that nothing is sent without a key). Nothing here reaches the network.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import { readCall, readWithApi, readWithCli, referenceHandler } from '../../server/reference-reader';
import { apiStatus } from '../../server/carousel-writer';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64').toString('base64');
const call = { prompt: 'Read these.', images: [{ name: 'ref1.jpg', mime: 'image/jpeg', base64: PNG }, { name: '../../evil name.png', mime: 'image/png', base64: PNG }] };

test('the request is checked: a prompt is needed, at most 12 images, only real base64, and file names are made safe', () => {
  expect(() => readCall({ prompt: '' })).toThrow(/no prompt/);
  expect(() => readCall({ prompt: 'x', images: Array.from({ length: 13 }, () => ({ base64: PNG })) })).toThrow(/At most 12/);
  expect(() => readCall({ prompt: 'x', images: [{ base64: 'not base64 !!' }] })).toThrow(/could not be read/);
  const c = readCall(call);
  expect(c.images.map((i) => i.name)).toEqual(['ref1.jpg', '.._.._evil_name.png']);
  expect(c.images.every((i) => /^[A-Za-z0-9._-]+$/.test(i.name))).toBe(true);
});

test('the command-line provider runs in a temporary folder that holds only the images, sends the prompt on stdin, and cleans up', async () => {
  const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('reference-reader-')).length;
  // A stand-in for `claude -p`: it lists the files in its folder and echoes the prompt it was given.
  const script = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const fs=require('fs');console.log(JSON.stringify({result:JSON.stringify({files:fs.readdirSync('.').sort(),prompt:s,cwdIsTemp:process.cwd().includes('reference-reader-')})}))})";
  const r = await readWithCli(readCall(call), new AbortController().signal, { PATH: process.env.PATH ?? '' }, 30_000, { bin: process.execPath, args: ['-e', script] });
  const seen = JSON.parse(r.text) as { files: string[]; prompt: string; cwdIsTemp: boolean };
  expect(seen.files).toEqual(['.._.._evil_name.png', 'ref1.jpg']);
  expect(seen.prompt).toBe('Read these.');
  expect(seen.cwdIsTemp).toBe(true);
  await expect.poll(() => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('reference-reader-')).length).toBe(before);
});

test('the command-line provider: a failing program gives a plain message, and cancelling stops it', async () => {
  await expect(readWithCli(readCall(call), new AbortController().signal, {}, 30_000, { bin: process.execPath, args: ['-e', "console.log(JSON.stringify({is_error:true,result:'Not logged in'}))"] })).rejects.toMatchObject({ kind: 'failed' });
  const ctl = new AbortController();
  const p = readWithCli(readCall(call), ctl.signal, {}, 30_000, { bin: process.execPath, args: ['-e', 'setTimeout(()=>{},20000)'] });
  setTimeout(() => ctl.abort(), 300);
  await expect(p).rejects.toMatchObject({ kind: 'cancelled' });
});

test('the API provider: no key, no call; with a key it goes only in the request header; an error never echoes it', async () => {
  let calls = 0;
  const never: typeof fetch = async () => {
    calls++;
    return new Response('{}');
  };
  await expect(readWithApi(readCall(call), new AbortController().signal, {}, never)).rejects.toMatchObject({ kind: 'unavailable' });
  expect(calls).toBe(0);
  expect(apiStatus({})).toEqual({ available: false, reason: expect.any(String) });
  expect(apiStatus({ ANTHROPIC_API_KEY: 'sk-test-secret-key-123' })).toEqual({ available: true });

  const KEY = 'sk-test-secret-key-123';
  let seen: { url: string; headers: Record<string, string>; body: string } | null = null;
  const ok: typeof fetch = async (url, init) => {
    seen = { url: String(url), headers: init!.headers as Record<string, string>, body: String(init!.body) };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"style":{}}' }] }));
  };
  const r = await readWithApi(readCall(call), new AbortController().signal, { ANTHROPIC_API_KEY: KEY }, ok);
  expect(r.text).toBe('{"style":{}}');
  expect(seen!.url).toBe('https://api.anthropic.com/v1/messages');
  expect(seen!.headers['x-api-key']).toBe(KEY);
  expect(seen!.body).not.toContain(KEY);
  const body = JSON.parse(seen!.body) as { messages: { content: { type: string; source?: { media_type: string } }[] }[] };
  expect(body.messages[0].content.filter((c) => c.type === 'image')).toHaveLength(2);
  const bad: typeof fetch = async () => new Response(JSON.stringify({ error: { message: `invalid x-api-key ${KEY}` } }), { status: 401 });
  await expect(readWithApi(readCall(call), new AbortController().signal, { ANTHROPIC_API_KEY: KEY }, bad)).rejects.toThrow(/\[key\]/);
  await expect(readWithApi(readCall(call), new AbortController().signal, { ANTHROPIC_API_KEY: KEY }, bad)).rejects.not.toThrow(new RegExp(KEY));
});

test('the HTTP routes: status says whether each provider is available, and a bad request gets a plain error', async () => {
  const run = async (provider: 'dev-cli' | 'api', env: NodeJS.ProcessEnv, method: string, url: string, body?: string) => {
    const handler = referenceHandler(provider, { env });
    let status = 0;
    let out = '';
    const headers: Record<string, string> = {};
    const res = { statusCode: 200, setHeader: (k: string, v: string) => (headers[k] = v), end: (s: string) => (out = s), on: () => undefined, writableEnded: false } as never;
    const chunks = body ? [Buffer.from(body)] : [];
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    const req = { method, url, on: (e: string, f: (...a: unknown[]) => void) => { (listeners[e] ??= []).push(f); if (e === 'end') setTimeout(() => { chunks.forEach((c) => listeners.data?.forEach((d) => d(c))); f(); }, 0); } } as never;
    await handler(req, res, () => (out = 'NEXT'));
    status = (res as unknown as { statusCode: number }).statusCode;
    return { status, out };
  };
  const off = await run('api', {}, 'GET', '/status');
  expect(JSON.parse(off.out).available).toBe(false);
  const on = await run('api', { ANTHROPIC_API_KEY: 'k' }, 'GET', '/status');
  expect(JSON.parse(on.out).available).toBe(true);
  const noPrompt = await run('api', { ANTHROPIC_API_KEY: 'k' }, 'POST', '/read', JSON.stringify({ images: [] }));
  expect(noPrompt.status).toBe(400);
  expect(JSON.parse(noPrompt.out).error).toMatch(/no prompt/);
  const unknown = await run('api', {}, 'GET', '/nothing');
  expect(unknown.out).toBe('NEXT');
});
