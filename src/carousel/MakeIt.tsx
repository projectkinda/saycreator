// The one-shot part of the page: paste text, choose a few optional chips, press Generate. Progress, cancel and plain errors.
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_OPTIONS, type Doc, type GenerateOptions } from './doc';
import { WriterError, detectProviders, generateScript, type GenerateResult, type WriteProvider } from './writer';
import { MAX_CHARS, TONES, textProblem, type WriteRequest } from './writerPrompt';
import { FORMATS, SLIDE_RANGE, type Format, type Issue } from './script';
import { getStyles } from './render';
import { designDeck, designEstimate, type Designed } from './designed';
import { designLibraryDeck, legacySvgRoute } from './designLibrary';
import { ACTIVE_STYLE, activeReference } from '../reference/active';
import { slideBlocks } from './pasted';
import { PLATFORMS, isPlatform, platformOf, platformWarning, type Platform } from './platform';

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
  /** Why "Pick for me" chose the style it did. */
  styleWhy?: string;
  /** Extra words for the summary line (Designed mode). */
  extra?: string;
  /** Designed mode failed with this reason: the notice offers Retry and "Use quick templates instead". */
  designFailed?: string;
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

/** Designed mode: one call for the story and every slide's design (see designed.ts). Same result shape as runGenerate, plus the designs. */
export async function runDesign(req: WriteRequest, look: { pack?: import('../reference/pack').StylePack | null; brief?: string; hasPhoto?: boolean }, handle: string, provider: WriteProvider, signal: AbortSignal, onPhase: (p: 'writing' | 'retrying') => void): Promise<{ ok: true; result: GenerateResult; designed: Designed } | { ok: false; state: GenState }> {
  try {
    const { designed, ...result } = // The layout library route is the default: the model only chooses. The old model-drawn SVG route stays behind a flag (and quote cards, which are square, use it).
    await (legacySvgRoute() || req.format === 'quote' ? designDeck : designLibraryDeck)(req, look, handle, provider, signal, onPhase);
    return { ok: true, result, designed };
  } catch (e) {
    if (e instanceof WriterError) {
      if (e.kind === 'cancelled') return { ok: false, state: { phase: 'idle', message: 'Cancelled. Your text is kept.' } };
      if (e.kind === 'invalid') return { ok: false, state: { phase: 'error', message: 'The writer answered twice, but neither answer could be used as a script. Your text is kept, so you can press Generate again.', problems: e.problems.map((p) => p.message) } };
      return { ok: false, state: { phase: 'error', message: `${e.message} Your text is kept.` } };
    }
    return { ok: false, state: { phase: 'error', message: `Something went wrong: ${(e as Error).message} Your text is kept.` } };
  }
}

export type MakeItPart = 'content' | 'format' | 'style';

