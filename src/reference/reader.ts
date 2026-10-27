// The ReferenceReader: where a style comes from when the person presses "Read references". The reader is a model with vision that sees the
// images and our vocabulary and answers in JSON. It is reached the way the script writer is: through this app's own server, never with a
// key in the browser. Providers: "dev-cli" (the Claude Code command line, dev server only) and "api" (a key in a server environment variable).
// Nothing here draws anything and the reader is never asked for code, SVG or drawing instructions: only values from the vocabulary.
import { SLIDE_TYPES, type SlideType, type StyleSpec } from '../image-engine/styles/format';
import { LEARN_LABEL, TARGET_LABEL, type Judgement, type Measured, type MissingTool, type ReadResult, type ReferenceItem, type Target } from './types';
import { applyPatches, assembleSpec, checkSpec, defaultThumbnail, exampleExcerpt, sectionsFor, vocabularyText, type SpecPatch } from './spec';

export type ReaderId = 'dev-cli' | 'api';
export interface ReaderImage {
  /** The file name the reader is told about, for example "ref1.jpg". */
  name: string;
  mime: string;
  base64: string;
}
export interface ReaderCall {
  prompt: string;
  images: ReaderImage[];
}
export interface ReferenceReader {
  id: ReaderId;
  label: string;
  /** Sends the prompt and the images, returns the model's text. Throws ReaderError. */
  read(call: ReaderCall, signal: AbortSignal): Promise<{ text: string; ms: number }>;
}
export type ReaderErrorKind = 'unavailable' | 'failed' | 'cancelled' | 'timeout' | 'invalid';
export class ReaderError extends Error {
  constructor(public kind: ReaderErrorKind, message: string, public problems: string[] = []) {
    super(message);
  }
}

const ENDPOINTS: Record<ReaderId, { status: string; read: string; label: string }> = {
  api: { status: '/api/reference/status', read: '/api/reference/read', label: 'Claude API (key on the server)' },
  'dev-cli': { status: '/__reference/status', read: '/__reference/read', label: 'Claude Code on this computer (dev only)' },
};

function provider(id: ReaderId): ReferenceReader {
  const e = ENDPOINTS[id];
  return {
    id,
    label: e.label,
    async read(call, signal) {
      const t0 = performance.now();
      let r: Response;
      try {
        r = await fetch(e.read, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(call), signal });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw new ReaderError('cancelled', 'Cancelled.');
        throw new ReaderError('failed', 'The reader could not be reached. Is the app server running?');
      }
      let body: { text?: string; error?: string; kind?: ReaderErrorKind } = {};
      try {
        body = await r.json();
      } catch {
        /* not JSON */
      }
      if (!r.ok || typeof body.text !== 'string') throw new ReaderError(body.kind ?? (r.status === 503 ? 'unavailable' : r.status === 504 ? 'timeout' : 'failed'), body.error ?? `The reader answered with an error (${r.status}).`);
      return { text: body.text, ms: performance.now() - t0 };
    },
  };
}

