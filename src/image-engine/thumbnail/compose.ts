// Builds thumbnail plans. Every option is a plain plan, so it can be edited with patches later.
// Needs the fonts loaded first (call loadFonts()), because it measures real text.
import { fitText, measureWidth } from '../draw/text';
import { bestTextColor } from '../lint/color';
import type { BrandInput, ImageLayer, Layer, Plan, ShapeLayer, TextLayer, ThumbnailLayout, ThumbnailOption, ThumbnailRequest } from '../types';
import type { Focal } from './focal';

export const THUMBNAIL_SIZES = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 1080, height: 1920 },
} as const;

export type FocalFor = (boxW: number, boxH: number) => Focal;
const centred: FocalFor = () => ({ x: 0.5, y: 0.5, note: 'Crop centred.' });

const photo = (req: ThumbnailRequest, x: number, y: number, w: number, h: number, f: Focal): ImageLayer => ({
  id: 'photo', name: 'Photo', kind: 'image', x, y, width: w, height: h, rotation: 0, opacity: 1, src: req.source.url, fit: 'cover', focal: { x: f.x, y: f.y },
});
const rect = (id: string, x: number, y: number, w: number, h: number, fill: string, radius = 0): ShapeLayer => ({
  id, name: id, kind: 'shape', x, y, width: w, height: h, rotation: 0, opacity: 1, shape: 'rect', fill, radius,
});

/**
 * A soft dark fade made of stacked translucent strips (plans have no gradients).
 * 'bottom' is darkest at the bottom edge of the area, 'top' at the top edge.
 */
function scrim(x: number, y: number, w: number, h: number, edge: 'top' | 'bottom', maxAlpha: number, steps = 28): ShapeLayer[] {
  const a = 1 - (1 - maxAlpha) ** (1 / steps);
  return Array.from({ length: steps }, (_, i) => {
    const hh = Math.round((h * (i + 1)) / steps);
    return rect(`scrim-${i + 1}`, x, edge === 'bottom' ? y + h - hh : y, w, hh, `rgba(0,0,0,${a.toFixed(3)})`);
  });
}

interface Fitted {
  size: number;
  lines: string[];
  lineStep: number;
  width: number;
  height: number;
  fits: boolean;
}

function fitTitle(text: string, brand: BrandInput, maxW: number, maxH: number, start: number, min: number, lineHeight: number): Fitted {
  const f = fitText({ text, font: brand.headlineFont, weight: 800, maxSize: start, minSize: min, lineHeight, width: maxW, height: maxH });
  const width = Math.max(...f.lines.map((l) => measureWidth(l, brand.headlineFont, 800, f.size)));
  return { size: f.size, lines: f.lines, lineStep: f.lineStep, width, height: f.height, fits: f.fits };
}

function titleLayer(brand: BrandInput, text: string, f: Fitted, box: { x: number; y: number; width: number; height: number }, color: string, lineHeight: number, extra: Omit<Partial<TextLayer>, 'style'> & { style?: Partial<TextLayer['style']> } = {}): TextLayer {
  const { style, ...rest } = extra;
  return {
    id: 'title', name: 'Title', kind: 'text', ...box, rotation: 0, opacity: 1, text,
    style: { font: brand.headlineFont, weight: 800, size: f.size, color, align: 'left', lineHeight, ...style },
    ...rest,
  };
}

const plan = (W: number, H: number, background: string, layers: Layer[]): Plan => ({ schema: 1, revision: 1, canvas: { width: W, height: H, background }, layers });

type Builder = (req: ThumbnailRequest, text: string, W: number, H: number, focalFor: FocalFor) => { plan: Plan; notes: string[] };

/** Title on a solid brand-colour plate, low on the picture. */
const plate: Builder = (req, text, W, H, focalFor) => {
  const b = req.brand;
  const portrait = H > W;
  const m = Math.round(W * 0.044);
  const padX = Math.round(W * 0.028);
  const padY = Math.round(Math.min(W, H) * 0.024);
  const f = fitTitle(text, b, (portrait ? W * 0.78 : W * 0.58) - 2 * padX, (portrait ? H * 0.2 : H * 0.36) - 2 * padY, portrait ? 150 : 132, 80, 1.02);
  const pw = Math.ceil(f.width) + 2 * padX;
  const ph = Math.ceil(f.height) + 2 * padY;
  const x = m;
  const y = portrait ? Math.round(H * 0.74 - ph) : H - m - ph;
  const fc = focalFor(W, H);
  const color = bestTextColor(b.primary, ['#FFFFFF', b.text]);
  return {
    plan: plan(W, H, b.background, [
      photo(req, 0, 0, W, H, fc),
      rect('plate', x, y, pw, ph, b.primary, Math.round(Math.min(W, H) * 0.025)),
      titleLayer(b, text, f, { x: x + padX, y: y + padY, width: Math.ceil(f.width) + 1, height: Math.ceil(f.height) }, color, 1.02),
    ]),
    notes: [fc.note, ...(f.fits ? [] : ['The title did not fit its plate even at the smallest size.'])],
  };
};

