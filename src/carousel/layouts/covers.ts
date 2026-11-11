// The cover family (Round 6): six covers of different SHAPES, all drawn by code from the style's tokens; the model never picks them (flavour.ts gives the deck its cover from the style's own list,
// chosen from the deck, the same deck always getting the same one). Every cover takes the same text as a "statement": a headline, an optional kicker and an optional caption, and carries the
// highlight the way every cover does (withAccent: an accent word on a marker bar when the ink would not read). Nothing is drawn that nobody wrote: the only mark that is not the person's words
// is the page number "01" of cover-index, which is the page chrome.
import { measureWidth } from '../../image-engine/draw/text';
import { lineTexts, measure, nearestWeight } from './draw';
import { kickerOf, mk, place, str, withAccent } from './library';
import type { LayoutDef, LayoutStyle } from './types';

const hw = (st: LayoutStyle) => nearestWeight(st.fonts.headline, 800);
const FIELDS = [{ name: 'headline', required: true as const, max: 60 }, { name: 'kicker', required: false as const, max: 24 }, { name: 'caption', required: false as const, max: 60 }];
const SAMPLES = {
  normal: { kicker: 'New on Kickstarter', headline: 'The hoodie that becomes a backpack', caption: 'One piece. Two jobs. Zero bags.' },
  long: { kicker: 'New on Kickstarter now', headline: 'The hoodie that turns into a backpack in ten seconds', caption: 'One piece of clothing, two jobs, and zero bags to carry.' },
  short: { headline: 'Meet Quick Flip' },
};
const SIZES = [220, 208, 196, 184, 172, 160, 150, 138, 126, 114, 104, 96, 88, 80, 72];
/** The largest headline size at which the text wraps to at most `lines` lines in `w`, with every word inside the width. */
function fitSize(st: LayoutStyle, text: string, w: number, lines: number, from = 150): { size: number; h: number; n: number } {
  const words = text.split(/\s+/).filter(Boolean);
  for (const z of SIZES.filter((s) => s <= from)) {
    const widest = Math.max(...words.map((x) => measureWidth(x, st.fonts.headline, hw(st), z)));
    const m = measure(text, st.fonts.headline, hw(st), z, w, 1.05);
    if (widest <= w * 0.98 && m.n <= lines) return { size: z, h: Math.ceil(m.h) + 2, n: m.n };
  }
  const m = measure(text, st.fonts.headline, hw(st), 72, w, 1.05);
  return { size: 72, h: Math.ceil(m.h) + 2, n: m.n };
}
/** A headline of three words or fewer is set big (up to 220 px), as long as its longest word fits the width: a short headline fills the page like the statement cover does. */
const heroSize = (st: LayoutStyle, text: string, w: number, dflt = 150): number => {
  const ws = text.split(/\s+/).filter(Boolean);
  if (ws.length > 3) return dflt;
  let z = 220;
  while (z > dflt && Math.max(...ws.map((x) => measureWidth(x, st.fonts.headline, hw(st), z))) > w * 0.96) z -= 6;
  return z;
};
const capBox = (st: LayoutStyle, cap: string, w: number) => (cap ? Math.ceil(44 * 1.3) * Math.min(2, measure(cap, st.fonts.body, nearestWeight(st.fonts.body, 500), 44, w, 1.3).n) + 16 : 0);
const coverSlide = (kick: string, head: string, cap: string, dense: boolean) => ({ type: 'cover', kicker: dense ? '' : kick, headline: head, sub: dense ? '' : cap });
const wordsOf = (t: string) => t.split(/\s+/).filter(Boolean);

/** The size of the small line above the big word (fixed: a type scale would wrap it again). */
const REST_SIZE = 128;
/**
 * The small line of the word cover wrapped without an orphan: the last line is never a single word and never shorter than 40% of the longest line. The box is narrowed (balanced wrapping) until it
 * holds, at most to 55% of the width; null when no width does (the word cover is then not a candidate for that headline).
 */
