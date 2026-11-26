// Round AE part 1: the picture describer route (dev only). Built like the reference reader: the localhost/Origin guard, PICTURE_CAP calls per run (default 50), a body limit, a timeout, the
// writer's isolation flags, an empty temporary folder holding only the pictures, an explicit system prompt, a cheap model (CAPTION_MODEL, default haiku). One caption per picture, checked
// (1 to 8 words), asked for once more when unusable, left empty after that. Run with a stand-in program in place of Claude Code: ZERO real calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ISOLATION_ARGS } from '../../server/carousel-writer';
import { DESCRIBE_MAX_BODY, DESCRIBE_SYSTEM, DESCRIBE_TIMEOUT_MS, cleanCaption, describeHandler, readCaptions } from '../../server/picture-describe';

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');
/** A stand-in for Claude Code: it records each run (argv, folder, files, stdin) and answers the next of `answers` (a JSON string, or "!model" to fail as an unknown model would). */
function standIn(answers: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-'));
  const runs = path.join(dir, 'runs.jsonl');
  const file = path.join(dir, 'fake-claude.cjs');
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify(answers));
  fs.writeFileSync(file, `const fs=require('fs'),p=require('path');let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const runs=${JSON.stringify(runs)};const n=fs.existsSync(runs)?fs.readFileSync(runs,'utf8').split('\\n').filter(Boolean).length:0;fs.appendFileSync(runs,JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd(),files:fs.readdirSync(process.cwd()),stdin:s})+'\\n');const a=JSON.parse(fs.readFileSync(p.join(${JSON.stringify(dir)},'answers.json'),'utf8'))[n]??'[]';if(a==='!model'){process.stdout.write(JSON.stringify({is_error:true,result:'There is an issue with the selected model (qwerty). It may not exist.'}));process.exit(1)}process.stdout.write(JSON.stringify({is_error:false,result:a}))})`);
  const read = () => (fs.existsSync(runs) ? fs.readFileSync(runs, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []) as { argv: string[]; cwd: string; files: string[]; stdin: string }[];
  return { launcher: { bin: process.execPath, args: [file], realArgs: true }, read, dir };
}
async function serve(env: NodeJS.ProcessEnv, answers: string[]) {
  const s = standIn(answers);
  const lines: string[] = [];
  const h = describeHandler({ env, log: (l) => lines.push(l), launcher: s.launcher });
  const server = http.createServer((req, res) => h(req, res, () => { res.statusCode = 404; res.end('{}'); }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const post = (headers: Record<string, string>, body: string) =>
    new Promise<{ status: number; body: { captions?: string[]; calls?: number; error?: string; kind?: string } }>((resolve, reject) => {
      const rq = http.request({ host: '127.0.0.1', port, path: '/describe', method: 'POST', headers: { 'content-type': 'text/plain', host: `localhost:${port}`, ...headers } }, (rs) => {
        let t = '';
        rs.on('data', (d) => (t += d));
        rs.on('end', () => resolve({ status: rs.statusCode ?? 0, body: JSON.parse(t) }));
      });
      rq.on('error', reject);
      rq.end(body);
    });
  const pics = (n: number) => JSON.stringify({ images: Array.from({ length: n }, () => ({ mime: 'image/jpeg', base64: JPG })) });
  return { port, lines, post, pics, runs: s.read, close: () => new Promise<void>((r) => server.close(() => { fs.rmSync(s.dir, { recursive: true, force: true }); r(); })) };
}

test('the captions: one per picture, plain words, 1 to 8 words; the command line gets the isolation flags, Read only, the system prompt and the cheap model, in an empty folder with only the pictures', async () => {
  const s = await serve({}, [JSON.stringify(['Yellow car, crossing a river!', 'empty road between tall trees'])]);
  try {
    const r = await s.post({}, s.pics(2));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ captions: ['yellow car crossing a river', 'empty road between tall trees'], calls: 1 });
    const [run] = s.runs();
    for (let k = 0; k < ISOLATION_ARGS.length; k++) expect(run.argv).toContain(ISOLATION_ARGS[k]);
    const val = (f: string) => run.argv[run.argv.indexOf(f) + 1];
    expect(val('--model')).toBe('haiku');
    expect(val('--tools')).toBe('Read');
    expect(val('--allowedTools')).toBe('Read');
    expect(val('--permission-mode')).toBe('dontAsk');
    expect(val('--system-prompt')).toBe(DESCRIBE_SYSTEM);
    expect(run.argv).not.toContain('--bare');
    expect(run.argv).not.toContain('--max-turns');
    expect(path.basename(run.cwd)).toMatch(/^picture-describe-/);
    expect(run.files.sort()).toEqual(['pic1.jpg', 'pic2.jpg']);
    // the prompt and the system prompt say: only what is visible, never who a real person is, never the text in a picture
    expect(run.stdin).toMatch(/Describe only what is visible/);
    expect(run.stdin).toMatch(/Never name a real person or guess who someone is/);
    expect(run.stdin).toMatch(/Never read out text that appears in a picture/);
    expect(DESCRIBE_SYSTEM).toMatch(/Never name a real person/);
    expect(DESCRIBE_SYSTEM).toMatch(/Never read out or copy any text/);
    await expect.poll(() => fs.existsSync(run.cwd), { message: 'the temporary folder is removed' }).toBe(false);
    // the log line holds no caption and no prompt
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatch(/^\[describe\] \S+ call 1\/50 2 pictures ok \d+\.\d s$/);
  } finally {
    await s.close();
  }
  expect(DESCRIBE_TIMEOUT_MS).toBe(120_000);
  expect(DESCRIBE_MAX_BODY).toBeGreaterThan(0);
});

