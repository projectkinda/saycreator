// The layout picker and "Rewrite text" for a library slide.
//  - layoutOptions(): every layout that can take the slide's fields (the text is MAPPED between layouts, never invented), with what the move would leave out.
//  - previewOptions(): the picture of each option (layouts, cuts, variant, invert), drawn by the code.
//  - redrawLibrarySlide(): draws ONE slide again from the stored plan with the person's choice. No model call.
//  - rewriteSlideText(): the only model call here: one small call for one slide, new text for the SAME layout.
import type { Layer } from '../image-engine/types';
import type { DesignedSlide, Look } from './designed';
import { cutsOf, layoutDef, LAYOUT_IDS, validateSlideContent, type Cut, type Fields, type LayoutId } from './layouts';
import { clip, drawOne, scriptSlideOf, slideProblems, stubPack, isObj, type Drawn, type LibraryReport, type SlideSpec } from './designLibrary';
import { cleanPaste, validateScriptText } from './script';
import { imageSlotsOf, isImageKey, type PicInfo } from './layouts/images';
import { placeOne, unusedPictures, usedIds, withoutImages } from './imagePlace';
import type { CarouselScript } from '../image-engine/carousel/types';
import type { WriteProvider } from './writer';

// ----- moving the text between layouts: see layoutMap.ts -----
import { accentsIn, addedNumber, flat, layoutOptions, layoutRefusals, nearOptions, type LayoutOption } from './layoutMap';
import { BLOCK_LABEL, plainVariant } from './plainWords';
export { accentsIn, fromCanon, layoutOptions, layoutRefusals, toCanon, type LayoutOption } from './layoutMap';

