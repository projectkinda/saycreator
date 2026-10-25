// Drawing in the browser with the real image engine: compose the plans from the doc, draw each one, check it at phone size.
// Fabric cannot run in a Web Worker (it needs a document), so drawing stays on the main thread, one slide at a time, with a
// pause between slides so the page keeps answering. Nothing is sent anywhere.
import { FabricAdapter } from '../image-engine/fabric-adapter';
import { loadFonts } from '../image-engine/fonts';
import { checkSlidePlan } from '../image-engine/carousel/check';
import type { CarouselLintResult } from '../image-engine/carousel/lint';
import { composeStyled, type StyledSlide } from '../image-engine/styles/compose';
import { loadStyles, type LoadedStyle } from '../image-engine/styles/load';
import type { Plan } from '../image-engine/types';
import type { Doc } from './doc';
import { formatOf } from './script';
import { yieldToBrowser } from './export';

let styles: { styles: LoadedStyle[]; problems: { folder: string; messages: string[] }[] } | null = null;
/** The stored styles (one folder each under src/image-engine/styles/). A new folder appears here by itself. */
export const getStyles = () => (styles ??= loadStyles());
export const styleByName = (name: string) => getStyles().styles.find((s) => s.spec.name === name);

/** The plans for every slide of the doc, with the person's layout and element choices applied. Not drawn yet. */
export function composeDoc(doc: Doc): { slides: StyledSlide[]; margin: number } {
  const style = styleByName(doc.style);
  if (!style) throw new Error(`The style "${doc.style}" is not available any more. Pick another one.`);
  if (!doc.script) return { slides: [], margin: style.spec.spacing.margin };
  const f = formatOf(doc.format);
  const overrides = Object.fromEntries(Object.entries(doc.choices).map(([k, v]) => [Number(k), v]));
  const slides = composeStyled(doc.script, style, { width: f.width, height: f.height, chrome: doc.format === 'quote' ? 'none' : undefined, handle: doc.script.brand.handle, elements: 'shippable', overrides }, true);
  return { slides, margin: style.spec.spacing.margin };
}

export interface Rendered {
  png: Blob;
  lint: CarouselLintResult[];
  warnings: string[];
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
        const c = await checkSlidePlan(a, { id: slide.id, type: slide.type, plan: slide.plan, notes: slide.notes }, margin);
        return { png: c.png, lint: c.lint, warnings: c.render.warnings.map((w) => w.message ?? w.code), ms: performance.now() - t0 };
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
