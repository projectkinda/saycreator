// Round AE part 1: the picture describer route (dev only). Built like the reference reader: the localhost/Origin guard, PICTURE_CAP calls per run (Round AO: default 200, its own), a body
// limit, a timeout, the writer's isolation flags, an empty temporary folder holding only the picture, an explicit system prompt, a cheap model (CAPTION_MODEL, default haiku). Round AO: ONE
// call per picture, at most 4 at the same time, each caption to its own picture whatever order the calls finish in. One caption, checked (1 to 8 words), asked for once more when unusable
// (that picture only), left empty after that. Run with a stand-in program in place of Claude Code: ZERO real calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ISOLATION_ARGS } from '../../server/carousel-writer';
import { DEFAULT_DESCRIBE_CAP, DESCRIBE_MAX_BODY, DESCRIBE_PARALLEL, DESCRIBE_SYSTEM, DESCRIBE_TIMEOUT_MS, cleanCaption, describeHandler, readCaptions } from '../../server/picture-describe';

/** A picture whose bytes name it ("A", "B" ...): the stand-in reads its one picture and answers for THAT picture. */
const pic = (name: string) => ({ mime: 'image/jpeg', base64: Buffer.from(`PIC-${name}`).toString('base64') });
/** What the stand-in answers for a picture: its answers in turn (a JSON string, or "!model" to fail as an unknown model would), and how long it takes (ms). */
type Script = Record<string, { answers: string[]; delay?: number }>;
/**
 * Round AO: a stand-in for Claude Code that answers by the picture it was given (several run at the same time, so answers cannot be handed out in run order). It records each run (argv,
 * folder, files, stdin, the picture, when it started and ended).
 */
function standIn(script: Script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-'));
  const runs = path.join(dir, 'runs.jsonl');
  const file = path.join(dir, 'fake-claude.cjs');
  fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify(script));
  fs.writeFileSync(file, `const fs=require('fs'),p=require('path');let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const runs=${JSON.stringify(runs)};const files=fs.readdirSync(process.cwd());const name=files.length===1?fs.readFileSync(p.join(process.cwd(),files[0]),'utf8').replace(/^PIC-/,''):'?';const prior=fs.existsSync(runs)?fs.readFileSync(runs,'utf8').split('\\n').filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.name===name&&r.phase==='start').length:0;const start=Date.now();fs.appendFileSync(runs,JSON.stringify({phase:'start',name,argv:process.argv.slice(2),cwd:process.cwd(),files,stdin:s,at:start})+'\\n');const sc=JSON.parse(fs.readFileSync(p.join(${JSON.stringify(dir)},'script.json'),'utf8'))[name]||{answers:[]};const a=sc.answers[prior]??'[]';setTimeout(()=>{fs.appendFileSync(runs,JSON.stringify({phase:'end',name,at:Date.now()})+'\\n');if(a==='!model'){process.stdout.write(JSON.stringify({is_error:true,result:'There is an issue with the selected model (qwerty). It may not exist.'}));process.exit(1)}process.stdout.write(JSON.stringify({is_error:false,result:a}))},sc.delay||0)})`);
  type Run = { phase: 'start' | 'end'; name: string; argv: string[]; cwd: string; files: string[]; stdin: string; at: number };
  const all = () => (fs.existsSync(runs) ? fs.readFileSync(runs, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []) as Run[];
  const read = () => all().filter((r) => r.phase === 'start');
  /** The most runs that were going at the same moment. */
  const overlap = () => {
    let cur = 0, max = 0;
    for (const r of all().sort((a, b) => a.at - b.at || (a.phase === 'end' ? -1 : 1))) { cur += r.phase === 'start' ? 1 : -1; max = Math.max(max, cur); }
    return max;
  };
  return { launcher: { bin: process.execPath, args: [file], realArgs: true }, read, all, overlap, dir };
}
async function serve(env: NodeJS.ProcessEnv, script: Script) {
  const s = standIn(script);
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
  const pics = (...names: string[]) => JSON.stringify({ images: names.map(pic) });
  /** A request the client gives up on after `ms`. */
  const postAndDrop = (body: string, ms: number) => new Promise<void>((resolve) => {
    const rq = http.request({ host: '127.0.0.1', port, path: '/describe', method: 'POST', headers: { 'content-type': 'text/plain', host: `localhost:${port}` } });
    rq.on('error', () => resolve());
    rq.end(body);
    setTimeout(() => { rq.destroy(); resolve(); }, ms);
  });
  return { port, lines, post, postAndDrop, pics, runs: s.read, all: s.all, overlap: s.overlap, close: () => new Promise<void>((r) => server.close(() => { fs.rmSync(s.dir, { recursive: true, force: true }); r(); })) };
}