// ----- the picture of each option -----
export interface PickChoice {
  layout?: LayoutId;
  variant?: 0 | 1;
  cut?: Cut;
  invert?: false | 'full' | 'tint';
  /** Round AM: the layout picker may put a picture another slide also shows on this slide when no free picture fits (the tile said so: "Photo also used on slide 3"). */
  reuse?: true;
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
// Round AL part 1: the colour block shapes in plain words (they were called planes)
const CUT_LABEL: Record<string, string> = BLOCK_LABEL;

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
  /** Round AL part 4 fix: an enabled layout that would leave a line of the slide out. */
  drops?: boolean;
  /** Round AL part 4 fix: a picture layout (not the slide's own) that would get no FREE picture: every picture that fits is on another slide. */
  noPicture?: boolean;
  /**
   * Round AM: how the layout fits this slide. 'clean': every word, a picture of its own; 'change': it fits with a change the tile names (badges) and the person accepts; 'off': it
   * cannot work (the reason says why).
   */
  fit: 'clean' | 'change' | 'off';
  /** Round AM: the changes of a 'change' layout: the number put before the headline, the lines it leaves out (a click asks first), the slides that also show its picture. */
  change?: { number?: string; drops?: string[]; photoFrom?: number[] };
  /** Round AM: the change in plain words, one line each ("Adds '1.' before the headline", "Leaves out: ...", "Photo also used on slide 3"). */
  badges?: string[];
  /** Round AM part 2: a layout that leaves out words the slide's own layout requires (nearOptions): only the person picks it, after the question. */
  near?: true;
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
  // Round AM: the words the picker maps from: the slide's own, or the words kept from before a move that left a line out (so the line comes back)
  const src = sourceOf(spec);
  const options = new Map(layoutOptions(src, look).map((o) => [o.layout as string, o]));
  // Round AM part 2: and the layouts that leave out words the slide's own layout requires (a closing's buttons): tiles that ask first
  const near = new Set<string>();
  for (const o of nearOptions(src, look)) if (!options.has(o.layout)) { options.set(o.layout, o); near.add(o.layout); }
  const why = layoutRefusals(src, look);
  const free = look.images?.length ? unusedPictures(lib.plan.specs, look.images, i) : [];
  const entries: GalleryEntry[] = LAYOUT_IDS.map((id) => {
    const def = layoutDef(id)!;
    const o = options.get(id);
    const current = id === spec.layout;
    const base = { layout: id, label: def.label, variants: def.variants.map(plainVariant) as [string, string], current };
    if (!o && !current) return { ...base, enabled: false, fit: 'off' as const, reason: why[id] ?? 'This slide\'s text does not fit this layout.' };
    // the same placement a click makes (choiceDraw): the project pictures no other slide uses, in the slide's look; when none fits, a picture another slide also shows
    const noPicture = !!o && !current && imageSlotsOf(id).length > 0 && !placeOne(id, cur.variant, free);
    const pics = noPicture ? picturesFor(lib.plan!.specs, look.images ?? [], i, id, cur.variant, true) : null;
    const change: NonNullable<GalleryEntry['change']> = {};
    const number = o && !current ? addedNumber(src, o) : '';
    if (number) change.number = number;
    if (o?.dropped.length) change.drops = o.dropped;
    if (pics?.fields) change.photoFrom = pics.from;
    const badges = badgesOf(change);
    const reason = noPicture && !pics?.fields ? 'None of your pictures fits this layout\'s picture space.' : badges.length ? badges.join('. ') + '.' : undefined;
    const fit: GalleryEntry['fit'] = current ? 'clean' : noPicture && !pics?.fields ? 'off' : badges.length ? 'change' : 'clean';
    return { ...base, enabled: true, fit, reason, ...(near.has(id) && !current ? { near: true as const } : {}), ...(o?.dropped.length ? { drops: true } : {}), ...(noPicture ? { noPicture: true } : {}), ...(badges.length ? (current ? { badges } : { change, badges }) : {}) };
  });
  entries.sort((a, b) => Number(b.current) - Number(a.current) || Number(b.enabled) - Number(a.enabled));
  const CUT_LABELS = CUT_LABEL;
  const signature = hash(JSON.stringify([spec.layout, spec.fields, spec.accents, spec.left ?? null, cur, handle, i, lib.plan.specs.length, lib.grounds?.[i] ?? null, !!look.hasPhoto, lib.style]));
  return { entries, variant: cur.variant, cuts: cutsOf(spec.layout).map((c) => ({ id: c, label: CUT_LABELS[c] ?? c, current: c === cur.cut })), invert: cur.invert, signature };
}
/** Round AM: the plain words of a change, one line each. */
function badgesOf(c: NonNullable<GalleryEntry['change']>): string[] {
  const out: string[] = [];
  if (c.number) out.push(`Adds '${c.number}.' before the headline`);
  if (c.drops?.length) out.push(`Leaves out: ${c.drops.map((t) => '"' + clip(t, 40) + '"').join(', ')}`);
  if (c.photoFrom?.length) out.push(c.photoFrom.length === 1 ? `Photo also used on slide ${c.photoFrom[0]}` : `Photos also used on slides ${c.photoFrom.slice(0, -1).join(', ')} and ${c.photoFrom[c.photoFrom.length - 1]}`);
  return out;
}
/** Round AM: a slide's words, the picture fields left out: what `left.at` compares. */
const wordsKey = (f: Fields): string => JSON.stringify(Object.entries(f).filter(([k]) => k !== 'accent' && !isImageKey(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
/** Round AM: the slide the layout picker maps from: the words kept from before a move that left a line out, while the slide's words are still the ones that move gave; else the slide. */
export function sourceOf(spec: SlideSpec): SlideSpec {
  const l = spec.left;
  return l && l.layout !== spec.layout && l.at === wordsKey(spec.fields) ? { layout: l.layout, fields: l.fields, accents: l.accents } : spec;
}
/** Round AM part 3: the slide's text fields as strings and lists (no picture field, no accent). */
const textFields = (f: Fields): Record<string, string | string[]> => Object.fromEntries(Object.entries(f).filter(([k, v]) => k !== 'accent' && !isImageKey(k) && v != null && v !== '')) as Record<string, string | string[]>;
/**
 * Round AM part 3: the kept words of the slide (from before a layout switch that left them out) that it does not show now: what "Bring it back" brings back. Empty when nothing
 * is kept, or when the switch only put the item's number before the headline.
 */
export function leftOutOf(spec: SlideSpec): string[] {
  if (sourceOf(spec) === spec) return [];
  const shown = flat(spec.fields);
  return flat(spec.left!.fields).filter((t) => !shown.some((u) => u === t || u.includes(t)));
}
/**
 * Round AM part 3: the kept words after a text edit in the same layout. Each changed line of the slide is changed the same way in the kept words (the line as it is there,
 * or without the "1." the switch put in front); the kept words then match the edited slide, so the picker and "Bring it back" use the person's edits. Nothing is kept (undefined)
 * when the edit wrote the left-out words back, wrote into a part of the slide that was empty (where the left-out line would go), or changed a line the kept words cannot follow.
 */
function carryLeft(cur: SlideSpec, next: Fields): SlideSpec['left'] {
  const l = cur.left!;
  const lost = leftOutOf(cur);
  if (!lost.length) return undefined;
  const before = textFields(cur.fields);
  const after = textFields(next);
  const shownAfter = flat(next);
  if (lost.some((t) => shownAfter.some((u) => u === t || u.includes(t)))) return undefined;
  if (Object.keys(after).some((k) => !(k in before))) return undefined;
  const NUM = /^\d{1,2}\. /;
  let kept = flat(l.fields).length ? (JSON.parse(JSON.stringify(l.fields)) as Fields) : null;
  if (!kept) return undefined;
  const pairs: [string, string][] = [];
  for (const k of Object.keys(before)) {
    const a = before[k], b = after[k] ?? (Array.isArray(a) ? [] : '');
    const as = Array.isArray(a) ? a : [a], bs = Array.isArray(b) ? b : [b];
    for (let n = 0; n < Math.max(as.length, bs.length); n++) if ((as[n] ?? '') !== (bs[n] ?? '')) pairs.push([as[n] ?? '', bs[n] ?? '']);
  }
  for (const [a, b] of pairs) {
    if (!a) return undefined;
    const tries: [string, string][] = [[a, b], [a.replace(NUM, ''), b.replace(NUM, '')]];
    let hit = false;
    const swap = (v: string) => {
      for (const [x, y] of tries) if (x && v.includes(x)) { hit = true; return v.replace(x, y).trim(); }
      return v;
    };
    kept = Object.fromEntries(Object.entries(kept!).map(([k, v]) => [k, Array.isArray(v) ? (v as string[]).map(swap).filter(Boolean) : typeof v === 'string' ? swap(v) : v]).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length))) as Fields;
    if (!hit) return undefined;
  }
  return { ...l, fields: kept!, at: wordsKey(next) };
}
/**
 * Round AM: the picture fields of slide `i` in a layout: the project pictures no other slide uses; with `reuse`, when none of those fits, the pictures of the whole project (the
 * free ones first). `from`: the slides (1-based) that also show a picture it placed.
 */
function picturesFor(specs: SlideSpec[], images: PicInfo[], i: number, layout: string, variant: 0 | 1, reuse: boolean): { fields: Fields | null; from: number[] } {
  const free = unusedPictures(specs, images, i);
  const got = placeOne(layout, variant, free);
  if (got || !reuse) return { fields: got, from: [] };
  const freeIds = new Set(free.map((p) => p.id));
  const all = placeOne(layout, variant, [...free, ...images.filter((p) => !freeIds.has(p.id))]);
  if (!all) return { fields: null, from: [] };
  const ids = usedIds(all);
  return { fields: all, from: specs.flatMap((s, k) => (k !== i && usedIds(s.fields).some((id) => ids.includes(id)) ? [k + 1] : [])) };
}
/**
 * The picture of one gallery tile: slide `i` drawn exactly as choosing that layout and variant would draw it (choiceDraw, the same code as redrawLibrarySlide): the slide's own text,
 * and its own pictures, the slide's own for its own layout, for another layout the project pictures that the change would place (Round AL part 3; the tiles showed a neutral
 * stand-in before). null when the code cannot draw it.
 */
export async function drawGalleryTile(lib: LibraryReport, look: Look, handle: string, i: number, layout: LayoutId, variant: 0 | 1): Promise<string | null> {
  const r = await choiceDraw(lib, look, handle, i, { layout, variant, reuse: true });
  return r.ok ? r.d.built!.svg : null;
}

// ----- drawing one slide again -----
export type SlideRedraw = { ok: true; slide: DesignedSlide; layout: string; spec: SlideSpec; library: LibraryReport; scriptSlide: Record<string, unknown> } | { ok: false; reasons: string[] };

/** Draws slide `i` again from the stored plan with the person's choice (a layout, a cut, the variant, the invert) or with new fields. Nothing else in the deck changes. No model call. */
export async function redrawLibrarySlide(lib: LibraryReport, look: Look, handle: string, i: number, ch: PickChoice & { fields?: Fields; accents?: string[] }): Promise<SlideRedraw> {
  const r = await choiceDraw(lib, look, handle, i, ch);
  if (!r.ok) return r;
  const { cur, layout, fields, variant, invert, spec, own, d, style } = r;
  const built = d.built!;
  // (a picture the person pinned stays pinned through any later redraw of the slide: the pin is merged, never replaced)
  // Round N: a layout the person chose in the Layout tab is theirs: the photo shape rule never moves it
  const pinObj = { ...cur.pin, ...ch.pin, variant, cut: d.cut, invert: d.invert ? invert || 'full' : false, ...own } as NonNullable<SlideSpec['pin']>;
  for (const k of Object.keys(pinObj) as (keyof typeof pinObj)[]) if (pinObj[k] === undefined) delete pinObj[k];
  const pinned: SlideSpec = { ...spec, pin: pinObj };
  const specs = lib.plan!.specs.map((s, k) => (k === i ? pinned : s));
  const arr = <T,>(a: T[], v: T) => a.map((x, k) => (k === i ? v : x));
  const library: LibraryReport = {
    ...lib,
    layouts: arr(lib.layouts, layout),
    variants: arr(lib.variants, variant + 1),
    cuts: arr(lib.cuts, d.cut as string),
    inverts: arr(lib.inverts, d.invert ? invert || 'full' : 'none'),
    densities: arr(lib.densities, d.density),
    plan: { ...lib.plan!, specs },
    redraws: (lib.redraws ?? 0) + 1,
  };
  const slide: DesignedSlide = { pack: stubPack(style, 'library'), built: { svg: built.svg, layers: built.layers as Layer[], bg: built.fieldBg ?? style.palette.bg, ...(built.devices ? { devices: built.devices } : {}), ...(built.images ? { images: built.images } : {}) } };
  return { ok: true, slide, layout, spec: pinned, library, scriptSlide: scriptSlideOf(layout, fields) };
}

type ChoiceDrawn = { ok: true; cur: SlideSpec; layout: LayoutId; fields: Fields; variant: 0 | 1; invert: false | 'full' | 'tint'; spec: SlideSpec; own: { layout?: true; look?: true }; d: Drawn; style: LibraryReport['style'] };
/** Round AL part 3: slide `i` with a choice applied and drawn, shared by the redraw and the gallery tiles (so a tile is exactly what a click gives). No model call. */
async function choiceDraw(lib: LibraryReport, look: Look, handle: string, i: number, ch: PickChoice & { fields?: Fields; accents?: string[] }): Promise<ChoiceDrawn | { ok: false; reasons: string[] }> {
  if (!lib.plan) return { ok: false, reasons: ['This deck has no stored plan to draw from.'] };
  const style = lib.style; // the style the deck was drawn in (the person's overrides included)
  const cur = lib.plan.specs[i];
  if (!cur) return { ok: false, reasons: [`There is no slide ${i + 1} in the plan.`] };
  const now = currentOf(lib, i);
  const layout = (ch.layout ?? cur.layout) as LayoutId;
  let fields = Object.fromEntries(Object.entries(cur.fields).filter(([k]) => k !== 'accent')) as Fields;
  let accents = cur.accents;
  // Round AM: a layout move maps from the words kept from before a move that left a line out (sourceOf), so the line comes back; the slide's own words otherwise
  const src = sourceOf(cur);
  let moved: LayoutOption | undefined;
  if (layout !== cur.layout) {
    // (Round AM part 2: a layout that leaves out required words is the person's pick in the layout picker, after its question; no deck pass draws through here)
    const opt = layoutOptions(src, look).find((o) => o.layout === layout) ?? nearOptions(src, look).find((o) => o.layout === layout);
    // (a caller that hands over the fields itself, like the picture picker, has already kept every word)
    if (!opt && !ch.fields) return { ok: false, reasons: [`The text of slide ${i + 1} cannot be moved to "${layout}" without making text up.`] };
    if (opt) {
      moved = opt;
      fields = opt.fields;
      accents = layout === src.layout && src !== cur ? src.accents : accentsIn(src.accents, fields);
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
    // (Round AM: with `reuse`, the layout picker's choice, a picture another slide also shows when no free one fits)
    if (look.images?.length && imageSlotsOf(layout).length) {
      const got = picturesFor(lib.plan.specs, look.images, i, layout, variant, !!ch.reuse).fields;
      if (got) fields = { ...fields, ...got };
    }
  }
  // Round AM: the words a move leaves out (or the item's number it puts in the headline) stay with the slide: a later move maps from them and brings them back
  let left: SlideSpec['left'];
  if (moved && !ch.fields) {
    if (layout !== src.layout && (moved.dropped.length || addedNumber(src, moved))) left = { layout: src.layout, fields: withoutImages(Object.fromEntries(Object.entries(src.fields).filter(([k]) => k !== 'accent')) as Fields), accents: src.accents, at: wordsKey(fields) };
  } else if (cur.left && cur.left.at === wordsKey(fields)) left = cur.left;
  // Round AM part 3: a text edit in the same layout keeps the words left out by the switch, with the person's edit carried into them (carryLeft)
  else if (ch.fields && layout === cur.layout && sourceOf(cur) !== cur) left = carryLeft(cur, fields);
  const cut: Cut = ch.cut ?? (cutsOf(layout).includes(now.cut) ? now.cut : 'plain');
  const invert = ch.invert !== undefined ? ch.invert : now.invert;
  const density = layout === cur.layout ? now.density : 'normal';
  const spec: SlideSpec = { layout, fields, accents, ...(density === 'statement' ? { density } : {}), ...(left ? { left } : {}) };
  const problems = slideProblems(spec, look);
  if (problems.length) return { ok: false, reasons: problems };
  // Round Y: a layout or a variant the person chose in the picker is theirs: a closing then keeps the layout's own look (a text edit leaves the look to the code)
  const own = { ...(cur.pin?.layout || (ch.layout && ch.layout !== cur.layout) ? { layout: true as const } : {}), ...(cur.pin?.look || ch.variant !== undefined ? { look: true as const } : {}) };
  const d = await drawOne({ ...spec, ...(Object.keys(own).length ? { pin: own } : {}) }, variant, style, { handle, index: i, total: lib.plan.specs.length, cut, invert, density, ...(lib.grounds?.[i] != null ? { ground: lib.grounds[i]! } : {}) });
  if (!d.built) return { ok: false, reasons: d.problems };
  return { ok: true, cur, layout, fields, variant, invert, spec, own, d, style };
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

