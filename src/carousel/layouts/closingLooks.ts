// Round Y: the closing slide takes one of a few looks, chosen by code from its own text and the style (never by the writer, never at random). The looks are variants of the existing
// closing layouts (cta-button, statement, statement-card): the same fields, every word, mark and emoji in its order, no new text, only devices the style already declares (its rule,
// its marker, its button). A closing the person set in the layout picker (a layout or a variant) keeps the layout's own look.
//
// The rule, in plain words (closingLookOf):
//  - A closing with a button (cta-button) and a line under the headline: "split": the headline at the top, the line under it, the button across the foot of the slide.
//    Without that line it keeps its own look (the headline with the button under it).
//  - A closing with no button (statement, statement-card) and no kicker:
//      5 words or fewer, nothing else              -> "quiet": a calm, centred headline at a modest size, the style's rule under it;
//      a caption, or two sentences or more         -> "line": the headline (or its first sentence) large, the rest as a smaller supporting line, the style's rule between;
//      12 words or fewer                           -> "big": one big statement, left and low, the style's rule above it
//                                                     (a style that declares its own closing card keeps the card instead);
//      longer                                      -> the layout's own look (the card, or the statement).
//  - Always the layout's own look: a kicker; a highlight outside the first sentence (the "line" look); a slide with a cut (a plane) or statement density; a pinned layout or variant.
import { measureWidth } from '../../image-engine/draw/text';
import { arrow, measure, nearestWeight } from './draw';
import { mk, place, str, withAccent } from './library';
import { sentences } from './proseLead';
import type { Cx, Fields, LayoutStyle, Plan } from './types';

export type ClosingLook = 'own' | 'split' | 'quiet' | 'line' | 'big';
/** For before/after comparisons only (the replay scripts): off = every closing keeps its layout's own look. */
export const closingLooksRule = { on: true };
/** The layouts a closing look applies to. */
export const CLOSING_LOOK_LAYOUTS = ['cta-button', 'statement', 'statement-card'] as const;
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const QUIET_MAX = 5;
const BIG_MAX = 12;

/** The first sentence of a headline and the rest (the rest exactly as written after it), or null when the headline is one sentence. */
export function splitFirst(head: string): { first: string; rest: string } | null {
  const ss = sentences(head);
  if (ss.length < 2) return null;
  const t = head.trim();
  if (!t.startsWith(ss[0])) return null;
  const rest = t.slice(ss[0].length).trim();
  return rest ? { first: ss[0], rest } : null;
}
const accentsOf = (f: Fields): string[] => (Array.isArray(f.accent) ? f.accent : typeof f.accent === 'string' && f.accent.trim() ? [f.accent] : []).map((a) => String(a).trim()).filter(Boolean);
const has = (text: string, phrase: string) => text.toLowerCase().includes(phrase.toLowerCase());

/** The look a closing slide takes (see the rule above). `why` says it in words. */
export function closingLookOf(layout: string, f: Fields, st: LayoutStyle, cx?: Pick<Cx, 'cut' | 'density'>): { look: ClosingLook; why: string } {
  if (!closingLooksRule.on) return { look: 'own', why: 'the closing looks are off' };
  if (!(CLOSING_LOOK_LAYOUTS as readonly string[]).includes(layout)) return { look: 'own', why: `${layout} keeps its own look` };
  if (cx && (cx.cut !== 'plain' || cx.density === 'statement')) return { look: 'own', why: 'a slide with a plane or a statement density keeps its own look' };
  const head = str(f, 'headline');
  if (layout === 'cta-button') return str(f, 'sub') ? { look: 'split', why: 'a button and a line under the headline' } : { look: 'own', why: 'a button and no line under the headline' };
  if (str(f, 'kicker')) return { look: 'own', why: 'it has a kicker' };
  const n = words(head);
  const cap = str(f, 'caption');
  if (!cap && n <= QUIET_MAX) return { look: 'quiet', why: `${n} words, nothing else` };
  const two = cap ? null : splitFirst(head);
  if (cap || two) {
    // the highlight is drawn on the large text: a highlight in the supporting line keeps the layout's own look
    if (two && accentsOf(f).some((a) => !has(two.first, a))) return { look: 'own', why: 'the highlight is outside the first sentence' };
    return { look: 'line', why: cap ? 'a headline and a caption' : 'two sentences or more' };
  }
  if (n <= BIG_MAX) {
    if (layout === 'statement-card' && st.closingLayout?.layout === 'statement-card') return { look: 'own', why: 'the style declares its own closing card' };
    return { look: 'big', why: `one sentence of ${n} words` };
  }
  return { look: 'own', why: `${n} words: the layout's own look` };
}

