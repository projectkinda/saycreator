// Drawing in the browser with the real image engine: compose the plans from the doc, draw each one, check it at phone size.
// Fabric cannot run in a Web Worker (it needs a document), so drawing stays on the main thread, one slide at a time, with a
// pause between slides so the page keeps answering. Nothing is sent anywhere.
import { FabricAdapter } from '../image-engine/fabric-adapter';
import { loadFonts } from '../image-engine/fonts';
import { checkWithRepair } from '../image-engine/photo/repair';
import type { CarouselLintResult } from '../image-engine/carousel/lint';
import { composeStyled, type SlideOverride, type StyledSlide } from '../image-engine/styles/compose';
import { loadStyles, type LoadedStyle } from '../image-engine/styles/load';
import type { Plan } from '../image-engine/types';
import type { Doc } from './doc';
import { formatOf } from './script';
import { yieldToBrowser } from './export';
import { treatmentsFor } from './photoChoices';
import { objectInputs, photoInputs } from './photoLibrary';
import { targetOfStyle, userStyles } from '../reference/templates';
import { fillsFor } from '../images/store';
import { applyPhotoSlots, fillRecreate, recreateFor, textsOf } from '../reference/recreate';
import { designKey, designUsed, packFor, packSlide } from '../reference/pack';
import { resolveSvgTokens, svgToPng } from '../reference/faithful';
import { cleanScript } from './clean';
import { deckFallbackPack, recurringFor, recurringLayers, recurringMarkup } from './designed';
import { faithfulChecks, UNCHECKED } from '../reference/faithfulChecks';
import type { Layer } from '../image-engine/types';
import { activeStyle } from '../reference/active';

/** A pack slide drawn as the SVG was written: the filled SVG, and the filled layers (for the phone checks only). */
export interface FaithfulInfo {
  svg: string;
  layers: Layer[];
  canvas: { w: number; h: number };
  bg: string;
}
export const faithfulOf = (s: unknown) => (s as { faithful?: FaithfulInfo }).faithful;

let styles: { styles: LoadedStyle[]; problems: { folder: string; messages: string[] }[] } | null = null;
let merged: { user: LoadedStyle[]; active: LoadedStyle | null; value: { styles: LoadedStyle[]; problems: { folder: string; messages: string[] }[] } } | null = null;
/** The stored styles (one folder each under src/image-engine/styles/), then the person's own templates. A new folder appears here by itself. */
export const getStyles = () => {
  const base = (styles ??= loadStyles());
  const user = userStyles();
  const active = activeStyle();
  if (!merged || merged.user !== user || merged.active !== active) merged = { user, active, value: { styles: [...base.styles, ...user, ...(active ? [active] : [])], problems: base.problems } };
  return merged.value;
};
/** The styles a carousel can use: a template made for thumbnails only is not offered here. */
export const carouselStyles = () => getStyles().styles.filter((s) => targetOfStyle(s.spec.name) !== 'thumbnail');
export const styleByName = (name: string) => getStyles().styles.find((s) => s.spec.name === name);

/** The plans for every slide of the doc, with the person's layout and element choices applied. Not drawn yet. */
export function composeDoc(doc: Doc): { slides: StyledSlide[]; margin: number } {
  // Words that are notes to the person ("Placeholder: ...", "Note: ...", "TODO", [in brackets]) are never drawn; the deck card lists them.
  const c = doc.script ? cleanScript(doc.script) : null;
  const d = c && c.flags.length ? { ...doc, script: c.script } : doc;
  return withDesigned(d, composeBase(d));
}

/** Designed mode: a slide with its own design is drawn from it (faithfully, text through its slots); one that fell back keeps the style's drawing and says why. */
function withDesigned(doc: Doc, out: { slides: StyledSlide[]; margin: number }): { slides: StyledSlide[]; margin: number } {
  const d = doc.designed;
  if (!d || !doc.script) return out;
  const first = Object.entries(d.slides).sort((a, b) => Number(a[0]) - Number(b[0]))[0]?.[1];
  const spec = styleByName(doc.style)?.spec;
  const fb = first && spec ? deckFallbackPack(spec, first.pack) : null;
  const n = doc.script.slides.length;
  const slides = out.slides.map((s, i) => {
    const own = d.slides[String(i)];
    const dp = own?.pack ?? (d.fallbacks[String(i)] ? fb : null);
    const why = d.fallbacks[String(i)];
    if (!dp) return why ? ({ ...s, notes: [...((s as { notes?: string[] }).notes ?? []), "This slide fell back to the style's own design: " + why] } as typeof s) : s;
    const sc = (doc.script!.slides[i] ?? {}) as unknown as Record<string, unknown>;
    const r = packSlide(dp, String(sc.type ?? s.type), sc, '', { images: doc.imageRequests, slide: i });
    const editable = !!doc.choices[String(i)]?.editable;
    const rec = own ? own.recurring : recurringFor(first?.recurring, i, n);
    const svg = r.faithful ? r.faithful.replace(/<\/svg>\s*$/i, () => resolveSvgTokens(recurringMarkup(rec, dp), dp.palette) + '</svg>') : '';
    const layers = editable || !svg ? [...r.layers, ...recurringLayers(rec, dp, 'd' + i)] : r.layers;
    const f = !editable && svg ? { faithful: { svg, layers: [...r.layers, ...recurringLayers(rec, dp, 'd' + i)], canvas: r.canvas ?? dp.canvas, bg: dp.palette.bg ?? '#FFFFFF' } } : {};
    const more = editable ? ['Made editable: this slide now draws from layers. Gradients, patterns and fine drawing parts can look a little different from the designed drawing.'] : [];
    const head = own ? 'Designed by the model for this slide.' : "This slide fell back to a standard layout in the deck's colours and fonts: " + (why ?? 'its design could not be used');
    return { ...s, ...f, plan: { ...s.plan, layers }, ...(r.emptySlots ? { emptySlots: r.emptySlots } : {}), notes: [head, ...r.notes, ...more] } as typeof s;
  });
  return { slides, margin: out.margin };
}

