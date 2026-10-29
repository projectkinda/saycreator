// How a cutout is placed and dressed in a thumbnail: where it is, how big, flipped, tilted, with an outline, a glow or a shadow, and whether the title is
// drawn behind it. Flip and outline change the picture itself (a variant is baked and cached); the rest is layer settings.
import { alphaOfPicture, bake } from './ops';

export interface CutoutLook {
  /** The middle of the subject, as a share of the thumbnail (0 to 1). Left out: the layout's own place. */
  x?: number;
  y?: number;
  /** 1 is half the thumbnail's width (0.15 to 2.5). Left out: the layout's own size. */
  scale?: number;
  /** Degrees, -45 to 45. */
  tilt?: number;
  flip?: boolean;
  outline?: { color: string; width: number };
  /** none, contact (a soft shadow on the floor), drop (a shadow behind), glow. Left out: the layout's own. */
  fx?: 'none' | 'contact' | 'drop' | 'glow';
  /** The title is drawn between the background and the subject. */
  textBehind?: boolean;
}

const cache = new Map<string, Promise<string>>();
/** A URL for the picture with the flip and the outline baked in (the same URL for the same settings). Returns the source unchanged when neither is asked for. */
export function variantUrl(src: string, o: { flip?: boolean; outline?: { color: string; width: number } }): Promise<string> {
  if (!o.flip && !(o.outline && o.outline.width > 0)) return Promise.resolve(src);
  const key = `${src}|${o.flip ? 'f' : ''}|${o.outline ? `${o.outline.color}${o.outline.width}` : ''}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const blob = await (await fetch(src)).blob();
      const bm = await createImageBitmap(blob);
      const k = Math.min(1, 1600 / Math.max(bm.width, bm.height));
      const al = await alphaOfPicture(bm, Math.max(bm.width, bm.height) * k);
      const out = await bake(bm, al, o);
      bm.close();
      return URL.createObjectURL(out);
    })();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}