export function restWrap(st: LayoutStyle, rest: string, w: number): { width: number; lines: number } | null {
  const wt = nearestWeight(st.fonts.headline, 700);
  const widest = Math.max(...rest.split(/\s+/).filter(Boolean).map((x) => measureWidth(x, st.fonts.headline, wt, REST_SIZE)));
  for (let ww = w; ww >= Math.max(widest, w * 0.55); ww -= 12) {
    const lines = lineTexts(rest, st.fonts.headline, wt, REST_SIZE, ww, 1.1);
    if (lines.length > 4) continue;
    if (lines.length < 2) return { width: ww, lines: 1 };
    const last = lines[lines.length - 1];
    const lastW = measureWidth(last, st.fonts.headline, wt, REST_SIZE);
    const maxW = Math.max(...lines.map((l) => measureWidth(l, st.fonts.headline, wt, REST_SIZE)));
    if (last.trim().split(/\s+/).length >= 2 && lastW >= 0.4 * maxW) return { width: ww, lines: lines.length };
  }
  return null;
}
/** Whether the word cover can show this headline without an orphan line above the word. */
export const wordCoverFits = (st: LayoutStyle, head: string): boolean => {
  const ws = head.split(/\s+/).filter(Boolean);
  return ws.length >= 3 && !!restWrap(st, ws.slice(0, -1).join(' '), 978);
};

