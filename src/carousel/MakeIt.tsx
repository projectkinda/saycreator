// The one-shot part of the page: paste text, choose a few optional chips, press Generate. Progress, cancel and plain errors.
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_OPTIONS, type Doc, type GenerateOptions } from './doc';
import { WriterError, detectProviders, generateScript, type GenerateResult, type WriteProvider } from './writer';
import { MAX_CHARS, TONES, textProblem, type WriteRequest } from './writerPrompt';
import { FORMATS, SLIDE_RANGE, type Format, type Issue } from './script';
import { getStyles } from './render';

/** The style used when the writer does not name one: by tone. Only names that exist are used. */
const TONE_STYLE: Record<string, string> = { clear: 'dark-quiet', bold: 'hot-flat', friendly: 'editorial-collage', expert: 'object-neon' };
export function styleForTone(tone: string): string | null {
  const names = getStyles().styles.map((s) => s.spec.name);
  const want = TONE_STYLE[tone];
  return want && names.includes(want) ? want : names[0] ?? null;
}

export type Phase = 'idle' | 'writing' | 'retrying' | 'drawing' | 'done' | 'error';
export interface GenState {
  phase: Phase;
  note?: string | null;
  ms?: number;
  attempts?: 1 | 2;
  provider?: string;
  warnings?: Issue[];
  /** Plain-language problems, when the writer's answer could not be used. */
  problems?: string[];
  message?: string;
}

export function useWriters() {
  const [providers, setProviders] = useState<WriteProvider[] | null>(null);
  useEffect(() => {
    let live = true;
    detectProviders().then((p) => live && setProviders(p));
    return () => {
      live = false;
    };
  }, []);
  return providers;
}

/** Runs one generation. Returns the result, or the problem as a GenState. */
export async function runGenerate(req: WriteRequest, provider: WriteProvider, signal: AbortSignal, onPhase: (p: 'writing' | 'retrying') => void): Promise<{ ok: true; result: GenerateResult } | { ok: false; state: GenState }> {
  try {
    return { ok: true, result: await generateScript(req, provider, signal, onPhase) };
  } catch (e) {
    if (e instanceof WriterError) {
      if (e.kind === 'cancelled') return { ok: false, state: { phase: 'idle', message: 'Cancelled. Your text is kept.' } };
      if (e.kind === 'invalid') return { ok: false, state: { phase: 'error', message: 'The writer answered twice, but neither answer could be used as a script. Your text is kept, so you can press Generate again.', problems: e.problems.map((p) => p.message) } };
      return { ok: false, state: { phase: 'error', message: `${e.message} Your text is kept.` } };
    }
    return { ok: false, state: { phase: 'error', message: `Something went wrong: ${(e as Error).message} Your text is kept.` } };
  }
}

export function MakeIt({ doc, options, setTopic, setOptions, onFormat, onHandle, busy, gen, onGenerate, onCancel, provider, providers, styles }: {
  doc: Doc;
  options: GenerateOptions;
  setTopic: (t: string) => void;
  setOptions: (o: Partial<GenerateOptions>) => void;
  onFormat: (f: Format) => void;
  onHandle: (h: string) => void;
  busy: boolean;
  gen: GenState;
  onGenerate: () => void;
  onCancel: () => void;
  provider: WriteProvider | null;
  providers: WriteProvider[] | null;
  styles: React.ReactNode;
}) {
  const n = doc.topic.length;
  const problem = useMemo(() => textProblem(doc.topic), [doc.topic]);
  const [lo, hi] = SLIDE_RANGE[doc.format];
  const counts = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const why = !provider ? (providers === null ? 'Looking for a writer…' : 'No writer is available on this server yet. Use Advanced below to copy a prompt for Claude and paste the answer.') : null;
  const disabled = busy || !!why || !!problem;
  const label = (doc.format === 'quote' ? 'Cards' : 'Slides');
  return (
    <section className="card ws-card" aria-labelledby="cr-make-h">
      <h2 id="cr-make-h" className="h3">Make it from your text</h2>
      <div className="create-form">
        <label className="field">
          <span className="field-label">Your text, idea or article</span>
          <textarea className="cr-source" rows={8} value={doc.topic} onChange={(e) => setTopic(e.target.value)} disabled={busy} aria-describedby="cr-count" placeholder="Paste a paragraph, a rough idea or a whole article. Only what is in it will be used: no facts are added." />
        </label>
        <p id="cr-count" className={`small ${n > MAX_CHARS ? 'cr-problem' : 'muted'}`} role={n > MAX_CHARS ? 'alert' : undefined}>
          {n.toLocaleString('en')} of {MAX_CHARS.toLocaleString('en')} characters{problem ? `. ${problem}` : ''}
        </p>

        <div className="cr-options">
          <div role="group" aria-label="Format" className="chip-group">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" className="chip-btn" aria-pressed={doc.format === f.id} disabled={busy} onClick={() => onFormat(f.id)}>
                {f.label} <span className="small">({f.id === 'carousel' ? '4:5' : '1:1'})</span>
              </button>
            ))}
          </div>
          <label className="cr-inline">
            <span className="field-label">{label}</span>
            <select className="plain-select cr-select" value={Math.min(hi, Math.max(lo, options.slides))} disabled={busy} onChange={(e) => setOptions({ slides: Number(e.target.value) })}>
              {counts.map((c) => (
                <option key={c} value={c}>{c}{c === DEFAULT_OPTIONS.slides && doc.format === 'carousel' ? ' (usual)' : ''}</option>
              ))}
            </select>
          </label>
          <label className="cr-inline">
            <span className="field-label">Your handle (optional)</span>
            <input type="text" className="cr-input cr-handle" value={options.handle} placeholder="@yourname" maxLength={40} onChange={(e) => onHandle(e.target.value)} />
          </label>
          <div className="cr-inline">
            <span className="field-label" id="cr-tone-l">Tone</span>
            <div role="group" aria-labelledby="cr-tone-l" className="chip-group">
              {TONES.map((t) => (
                <button key={t.id} type="button" className="chip-btn" aria-pressed={options.tone === t.id} disabled={busy} title={t.how} onClick={() => setOptions({ tone: t.id })}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 className="h4">Style</h3>
          {styles}
        </div>

        <div className="row-actions">
          {!busy && (
            <button type="button" className="btn btn-dark btn-lg" disabled={disabled} aria-describedby="cr-why" onClick={onGenerate}>
              Generate
            </button>
          )}
          {busy && (
            <button type="button" className="btn btn-outline btn-lg" onClick={onCancel}>
              Cancel
            </button>
          )}
          <span id="cr-why" className="small muted">{!busy && why ? why : ''}</span>
        </div>
        <p className="small" role="status" aria-live="polite" data-testid="progress">
          {gen.phase === 'writing' && 'Writing the script…'}
          {gen.phase === 'retrying' && 'The first answer needed fixing. Asking again…'}
          {gen.phase === 'drawing' && (gen.message ?? 'Drawing the slides…')}
          {gen.phase === 'done' && gen.message}
          {gen.phase === 'idle' && gen.message}
        </p>
        {gen.phase === 'error' && (
          <div className="notice notice-error" role="alert">
            <strong>{gen.message}</strong>
            {gen.problems && gen.problems.length > 0 && (
              <ul className="cr-issues">
                {gen.problems.slice(0, 8).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            )}
          </div>
        )}
        {import.meta.env.DEV && (
          <p className="small muted" data-testid="writer-label">
            Writer (dev label): {provider ? provider.label : providers === null ? 'checking…' : 'none available'}
          </p>
        )}
      </div>
    </section>
  );
}
