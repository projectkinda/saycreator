// The layout picker and "Rewrite text" for a library slide.
//  - layoutOptions(): every layout that can take the slide's fields (the text is MAPPED between layouts, never invented), with what the move would leave out.
//  - previewOptions(): the picture of each option (layouts, cuts, variant, invert), drawn by the code.
//  - redrawLibrarySlide(): draws ONE slide again from the stored plan with the person's choice. No model call.
//  - rewriteSlideText(): the only model call here: one small call for one slide, new text for the SAME layout.
import type { Layer } from '../image-engine/types';
import type { DesignedSlide, Look } from './designed';
import { LAYOUT_IDS, cutsOf, layoutDef, validateSlideContent, type Cut, type Fields, type LayoutId } from './layouts';
import { clip, drawOne, scriptSlideOf, slideProblems, stubPack, isObj, words, type Drawn, type LibraryReport, type SlideSpec } from './designLibrary';
import { cleanPaste, validateScriptText } from './script';
import type { CarouselScript } from '../image-engine/carousel/types';
import type { WriteProvider } from './writer';

// ----- moving the text between layouts -----
/** The text of a slide by meaning, whatever layout holds it. */
interface Canon {
  head: string;
  kicker: string;
  sub: string;
  body: string;
  number: string;
  label: string;
  bar: string;
  quote: string;
  author: string;
  button: string;
  items: string[];
  lines: string[];
  numbers: string[];
  labels: string[];
  /** Layouts whose fields cannot be mapped (a comparison keeps its four texts): only the same layout takes them. */
  own?: { layout: string; fields: Fields };
}
const txt = (f: Fields, k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '');
const lst = (f: Fields, k: string) => (Array.isArray(f[k]) ? (f[k] as string[]).map((x) => x.trim()).filter(Boolean) : []);
const empty = (): Canon => ({ head: '', kicker: '', sub: '', body: '', number: '', label: '', bar: '', quote: '', author: '', button: '', items: [], lines: [], numbers: [], labels: [] });