export const COVER_LAYOUTS: LayoutDef[] = [
  // 1. centred, a small kicker label above ------------------------------------------------------------------------------------------
  {
    id: 'cover-centred', label: 'Cover: centred with a label', shapes: ['claim', 'hook'], variants: ['rule under the label', 'rule over the label'],
    fields: FIELDS, samples: SAMPLES,
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const kick = cx.density === 'statement' ? '' : str(f, 'kicker');
      const cap = cx.density === 'statement' ? '' : str(f, 'caption');
      const dense = cx.density === 'statement';
      const d = place(st, cx, 'center', (d) => {
        const rule = () => { d.rect(d.cx - 48, d.y, 96, 10, '$accent', { rx: 5 }); d.y += 10; d.gap(28); };
        if (kick) {
          if (v === 1) rule();
          kickerOf(d, kick, 'center', v === 0 ? 20 : 36);
          if (v === 0) rule();
        }
        const tz = dense ? 232 : heroSize(st, head, d.w);
        d.text('title', head, { size: tz, max: tz, weight: 800, font: 'h', lines: 4, min: 72, align: 'center', gap: cap ? 40 : 0 });
        if (cap) { d.part(); d.text('body', cap, { size: 44, fill: '$muted', align: 'center', lines: 2 }); }
      });
      return mk(d, { type: 'cover', fitAs: 'statement', slide: withAccent(coverSlide(kick, head, cap, dense), head, f, st) });
    },
  },
  // 2. headline bottom-left, the page number big in the top-right -------------------------------------------------------------------
  {
    id: 'cover-index', label: 'Cover: headline low, big page number', shapes: ['claim', 'hook'], variants: ['number right', 'number left'],
    fields: FIELDS, samples: SAMPLES,
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const dense = cx.density === 'statement';
      const kick = dense ? '' : str(f, 'kicker');
      const cap = dense ? '' : str(f, 'caption');
      const d = place(st, cx, 'top', (d) => {
        const fh = d.fy1 - d.fy0;
        const cb = capBox(st, cap, d.w);
        const kH = kick ? Math.ceil(48 * 1.25) + 24 : 0;
        // the headline takes the biggest size that leaves the top third to the number
        const fit = fitSize(st, head, d.w, 5, dense ? 232 : 150);
        let { size, h } = fit;
        while (size > 72 && h + kH + (cb ? cb + 36 : 0) > fh - 300) { const nx = fitSize(st, head, d.w, 6, size - 6); size = nx.size; h = nx.h; if (size <= 72) break; }
        const yTitle = d.fy1 - (cb ? cb + 36 : 0) - h;
        const nw = Math.ceil(measureWidth('01', st.fonts.headline, hw(st), 240)) + 24;
        d.text('number', '01', { x: v === 0 ? d.x0 + d.w - nw : d.x0, w: nw, size: 240, max: 240, weight: 800, font: 'h', fill: '$muted', align: 'left', lines: 1, min: 200, at: d.fy0 });
        if (kick) d.text('kicker', kick, { x: d.x0, w: d.w, size: 48, max: 48, weight: 600, fill: '$muted', align: 'left', lines: 1, min: 48, at: yTitle - kH });
        d.text('title', head, { x: d.x0, w: d.w, size: size, max: size, weight: 800, font: 'h', lines: 6, min: 72, lh: 1.05, at: yTitle });
        if (cap) d.text('body', cap, { x: d.x0, w: d.w, size: 44, max: 44, fill: '$muted', lines: 2, min: 44, at: yTitle + h + 36, boxH: cb });
      });
      // the page number (the cover is page 1) fills the "number" slot: it is the page chrome, not a word of the deck
      return mk(d, { type: 'cover', fitAs: 'statement', noBalance: true, slide: withAccent({ ...coverSlide(kick, head, cap, dense), value: '01' }, head, f, st) });
    },
  },
  // 3. the headline in a coloured block, the rest of the ground open -------------------------------------------------------------
  {
    id: 'cover-block', label: 'Cover: headline in a block', shapes: ['claim', 'hook'], variants: ['block at the top', 'block at the bottom'],
    fields: FIELDS, samples: SAMPLES,
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const kick = str(f, 'kicker');
      const cap = cx.density === 'statement' ? '' : str(f, 'caption');
      const d = place(st, cx, 'top', (d) => {
        const fh = d.fy1 - d.fy0;
        const pad = 64;
        const w = d.w - 2 * pad - 24;
        const cb = capBox(st, cap, d.w);
        const bh = Math.round(fh * 0.66);
        const kH = kick ? Math.ceil(48 * 1.25) + 24 : 0;
        let z = fitSize(st, head, w, 5);
        while (z.size > 72 && kH + z.h + 2 * pad > bh) z = fitSize(st, head, w, 5, z.size - 6);
        const by = v === 0 ? d.fy0 : d.fy1 - bh;
        d.rect(d.x0, by, d.w, bh, '$surface', { rx: 48 });
        d.rect(d.x0 + 28, by + 56, 14, bh - 112, '$accent', { rx: 7 });
        const block = kH + z.h;
        let yy = by + Math.round((bh - block) / 2);
        const x = d.x0 + pad + 24;
        if (kick) { d.text('kicker', kick, { x, w, size: 48, max: 48, weight: 600, fill: '$muted', align: 'left', lines: 1, min: 48, at: yy }); yy += kH; }
        d.text('title', head, { x, w, size: z.size, max: z.size, weight: 800, font: 'h', lines: 5, min: 72, lh: 1.05, at: yy });
        if (cap) d.text('body', cap, { x: d.x0, w: d.w, size: 44, max: 44, fill: '$muted', lines: 2, min: 44, at: v === 0 ? by + bh + 36 : by - 36 - cb, boxH: cb });
      });
      return mk(d, { type: 'content', fitAs: 'statement-card', noBalance: true, slide: withAccent({ type: 'content', kicker: kick, headline: head, body: cap }, head, f, st) });
    },
  },
  // 4. the headline on a sticker (a card with a hard offset behind it) ------------------------------------------------------------
  {
    id: 'cover-sticker', label: 'Cover: headline on a sticker', shapes: ['claim', 'hook'], variants: ['sticker left', 'sticker right'],
    fields: FIELDS, samples: SAMPLES,
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const kick = str(f, 'kicker');
      const cap = cx.density === 'statement' ? '' : str(f, 'caption');
      const d = place(st, cx, 'top', (d) => {
        const fh = d.fy1 - d.fy0;
        const pad = 64;
        const cw = Math.round(d.w * 0.86);
        const w = cw - 2 * pad;
        const cb = capBox(st, cap, w);
        const kH = kick ? Math.ceil(48 * 1.25) + 24 : 0;
        const room = fh - 40 - 2 * pad - kH - (cb ? cb + 36 : 0);
        let z = fitSize(st, head, w, 5, heroSize(st, head, w, 138));
        while (z.size > 72 && z.h > room) z = fitSize(st, head, w, 5, z.size - 6);
        const ph = z.h + kH + (cb ? cb + 36 : 0) + 2 * pad;
        const x0 = v === 0 ? d.x0 : d.x0 + d.w - cw - 22;
        const y0 = d.fy0 + Math.round((fh - ph - 22) / 2);
        // the hard shadow behind the sticker: two strips (right and bottom), so no text sits over the accent colour
        d.path(`M ${x0 + cw + 12} ${y0 + 64} L ${x0 + cw + 12} ${y0 + ph + 12} L ${x0 + 64} ${y0 + ph + 12}`, { stroke: '$accent', sw: 26, cap: true, y0: y0 + 64, y1: y0 + ph + 26 });
        d.rect(x0, y0, cw, ph, '$surface', { rx: 48, stroke: '$text', sw: 6, noShadow: true });
        let yy = y0 + pad;
        const x = x0 + pad;
        if (kick) { d.text('kicker', kick, { x, w, size: 48, max: 48, weight: 600, fill: '$muted', align: 'left', lines: 1, min: 48, at: yy }); yy += kH; }
        d.text('title', head, { x, w, size: z.size, max: z.size, weight: 800, font: 'h', lines: 5, min: 72, lh: 1.05, at: yy });
        if (cap) d.text('body', cap, { x, w, size: 44, max: 44, fill: '$muted', lines: 2, min: 44, at: yy + z.h + 36, boxH: cb });
      });
      return mk(d, { type: 'content', fitAs: 'statement-card', noBalance: true, slide: withAccent({ type: 'content', kicker: kick, headline: head, body: cap }, head, f, st) });
    },
  },
  // 5. one oversized word, the rest of the headline small above it ----------------------------------------------------------------
  {
    id: 'cover-word', label: 'Cover: one oversized word', shapes: ['claim', 'hook'], variants: ['left', 'centred'],
    // the headline is the whole sentence; its LAST word is set huge, the rest above it as the supporting line (the words and their order are the person's)
    fields: [{ name: 'headline', required: true, max: 60 }],
    samples: { normal: { headline: 'The hoodie that becomes a backpack' }, long: { headline: 'The hoodie that turns into a backpack in ten seconds' }, short: { headline: 'Meet Quick Flip' } },
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const al = v === 0 ? 'left' : 'center';
      const ws = wordsOf(head);
      const last = ws[ws.length - 1] ?? head;
      const word = last.replace(/[.,;:!?]+$/, '');
      const rest = ws.slice(0, -1).join(' ');
      const d = place(st, cx, 'center', (d) => {
        // the biggest size at which the word fits the width
        let z = 420;
        while (z > 110 && measureWidth(word, st.fonts.headline, hw(st), z) > d.w * 0.96) z -= 6;
        const rw = restWrap(st, rest, d.w) ?? { width: d.w, lines: 4 };
        d.text('body', rest, { x: al === 'center' ? d.x0 + Math.round((d.w - rw.width) / 2) : d.x0, w: rw.width, size: REST_SIZE, max: REST_SIZE, weight: 700, font: 'h', fill: '$text', align: al, lines: 4, min: 56, lh: 1.1, gap: 60 });
        d.text('title', last, { size: z, max: Math.max(z, 150), weight: 800, font: 'h', lines: 1, min: 110, align: al, lh: 0.95 });
      });
      // the huge word is highlighted on a marker bar in every style (a huge word in the accent colour reads under 4.5:1 on some grounds; the bar always reads)
      const slide = withAccent({ type: 'cover', headline: last, sub: rest }, last, { headline: str(f, 'headline') }, st);
      if (slide.accent && !Array.isArray(slide.accent)) slide.accent = { ...(slide.accent as Record<string, unknown>), style: 'marker' };
      return mk(d, { type: 'cover', fitAs: 'statement', slide });
    },
  },
  // 6. the headline between heavy rules (a ruled sheet) ----------------------------------------------------------------------------
  {
    id: 'cover-ruled', label: 'Cover: headline between rules', shapes: ['claim', 'hook'], variants: ['two heavy rules', 'heavy rule over a thin one'],
    fields: FIELDS, samples: SAMPLES,
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const dense = cx.density === 'statement';
      const kick = dense ? '' : str(f, 'kicker');
      const cap = dense ? '' : str(f, 'caption');
      const d = place(st, cx, 'center', (d) => {
        if (kick) kickerOf(d, kick, 'left', 28);
        d.rect(d.x0, d.y, d.w, 12, '$text', { noShadow: true });
        d.y += 12;
        d.gap(44);
        d.text('title', head, { size: dense ? 232 : 140, max: dense ? 232 : 150, weight: 800, font: 'h', lines: 4, min: 72, align: 'left', gap: 44 });
        d.rect(d.x0, d.y, d.w, v === 0 ? 12 : 4, '$text', { noShadow: true });
        d.y += v === 0 ? 12 : 4;
        if (cap) { d.gap(36); d.text('body', cap, { size: 44, fill: '$muted', align: 'left', lines: 2 }); }
      });
      return mk(d, { type: 'cover', fitAs: 'statement', slide: withAccent(coverSlide(kick, head, cap, dense), head, f, st) });
    },
  },
];
