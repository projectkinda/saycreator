// The text-fits rule (Round 12): a slide the library draws is accepted only when every text element's REAL box (the lines the engine lays out, not the box the layout asked for) stays inside the slide
// minus the 48 px margin, does not touch the page counter or the swipe footer, does not overlap another text, and is not set under 24 px. A drawing that breaks it is a layout that does not fit that text:
// it is not chosen (the deck falls back to a layout that fits, see designLibrary.ts). Words are never cut to make a drawing pass.
import { layoutText } from '../../image-engine/draw/text';
import type { TextLayer } from '../../image-engine/types';

interface L {
  kind?: string;
  id?: string;
  name?: string;
  role?: string;
  text?: string;
  visible?: boolean;
  x: number;
  y: number;
  width?: number;
  height: number;
  style?: { size: number };
}
export interface TextBox { bx0: number; bx1: number; by1: number; x0: number; x1: number; y0: number; y1: number; size: number; fits: boolean; boxH: number; need: number }
export const MARGIN = 48;
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
/** The measured box of one text layer, or null when it has no lines (or the fonts are not ready). */
export function textBox(l: L): TextBox | null {
  try {
    const b = layoutText(l as unknown as TextLayer);
    if (!b.lines.length) return null;
    const xs = b.lines.map((q) => [l.x + q.x, l.x + q.x + q.width]);
    return { bx0: l.x, bx1: l.x + (l.width ?? 0), by1: l.y + b.height, x0: Math.min(...xs.map((q) => q[0])), x1: Math.max(...xs.map((q) => q[1])), y0: l.y, y1: l.y + b.lines.length * b.lineStep, size: b.size, fits: b.fits, boxH: l.height, need: b.lines.length * b.lineStep };
  } catch {
    return null;
  }
}
const isText = (l: L) => l.kind === 'text' && !!l.text && l.visible !== false;
/** The problems of a slide's text: `own` are the slide's own text layers, `chrome` the page counter, swipe cue and handle. Each is one plain line; empty when the text fits. */
export function textFitProblems(own: L[], chrome: L[]): string[] {
  const out: string[] = [];
  const texts = own.filter((l) => isText(l) && l.role !== 'decor' && !/recurring/.test(`${l.id} ${l.name}`));
  const boxes = texts.map((l) => ({ l, b: textBox(l) })).filter((x): x is { l: L; b: TextBox } => !!x.b);
  const rec = chrome.filter(isText).map((l) => textBox(l)).filter((b): b is TextBox => !!b);
  const px = (n: number) => `${Math.round(n)} px`;
  for (const { l, b } of boxes) {
    const n = l.name ?? 'text';
    if (b.x0 < MARGIN - 2) out.push(`text-fit: ${n} starts ${px(MARGIN - b.x0)} outside the left margin`);
    if (b.x1 > SLIDE_W - MARGIN + 2) out.push(`text-fit: ${n} ends ${px(b.x1 - (SLIDE_W - MARGIN))} outside the right margin`);
    if (b.y0 < MARGIN - 2) out.push(`text-fit: ${n} starts ${px(MARGIN - b.y0)} above the top margin`);
    if (b.y1 > SLIDE_H - MARGIN + 2) out.push(`text-fit: ${n} ends ${px(b.y1 - (SLIDE_H - MARGIN))} below the bottom margin`);
    // the box the phone's "Margins and edges" check reads (the layer's box, not the ink): it must stay inside the 48 px margin too, or that check fails on a slide this rule accepted
    if (l.width !== undefined) {
      if (b.bx0 < MARGIN - 1) out.push(`text-fit: ${n}'s box starts ${px(MARGIN - b.bx0)} outside the left margin`);
      if (b.bx1 > SLIDE_W - MARGIN + 1) out.push(`text-fit: ${n}'s box ends ${px(b.bx1 - (SLIDE_W - MARGIN))} outside the right margin`);
      if (b.by1 > SLIDE_H - MARGIN + 1) out.push(`text-fit: ${n}'s box ends ${px(b.by1 - (SLIDE_H - MARGIN))} below the bottom margin`);
    }
    if (b.size < 24) out.push(`text-fit: ${n} is set at ${Math.round(b.size)} px, too small`);
    for (const r of rec) if (b.x0 < r.x1 - 1 && b.x1 > r.x0 + 1 && b.y0 < r.y1 - 1 && b.y1 > r.y0 + 1) out.push(`text-fit: ${n} overlaps the page counter or the swipe footer by ${px(Math.min(b.y1, r.y1) - Math.max(b.y0, r.y0))}`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].b, c = boxes[j].b;
    if (Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) > 4 && Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0) > 4) out.push(`text-fit: ${boxes[i].l.name} overlaps ${boxes[j].l.name}`);
  }
  return [...new Set(out)];
}

/**
 * A text layer whose BOX runs past the 48 px margin although its words stay inside it gets a box that ends at the margin (the phone's "Margins and edges" check reads the box, not the ink: a
 * one-line caption at x 48 came out of the template fill with a box 988.8 px wide, right edge 1037, and failed that check on a drawing this rule had accepted). Only when the engine lays the same
 * words out in the same number of lines inside the narrower box; centred or right-aligned text keeps its centre (the box shrinks on both sides). Otherwise the layer is returned as it was.
 */
export function tightenBox<T extends L>(l: T): T {
  if (!isText(l) || l.width === undefined) return l;
  const align = (l.style as { align?: string } | undefined)?.align;
  let x = l.x, w = l.width;
  if (align === 'center') {
    const c = l.x + l.width / 2;
    const half = Math.min(l.width / 2, c - MARGIN, SLIDE_W - MARGIN - c);
    if (half > 0 && half < l.width / 2) { w = half * 2; x = c - half; }
  } else {
    const x1 = Math.min(l.x + l.width, SLIDE_W - MARGIN);
    x = Math.max(l.x, MARGIN);
    w = x1 - x;
  }
  if (w >= l.width - 0.5 && x <= l.x + 0.5) return l;
  if (w < 120) return l;
  try {
    const before = layoutText(l as unknown as TextLayer).lines.length;
    const next = { ...l, x, width: w } as T;
    return layoutText(next as unknown as TextLayer).lines.length <= before ? next : l;
  } catch {
    return l;
  }
}