export function toCanon(layout: string, f: Fields): Canon {
  const c = empty();
  switch (layout) {
    case 'statement': return { ...c, head: txt(f, 'headline'), kicker: txt(f, 'kicker'), sub: txt(f, 'caption') };
    case 'lead-statement': return { ...c, kicker: txt(f, 'lead'), head: txt(f, 'headline') };
    case 'big-question': return { ...c, head: txt(f, 'question'), sub: txt(f, 'line') };
    case 'photo-led': return { ...c, head: txt(f, 'headline'), kicker: txt(f, 'kicker') };
    case 'split-text': return { ...c, head: txt(f, 'headline'), body: txt(f, 'paragraph') };
    case 'big-stat': return { ...c, number: txt(f, 'number'), label: txt(f, 'label'), sub: txt(f, 'source') };
    case 'stat-bar': return { ...c, number: txt(f, 'number'), label: txt(f, 'label'), bar: txt(f, 'bar'), sub: txt(f, 'note') };
    case 'stepper': return { ...c, head: txt(f, 'title'), items: lst(f, 'steps') };
    case 'step-numeral': return { ...c, number: txt(f, 'step'), head: txt(f, 'title'), body: txt(f, 'body') };
    case 'listicle-numeral': return { ...c, number: txt(f, 'numeral'), head: txt(f, 'title'), body: txt(f, 'body') };
    case 'checklist': case 'numbered-list': return { ...c, head: txt(f, 'title'), items: lst(f, 'items') };
    case 'quote': return { ...c, quote: txt(f, 'quote'), author: txt(f, 'author'), head: txt(f, 'quote'), sub: txt(f, 'author') };
    case 'cta-button': return { ...c, head: txt(f, 'headline'), button: txt(f, 'button'), sub: txt(f, 'sub') };
    case 'feature-slider': return { ...c, head: txt(f, 'title'), body: txt(f, 'body'), own: { layout, fields: f } };
    case 'card-grid': return { ...c, head: txt(f, 'title'), items: lst(f, 'cardTitles'), lines: lst(f, 'cardLines') };
    case 'stat-grid': return { ...c, head: txt(f, 'title'), numbers: lst(f, 'numbers'), labels: lst(f, 'labels') };
    case 'timeline': return { ...c, head: txt(f, 'title'), labels: lst(f, 'labels'), items: lst(f, 'events') };
    case 'spotlight': return { ...c, head: txt(f, 'subject'), items: lst(f, 'callouts') };
    case 'comparison': return { ...c, head: txt(f, 'title'), own: { layout, fields: f } };
    default: return c;
  }
}
const put = (o: Fields, k: string, v: string | string[]) => {
  if (Array.isArray(v) ? v.length : v) o[k] = v;
};
/** The fields a layout would get from the text, or null when the text does not have what the layout needs (nothing is made up to fill it). */
export function fromCanon(layout: string, c: Canon, hasPhoto: boolean): Fields | null {
  const o: Fields = {};
  const head = c.head || c.quote;
  switch (layout) {
    case 'statement': put(o, 'headline', head); put(o, 'kicker', c.kicker); put(o, 'caption', c.sub || (words(c.body) <= 10 ? c.body : '')); break;
    case 'lead-statement': put(o, 'lead', c.kicker || c.sub); put(o, 'headline', head); break;
    case 'big-question': put(o, 'question', head); put(o, 'line', c.sub); break;
    case 'photo-led': if (!hasPhoto) return null; put(o, 'headline', head); put(o, 'kicker', c.kicker); break;
    case 'split-text': put(o, 'headline', head); put(o, 'paragraph', c.body || c.sub); break;
    case 'big-stat': put(o, 'number', c.number); put(o, 'label', c.label); put(o, 'source', c.sub); break;
    case 'stat-bar': if (!c.bar) return null; put(o, 'number', c.number); put(o, 'label', c.label); put(o, 'bar', c.bar); put(o, 'note', c.sub); break;
    case 'stepper': put(o, 'title', head); put(o, 'steps', c.items); break;
    case 'step-numeral': put(o, 'step', c.number); put(o, 'title', head); put(o, 'body', c.body || c.sub); break;
    case 'listicle-numeral': put(o, 'numeral', c.number); put(o, 'title', head); put(o, 'body', c.body || c.sub); break;
    case 'checklist': case 'numbered-list': put(o, 'title', head); put(o, 'items', c.items); break;
    case 'quote': put(o, 'quote', c.quote || head); put(o, 'author', c.author || c.sub); break;
    case 'cta-button': if (!c.button) return null; put(o, 'headline', head); put(o, 'button', c.button); put(o, 'sub', c.sub); break;
    case 'card-grid': if (!c.lines.length) return null; put(o, 'title', head); put(o, 'cardTitles', c.items); put(o, 'cardLines', c.lines); break;
    case 'stat-grid': if (!c.numbers.length) return null; put(o, 'title', head); put(o, 'numbers', c.numbers); put(o, 'labels', c.labels); break;
    case 'timeline': if (!c.labels.length || !c.items.length) return null; put(o, 'title', head); put(o, 'labels', c.labels); put(o, 'events', c.items); break;
    case 'spotlight': put(o, 'subject', head); put(o, 'callouts', c.items); break;
    case 'feature-slider': case 'comparison': return c.own?.layout === layout ? { ...c.own.fields } : null;
    default: return null;
  }
  return o;
}

export interface LayoutOption {
  layout: LayoutId;
  /** The slide's fields in this layout (without accents). */
  fields: Fields;
  /** The texts of the slide this layout would not show. */
  dropped: string[];
  current: boolean;
}
const flat = (f: Fields): string[] => Object.entries(f).filter(([k]) => k !== 'accent').flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map((x) => String(x).trim()).filter(Boolean);

/** Every layout that can take this slide's text, the slide's own layout first. */
export function layoutOptions(spec: SlideSpec, look: Look): LayoutOption[] {
  const own = Object.fromEntries(Object.entries(spec.fields).filter(([k]) => k !== 'accent')) as Fields;
  const c = toCanon(spec.layout, own);
  const have = flat(own);
  const out: LayoutOption[] = [{ layout: spec.layout as LayoutId, fields: own, dropped: [], current: true }];
  for (const id of LAYOUT_IDS) {
    if (id === spec.layout) continue;
    const f = fromCanon(id, c, !!look.hasPhoto);
    if (!f || !validateSlideContent(id, f).ok) continue;
    const used = new Set(flat(f));
    out.push({ layout: id, fields: f, dropped: have.filter((t) => !used.has(t)), current: false });
  }
  return out;
}
/** The accent phrases that still stand in the new text. */
export const accentsIn = (accents: string[], f: Fields): string[] => {
  const t = flat(f).join(' \n ').toLowerCase();
  return accents.filter((a) => t.includes(a.toLowerCase()));
};

