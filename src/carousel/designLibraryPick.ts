// The layout picker and "Rewrite text" for a library slide.
//  - layoutOptions(): every layout that can take the slide's fields (the text is MAPPED between layouts, never invented), with what the move would leave out.
//  - previewOptions(): the picture of each option (layouts, cuts, variant, invert), drawn by the code.
//  - redrawLibrarySlide(): draws ONE slide again from the stored plan with the person's choice. No model call.
//  - rewriteSlideText(): the only model call here: one small call for one slide, new text for the SAME layout.
import type { Layer } from '../image-engine/types';
import type { DesignedSlide, Look } from './designed';
import { cutsOf, layoutDef, LAYOUT_IDS, placeholderImage, validateSlideContent, type Cut, type Fields, type LayoutId } from './layouts';
import { clip, drawOne, scriptSlideOf, slideProblems, stubPack, isObj, type Drawn, type LibraryReport, type SlideSpec } from './designLibrary';
import { cleanPaste, validateScriptText } from './script';
import { imageSlotsOf } from './layouts/images';
import { placeOne, unusedPictures, withoutImages } from './imagePlace';
import type { CarouselScript } from '../image-engine/carousel/types';
import type { WriteProvider } from './writer';

// ----- moving the text between layouts: see layoutMap.ts -----
import { accentsIn, flat, layoutOptions, layoutRefusals } from './layoutMap';
export { accentsIn, fromCanon, layoutOptions, layoutRefusals, toCanon, type LayoutOption } from './layoutMap';

