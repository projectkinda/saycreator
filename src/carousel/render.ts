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

let styles: { styles: LoadedStyle[]; problems: { folder: string; messages: string[] }[] } | null = null;
let merged: { user: LoadedStyle[]; value: { styles: LoadedStyle[]; problems: { folder: string; messages: string[] }[] } } | null = null;
/** The stored styles (one folder each under src/image-engine/styles/), then the person's own templates. A new folder appears here by itself. */
export const getStyles = () => {
  const base = (styles ??= loadStyles());
  const user = userStyles();
  if (!merged || merged.user !== user) merged = { user, value: { styles: [...base.styles, ...user], problems: base.problems } };
  return merged.value;
};
/** The styles a carousel can use: a template made for thumbnails only is not offered here. */
export const carouselStyles = () => getStyles().styles.filter((s) => targetOfStyle(s.spec.name) !== 'thumbnail');
export const styleByName = (name: string) => getStyles().styles.find((s) => s.spec.name === name);

/** The plans for every slide of the doc, with the person's layout and element choices applied. Not drawn yet. */
export function composeDoc(doc: Doc): { slides: StyledSlide[]; margin: number } {
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
    const key = `${margin}|${JSON.stringify(slide.plan)}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this.enqueue(async () => {
        const t0 = performance.now();
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
