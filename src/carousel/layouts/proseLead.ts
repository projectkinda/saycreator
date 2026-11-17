// Round W: a prose slide with a long block of running text gets a visual hierarchy instead of a wall: the first sentence becomes a lead (larger, heavier, in the headline font), the rest is
// body text at 44 px or more with a capped line length, grouped into short paragraphs at the sentence boundaries the text already has. Decided by CODE from the text alone (never by the
// writer); not one word, mark or emoji is changed, moved, dropped or added: the text is only cut where a sentence ends. Slides under the threshold never come here (they stay as they were).
import { measureWidth } from '../../image-engine/draw/text';
import { measure, nearestWeight, type Draw } from './draw';
import type { Cx, LayoutStyle } from './types';

/** Running text (the prose paragraphs plus the pull line) of this many words or more is a long block (Round W part 1: every real wall has 28 to 34, the largest non-wall prose slide 17). */
export const LONG_WORDS = 25;
/** A first sentence longer than this is too long to work as a lead. */
export const LEAD_MAX_WORDS = 25;
/** The lead's size over the body size: the largest of these that fits. */
export const LEAD_RATIOS = [1.7, 1.6, 1.5, 1.4];
/** The body measure: at most this many characters per line (the box is narrowed at small sizes), and the body size is never so big that lines hold fewer than CPL_MIN. */
export const CPL_MAX = 40;
export const CPL_MIN = 28;
export const BODY_MIN = 44;
/** The engine's headline floor on a content slide (designed.ts titleFloor): a lead (the slide's title) is never set smaller. */
const TITLE_FLOOR = 72;
/** The body sizes tried, largest first. */
const BODY_SIZES = Array.from({ length: 19 }, (_, i) => 80 - 2 * i); // 80 .. 44: the measure rule (a line holds 28 characters or more) sets the real top for each font

export const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Words that end in a full stop without ending a sentence. */
const ABBR = /(?:^|\s)(?:mr|mrs|ms|dr|st|vs|etc|e\.g|i\.e|no|approx|fig|inc|ltd|jr|sr)\.$/i;
/**
 * The sentences of a text, cut only where a sentence ends: after . ! ? or … (with any closing quote or bracket, and any emoji right after it), before a space and a word that starts with a
 * capital, a digit, an opening quote or bracket, or an emoji. Joined with single spaces they give the text back exactly (inner runs of white space are kept inside the sentences).
 */
export function sentences(text: string): string[] {
  const t = text.trim();
  const out: string[] = [];
  const re = /[.!?…]+["'”’)\]]*(?:\s+\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️\p{Emoji_Modifier}]*)*(\s+)(?=["'“‘(\[]?[\p{Lu}\p{N}\p{Extended_Pictographic}])/gu;
  let from = 0;
  for (const m of t.matchAll(re)) {
    const end = (m.index ?? 0) + m[0].length - m[1].length;
    const piece = t.slice(from, end);
    if (ABBR.test(piece)) continue;
    out.push(piece);
    from = end + m[1].length;
  }
  out.push(t.slice(from));
  return out.filter(Boolean);
}
/** Short paragraphs from consecutive sentences: a paragraph closes once it holds 15 words or more; a last paragraph under 6 words joins the one before when the two stay within 32 words. */
export function paragraphs(ss: string[]): string[] {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const s of ss) {
    cur.push(s);
    if (words(cur.join(' ')) >= 15) { out.push(cur); cur = []; }
  }
  if (cur.length) {
    const prev = out[out.length - 1];
    if (prev && words(cur.join(' ')) < 6 && words([...prev, ...cur].join(' ')) <= 32) prev.push(...cur);
    else out.push(cur);
  }
  return out.map((p) => p.join(' '));
}

export interface LongProse {
  /** 'lead': the first sentence is a lead; 'paragraphs': no lead (a heading is there, or the first sentence is over 25 words), the first paragraph is set heavier; 'flat': the lead fell back to body size. */
  kind: 'lead' | 'paragraphs' | 'flat';
  lead?: string;
  paras: string[];
  body: number;
  leadSize?: number;
  ratio?: number;
  bodyW: number;
}
/** Is this prose slide a long block (the threshold is on the text only)? */
export const isLongProse = (paras: string[], pull: string): boolean => proseLeadRule.on && words([...paras, pull].join(' ')) >= LONG_WORDS;
/** Round W: the long-prose hierarchy is on. A switch the before/after comparison turns off; the app never does. */
export const proseLeadRule = { on: true };

const bw = (st: LayoutStyle) => nearestWeight(st.fonts.body, 500);
const hw = (st: LayoutStyle) => nearestWeight(st.fonts.headline, 800);
/** The body box width that holds at most CPL_MAX characters per line at size z (the full width when that is wider), and how many characters a line of that box holds (the text's own average character width). */
function measureOf(st: LayoutStyle, text: string, z: number, full: number): { w: number; cpl: number } {
  const per = measureWidth(text, st.fonts.body, bw(st), z) / Math.max(1, text.length);
  const w = Math.min(full, Math.ceil(per * CPL_MAX));
  return { w, cpl: w / per };
}

