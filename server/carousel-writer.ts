// Server side of the one-shot carousel writer. Two providers; the browser never sees a key.
//
//   dev-cli  runs the Claude Code command line (headless: `claude -p`) on this computer. Mounted only by the Vite dev server,
//            so it does not exist in a production build.
//   api      calls the Anthropic Messages API with a key read from the server's environment (ANTHROPIC_API_KEY). Off unless
//            that variable exists. The key is never logged, never put in a response, never in client code, never committed.
//
// Both answer the same two routes (under /__carousel for dev-cli, /api/carousel for api):
//   GET  .../status  ->  { available: boolean, reason?: string }
//   POST .../write   ->  { prompt } in, { text, ms } out, or { error, kind } with a plain-words message
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const SYSTEM_PROMPT = 'You write short social-media copy (carousel scripts, thumbnail titles) as strict JSON. You never add commentary. You never invent facts, statistics, names or quotes that are not in the text you are given.';
const MAX_BODY = 80_000;
export const CLI_TIMEOUT_MS = 240_000;
export const API_TIMEOUT_MS = 120_000;

export class WriterFailure extends Error {
  constructor(public status: number, public kind: 'unavailable' | 'failed' | 'timeout' | 'cancelled', message: string) {
    super(message);
  }
}

// ---------- finding the Claude Code command line ----------

/** CLAUDE_BIN, else `claude` on the PATH, else the copy inside the Claude desktop app (newest version), else null. */
export function findClaudeCli(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string | null {
  const given = env.CLAUDE_BIN;
  if (given) return fs.existsSync(given) ? given : null;
  const names = platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  for (const dir of (env.PATH ?? env.Path ?? '').split(path.delimiter)) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (dir && fs.existsSync(p)) return p;
    }
  }
  const roots: string[] = [];
  if (platform === 'win32' && env.APPDATA) roots.push(path.join(env.APPDATA, 'Claude', 'claude-code'));
  if (platform === 'darwin') roots.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code'));
  for (const root of roots) {
    try {
      const versions = fs.readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const v of versions) {
        for (const sub of fs.readdirSync(path.join(root, v))) {
          const p = path.join(root, v, sub, platform === 'win32' ? 'claude.exe' : 'claude');
          if (fs.existsSync(p)) return p;
        }
      }
    } catch {
      /* not there */
    }
  }
  return null;
}

export function cliStatus(env: NodeJS.ProcessEnv = process.env): { available: boolean; reason?: string } {
  const bin = findClaudeCli(env);
  if (!bin) return { available: false, reason: 'The Claude Code command line tool was not found on this computer. Install it, or set CLAUDE_BIN to its full path.' };
  return { available: true };
}
export function apiStatus(env: NodeJS.ProcessEnv = process.env): { available: boolean; reason?: string } {
  return env.ANTHROPIC_API_KEY ? { available: true } : { available: false, reason: 'No API key is set on the server.' };
}

// ---------- dev-cli ----------

function killTree(pid: number | undefined) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    else process.kill(-pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

/** Runs `claude -p` once with the prompt on stdin. No tools, no saved session, in an empty temp folder so no project files are read. */
export function writeWithCli(prompt: string, signal: AbortSignal, env: NodeJS.ProcessEnv = process.env, timeoutMs = CLI_TIMEOUT_MS, launcher?: { bin: string; args: string[] }): Promise<{ text: string; ms: number }> {
  const bin = launcher?.bin ?? findClaudeCli(env);
  if (!bin) return Promise.reject(new WriterFailure(503, 'unavailable', cliStatus(env).reason!));
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'carousel-writer-'));
    // `launcher` is a test seam: a stand-in program instead of the real command line.
    const args = launcher?.args ?? ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--system-prompt', SYSTEM_PROMPT];
    const child = spawn(bin, args, { cwd, env: { ...env, CLAUDE_CODE_ENTRYPOINT: 'carousel-writer' }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
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
        let parsed: { result?: unknown; is_error?: boolean; subtype?: string } | null = null;
        try {
          parsed = JSON.parse(out);
        } catch {
          /* not JSON */
        }
        if (code !== 0 || !parsed || parsed.is_error || typeof parsed.result !== 'string') {
          const detail = (typeof parsed?.result === 'string' ? parsed.result : err || out).trim().split('\n')[0].slice(0, 300);
          return reject(new WriterFailure(502, 'failed', `Claude Code did not return a script${code ? ` (exit code ${code})` : ''}${detail ? `: ${detail}` : '.'}`));
        }
        resolve({ text: parsed.result, ms: Date.now() - t0 });
      }),
    );
    child.stdin.on('error', () => undefined);
    child.stdin.end(prompt);
  });
}

// ---------- api ----------

/** One call to the Messages API. The key comes from `env` only and appears in no message, log or response. */
export async function writeWithApi(prompt: string, signal: AbortSignal, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch, timeoutMs = API_TIMEOUT_MS): Promise<{ text: string; ms: number }> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new WriterFailure(503, 'unavailable', 'No API key is set on the server, so the API writer is off.');
  const t0 = Date.now();
  const timeout = AbortSignal.timeout(timeoutMs);
  const both = AbortSignal.any([signal, timeout]);
  let r: Response;
  try {
    r = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.CAROUSEL_MODEL || 'claude-sonnet-5-5', max_tokens: 4096, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] }),
      signal: both,
    });
  } catch (e) {
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

// ---------- HTTP glue (Connect style, used by the Vite dev server and by any future server) ----------

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

export type Provider = 'dev-cli' | 'api';
/** A Connect-style handler for one provider. `base` is the route prefix, for example "/__carousel". */
export function carouselHandler(provider: Provider, opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}) {
  const env = opts.env ?? process.env;
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && url === '/status') return send(res, 200, provider === 'dev-cli' ? cliStatus(env) : apiStatus(env));
    if (req.method === 'POST' && url === '/write') {
      const ctl = new AbortController();
      res.on('close', () => !res.writableEnded && ctl.abort());
      try {
        const body = JSON.parse(await readBody(req)) as { prompt?: unknown };
        if (typeof body.prompt !== 'string' || body.prompt.trim() === '') throw new WriterFailure(400, 'failed', 'The request has no prompt.');
        const r = provider === 'dev-cli' ? await writeWithCli(body.prompt, ctl.signal, env) : await writeWithApi(body.prompt, ctl.signal, env, opts.fetchImpl);
        return send(res, 200, r);
      } catch (e) {
        if (e instanceof WriterFailure) return send(res, e.status, { error: e.message, kind: e.kind });
        return send(res, 400, { error: 'The request could not be read.', kind: 'failed' });
      }
    }
    next();
  };
}
