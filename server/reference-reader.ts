// Server side of the reference reader (a model with vision that reads the look of reference images). Two providers; the browser never sees a key.
//
//   dev-cli  runs the Claude Code command line (headless: `claude -p`) on this computer, in an empty temporary folder that holds only the
//            images. It may use one tool, Read, and only to look at those images. Mounted by the Vite dev server only.
//   api      calls the Anthropic Messages API with a key read from the server's environment (ANTHROPIC_API_KEY). Off unless that exists.
//            The key is never logged, never put in a response, never in client code, never committed. Tests never call it.
//
// Both answer the same two routes (under /__reference for dev-cli, /api/reference for api):
//   GET  .../status  ->  { available: boolean, reason?: string }
//   POST .../read    ->  { prompt, images: [{ name, mime, base64 }] } in, { text, ms } out, or { error, kind }
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WriterFailure, apiStatus, cliStatus, findClaudeCli, killTree } from './carousel-writer';

export const READER_SYSTEM = 'You describe the visual style of reference images as strict JSON, using only the vocabulary you are given. You never write code, SVG or drawing instructions, and you never copy text, logos or faces from the images.';
const MAX_BODY = 40_000_000;
export const READER_CLI_TIMEOUT_MS = 420_000;
export const READER_API_TIMEOUT_MS = 180_000;

export interface ReaderImageIn {
  name: string;
  mime: string;
  base64: string;
}
export interface ReaderCallIn {
  prompt: string;
  images: ReaderImageIn[];
}

/** Checks the request and returns it with safe file names. */
export function readCall(raw: unknown): ReaderCallIn {
  const b = raw as { prompt?: unknown; images?: unknown };
  if (typeof b?.prompt !== 'string' || !b.prompt.trim()) throw new WriterFailure(400, 'failed', 'The request has no prompt.');
  const images = Array.isArray(b.images) ? b.images : [];
  if (images.length > 12) throw new WriterFailure(400, 'failed', 'At most 12 images can be read at once.');
  const out: ReaderImageIn[] = images.map((i: { name?: unknown; mime?: unknown; base64?: unknown }, n: number) => {
    if (typeof i?.base64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(i.base64)) throw new WriterFailure(400, 'failed', 'An image could not be read.');
    const mime = i.mime === 'image/png' ? 'image/png' : 'image/jpeg';
    const clean = String(i.name ?? `ref${n + 1}`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || `ref${n + 1}`;
    return { name: clean, mime, base64: i.base64 };
  });
  return { prompt: b.prompt, images: out };
}

/** Runs `claude -p` once in a folder holding only the images. `launcher` is a test seam. */
export function readWithCli(call: ReaderCallIn, signal: AbortSignal, env: NodeJS.ProcessEnv = process.env, timeoutMs = READER_CLI_TIMEOUT_MS, launcher?: { bin: string; args: string[] }): Promise<{ text: string; ms: number }> {
  const bin = launcher?.bin ?? findClaudeCli(env);
  if (!bin) return Promise.reject(new WriterFailure(503, 'unavailable', cliStatus(env).reason!));
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-reader-'));
    for (const i of call.images) fs.writeFileSync(path.join(cwd, i.name), Buffer.from(i.base64, 'base64'));
    const args = launcher?.args ?? ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', 'Read', '--allowedTools', 'Read', '--permission-mode', 'dontAsk', '--system-prompt', READER_SYSTEM];
    const child = spawn(bin, args, { cwd, env: { ...env, CLAUDE_CODE_ENTRYPOINT: 'reference-reader' }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
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
    child.stdin.end(call.prompt);
  });
}

/** One call to the Messages API with the images. The key comes from `env` only and appears in no message, log or response. */
export async function readWithApi(call: ReaderCallIn, signal: AbortSignal, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch, timeoutMs = READER_API_TIMEOUT_MS): Promise<{ text: string; ms: number }> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new WriterFailure(503, 'unavailable', 'No API key is set on the server, so the API reader is off.');
  const t0 = Date.now();
  const timeout = AbortSignal.timeout(timeoutMs);
  const both = AbortSignal.any([signal, timeout]);
  const content: unknown[] = [];
  for (const i of call.images) {
    content.push({ type: 'text', text: `The next image is ${i.name}.` });
    content.push({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.base64 } });
  }
  content.push({ type: 'text', text: call.prompt.replace('(look at each with your Read tool)', '(they are given above)') });
  let r: Response;
  try {
    r = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.CAROUSEL_MODEL || 'claude-sonnet-5-5', max_tokens: 8192, system: READER_SYSTEM, messages: [{ role: 'user', content }] }),
      signal: both,
    });
  } catch {
    if (signal.aborted) throw new WriterFailure(499, 'cancelled', 'Cancelled.');
    if (timeout.aborted) throw new WriterFailure(504, 'timeout', `The API did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    throw new WriterFailure(502, 'failed', 'The API could not be reached.');
  }
  if (!r.ok) {
    let msg = '';
    try {
      msg = ((await r.json()) as { error?: { message?: string } }).error?.message ?? '';
    } catch {
      /* no body */
    }
    throw new WriterFailure(502, 'failed', `The API refused the request (${r.status})${msg ? `: ${msg.replace(/sk-[A-Za-z0-9_-]+/g, '[key]').slice(0, 200)}` : '.'}`);
  }
  const j = (await r.json()) as { content?: { type: string; text?: string }[] };
  const text = (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  if (!text) throw new WriterFailure(502, 'failed', 'The API answered with no text.');
  return { text, ms: Date.now() - t0 };
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
      if (n > MAX_BODY) return reject(new WriterFailure(413, 'failed', 'That request is too large.'));
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

/** A Connect-style handler for one provider. */
export function referenceHandler(provider: 'dev-cli' | 'api', opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}) {
  const env = opts.env ?? process.env;
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && url === '/status') return send(res, 200, provider === 'dev-cli' ? cliStatus(env) : apiStatus(env));
    if (req.method === 'POST' && url === '/read') {
      const ctl = new AbortController();
      res.on('close', () => !res.writableEnded && ctl.abort());
      try {
        const call = readCall(JSON.parse(await readBody(req)));
        const r = provider === 'dev-cli' ? await readWithCli(call, ctl.signal, env) : await readWithApi(call, ctl.signal, env, opts.fetchImpl);
        return send(res, 200, r);
      } catch (e) {
        if (e instanceof WriterFailure) return send(res, e.status, { error: e.message, kind: e.kind });
        return send(res, 400, { error: 'The request could not be read.', kind: 'failed' });
      }
    }
    next();
  };
}