const hw = (st: LayoutStyle) => nearestWeight(st.fonts.headline, 800);
/** The largest size (from the list) at which the text takes at most `lines` lines and its widest word fits. */
function fitSize(st: LayoutStyle, text: string, w: number, sizes: number[], lines: number, room: number, lh = 1.05): number {
  const widest = (z: number) => Math.max(...text.split(/\s+/).filter(Boolean).map((x) => measureWidth(x, st.fonts.headline, hw(st), z)));
  return sizes.find((z) => { const m = measure(text, st.fonts.headline, hw(st), z, w, lh); return m.n <= lines && m.h <= room && widest(z) <= w * 0.98; }) ?? sizes[sizes.length - 1];
}
const RULE_W = 180;
const RULE_H = 10;

/** The plan of a closing look (null: the layout draws its own look). Every size is fixed here (the type scale does not grow them); the headline keeps every mark (Plan.keepMarks). */
export function closingPlan(look: ClosingLook, _layout: string, f: Fields, st: LayoutStyle, cx: Cx): Plan | null {
  if (look === 'own') return null;
  const head = str(f, 'headline');
  const fh = cx.field.y1 - cx.field.y0;
  const w = cx.field.w;
  const rule = !!st.devices.underline;
  const tag = { closingLook: look, keepMarks: true as const, noBalance: true };
  if (look === 'split') {
    const label = str(f, 'button');
    const sub = str(f, 'sub');
    const bh = 168;
    const subH = Math.ceil(52 * 1.25) * Math.min(3, measure(sub, st.fonts.body, nearestWeight(st.fonts.body, 500), 52, w, 1.25).n) + 2;
    const sz = fitSize(st, head, w, [150, 138, 126, 114, 102, 92, 84, 76, 72], 4, fh - bh - subH - 40 - 96);
    const d = place(st, cx, 'top', (d) => {
      d.y = cx.field.y0 + 24;
      d.text('title', head, { size: sz, max: sz, weight: 800, font: 'h', lines: 4, min: 72, gap: 40 });
      d.text('body', sub, { size: 52, max: 52, fill: '$muted', lines: 3, min: 44 });
      const by = Math.max(d.y + 72, cx.field.y1 - bh);
      const outline = !!st.deco?.outlinedButton;
      if (outline) d.rect(d.x0, by, d.w, bh, 'none', { rx: bh / 2, stroke: '$text', sw: 5, noShadow: true });
      else d.rect(d.x0, by, d.w, bh, '$accent', { rx: bh / 2 });
      d.text('kicker', label, { x: d.x0 + 56, w: d.w - 56 - 56 - 80, size: 52, max: 52, weight: 700, fill: outline ? '$text' : '$onAccent', lines: 1, min: 40, at: by + (bh - 66) / 2, boxH: 66, align: 'left' });
      arrow(d, d.x0 + d.w - 56 - 56, by + bh / 2, 56, outline ? '$text' : '$onAccent');
      d.y = by + bh;
    });
    // the headline and its line are one block at the top: stacked from their REAL laid-out heights (the drawing balances the lines), so the line sits right under the headline in every font
    const top = cx.field.y0 + 24;
    return mk(d, { type: 'closing', fitAs: 'cta-button', ...tag, stack: { gap: 40, y0: top, y1: top }, slide: { ...withAccent({ type: 'closing', headline: head, kicker: label, sub }, head, f, st), headline: head } });
  }
  if (look === 'quiet') {
    const sz = fitSize(st, head, w - 96, [104, 96, 88, 80, 72], 3, fh * 0.5);
    const th = measure(head, st.fonts.headline, hw(st), sz, w - 96, 1.05).h + 2;
    const blockH = th + (rule ? 48 + RULE_H : 0);
    const d = place(st, cx, 'top', (d) => {
      d.y = Math.round(cx.field.y0 + (fh - blockH) / 2);
      d.text('title', head, { x: d.x0 + 48, w: d.w - 96, size: sz, max: sz, weight: 800, font: 'h', align: 'center', lines: 3, min: 72 });
      if (rule) { d.y += 48; d.rect(d.cx - RULE_W / 2, d.y, RULE_W, RULE_H, '$accent2', { rx: RULE_H / 2 }); d.y += RULE_H; }
    });
    return mk(d, { type: 'content', fitAs: 'statement-card', ...tag, slide: { ...withAccent({ type: 'content', headline: head }, head, f, st), headline: head } });
  }
  if (look === 'big') {
    const sz = fitSize(st, head, w, [150, 138, 126, 114, 102, 92, 84, 76, 72], 5, fh * 0.8);
    const th = measure(head, st.fonts.headline, hw(st), sz, w, 1.05).h + 2;
    const blockH = th + (rule ? RULE_H + 56 : 0);
    const d = place(st, cx, 'top', (d) => {
      // low on the slide: the block ends a little above the foot of the field
      d.y = Math.max(cx.field.y0, Math.round(cx.field.y1 - 48 - blockH));
      if (rule) { d.rect(d.x0, d.y, RULE_W, RULE_H, '$accent2', { rx: RULE_H / 2 }); d.y += RULE_H + 56; }
      d.text('title', head, { size: sz, max: sz, weight: 800, font: 'h', lines: 5, min: 72 });
    });
    return mk(d, { type: 'content', fitAs: 'statement-card', ...tag, slide: { ...withAccent({ type: 'content', headline: head }, head, f, st), headline: head } });
  }
  // line: the headline (or its first sentence) large, the rest (or the caption) a smaller supporting line
  const cap = str(f, 'caption');
  // the split point was found on the person's own text (Cx.closingSplit); without it the headline is not split and the layout draws its own look
  const two = cap ? null : cx.closingSplit ? { first: head.trim().slice(0, cx.closingSplit), rest: head.trim().slice(cx.closingSplit).trim() } : null;
  if (!cap && !two) return null;
  const big = two ? two.first : head;
  const support = two ? two.rest : cap;
  const bwt = nearestWeight(st.fonts.body, 500);
  const sm = measure(support, st.fonts.body, bwt, 52, w, 1.25);
  const sh = sm.h + 2;
  const sz = fitSize(st, big, w, [138, 126, 114, 102, 92, 84, 76, 72], 4, fh * 0.9 - sh - 104);
  const th = measure(big, st.fonts.headline, hw(st), sz, w, 1.05).h + 2;
  const mid = rule ? 48 + RULE_H + 48 : 56;
  const blockH = th + mid + sh;
  const d = place(st, cx, 'top', (d) => {
    d.y = Math.max(cx.field.y0, Math.round(cx.field.y0 + (fh - blockH) / 2));
    d.text('title', big, { size: sz, max: sz, weight: 800, font: 'h', lines: 4, min: 72 });
    if (rule) { d.y += 48; d.rect(d.x0, d.y, RULE_W, RULE_H, '$accent2', { rx: RULE_H / 2 }); d.y += RULE_H + 48; } else d.y += 56;
    d.text('body', support, { size: 52, max: 52, fill: '$muted', lines: 4, min: 44 });
  });
  return mk(d, { type: 'content', fitAs: 'statement-card', ...tag, slide: { ...withAccent({ type: 'content', headline: big, body: support }, big, f, st), headline: big } });
}
