// Round AE: the picture describer (dev only). POST /__picture/describe takes one or more pictures (the browser makes each at most 768 px on its long side) and answers one short caption
// per picture: 3 to 6 plain words, concrete nouns, no punctuation, no opinions. The caption goes into the picture's name box, so the existing name pipeline (the writer's `named "..."`, its
// "picture": N, the code's checks, the word match) can put the picture on the slide that talks about it. Built like the reference reader route:
//   - it answers only this computer and only the app's own page (refuseWrite), at most PICTURE_CAP model calls per run of the dev server (default 200; a retry counts as a call);
//   - Round AO: ONE model call per picture, at most DESCRIBE_PARALLEL at the same time. One answer for several pictures was read by position and a model now and then listed its
//     captions in another order (a silent swap: the leaf's caption on the temple); a call that sees one picture cannot give it another picture's caption;
//   - Claude Code runs with the writer's isolation flags, in an empty temporary folder that holds only the pictures, with an explicit system prompt, the Read tool only, and a cheap model
//     (CAPTION_MODEL, default haiku; when the command line refuses that model, the writer's model);
//   - the answer is checked (one caption, 1 to 8 words); an answer that fails is asked for once more, for that picture only; a caption still missing is left empty.
// One log line per call (time, call n/cap, pictures, result, seconds), never a caption, a prompt or a key. Tests use a stand-in program: ZERO real calls.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { ISOLATION_ARGS, WriterFailure, cliStatus, findClaudeCli, killTree, modelFor, refuseWrite } from './carousel-writer';

export const DESCRIBE_SYSTEM =
  'You write short plain captions for photos so a program can match each photo to the words of a slide. For each picture you write 3 to 6 plain lowercase words: the concrete things that are visible (objects, places, light, weather, time of day). Describe only what is visible. Never name a real person or guess who anyone is; say "person", "man", "woman" or "child" at most. Never read out or copy any text, sign, logo or caption that appears in a picture. No punctuation, no opinions, no adjectives like beautiful or stunning. You reply with a JSON array of strings and nothing else.';
export const DESCRIBE_MAX_IMAGES = 12;
export const DESCRIBE_MAX_BODY = 12_000_000;
export const DESCRIBE_TIMEOUT_MS = 120_000;
export const captionModel = (env: NodeJS.ProcessEnv) => env.CAPTION_MODEL || 'haiku';
/** Round AO: the describer's own call limit per run of the dev server (a picture is one call; the writer's limit, DEFAULT_CALL_CAP, is its own). */
export const DEFAULT_DESCRIBE_CAP = 200;
/** Round AO: at most this many pictures are described at the same time (one Claude Code each). */
export const DESCRIBE_PARALLEL = 4;

export interface DescribeImage { mime: 'image/jpeg' | 'image/png'; base64: string }
export function describeCall(raw: unknown): DescribeImage[] {
  const images = (raw as { images?: unknown })?.images;
  if (!Array.isArray(images) || !images.length) throw new WriterFailure(400, 'failed', 'The request has no pictures.');
  if (images.length > DESCRIBE_MAX_IMAGES) throw new WriterFailure(400, 'failed', `At most ${DESCRIBE_MAX_IMAGES} pictures can be described at once.`);
  return images.map((i: { mime?: unknown; base64?: unknown }) => {
    if (typeof i?.base64 !== 'string' || !i.base64 || !/^[A-Za-z0-9+/=]+$/.test(i.base64)) throw new WriterFailure(400, 'failed', 'A picture could not be read.');
    return { mime: i.mime === 'image/png' ? 'image/png' : 'image/jpeg', base64: i.base64 };
  });
}
const nameOf = (i: DescribeImage, k: number) => `pic${k + 1}.${i.mime === 'image/png' ? 'png' : 'jpg'}`;
export const describePrompt = (images: DescribeImage[]) =>
  images.length === 1
    ? `There is one picture in the current folder: ${nameOf(images[0], 0)}. Open it with your Read tool. Write ONE caption of 3 to 6 plain lowercase words naming the concrete things that are visible (for example "yellow car crossing a river" or "empty road between tall trees"). Describe only what is visible. Never name a real person or guess who someone is. Never read out text that appears in a picture. No punctuation, no opinions. Answer with ONLY a JSON array of 1 string, for example ["yellow car crossing a river"].`
    : `There are ${images.length} pictures in the current folder: ${images.map(nameOf).join(', ')}. Open each with your Read tool, in this order. For each picture write ONE caption of 3 to 6 plain lowercase words naming the concrete things that are visible (for example "yellow car crossing a river" or "empty road between tall trees"). Describe only what is visible. Never name a real person or guess who someone is. Never read out text that appears in a picture. No punctuation, no opinions. Answer with ONLY a JSON array of ${images.length} strings, in the order of the files, for example ["first caption", "second caption"].`;