test('the captions: one per picture, plain words, 1 to 8 words; the command line gets the isolation flags, Read only, the system prompt and the cheap model, in an empty folder with only the pictures', async () => {
  const s = await serve({}, { A: { answers: [JSON.stringify(['Yellow car, crossing a river!'])] }, B: { answers: [JSON.stringify(['empty road between tall trees'])] } });
  try {
    const r = await s.post({}, s.pics('A', 'B'));
    expect(r.status).toBe(200);
    // Round AO: one call per picture
    expect(r.body).toMatchObject({ captions: ['yellow car crossing a river', 'empty road between tall trees'], calls: 2 });
    expect(s.runs()).toHaveLength(2);
    const run = s.runs().find((x) => x.name === 'A')!;
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
    // each call's folder holds its one picture only
    for (const x of s.runs()) expect(x.files).toEqual(['pic1.jpg']);
    expect(run.stdin).toMatch(/^There is one picture in the current folder: pic1\.jpg\./);
    expect(run.stdin).toMatch(/JSON array of 1 string/);
    // the prompt and the system prompt say: only what is visible, never who a real person is, never the text in a picture
    expect(run.stdin).toMatch(/Describe only what is visible/);
    expect(run.stdin).toMatch(/Never name a real person or guess who someone is/);
    expect(run.stdin).toMatch(/Never read out text that appears in a picture/);
    expect(DESCRIBE_SYSTEM).toMatch(/Never name a real person/);
    expect(DESCRIBE_SYSTEM).toMatch(/Never read out or copy any text/);
    for (const x of s.runs()) await expect.poll(() => fs.existsSync(x.cwd), { message: 'the temporary folder is removed' }).toBe(false);
    // one log line per call, holding no caption and no prompt
    expect(s.lines).toHaveLength(2);
    for (const l of s.lines) expect(l).toMatch(/^\[describe\] \S+ call [12]\/200 picture [12] of 2 ok \d+\.\d s$/);
  } finally {
    await s.close();
  }
  expect(DESCRIBE_TIMEOUT_MS).toBe(120_000);
  expect(DESCRIBE_MAX_BODY).toBeGreaterThan(0);
});