// ----- the picture of each option -----
export interface PickChoice {
  layout?: LayoutId;
  variant?: 0 | 1;
  cut?: Cut;
  invert?: false | 'full' | 'tint';
}
export interface PickTile {
  kind: 'layout' | 'cut' | 'variant' | 'invert';
  id: string;
  label: string;
  current: boolean;
  /** Plain words about what this option leaves out (layouts) or why it is not shown. */
  note?: string;
  choice: PickChoice;
  svg: string;
}
/** The slide as it is now: the layout, variant, cut and invert the last drawing used. */
export function currentOf(lib: LibraryReport, i: number): { variant: 0 | 1; cut: Cut; invert: false | 'full' | 'tint'; density: 'normal' | 'statement' } {
  const inv = lib.inverts[i];
  return { variant: (((lib.variants[i] ?? 1) - 1) % 2) as 0 | 1, cut: (lib.cuts[i] as Cut) ?? 'plain', invert: inv === 'full' || inv === 'tint' ? inv : false, density: lib.densities[i] === 'statement' ? 'statement' : 'normal' };
}
const CUT_LABEL: Record<string, string> = { plain: 'No plane', 'edge-h': 'Bottom plane', 'edge-v': 'Side plane', angle: 'Angled plane', curve: 'Curved plane' };

/**
 * Draws every option of the slide for the picker (the code draws; no model). The layouts that can take the text, then the cuts of the current layout, the other variant and
 * the inverted look. `onTile` is called as each one is ready.
 */
export async function previewOptions(lib: LibraryReport, look: Look, handle: string, i: number, onTile: (t: PickTile) => void): Promise<PickTile[]> {
  if (!lib.plan) return [];
  const style = lib.style; // the style the deck was drawn in (the person's overrides included)
  const spec = lib.plan.specs[i];
  const total = lib.plan.specs.length;
  const cur = currentOf(lib, i);
  const tiles: PickTile[] = [];
  const emit = (t: PickTile) => {
    tiles.push(t);
    onTile(t);
  };
  const draw = async (layout: LayoutId, fields: Fields, accents: string[], v: 0 | 1, cut: Cut, invert: false | 'full' | 'tint', density: 'normal' | 'statement'): Promise<Drawn> =>
    drawOne({ layout, fields, accents, ...(density === 'statement' ? { density } : {}) }, v, style, { handle, index: i, total, cut: cutsOf(layout).includes(cut) ? cut : 'plain', invert, density, ...(lib.grounds?.[i] != null ? { ground: lib.grounds[i]! } : {}) });
  for (const o of layoutOptions(spec, look)) {
    const same = o.current;
    const accents = accentsIn(spec.accents, o.fields);
    const d = await draw(o.layout, o.fields, accents, cur.variant, cur.cut, cur.invert, same ? cur.density : 'normal');
    if (!d.built) continue;
    emit({ kind: 'layout', id: o.layout, label: layoutDef(o.layout)!.label, current: same, note: o.dropped.length ? `Leaves out: ${o.dropped.map((t) => '"' + clip(t, 30) + '"').join(', ')}` : undefined, choice: { layout: o.layout }, svg: d.built.svg });
  }
  const stay = (cut: Cut, invert: false | 'full' | 'tint', v: 0 | 1) => draw(spec.layout as LayoutId, spec.fields, spec.accents, v, cut, invert, cur.density).then((d) => ({ d }));
  for (const cut of cutsOf(spec.layout)) {
    if (cut === cur.cut) continue;
    const { d } = await stay(cut, cur.invert, cur.variant);
    // a cut the content does not fit is drawn as another one by the code: it is not offered twice
    if (d.built && d.cut === cut) emit({ kind: 'cut', id: cut, label: CUT_LABEL[cut] ?? cut, current: false, choice: { cut }, svg: d.built.svg });
  }
  {
    const { d } = await stay(cur.cut, cur.invert, (1 - cur.variant) as 0 | 1);
    if (d.built) emit({ kind: 'variant', id: 'variant', label: 'Other variant', current: false, choice: { variant: (1 - cur.variant) as 0 | 1 }, svg: d.built.svg });
  }
  {
    const to = cur.invert ? false : 'full';
    const { d } = await stay(cur.cut, to, cur.variant);
    if (d.built && d.invert === !!to) emit({ kind: 'invert', id: 'invert', label: cur.invert ? 'Normal colours' : 'Inverted colours', current: false, choice: { invert: to }, svg: d.built.svg });
  }
  return tiles;
}

// ----- drawing one slide again -----
export type SlideRedraw = { ok: true; slide: DesignedSlide; layout: string; spec: SlideSpec; library: LibraryReport; scriptSlide: Record<string, unknown> } | { ok: false; reasons: string[] };