// ----- the picture of each option -----
export interface PickChoice {
  layout?: LayoutId;
  variant?: 0 | 1;
  cut?: Cut;
  invert?: false | 'full' | 'tint';
  /** Changes to the slide's pin (the picture picker: the pinned picture and the slide as the deck made it). A key set to undefined is removed. */
  pin?: Partial<NonNullable<SlideSpec['pin']>>;
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

// ----- the gallery: every layout of the registry, each in both variants, drawn with THIS slide's text -----
export interface GalleryEntry {
  layout: LayoutId;
  label: string;
  variants: [string, string];
  /** This slide's own layout. */
  current: boolean;
  enabled: boolean;
  /** One line: why a greyed-out layout cannot be used (and, for an enabled one, what it would leave out). */
  reason?: string;
}
export interface GalleryModel {
  entries: GalleryEntry[];
  /** The slide's own variant (0 or 1). */
  variant: 0 | 1;
  cuts: { id: Cut; label: string; current: boolean }[];
  invert: false | 'full' | 'tint';
  /** Changes whenever a thumbnail would look different (the slide's text, the style, the look of the slide): the cache key. */
  signature: string;
}
const hash = (s: string): string => {
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) | 0;
  return (h >>> 0).toString(36);
};
/** The gallery of slide `i`: ALL layouts of the registry (LAYOUT_IDS), the ones that can take the slide's text enabled, the others greyed with their reason. Nothing is drawn here. */
export function galleryModel(lib: LibraryReport, look: Look, handle: string, i: number): GalleryModel | null {
  const spec = lib.plan?.specs[i];
  if (!lib.plan || !spec) return null;
  const cur = currentOf(lib, i);
  const options = new Map(layoutOptions(spec, look).map((o) => [o.layout as string, o]));
  const why = layoutRefusals(spec, look);
  const entries: GalleryEntry[] = LAYOUT_IDS.map((id) => {
    const def = layoutDef(id)!;
    const o = options.get(id);
    return { layout: id, label: def.label, variants: def.variants, current: id === spec.layout, enabled: !!o, reason: o ? (o.dropped.length ? `Leaves out: ${o.dropped.map((t) => '"' + clip(t, 24) + '"').join(', ')}` : undefined) : why[id] ?? 'This slide\'s text does not fit this layout.' };
  });
  entries.sort((a, b) => Number(b.current) - Number(a.current) || Number(b.enabled) - Number(a.enabled));
  const CUT_LABELS = CUT_LABEL;
  const signature = hash(JSON.stringify([spec.layout, spec.fields, spec.accents, cur, handle, i, lib.plan.specs.length, lib.grounds?.[i] ?? null, !!look.hasPhoto, lib.style]));
  return { entries, variant: cur.variant, cuts: cutsOf(spec.layout).map((c) => ({ id: c, label: CUT_LABELS[c] ?? c, current: c === cur.cut })), invert: cur.invert, signature };
}
/** The picture of one gallery tile: the layout in the given variant with this slide's text, the slide's current plane and colours. null when the code cannot draw it. */
export async function drawGalleryTile(lib: LibraryReport, look: Look, handle: string, i: number, layout: LayoutId, variant: 0 | 1): Promise<string | null> {
  const spec = lib.plan?.specs[i];
  if (!lib.plan || !spec) return null;
  const cur = currentOf(lib, i);
  const same = layout === spec.layout;
  const o = same ? null : layoutOptions(spec, look).find((x) => x.layout === layout);
  if (!same && !o) return null;
  const fields0 = same ? (Object.fromEntries(Object.entries(spec.fields).filter(([k]) => k !== 'accent')) as Fields) : o!.fields;
  // a layout with a picture field is shown with a neutral stand-in (a flat tint with a sun and hills): clearly generic, never a photograph
  const pics = (layoutDef(layout)?.fields ?? []).filter((q) => q.image).map((q) => q.name);
  const fields: Fields = pics.length ? { ...fields0, ...Object.fromEntries(pics.map((k, i) => [k, placeholderImage(layout === 'portrait-closing' ? 'portrait' : i % 2 ? 'art' : 'photo')])) } : fields0;
  const accents = same ? spec.accents : accentsIn(spec.accents, fields);
  const density = same ? cur.density : 'normal';
  const d = await drawOne({ layout, fields, accents, ...(density === 'statement' ? { density } : {}) }, variant, lib.style, { handle, index: i, total: lib.plan.specs.length, cut: cutsOf(layout).includes(cur.cut) ? cur.cut : 'plain', invert: cur.invert, density, ...(lib.grounds?.[i] != null ? { ground: lib.grounds[i]! } : {}) });
  return d.built ? d.built.svg : null;
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
    // (a caller that hands over the fields itself, like the picture picker, has already kept every word)
    if (!opt && !ch.fields) return { ok: false, reasons: [`The text of slide ${i + 1} cannot be moved to "${layout}" without making text up.`] };
    if (opt) {
      fields = opt.fields;
      accents = accentsIn(cur.accents, fields);
    }
  }
  if (ch.fields) {
    fields = ch.fields;
    accents = ch.accents ?? accentsIn(accents, fields);
  }
  const variant = ch.variant ?? now.variant;
  // a slide moved to a layout with picture slots takes the project's pictures that no other slide uses (best fit); a layout that cannot get enough draws its text-only form
  if (layout !== cur.layout && !ch.fields) {
    fields = withoutImages(fields);
    if (look.images?.length && imageSlotsOf(layout).length) {
      const got = placeOne(layout, variant, unusedPictures(lib.plan.specs, look.images, i));
      if (got) fields = { ...fields, ...got };
    }
  }
  const cut: Cut = ch.cut ?? (cutsOf(layout).includes(now.cut) ? now.cut : 'plain');
  const invert = ch.invert !== undefined ? ch.invert : now.invert;
  const density = layout === cur.layout ? now.density : 'normal';
  const spec: SlideSpec = { layout, fields, accents, ...(density === 'statement' ? { density } : {}) };
  const problems = slideProblems(spec, look);
  if (problems.length) return { ok: false, reasons: problems };
  const d = await drawOne(spec, variant, style, { handle, index: i, total: lib.plan.specs.length, cut, invert, density, ...(lib.grounds?.[i] != null ? { ground: lib.grounds[i]! } : {}) });
  if (!d.built) return { ok: false, reasons: d.problems };
  // (a picture the person pinned stays pinned through any later redraw of the slide: the pin is merged, never replaced)
  const pinObj = { ...cur.pin, ...ch.pin, variant, cut: d.cut, invert: d.invert ? invert || 'full' : false } as NonNullable<SlideSpec['pin']>;
  for (const k of Object.keys(pinObj) as (keyof typeof pinObj)[]) if (pinObj[k] === undefined) delete pinObj[k];
  const pinned: SlideSpec = { ...spec, pin: pinObj };
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
  const slide: DesignedSlide = { pack: stubPack(style, 'library'), built: { svg: d.built.svg, layers: d.built.layers as Layer[], bg: d.built.fieldBg ?? style.palette.bg, ...(d.built.devices ? { devices: d.built.devices } : {}), ...(d.built.images ? { images: d.built.images } : {}) } };
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