function composeBase(doc0: Doc): { slides: StyledSlide[]; margin: number } {
  // A doc that names a style that is not there (a removed template, the in-memory reference after a reload) draws with the default style instead of failing.
  const doc: Doc = !styleByName(doc0.style) ? { ...doc0, style: styleByName('editorial-collage') ? 'editorial-collage' : (getStyles().styles[0]?.spec.name ?? doc0.style) } : doc0;
  const style = styleByName(doc.style);
  if (!style) throw new Error(`The style "${doc.style}" is not available any more. Pick another one.`);
  if (!doc.script) return { slides: [], margin: style.spec.spacing.margin };
  const f = formatOf(doc.format);
  // The person's choices, as the composer takes them: layout and elements as before, plus the photo and the object.
  const overrides: Record<number, SlideOverride> = Object.fromEntries(
    Object.entries(doc.choices).map(([k, v]) => {
      const p = v.photo;
      const o: SlideOverride = { layout: v.layout, salt: v.salt, swaps: v.swaps, ...(v.object ? { object: v.object } : {}) };
      if (p) o.photo = { id: p.id, treatments: treatmentsFor(p.treatment), focal: p.focal, frame: p.frame, shape: p.shape };
      return [Number(k), o];
    }),
  );
  const pictures = doc.photos ?? [];
  const slides = composeStyled(doc.script, style, { width: f.width, height: f.height, chrome: doc.format === 'quote' ? 'none' : undefined, handle: doc.script.brand.handle, elements: 'shippable', overrides, photos: photoInputs(pictures), objects: objectInputs(pictures) }, true);
  // A recreated look: its layers carry each slide's own words (the photo slots of the ordinary layouts are not part of it).
  const pack = packFor(doc.style);
  if (pack) {
    const filled = slides.map((s, i) => {
      const sc = (doc.script!.slides[i] ?? {}) as unknown as Record<string, unknown>;
      // A quote post uses the pack's square quote design when it has one; the pictures come from the slide's image requests.
      // The 2nd, 3rd... slide of the same type get code-side variants (mirrored, colours swapped): no model call.
      const key = designKey(String(sc.type ?? s.type));
      const nth = doc.script!.slides.slice(0, i).filter((o) => designKey(String((o as unknown as { type?: unknown }).type ?? '')) === key).length;
      const r = packSlide(pack, String(sc.type ?? s.type), sc, doc.script!.brand.handle, { square: doc.format === 'quote', images: doc.imageRequests, slide: i, nth });
      const editable = !!doc.choices[String(i)]?.editable;
      const used = designUsed(pack, String(sc.type ?? s.type));
      const more = editable && used ? [`Made editable: this slide now draws from layers. ${pack.notes.filter((n) => n.startsWith(`${used}:`)).slice(0, 3).join(' ') || 'Gradients, patterns and fine drawing parts can look a little different from the original drawing.'}`] : [];
      const f = !editable && r.faithful ? { faithful: { svg: r.faithful, layers: r.layers, canvas: r.canvas ?? pack.canvas, bg: r.bg ?? pack.palette.bg ?? '#FFFFFF' } } : {};
      return { ...s, ...f, plan: { ...s.plan, layers: r.layers }, ...(r.emptySlots ? { emptySlots: r.emptySlots } : {}), notes: [...((s as { notes?: string[] }).notes ?? []), ...r.notes, ...more] };
    });
    return { slides: filled as typeof slides, margin: style.spec.spacing.margin };
  }
  const rec = recreateFor(doc.style);
  if (rec) {
    const filled = slides.map((s, i) => {
      const r = fillRecreate(rec, textsOf((doc.script!.slides[i] ?? {}) as unknown as Record<string, unknown>, doc.script!.brand.handle));
      // The photo regions take the slide's pictures from the image requests (an empty one keeps its placeholder block).
      const layers = rec.slots?.length ? applyPhotoSlots(r.layers, rec.slots, fillsFor(doc.imageRequests, i, rec.slots, rec.palette)) : r.layers;
      return { ...s, plan: { ...s.plan, layers }, notes: [...((s as { notes?: string[] }).notes ?? []), ...r.notes] };
    });
    return { slides: filled as typeof slides, margin: style.spec.spacing.margin };
  }
  return { slides, margin: style.spec.spacing.margin };
}