test('an unusable answer is asked for once more, for that picture only; still unusable, that caption is left empty; CAPTION_MODEL picks the model and a refused model falls back to the writer model', async () => {
  // both pictures start with the refused model (they run at the same time): each asks again with the writer's model
  const s = await serve({ CAPTION_MODEL: 'qwerty' }, { A: { answers: ['!model', '["a b c"]'] }, B: { answers: ['!model', '["d e f"]'] } });
  try {
    const r = await s.post({}, s.pics('A', 'B'));
    expect(r.status).toBe(200);
    expect(r.body.captions).toEqual(['a b c', 'd e f']);
    const model = (name: string) => s.runs().filter((x) => x.name === name).map((x) => x.argv[x.argv.indexOf('--model') + 1]);
    expect(model('A')).toEqual(['qwerty', 'haiku']);
    expect(model('B')).toEqual(['qwerty', 'haiku']);
    expect(s.lines.filter((l) => /refused/.test(l)), 'the switch is logged once').toHaveLength(1);
  } finally {
    await s.close();
  }
  // A: two captions for one picture (unusable), then a good one; B: 12 words twice: left empty; C: right the first time (no second call)
  const t = await serve({}, { A: { answers: ['["only one", "two"]', '["one two three"]'] }, B: { answers: ['["w w w w w w w w w w w w"]', '["w w w w w w w w w w w w"]'] }, C: { answers: ['["a red door"]'] } });
  try {
    const r = await t.post({}, t.pics('A', 'B', 'C'));
    expect(r.body).toEqual(expect.objectContaining({ captions: ['one two three', '', 'a red door'], calls: 5 }));
    const by = (name: string) => t.runs().filter((x) => x.name === name).length;
    expect([by('A'), by('B'), by('C')], 'a retry only for the picture whose answer was unusable').toEqual([2, 2, 1]);
    expect(t.lines.filter((l) => / picture 2 of 3 /.test(l)).map((l) => / (ok|unusable answer) /.exec(l)?.[1])).toEqual(['unusable answer', 'unusable answer']);
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
  const s = await serve({ PICTURE_CAP: '1' }, { CAT: { answers: [JSON.stringify(['a cat'])] }, DOG: { answers: [JSON.stringify(['a dog'])] } });
  try {
    for (const h of [{ origin: 'https://evil.example' }, { host: 'evil.example' }, { 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
      const r = await s.post(h, s.pics('CAT'));
      expect(r.status, JSON.stringify(h)).toBe(403);
      expect(r.body.error).toMatch(/^Picture description only answers/);
    }
    expect((await s.post({}, JSON.stringify({ images: [] }))).status).toBe(400);
    expect((await s.post({}, JSON.stringify({ images: Array.from({ length: 13 }, () => pic('X')) }))).status).toBe(400);
    expect((await s.post({}, JSON.stringify({ images: [{ base64: 'not base64!' }] }))).status).toBe(400);
    expect(s.runs()).toHaveLength(0);
    expect((await s.post({ origin: `http://localhost:${s.port}` }, s.pics('CAT'))).body.captions).toEqual(['a cat']);
    const over = await s.post({}, s.pics('DOG'));
    expect(over.status).toBe(429);
    expect(over.body.error).toMatch(/made 1 calls since the dev server started.*Restart the dev server to describe again/);
    expect(s.runs()).toHaveLength(1);
  } finally {
    await s.close();
  }
});

test('Round AO: five pictures are five calls, at most 4 at the same time; each caption goes to its own picture whatever order the calls finish in', async () => {
  // the first picture is the slowest, the last the quickest: the calls finish out of order
  const names = ['TEMPLE', 'LEAF', 'HOTEL', 'PATH', 'FACE'];
  const script: Script = Object.fromEntries(names.map((n, k) => [n, { answers: [JSON.stringify([`caption of ${n.toLowerCase()}`])], delay: 600 - k * 120 }]));
  const s = await serve({}, script);
  try {
    const r = await s.post({}, s.pics(...names));
    expect(r.status).toBe(200);
    expect(r.body.captions).toEqual(names.map((n) => `caption of ${n.toLowerCase()}`));
    expect(r.body.calls).toBe(5);
    expect(s.runs()).toHaveLength(5);
    expect(s.overlap(), 'at most DESCRIBE_PARALLEL at once').toBeLessThanOrEqual(DESCRIBE_PARALLEL);
    expect(s.overlap(), 'they do run side by side').toBeGreaterThanOrEqual(2);
    expect(DESCRIBE_PARALLEL).toBe(4);
    const ends = s.all().filter((x) => x.phase === 'end').map((x) => x.name);
    expect(ends.indexOf('TEMPLE'), 'the first picture finished after a later one').toBeGreaterThan(ends.indexOf('LEAF'));
  } finally {
    await s.close();
  }
});

test('Round AO: the cap counts calls (its own default, 200); reached partway, the captions already made are kept; a picture with no usable answer keeps the others', async () => {
  expect(DEFAULT_DESCRIBE_CAP).toBe(200);
  const s = await serve({ PICTURE_CAP: '2' }, { A: { answers: ['["a one"]'], delay: 50 }, B: { answers: ['["b two"]'], delay: 50 }, C: { answers: ['["c three"]'] } });
  try {
    const r = await s.post({}, s.pics('A', 'B', 'C'));
    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.objectContaining({ captions: ['a one', 'b two', ''], calls: 2 }));
    expect(s.runs()).toHaveLength(2);
    const over = await s.post({}, s.pics('C'));
    expect(over.status).toBe(429);
  } finally {
    await s.close();
  }
  // B never gives a usable answer: A and C keep their captions
  const t = await serve({}, { A: { answers: ['["a one"]'] }, B: { answers: ['NOT JSON AT ALL'] }, C: { answers: ['["c three"]'] } });
  try {
    const r = await t.post({}, t.pics('A', 'B', 'C'));
    expect(r.status).toBe(200);
    expect(r.body.captions).toEqual(['a one', '', 'c three']);
  } finally {
    await t.close();
  }
});

test('Round AO: when the request is dropped, every running call is stopped and no new one starts', async () => {
  const s = await serve({}, Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map((n) => [n, { answers: [`["${n.toLowerCase()} caption"]`], delay: 4000 }])));
  try {
    await s.postAndDrop(s.pics('A', 'B', 'C', 'D', 'E', 'F'), 600);
    await new Promise((r) => setTimeout(r, 1500));
    expect(s.runs().length, 'only the first four started').toBeLessThanOrEqual(4);
    await new Promise((r) => setTimeout(r, 4000));
    expect(s.all().filter((x) => x.phase === 'end'), 'none ran to the end').toHaveLength(0);
    expect(s.runs().length, 'and none started after').toBeLessThanOrEqual(4);
  } finally {
    await s.close();
  }
});

test('a caption longer than the 40-character name box keeps whole words and never ends on a linking word', async () => {
  const { fitName } = await import('../../src/carousel/pictureCaptions');
  expect(fitName('person walking near reflective water at sunset')).toBe('person walking near reflective water');
  expect(fitName('dry maple leaf on dark wood')).toBe('dry maple leaf on dark wood');
  expect(fitName('boats in sea cave with cliffs and the open sea beyond')).toBe('boats in sea cave with cliffs');
  expect(fitName('')).toBe('');
});
