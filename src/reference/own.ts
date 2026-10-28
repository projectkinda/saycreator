// Draws the person's OWN content (their title and their photo) in a style, with no model: the cover and two other slides of a carousel, or the
// thumbnail options. This is what the right-hand side of the screen shows, and what a saved template is applied with.
import type { CarouselScript } from '../image-engine/carousel/types';
import { FabricAdapter } from '../image-engine/fabric-adapter';
import { loadFonts } from '../image-engine/fonts';
import type { StyleSpec } from '../image-engine/styles/format';
import { composeStyled } from '../image-engine/styles/compose';
import type { LoadedStyle } from '../image-engine/styles/load';
import { composeThumbs } from '../image-engine/thumbnail/v2/compose';
import { checkThumb, loadImage } from '../image-engine/thumbnail/v2/check';
import type { Plan } from '../image-engine/types';
import { EXAMPLE } from '../carousel/script';
import { renderer } from '../carousel/render';
import { guessFor } from '../thumbnail/render';
import { sampleInput, type SampleContent } from './loop';
import type { Target } from './types';

export interface OwnShot {
  label: string;
  url: string;
  blob: Blob;
  plan: Plan;
  /** Seconds it took to draw this one. */
  seconds: number;
}

const loaded = (spec: StyleSpec): LoadedStyle => ({ spec, assets: {}, warnings: [] });
/** The slide kinds shown for a carousel: the cover first, then two others, so the style is seen on more than one layout. */
const SHOWN = ['cover', 'content', 'stat'];

/** The person's content as a carousel script: their title on the cover, their photo on the slides that take one. */
function scriptOf(content: SampleContent, withPhoto: boolean): CarouselScript {
  const slides = EXAMPLE.slides.map((s) => (s.type === 'cover' ? { ...s, headline: content.title, highlight: content.title.split(/\s+/).slice(1, 3).join(' ') || undefined } : s)).map((s) => (withPhoto && SHOWN.includes(s.type) ? { ...s, photo_hint: 'the photo' } : s));
  return { ...EXAMPLE, title: content.title, slides } as unknown as CarouselScript;
}

/** Draws the content in the style, calling `onShot` as each picture is ready (the first one is the quickest). */
export async function renderOwn(o: { spec: StyleSpec; target: Target; content: SampleContent; withPhoto?: boolean; /** Run the phone checks and the safety net too (slower). Previews skip them. */ checks?: boolean; /** Stop after this many pictures (applying a template to a photo needs only the first). */ limit?: number; onShot?: (s: OwnShot, i: number) => void }): Promise<OwnShot[]> {
  await loadFonts();
  const out: OwnShot[] = [];
  const push = (s: OwnShot) => {
    out.push(s);
    o.onShot?.(s, out.length - 1);
  };
  const style = loaded(o.spec);
  if (o.target !== 'thumbnail') {
    const withPhoto = o.withPhoto !== false;
    const photo = withPhoto ? await sampleInput(o.content.photo) : null;
    const slides = composeStyled(scriptOf(o.content, withPhoto), style, { width: 1080, height: 1350, handle: '@yourname', elements: 'shippable', ...(photo ? { photos: [photo] } : {}) }, false);
    for (const kind of SHOWN) {
      if (o.limit !== undefined && out.length >= o.limit) break;
      const s = slides.find((x) => x.type === kind);
      if (!s) continue;
      const t0 = performance.now();
      // A preview: drawn at half size without the phone checks and the safety net (those take about 1.5 s a slide and run when a carousel is made with the style).
      const png = o.checks ? (await renderer.render(s, o.spec.spacing.margin)).png : await renderer.preview(s.plan, 0.5);
      push({ label: kind === 'cover' ? 'Cover' : kind === 'content' ? 'A content slide' : 'A number slide', url: URL.createObjectURL(png), blob: png, plan: s.plan, seconds: Math.round((performance.now() - t0) / 10) / 100 });
    }
  }
  if (o.target !== 'carousel' && o.spec.thumbnail) {
    const subject = await guessFor(o.content.photo.id).catch(() => ({ x: 0.5, y: 0.5 }));
    const opts = composeThumbs({ aspect: '16:9', title: o.content.title, photo: { id: o.content.photo.id, src: o.content.photo.url, width: o.content.photo.width, height: o.content.photo.height }, subject, seed: 'own' }, style).slice(0, o.limit !== undefined ? Math.max(0, o.limit - out.length) : 3);
    const adapter = new FabricAdapter();
    await adapter.mount(null);
    try {
      const img = await loadImage(o.content.photo.url);
      const src = { photo: { img, width: img.naturalWidth, height: img.naturalHeight } };
      for (const opt of opts) {
        const t0 = performance.now();
        const c = await checkThumb(adapter, opt, src);
        push({ label: `Thumbnail, ${opt.layout}`, url: URL.createObjectURL(c.png), blob: c.png, plan: opt.plan, seconds: Math.round((performance.now() - t0) / 10) / 100 });
      }
    } finally {
      adapter.dispose();
    }
  }
  return out;
}

/** A small picture of the cover (or the first thumbnail) of each of the person's photos in this style: what applying a saved template looks like. */
export async function applyToPhotos(spec: StyleSpec, target: Target, title: string, photos: SampleContent['photo'][]): Promise<{ id: string; url: string; seconds: number }[]> {
  const out: { id: string; url: string; seconds: number }[] = [];
  for (const photo of photos) {
    const t0 = performance.now();
    const shots = await renderOwn({ spec, target, content: { title, photo }, withPhoto: true, limit: 1 });
    const first = shots[0];
    if (first) out.push({ id: photo.id, url: first.url, seconds: Math.round(((performance.now() - t0) / 1000) * 100) / 100 });
  }
  return out;
}
