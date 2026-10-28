// "Try with my content": the person's own words and photo fitted into a stored layout at its OWN shape, with no model. It reuses the free-layout
// drawing (layouts-free.ts): the words go to the slots by role, each fitted into its box and never below the phone minimum; a photo goes in the photo
// region. Nothing is stretched: the picture is drawn at the layout's own aspect ratio.
import { analysePhoto } from '../image-engine/photo/analyse';
import { composeStyled } from '../image-engine/styles/compose';
import type { StyleSpec } from '../image-engine/styles/format';
import type { CarouselScript } from '../image-engine/carousel/types';
import { renderer } from '../carousel/render';
import { previewOf } from '../reference/images';
import { isCarouselShape, type GalleryLayout } from './types';

export interface MyContent {
  title: string;
  sub: string;
  label: string;
  body: string;
  photo: { url: string; width: number; height: number } | null;
}
export interface Fitted {
  url: string;
  blob: Blob;
  /** Plain words about what could not be done as the layout asks. */
  notes: string[];
  /** False when some text had to run past its box at the phone minimum, or a part of the content has no place in the layout. */
  fits: boolean;
  width: number;
  height: number;
}

/** The size a layout is drawn at: its own shape, about 1350 px tall for portrait and square, 1280 px wide for landscape. */
export function sizeOf(l: Pick<GalleryLayout, 'w' | 'h'>): { width: number; height: number } {
  const r = l.w / l.h;
  return r > 1 ? { width: 1280, height: Math.round(1280 / r) } : { width: Math.round(1350 * r), height: 1350 };
}

/** The style with this layout as its cover. Only a 4:5 layout can be stored in a carousel style without stretching it, so only that shape is. */
export const withLayout = (style: StyleSpec, l: GalleryLayout): StyleSpec => ({ ...style, free: { ...(style.free ?? {}), cover: l.free } });

const photoIds = new Map<string, Promise<Awaited<ReturnType<typeof analysePhoto>>>>();

export async function fitLayout(o: { layout: GalleryLayout; style: StyleSpec; content: MyContent }): Promise<Fitted> {
  const { layout, content } = o;
  const { width, height } = sizeOf(layout);
  const photo = content.photo && layout.free.photos.length ? await (photoIds.get(content.photo.url) ?? (() => { const p = analysePhoto(content.photo!.url, 'mine', { label: 'your photo' }); photoIds.set(content.photo!.url, p); return p; })()) : null;
  const slide = { type: 'cover', headline: content.title.trim() || 'Your title', ...(content.sub.trim() ? { sub: content.sub.trim() } : {}), ...(content.label.trim() ? { kicker: content.label.trim() } : {}), ...(content.body.trim() ? { body: content.body.trim() } : {}), ...(photo ? { photo_hint: 'your photo' } : {}) };
  const script = { id: 'layout-try', title: 'Layout', aspect: '4:5', brand: { handle: '@yourname' }, slides: [slide] } as unknown as CarouselScript;
  // The layout is the style's cover. Other slide types of the style are not drawn here.
  const spec = withLayout(o.style, layout);
  const [composed] = composeStyled(script, { spec, assets: {}, warnings: [] }, { width, height, handle: '@yourname', elements: 'shippable', ...(photo ? { photos: [photo] } : {}) }, true);
  const blob = await renderer.preview(composed.plan, width >= 1280 ? 0.5 : 0.45);
  const notes = [...composed.notes];
  if (content.photo && !layout.free.photos.length) notes.push('This layout has no place for a photo, so yours is not used.');
  if (!content.photo && layout.free.photos.length) notes.push('This layout has a photo region and you have not added a photo, so the region is left empty.');
  if (content.sub.trim() && !layout.free.slots.some((s) => s.role === 'subtitle')) notes.push('This layout has no second text box, so the subtitle is added to another box.');
  const fits = !notes.some((n) => /does not fit|has no place|no place for/i.test(n));
  return { url: URL.createObjectURL(blob), blob, notes, fits, width, height };
}

/** A small JPEG of a fitted picture, for a saved template. */
export const previewUrl = (f: Fitted) => previewOf(f.blob, 360);
export { isCarouselShape };