/** Which readers this server offers, best first. Never throws: an unreachable server just means none. */
export async function detectReaders(fetchImpl: typeof fetch = fetch): Promise<ReferenceReader[]> {
  const found: ReferenceReader[] = [];
  for (const id of ['api', 'dev-cli'] as ReaderId[]) {
    if (id === 'dev-cli' && !import.meta.env.DEV) continue; // the dev reader is never used in a production build
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

// ---------- prompts ----------

const SYSTEM_RULES = [
  'You describe the visual style of reference images as JSON, using only the vocabulary you are given.',
  'You never write code, SVG, CSS or free-form drawing instructions. You never copy text, logos or faces from the references: describe looks only.',
  'Be honest about what the vocabulary cannot do: list it under "missing_tools" instead of approximating silently.',
  'Reply with ONE JSON object and nothing else (no code fence, no explanation).',
];

const fileName = (i: number) => `ref${i + 1}.jpg`;

export function buildReadPrompt(o: { items: ReferenceItem[]; target: Target; base: StyleSpec; baseName: string; measured: Measured[] }): string {
  const sections = sectionsFor(o.items.map((i) => i.learn));
  const single = o.items.length === 1;
  const lines = o.items.map((it, i) => `- ${fileName(i)}: learn from "${LEARN_LABEL[it.learn]}"${it.source.cell !== undefined ? ` (one slide of a collage)` : ''}. Measured: ${measuredLine(o.measured[i])}`);
  return [
    ...SYSTEM_RULES,
    '',
    `The reference images are the files in the current folder (look at each with your Read tool):`,
    ...lines,
    '',
    `Target: ${TARGET_LABEL[o.target]}. ${o.target === 'carousel' ? 'Write layouts for all 8 slide types.' : o.target === 'thumbnail' ? 'Write the "thumbnail" block (and a palette, fonts and type that suit it).' : 'Write layouts for all 8 slide types and the "thumbnail" block.'}`,
    `The style is laid over a base style (${o.baseName}); give only the sections you want to change. You may only change these sections: ${sections.join(', ')}. Each image only says what its "learn from" allows: "Colours and type only" gives palettes, fonts, type, case and shape; "Layout only" gives layouts, spacing, chrome and the thumbnail layout; "Photo treatment only" gives the photo treatments.`,
    single ? 'Only ONE image is given: build the style from its look and extrapolate the other slide types from it. In "seen_slide_types" list only the slide types the image really shows.' : '',
    '',
    'The measured values are facts from the pixels. Use colours close to the measured palette, sizes close to the measured shares (a title that is 12% of the frame height on a 1350 high slide is about 160 px of type), and margins close to the measured margins.',
    '',
    vocabularyText(),
    '',
    'An example of valid shapes (values are from another style, copy the shapes, not the values):',
    exampleExcerpt(o.base),
    '',
    'Reply with this JSON:',
    '{"style": {sections you change}, "seen_slide_types": ["cover", ...from: ' + SLIDE_TYPES.join(', ') + '], "missing_tools": [{"tool": "short name", "why": "one short reason", "images": ["ref1.jpg"]}], "notes": "one or two plain sentences"}',
    'missing_tools: what the references use that the vocabulary cannot draw: cutouts of people or objects, 3D renders, fonts that are not bundled (say what the font looks like), textures and paper, hand-drawn doodles, photo collages, anything else. Be specific and short.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

const measuredLine = (m: Measured | undefined) =>
  !m ? 'n/a' : `palette ${m.palette.slice(0, 5).map((c) => `${c.hex} ${Math.round(c.share * 100)}%`).join(', ')}; background ${m.background}; text colour ${m.textColour ?? 'none'}; title ${m.titleHeight === null ? 'not found' : `${Math.round(m.titleHeight * 100)}% of the height at ${m.titlePlacement}`}; margins ${m.margins ? [m.margins.left, m.margins.top, m.margins.right, m.margins.bottom].map((v) => `${Math.round(v * 100)}%`).join('/') : 'full-bleed'}; ${m.textBlocks} text blocks; empty space ${Math.round(m.emptySpace * 100)}%; photo ${m.photo.present ? 'yes' : 'no'}`;

function allowedLine(spec: StyleSpec, sections: string[]): string {
  const s = spec as unknown as Record<string, unknown>;
  return JSON.stringify(Object.fromEntries(sections.filter((k) => s[k] !== undefined && k !== 'layouts').map((k) => [k, s[k]])));
}

export function buildRefinePrompt(o: { spec: StyleSpec; sections: string[]; pairs: { name: string; reference: Measured; replica: Measured }[]; round: number; feedback?: string }): string {
  return [
    ...SYSTEM_RULES,
    '',
    o.feedback ? `The person looked at the replica and said: "${o.feedback}". Turn that into patches. Also fix anything else that is clearly off.` : `Round ${o.round}: each image in the current folder shows a REFERENCE on the left and our REPLICA on the right. Say how close the replica is and return patches that make it closer.`,
    ...o.pairs.map((p) => `- ${p.name}: measured reference ${measuredLine(p.reference)} | replica ${measuredLine(p.replica)}`),
    '',
    `You may only change these sections: ${o.sections.join(', ')}. The current values (layouts left out): ${allowedLine(o.spec, o.sections)}`,
    `Current layout choices: ${JSON.stringify(Object.fromEntries(Object.entries(o.spec.layouts).map(([t, r]) => [t, r.map((x) => x.use)])))}`,
    '',
    vocabularyText(),
    '',
    'Reply with this JSON: {"patches": [{"path": "type.headline", "value": 120}, ...], "judgement": {"score": 0 to 100, "matched": [short phrases], "approximated": [short phrases], "missing": [short phrases]}, "stop": true or false}',
    'A patch sets one value at a dotted path into the style (for example "palettes.ink.bg", "shape.marker", "layouts.cover" with a whole list of rules, "spacing.margin"). At most 12 patches. Use "stop": true when more patches would not help. Never say the replica is identical or perfect: it is only as close as the vocabulary allows.',
  ].join('\n');
}

// ---------- reading answers ----------

function jsonOf(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t);
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseRead(text: string): { ok: true; result: ReadResult } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = jsonOf(text);
  } catch {
    return { ok: false, errors: ['The answer was not valid JSON. Reply with one JSON object and nothing else.'] };
  }
  if (!isObj(raw) || !isObj(raw.style)) return { ok: false, errors: ['The answer has no "style" object.'] };
  const seen = Array.isArray(raw.seen_slide_types) ? (raw.seen_slide_types as unknown[]).filter((t): t is SlideType => (SLIDE_TYPES as string[]).includes(t as string)) : [];
  const missing: MissingTool[] = Array.isArray(raw.missing_tools)
    ? (raw.missing_tools as unknown[]).flatMap((m) => (isObj(m) && typeof m.tool === 'string' && m.tool.trim() ? [{ tool: m.tool.trim().slice(0, 80), why: typeof m.why === 'string' ? m.why.trim().slice(0, 200) : '', ...(Array.isArray(m.images) ? { images: (m.images as unknown[]).filter((x): x is string => typeof x === 'string') } : {}) }] : []))
    : [];
  return { ok: true, result: { style: raw.style, seenSlideTypes: [...new Set(seen)], missingTools: missing, notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 400) : '' } };
}

export interface RefineAnswer {
  patches: SpecPatch[];
  judgement: Judgement;
  stop: boolean;
}
export function parseRefine(text: string): { ok: true; answer: RefineAnswer } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = jsonOf(text);
  } catch {
    return { ok: false, errors: ['The answer was not valid JSON.'] };
  }
  if (!isObj(raw) || !Array.isArray(raw.patches)) return { ok: false, errors: ['The answer has no "patches" list.'] };
  const patches = (raw.patches as unknown[]).flatMap((p) => (isObj(p) && typeof p.path === 'string' && 'value' in p ? [{ path: p.path, value: p.value }] : [])).slice(0, 12);
  const j = isObj(raw.judgement) ? raw.judgement : {};
  const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 8) : []);
  const score = typeof j.score === 'number' ? Math.min(100, Math.max(0, j.score)) : 50;
  return { ok: true, answer: { patches, judgement: { score, matched: list(j.matched), approximated: list(j.approximated), missing: list(j.missing) }, stop: raw.stop === true } };
}