/** The three input steps of the page. Each part is one step; the page decides which is shown and owns Back / Next. Every control keeps what it did. */
export function MakeIt({ images, scriptBox, scriptMode, onScriptMode, doc, options, setTopic, setOptions, onFormat, onHandle, busy, gen, onGenerate, onUseQuick, onCancel, provider, providers, styles, referenceBox, styleReady = true, part }: {
  doc: Doc;
  options: GenerateOptions;
  setTopic: (t: string) => void;
  setOptions: (o: Partial<GenerateOptions>) => void;
  onFormat: (f: Format) => void;
  onHandle: (h: string) => void;
  busy: boolean;
  gen: GenState;
  onGenerate: () => void;
  /** After a failed Designed run: make the slides from the style templates instead (one time). */
  onUseQuick?: () => void;
  onCancel: () => void;
  provider: WriteProvider | null;
  providers: WriteProvider[] | null;
  styles?: React.ReactNode;
  /** Under the style list: the box that opens with "New style". */
  referenceBox?: React.ReactNode;
  /** A style is chosen (or "Pick for me" is on): the button needs one. */
  styleReady?: boolean;
  /** Under the text input: the optional "Add images" area. */
  images?: React.ReactNode;
  /** "I already have a script": the paste box, "Copy prompt for Claude" and "Try an example script". */
  scriptBox?: React.ReactNode;
  scriptMode?: 'write' | 'own';
  onScriptMode?: (m: 'write' | 'own') => void;
  part: MakeItPart;
}) {
  const n = doc.topic.length;
  const problem = useMemo(() => textProblem(doc.topic), [doc.topic]);
  const [lo, hi] = SLIDE_RANGE[doc.format];
  const counts = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  // Ready-made slide text (one block per slide) needs no writer at all.
  const ready = !!slideBlocks(doc.topic);
  // With a reference style active, Designed is the default route (one design call); Quick fills the style's templates.
  const viaDesigned = !ready && doc.style === ACTIVE_STYLE && !!activeReference()?.pack && options.mode !== 'quick';
  const cost = ready ? '0 design calls, 0 writing calls: your slide text is used as it is.' : viaDesigned ? designEstimate(Math.min(hi, Math.max(lo, options.slides))).text : '0 design calls, 1 small writing call.';
  const why = !provider && !ready ? (providers === null ? 'Looking for a writer…' : 'No writer is available on this server yet. Choose "I already have a script" in step 1 to copy a prompt for Claude and paste the answer.') : null;
  const disabled = busy || !!why || !!problem || !styleReady;
  const label = (doc.format === 'quote' ? 'Cards' : 'Slides');
  const platform = isPlatform(options.platform) ? options.platform : null;
  const plat = doc.format === 'carousel' ? platformOf(platform) : null;
  const ceiling = plat ? plat.max : hi;
  const asked = Math.min(hi, Math.max(lo, options.slides), ceiling);
  const [cap, setCap] = useState('');
  // A script that is already longer than the platform allows is warned about (it is not cut).
  const platformNote = doc.format === 'carousel' && doc.script ? platformWarning(doc.script.slides.length, platform) : null;
  const choosePlatform = (p: Platform) => {
    const next = platform === p ? null : p;
    const nx = platformOf(next);
    if (nx && options.slides > nx.max) {
      setOptions({ platform: next, slides: nx.max });
      setCap(`Capped at ${nx.max} for ${nx.label}`);
    } else {
      setOptions({ platform: next });
      setCap('');
    }
  };

  if (part === 'content')
    return (
      <section className="card ws-card cr-step-card" aria-labelledby="cr-s1-h" data-testid="step-content">
        <h2 id="cr-s1-h" className="h3">Your content</h2>
        <div className="create-form">
          <label className="field">
            <span className="field-label">Your text or topic</span>
            <textarea className="cr-source" rows={8} value={doc.topic} onChange={(e) => setTopic(e.target.value)} disabled={busy} aria-describedby="cr-count" placeholder="Paste a paragraph, a rough idea or a whole article. Only what is in it will be used: no facts are added." />
          </label>
          <p id="cr-count" className={`small ${n > MAX_CHARS ? 'cr-problem' : 'muted'}`} role={n > MAX_CHARS ? 'alert' : undefined}>
            {n.toLocaleString('en')} of {MAX_CHARS.toLocaleString('en')} characters{problem ? `. ${problem}` : ''}
          </p>
          <div className="cr-script-choice chip-group" role="group" aria-label="Who writes the script">
            <button type="button" className="chip-btn" aria-pressed={scriptMode !== 'own'} onClick={() => onScriptMode?.('write')}>Write my script for me</button>
            <button type="button" className="chip-btn" aria-pressed={scriptMode === 'own'} onClick={() => onScriptMode?.('own')}>I already have a script</button>
          </div>
          {scriptMode === 'own' ? scriptBox : <p className="small muted">The writer turns your text into slides when you press the make button in step 3. Nothing is sent before that.</p>}
          {images}
        </div>
      </section>
    );

  if (part === 'format')
    return (
      <section className="card ws-card cr-step-card" aria-labelledby="cr-s2-h" data-testid="options">
        <h2 id="cr-s2-h" className="h3">Format</h2>
        <div className="create-form">
          <div role="group" aria-label="Format" className="cr-format-cards">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" className="card cr-format-card" aria-pressed={doc.format === f.id} aria-label={`${f.label} (${f.ratio})`} disabled={busy} onClick={() => onFormat(f.id)}>
                <strong className="cr-format-title">{f.label} <span className="small">({f.ratio})</span></strong>
                <span className="small">{f.id === 'carousel' ? 'A swipeable set of slides. Best for teaching, lists and stories.' : 'One square image with a single line. Best for a quick, punchy post.'}</span>
              </button>
            ))}
          </div>
          <div className="cr-options">
            <label className="cr-inline">
              <span className="field-label">{label}</span>
              <select className="plain-select cr-select" value={asked} disabled={busy} onChange={(e) => {
                const k = Number(e.target.value);
                setOptions({ slides: Math.min(k, ceiling) });
                setCap(plat && k > plat.max ? `Capped at ${plat.max} for ${plat.label}` : '');
              }}>
                {counts.filter((c) => c <= ceiling).map((c) => (
                  <option key={c} value={c}>{c}{c === DEFAULT_OPTIONS.slides && doc.format === 'carousel' ? ' (usual)' : ''}</option>
                ))}
              </select>
            </label>
            <div className="cr-inline">
              <span className="field-label" id="cr-platform-l">Platform</span>
              <div role="group" aria-labelledby="cr-platform-l" className="chip-group">
                {PLATFORMS.map((p) => (
                  <button key={p.id} type="button" className="chip-btn" aria-pressed={platform === p.id} disabled={busy} title={`At most ${p.max} slides. Press again to clear.`} onClick={() => choosePlatform(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {plat && (
            <p className="small muted" role="status" data-testid="platform-cap">
              {cap ? <strong>{cap}. </strong> : null}
              {plat.label} allows up to {plat.max} slides in a post.
            </p>
          )}
          {platformNote && (
            <p className="small cr-problem" role="status" data-testid="platform-warning">
              {platformNote}
            </p>
          )}
        </div>
      </section>
    );

  return (
    <section className="card ws-card cr-step-card" aria-labelledby="cr-s3-h" data-testid="step-style">
      <h2 id="cr-s3-h" className="h3">Style</h2>
      <div className="create-form">
        <p className="small muted cr-hint">Built-in styles and your own saved ones. Pick how the slides look, or let the page pick.</p>
        {styles}
        {referenceBox}
        <div className="cr-options">
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
          <label className="cr-inline">
            <span className="field-label">Your handle (optional)</span>
            <input type="text" className="cr-input cr-handle" value={options.handle} placeholder="@yourname" maxLength={40} onChange={(e) => onHandle(e.target.value)} />
          </label>
          {doc.style === ACTIVE_STYLE && !!activeReference()?.pack && (
            <div className="cr-inline">
              <span className="field-label" id="cr-route-l">Slides</span>
              <div role="group" aria-labelledby="cr-route-l" className="chip-group">
                <button type="button" className="chip-btn" aria-pressed={options.mode !== 'quick'} disabled={busy} title="One design call: the model designs every slide in your reference's style (default)." onClick={() => setOptions({ mode: 'designed' })}>Designed</button>
                <button type="button" className="chip-btn" aria-pressed={options.mode === 'quick'} disabled={busy} title="The style's templates fill the slides: no design call." onClick={() => setOptions({ mode: 'quick' })}>Quick (templates)</button>
              </div>
            </div>
          )}
        </div>
        <div className="row-actions cr-go">
          {!busy && (
            <button type="button" className="btn btn-dark btn-lg cr-make-btn" disabled={disabled} aria-describedby="cr-why" onClick={onGenerate}>
              Make carousel
            </button>
          )}
          {busy && (
            <button type="button" className="btn btn-outline btn-lg" onClick={onCancel}>
              Cancel
            </button>
          )}
          <span id="cr-why" className="small muted">{!busy ? (why ?? (problem ? 'Add your text in step 1 to turn this button on.' : !styleReady ? 'Pick a style to turn this button on.' : '')) : ''}</span>
        </div>
        <p className="small cr-cost" data-testid="cost-line">{cost}</p>
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
            {gen.designFailed && (
              <div className="row-actions" data-testid="design-failed-actions">
                <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={onGenerate}>Retry</button>
                {onUseQuick && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onUseQuick}>Use quick templates instead</button>}
              </div>
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
