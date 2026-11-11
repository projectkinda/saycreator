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
  height: number;
  style?: { size: number };
}
export interface TextBox { x0: number; x1: number; y0: number; y1: number; size: number; fits: boolean; boxH: number; need: number }
export const MARGIN = 48;
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
/** The measured box of one text layer, or null when it has no lines (or the fonts are not ready). */
export function textBox(l: L): TextBox | null {
  try {
    const b = layoutText(l as unknown as TextLayer);
    if (!b.lines.length) return null;
    const xs = b.lines.map((q) => [l.x + q.x, l.x + q.x + q.width]);
    return { x0: Math.min(...xs.map((q) => q[0])), x1: Math.max(...xs.map((q) => q[1])), y0: l.y, y1: l.y + b.lines.length * b.lineStep, size: b.size, fits: b.fits, boxH: l.height, need: b.lines.length * b.lineStep };
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
    if (b.size < 24) out.push(`text-fit: ${n} is set at ${Math.round(b.size)} px, too small`);
    for (const r of rec) if (b.x0 < r.x1 - 1 && b.x1 > r.x0 + 1 && b.y0 < r.y1 - 1 && b.y1 > r.y0 + 1) out.push(`text-fit: ${n} overlaps the page counter or the swipe footer by ${px(Math.min(b.y1, r.y1) - Math.max(b.y0, r.y0))}`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].b, c = boxes[j].b;
    if (Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) > 4 && Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0) > 4) out.push(`text-fit: ${boxes[i].l.name} overlaps ${boxes[j].l.name}`);
  }
  return [...new Set(out)];
}