/** One caption made plain: lowercase words and digits only, at most 8 words; '' when it has no word or more than 8. */
export function cleanCaption(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const words = raw.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/['-]/g, ' ').split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 8 ? words.join(' ') : '';
}
/** The model's answer read as captions: null when it is not an array of the right length; '' for an item that is not a usable caption. */
export function readCaptions(text: string, count: number): string[] | null {
  const m = /\[[\s\S]*\]/.exec(text);
  if (!m) return null;
  let arr: unknown;
  try {
    arr = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length !== count) return null;
  return arr.map(cleanCaption);
}

/** Runs `claude -p` once: the pictures in an empty temporary folder, the prompt on stdin, Read only, the writer's isolation flags. */
export function describeWithCli(images: DescribeImage[], model: string, signal: AbortSignal, env: NodeJS.ProcessEnv = process.env, timeoutMs = DESCRIBE_TIMEOUT_MS, launcher?: { bin: string; args: string[]; realArgs?: boolean }): Promise<{ text: string; ms: number }> {
  const bin = launcher?.bin ?? findClaudeCli(env);
  if (!bin) return Promise.reject(new WriterFailure(503, 'unavailable', cliStatus(env).reason!));
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'picture-describe-'));
    images.forEach((i, k) => fs.writeFileSync(path.join(cwd, nameOf(i, k)), Buffer.from(i.base64, 'base64')));
    const real = ['-p', '--output-format', 'json', '--no-session-persistence', ...ISOLATION_ARGS, '--tools', 'Read', '--allowedTools', 'Read', '--permission-mode', 'dontAsk', '--system-prompt', DESCRIBE_SYSTEM, '--model', model];
    const args = launcher ? (launcher.realArgs ? [...launcher.args, ...real] : launcher.args) : real;
    const child = spawn(bin, args, { cwd, env: { ...env, CLAUDE_CODE_ENTRYPOINT: 'picture-describe' }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      fs.rm(cwd, { recursive: true, force: true }, () => undefined);
      fn();
    };
    const onAbort = () => {
      killTree(child.pid);
      finish(() => reject(new WriterFailure(499, 'cancelled', 'Cancelled.')));
    };
    const timer = setTimeout(() => {
      killTree(child.pid);
      finish(() => reject(new WriterFailure(504, 'timeout', `Claude Code did not answer within ${Math.round(timeoutMs / 1000)} seconds.`)));
    }, timeoutMs);
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => finish(() => reject(new WriterFailure(503, 'unavailable', `Claude Code could not be started: ${e.message}`))));
    child.on('close', (code) =>
      finish(() => {
        let parsed: { result?: unknown; is_error?: boolean } | null = null;
        try {
          parsed = JSON.parse(out);
        } catch {
          /* not JSON */
        }
        if (code !== 0 || !parsed || parsed.is_error || typeof parsed.result !== 'string') {
          const detail = (typeof parsed?.result === 'string' ? parsed.result : err || out).trim().split('\n')[0].slice(0, 300);
          return reject(new WriterFailure(502, 'failed', `Claude Code did not return an answer${code ? ` (exit code ${code})` : ''}${detail ? `: ${detail}` : '.'}`));
        }
        resolve({ text: parsed.result, ms: Date.now() - t0 });
      }),
    );
    child.stdin.on('error', () => undefined);
    child.stdin.end(describePrompt(images));
  });
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
};
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let n = 0;
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      n += c.length;
      if (n > DESCRIBE_MAX_BODY) return reject(new WriterFailure(413, 'failed', 'That request is too large.'));
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}
/** A model the command line does not accept: its error names the model. */
const modelRefused = (e: unknown) => e instanceof WriterFailure && e.status === 502 && /model/i.test(e.message);

