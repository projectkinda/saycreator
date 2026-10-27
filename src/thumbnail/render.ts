// Drawing thumbnails in the browser with the real image engine: compose every option from the project, draw each one, check it at phone size.
// Fabric cannot run in a Web Worker, so drawing stays on the main thread, one option at a time, with a pause between options.
import { FabricAdapter } from '../image-engine/fabric-adapter';
import { loadFonts } from '../image-engine/fonts';
import { checkThumb, loadImage, type CheckedThumb, type Source } from '../image-engine/thumbnail/v2/check';
import { composeThumbs, numberIn, type ThumbOption, type ThumbRequest } from '../image-engine/thumbnail/v2/compose';
import { guessSubject, type SubjectPoint } from '../image-engine/thumbnail/v2/subject';
import type { LoadedStyle } from '../image-engine/styles/load';
import { pickStyle } from '../carousel/pickStyle';
import { getStyles } from '../carousel/render';
import { treatmentsFor } from '../carousel/photoChoices';
import { sizeOf, urlOf } from '../carousel/photoLibrary';
import { yieldToBrowser } from '../carousel/export';
import { AUTO_STYLE, type ThumbDoc } from './doc';
import { targetOfStyle } from '../reference/templates';

/** The styles that have a thumbnail look, in a steady order. */
export const thumbStyles = (): LoadedStyle[] => getStyles().styles.filter((s) => s.spec.thumbnail && targetOfStyle(s.spec.name) !== 'carousel');

export interface Composed {
  options: ThumbOption[];
  style: LoadedStyle;
  /** Why this style, when the app picked it. */
  why: string | null;
  /** The subject the options were made with, and whether it is the guess. */
  subject: SubjectPoint;
  /** Which layouts were left out, and why. */
  left: { layout: string; because: string }[];
  /** The pictures the checker reads, by photo layer id. */
  pictures: Record<string, string>;
  ms: number;
}

const guesses = new Map<string, SubjectPoint>();
/** A guess at where the subject is (where the most detail and colour is), cached per picture. Not detection. */
export async function guessFor(id: string): Promise<SubjectPoint> {
  const known = guesses.get(id);
  if (known) return known;
  const url = urlOf(id);
  if (!url) return { x: 0.5, y: 0.5, guessed: true };
  const img = await loadImage(url);
  const w = 96;
  const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const s = guessSubject(g.getImageData(0, 0, w, h));
  guesses.set(id, s);
  return s;
}
export const forgetGuess = (id: string) => guesses.delete(id);

/** The style for this project: the one chosen, or (Pick for me) the one that suits the words. */
export function styleFor(doc: ThumbDoc): { style: LoadedStyle; why: string | null } | null {
  const all = thumbStyles();
  if (all.length === 0) return null;
  if (doc.style !== AUTO_STYLE) {
    const s = all.find((x) => x.spec.name === doc.style);
    if (s) return { style: s, why: null };
  }
  const pick = pickStyle({ text: `${doc.topic} ${doc.title}`, tone: 'bold', slideTypes: ['cover'], styles: all });
  return { style: all.find((s) => s.spec.name === pick.name) ?? all[0], why: pick.why };
}

/** Composes the options for the project. Not drawn yet. Null when there is no photo or no title yet. */
export async function composeProject(doc: ThumbDoc): Promise<Composed | null> {
  if (!doc.photoId || !doc.title.trim()) return null;
  const main = sizeOf(doc.photoId);
  const url = urlOf(doc.photoId);
  const picked = styleFor(doc);
  if (!main || !url || !picked) return null;
  await loadFonts();
  const t0 = performance.now();
  const subject: SubjectPoint = doc.subject ?? (await guessFor(doc.photoId));
  const second = doc.secondId && urlOf(doc.secondId) && sizeOf(doc.secondId) ? { id: doc.secondId, url: urlOf(doc.secondId)!, size: sizeOf(doc.secondId)! } : null;
  const object = doc.objectId && urlOf(doc.objectId) && sizeOf(doc.objectId) ? { id: doc.objectId, src: urlOf(doc.objectId)!, ...sizeOf(doc.objectId)! } : null;
  const emphasis = doc.emphasis?.trim() || undefined;
  const req: ThumbRequest = {
    aspect: doc.aspect,
    title: doc.title,
    emphasis,
    photo: { id: doc.photoId, src: url, width: main.width, height: main.height },
    subject,
    treatments: treatmentsFor(doc.treatment),
    seed: doc.photoId,
    ...(object ? { object } : {}),
    ...(second ? { second: { photo: { id: second.id, src: second.url, width: second.size.width, height: second.size.height }, subject: doc.secondSubject ?? (await guessFor(second.id)) } } : {}),
  };
  const options = composeThumbs(req, picked.style);
  const tb = picked.style.spec.thumbnail!;
  const left = tb.layouts.filter((l) => !options.some((o) => o.layout === l)).map((l) => ({ layout: l, because: l === 'object-title' ? 'needs a transparent object picture' : l === 'number-badge' ? (numberIn(doc.title) ? 'did not fit' : 'needs a number in the title (it never makes one up)') : l === 'before-after' ? 'needs a second photo' : 'not available' }));
  return { options, style: picked.style, why: picked.why, subject, left, pictures: { photo: url, ...(second ? { 'photo-after': second.url } : {}) }, ms: performance.now() - t0 };
}

export interface Drawn extends CheckedThumb {
  url: string;
  phoneUrl: string;
}

class Renderer {
  private adapter: FabricAdapter | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, Promise<Drawn>>();
  private sources = new Map<string, Promise<Source>>();

  private async ready() {
    if (!this.adapter) {
      await loadFonts();
      const a = new FabricAdapter();
      await a.mount(null);
      this.adapter = a;
    }
    return this.adapter;
  }
  private source(url: string): Promise<Source> {
    let s = this.sources.get(url);
    if (!s) {
      s = loadImage(url).then((img) => ({ img, width: img.naturalWidth, height: img.naturalHeight }));
      this.sources.set(url, s);
      s.catch(() => this.sources.delete(url));
    }
    return s;
  }

  /** Draws one option and checks it. The same plan is drawn only once. */
  render(option: ThumbOption, pictures: Record<string, string>): Promise<Drawn> {
    const key = JSON.stringify(option.plan) + JSON.stringify(option.subjects);
    let p = this.cache.get(key);
    if (!p) {
      p = this.chain.then(async () => {
        await yieldToBrowser();
        const a = await this.ready();
        const src: Record<string, Source> = {};
        for (const [layer, url] of Object.entries(pictures)) src[layer] = await this.source(url);
        const c = await checkThumb(a, option, src);
        return { ...c, url: URL.createObjectURL(c.png), phoneUrl: URL.createObjectURL(c.phonePng) };
      });
      this.chain = p.catch(() => undefined);
      this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
      if (this.cache.size > 40) {
        const first = this.cache.keys().next().value!;
        void this.cache.get(first)?.then((d) => {
          URL.revokeObjectURL(d.url);
          URL.revokeObjectURL(d.phoneUrl);
        });
        this.cache.delete(first);
      }
    }
    return p;
  }
  /** Forget everything drawn (used by tests to measure a cold start). */
  clear() {
    this.cache.clear();
    this.sources.clear();
  }
}
export const thumbRenderer = new Renderer();
