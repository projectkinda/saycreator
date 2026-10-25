// Writers: where a script comes from when the person presses Generate. The browser code never holds a key: it only talks to
// this app's own server endpoints. Two providers exist behind the same interface:
//   dev-cli  a dev-server endpoint that runs the Claude Code command line on this computer (development only)
//   api      a server endpoint that uses a key kept in an environment variable on the server (off unless the server has one)
// In a production build there is no dev endpoint, and the api one exists only if a server provides it.
import type { CarouselScript } from '../image-engine/carousel/types';
import type { Tone } from './doc';
import { buildRetryPrompt, buildWritePrompt, type WriteRequest } from './writerPrompt';
import { cleanPaste, validateScriptText, type Format, type Issue } from './script';

export type ProviderId = 'dev-cli' | 'api';
export interface WriteProvider {
  id: ProviderId;
  /** For the small dev-only label. */
  label: string;
  /** Sends a prompt, returns the model's text. Throws WriterError. Rejects with kind "cancelled" when the signal aborts. */
  write(prompt: string, signal: AbortSignal): Promise<{ text: string; ms: number }>;
}

export type WriterErrorKind = 'unavailable' | 'failed' | 'cancelled' | 'timeout' | 'invalid';
export class WriterError extends Error {
  constructor(public kind: WriterErrorKind, message: string, public problems: Issue[] = []) {
    super(message);
  }
}

const ENDPOINTS: Record<ProviderId, { status: string; write: string; label: string }> = {
  api: { status: '/api/carousel/status', write: '/api/carousel/write', label: 'Claude API (key on the server)' },
  'dev-cli': { status: '/__carousel/status', write: '/__carousel/write', label: 'Claude Code on this computer (dev only)' },
};

function provider(id: ProviderId): WriteProvider {
  const e = ENDPOINTS[id];
  return {
    id,
    label: e.label,
    async write(prompt, signal) {
      const t0 = performance.now();
      let r: Response;
      try {
        r = await fetch(e.write, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }), signal });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw new WriterError('cancelled', 'Cancelled.');
        throw new WriterError('failed', 'The writer could not be reached. Is the app server running?');
      }
      let body: { text?: string; error?: string; kind?: WriterErrorKind } = {};
      try {
        body = await r.json();
      } catch {
        /* not JSON */
      }
      if (!r.ok || typeof body.text !== 'string') throw new WriterError(body.kind ?? (r.status === 503 ? 'unavailable' : r.status === 504 ? 'timeout' : 'failed'), body.error ?? `The writer answered with an error (${r.status}).`);
      return { text: body.text, ms: performance.now() - t0 };
    },
  };
}

/** Which writers this server offers, best first. Never throws: an unreachable server just means none. */
export async function detectProviders(fetchImpl: typeof fetch = fetch): Promise<WriteProvider[]> {
  const found: WriteProvider[] = [];
  for (const id of ['api', 'dev-cli'] as ProviderId[]) {
    if (id === 'dev-cli' && !import.meta.env.DEV) continue; // the dev writer is never used in a production build
    try {
      const r = await fetchImpl(ENDPOINTS[id].status);
      if (!r.ok) continue;
      const j = (await r.json()) as { available?: boolean };
      if (j.available === true) found.push(provider(id));
    } catch {
      /* no such endpoint here */
    }
  }
  return found;
}

export interface GenerateResult {
  script: CarouselScript;
  /** What the writer suggested besides the script. */
  style: string | null;
  note: string | null;
  attempts: 1 | 2;
  ms: number;
  warnings: Issue[];
  provider: ProviderId;
}

/** The part of the writer's answer that is not the script itself. */
function extras(text: string): { style: string | null; note: string | null } {
  try {
    const j = JSON.parse(cleanPaste(text)) as { style?: unknown; note?: unknown };
    return { style: typeof j.style === 'string' ? j.style : null, note: typeof j.note === 'string' && j.note.trim() ? j.note.trim() : null };
  } catch {
    return { style: null, note: null };
  }
}

/** Writes a script: ask, check the answer with the app's validator, and if it is not valid ask once more with the problems. */
export async function generateScript(
  req: WriteRequest,
  p: WriteProvider,
  signal: AbortSignal,
  onPhase: (phase: 'writing' | 'retrying') => void = () => undefined,
): Promise<GenerateResult> {
  const first = buildWritePrompt(req);
  let total = 0;
  onPhase('writing');
  let a = await p.write(first, signal);
  total += a.ms;
  let v = validateScriptText(a.text, req.format);
  let attempts: 1 | 2 = 1;
  if (!v.script) {
    onPhase('retrying');
    attempts = 2;
    a = await p.write(buildRetryPrompt(first, a.text, v.errors.map((e) => e.message)), signal);
    total += a.ms;
    v = validateScriptText(a.text, req.format);
  }
  if (!v.script) throw new WriterError('invalid', 'The writer answered twice, but neither answer could be used as a script.', v.errors);
  return { script: v.script, ...extras(a.text), attempts, ms: total, warnings: v.warnings, provider: p.id };
}

export type { Tone, Format };
