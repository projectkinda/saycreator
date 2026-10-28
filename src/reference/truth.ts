// Ground truth for region detection: a slide drawn from one of our own styles is a plan, so we know exactly where every text block, photo, shape and
// graphic is and which text effects it has. This reads that out of the plan and compares it with what the detection found.
import { layoutText } from '../image-engine/draw/text';
import type { Layer, Plan, TextLayer } from '../image-engine/types';
import type { Box, Detected } from './regions';

export interface TruthText {
  box: Box;
  lines: number;
  align: 'left' | 'centre' | 'right';
  size: number;
  highlight: boolean;
  outline: boolean;
  shadow: boolean;
  tilt: boolean;
  chars: number;
}
export interface Truth {
  texts: TruthText[];
  photos: Box[];
  shapes: Box[];
  /** Big paths, elements and rings: drawn graphics that are not plain shapes. */
  graphics: Box[];
  background: 'flat' | 'gradient';
}

const pct = (v: number, of: number) => (v / of) * 100;

/** The ink box of a text layer, from its laid-out lines (the layer's box is usually wider than its words). */
function inkOf(l: TextLayer, W: number, H: number): { box: Box; lines: number; size: number } {
  const b = layoutText(l);
  const xs0 = Math.min(...b.lines.map((x) => x.x));
  const xs1 = Math.max(...b.lines.map((x) => x.x + x.width));
  const top = l.style.valign === 'middle' ? (l.height - b.height) / 2 : l.style.valign === 'bottom' ? l.height - b.height : 0;
  const y0 = l.y + top + b.size * 0.12;
  const y1 = l.y + top + b.lineStep * (b.lines.length - 1) + b.size * 0.95;
  return { box: { x: pct(l.x + xs0, W), y: pct(y0, H), w: pct(xs1 - xs0, W), h: pct(y1 - y0, H) }, lines: b.lines.length, size: b.size };
}

export function groundTruth(plan: Plan): Truth {
  const W = plan.canvas.width;
  const H = plan.canvas.height;
  const out: Truth = { texts: [], photos: [], shapes: [], graphics: [], background: 'flat' };
  const bg = plan.layers.find((l) => l.id === 'bg');
  if (bg && bg.kind === 'shape' && typeof bg.fill !== 'string') out.background = 'gradient';
  const visible = (l: Layer) => l.visible !== false && l.opacity > 0.5;
  for (const l of plan.layers) {
    if (!visible(l)) continue;
    const box: Box = { x: pct(l.x, W), y: pct(l.y, H), w: pct(l.width, W), h: pct(l.height, H) };
    if (l.kind === 'text' && l.text.trim().length >= 2 && l.style.size >= 28 && l.role !== 'decor') {
      const ink = inkOf(l, W, H);
      out.texts.push({ box: ink.box, lines: ink.lines, align: l.style.align === 'center' ? 'centre' : l.style.align, size: ink.size, highlight: !!l.highlight && ((l.highlight.words?.length ?? 0) > 0 || (l.highlight.lines?.length ?? 0) > 0), outline: !!l.style.stroke && l.style.stroke.width >= 2, shadow: !!l.style.shadow, tilt: Math.abs(l.rotation) >= 3, chars: l.text.length });
    } else if (l.kind === 'image' && box.w * box.h > 150) out.photos.push(box);
    else if (l.kind === 'shape' && l.id !== 'bg' && l.role !== 'decor' && box.w * box.h > 40 && box.w < 95 && !(l.fill === 'rgba(0,0,0,0)')) out.shapes.push(box);
    else if ((l.kind === 'path' || l.kind === 'element') && box.w * box.h > 60) out.graphics.push(box);
  }
  return out;
}

const area = (b: Box) => b.w * b.h;
export function overlap(a: Box, b: Box): { inter: number; iou: number } {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return { inter, iou: inter / Math.max(1e-6, area(a) + area(b) - inter) };
}

export interface TruthScore {
  textFound: [number, number];
  textBox: [number, number];
  align: [number, number];
  size: [number, number];
  photoFound: [number, number];
  shapeFound: [number, number];
  graphicFound: [number, number];
  background: [number, number];
  highlight: [number, number];
  outline: [number, number];
  shadow: [number, number];
  tilt: [number, number];
  /** Boxes the detection invented: text blocks that overlap no real text. */
  extraText: number;
}
export const emptyScore = (): TruthScore => ({ textFound: [0, 0], textBox: [0, 0], align: [0, 0], size: [0, 0], photoFound: [0, 0], shapeFound: [0, 0], graphicFound: [0, 0], background: [0, 0], highlight: [0, 0], outline: [0, 0], shadow: [0, 0], tilt: [0, 0], extraText: 0 });

/** Adds one slide's result to the totals: [right, out of]. */
export function compare(t: Truth, d: Detected, s: TruthScore) {
  const bump = (k: keyof Omit<TruthScore, 'extraText'>, ok: boolean) => {
    s[k][1]++;
    if (ok) s[k][0]++;
  };
  for (const gt of t.texts) {
    // Found: a detected block covers most of the real text. Boxed: it is also about the same size (IoU), since blocks may join neighbouring text.
    const best = d.texts.map((b) => ({ b, o: overlap(gt.box, b.box) })).sort((a, b) => b.o.inter - a.o.inter)[0];
    const covered = best ? best.o.inter / area(gt.box) : 0;
    bump('textFound', covered >= 0.6);
    bump('textBox', !!best && best.o.iou >= 0.45);
    if (best && covered >= 0.6) {
      if (gt.lines >= 2) bump('align', best.b.align === gt.align);
      const pxGt = gt.size;
      bump('size', best.b.fontPx / 1.0 > 0 && best.b.fontPx >= pxGt * 0.72 && best.b.fontPx <= pxGt * 1.4);
      const kinds = best.b.treatments.map((x) => x.kind);
      if (gt.highlight) bump('highlight', kinds.includes('highlight-box') || kinds.includes('on-shape'));
      if (gt.outline) bump('outline', kinds.includes('outline'));
      if (gt.shadow) bump('shadow', kinds.includes('shadow'));
      if (gt.tilt) bump('tilt', kinds.includes('tilt'));
    }
  }
  for (const b of d.texts) if (!t.texts.some((gt) => overlap(gt.box, b.box).inter / area(b.box) > 0.3)) s.extraText++;
  for (const gt of t.photos) bump('photoFound', d.photos.some((p) => overlap(gt, p.box).iou >= 0.45));
  for (const gt of t.shapes) bump('shapeFound', d.shapes.some((p) => overlap(gt, p.box).iou >= 0.4) || d.graphics.some((p) => overlap(gt, p.box).iou >= 0.4));
  for (const gt of t.graphics) bump('graphicFound', d.graphics.some((p) => overlap(gt, p.box).inter / area(gt) >= 0.4) || d.shapes.some((p) => overlap(gt, p.box).inter / area(gt) >= 0.4));
  bump('background', t.background === 'gradient' ? d.background.kind === 'gradient' : d.background.kind === 'flat' || d.background.kind === 'split' || d.background.kind === 'photo');
}