/** What a slide's pictures look like, as a string: which elements, where, turned how. Two slides with the same string look the same. */
const pictureSignature = (s: StyledSlide) => s.plan.layers.filter((l) => l.kind === 'element').map((l) => `${l.kind === 'element' ? l.element : ''}@${l.x},${l.y},${l.width},${l.rotation ?? 0}`).join('|');

/**
 * A salt for "Shuffle elements" that really changes the slide: random for variety, but only one that draws the slide's pictures
 * differently from now. Null when no salt tried gives a different slide (nothing else fits).
 */
export function pickShuffleSalt(doc: Doc, index: number, random: () => number = Math.random, tries = 24): string | null {
  const now = composeDoc(doc).slides[index];
  if (!now) return null;
  const before = pictureSignature(now);
  const seen = new Set<string>();
  for (let n = 0; n < tries; n++) {
    const salt = random().toString(36).slice(2, 7);
    if (seen.has(salt)) continue;
    seen.add(salt);
    const next: Doc = { ...doc, choices: { ...doc.choices, [String(index)]: { ...(doc.choices[String(index)] ?? {}), salt, swaps: undefined } } };
    const slide = composeDoc(next).slides[index];
    if (slide && pictureSignature(slide) !== before) return salt;
  }
  return null;
}

export interface Rendered {
  png: Blob;
  lint: CarouselLintResult[];
  warnings: string[];
  /** What the safety net changed to make the checks pass (empty when it changed nothing). */
  repairs: string[];
  ms: number;
}

class Renderer {
  private adapter: FabricAdapter | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, Promise<Rendered>>();

  private async ready() {
    if (!this.adapter) {
      await loadFonts();
      const a = new FabricAdapter();
      await a.mount(null);
      this.adapter = a;
    }
    return this.adapter;
  }
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      await yieldToBrowser();
      return job();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Draws one slide and checks it. The same plan is drawn only once. */
  render(slide: StyledSlide, margin: number): Promise<Rendered> {
    const fa = faithfulOf(slide);
    const key = `${margin}|${JSON.stringify(slide.plan)}${fa ? `|${fa.svg}` : ''}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this.enqueue(async () => {
        const t0 = performance.now();
        if (fa) return this.faithful(slide, fa, t0);
        const a = await this.ready();
        // A photo behind words gets a stronger overlay if the check still fails (a no-op on slides with no full photo).
        const c = await checkWithRepair(a, { id: slide.id, type: slide.type, plan: slide.plan, notes: slide.notes }, margin);
        return { png: c.png, lint: c.lint, warnings: c.render.warnings.map((w) => w.message ?? w.code), repairs: c.repairs, ms: performance.now() - t0 };
      });
      this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
      if (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }

  /** A faithful pack slide: the SVG drawn as written, at the slide's size (a design on a smaller card is fitted whole), checked from its slot data. */
  private async faithful(slide: StyledSlide, fa: FaithfulInfo, t0: number): Promise<Rendered> {
    const { width: W, height: H } = slide.plan.canvas;
    const same = Math.abs(W / H - fa.canvas.w / fa.canvas.h) < 0.005;
    const png = await svgToPng(fa.svg, W, same ? undefined : { w: W, h: H, bg: fa.bg });
    const k = same ? W / fa.canvas.w : Math.min(W / fa.canvas.w, H / fa.canvas.h);
    const lint = faithfulChecks(fa.layers, { canvas: fa.canvas, bg: fa.bg, k, slideType: slide.type });
    return { png, lint, warnings: [`Faithful drawing: these checks cannot run on it. ${UNCHECKED.join(' ')}`], repairs: [], ms: performance.now() - t0 };
  }

  /** A small picture of a plan, for the style picker. No checks. */
  preview(plan: Plan, scale: number): Promise<Blob> {
    return this.enqueue(async () => {
      const a = await this.ready();
      await a.render(plan);
      return a.export({ format: 'png', scale });
    });
  }

  /** Forget everything drawn (used by tests to measure a cold start). */
  clear() {
    this.cache.clear();
  }
}
export const renderer = new Renderer();