// ---------- the calls ----------

export interface ReadOutcome {
  spec: StyleSpec;
  result: ReadResult;
  attempts: 1 | 2;
  ms: number;
  warnings: string[];
}

const retryPrompt = (first: string, previous: string, errors: string[]) => [first, '', 'Your previous answer was:', previous.slice(0, 7000), '', 'It cannot be used, for these reasons:', ...errors.slice(0, 14).map((e) => `- ${e}`), '', 'Answer again with ONE JSON object that fixes every one of these.'].join('\n');

/** Reads the references: ask, check the answer with the style validator, and if it is not valid ask once more with the problems. */
export async function readStyle(o: { reader: ReferenceReader; items: ReferenceItem[]; images: ReaderImage[]; target: Target; base: StyleSpec; baseName: string; measured: Measured[]; name: string; title: string; signal: AbortSignal; onPhase?: (p: 'reading' | 'retrying') => void }): Promise<ReadOutcome> {
  const prompt = buildReadPrompt({ items: o.items, target: o.target, base: o.base, baseName: o.baseName, measured: o.measured });
  const sections = sectionsFor(o.items.map((i) => i.learn));
  const note = `${o.items.length === 1 ? 'Built from one image' : `Built from ${o.items.length} images`}: ${o.items.map((i) => `${i.name} (${LEARN_LABEL[i.learn].toLowerCase()})`).join(', ')}.`;
  const attempt = (text: string): { spec: StyleSpec; result: ReadResult; errors: string[]; warnings: string[] } => {
    const p = parseRead(text);
    if (!p.ok) return { spec: o.base, result: { style: {}, seenSlideTypes: [], missingTools: [], notes: '' }, errors: p.errors, warnings: [] };
    let spec = assembleSpec(o.base, p.result.style, { sections, name: o.name, title: o.title, target: o.target, note });
    if (o.target !== 'carousel' && !spec.thumbnail) spec = { ...spec, thumbnail: defaultThumbnail(spec) };
    const c = checkSpec(spec);
    return { spec, result: p.result, errors: c.errors, warnings: c.warnings };
  };
  o.onPhase?.('reading');
  let a = await o.reader.read({ prompt, images: o.images }, o.signal);
  let total = a.ms;
  let r = attempt(a.text);
  let attempts: 1 | 2 = 1;
  if (r.errors.length) {
    o.onPhase?.('retrying');
    attempts = 2;
    a = await o.reader.read({ prompt: retryPrompt(prompt, a.text, r.errors), images: o.images }, o.signal);
    total += a.ms;
    r = attempt(a.text);
  }
  if (r.errors.length) throw new ReaderError('invalid', 'The reader answered twice, but neither answer was a style that passes the checks.', r.errors);
  return { spec: r.spec, result: r.result, attempts, ms: total, warnings: r.warnings };
}