/** A Connect-style handler (dev-cli only). `log` and `launcher` (a stand-in program) are test seams. */
export function describeHandler(opts: { env?: NodeJS.ProcessEnv; log?: (line: string) => void; launcher?: { bin: string; args: string[]; realArgs?: boolean } } = {}) {
  const env = opts.env ?? process.env;
  const log = opts.log ?? ((line: string) => console.log(line));
  const capIn = Number.parseInt(env.PICTURE_CAP ?? '', 10);
  const cap = Number.isFinite(capIn) && capIn >= 0 ? capIn : DEFAULT_DESCRIBE_CAP;
  let calls = 0;
  let model = captionModel(env);
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && url === '/status') return send(res, 200, cliStatus(env));
    if (req.method !== 'POST' || url !== '/describe') return next();
    const refused = refuseWrite(req, 'Picture description');
    if (refused) {
      req.resume();
      log(`[describe] ${new Date().toISOString()} refused a request: ${refused}`);
      return send(res, 403, { error: refused, kind: 'unavailable' });
    }
    const ctl = new AbortController();
    res.on('close', () => !res.writableEnded && ctl.abort());
    try {
      const images = describeCall(JSON.parse(await readBody(req)));
      const t0 = Date.now();
      const captions: string[] = images.map(() => '');
      let made = 0;
      let capped = false;
      let failure: unknown = null;
      // one picture: at most two answers (the first, and one more when it is not one usable caption); a model the command line refuses is replaced by the writer's model
      const one = async (k: number) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (calls >= cap) { capped = true; return; }
          const n = ++calls;
          made++;
          const c0 = Date.now();
          let text = '';
          const used = model;
          try {
            text = (await describeWithCli([images[k]], used, ctl.signal, env, undefined, opts.launcher)).text;
          } catch (e) {
            const fallback = modelFor('write', env);
            if (modelRefused(e) && used !== fallback) {
              // (the first picture told so switches the model; one that ran at the same time just asks again with it)
              if (model === used) {
                log(`[describe] ${new Date().toISOString()} call ${n}/${cap} model "${used}" refused, using "${fallback}"`);
                model = fallback;
              }
              continue;
            }
            log(`[describe] ${new Date().toISOString()} call ${n}/${cap} picture ${k + 1} of ${images.length} failed ${((Date.now() - c0) / 1000).toFixed(1)} s`);
            throw e;
          }
          const got = readCaptions(text, 1);
          const ok = !!got?.[0];
          if (ok) captions[k] = got![0];
          log(`[describe] ${new Date().toISOString()} call ${n}/${cap} picture ${k + 1} of ${images.length} ${ok ? 'ok' : 'unusable answer'} ${((Date.now() - c0) / 1000).toFixed(1)} s`);
          if (ok) return;
        }
      };
      // DESCRIBE_PARALLEL at the same time; each caption goes to its own picture whatever order the calls finish in
      let nextPic = 0;
      const worker = async () => {
        while (nextPic < images.length && !ctl.signal.aborted && !capped) {
          const k = nextPic++;
          try {
            await one(k);
          } catch (e) {
            failure ??= e;
            if (e instanceof WriterFailure && (e.kind === 'cancelled' || e.kind === 'unavailable')) return;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(DESCRIBE_PARALLEL, images.length) }, worker));
      if (ctl.signal.aborted) throw new WriterFailure(499, 'cancelled', 'Cancelled.');
      if (!made && capped) throw new WriterFailure(429, 'unavailable', `Picture description has made ${cap} calls since the dev server started, the most for one run (PICTURE_CAP). Restart the dev server to describe again.`);
      // a failure keeps the captions already made; with none at all, the request fails as before
      if (failure && captions.every((c) => !c)) throw failure;
      return send(res, 200, { captions, calls: made, ms: Date.now() - t0 });
    } catch (e) {
      if (e instanceof WriterFailure) return send(res, e.status, { error: e.message, kind: e.kind });
      return send(res, 400, { error: 'The request could not be read.', kind: 'failed' });
    }
  };
}