/** Big white title with a dark outline straight on the picture, over a soft dark band. */
const outline: Builder = (req, text, W, H, focalFor) => {
  const b = req.brand;
  const portrait = H > W;
  const m = Math.round(W * 0.044);
  // The outline sticks out half its width past the letters, so start a little further in.
  const inset = Math.ceil(((portrait ? 190 : 150) * 0.1) / 2) + 2;
  const box = portrait
    ? { x: m + inset, y: Math.round(H * 0.06), width: Math.round(W * 0.8), height: Math.round(H * 0.27) }
    : { x: m + inset, y: Math.round(H * 0.42), width: Math.round(W * 0.64), height: H - m - inset - Math.round(H * 0.42) };
  const f = fitTitle(text, b, box.width, box.height, portrait ? 190 : 150, portrait ? 100 : 84, 1.0);
  const fc = focalFor(W, H);
  const band = portrait ? scrim(0, 0, W, Math.round(H * 0.42), 'top', 0.55) : scrim(0, Math.round(H * 0.34), W, H - Math.round(H * 0.34), 'bottom', 0.6);
  return {
    plan: plan(W, H, b.background, [
      photo(req, 0, 0, W, H, fc),
      ...band,
      titleLayer(b, text, f, box, '#FFFFFF', 1.0, {
        style: { valign: portrait ? 'top' : 'bottom', stroke: { color: '#0B0F12', width: Math.round(f.size * 0.1) }, shadow: { color: 'rgba(0,0,0,0.5)', blur: 12, offsetX: 0, offsetY: 6 } },
      }),
    ]),
    notes: [fc.note, ...(f.fits ? [] : ['The title did not fit its box even at the smallest size.'])],
  };
};

/** Dark panel for the title with one highlighted word; the picture fills the rest. */
const panel: Builder = (req, text, W, H, focalFor) => {
  const b = req.brand;
  const portrait = H > W;
  const m = Math.round(W * 0.044);
  const last = text.split(' ').pop()!.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();
  const highlight = { words: [last], color: b.highlight, textColor: b.text, paddingX: 10, paddingY: 4, radius: 10 };
  const color = bestTextColor(b.text, ['#FFFFFF', b.background]);
  if (!portrait) {
    const px = Math.round(W * 0.38);
    const box = { x: m + 12, y: Math.round(H * 0.1), width: px - m - 12 - Math.round(W * 0.04), height: Math.round(H * 0.8) };
    const f = fitTitle(text, b, box.width - 20, box.height, 130, 76, 1.04);
    const fc = focalFor(W - px, H);
    return {
      plan: plan(W, H, b.text, [
        photo(req, px, 0, W - px, H, fc),
        rect('bar', px - 10, 0, 10, H, b.primary),
        titleLayer(b, text, f, box, color, 1.04, { style: { valign: 'middle' }, highlight }),
      ]),
      notes: [fc.note, ...(f.fits ? [] : ['The title did not fit its panel even at the smallest size.'])],
    };
  }
  const ph = Math.round(H * 0.66);
  const y0 = ph + Math.round(H * 0.022);
  const box = { x: m + 12, y: y0, width: Math.round(W * 0.8), height: Math.round(H * 0.775) - y0 };
  const f = fitTitle(text, b, box.width - 20, box.height, 100, 64, 1.04);
  const fc = focalFor(W, ph);
  return {
    plan: plan(W, H, b.text, [
      photo(req, 0, 0, W, ph, fc),
      rect('bar', 0, ph, W, 10, b.primary),
      titleLayer(b, text, f, box, color, 1.04, { style: { valign: 'middle' }, highlight }),
    ]),
    notes: [fc.note, ...(f.fits ? [] : ['The title did not fit its panel even at the smallest size.'])],
  };
};

const BUILDERS: Record<ThumbnailLayout, Builder> = { plate, outline, panel };

/** 2 to 3 options for one picture and title, one per layout. */
export function composeThumbnails(req: ThumbnailRequest, focalFor: FocalFor = centred): ThumbnailOption[] {
  const text = req.title.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!text) throw new Error('A thumbnail needs a title.');
  const { width, height } = THUMBNAIL_SIZES[req.aspect];
  return (req.layouts ?? ['plate', 'outline', 'panel']).map((layout) => {
    const built = BUILDERS[layout](req, text, width, height, focalFor);
    return { id: `${req.aspect.replace(':', 'x')}-${layout}`, layout, plan: built.plan, titleLayerId: 'title', photoLayerId: 'photo', notes: built.notes };
  });
}