export interface RefineOutcome {
  spec: StyleSpec;
  patches: SpecPatch[];
  judgement: Judgement;
  stop: boolean;
  refused: string[];
  attempts: 1 | 2;
  ms: number;
  /** Set when the answer could not be used and the spec is unchanged. */
  problem?: string;
}

/** One round of refinement (or the person's own feedback): the reader sees reference and replica together and answers with patches. */
export async function refineStyle(o: { reader: ReferenceReader; spec: StyleSpec; target: Target; sections: string[]; pairs: { name: string; reference: Measured; replica: Measured }[]; images: ReaderImage[]; round: number; feedback?: string; signal: AbortSignal }): Promise<RefineOutcome> {
  const prompt = buildRefinePrompt({ spec: o.spec, sections: o.sections, pairs: o.pairs, round: o.round, feedback: o.feedback });
  const empty: Judgement = { score: 0, matched: [], approximated: [], missing: [] };
  const attempt = (text: string): { out?: { spec: StyleSpec; answer: RefineAnswer; refused: string[] }; errors: string[] } => {
    const p = parseRefine(text);
    if (!p.ok) return { errors: p.errors };
    // Only sections the references allow may change.
    const allowed = p.answer.patches.filter((x) => o.sections.includes(x.path.split('.')[0]));
    const { spec, refused } = applyPatches(o.spec, allowed, o.target);
    const c = checkSpec(spec);
    return c.errors.length ? { errors: c.errors } : { out: { spec, answer: p.answer, refused: [...refused, ...p.answer.patches.filter((x) => !allowed.includes(x)).map((x) => `${x.path}: not a section these references may change`)] }, errors: [] };
  };
  let a = await o.reader.read({ prompt, images: o.images }, o.signal);
  let total = a.ms;
  let r = attempt(a.text);
  let attempts: 1 | 2 = 1;
  if (!r.out) {
    attempts = 2;
    a = await o.reader.read({ prompt: retryPrompt(prompt, a.text, r.errors), images: o.images }, o.signal);
    total += a.ms;
    r = attempt(a.text);
  }
  if (!r.out) return { spec: o.spec, patches: [], judgement: empty, stop: true, refused: [], attempts, ms: total, problem: `The reader's patches could not be used (${r.errors[0] ?? 'invalid answer'}), so the style is unchanged.` };
  return { spec: r.out.spec, patches: r.out.answer.patches, judgement: r.out.answer.judgement, stop: r.out.answer.stop, refused: r.out.refused, attempts, ms: total };
}