test('an unusable answer is asked for once more; still unusable, that caption is left empty; CAPTION_MODEL picks the model and a refused model falls back to the writer model', async () => {
  // the first answer has the wrong length, the second has one caption of 12 words: that one is empty, the other kept
  const s = await serve({ CAPTION_MODEL: 'qwerty' }, ['!model', JSON.stringify(['a b c', 'd e f']), 'nothing']);
  try {
    const r = await s.post({}, s.pics(2));
    expect(r.status).toBe(200);
    expect(r.body.captions).toEqual(['a b c', 'd e f']);
    const runs = s.runs();
    expect(runs.map((x) => x.argv[x.argv.indexOf('--model') + 1])).toEqual(['qwerty', 'haiku']);
  } finally {
    await s.close();
  }
  const t = await serve({}, ['["only one"]', JSON.stringify(['one two three', 'w w w w w w w w w w w w'])]);
  try {
    const r = await t.post({}, t.pics(2));
    expect(r.body).toEqual(expect.objectContaining({ captions: ['one two three', ''], calls: 2 }));
    expect(t.lines.map((l) => / (ok|unusable answer) /.exec(l)?.[1])).toEqual(['unusable answer', 'unusable answer']);
  } finally {
    await t.close();
  }
  expect(cleanCaption('Sunset, over the sea.')).toBe('sunset over the sea');
  expect(cleanCaption('')).toBe('');
  expect(cleanCaption(7)).toBe('');
  expect(readCaptions('Here you go: ["a", "b"]', 2)).toEqual(['a', 'b']);
  expect(readCaptions('["a"]', 2)).toBeNull();
  expect(readCaptions('no json', 1)).toBeNull();
});

test('the guard, the cap and the request checks: another web page is refused before anything runs; PICTURE_CAP stops the calls with a plain message; a bad request runs nothing', async () => {
  const s = await serve({ PICTURE_CAP: '1' }, [JSON.stringify(['a cat']), JSON.stringify(['a dog'])]);
  try {
    for (const h of [{ origin: 'https://evil.example' }, { host: 'evil.example' }, { 'sec-fetch-site': 'cross-site' }]) {
      const r = await s.post(h, s.pics(1));
      expect(r.status, JSON.stringify(h)).toBe(403);
      expect(r.body.error).toMatch(/^Picture description only answers/);
    }
    expect((await s.post({}, JSON.stringify({ images: [] }))).status).toBe(400);
    expect((await s.post({}, JSON.stringify({ images: Array.from({ length: 13 }, () => ({ mime: 'image/jpeg', base64: JPG })) }))).status).toBe(400);
    expect((await s.post({}, JSON.stringify({ images: [{ base64: 'not base64!' }] }))).status).toBe(400);
    expect(s.runs()).toHaveLength(0);
    expect((await s.post({ origin: `http://localhost:${s.port}` }, s.pics(1))).body.captions).toEqual(['a cat']);
    const over = await s.post({}, s.pics(1));
    expect(over.status).toBe(429);
    expect(over.body.error).toMatch(/made 1 calls since the dev server started.*Restart the dev server to describe again/);
    expect(s.runs()).toHaveLength(1);
  } finally {
    await s.close();
  }
});
