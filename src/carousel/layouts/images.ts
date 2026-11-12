// Layouts with an OPTIONAL picture (Round D): headline-body-image, image-row, thumb-rows, cover-art, photo-cover, portrait-closing, art-side-text, do-dont.
// The picture is a field ("image", "image2" ...): a data: URL of a picture the person supplied (there is no upload yet, so nothing sets it by itself). With a picture the layout draws it
// cropped to its slot (cover fit, corners rounded like the preset's cards); WITHOUT one the layout draws its own text-only form (a prose page, a statement, number discs, a comparison with
// tick and cross badges ...): never an empty box. The writer is only offered these layouts when the deck has a picture. No text is ever drawn over a picture, so no scrim is needed.
import { CARD_PAD, Draw, accentInk, lineTexts, measure, nearestWeight, S } from './draw';
import { measureWidth } from '../../image-engine/draw/text';
import { arr, layoutDef, mk, place, str, withAccent } from './library';
import type { Cx, ImageSlotDef, LayoutDef, LayoutStyle, Orientation, PlanImage } from './types';

/** The field names that hold a picture (not text: they are left out of every text budget, comparison and word list). */
export const IMAGE_KEYS = ['image', 'image2', 'image3', 'image4'] as const;
export const isImageKey = (k: string) => (IMAGE_KEYS as readonly string[]).includes(k);
/** The layouts that draw a picture when the slide has one (the writer is offered them only for a deck with a picture). */
export const IMAGE_LAYOUT_IDS = ['headline-body-image', 'image-row', 'thumb-rows', 'cover-art', 'photo-cover', 'portrait-closing', 'art-side-text', 'do-dont', 'photo-full-caption', 'split-half', 'title-over-photo', 'twin-photos', 'photo-grid', 'phone-frame', 'list-under-band', 'list-beside-picture'] as const;
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
  /** A photo (not a screenshot): the crop budget is 25% and a photo shown whole sits on a blurred copy of itself. Written "k=p" in the reference. */
  photo?: boolean;
  /** The natural size of the picture (needed to crop with a focus point and a zoom). */
  w?: number;
  h?: number;
  /** The focus point, 0..1 on each axis (the crop keeps it as near the slot's middle as the picture allows). */
  fx: number;
  fy: number;
  /** The zoom, 1 to 4 (1 = the picture just covers the slot). */
  z: number;
}
export const makeRef = (r: { id: string; w: number; h: number; fx?: number; fy?: number; z?: number; photo?: boolean }): string => `picture:${r.id}#w=${Math.round(r.w)}&h=${Math.round(r.h)}&fx=${Math.round((r.fx ?? 0.5) * 1000) / 1000}&fy=${Math.round((r.fy ?? 0.5) * 1000) / 1000}&z=${Math.round((r.z ?? 1) * 100) / 100}${r.photo ? '&k=p' : ''}`;
const frag = (s: string) => Object.fromEntries((s.split('#')[1] ?? '').split('&').filter(Boolean).map((kv) => kv.split('=') as [string, string]));
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** A project picture reference (null for a data: URL or anything else). */
export function parseRef(v: unknown): PicRef | null {
  if (typeof v !== 'string' || !PICTURE_REF.test(v.trim())) return null;
  const s = v.trim();
  const f = frag(s);
  const num = (k: string, d: number) => (Number.isFinite(Number(f[k])) && f[k] !== undefined ? Number(f[k]) : d);
  return { id: s.slice('picture:'.length).split('#')[0], ...(f.k === 'p' ? { photo: true } : {}), ...(f.w && f.h ? { w: num('w', 0), h: num('h', 0) } : {}), fx: clamp(num('fx', 0.5), 0, 1), fy: clamp(num('fy', 0.5), 0, 1), z: clamp(num('z', 1), 1, 4) };
}
/** The same reference with a new focus point and zoom. */
export const withCrop = (ref: string, c: { fx?: number; fy?: number; z?: number }): string => {
  const r = parseRef(ref);
  return r && r.w && r.h ? makeRef({ id: r.id, w: r.w, h: r.h, fx: c.fx ?? r.fx, fy: c.fy ?? r.fy, z: c.z ?? r.z, ...(r.photo ? { photo: true } : {}) }) : ref;
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
/** The shape of a picture from its reference (null for a picture with no known size: it is treated as a landscape photo). */
export type PicShape = 'tall' | 'portrait' | 'square' | 'landscape' | 'wide';
export const shapeOfAspect = (a: number): PicShape => (a <= 0.5 ? 'tall' : a < 0.87 ? 'portrait' : a <= 1.15 ? 'square' : a >= 2.2 ? 'wide' : 'landscape');
export const shapeOf = (src: string): { aspect: number; kind: PicShape } | null => {
  const r = parseRef(src);
  return r?.w && r.h ? { aspect: r.w / r.h, kind: shapeOfAspect(r.w / r.h) } : null;
};
/** A round or circle crop only suits a picture that is nearly square (aspect 0.7 to 1.4). */
export const nearSquare = (a: number): boolean => a >= 0.7 && a <= 1.4;
/** A tall or portrait picture (a phone screenshot, a portrait photo) is shown in a half-and-half split, edge to edge. */
const panelShape = (src: string): boolean => { const k = shapeOf(src)?.kind; return k === 'tall' || k === 'portrait'; };
const SLIDE_W = 1080;
/** The picture zone: between the handle row (y 109) and the page counter (y 1258), so no page chrome is ever over a picture. */
const ZONE_TOP = 116;
const ZONE_BOTTOM = 1250;
const FULL_PIC_H = 880;
const FULL_PANEL_H = ZONE_BOTTOM - ZONE_TOP - FULL_PIC_H;
const HALF_W = 655;
const HALF_H = 1114;
const HALF_BAND_H = 675;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** The picture panel of a split: 61% of the width. */
export const PANEL_W = 486;
/** The panel and the hero band sit between the handle / number at the top of the slide (y 62 to 109) and the page counter at the foot (from y 1258), so no text of the page chrome is ever over a picture. */
export const PANEL_Y = 116;
/** Its height: 655 x 1114 is 50.04% of the slide. */
export const PANEL_H = 1114;
/** The top band of a hero: the whole width, 50% of the slide. */
export const HERO_BAND_H = 676;
export const HERO_BAND_Y = 116;
/**
 * Half-and-half split: the picture runs edge to edge over MORE than half of the slide (a tall or portrait picture; the crop shows its top), the text sits in the other half, centred in the free height.
 */
function splitPanel(d: Draw, img: string, v: 0 | 1, texts: (t: Draw, x: number, w: number) => void): void {
  const left = v === 1;
  const x = left ? 0 : SLIDE_W - PANEL_W;
  const tx = left ? PANEL_W + 40 : d.x0;
  const tw = left ? SLIDE_W - tx - 48 - 6 : SLIDE_W - PANEL_W - 40 - d.x0 - 6;
  const th = heightOf(d, (t) => texts(t, tx, tw));
  d.y = d.fy0 + Math.max(0, Math.round((d.fy1 - d.fy0 - th) / 2));
  texts(d, tx, tw);
  d.image(img, x, PANEL_Y, PANEL_W, PANEL_H, { rx: 0 });
}
/** Hero band: the picture across the whole width at the top, edge to edge, over more than half of the slide; the text sits below it. */
function heroBand(d: Draw, img: string, texts: (t: Draw) => void): void {
  d.image(img, 0, HERO_BAND_Y, SLIDE_W, HERO_BAND_H, { rx: 0 });
  const top = HERO_BAND_Y + HERO_BAND_H + 30;
  d.y = top + Math.max(0, Math.round((d.fy1 - top - heightOf(d, texts)) / 2));
  texts(d);
}
/** The headline size of the other headline-left layouts of a style (a statement is set at 140 px, up to 150): the headline of a split is at least 85% of it. */
const HEAD_REF = 140;
/**
 * The headline size in a column beside a picture (phone-frame, the tall-picture half of split-half), Round 16: from `normal` down to 70% of it, the first size at which the headline wraps to at
 * most 4 lines (balanced, as the engine sets it) and has no line of one small word ("and", "a"); then the first that gives 4 lines even with such a word; only then a fifth line, down to
 * `floor` (never under it). A word wider than the column at a size rules that size out.
 */
export function sideHeadSize(head: string, st: LayoutStyle, tw: number, normal: number, floor = 72): number {
  const wt = nearestWeight(st.fonts.headline, 800);
  const words = head.split(/\s+/).filter(Boolean);
  const fits = (s: number) => words.every((x) => measureWidth(x, st.fonts.headline, wt, s) <= tw * 0.98);
  const lines = (s: number) => lineTexts(head, st.fonts.headline, wt, s, tw, 1.05, { phrases: [], marker: false });
  const weak = (ls: string[]) => ls.length > 1 && ls.some((l) => { const w = l.trim().split(/\s+/).filter(Boolean); return w.length === 1 && w[0].length <= 3; });
  const lo = Math.max(floor, Math.round((normal * 0.7) / 4) * 4);
  for (let s = normal; s >= lo; s -= 4) if (fits(s) && lines(s).length <= 4 && !weak(lines(s))) return s;
  for (let s = normal; s >= lo; s -= 4) if (fits(s) && lines(s).length <= 4) return s;
  for (let s = lo - 4; s >= floor; s -= 4) if (fits(s) && lines(s).length <= 5) return s;
  return 0; // no size fits the words in the column
}

/**
 * The size the headline takes beside a tall picture: the largest from the reference size down to 85% of it at which it wraps to at most 4 lines in the text column (the picture panel is at most 45% of the
 * width) with no word wider than the column. Null when it does not fit: the slide is then the stacked version (the picture below the text).
 */
const panelHeadSize = (st: LayoutStyle, text: string): number | null => {
  const w = SLIDE_W - PANEL_W - 40 - 48 - 6;
  const wt = nearestWeight(st.fonts.headline, 800);
  const words = text.split(/\s+/).filter(Boolean);
  for (let z = HEAD_REF; z >= Math.ceil(HEAD_REF * 0.85); z -= 3) {
    if (words.every((x) => measureWidth(x, st.fonts.headline, wt, z) <= w * 0.98) && measure(text, st.fonts.headline, wt, z, w, 1.05).n <= 4) return z;
  }
  return null;
};
const IMG = (name: string, note: string) => ({ name, required: false as const, max: 12_000_000, image: true as const, note });


// ----- the rows of a list that sits with a picture (list-under-band, list-beside-picture; Round 17) -----
/** A list's marks: numerals in the accent colour (variant 1), or small dots (variant 2, and always when the numerals would push the slide over the phone's 50-word check). */
const listMarks = (title: string, items: string[], v: 0 | 1): 'numerals' | 'dots' => {
  const n = (t: string) => t.split(/\s+/).filter(Boolean).length;
  return v === 0 && n(title) + items.reduce((a, t) => a + n(t), 0) + items.length + 6 <= 46 ? 'numerals' : 'dots';
};
const MARK_W = { numerals: 120, dots: 48 } as const;
const ROW_GAP = 14;
const LIST_BS = 44;
const listRowH = (st: LayoutStyle, it: string, tw: number): number => Math.max(measure(it, st.fonts.body, nearestWeight(st.fonts.body, 500), LIST_BS, tw, 1.2).h + 2, 60);
/** The items of a list as rows at the draw cursor: a numeral (or a dot) and the item's words. `x0`/`w` are the column. */
function listRows(d: Draw, st: LayoutStyle, items: string[], x0: number, w: number, mode: 'numerals' | 'dots'): void {
  const tw = w - MARK_W[mode];
  items.forEach((it, i) => {
    const h = listRowH(st, it, tw);
    if (mode === 'numerals') d.text('body', String(i + 1), { x: x0, w: MARK_W.numerals, size: LIST_BS, max: LIST_BS, weight: 800, font: 'h', fill: accentInk(st), align: 'left', lines: 1, min: 44, at: d.y, boxH: h });
    else d.circle(x0 + 14, d.y + h / 2, 14, '$accent');
    d.text('body', it, { x: x0 + MARK_W[mode], w: tw, size: LIST_BS, max: LIST_BS, lines: 4, min: 44, lh: 1.2, boxH: h, gap: i < items.length - 1 ? ROW_GAP : 0 });
  });
}

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
        if (str(f, 'body')) t.text('body', str(f, 'body'), { size: 56, max: 64, lines: 4, min: 44, lh: 1.3, gap: v === 0 ? 40 : 0 });
      };
      // a tall or portrait picture: a half-and-half split (the picture edge to edge on one side)
      const panelZ = panelShape(img) && v === 0 ? panelHeadSize(st, head) : null;
      if (panelZ) {
        const d = place(st, cx, 'top', (d) => splitPanel(d, img, 0, (t, x, w) => {
          t.text('title', head, { x, w, size: panelZ, max: panelZ, weight: 800, font: 'h', lines: 4, min: 72, gap: 28 });
          if (str(f, 'body')) t.text('body', str(f, 'body'), { x, w, size: 44, max: 48, lines: 12, min: 44, lh: 1.3 });
        }));
        return mk(d, { noBalance: true, type: slideType(d), fitAs: 'headline-body-image', slide: rowsSlide(d, head) });
      }
      // "picture above": the hero band, edge to edge over more than half of the slide (a tall picture too: it shows its top). A tall picture with a headline too long for the split column is the stacked version below
      if (v === 1) {
        const d = place(st, cx, 'top', (d) => {
          heroBand(d, img, (t) => {
            t.text('title', head, { size: 76, max: 88, weight: 800, font: 'h', lines: 2, min: 56, gap: 24 });
            if (str(f, 'body')) t.text('body', str(f, 'body'), { size: 44, max: 48, lines: 3, min: 44, lh: 1.3 });
          });
        });
        return mk(d, { noBalance: true, type: slideType(d), fitAs: 'headline-body-image', slide: rowsSlide(d, head) });
      }
      const d = place(st, cx, 'center', (d) => {
        const ih = room(d, heightOf(d, texts), PIC_MIN['headline-body-image'], 700);
        const pic = () => { d.image(img, d.x0, d.y, d.w, ih, { rx: rad(st) }); d.y += ih; };
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
      const sh = shapeOf(img);
      // a tall or portrait picture is never cropped into a circle: a half-and-half split shows it (its top)
      if (panelShape(img)) return layoutDef('headline-body-image')!.plan({ headline: str(f, 'headline'), ...(sub ? { body: sub } : { body: '' }), image: img }, v, st, cx);
      // a circle only for a nearly square picture (aspect 0.7 to 1.4); any other shape takes the wide block
      const round = v === 0 && (!sh || nearSquare(sh.aspect));
      const d = place(st, cx, 'center', (d) => {
        texts(d);
        // the art takes the rest of the page: a circle as large as the width allows, or a wide block
        if (round) { const D = Math.min(d.w, room(d, heightOf(d, texts), PIC_MIN['cover-art-circle'], 880)); d.image(img, d.cx - D / 2, d.y, D, D, { rx: 0, circle: true }); d.y += D; }
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
      // (the split is the headline-body-image split: the same words in the same two columns)
      if (panelShape(img)) return layoutDef('headline-body-image')!.plan({ headline: str(f, 'headline'), body: str(f, 'intro'), image: img }, v, st, cx);
      if (v === 1) {
        const d = place(st, cx, 'top', (d) => {
          heroBand(d, img, (t) => {
            t.text('title', str(f, 'headline'), { size: 76, max: 88, weight: 800, font: 'h', lines: 2, min: 56, lh: 1.02, gap: 24 });
            t.text('body', str(f, 'intro'), { size: 44, max: 48, lines: 3, min: 44, lh: 1.3 });
          });
        });
        return mk(d, { noBalance: true, type: slideType(d), fitAs: 'photo-cover', slide: rowsSlide(d, str(f, 'headline')) });
      }
      const d = place(st, cx, 'center', (d) => {
        const ih = room(d, heightOf(d, texts), PIC_MIN['photo-cover'], 640);
        const pic = () => { d.image(img, d.x0, d.y, d.w, ih, { rx: rad(st) }); d.y += ih; };
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
      // a wide picture (2:1 or wider) is small in the band under the text: it takes the hero band of headline-body-image (the whole width, 50% of the slide) with the same words
      const wideAt = shapeOf(img);
      if (img && wideAt && wideAt.aspect >= 2) return layoutDef('headline-body-image')!.plan({ headline: str(f, 'heading'), body: str(f, 'paragraph'), image: img }, 1, st, cx);
      const sideZ = img && panelShape(img) ? panelHeadSize(st, str(f, 'heading')) : null;
      if (img && sideZ) {
        const d = place(st, cx, 'top', (d) => splitPanel(d, img, 0, (t, x, w) => {
          t.text('title', str(f, 'heading'), { x, w, size: sideZ, max: sideZ, weight: 800, font: 'h', lines: 4, min: 72, gap: 28 });
          t.text('body', str(f, 'paragraph'), { x, w, size: 44, max: 48, lines: 12, min: 44, lh: 1.3 });
        }));
        return mk(d, { noBalance: true, type: 'content', fitAs: 'art-side-text', slide: { type: 'content', headline: str(f, 'heading'), body: str(f, 'paragraph') } });
      }
      const fh = cx.field.y1 - cx.field.y0;
      const ih = Math.round(fh * 0.46);
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

  // ===== Round 9: six more picture layouts (the model only chooses the name and the fields; the code draws) ==========================================================================
  // The picture zone is the page between the handle row (y 109) and the page counter (y 1258): no page chrome is ever over a picture. Every layout has its text-only form (never an empty box).
  // photo-full-caption -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'photo-full-caption', label: 'Full photo with a caption panel', shapes: ['photo', 'claim'], variants: ['caption panel below', 'caption panel above'],
    fields: [{ name: 'headline', required: true, max: 48 }, { name: 'line', required: false, max: 50 }, IMG('image', 'one picture of any shape (tall ones show their top)')],
    samples: {
      normal: { headline: 'The hoodie that becomes a backpack', line: 'Ten seconds, one zip.' },
      long: { headline: 'The hoodie that turns into a backpack fast', line: 'One piece of clothing, two jobs.' },
      short: { headline: 'Meet Quick Flip' },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      const head = str(f, 'headline');
      const line = str(f, 'line');
      // no picture: the text-only form is a statement (the line is its caption)
      if (!img) return layoutDef('statement')!.plan({ headline: head, ...(line ? { caption: line } : {}) }, v, st, cx);
      // Round 16: with 12 words or fewer the caption headline is at least 64 px and the body at least 40 px (never under 32); the caption panel grows, and the picture shrinks, to make room
      const short = `${head} ${line}`.split(/\s+/).filter(Boolean).length <= 12;
      const d = place(st, cx, 'top', (d) => {
        const texts = (t: Draw) => {
          t.text('title', head, { size: 76, max: 84, weight: 800, font: 'h', lines: 2, min: short ? 64 : 48, gap: line ? 10 : 0 });
          if (line) t.text('body', line, { size: 44, max: 48, fill: '$muted', lines: 1, min: 40 });
        };
        const th = heightOf(d, texts);
        // the text must end by y 1205 (the engine clamps boxes at 1207) and start 40 px below the header when the panel is on top: the panel is as tall as the text needs, plus that room
        const panelH = Math.min(560, Math.max(FULL_PANEL_H, th + (v === 0 ? 72 : 64)));
        const picH = ZONE_BOTTOM - ZONE_TOP - panelH;
        // the picture takes the rest of the picture zone; the caption panel (the card colour) at least 254 px
        const picY = v === 0 ? ZONE_TOP : ZONE_TOP + panelH;
        const panelY = v === 0 ? ZONE_TOP + picH : ZONE_TOP;
        d.image(img, 0, picY, SLIDE_W, picH, { rx: 0 });
        d.rect(0, panelY, SLIDE_W, panelH, '$surface', { rx: 0 });
        d.y = v === 0 ? panelY + 24 + Math.max(0, Math.round((panelH - 72 - th) / 2)) : panelY + 40 + Math.max(0, Math.round((panelH - 64 - th) / 2));
        texts(d);
      });
      return mk(d, { noBalance: true, type: 'content', fitAs: 'statement-card', slide: withAccent({ type: 'content', headline: head, body: line }, head, f, st) });
    },
  },
  // split-half -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'split-half', label: 'Half photo, half text', shapes: ['explainer', 'photo'], variants: ['picture right / top', 'picture left / bottom'],
    fields: [{ name: 'headline', required: true, max: 50 }, { name: 'body', required: true, max: 140 }, IMG('image', 'a picture: tall or portrait ones fill a left or right half, others a top or bottom half')],
    samples: {
      normal: { headline: 'Why we built it', body: 'We sewed the bag into the hood, so one layer does both jobs.' },
      long: { headline: 'Why we decided to build it ourselves', body: 'We sewed a waterproof bag into the hood and tested it for two years on trains and planes.' },
      short: { headline: 'The flip', body: 'One zip, ten seconds, no bag to pack.' },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      const head = str(f, 'headline');
      const body = str(f, 'body');
      if (!img) return layoutDef('split-text')!.plan({ headline: head, paragraph: body }, v, st, cx);
      const sh = shapeOf(img);
      const side = !!sh && (sh.kind === 'tall' || sh.kind === 'portrait');
      const slide = withAccent({ type: 'content', headline: head, body }, head, f, st);
      // a tall or portrait picture: a left or right half (655 x 1114: 50.0% of the slide); the headline takes the largest size at which it wraps to 5 lines or fewer in the text column
      if (side) {
        const tw = SLIDE_W - HALF_W - 48 - 32;
        const wt = nearestWeight(st.fonts.headline, 800);
        const z = sideHeadSize(head, st, tw, 120);
        // the headline and the body must both fit the narrow column (inside the half's height, with room above and below); otherwise the picture takes a top or bottom half and the text a full-width band
        const colH = z ? measure(head, st.fonts.headline, wt, z, tw, 1.05).h + 24 + measure(body, st.fonts.body, 400, 44, tw, 1.3).h : 0;
        if (z && colH <= HALF_H - 160) {
          const d = place(st, cx, 'top', (d) => {
            const right = v === 0;
            d.image(img, right ? SLIDE_W - HALF_W : 0, ZONE_TOP, HALF_W, HALF_H, { rx: 0 });
            const tx = right ? 48 : HALF_W + 32;
            const texts = (t: Draw) => {
              t.text('title', head, { x: tx, w: tw, size: z, max: z, weight: 800, font: 'h', lines: 5, min: 72, gap: 24 });
              t.text('body', body, { x: tx, w: tw, size: 44, max: 48, lines: 12, min: 44, lh: 1.3 });
            };
            d.y = ZONE_TOP + Math.max(0, Math.round((HALF_H - heightOf(d, texts)) / 2));
            texts(d);
          });
          return mk(d, { noBalance: true, type: 'content', fitAs: 'art-side-text', slide, stack: { gap: 24, y0: ZONE_TOP, y1: ZONE_TOP + HALF_H } });
        }
      }
      // any other picture (or a headline too long for the side column): a top or bottom half (1080 x 675: 50.0% of the slide)
      const d = place(st, cx, 'top', (d) => {
        const top = v === 0;
        const picY = top ? ZONE_TOP : ZONE_TOP + (ZONE_BOTTOM - ZONE_TOP) - HALF_BAND_H;
        d.image(img, 0, picY, SLIDE_W, HALF_BAND_H, { rx: 0 });
        const textTop = top ? ZONE_TOP + HALF_BAND_H : ZONE_TOP;
        const textH = ZONE_BOTTOM - ZONE_TOP - HALF_BAND_H;
        const texts = (t: Draw) => {
          t.text('title', head, { size: 84, max: 96, weight: 800, font: 'h', lines: 2, min: 72, gap: 20 });
          t.text('body', body, { size: 44, max: 48, lines: 4, min: 44, lh: 1.3 });
        };
        d.y = textTop + Math.max(24, Math.round((textH - heightOf(d, texts)) / 2));
        texts(d);
      });
      const bandTop = v === 0 ? ZONE_TOP + HALF_BAND_H : ZONE_TOP;
      return mk(d, { noBalance: true, type: 'content', fitAs: 'headline-body-image', slide, stack: { gap: 20, y0: bandTop, y1: bandTop + (ZONE_BOTTOM - ZONE_TOP - HALF_BAND_H) } });
    },
  },
  // title-over-photo -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'title-over-photo', label: 'Title over a photo', shapes: ['claim', 'hook', 'photo'], variants: ['text low', 'text high'],
    fields: [{ name: 'headline', required: true, max: 50 }, { name: 'line', required: false, max: 50 }, IMG('image', 'one picture of any shape')],
    samples: {
      normal: { headline: 'The hoodie that becomes a backpack', line: 'Ten seconds, one zip.' },
      long: { headline: 'The hoodie that turns into a backpack fast', line: 'One piece of clothing, two jobs.' },
      short: { headline: 'Meet Quick Flip' },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      const head = str(f, 'headline');
      const line = str(f, 'line');
      if (!img) return layoutDef('statement')!.plan({ headline: head, ...(line ? { caption: line } : {}) }, v, st, cx);
      const level = Math.max(0, Math.min(3, cx.scrim ?? 0));
      const d = place(st, cx, 'top', (d) => {
        d.image(img, 0, ZONE_TOP, SLIDE_W, ZONE_BOTTOM - ZONE_TOP, { rx: 0 });
        const texts = (t: Draw) => {
          t.text('title', head, { size: 112, max: 120, weight: 800, font: 'h', lines: 3, min: 72, gap: line ? 18 : 0 });
          if (line) t.text('body', line, { size: 48, max: 52, lines: 1, min: 40 });
        };
        const th = heightOf(d, texts);
        const low = v === 0;
        // the text sits low (or high) on the picture, 56 px inside the picture edge
        const y0 = low ? ZONE_BOTTOM - 56 - th : ZONE_TOP + 56;
        // the scrim: the ground colour over the picture behind the text, stronger with each level (the last is a solid panel)
        const sy0 = low ? Math.max(ZONE_TOP, y0 - 190) : ZONE_TOP;
        const sy1 = low ? ZONE_BOTTOM : Math.min(ZONE_BOTTOM, y0 + th + 190);
        const a = [0.82, 0.92, 0.97, 1][level];
        const solidFrom = level === 3 ? (low ? (y0 - 40 - sy0) / (sy1 - sy0) : 0) : level === 2 ? (low ? (y0 - 90 - sy0) / (sy1 - sy0) : 0) : 1;
        const id = 'scrim' + (low ? 'L' : 'H');
        const stops = low
          ? `<stop offset="0" stop-color="$bg" stop-opacity="0"/><stop offset="${r3(Math.max(0.05, Math.min(0.9, solidFrom < 1 ? solidFrom : 0.55)))}" stop-color="$bg" stop-opacity="${a}"/><stop offset="1" stop-color="$bg" stop-opacity="${a}"/>`
          : `<stop offset="0" stop-color="$bg" stop-opacity="${a}"/><stop offset="${r3(level >= 2 ? 0.7 : 0.45)}" stop-color="$bg" stop-opacity="${a}"/><stop offset="1" stop-color="$bg" stop-opacity="0"/>`;
        d.shape(`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs><rect x="0" y="${sy0}" width="${SLIDE_W}" height="${sy1 - sy0}" fill="url(#${id})"/>`, { y0: sy0, y1: sy1 });
        d.y = y0;
        texts(d);
      });
      return mk(d, { noBalance: true, type: 'content', fitAs: 'statement-card', slide: withAccent({ type: 'content', headline: head, body: line }, head, f, st) });
    },
  },
  // twin-photos ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'twin-photos', label: 'Two photos with captions', shapes: ['contrast', 'photo'], variants: ['captions under', 'captions under (pictures taller)'],
    fields: [{ name: 'headline', required: true, max: 50 }, { name: 'caption', required: false, max: 40 }, { name: 'caption2', required: false, max: 40 }, IMG('image', 'the first picture'), IMG('image2', 'the second picture')],
    samples: {
      normal: { headline: 'Before and after', caption: 'A bag and a hoodie', caption2: 'One piece' },
      long: { headline: 'Two ways to carry your day', caption: 'A bag and a hoodie, both heavy', caption2: 'One hoodie that is the bag' },
      short: { headline: 'Two ways to carry', caption: 'A bag and a hoodie', caption2: 'One piece' },
    },
    plan(f, v, st, cx) {
      const imgs = ['image', 'image2'].map((k) => imageOf(f[k]));
      const head = str(f, 'headline');
      const caps = [str(f, 'caption'), str(f, 'caption2')];
      // no two pictures: the text-only form (the captions are kept as a paragraph, never dropped)
      if (!imgs[0] || !imgs[1]) {
        const cap = caps.filter(Boolean).join('. ');
        return cap ? layoutDef('prose')!.plan({ heading: head, p1: cap }, v, st, cx) : layoutDef('statement')!.plan({ headline: head }, v, st, cx);
      }
      const kinds = imgs.map((q) => shapeOf(q)?.kind);
      const tallBoth = kinds.every((k) => k === 'tall' || k === 'portrait');
      const d = place(st, cx, 'center', (d) => {
        d.text('title', head, { size: 84, max: 100, weight: 800, font: 'h', lines: 2, min: 72, gap: 28 });
        const capH = (t: Draw, w: number) => Math.max(...caps.map((c) => (c ? heightOf(t, (q) => q.text('body', c, { w, size: 44, max: 48, lines: 2, min: 44, lh: 1.25 })) : 0)));
        if (tallBoth) {
          // side by side: two tall columns
          const gap = 28;
          const w = Math.floor((d.w - gap) / 2);
          const ch = capH(d, w);
          const ph = room(d, heightOf(d, (t) => t.text('title', head, { size: 84, max: 100, weight: 800, font: 'h', lines: 2, min: 72, gap: 28 })) + (ch ? ch + 20 : 0), 420, v === 1 ? 760 : 620);
          const y0 = d.y;
          imgs.forEach((q, i) => {
            const x = d.x0 + i * (w + gap);
            d.image(q, x, y0, w, ph, { rx: rad(st) });
            if (caps[i]) d.text('body', caps[i], { x, w, size: 44, max: 48, lines: 2, min: 44, lh: 1.25, at: y0 + ph + 20, boxH: ch });
          });
          d.y = y0 + ph + (ch ? ch + 20 : 0);
        } else {
          // stacked: two wide pictures, each with its caption under it
          const ch = Math.max(...caps.map((c) => (c ? heightOf(d, (t) => t.text('body', c, { size: 44, max: 48, lines: 1, min: 44 })) : 0)));
          const used = heightOf(d, (t) => t.text('title', head, { size: 84, max: 100, weight: 800, font: 'h', lines: 2, min: 72, gap: 28 })) + 2 * (ch ? ch + 16 : 0) + 24;
          const ph = Math.max(220, Math.min(520, Math.floor(((d.fy1 - d.fy0) * 0.97 - used) / 2)));
          imgs.forEach((q, i) => {
            const y0 = d.y;
            d.image(q, d.x0, y0, d.w, ph, { rx: rad(st) });
            d.y = y0 + ph;
            if (caps[i]) { d.gap(16); d.text('body', caps[i], { size: 44, max: 48, lines: 1, min: 44, gap: i === 0 ? 24 : 0 }); } else if (i === 0) d.gap(24);
          });
        }
      });
      // (the captions are the rows of the slide, in reading order: each is filled into its own slot)
      return mk(d, { noBalance: true, type: slideType(d), fitAs: 'headline-body-image', slide: withAccent(rowsSlide(d, head), head, f, st) });
    },
  },
  // photo-grid ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'photo-grid', label: 'Photo grid', shapes: ['categories', 'photo'], variants: ['grid', 'grid (headline below)'],
    fields: [{ name: 'headline', required: true, max: 50 }, { name: 'line', required: false, max: 60 }, IMG('image', 'picture 1'), IMG('image2', 'picture 2'), IMG('image3', 'picture 3'), IMG('image4', 'picture 4')],
    samples: {
      normal: { headline: 'What is in the box', line: 'A hoodie, a pouch and a guide.' },
      long: { headline: 'Everything that is in the box and more', line: 'A hoodie, a pouch, a guide and a card.' },
      short: { headline: 'In the box today', line: 'Three things.' },
    },
    plan(f, v, st, cx) {
      const imgs = ['image', 'image2', 'image3', 'image4'].map((k) => imageOf(f[k])).filter(Boolean);
      const head = str(f, 'headline');
      const gline = str(f, 'line');
      if (imgs.length < 3) return layoutDef('statement-card')!.plan({ headline: head, ...(gline ? { caption: gline } : {}) }, v, st, cx);
      const slide = withAccent({ type: 'content', headline: head, body: gline }, head, f, st);
      const d = place(st, cx, 'center', (d) => {
        const headBlock = (t: Draw) => {
          t.text('title', head, { size: 92, max: 110, weight: 800, font: 'h', lines: 2, min: 72, gap: gline ? 12 : 28 });
          if (gline) t.text('body', gline, { size: 44, max: 48, fill: '$muted', lines: 1, min: 44, gap: 28 });
        };
        const hh = heightOf(d, headBlock);
        const avail = Math.floor((d.fy1 - d.fy0) * 0.97 - hh);
        const gap = 24;
        const w2 = Math.floor((d.w - gap) / 2);
        const grid = () => {
          const y0 = d.y;
          if (imgs.length >= 4) {
            const th = Math.min(520, Math.floor((avail - gap) / 2));
            imgs.slice(0, 4).forEach((q, i) => d.image(q, d.x0 + (i % 2) * (w2 + gap), y0 + Math.floor(i / 2) * (th + gap), w2, th, { rx: rad(st) }));
            d.y = y0 + 2 * th + gap;
          } else {
            // three pictures: one big on top, two small under it
            const bh = Math.min(520, Math.floor((avail - gap) * 0.56));
            const sh2 = Math.min(400, avail - gap - bh);
            d.image(imgs[0], d.x0, y0, d.w, bh, { rx: rad(st) });
            imgs.slice(1, 3).forEach((q, i) => d.image(q, d.x0 + i * (w2 + gap), y0 + bh + gap, w2, sh2, { rx: rad(st) }));
            d.y = y0 + bh + gap + sh2;
          }
        };
        if (v === 1) { grid(); d.gap(28); headBlock(d); } else { headBlock(d); grid(); }
      });
      return mk(d, { noBalance: true, type: 'content', fitAs: 'headline-body-image', slide });
    },
  },
  // phone-frame ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'phone-frame', label: 'Screenshot in a phone', shapes: ['product', 'photo'], variants: ['phone left', 'phone right'],
    fields: [{ name: 'headline', required: true, max: 50 }, { name: 'body', required: false, max: 120 }, IMG('image', 'a tall or portrait picture (a screenshot)')],
    samples: {
      normal: { headline: 'Open it and tap start', body: 'The first screen takes ten seconds.' },
      long: { headline: 'Open the app and tap start to begin', body: 'The first screen takes ten seconds, and the second one is faster.' },
      short: { headline: 'Tap start to begin', body: 'It takes ten seconds.' },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      const head = str(f, 'headline');
      const body = str(f, 'body');
      const sh = img ? shapeOf(img) : null;
      // only a tall or portrait picture goes in a phone: anything else is the text-only form
      // a phone holds a screenshot (0.62 wide or narrower): a wider picture takes the half-and-half layout instead (the same words, the same picture)
      if (img && sh && sh.kind === 'portrait' && sh.aspect > 0.62) return layoutDef('split-half')!.plan(f, v, st, cx);
      if (!img || !sh || !(sh.kind === 'tall' || sh.kind === 'portrait')) return body ? layoutDef('split-text')!.plan({ headline: head, paragraph: body }, v, st, cx) : layoutDef('statement')!.plan({ headline: head }, v, st, cx);
      const slide = withAccent({ type: 'content', headline: head, body }, head, f, st);
      const d = place(st, cx, 'top', (d) => {
        const PW = 430, PH = 860, B = 14;
        const left = v === 0;
        const px = left ? d.x0 : d.x0 + d.w - PW;
        const py = d.fy0 + Math.round((d.fy1 - d.fy0 - PH) / 2);
        // the phone: a rounded outline (generic, no marks), the picture inside it, a small speaker slot at the top
        d.image(img, px + B, py + B, PW - 2 * B, PH - 2 * B, { rx: 50 });
        const r0 = 64;
        d.path(`M ${px + r0} ${py} L ${px + PW - r0} ${py} Q ${px + PW} ${py} ${px + PW} ${py + r0} L ${px + PW} ${py + PH - r0} Q ${px + PW} ${py + PH} ${px + PW - r0} ${py + PH} L ${px + r0} ${py + PH} Q ${px} ${py + PH} ${px} ${py + PH - r0} L ${px} ${py + r0} Q ${px} ${py} ${px + r0} ${py} Z`, { stroke: '$text', sw: B, cap: true, y0: py, y1: py + PH });
        d.path(`M ${px + PW / 2 - 44} ${py + 40} L ${px + PW / 2 + 44} ${py + 40}`, { stroke: '$text', sw: 22, cap: true, y0: py + 28, y1: py + 52 });
        const tw = d.w - PW - 48;
        const tx = left ? d.x0 + PW + 48 : d.x0;
        const z = sideHeadSize(head, st, tw, 112) || 72;
        const texts = (t: Draw) => {
          t.text('title', head, { x: tx, w: tw, size: z, max: z, weight: 800, font: 'h', lines: 6, min: 72, gap: body ? 24 : 0 });
          if (body) t.text('body', body, { x: tx, w: tw, size: 48, max: 52, lines: 8, min: 44, lh: 1.3 });
        };
        d.y = d.fy0 + Math.max(0, Math.round((d.fy1 - d.fy0 - heightOf(d, texts)) / 2));
        texts(d);
      });
      return mk(d, { noBalance: true, type: 'content', fitAs: 'art-side-text', slide, ...(body ? { stack: { gap: 24, y0: d.fy0 + Math.round((d.fy1 - d.fy0 - 860) / 2), y1: d.fy0 + Math.round((d.fy1 - d.fy0 - 860) / 2) + 860 } } : {}) });
    },
  },
  // list-under-band (Round 17) ---------------------------------------------------------------------------------------------------------
  {
    id: 'list-under-band', label: 'List under a picture band', shapes: ['list', 'process', 'photo'], variants: ['numerals', 'dots'],
    fields: [{ name: 'title', required: true, max: 50 }, { name: 'items', required: true, max: 80, list: { min: 2, max: 5 } }, IMG('image', 'a picture band across the top of the slide (any shape; a screenshot is shown whole)')],
    samples: {
      normal: { title: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] },
      long: { title: 'Five steps from post to slides', items: ['Paste the post you already wrote today', 'Pick one of the fifteen looks you like', 'Add the pictures you want on the slides', 'Edit any headline and nothing reruns', 'Download the slides and post them'] },
      short: { title: 'Three steps', items: ['Paste', 'Pick', 'Post'] },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      const title = str(f, 'title');
      const items = arr(f, 'items').slice(0, 5);
      // no picture: the plain numbered list of the same words
      if (!img) return layoutDef('numbered-list')!.plan({ title, items }, v, st, cx);
      const mode = listMarks(title, items, v);
      const d = place(st, cx, 'top', (d) => {
        const tw = d.w - MARK_W[mode];
        // rows at 44 px; the band is 40% of the slide (540 px) and gives up height (down to 300 px) only when title and rows need the room under it
        const rowsH = items.reduce((a, it, i) => a + listRowH(st, it, tw) + (i < items.length - 1 ? ROW_GAP : 0), 0);
        const titleH = measure(title, st.fonts.headline, nearestWeight(st.fonts.headline, 800), 72, d.w, 1.05).h + 24;
        let band = 540;
        while (band > 300 && rowsH + titleH > 1190 - (ZONE_TOP + band) - 28) band -= 20;
        d.image(img, 0, ZONE_TOP, SLIDE_W, band, { rx: 0 });
        d.y = ZONE_TOP + band + 28;
        d.text('title', title, { size: 72, max: 88, weight: 800, font: 'h', lines: 2, min: 64, gap: 24 });
        listRows(d, st, items, d.x0, d.w, mode);
      });
      return mk(d, { noBalance: true, type: 'checklist', fitAs: 'numbered-list', slide: withAccent({ type: 'checklist', headline: title, items }, title, f, st) });
    },
  },
  // list-beside-picture (Round 17) -----------------------------------------------------------------------------------------------------
  {
    id: 'list-beside-picture', label: 'List beside a tall picture', shapes: ['list', 'process', 'product'], variants: ['picture right', 'picture left'],
    fields: [{ name: 'title', required: true, max: 50 }, { name: 'items', required: true, max: 80, list: { min: 2, max: 5 } }, IMG('image', 'a tall or portrait picture on one side (a phone screenshot sits in a phone outline)')],
    samples: {
      normal: { title: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] },
      long: { title: 'Five steps from post to slides', items: ['Paste the post you already wrote today', 'Pick one of the fifteen looks you like', 'Add the pictures you want on the slides', 'Edit any headline and nothing reruns', 'Download the slides and post them'] },
      short: { title: 'Three steps', items: ['Paste', 'Pick', 'Post'] },
    },
    plan(f, v, st, cx) {
      const img = imageOf(f.image);
      const title = str(f, 'title');
      const items = arr(f, 'items').slice(0, 5);
      const sh = img ? shapeOf(img) : null;
      if (!img || !sh || !(sh.kind === 'tall' || sh.kind === 'portrait')) return layoutDef('numbered-list')!.plan({ title, items }, v, st, cx);
      const mode = listMarks(title, items, 0);
      const d = place(st, cx, 'top', (d) => {
        const GAP = 40;
        const phone = sh.aspect <= 0.62;
        const hw = nearestWeight(st.fonts.headline, 800);
        // the picture takes about 40% of the width (432 px, the picture on the right); it gives up width (down to 340 px) only when the list needs the room
        const colH = (pw: number) => {
          const tw = SLIDE_W - 96 - pw - GAP;
          const z = sideHeadSize(title, st, tw, 96, 56) || 56;
          return measure(title, st.fonts.headline, hw, z, tw, 1.05).h + 28 + items.reduce((a, it, i) => a + listRowH(st, it, tw - MARK_W[mode]) + (i < items.length - 1 ? ROW_GAP : 0), 0);
        };
        let pw = 432;
        while (pw > 340 && colH(pw) > 1060 - 60) pw -= 20;
        const right = v === 0;
        const px = right ? SLIDE_W - pw - 48 : 48;
        const tx0 = right ? 48 : px + pw + GAP;
        const tw0 = SLIDE_W - 96 - pw - GAP;
        if (phone) {
          const B = 14;
          const PH = Math.min(1060, Math.round(pw / 0.5));
          const py = ZONE_TOP + Math.round((1060 - PH) / 2);
          d.image(img, px + B, py + B, pw - 2 * B, PH - 2 * B, { rx: 44 });
          const r0 = 56;
          d.path(`M ${px + r0} ${py} L ${px + pw - r0} ${py} Q ${px + pw} ${py} ${px + pw} ${py + r0} L ${px + pw} ${py + PH - r0} Q ${px + pw} ${py + PH} ${px + pw - r0} ${py + PH} L ${px + r0} ${py + PH} Q ${px} ${py + PH} ${px} ${py + PH - r0} L ${px} ${py + r0} Q ${px} ${py} ${px + r0} ${py} Z`, { stroke: '$text', sw: B, cap: true, y0: py, y1: py + PH });
        } else d.image(img, px, ZONE_TOP, pw, 1060, { rx: rad(st) });
        const z = sideHeadSize(title, st, tw0, 96, 56) || 56;
        const texts = (t: Draw) => {
          t.text('title', title, { x: tx0, w: tw0, size: z, max: z, weight: 800, font: 'h', lines: 5, min: 56, gap: 28 });
          listRows(t, st, items, tx0, tw0, mode);
        };
        d.y = ZONE_TOP + Math.max(0, Math.round((1060 - heightOf(d, texts)) / 2));
        texts(d);
      });
      return mk(d, { noBalance: true, type: 'checklist', fitAs: 'numbered-list', slide: withAccent({ type: 'checklist', headline: title, items }, title, f, st) });
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
  'headline-body-image': { min: 1, slots: () => [slot('image', 978 / 520, ANY)] },
  'image-row': { min: 3, slots: (v) => ['image', 'image2', 'image3'].map((f) => slot(f, 310 / (v === 1 ? 500 : 400), PORT)) },
  'thumb-rows': { min: 3, slots: () => ['image', 'image2', 'image3', 'image4'].map((f) => slot(f, 230 / 160, LAND)) },
  'cover-art': { min: 1, slots: (v) => [v === 0 ? slot('image', 1, ANY) : slot('image', 978 / 400, ANY)] },
  'photo-cover': { min: 1, slots: () => [slot('image', 978 / 420, ANY)] },
  'portrait-closing': { min: 1, slots: () => [slot('image', 0.7, PORT, 'portrait')] },
  'art-side-text': { min: 1, slots: () => [slot('image', 978 / 400, ANY)] },
  'photo-full-caption': { min: 1, slots: () => [slot('image', 1080 / 880, ANY)] },
  'split-half': { min: 1, slots: () => [slot('image', 1, ANY)] },
  'title-over-photo': { min: 1, slots: () => [slot('image', 1080 / 1134, ANY)] },
  'twin-photos': { min: 2, slots: () => [slot('image', 0.8, ANY), slot('image2', 0.8, ANY)] },
  'photo-grid': { min: 3, slots: () => ['image', 'image2', 'image3', 'image4'].map((k) => slot(k, 1.2, ANY)) },
  // a phone holds a screenshot: a picture wider than 0.62 (a desktop crop, a portrait photo) goes to another layout
  'phone-frame': { min: 1, slots: () => [{ ...slot('image', 0.46, ['portrait'], 'portrait'), maxAspect: 0.62 }] },
  // a list under a picture band (any shape) and a list beside a tall or portrait picture (Round 17)
  'list-under-band': { min: 1, slots: () => [slot('image', 1080 / 540, ANY)] },
  'list-beside-picture': { min: 1, slots: () => [slot('image', 0.46, ['portrait'], 'portrait')] },
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
  /** What the pixels (or the person) say: a screenshot never goes behind text and is never the cover unless pinned there. Missing: a photo. */
  content?: 'screenshot' | 'photo';
}
export const isScreenshot = (p: { content?: string }): boolean => p.content === 'screenshot';
/** The layouts that set text OVER the picture (with a scrim): a screenshot is never placed in them, its own text would show through behind the headline. */
export const TEXT_OVER_PICTURE: readonly string[] = ['title-over-photo'];
export const picOrientation = (p: PicInfo): Orientation => orientationOf(p.width, p.height);
export const picAspect = (p: PicInfo): number => p.width / p.height;
/** How many of the pictures fit a layout's slots (their orientation is one the slot accepts). */
export const fittingPictures = (layout: string, pics: PicInfo[], variant: 0 | 1 = 0): number => {
  const slots = imageSlotsOf(layout, variant);
  const textOver = TEXT_OVER_PICTURE.includes(layout);
  return slots.length ? pics.filter((p) => !(textOver && isScreenshot(p))).filter((p) => slots.some((s) => s.accepts.includes(picOrientation(p)) && (!s.maxAspect || picAspect(p) <= s.maxAspect))).length : 0;
};
/** Whether a layout can draw its picture form with these pictures (enough of them, of orientations its slots accept). */
export const hasEnoughPictures = (layout: string, pics: PicInfo[] | undefined, variant: 0 | 1 = 0): boolean => !!pics && fittingPictures(layout, pics, variant) >= imagesNeeded(layout);
export type { Cx };