/**
 * The plan of a long prose slide: the lead (when the rule allows one), the paragraphs, the body size and the lead size, chosen by measurement in the free field. `extra` is the height the
 * slide's other parts take (heading, bullets, pull line).
 */
export function planLong(st: LayoutStyle, cx: Cx, head: string, paras0: string[], extra: (body: number) => number): LongProse {
  const fh = cx.field.y1 - cx.field.y0;
  const full = cx.field.w;
  const first = sentences(paras0[0] ?? '');
  const leadOk = !head && first.length > 0 && words(first[0]) <= LEAD_MAX_WORDS && (first.length > 1 || paras0.length > 1);
  const lead = leadOk ? first[0] : undefined;
  const rest = [...(leadOk ? [first.slice(1)] : [first]), ...paras0.slice(1).map(sentences)].filter((ss) => ss.length);
  const paras = rest.flatMap(paragraphs);
  const all = paras.join(' ');
  const room = 0.9 * fh;
  const bodyH = (z: number, w: number) => paras.reduce((a, p) => a + measure(p, st.fonts.body, bw(st), z, w, 1.35).h, 0) + Math.round(0.7 * z) * Math.max(0, paras.length - 1);
  const leadH = (z: number) => (lead ? measure(lead, st.fonts.headline, hw(st), z, full, 1.12).h : 0);
  const ruleH = (z: number) => (lead ? (st.devices.underline ? 2 * Math.round(0.5 * z) + 8 : Math.round(0.8 * z)) : 0);
  // every (body size, lead ratio) that fits; the body may give up to 15% of the biggest size that fits so the lead can be larger: within that, the largest ratio wins, then the biggest body
  const fitsL: { z: number; r: number; L: number; w: number }[] = [];
  for (const z of BODY_SIZES) {
    const m = measureOf(st, all || lead || '', z, full);
    if (m.cpl < CPL_MIN && z > BODY_MIN) continue;
    if (!lead) {
      if (bodyH(z, m.w) + extra(z) <= room) return { kind: 'paragraphs', paras, body: z, bodyW: m.w };
      continue;
    }
    for (const r of LEAD_RATIOS) {
      const L = Math.min(150, Math.max(TITLE_FLOOR, Math.ceil(z * 1.4), Math.min(Math.floor(z * 1.7), Math.round(z * r))));
      if (L / z >= LEAD_RATIOS[LEAD_RATIOS.length - 1] && leadH(L) + ruleH(z) + bodyH(z, m.w) + extra(z) <= room && measure(lead, st.fonts.headline, hw(st), L, full, 1.12).n <= 5) fitsL.push({ z, r, L, w: m.w });
    }
  }
  if (lead && fitsL.length) {
    const zmax = Math.max(...fitsL.map((c) => c.z));
    const best = fitsL.filter((c) => c.z >= 0.85 * zmax).sort((a, b) => b.r - a.r || b.z - a.z)[0];
    return { kind: 'lead', lead, paras, body: best.z, leadSize: best.L, ratio: Math.round((best.L / best.z) * 100) / 100, bodyW: best.w };
  }
  // the fall-back: the lead at body size (still its own paragraph in the headline font), the body at the biggest size (within the measure rule) that fits
  for (const z of BODY_SIZES) {
    const m = measureOf(st, all || lead || '', z, full);
    if (m.cpl < CPL_MIN && z > BODY_MIN) continue;
    if (leadH(z) + ruleH(z) + bodyH(z, m.w) + extra(z) <= room || z === BODY_MIN) return { kind: lead ? 'flat' : 'paragraphs', ...(lead ? { lead, leadSize: z, ratio: 1 } : {}), paras, body: z, bodyW: m.w };
  }
  return { kind: 'paragraphs', paras, body: BODY_MIN, bodyW: full };
}

/** Draws the lead, the style's own rule (only when the style has the underline device), and the paragraphs. The lead is the slide's title when there is no heading, so the engine marks the accent phrase on it with the style's accent and its contrast guard. */
export function drawLong(d: Draw, p: LongProse, tail: boolean, noHead: boolean) {
  const z = p.body;
  if (p.lead) {
    // the fall-back lead (body size) is a bold body paragraph: as the slide's title the engine would raise it to its 72 px headline floor
    d.text(p.kind === 'flat' ? 'body' : 'title', p.lead, { size: p.leadSize!, max: p.leadSize!, weight: 800, font: 'h', lines: 6, min: p.kind === 'flat' ? BODY_MIN : TITLE_FLOOR, lh: 1.12, gap: d.st.devices.underline ? Math.round(0.5 * z) : Math.round(0.8 * z) });
    if (d.st.devices.underline) {
      d.rect(d.x0, d.y, 120, 8, '$accent2', { rx: 4 });
      d.y += 8;
      d.gap(Math.round(0.5 * z));
    }
  }
  p.paras.forEach((t, i) => d.text('body', t, { w: p.bodyW, size: z, max: z, weight: p.kind === 'paragraphs' && noHead && i === 0 && p.paras.length > 1 ? 600 : 500, lines: 14, min: BODY_MIN, lh: 1.35, gap: i < p.paras.length - 1 ? Math.round(0.7 * z) : tail ? Math.round(0.8 * z) : 0 }));
}