/** Draws slide `i` again from the stored plan with the person's choice (a layout, a cut, the variant, the invert) or with new fields. Nothing else in the deck changes. No model call. */
export async function redrawLibrarySlide(lib: LibraryReport, look: Look, handle: string, i: number, ch: PickChoice & { fields?: Fields; accents?: string[] }): Promise<SlideRedraw> {
  if (!lib.plan) return { ok: false, reasons: ['This deck has no stored plan to draw from.'] };
  const style = lib.style; // the style the deck was drawn in (the person's overrides included)
  const cur = lib.plan.specs[i];
  if (!cur) return { ok: false, reasons: [`There is no slide ${i + 1} in the plan.`] };
  const now = currentOf(lib, i);
  const layout = (ch.layout ?? cur.layout) as LayoutId;
  let fields = Object.fromEntries(Object.entries(cur.fields).filter(([k]) => k !== 'accent')) as Fields;
  let accents = cur.accents;
  if (layout !== cur.layout) {
    const opt = layoutOptions(cur, look).find((o) => o.layout === layout);
    if (!opt) return { ok: false, reasons: [`The text of slide ${i + 1} cannot be moved to "${layout}" without making text up.`] };
    fields = opt.fields;
    accents = accentsIn(cur.accents, fields);
  }
  if (ch.fields) {
    fields = ch.fields;
    accents = ch.accents ?? accentsIn(accents, fields);
  }
  const variant = ch.variant ?? now.variant;
  const cut: Cut = ch.cut ?? (cutsOf(layout).includes(now.cut) ? now.cut : 'plain');
  const invert = ch.invert !== undefined ? ch.invert : now.invert;
  const density = layout === cur.layout ? now.density : 'normal';
  const spec: SlideSpec = { layout, fields, accents, ...(density === 'statement' ? { density } : {}) };
  const problems = slideProblems(spec, look);
  if (problems.length) return { ok: false, reasons: problems };
  const d = await drawOne(spec, variant, style, { handle, index: i, total: lib.plan.specs.length, cut, invert, density, ...(lib.grounds?.[i] != null ? { ground: lib.grounds[i]! } : {}) });
  if (!d.built) return { ok: false, reasons: d.problems };
  const pinned: SlideSpec = { ...spec, pin: { variant, cut: d.cut, invert: d.invert ? invert || 'full' : false } };
  const specs = lib.plan.specs.map((s, k) => (k === i ? pinned : s));
  const arr = <T,>(a: T[], v: T) => a.map((x, k) => (k === i ? v : x));
  const library: LibraryReport = {
    ...lib,
    layouts: arr(lib.layouts, layout),
    variants: arr(lib.variants, variant + 1),
    cuts: arr(lib.cuts, d.cut as string),
    inverts: arr(lib.inverts, d.invert ? invert || 'full' : 'none'),
    densities: arr(lib.densities, d.density),
    plan: { ...lib.plan, specs },
    redraws: (lib.redraws ?? 0) + 1,
  };
  const slide: DesignedSlide = { pack: stubPack(style, 'library'), built: { svg: d.built.svg, layers: d.built.layers as Layer[], bg: d.built.fieldBg ?? style.palette.bg } };
  return { ok: true, slide, layout, spec: pinned, library, scriptSlide: scriptSlideOf(layout, fields) };
}

/** The deck's script with slide `i` replaced by the library slide's script form (checked by the script validator like at creation). */
export function scriptWithSlide(script: CarouselScript, i: number, raw: Record<string, unknown>, format: 'carousel' | 'quote'): { ok: true; script: CarouselScript } | { ok: false; reasons: string[] } {
  const next = { ...script, slides: script.slides.map((s, k) => (k === i ? raw : s)) };
  const v = validateScriptText(JSON.stringify(next), format);
  if (!v.script) return { ok: false, reasons: v.errors.slice(0, 3).map((e) => e.message) };
  return { ok: true, script: { ...v.script, brand: script.brand } };
}

