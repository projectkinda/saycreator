// Layouts with an OPTIONAL picture (Round D): headline-body-image, image-row, thumb-rows, cover-art, photo-cover, portrait-closing, art-side-text, do-dont.
// The picture is a field ("image", "image2" ...): a data: URL of a picture the person supplied (there is no upload yet, so nothing sets it by itself). With a picture the layout draws it
// cropped to its slot (cover fit, corners rounded like the preset's cards); WITHOUT one the layout draws its own text-only form (a prose page, a statement, number discs, a comparison with
// tick and cross badges ...): never an empty box. The writer is only offered these layouts when the deck has a picture. No text is ever drawn over a picture, so no scrim is needed.
import { CARD_PAD, Draw, measure, nearestWeight, S } from './draw';
import { arr, layoutDef, mk, place, str } from './library';
import type { Cx, ImageSlotDef, LayoutDef, LayoutStyle, Orientation, PlanImage } from './types';

/** The field names that hold a picture (not text: they are left out of every text budget, comparison and word list). */
export const IMAGE_KEYS = ['image', 'image2', 'image3', 'image4'] as const;
export const isImageKey = (k: string) => (IMAGE_KEYS as readonly string[]).includes(k);
/** The layouts that draw a picture when the slide has one (the writer is offered them only for a deck with a picture). */
export const IMAGE_LAYOUT_IDS = ['headline-body-image', 'image-row', 'thumb-rows', 'cover-art', 'photo-cover', 'portrait-closing', 'art-side-text', 'do-dont'] as const;
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+(?:#[\w.=&-]*)?$/;
const PICTURE_REF = /^picture:[A-Za-z0-9_-]{1,40}(?:#[\w.=&-]*)?$/;
/**
 * A picture the layout may draw: a base64 data: URL of a png, jpeg, webp, gif or svg picture, or a reference to one of the project's own pictures ("picture:<id>#w=1600&h=1067&fx=0.5&fy=0.5&z=1":
 * the natural size, the focus point 0..1 and the zoom, which the layout crops to). Nothing is loaded from the network. Otherwise ''.
 */
export const imageOf = (v: unknown): string => (typeof v === 'string' && v.length < 12_000_000 && (DATA_IMAGE.test(v.trim()) || PICTURE_REF.test(v.trim())) ? v.trim() : '');
export const imageProblem = (v: unknown): string | null => (typeof v === 'string' && v.trim() && !imageOf(v) ? 'must be a picture: a data: URL (png, jpeg, webp, gif or svg, base64) or a reference to one of the project pictures' : null);

/** What a picture reference carries. */
export interface PicRef {
  id: string;
  /** The natural size of the picture (needed to crop with a focus point and a zoom). */
  w?: number;
  h?: number;
  /** The focus point, 0..1 on each axis (the crop keeps it as near the slot's middle as the picture allows). */
  fx: number;
  fy: number;
  /** The zoom, 1 to 4 (1 = the picture just covers the slot). */
  z: number;
}
export const makeRef = (r: { id: string; w: number; h: number; fx?: number; fy?: number; z?: number }): string => `picture:${r.id}#w=${Math.round(r.w)}&h=${Math.round(r.h)}&fx=${Math.round((r.fx ?? 0.5) * 1000) / 1000}&fy=${Math.round((r.fy ?? 0.5) * 1000) / 1000}&z=${Math.round((r.z ?? 1) * 100) / 100}`;
const frag = (s: string) => Object.fromEntries((s.split('#')[1] ?? '').split('&').filter(Boolean).map((kv) => kv.split('=') as [string, string]));
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** A project picture reference (null for a data: URL or anything else). */
export function parseRef(v: unknown): PicRef | null {
  if (typeof v !== 'string' || !PICTURE_REF.test(v.trim())) return null;
  const s = v.trim();
  const f = frag(s);
  const num = (k: string, d: number) => (Number.isFinite(Number(f[k])) && f[k] !== undefined ? Number(f[k]) : d);
  return { id: s.slice('picture:'.length).split('#')[0], ...(f.w && f.h ? { w: num('w', 0), h: num('h', 0) } : {}), fx: clamp(num('fx', 0.5), 0, 1), fy: clamp(num('fy', 0.5), 0, 1), z: clamp(num('z', 1), 1, 4) };
}
/** The same reference with a new focus point and zoom. */
export const withCrop = (ref: string, c: { fx?: number; fy?: number; z?: number }): string => {
  const r = parseRef(ref);
  return r && r.w && r.h ? makeRef({ id: r.id, w: r.w, h: r.h, fx: c.fx ?? r.fx, fy: c.fy ?? r.fy, z: c.z ?? r.z }) : ref;
};
/**
 * Where the whole picture sits so that it covers the slot (cover fit), at the reference's zoom, with the focus point as near the slot's middle as the picture allows. Pure, so the engine
 * and the tests agree. Null when the reference has no size (a data: URL is cropped by the browser: centred).
 */
export function cropRect(slot: { x: number; y: number; w: number; h: number }, ref: PicRef | null): { x: number; y: number; w: number; h: number } | null {
  if (!ref || !ref.w || !ref.h) return null;
  const s = Math.max(slot.w / ref.w, slot.h / ref.h) * ref.z;
  const iw = ref.w * s, ih = ref.h * s;
  const x = clamp(slot.x + slot.w / 2 - ref.fx * iw, slot.x + slot.w - iw, slot.x);
  const y = clamp(slot.y + slot.h / 2 - ref.fy * ih, slot.y + slot.h - ih, slot.y);
  return { x, y, w: iw, h: ih };
}
export const orientationOf = (w: number, h: number): Orientation => { const a = w / h; return a > 1.15 ? 'landscape' : a < 0.87 ? 'portrait' : 'square'; };
export type { PlanImage };

/** A neutral, clearly generic stand-in for a picture (a flat tint with a sun and two hills): for the gallery and the sheets, never a photograph. */
export function placeholderImage(kind: 'photo' | 'portrait' | 'art' = 'photo', tint = '#D5DBE3'): string {
  const dark = '#9AA6B6', mid = '#B7C1CE';
  const body =
    kind === 'portrait'
      ? `<circle cx="200" cy="150" r="58" fill="${dark}"/><path d="M60 400 C 70 290 130 245 200 245 C 270 245 330 290 340 400 Z" fill="${dark}"/>`
      : `<circle cx="285" cy="95" r="42" fill="#EEF1F5"/><path d="M0 300 L120 170 L215 262 L290 205 L400 300 Z" fill="${mid}"/><path d="M0 300 L95 236 L190 300 Z" fill="${dark}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 ${kind === 'portrait' ? 400 : 300}" preserveAspectRatio="xMidYMid slice"><rect width="400" height="400" fill="${tint}"/>${body}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

const bw = (st: LayoutStyle, wt = 500) => nearestWeight(st.fonts.body, wt);
const eff = (size: number, max: number) => Math.min(max, S(size));
/** The corner radius of a picture: the preset's own (cards and buttons), kept between 12 and 48 px. */
const rad = (st: LayoutStyle) => Math.max(12, Math.min(48, st.radius ?? 28));
const rowsSlide = (d: { slots: { role: string; text: string; y: number; x: number }[] }, headline: string): Record<string, unknown> => {
  const bodies = [...d.slots].filter((s) => s.role === 'body').sort((a, b) => a.y - b.y || a.x - b.x).map((s) => s.text);
  return bodies.length <= 1 ? { type: 'content', ...(headline ? { headline } : {}), body: bodies[0] ?? '' } : { type: 'checklist', ...(headline ? { headline } : {}), items: bodies };
};
const slideType = (d: { slots: { role: string }[] }) => (d.slots.filter((s) => s.role === 'body').length <= 1 ? 'content' : 'checklist');
/**
 * Elastic pictures: the text under (or over) a picture is set first, as large as it fits (a base size above the old minimum: the type scale and the line caps still apply), and the
 * picture takes what is left of the free height, never less than its minimum and never more than its maximum. So the text is not squeezed to the floor by a fixed-size picture,
 * and the picture never goes below its slot minimum.
 */
export const PIC_MIN = { 'headline-body-image': 400, 'image-row': 360, 'image-row-tall': 460, 'photo-cover': 380, 'cover-art-circle': 520, 'cover-art-wide': 360, 'portrait-closing': 540, 'do-dont': 320, 'do-dont-stacked': 220 } as const;
/** The height of what `fn` draws (texts and their gaps) at the type scale being planned, measured on a scratch drawing. */
const heightOf = (d: Draw, fn: (t: Draw) => void): number => {
  const t = new Draw(d.st, d.field, d.cxo);
  fn(t);
  return t.y;
};
/** The height a picture may have: what is left of the free height after `used` (the other blocks and gaps), between its minimum and maximum. */
const room = (d: Draw, used: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.floor((d.fy1 - d.fy0) * 0.97 - used)));
const IMG = (name: string, note: string) => ({ name, required: false as const, max: 12_000_000, image: true as const, note });

export const IMAGE_LAYOUTS: LayoutDef[] = [
  // headline-body-image --------------------------------------------------------------------------------------------------------------
  {
    id: 'headline-body-image', label: 'Headline, text and picture', shapes: ['explainer', 'photo'], variants: ['picture below', 'picture above'],
    fields: [{ name: 'headline', required: true, max: 60 }, { name: 'body', required: true, max: 140 }, { name: 'num', required: false, max: 1, percent: true, note: 'a number 1-9: the headline reads "1. Headline"' }, IMG('image', 'a picture the person supplied')],
    samples: {
      normal: { headline: 'Zip the hood', num: '1', body: 'Zip the hood into the pocket and the hoodie becomes a bag you can carry on one shoulder.' },
      long: { headline: 'Why it stays dry on the train', body: 'The outer shell is taped at every seam, so water runs off instead of in, and the pocket lining wicks away the rest.' },
      short: { headline: 'The flip', body: 'One zip, ten seconds, no bag to pack.' },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      const num = str(f, 'num');
      const head = num ? `${num}. ${str(f, 'headline')}` : str(f, 'headline');
      // no picture: the text-only form is a prose page
      if (!img) return layoutDef('prose')!.plan({ heading: str(f, 'headline'), ...(num ? { num } : {}), p1: str(f, 'body') }, v, st, cx);
      const texts = (t: Draw) => {
        t.text('title', head, { size: 96, max: 130, weight: 800, font: 'h', lines: 3, min: 72, gap: 28 });
        t.text('body', str(f, 'body'), { size: 56, max: 64, lines: 4, min: 44, lh: 1.3, gap: v === 0 ? 40 : 0 });
      };
      const d = place(st, cx, 'center', (d) => {
        const ih = room(d, heightOf(d, texts) + (v === 1 ? 40 : 0), PIC_MIN['headline-body-image'], 700);
        const pic = () => { d.image(img, d.x0, d.y, d.w, ih, { rx: rad(st) }); d.y += ih; };
        if (v === 1) { pic(); d.gap(40); }
        texts(d);
        if (v === 0) pic();
      });
      return mk(d, { noBalance: true, type: slideType(d), fitAs: 'headline-body-image', slide: rowsSlide(d, head) });
    },
  },
  // image-row -----------------------------------------------------------------------------------------------------------------------
  {
    id: 'image-row', label: 'Row of pictures', shapes: ['photo', 'categories'], variants: ['framed row', 'tall row'],
    fields: [{ name: 'headline', required: true, max: 50 }, { name: 'paragraph', required: true, max: 140 }, { name: 'subline', required: false, max: 70 }, IMG('image', 'first picture'), IMG('image2', 'second picture'), IMG('image3', 'third picture')],
    samples: {
      normal: { headline: 'Built for everyday', subline: 'Rain, trains and long days.', paragraph: 'A waterproof shell, a padded laptop sleeve and one zip that turns the hood into a bag.' },
      long: { headline: 'Built for every kind of day', subline: 'Rain, trains, planes and long weekends.', paragraph: 'A waterproof shell, a padded laptop sleeve and one zip that turns the hood into a bag in ten seconds flat.' },
      short: { headline: 'Everyday', paragraph: 'One hoodie, two jobs, no bag to pack.' },
    },
    plan(f, v, st, cx) {
      const imgs = ['image', 'image2', 'image3'].map((k) => imageOf(f[k])).filter(Boolean);
      // no picture: the text-only form is a headline over one card
      if (!imgs.length) return layoutDef('headline-card')!.plan({ headline: str(f, 'headline'), ...(str(f, 'subline') ? { subline: str(f, 'subline') } : {}), card: str(f, 'paragraph') }, v, st, cx);
      const sub = str(f, 'subline');
      const head = (t: Draw) => {
        t.text('title', str(f, 'headline'), { size: 96, max: 130, weight: 800, font: 'h', lines: 2, min: 72, align: 'center', lh: 1.05, gap: sub ? 20 : 40 });
        if (sub) t.text('body', sub, { size: 48, max: 52, fill: '$muted', align: 'center', lines: 1, min: 44, gap: 40 });
      };
      const para = (t: Draw) => t.text('body', str(f, 'paragraph'), { size: 56, max: 64, align: 'center', lines: 4, min: 44, lh: 1.3 });
      const d = place(st, cx, 'center', (d) => {
        const ih = room(d, heightOf(d, (t) => { head(t); t.gap(40); para(t); }) + 40, v === 1 ? PIC_MIN['image-row-tall'] : PIC_MIN['image-row'], v === 1 ? 720 : 560);
        head(d);
        const n = imgs.length;
        const gap = 24;
        const w = (d.w - gap * (n - 1)) / n;
        imgs.forEach((src, i) => d.image(src, d.x0 + i * (w + gap), d.y, w, ih, { rx: rad(st) }));
        d.y += ih;
        d.gap(40);
        para(d);
      });
      return mk(d, { noBalance: true, type: slideType(d), fitAs: 'image-row', slide: rowsSlide(d, str(f, 'headline')) });
    },
  },
  // thumb-rows ----------------------------------------------------------------------------------------------------------------------
  {
    id: 'thumb-rows', label: 'Rows with thumbnails', shapes: ['list', 'categories'], variants: ['picture left', 'picture right'],
    fields: [{ name: 'items', required: true, max: 46, list: { min: 3, max: 4 } }, { name: 'title', required: false, max: 40 }, IMG('image', 'picture of row 1'), IMG('image2', 'picture of row 2'), IMG('image3', 'picture of row 3'), IMG('image4', 'picture of row 4')],
    samples: {
      normal: { title: 'What is in the box', items: ['The Quick Flip hoodie', 'A waterproof pouch', 'A pocket guide', 'A thank-you card'] },
      long: { title: 'Everything that is in the box', items: ['The Quick Flip hoodie in your size', 'A waterproof pouch for the hood', 'A pocket guide to every way to wear it', 'A thank-you card from the team'] },
      short: { title: 'In the box', items: ['Hoodie', 'Pouch', 'Guide'] },
    },
    plan(f, v, st, cx) {
      const items = arr(f, 'items').slice(0, 4);
      const title = str(f, 'title');
      const d = place(st, cx, 'center', (d) => {
        if (title) d.text('title', title, { size: 88, max: 120, weight: 800, font: 'h', lines: 2, min: 72, gap: 44 });
        const TW = 230;
        const TH = 160;
        const tx = v === 0 ? d.x0 + TW + 36 : d.x0;
        const tw = d.w - TW - 36;
        items.forEach((it, i) => {
          const src = imageOf(f[['image', 'image2', 'image3', 'image4'][i]]);
          const m = measure(it, st.fonts.body, bw(st), eff(48, 56), tw, 1.25);
          const h = Math.max(m.h + 2, TH);
          const px = v === 0 ? d.x0 : d.x0 + d.w - TW;
          if (src) d.image(src, px, d.y, TW, h, { rx: rad(st) });
          else {
            // no picture for this row: a number disc
            const r0 = Math.min(64, h / 2);
            d.circle(px + TW / 2, d.y + h / 2, r0, '$accent');
            d.text('body', String(i + 1), { x: px + TW / 2 - 60, w: 120, size: 56, max: 72, weight: 800, font: 'h', fill: '$onAccent', align: 'center', lines: 1, min: 44, at: d.y, boxH: h });
          }
          d.text('body', it, { x: tx, w: tw, size: 48, max: 56, lines: 3, min: 44, boxH: h, gap: i < items.length - 1 ? 28 : 0 });
        });
      });
      return mk(d, { noBalance: true, type: slideType(d), fitAs: 'thumb-rows', slide: rowsSlide(d, title) });
    },
  },
  // cover-art -----------------------------------------------------------------------------------------------------------------------
  {
    id: 'cover-art', label: 'Cover with art', shapes: ['claim', 'hook', 'photo'], variants: ['circle art', 'wide art'],
    fields: [{ name: 'headline', required: true, max: 60 }, { name: 'subtitle', required: false, max: 60 }, IMG('image', 'the art block')],
    samples: {
      normal: { headline: 'A hoodie that flips into a backpack', subtitle: 'One piece. Two jobs.' },
      long: { headline: 'The hoodie that turns into a backpack in ten seconds', subtitle: 'One piece of clothing, two jobs, and no bag at all.' },
      short: { headline: 'Meet Quick Flip' },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      // no picture: the text-only form is a statement on a card
      if (!img) return layoutDef('statement-card')!.plan({ headline: str(f, 'headline'), ...(str(f, 'subtitle') ? { caption: str(f, 'subtitle') } : {}) }, v, st, cx);
      const sub = str(f, 'subtitle');
      const texts = (t: Draw) => {
        t.text('title', str(f, 'headline'), { size: 112, max: 150, weight: 800, font: 'h', lines: 3, min: 72, lh: 1.02, gap: sub ? 24 : 44 });
        if (sub) t.text('body', sub, { size: 52, max: 56, fill: '$muted', lines: 1, min: 44, gap: 44 });
      };
      const d = place(st, cx, 'center', (d) => {
        texts(d);
        // the art takes the rest of the page: a circle as large as the width allows, or a wide block
        if (v === 0) { const D = Math.min(d.w, room(d, heightOf(d, texts), PIC_MIN['cover-art-circle'], 880)); d.image(img, d.cx - D / 2, d.y, D, D, { rx: 0, circle: true }); d.y += D; }
        else { const ih = room(d, heightOf(d, texts), PIC_MIN['cover-art-wide'], 700); d.image(img, d.x0, d.y, d.w, ih, { rx: rad(st) }); d.y += ih; }
      });
      return mk(d, { noBalance: true, type: slideType(d), fitAs: 'cover-art', slide: rowsSlide(d, str(f, 'headline')) });
    },
  },
  // photo-cover ---------------------------------------------------------------------------------------------------------------------
  {
    id: 'photo-cover', label: 'Cover with a wide photo', shapes: ['claim', 'hook', 'photo'], variants: ['photo below', 'photo above'],
    fields: [{ name: 'headline', required: true, max: 60 }, { name: 'intro', required: true, max: 110 }, IMG('image', 'one wide photo')],
    samples: {
      normal: { headline: 'A hoodie that flips into a backpack', intro: 'We sewed a bag into the hood, so one layer does both jobs.' },
      long: { headline: 'The hoodie that turns into a backpack in ten seconds', intro: 'We sewed a waterproof bag into the hood and tested it for two years on trains and planes.' },
      short: { headline: 'Meet Quick Flip', intro: 'One hoodie, two jobs, no bag.' },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      // no picture: the text-only form is a prose page
      if (!img) return layoutDef('prose')!.plan({ heading: str(f, 'headline'), p1: str(f, 'intro') }, v, st, cx);
      const texts = (t: Draw) => {
        t.text('title', str(f, 'headline'), { size: 104, max: 150, weight: 800, font: 'h', lines: 3, min: 72, lh: 1.02, gap: 28 });
        t.text('body', str(f, 'intro'), { size: 56, max: 64, lines: 3, min: 44, lh: 1.3, gap: v === 0 ? 40 : 0 });
      };
      const d = place(st, cx, 'center', (d) => {
        const ih = room(d, heightOf(d, texts) + (v === 1 ? 40 : 0), PIC_MIN['photo-cover'], 640);
        const pic = () => { d.image(img, d.x0, d.y, d.w, ih, { rx: rad(st) }); d.y += ih; };
        if (v === 1) { pic(); d.gap(40); }
        texts(d);
        if (v === 0) pic();
      });
      return mk(d, { noBalance: true, type: slideType(d), fitAs: 'photo-cover', slide: rowsSlide(d, str(f, 'headline')) });
    },
  },
  // portrait-closing ----------------------------------------------------------------------------------------------------------------
  {
    id: 'portrait-closing', label: 'Closing with a portrait', shapes: ['ask', 'photo'], variants: ['portrait right', 'portrait left'],
    fields: [{ name: 'headline', required: true, max: 40 }, { name: 'heading', required: true, max: 40 }, { name: 'p1', required: true, max: 160 }, { name: 'p2', required: false, max: 120 }, { name: 'url', required: false, max: 40 }, IMG('image', 'a portrait')],
    samples: {
      normal: { headline: 'Meet the maker', heading: 'Back Quick Flip today', p1: 'We are two friends who got tired of carrying a bag and a hoodie. Early backers save 30%.', url: 'quickflip.com' },
      long: { headline: 'Meet the makers behind Quick Flip', heading: 'Back Quick Flip on Kickstarter', p1: 'We are two friends who got tired of carrying a bag and a hoodie on every commute, so we built one piece that does both.', p2: 'Early backers save thirty percent this week.', url: 'quickflip.com/backers' },
      short: { headline: 'Say hello', heading: 'Back it now', p1: 'One hoodie, two jobs. Early backers save 30%.' },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      const url = str(f, 'url');
      // the text below the picture, as large as leaves the portrait its 40% of the page: three sizes are tried, the largest that fits first
      const belowAt = (lv: number) => (t: Draw) => {
        const [hs, bs] = [[64, 52], [56, 48], [48, 44]][lv];
        t.text('body', str(f, 'heading'), { size: hs, max: lv === 0 ? 80 : hs, weight: 800, font: 'h', lines: 2, min: 44, gap: 24 });
        t.text('body', str(f, 'p1'), { size: bs, max: lv === 0 ? 56 : bs, lines: 4, min: 44, lh: 1.3, gap: str(f, 'p2') || url ? 20 : 0 });
        if (str(f, 'p2')) t.text('body', str(f, 'p2'), { size: bs, max: lv === 0 ? 56 : bs, lines: 3, min: 44, lh: 1.3, gap: url ? 20 : 0 });
        if (url) t.text('body', url, { size: bs, max: lv === 0 ? 56 : bs, weight: 700, font: 'h', fill: '$accentText', lines: 1, min: 44 });
      };
      const d = place(st, cx, 'center', (d) => {
        let lv = 0;
        if (img) while (lv < 2 && (d.fy1 - d.fy0) * 0.97 - heightOf(d, belowAt(lv)) - 48 < PIC_MIN['portrait-closing']) lv++;
        const below = belowAt(lv);
        if (img) {
          // the portrait is the hero: a tall picture on one side (at least 40% of the page tall), the title beside it, the text below; no band
          const PW = Math.round(d.w * 0.46);
          const ph = room(d, heightOf(d, below) + 48, PIC_MIN['portrait-closing'], 780);
          const px = v === 1 ? d.x0 : d.x0 + d.w - PW;
          const tw = d.w - PW - 44;
          const tx = v === 1 ? d.x0 + PW + 44 : d.x0;
          const y0 = d.y;
          d.text('title', str(f, 'headline'), { x: tx, w: tw, size: 104, max: 130, weight: 800, font: 'h', lines: 4, min: 72, lh: 1.05, at: y0, boxH: ph });
          d.image(img, px, y0, PW, ph, { rx: rad(st), front: true });
          d.y = y0 + ph;
        } else {
          // no picture: the same page with an accent card in the picture's place, tall enough to fill the page; the title sits in it
          const bh = room(d, heightOf(d, below) + 48, 360, 800);
          const y0 = d.y;
          d.rect(d.x0, y0, d.w, bh, '$accent', { rx: rad(st) });
          d.text('title', str(f, 'headline'), { x: d.x0 + CARD_PAD, w: d.w - 2 * CARD_PAD, size: 112, max: 150, weight: 800, font: 'h', fill: '$onAccent', lines: 3, min: 72, lh: 1.05, at: y0 + CARD_PAD, boxH: bh - 2 * CARD_PAD });
          d.y = y0 + bh;
        }
        d.gap(48);
        below(d);
      });
      return mk(d, { noBalance: true, type: 'checklist', fitAs: 'portrait-closing', slide: rowsSlide(d, str(f, 'headline')) });
    },
  },
  // art-side-text -------------------------------------------------------------------------------------------------------------------
  {
    id: 'art-side-text', label: 'Text beside the art', shapes: ['explainer', 'story', 'photo'], variants: ['art below', 'art above'],
    fields: [{ name: 'heading', required: true, max: 40 }, { name: 'paragraph', required: true, max: 140 }, IMG('image', 'an illustration or photo')],
    samples: {
      normal: { heading: 'Follow the flip', paragraph: 'We post a new way to wear it every Friday, from the train to the trail.' },
      long: { heading: 'Follow the flip every week', paragraph: 'We post a new way to wear it every Friday, from the train to the trail, and share the best ones from backers.' },
      short: { heading: 'Follow us', paragraph: 'A new way to wear it every Friday.' },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      const fh = cx.field.y1 - cx.field.y0;
      const ih = Math.round(fh * 0.4);
      const d = place(st, cx, 'center', (d) => {
        // the text sits in the right 64% of the width, with a hand-drawn arrow at its left pointing at the art
        const cw = Math.round(d.w * 0.64);
        const x = d.x0 + d.w - cw;
        const pic = () => { if (img) { d.image(img, d.x0, d.y, d.w, ih, { rx: rad(st) }); d.y += ih; } };
        if (v === 1) { pic(); if (img) d.gap(40); }
        const y0 = d.y;
        d.text('title', str(f, 'heading'), { x, w: cw, size: 88, max: img ? 120 : 240, weight: 800, font: 'h', lines: img ? 2 : 3, min: 72, gap: 28 });
        d.text('body', str(f, 'paragraph'), { x, w: cw, size: 48, max: img ? 60 : 110, lines: img ? 4 : 6, min: 44, lh: 1.3 });
        const ah = Math.max(160, d.y - y0);
        // the arrow: a curved shaft with a head, drawn left of the text and pointing at the art
        const ax = d.x0 + 60, ay = y0 + 20;
        const dir = img && v === 1 ? -1 : 1; // the arrow points at the art (above it for the art-above variant); with no art it points down
        const tipY = Math.max(d.fy0 + 20, Math.min(d.fy1 - 20, ay + dir * Math.max(170, Math.min(260, ah * 0.9))));
        d.path(`M ${ax + 86} ${ay} C ${ax + 86} ${ay + dir * 90} ${ax + 30} ${tipY - dir * 90} ${ax + 6} ${tipY - dir * 8}`, { stroke: '$text', sw: 10, cap: true, y0: Math.min(ay, tipY), y1: Math.max(ay, tipY) });
        d.path(`M ${ax - 30} ${tipY - dir * 50} L ${ax + 6} ${tipY - dir * 4} L ${ax + 42} ${tipY - dir * 46}`, { stroke: '$text', sw: 10, cap: true, y0: Math.min(tipY, tipY - dir * 40), y1: Math.max(tipY, tipY - dir * 40) });
        if (v === 0) { if (img) d.gap(48); pic(); }
      });
      return mk(d, { noBalance: true, type: 'content', fitAs: 'art-side-text', slide: { type: 'content', headline: str(f, 'heading'), body: str(f, 'paragraph') } });
    },
  },
  // do-dont -------------------------------------------------------------------------------------------------------------------------
  {
    id: 'do-dont', label: 'Do and do not', shapes: ['contrast', 'photo'], variants: ['side by side', 'stacked'],
    fields: [{ name: 'title', required: true, max: 40 }, { name: 'wrong', required: true, max: 50 }, { name: 'right', required: true, max: 50 }, { name: 'body', required: false, max: 90 }, { name: 'num', required: false, max: 1, percent: true, note: 'a number 1-9' }, IMG('image', 'the picture for the wrong side'), IMG('image2', 'the picture for the right side')],
    samples: {
      normal: { title: 'Pack it', num: '1', body: 'The hood is the bag, so there is nothing to pack.', wrong: 'A bag and a hoodie, both heavy.', right: 'One hoodie that becomes the bag.' },
      long: { title: 'Carry it on the train', body: 'Two straps share the weight, and the hood folds flat against your back.', wrong: 'A strap that digs into one shoulder.', right: 'Two straps that share the weight.' },
      short: { title: 'Pack it', wrong: 'A heavy bag.', right: 'One hoodie.' },
    },
    plan(f, v, st, cx) {
      const imgW = imageOf(f.image);
      const imgR = imageOf(f.image2);
      const num = str(f, 'num');
      const title = num ? `${num}. ${str(f, 'title')}` : str(f, 'title');
      const body = str(f, 'body');
      const R = 40;
      const anyImg = !!(imgW || imgR);
      const head = (t: Draw) => {
        t.text('title', title, { size: 96, max: 130, weight: 800, font: 'h', lines: 2, min: 72, gap: body ? 20 : 44 });
        if (body) t.text('body', body, { size: 48, max: 52, fill: '$muted', lines: 2, min: 44, gap: 40 });
      };
      const d = place(st, cx, 'center', (d) => {
        head(d);
        // a badge: a disc with a cross (wrong) or a tick (right), drawn over the top-left corner of its panel's row
        const badge = (cx0: number, cy0: number, ok: boolean) => {
          d.circle(cx0, cy0, R, ok ? '$accent' : '$text');
          const ink = ok ? '$onAccent' : '$bg';
          if (ok) d.path(`M ${cx0 - 16} ${cy0 + 1} L ${cx0 - 4} ${cy0 + 13} L ${cx0 + 18} ${cy0 - 13}`, { stroke: ink, sw: 9, cap: true, y0: cy0 - R, y1: cy0 + R });
          else d.path(`M ${cx0 - 14} ${cy0 - 14} L ${cx0 + 14} ${cy0 + 14} M ${cx0 + 14} ${cy0 - 14} L ${cx0 - 14} ${cy0 + 14}`, { stroke: ink, sw: 9, cap: true, y0: cy0 - R, y1: cy0 + R });
        };
        const panel = (x: number, y: number, w: number, h: number, text: string, src: string, ok: boolean) => {
          if (src) {
            d.image(src, x, y, w, h, { rx: rad(st) });
            badge(x + R + 12, y + R + 12, ok);
          } else {
            // no picture: a card with the text inside it (44 px in) and the badge in its corner row
            d.rect(x, y, w, h, '$surface', { rx: 32 });
            badge(x + CARD_PAD + R - 8, y + CARD_PAD + R - 8, ok);
          }
          void text;
        };
        const CAP = { size: 52, max: 56, lines: 3, min: 44, lh: 1.25 };
        const cap = (x: number, y: number, w: number, text: string) => d.text('body', text, { x, w, ...CAP, at: y });
        const capH = (w: number) => Math.max(heightOf(d, (t) => t.text('body', str(f, 'wrong'), { w, ...CAP })), heightOf(d, (t) => t.text('body', str(f, 'right'), { w, ...CAP })));
        if (v === 0) {
          const gap = 28;
          const w = (d.w - gap) / 2;
          const withImg = anyImg;
          const ch = withImg ? 20 + capH(w) : 0;
          const ph = withImg ? room(d, heightOf(d, head) + ch, PIC_MIN['do-dont'], 560) : 400;
          const y0 = d.y;
          [[d.x0, str(f, 'wrong'), imgW, false], [d.x0 + w + gap, str(f, 'right'), imgR, true]].forEach(([x, text, src, ok]) => {
            panel(x as number, y0, w, ph, text as string, src as string, ok as boolean);
            if (src) cap(x as number, y0 + ph + 20, w, text as string);
            else d.text('body', text as string, { x: (x as number) + CARD_PAD, w: w - 2 * CARD_PAD, size: 48, max: 56, lines: 5, min: 44, lh: 1.3, at: y0 + CARD_PAD + 2 * R + 8, boxH: ph - 2 * CARD_PAD - 2 * R - 8 });
          });
          d.y = y0 + ph + ch;
        } else {
          const ph = anyImg ? Math.floor(room(d, heightOf(d, head) + 28, 2 * PIC_MIN['do-dont-stacked'], 700) / 2) : 250;
          [[str(f, 'wrong'), imgW, false], [str(f, 'right'), imgR, true]].forEach(([text, src, ok], i) => {
            const y0 = d.y;
            const tw = d.w - (src ? 340 + 28 : 0);
            if (src) {
              d.image(src as string, d.x0, y0, 340, ph, { rx: rad(st) });
              badge(d.x0 + R + 12, y0 + R + 12, ok as boolean);
              d.text('body', text as string, { x: d.x0 + 340 + 28, w: tw, size: 52, max: 60, lines: 4, min: 44, lh: 1.3, at: y0, boxH: ph });
            } else {
              d.rect(d.x0, y0, d.w, ph, '$surface', { rx: 32 });
              badge(d.x0 + CARD_PAD + R, y0 + ph / 2, ok as boolean);
              d.text('body', text as string, { x: d.x0 + CARD_PAD + 2 * R + 28, w: d.w - 2 * CARD_PAD - 2 * R - 28, size: 48, max: 56, lines: 3, min: 44, lh: 1.3, at: y0 + CARD_PAD, boxH: ph - 2 * CARD_PAD });
            }
            d.y = y0 + ph;
            if (i === 0) d.gap(28);
          });
        }
      });
      return mk(d, { noBalance: true, type: 'checklist', fitAs: 'do-dont', slide: rowsSlide(d, title) });
    },
  },
];
// The picture slots of each layout (from the geometry the plans use): how many, the shape of each (width / height) and which picture orientations crop well in it. A layout is drawn in its
// picture form only when at least `min` pictures fit; otherwise the slide uses the layout's text-only form (never an empty box).
const LAND: Orientation[] = ['landscape', 'square'];
const PORT: Orientation[] = ['portrait', 'square'];
const ANY: Orientation[] = ['landscape', 'square', 'portrait'];
const slot = (field: string, aspect: number, accepts: Orientation[], orientation: Orientation = orientationOf(aspect, 1)): ImageSlotDef => ({ field, aspect: Math.round(aspect * 1000) / 1000, orientation, accepts });
const SLOTS: Record<string, { min: number; slots: (v: 0 | 1) => ImageSlotDef[] }> = {
  'headline-body-image': { min: 1, slots: () => [slot('image', 978 / 520, LAND)] },
  'image-row': { min: 3, slots: (v) => ['image', 'image2', 'image3'].map((f) => slot(f, 310 / (v === 1 ? 500 : 400), PORT)) },
  'thumb-rows': { min: 3, slots: () => ['image', 'image2', 'image3', 'image4'].map((f) => slot(f, 230 / 160, LAND)) },
  'cover-art': { min: 1, slots: (v) => [v === 0 ? slot('image', 1, ANY) : slot('image', 978 / 400, LAND)] },
  'photo-cover': { min: 1, slots: () => [slot('image', 978 / 420, LAND)] },
  'portrait-closing': { min: 1, slots: () => [slot('image', 0.7, PORT, 'portrait')] },
  'art-side-text': { min: 1, slots: () => [slot('image', 978 / 400, LAND)] },
  'do-dont': { min: 2, slots: (v) => [slot('image', v === 0 ? 475 / 400 : 340 / 250, ANY), slot('image2', v === 0 ? 475 / 400 : 340 / 250, ANY)] },
};
IMAGE_LAYOUTS.forEach((l) => { const s = SLOTS[l.id]; l.imageSlots = s.slots; l.minImages = s.min; });
/** The picture slots of a layout in a variant (empty for a layout with none). */
export const imageSlotsOf = (layout: string, variant: 0 | 1 = 0): ImageSlotDef[] => SLOTS[layout]?.slots(variant) ?? [];
/** How many pictures a layout needs for its picture form (0 for a layout with no picture slots). */
export const imagesNeeded = (layout: string): number => SLOTS[layout]?.min ?? 0;
/** The picture info the code knows about a picture: metadata only (never pixels). */
export interface PicInfo {
  id: string;
  width: number;
  height: number;
}
export const picOrientation = (p: PicInfo): Orientation => orientationOf(p.width, p.height);
export const picAspect = (p: PicInfo): number => p.width / p.height;
/** How many of the pictures fit a layout's slots (their orientation is one the slot accepts). */
export const fittingPictures = (layout: string, pics: PicInfo[], variant: 0 | 1 = 0): number => {
  const slots = imageSlotsOf(layout, variant);
  return slots.length ? pics.filter((p) => slots.some((s) => s.accepts.includes(picOrientation(p)))).length : 0;
};
/** Whether a layout can draw its picture form with these pictures (enough of them, of orientations its slots accept). */
export const hasEnoughPictures = (layout: string, pics: PicInfo[] | undefined, variant: 0 | 1 = 0): boolean => !!pics && fittingPictures(layout, pics, variant) >= imagesNeeded(layout);
export type { Cx };