// ----- Rewrite text: one small model call for one slide -----
const fieldNote = (id: LayoutId): string => {
  const def = layoutDef(id)!;
  return def.fields.map((f) => `"${f.name}"${f.required ? '' : ' (optional)'}: ${f.list ? `a list of ${f.list.min === f.list.max ? f.list.min : f.list.min + ' to ' + f.list.max} strings, each at most ${f.max} characters` : `a string of at most ${f.max} characters${f.maxWords ? ' and at most ' + f.maxWords + ' words' : ''}`}${f.percent ? ' (a whole number 0-100)' : ''}`).join('; ');
};
export function buildRewritePrompt(spec: SlideSpec, index: number, total: number, source: string, neighbours: string[], words0: string): string {
  const id = spec.layout as LayoutId;
  return [
    '[carousel:rewrite]',
    `Rewrite the text of ONE slide (slide ${index + 1} of ${total}) of a carousel. Keep the layout "${id}" and write new text for ITS fields only. You never draw: no SVG, no colours.`,
    `Fields of ${id}: ${fieldNote(id)}.`,
    id === 'big-stat' || id === 'stat-bar' ? 'The "label" finishes the number: "number label" reads as one phrase ("30%" + "off for early backers").' : '',
    id === 'split-text' ? 'The paragraph is ONE idea in at most 14 words.' : '',
    '',
    'The slide now (JSON):',
    JSON.stringify({ fields: spec.fields, accents: spec.accents }),
    neighbours.length ? ['', 'The slides around it (do not repeat them):', ...neighbours.map((n) => '- ' + n)].join('\n') : '',
    '',
    '<text>',
    source.trim().slice(0, 6000),
    '</text>',
    '',
    words0.trim() ? `The person asks: ${words0.trim().slice(0, 200)}` : 'Say the same point in fresh, plainer words that fit the limits.',
    'Use only facts, numbers and names that are in the text. Never invent any.',
    'Reply with ONE JSON object and nothing else: {"fields": {...}, "accents": ["up to 3 phrases copied exactly from the headline text"]}',
  ].filter((x) => x !== '').join('\n');
}
export type Rewrite = { ok: true; slide: SlideRedraw & { ok: true }; calls: number; tokens: { input: number; output: number } } | { ok: false; reasons: string[]; calls: number };

/** One model call (and, if the answer breaks a limit, ONE more) for slide `i` only. The new text is drawn in the same layout, variant and cut. */
export async function rewriteSlideText(lib: LibraryReport, look: Look, handle: string, i: number, source: string, wordsFor: string, p: WriteProvider, signal: AbortSignal): Promise<Rewrite> {
  if (!lib.plan) return { ok: false, reasons: ['This deck has no stored plan.'], calls: 0 };
  const spec = lib.plan.specs[i];
  const neighbours = [i - 1, i + 1].filter((k) => lib.plan!.specs[k]).map((k) => `slide ${k + 1} (${lib.plan!.specs[k].layout}): ${flat(lib.plan!.specs[k].fields).join(' / ').slice(0, 160)}`);
  let prompt = buildRewritePrompt(spec, i, lib.plan.specs.length, source, neighbours, wordsFor);
  let calls = 0;
  const tokens = { input: 0, output: 0 };
  let last: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await p.write(prompt, signal, 'write');
    calls++;
    tokens.input += a.usage?.input ?? 0;
    tokens.output += a.usage?.output ?? 0;
    let j: unknown;
    try {
      j = JSON.parse(cleanPaste(a.text));
    } catch (e) {
      last = ['The answer is not valid JSON.'];
      prompt += '\n\nYour previous answer was not valid JSON. Reply again with the JSON object only.';
      continue;
    }
    const raw = isObj(j) && isObj(j.fields) ? j.fields : null;
    if (!raw) {
      last = ['The answer has no "fields" object.'];
      prompt += '\n\nYour previous answer had no "fields" object. Reply again with {"fields": {...}, "accents": [...]}.';
      continue;
    }
    const fields: Fields = {};
    for (const f of layoutDef(spec.layout)!.fields) {
      const v = raw[f.name];
      if (Array.isArray(v)) fields[f.name] = v.map((x) => String(x));
      else if (typeof v === 'string' || typeof v === 'number') fields[f.name] = String(v);
    }
    const accRaw = isObj(j) && Array.isArray(j.accents) ? j.accents : [];
    const accents = accRaw.map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
    const check = validateSlideContent(spec.layout, { ...fields, ...(accents.length ? { accent: accents } : {}) });
    if (!check.ok) {
      last = check.errors;
      prompt += '\n\nYour previous answer breaks these limits:\n' + check.errors.map((e) => '- ' + e).join('\n') + '\nReply again with the JSON object only.';
      continue;
    }
    const r = await redrawLibrarySlide(lib, look, handle, i, { fields, accents: accentsIn(accents, fields) });
    if (!r.ok) {
      last = r.reasons;
      prompt += '\n\nThat text could not be drawn: ' + r.reasons.join(' ') + '\nReply again with the JSON object only.';
      continue;
    }
    // the report counts this call
    const library: LibraryReport = { ...r.library, calls: r.library.calls + calls, tokens: tokens.input || tokens.output || r.library.tokens ? { input: (r.library.tokens?.input ?? 0) + tokens.input, output: (r.library.tokens?.output ?? 0) + tokens.output } : null };
    return { ok: true, slide: { ...r, library }, calls, tokens };
  }
  // The model's text cannot be used: nothing changes.
  return { ok: false, reasons: last.length ? last : ['The new text could not be used.'], calls };
}

