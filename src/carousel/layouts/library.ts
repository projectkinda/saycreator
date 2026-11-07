// The layout library: 19 layouts (+ photo-led), each with 2 variants and the cuts it supports. A layout plans its slots and shapes from the style tokens, the text and the
// free field the cut leaves. A layout may split itself with d.part(): part A stays on the field, part B sits on the plane when the slide has a cut. The engine (build.ts)
// then runs the existing fit, balance, collision and final checks and draws planes, accent, chrome and background.
import { measureWidth } from '../../image-engine/draw/text';
import { measure, lineTexts, nearestWeight, Draw, CARD_PAD, S, setScale, accentInk, checkIcon, segmentBar, solidBar, sliderGraphic, toggleGraphic, arrow, quoteMark, questionMark } from './draw';
import type { Cut, Cx, Fields, LayoutDef, LayoutId, LayoutStyle, Plan, Slot } from './types';

const str = (f: Fields, k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '');
const arr = (f: Fields, k: string) => (Array.isArray(f[k]) ? (f[k] as string[]).map((x) => x.trim()).filter(Boolean) : []);
const lastWord = (t: string) => t.replace(/[^\p{L}\p{N}%$\s'-]/gu, '').trim().split(/\s+/).pop() ?? '';

const KS = [1, 1.15, 1.3225, 1.5209, 1.749];
/** The share of the free height a drawing must fill: the type scale first, then the gaps. */
export const FILL = 0.65;
/** What place() aims for: a little over FILL, so the measured fill (the boxes' extent, rounded) is at least FILL. */
const AIM = FILL + 0.02;
/**
 * Plans a drawing in the free field. A short drawing is first scaled up in the type scale (1.15 steps, each text up to its own largest size) until it fills 65% of the free
 * height, then centred; only when every text has reached its largest size and it is still short are the gaps spread (to 65%). Part A (above part()) is centred in the
 * field, part B starts where the engine put the plane.
 */
function place(st: LayoutStyle, cx: Cx, anchor: 'center' | 'top' | 'bottom', fn: (d: Draw) => void): Draw {
  const f = cx.field;
  const fieldH = f.y1 - f.y0;
  const plan = (k: number) => {
    setScale(k);
    const d = new Draw(st, f, cx);
    fn(d);
    return d;
  };
  const span = (d: Draw) => Math.max(0, d.maxY - Math.min(0, d.minY));
  try {
    let k = cx.k ?? 1;
    if (cx.k === undefined && anchor !== 'top') {
      let prev = span(plan(1));
      if (prev < AIM * fieldH)
        for (const nk of KS.slice(1)) {
          const t = span(plan(nk));
          if (t > 0.92 * fieldH) break;
          k = nk;
          if (t >= AIM * fieldH || Math.abs(t - prev) < 2) break; // filled, or every text is at its largest size
          prev = t;
        }
    }
    const dry = plan(k);
    const part = dry.partFrom !== undefined;
    const total = part ? dry.partFrom! - Math.min(0, dry.minY) : span(dry);
    const gaps = part ? dry.gapSumA : dry.gapSum;
    const scale = anchor !== 'top' && total < AIM * fieldH && gaps > 0 ? Math.min(2.8, 1 + (AIM * fieldH - total) / gaps) : 1;
    const sized = total + (scale - 1) * gaps;
    const start = anchor === 'top' ? f.y0 : anchor === 'bottom' && !part ? Math.max(f.y0, f.y1 - sized - 24) : Math.max(f.y0, Math.round((f.y0 + f.y1) / 2 - sized / 2));
    setScale(k);
    const d = new Draw(st, f, cx);
    d.real = true;
    d.k = k;
    d.gapScale = scale;
    d.y = start;
    fn(d);
    return d;
  } finally {
    setScale(1);
  }
}
/** An accent phrase never starts with an article ("a result" accents "result", "the hoodie" accents "hoodie"); a phrase that is only an article stays as it is. */
export const stripArticle = (p: string): string => {
  const t = p.trim().replace(/[.,;:]+$/, '');
  const out = t.replace(/^(?:(?:a|an|the)\s+)+/i, '');
  return out || t;
};
/** The accent phrases of a slide: the layout's own `accent` field (one phrase or up to 3), else the last word of the headline. */
const withAccent = (slide0: Record<string, unknown>, headline: string, f: Fields, st: LayoutStyle): Record<string, unknown> => {
  let slide = slide0;
  const list = Array.isArray(f.accent) ? arr(f, 'accent').slice(0, 3) : str(f, 'accent') ? [str(f, 'accent')] : [lastWord(headline)];
  const phrases = list.map(stripArticle).filter(Boolean);
  if (!phrases.length) return slide;
  // a marker bar is matched word by word: a trailing full stop on the headline would stop it from matching the last accent word
  if (st.accentStyle === 'marker' && typeof slide.headline === 'string') slide = { ...slide, headline: slide.headline.replace(/[.,;:]+$/, '') };
  return { ...slide, accent: phrases.length === 1 ? { phrase: phrases[0], style: st.accentStyle } : phrases.map((p) => ({ phrase: p, style: st.accentStyle })) };
};
/** A headline of three words or fewer is set big (up to 220 px, the statement mechanism puts it back after the engine's fit): the longest word must still fit the width. */
const heroTitle = (d: Draw, text: string, align: 'left' | 'center', size = 140, gap = 0, lines = 3) => {
  let sz = size;
  const ws = text.trim().split(/\s+/).filter(Boolean);
  if (ws.length <= 3 && d.cxo?.density !== 'statement' && (d.cxo?.cut ?? 'plain') === 'plain' && size < 220) {
    sz = 220;
    const widest = (z: number) => Math.max(...ws.map((w) => measureWidth(w, d.st.fonts.headline, nearestWeight(d.st.fonts.headline, 800), z)));
    while (sz > size && widest(sz) > d.w * 0.96) sz -= 6;
  }
  return d.text('title', text, { size: sz, max: Math.max(sz, 150), weight: 800, font: 'h', lines, min: 72, align, gap });
};
const kickerOf = (d: Draw, text: string, align: 'left' | 'center', gap = 24) => text && d.text('kicker', text, { size: 48, weight: 600, fill: '$muted', align, lines: 1, gap });
const mk = (d: Draw, p: Pick<Plan, 'type' | 'fitAs' | 'slide'> & Partial<Plan>): Plan => ({
  slots: d.slots,
  shapes: d.shapes.join(''),
  planeShapes: d.planeShapes.join(''),
  span: Math.max(0, d.maxY - Math.min(d.minY, d.maxY)),
  parts: d.partFrom !== undefined ? { hA: Math.max(0, d.partFrom - Math.min(d.minY, d.partFrom)), hB: Math.max(0, d.maxY - (d.partStart ?? d.maxY)) } : undefined,
  stepperPlane: d.hasB,
  k: d.k,
  ...p,
});

const LAYOUT_LIST: LayoutDef[] = [
  // 1 ------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'statement', label: 'Statement', shapes: ['claim', 'hook'], variants: ['left', 'centred'],
    fields: [{ name: 'headline', required: true, max: 60 }, { name: 'kicker', required: false, max: 24 }, { name: 'caption', required: false, max: 60 }],
    samples: {
      normal: { kicker: 'New on Kickstarter', headline: 'The hoodie that becomes a backpack', caption: 'One piece. Two jobs. Zero bags.' },
      long: { kicker: 'New on Kickstarter now', headline: 'The hoodie that turns into a backpack in ten seconds', caption: 'One piece of clothing, two jobs, and zero bags to carry.' },
      short: { headline: 'Meet Quick Flip' },
    },
    plan(f, v, st, cx) {
      const al = v === 0 ? 'left' : 'center';
      const dense = cx.density === 'statement';
      const head = str(f, 'headline');
      const cap = dense ? '' : str(f, 'caption');
      const d = place(st, cx, 'center', (d) => {
        if (!dense) kickerOf(d, str(f, 'kicker'), al, 28);
        heroTitle(d, head, al, dense ? 232 : 140, cap ? 40 : 0);
        if (cap) {
          d.part();
          d.text('body', cap, { size: 44, fill: '$muted', align: al, lines: 2 });
        }
        d.underline(d.x0, al);
      });
      return mk(d, { type: 'cover', fitAs: 'statement', slide: withAccent({ type: 'cover', kicker: dense ? '' : str(f, 'kicker'), headline: head, sub: cap }, head, f, st) });
    },
  },
  // 2 ------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'lead-statement', label: 'Lead-in statement', shapes: ['story', 'explainer'], variants: ['kicker over huge headline, bottom', 'light lead-in over heavy headline'],
    fields: [{ name: 'lead', required: true, max: 40 }, { name: 'headline', required: true, max: 50 }],
    samples: {
      normal: { lead: 'It started in a rainy taxi', headline: 'We ditched the bag and kept the hoodie' },
      long: { lead: 'It started on a rainy night in a taxi', headline: 'We ditched the heavy bag and kept only the hoodie' },
      short: { lead: 'It began', headline: 'One hoodie' },
    },
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const plain = cx.cut === 'plain';
      const d = place(st, cx, 'center', (d) => {
        if (v === 0) {
          // a short accent rule, then a small kicker line over a huge headline: one block, centred in the free area (the rule sits right above the kicker, not at the top of the slide)
          if (plain) {
            d.rect(d.x0, d.y, 160, 12, '$accent', { rx: 6 });
            d.gap(44);
          }
          d.text('kicker', str(f, 'lead'), { size: 48, weight: 600, fill: '$muted', lines: 2, gap: 20 });
        } else d.text('kicker', str(f, 'lead'), { size: 84, weight: 300, fill: '$muted', lines: 2, min: 48, gap: 48 });
        d.part();
        heroTitle(d, head, 'left', v === 0 ? 150 : 140);
        d.underline();
      });
      return mk(d, { type: 'cover', fitAs: 'statement', slide: withAccent({ type: 'cover', kicker: str(f, 'lead'), headline: head }, head, f, st) });
    },
  },
  // 3 ------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'big-question', label: 'Big question', shapes: ['question', 'hook'], variants: ['centred', 'left'],
    fields: [{ name: 'question', required: true, max: 70 }, { name: 'line', required: false, max: 60 }],
    samples: {
      normal: { question: 'What if your hoodie was also your bag?', line: 'Keep reading to see how.' },
      long: { question: 'What if the hoodie you already wear could also carry your laptop?', line: 'Keep reading to see exactly how it works.' },
      short: { question: 'Why carry two?' },
    },
    plan(f, v, st, cx) {
      const al = v === 0 ? 'center' : 'left';
      const dense = cx.density === 'statement';
      const raw = str(f, 'question');
      // the "?" is drawn as a graphic above the question (not in the dense statement mode, which is only type)
      const text = dense ? raw : raw.replace(/\s*\?+\s*$/, '');
      const line = dense ? '' : str(f, 'line');
      const d = place(st, cx, 'center', (d) => {
        if (!dense) {
          questionMark(d, al === 'center' ? d.cx : d.x0 + 10, d.y, 230, al);
          d.y += 230;
          d.gap(36);
        }
        d.part();
        heroTitle(d, text, al, dense ? 232 : 140, line ? 44 : 0);
        if (line) d.text('body', line, { size: 44, fill: '$muted', align: al, lines: 2 });
        d.underline(d.x0, al);
      });
      return mk(d, { type: 'cover', fitAs: 'statement', slide: withAccent({ type: 'cover', headline: text, sub: line }, text, f, st) });
    },
  },
  // 4 ------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'split-text', label: 'Split text', shapes: ['explainer', 'story'], variants: ['divider line', 'accent bar'],
    fields: [{ name: 'headline', required: true, max: 50 }, { name: 'paragraph', required: true, max: 110, maxWords: 14 }],
    samples: {
      normal: { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' },
      long: { headline: 'Why we decided to build it ourselves', paragraph: 'We sewed a waterproof bag into the hood and tested it for two years.' },
      short: { headline: 'Why', paragraph: 'One layer replaces two things you carry.' },
    },
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const para = str(f, 'paragraph');
      if (cx.cut === 'plain') {
        // two columns with a rule between them: the headline on the left, the paragraph on the right
        const gutter = 88;
        const orphan = (l: string) => !/\s/.test(l.trim()) && l.trim().length <= 3;
        const fieldH = cx.field.y1 - cx.field.y0;
        const sized = (text: string, font: 'h' | 'b', w: number, from: number, floor: number, lh: number, maxLines: number, acc?: { phrases: string[]; marker: boolean }) => {
          const fam = font === 'h' ? st.fonts.headline : st.fonts.body;
          const wt = nearestWeight(fam, font === 'h' ? 800 : 500);
          let size = from;
          let ok = false;
          while (size > floor) {
            // the headline is laid out as the engine will lay it out (accent phrase glued, a marker's padding and clear space): that wrap must have no lone short word and
            // must not need more height than the plain wrap the box was measured with, or the engine would shrink the type and wrap it again
            const ls = lineTexts(text, fam, wt, size, w, lh, acc);
            const boxLines = acc ? lineTexts(text, fam, wt, size, w, lh).length : ls.length;
            // a word wider than the column makes the engine shrink the type and wrap it again
            const widest = Math.max(...text.split(/\s+/).filter(Boolean).map((x) => measureWidth(x, fam, wt, size)));
            if (widest <= w && ls.length <= maxLines && ls.length <= boxLines && ls.length * size * lh <= 0.8 * fieldH && !(ls.length > 1 && ls.some(orphan))) {
              ok = true;
              break;
            }
            size -= 4;
          }
          return { size, ok };
        };
        const accList = Array.isArray(f.accent) ? arr(f, 'accent').slice(0, 3).map(stripArticle) : str(f, 'accent') ? [stripArticle(str(f, 'accent'))] : [lastWord(head)];
        // the headline column: half the width, wider when the headline cannot be set without a lone short word at half
        // The column split that gives the biggest block: a short headline with a wide word needs a wider column to be set big, and a block that is too short leaves the slide
        // half empty. Every candidate must set the headline without a lone short word; ties keep the narrower headline column.
        const acc = { phrases: accList.filter(Boolean), marker: st.accentStyle === 'marker' };
        const hfam = st.fonts.headline;
        const bfam = st.fonts.body;
        const hwt = nearestWeight(hfam, 800);
        const bwt = nearestWeight(bfam, 500);
        let best: { lw: number; tsz: number; psz: number; ok: boolean; h: number } | null = null;
        for (const ratio of [0.5, 0.45, 0.55, 0.6, 0.65]) {
          const w1 = Math.round((cx.field.w - gutter) * ratio);
          const t = sized(head, 'h', w1, 150, 72, 1.05, 5, acc);
          const p = sized(para, 'b', cx.field.w - gutter - w1, 88, 44, 1.3, 14);
          const th = lineTexts(head, hfam, hwt, t.size, w1, 1.05, acc).length * t.size * 1.05;
          const ph = lineTexts(para, bfam, bwt, p.size, cx.field.w - gutter - w1, 1.3).length * p.size * 1.3;
          const h = Math.max(th, ph);
          if (!best || (t.ok && !best.ok) || (t.ok === best.ok && h > best.h + 8)) best = { lw: w1, tsz: t.size, psz: p.size, ok: t.ok, h };
        }
        // a short block (under 70% of the free height) is not set in columns: the stacked layout below scales the type up to fill the field
        if (best!.h >= 0.7 * fieldH) {
        const lw = best!.lw;
        const tsz = best!.tsz;
        const rw = cx.field.w - gutter - lw;
        const psz = best!.psz;
        const d = place(st, cx, 'center', (d) => {
          const y0 = d.y;
          const t = d.text('title', head, { x: d.x0, w: lw, size: tsz, max: tsz, weight: 800, font: 'h', lines: 5, min: 72, at: y0 });
          const p = d.text('body', para, { x: d.x0 + lw + gutter, w: rw, size: psz, max: psz, lines: 14, lh: 1.3, at: y0 });
          const h = Math.max(t.h, p.h);
          const rx = d.x0 + lw + gutter / 2;
          if (v === 0) d.rect(rx - 2, y0, 4, h, '$muted', { opacity: 0.7 });
          else d.rect(rx - 7, y0, 14, Math.min(h, 220), '$accent', { rx: 7 });
          d.y = y0 + h;
        });
        return mk(d, { type: 'content', fitAs: 'split-cols', slide: withAccent({ type: 'content', headline: head, body: para }, head, f, st) });
        }
      }
      const d = place(st, cx, 'center', (d) => {
        heroTitle(d, head, 'left', 130, cx.cut === 'plain' ? 56 : 24);
        d.part();
        d.text('body', para, { size: 44, max: 72, fill: '$text', lines: 7, lh: 1.3 });
      });
      return mk(d, { type: 'cover', fitAs: 'split-text', slide: withAccent({ type: 'cover', headline: head, sub: para }, head, f, st) });
    },
  },
  // 5 ------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'big-stat', label: 'Big stat', shapes: ['number', 'metric'], variants: ['number top', 'number centred'],
    fields: [{ name: 'number', required: true, max: 9 }, { name: 'label', required: true, max: 40, maxWords: 5 }, { name: 'source', required: false, max: 50 }],
    samples: {
      normal: { number: '10 sec', label: 'to flip into a bag', source: 'Measured in our workshop' },
      long: { number: '1,250,000', label: 'raised in the first day', source: 'Source: Kickstarter, March 2026 data' },
      short: { number: '5x', label: 'faster than a bag' },
    },
    plan(f, v, st, cx) {
      const al = v === 0 ? 'left' : 'center';
      const d = place(st, cx, 'center', (d) => {
        d.text('number', str(f, 'number'), { size: 480, weight: 800, font: 'h', fill: accentInk(st), align: al, lines: 1, min: 120, gap: 28 });
        d.part();
        d.text('title', str(f, 'label'), { size: 48, max: 48, weight: 700, font: 'h', align: al, lines: 2, min: 40, gap: 28 });
        if (str(f, 'source')) d.text('body', str(f, 'source'), { size: 44, fill: '$muted', align: al, lines: 2 });
        d.underline(d.x0, al);
      });
      return mk(d, { type: 'stat', fitAs: 'big-stat', slide: { type: 'stat', value: str(f, 'number'), label: str(f, 'label'), note: str(f, 'source') } });
    },
  },
  // 6 ------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'stat-bar', label: 'Stat with bar', shapes: ['metric', 'number'], variants: ['segments', 'solid bar'],
    fields: [{ name: 'number', required: true, max: 9 }, { name: 'label', required: true, max: 40, maxWords: 5 }, { name: 'bar', required: true, max: 3, percent: true }, { name: 'note', required: false, max: 50 }],
    samples: {
      normal: { number: '$500,000', label: 'for 5% of the company', bar: '5', note: 'Open to 20 backers only' },
      long: { number: '1,250,000', label: 'for 12% of the company', bar: '12', note: 'Open to twenty backers who join in March' },
      short: { number: '5%', label: 'of the company', bar: '5' },
    },
    plan(f, v, st, cx) {
      const value = Math.max(0, Math.min(100, Number(str(f, 'bar')) || 0));
      const d = place(st, cx, 'center', (d) => {
        d.text('number', str(f, 'number'), { size: 300, weight: 800, font: 'h', fill: accentInk(st), lines: 1, min: 120, gap: 12 });
        d.text('title', str(f, 'label'), { size: 48, max: 48, weight: 700, font: 'h', lines: 2, min: 40, gap: 56 });
        d.part();
        const y = d.y;
        if (v === 0) segmentBar(d, y, value);
        else solidBar(d, y, value);
        d.y = y + 64;
        if (str(f, 'note')) {
          d.gap(36);
          d.text('body', str(f, 'note'), { size: 44, fill: '$muted', lines: 2 });
        }
      });
      return mk(d, { type: 'stat', fitAs: 'stat-bar', slide: { type: 'stat', value: str(f, 'number'), label: str(f, 'label'), note: str(f, 'note') } });
    },
  },
  // 7 ------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'stepper', label: 'Stepper', shapes: ['process', 'step'], variants: ['vertical', 'numbered nodes'],
    fields: [{ name: 'title', required: true, max: 40 }, { name: 'steps', required: true, max: 36, list: { min: 2, max: 5 } }, { name: 'current', required: false, max: 1 }],
    samples: {
      normal: { title: 'How it flips', steps: ['Zip the hood into the pocket', 'Fold the sleeves behind you', 'Pull the straps and go'] },
      long: { title: 'How the hoodie flips into a bag', steps: ['Zip the hood down into the pocket', 'Fold both sleeves behind your back', 'Clip the chest strap in place', 'Pull the straps tight and go', 'Stash it under the airplane seat'] },
      short: { title: 'Flip it', steps: ['Zip', 'Fold'] },
    },
    plan(f, v, st, cx) {
      const steps = arr(f, 'steps').slice(0, 5);
      const title = str(f, 'title');
      const current = Math.max(1, Math.min(steps.length, Number(str(f, 'current')) || 1));
      let top = 0;
      const d = place(st, cx, 'top', (d) => {
        d.text('title', title, { size: 120, weight: 800, font: 'h', lines: 2, min: 72, gap: 40 });
        d.part();
        top = d.y;
        if (v === 0) d.reserve(steps.length * 124);
        else {
          const n = steps.length;
          const pitch = Math.min(n <= 3 ? 280 : 200, Math.max(128, Math.floor((d.by1 - top - 14) / n)));
          const r = 60;
          const cxn = d.x0 + r;
          if (n >= 2) d.rect(cxn - 2, top + pitch / 2, 4, pitch * (n - 1), '$muted');
          steps.forEach((s, i) => {
            const cy = top + pitch * i + pitch / 2;
            const lab = measure(s, st.fonts.body, nearestWeight(st.fonts.body, 500), 44, d.w - 2 * r - 40, 1.25);
            const bh = Math.max(lab.h + 2, 2 * r);
            d.circle(cxn, cy, r, '$accent');
            d.text('body', String(i + 1), { x: d.x0, w: 2 * r, size: 56, weight: 800, font: 'h', fill: '$onAccent', align: 'center', lines: 1, min: 44, at: cy - bh / 2, boxH: bh });
            d.text('body', s, { x: d.x0 + 2 * r + 40, w: d.w - 2 * r - 40, size: 44, lines: 2, min: 44, at: cy - bh / 2, boxH: bh });
          });
          d.y = top + pitch * n;
        }
      });
      if (v === 0) return mk(d, { fitAs: 'stepper', type: 'content', slide: { type: 'content', headline: title, steps, current }, stepper: { steps, current, bounds: { top, bottom: d.by1 } } });
      return mk(d, { fitAs: 'stepper', type: 'checklist', slide: { type: 'checklist', headline: title } });
    },
  },
  // 8 ------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'step-numeral', label: 'Step numeral', shapes: ['step', 'process'], variants: ['numeral left', 'numeral right'],
    fields: [{ name: 'step', required: true, max: 1, percent: true }, { name: 'title', required: true, max: 32 }, { name: 'body', required: true, max: 120 }],
    samples: {
      normal: { step: '2', title: 'Fold the sleeves', body: 'Wrap both sleeves behind your back so they sit flat.' },
      long: { step: '3', title: 'Fold the long sleeves in', body: 'Wrap both sleeves behind your back and clip them so the pack sits flat and stays close.' },
      short: { step: '1', title: 'Zip', body: 'Zip the hood down.' },
    },
    plan(f, v, st, cx) {
      const n = Math.max(1, Math.min(9, Number(str(f, 'step')) || 1));
      const nw = 300;
      const cw = cx.field.w - nw - 32;
      const d = place(st, cx, 'center', (d) => {
        const y0 = d.y;
        const colx = v === 0 ? d.x0 + nw + 32 : d.x0;
        d.text('tag', 'STEP ' + n, { x: colx, w: cw, size: 48, weight: 700, fill: '$muted', lines: 1, gap: 20, align: 'left' });
        d.text('title', str(f, 'title'), { x: colx, w: cw, size: 76, weight: 800, font: 'h', lines: 3, min: 72, gap: 24 });
        d.text('body', str(f, 'body'), { x: colx, w: cw, size: 44, fill: '$muted', lines: 6 });
        const nx = v === 0 ? d.x0 : d.x0 + d.w - nw;
        d.text('number', String(n), { x: nx, w: nw, size: 340, weight: 800, font: 'h', fill: accentInk(st), lines: 1, min: 200, at: y0, align: v === 0 ? 'left' : 'center' });
      });
      return mk(d, { type: 'step', fitAs: 'step-numeral', slide: { type: 'step', number: n, headline: str(f, 'title'), body: str(f, 'body') } });
    },
  },
  // 9 ------------------------------------------------------------------------------------------------------------------------------
  {
    id: 'checklist', label: 'Checklist', shapes: ['benefits', 'list'], variants: ['icons', 'ruled lines'],
    fields: [{ name: 'title', required: true, max: 40 }, { name: 'items', required: true, max: 48, list: { min: 3, max: 5 } }],
    samples: {
      normal: { title: 'Why you will love it', items: ['Waterproof shell', 'Fits a 16-inch laptop', 'Machine washable', 'Flips in 10 seconds'] },
      long: { title: 'Everything you get with it', items: ['A fully waterproof shell for rainy days', 'A padded pocket for a 16-inch laptop', 'Machine washable at thirty degrees', 'Flips from hoodie to bag in ten seconds', 'A lifetime repair promise from us'] },
      short: { title: 'Perks', items: ['Light', 'Warm', 'Dry'] },
    },
    plan(f, v, st, cx) {
      const items = arr(f, 'items').slice(0, 5);
      const d = place(st, cx, 'center', (d) => {
        d.text('title', str(f, 'title'), { size: 88, weight: 800, font: 'h', lines: 2, min: 72, gap: 48 });
        d.part();
        const x = v === 0 ? d.x0 + S(84) : d.x0;
        items.forEach((it) => {
          const m = measure(it, st.fonts.body, nearestWeight(st.fonts.body, 500), 48, d.w - (x - d.x0), 1.25);
          // short lists: the rows grow with the type scale (items up to 72 px) and breathe, so three short items do not leave the slide half empty
          const h = Math.max(m.h + 2, S(64));
          if (v === 0) checkIcon(d, d.x0 + S(28), d.y + h / 2, S(28));
          d.text('body', it, { x, w: d.w - (x - d.x0), size: 48, max: 72, lines: 2, min: 44, boxH: h });
          if (v === 1) {
            d.gap(32);
            d.rect(d.x0, d.y, d.w, 3, '$muted', { opacity: 0.45 });
            d.gap(40);
          } else d.gap(52);
        });
      });
      return mk(d, { type: 'checklist', fitAs: 'checklist', slide: { type: 'checklist', headline: str(f, 'title'), items } });
    },
  },
  // 10 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'numbered-list', label: 'Numbered list', shapes: ['ranking', 'list'], variants: ['numerals left', 'numerals in badges'],
    fields: [{ name: 'title', required: true, max: 40 }, { name: 'items', required: true, max: 44, list: { min: 3, max: 5 } }],
    samples: {
      normal: { title: 'Three ways to wear it', items: ['As a hoodie on the street', 'As a bag on the train', 'As a pillow on the plane'] },
      long: { title: 'Five ways to wear it every day', items: ['As a hoodie on the street', 'As a backpack on the train', 'As a pillow on the plane', 'As a blanket at the park', 'As a rain cover for the dog'] },
      short: { title: 'Wear it', items: ['Hoodie', 'Bag', 'Pillow'] },
    },
    plan(f, v, st, cx) {
      const items = arr(f, 'items').slice(0, 5);
      const d = place(st, cx, 'center', (d) => {
        d.text('title', str(f, 'title'), { size: 88, weight: 800, font: 'h', lines: 2, min: 72, gap: 48 });
        d.part();
        // like the checklist: the rows grow with the type scale (items up to 72 px, numerals up to 144 px) and breathe, so three short items fill the slide
        // up to three items get the big treatment; four or five keep the compact rows so they still fit above a plane
        const few = items.length <= 3;
        const nw = v === 0 ? Math.max(few ? 140 : 120, S(few ? 150 : 120)) : Math.max(120, S(few ? 120 : 112));
        const tx = d.x0 + nw + 24;
        items.forEach((it, i) => {
          const m = measure(it, st.fonts.body, nearestWeight(st.fonts.body, 500), few ? 48 : 44, d.x0 + d.w - tx, 1.25);
          const h = Math.max(m.h + 2, S(few ? 128 : 112));
          const cy = d.y + h / 2;
          if (v === 1) d.circle(d.x0 + 56, cy, Math.min(56, h / 2), '$accent');
          d.text('body', String(i + 1), { x: d.x0, w: nw, size: v === 1 ? 56 : few ? 96 : 88, max: v === 1 ? 72 : 144, weight: 800, font: 'h', fill: v === 1 ? '$onAccent' : accentInk(st), align: v === 1 ? 'center' : 'left', lines: 1, min: 44, at: d.y, boxH: h });
          // the last two words stay together, so a wrapped item never leaves one word alone on its second line
          const glued = it.replace(/ (\S+)$/, ' $1');
          d.text('body', glued, { x: tx, w: d.x0 + d.w - tx, size: few ? 48 : 44, max: 72, lines: 2, min: 44, boxH: h });
          d.gap(few ? 40 : 24);
        });
      });
      return mk(d, { type: 'checklist', fitAs: 'numbered-list', slide: { type: 'checklist', headline: str(f, 'title') } });
    },
  },
  // 11 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'comparison', label: 'Comparison', shapes: ['contrast'], variants: ['side by side', 'stacked'],
    fields: [{ name: 'title', required: false, max: 40 }, { name: 'leftLabel', required: true, max: 14 }, { name: 'leftText', required: true, max: 50 }, { name: 'rightLabel', required: true, max: 14 }, { name: 'rightText', required: true, max: 50 }],
    samples: {
      normal: { title: 'Bag versus hoodie', leftLabel: 'Before', leftText: 'A heavy bag on one shoulder', rightLabel: 'After', rightText: 'One hoodie, hands free' },
      long: { title: 'Carrying a bag versus Quick Flip', leftLabel: 'Before', leftText: 'A heavy bag that pulls on one shoulder', rightLabel: 'After', rightText: 'One light hoodie that keeps both hands free' },
      short: { leftLabel: 'Old', leftText: 'Two things to carry', rightLabel: 'New', rightText: 'One thing to wear' },
    },
    plan(f, v, st, cx) {
      const pad = CARD_PAD + 12;
      const unequal = cx.weight === 'unequal';
      const body = (t: string, w: number, wt = 500) => measure(t, st.fonts.body, nearestWeight(st.fonts.body, wt), 52, w, 1.25);
      const d = place(st, cx, 'center', (d) => {
        if (str(f, 'title')) d.text('title', str(f, 'title'), { size: 96, weight: 800, font: 'h', lines: 2, min: 72, gap: 44 });
        d.part();
        // unequal weight: the second card is the loud one (accent plane, ink on it), the first is quiet
        const cols = [
          { label: str(f, 'leftLabel'), text: str(f, 'leftText'), lc: '$muted', tc: '$text', fill: '$surface', line: undefined as string | undefined },
          { label: str(f, 'rightLabel'), text: str(f, 'rightText'), lc: unequal ? '$onAccent' : accentInk(st), tc: unequal ? '$onAccent' : '$text', fill: unequal ? '$accent' : '$surface', line: unequal ? undefined : '$accent' },
        ];
        // the cards take most of the room that is left (taller cards, the words centred in them), not two small boxes in the middle
        const avail = d.by1 - d.y;
        if (v === 0) {
          const total = d.w - 24;
          const ws = unequal ? [Math.round(total * 0.38), total - Math.round(total * 0.38)] : [total / 2, total / 2];
          const lh = Math.max(...cols.map((c, i) => body(c.label, ws[i] - 2 * pad, 800).h)) + 2;
          const th = Math.max(...cols.map((c, i) => body(c.text, ws[i] - 2 * pad).h)) + 2;
          const ch0 = pad + lh + 16 + th + pad;
          const ch = Math.max(ch0, Math.round(avail * 0.84));
          const off = Math.floor((ch - ch0) / 2);
          cols.forEach((c, i) => {
            const x = d.x0 + (i ? ws[0] + 24 : 0);
            d.rect(x, d.y, ws[i], ch, c.fill, { rx: 28, ...(c.line ? { stroke: c.line, sw: 4 } : {}) });
            d.text('body', c.label, { x: x + pad, w: ws[i] - 2 * pad, size: 52, weight: 800, font: 'h', fill: c.lc, lines: 2, min: 44, at: d.y + off + pad });
            d.text('body', c.text, { x: x + pad, w: ws[i] - 2 * pad, size: 52, fill: c.tc, lines: 5, min: 44, at: d.y + off + pad + lh + 16 });
          });
          d.y += ch;
        } else {
          const iw = d.w - 2 * pad;
          const each = Math.round((avail - 28) * 0.47);
          cols.forEach((c, i) => {
            const lh = body(c.label, iw, 800).h + 2;
            const th = body(c.text, iw).h + 2;
            const ch0 = pad + lh + 12 + th + pad;
            const ch = Math.max(ch0, each);
            const off = Math.floor((ch - ch0) / 2);
            d.rect(d.x0, d.y, d.w, ch, c.fill, { rx: 28, ...(c.line ? { stroke: c.line, sw: 4 } : {}) });
            d.text('body', c.label, { x: d.x0 + pad, w: iw, size: 52, weight: 800, font: 'h', fill: c.lc, lines: 1, min: 44, at: d.y + off + pad });
            d.text('body', c.text, { x: d.x0 + pad, w: iw, size: 52, fill: c.tc, lines: 3, min: 44, at: d.y + off + pad + lh + 12 });
            d.y += ch + (i === 0 ? 28 : 0);
          });
        }
      });
      return mk(d, { type: 'checklist', fitAs: 'comparison', slide: { type: 'checklist', headline: str(f, 'title') } });
    },
  },
  // 12 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'quote', label: 'Quote', shapes: ['quote'], variants: ['left', 'centred'],
    fields: [{ name: 'quote', required: true, max: 120 }, { name: 'author', required: true, max: 40 }],
    samples: {
      normal: { quote: 'I stopped carrying a bag the day this arrived.', author: 'Maya R., early backer' },
      long: { quote: 'I stopped carrying a bag the day this arrived, and my shoulders finally thanked me for it.', author: 'Maya Rodriguez, early backer' },
      short: { quote: 'Best layer I own, by far.', author: 'Sam, backer' },
    },
    plan(f, v, st, cx) {
      const al = v === 0 ? 'left' : 'center';
      const d = place(st, cx, 'center', (d) => {
        // a large quote mark, the quote in heavy type, then the attribution under a short rule
        const qk = 2.4;
        quoteMark(d, v === 0 ? d.x0 : d.cx - 63 * qk, d.y, qk);
        d.y += 86 * qk;
        d.gap(36);
        d.text('title', str(f, 'quote'), { size: 100, weight: 700, font: 'h', lines: 6, min: 72, align: al, gap: 36, lh: 1.12 });
        d.part();
        d.rect(v === 0 ? d.x0 : d.cx - 40, d.y, 80, 8, '$accent', { rx: 4 });
        d.y += 28;
        d.text('body', '— ' + str(f, 'author'), { size: 44, fill: '$muted', align: al, lines: 2 });
      });
      return mk(d, { type: 'quote', fitAs: 'quote', slide: { type: 'quote', quote: str(f, 'quote'), author: '— ' + str(f, 'author') } });
    },
  },
  // 13 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'feature-slider', label: 'Feature slider', shapes: ['feature'], variants: ['slider', 'toggle'],
    fields: [{ name: 'title', required: true, max: 40 }, { name: 'body', required: true, max: 90 }, { name: 'position', required: false, max: 3, percent: true }],
    samples: {
      normal: { title: 'Slide and bite', body: 'Slide the zip, bite the clasp, and the hoodie locks into a backpack.' },
      long: { title: 'Slide and bite, then go', body: 'Slide the zip, bite the clasp, and the hoodie locks into a backpack that holds a laptop.' },
      short: { title: 'Slide it', body: 'Slide to lock.' },
    },
    plan(f, v, st, cx) {
      const pos = Math.max(0, Math.min(100, Number(str(f, 'position') || 70)));
      const d = place(st, cx, 'center', (d) => {
        d.text('title', str(f, 'title'), { size: 96, weight: 800, font: 'h', lines: 2, min: 72, gap: 80 });
        d.part();
        const y = d.y;
        const h = v === 0 ? sliderGraphic(d, y, pos) : toggleGraphic(d, d.x0, y);
        d.y = y + h + 80;
        d.text('body', str(f, 'body'), { size: 48, fill: '$muted', lines: 3 });
        d.underline();
      });
      return mk(d, { type: 'content', fitAs: 'feature-slider', slide: { type: 'content', headline: str(f, 'title'), body: str(f, 'body') } });
    },
  },
  // 14 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'cta-button', label: 'Call to action', shapes: ['ask'], variants: ['button bottom', 'button under headline'],
    fields: [{ name: 'headline', required: true, max: 60 }, { name: 'button', required: true, max: 20 }, { name: 'sub', required: false, max: 60 }],
    samples: {
      normal: { headline: 'Back Quick Flip today', button: 'Back it now', sub: 'Early backers save 30%.' },
      long: { headline: 'Back Quick Flip on Kickstarter today', button: 'Back the project', sub: 'Early backers save thirty percent this week.' },
      short: { headline: 'Join us today', button: 'Back it' },
    },
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const label = str(f, 'button');
      const al = v === 0 ? 'left' : 'center';
      const dense = cx.density === 'statement';
      const sub = dense ? '' : str(f, 'sub');
      const d = place(st, cx, 'center', (d) => {
        heroTitle(d, head, al, dense ? 232 : 150, 40);
        const subText = () => sub && d.text('body', sub, { size: 44, fill: '$muted', align: al, lines: 2, gap: v === 0 ? 56 : 0 });
        if (v === 0) subText();
        d.part();
        const bh = 168;
        const bw = v === 0 ? d.w : 640;
        const bx = v === 0 ? d.x0 : d.cx - bw / 2;
        const outline = !!st.deco?.outlinedButton;
        if (outline) d.rect(bx, d.y, bw, bh, 'none', { rx: bh / 2, stroke: '$text', sw: 5, noShadow: true });
        else d.rect(bx, d.y, bw, bh, '$accent', { rx: bh / 2 });
        d.text('kicker', label, { x: bx + 56, w: bw - 56 - 56 - 80, size: 52, max: 52, weight: 700, fill: outline ? '$text' : '$onAccent', lines: 1, min: 40, at: d.y + (bh - 66) / 2, boxH: 66, align: 'left' });
        arrow(d, bx + bw - 56 - 56, d.y + bh / 2, 56, outline ? '$text' : '$onAccent');
        d.y += bh;
        if (v === 1 && sub) {
          d.y += 56;
          subText();
        }
      });
      return mk(d, { type: 'closing', fitAs: 'cta-button', slide: withAccent({ type: 'closing', headline: head, kicker: label, sub }, head, f, st) });
    },
  },
  // 15 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'card-grid', label: 'Card grid', shapes: ['categories', 'benefits'], variants: ['2x2', 'stacked'],
    fields: [{ name: 'title', required: false, max: 36 }, { name: 'cardTitles', required: true, max: 18, list: { min: 3, max: 4 } }, { name: 'cardLines', required: true, max: 40, list: { min: 3, max: 4 } }],
    samples: {
      normal: { title: 'Built for everyday', cardTitles: ['Rain', 'Travel', 'Work', 'Play'], cardLines: ['Waterproof shell', 'Fits under a seat', 'Holds a laptop', 'Packs into a pocket'] },
      long: { title: 'Built for every kind of day', cardTitles: ['Rainy days', 'Long travel', 'Office work', 'Weekend play'], cardLines: ['A waterproof shell keeps you dry', 'Fits under any airplane seat', 'Holds a sixteen-inch laptop', 'Packs down into its own pocket'] },
      short: { cardTitles: ['Rain', 'Trip', 'Work'], cardLines: ['Dry', 'Light', 'Neat'] },
    },
    plan(f, v, st, cx) {
      const n = v === 1 ? 3 : Math.min(4, arr(f, 'cardTitles').length);
      const ts = arr(f, 'cardTitles').slice(0, n);
      const ls = arr(f, 'cardLines').slice(0, n);
      const pad = CARD_PAD;
      const bm = (t: string, w: number, wt: number) => measure(t, st.fonts.body, nearestWeight(st.fonts.body, wt), 44, w, 1.25);
      const d = place(st, cx, 'center', (d) => {
        if (str(f, 'title')) d.text('title', str(f, 'title'), { size: 84, weight: 800, font: 'h', lines: 2, min: 72, gap: 44 });
        d.part();
        const card = (x: number, w: number, i: number, y: number) => {
          const iw = w - 2 * pad;
          return { x, w, iw, th: bm(ts[i], iw, 800).h + 2, lh: bm(ls[i], iw, 500).h + 2, y };
        };
        type Card = ReturnType<typeof card>;
        // a row of cards shares the title height, so the titles and the lines of the row start at the same y
        const drawRow = (cs: Card[], idx: number[]) => {
          const th = Math.max(...cs.map((c) => c.th));
          const h = pad + th + 8 + Math.max(...cs.map((c) => c.lh)) + pad;
          cs.forEach((c, j) => {
            d.rect(c.x, c.y, c.w, h, '$surface', { rx: 28 });
            d.text('body', ts[idx[j]], { x: c.x + pad, w: c.iw, size: 44, weight: 800, font: 'h', lines: 2, min: 44, at: c.y + pad });
            d.text('body', ls[idx[j]], { x: c.x + pad, w: c.iw, size: 44, fill: '$muted', lines: 4, min: 44, at: c.y + pad + th + 8 });
          });
          d.y += h + 24;
        };
        if (v === 1) for (let i = 0; i < n; i++) drawRow([card(d.x0, d.w, i, d.y)], [i]);
        else {
          const cw = (d.w - 24) / 2;
          for (let row = 0; row * 2 < n; row++) {
            const idx = [row * 2, row * 2 + 1].filter((k) => k < n);
            const full = idx.length === 1;
            drawRow(idx.map((k, j) => card(full ? d.x0 : d.x0 + j * (cw + 24), full ? d.w : cw, k, d.y)), idx);
          }
        }
        d.y -= 24;
      });
      return mk(d, { type: 'checklist', fitAs: 'card-grid', slide: { type: 'checklist', headline: str(f, 'title') } });
    },
  },
  // 16 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'photo-led', label: 'Photo led', shapes: ['photo'], variants: ['headline under photo', 'headline above photo'],
    fields: [{ name: 'headline', required: true, max: 60 }, { name: 'kicker', required: false, max: 24 }],
    samples: {
      normal: { kicker: 'On the road', headline: 'Built on the road, for the road' },
      long: { kicker: 'On the road now', headline: 'Built on the road, tested in the rain, made for you' },
      short: { headline: 'On the road' },
    },
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      let photo = { x: cx.field.x0, y: 0, w: cx.field.w, h: 600 };
      const d = place(st, cx, 'center', (d) => {
        const title = () => d.text('title', head, { size: 96, weight: 800, font: 'h', lines: 3, min: 72, gap: 32 });
        const pic = () => {
          photo = { x: d.x0, y: d.y, w: d.w, h: 600 };
          d.y += 600 + 36;
        };
        if (str(f, 'kicker')) kickerOf(d, str(f, 'kicker'), 'left', 16);
        if (v === 0) {
          pic();
          title();
        } else {
          title();
          pic();
        }
      });
      return mk(d, { type: 'content', fitAs: 'photo-led', slide: { type: 'content', kicker: str(f, 'kicker'), headline: head }, photo });
    },
  },
  // 17 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'listicle-numeral', label: 'Listicle numeral', shapes: ['list', 'ranking', 'step'], variants: ['numeral left', 'numeral top'],
    fields: [{ name: 'numeral', required: true, max: 2, percent: true }, { name: 'title', required: true, max: 36 }, { name: 'body', required: false, max: 100 }],
    samples: {
      normal: { numeral: '3', title: 'Wear it as a pillow', body: 'Stuff the hood and sleeves, and the bag turns into a neck pillow.' },
      long: { numeral: '12', title: 'Wear it as a pillow on planes', body: 'Stuff the hood and both sleeves, and the whole bag turns into a soft neck pillow for the flight.' },
      short: { numeral: '1', title: 'Wear it every day', body: 'Hoodie first.' },
    },
    plan(f, v, st, cx) {
      const num = str(f, 'numeral');
      const nw = Math.ceil(measureWidth(num, st.fonts.headline, nearestWeight(st.fonts.headline, 800), 340)) + 8;
      const d = place(st, cx, 'center', (d) => {
        const y0 = d.y;
        const left = v === 0 ? d.x0 + nw + 36 : d.x0;
        const w = v === 0 ? d.w - nw - 36 : d.w;
        d.text('number', num, { x: d.x0, w: nw, size: 340, weight: 800, font: 'h', fill: accentInk(st), lines: 1, min: 200, at: y0 });
        if (v === 1) d.y = y0 + 340 * 1.05 + 8;
        d.text('title', str(f, 'title'), { x: left, w, size: 76, weight: 800, font: 'h', lines: 4, min: 72, gap: 24 });
        if (str(f, 'body')) d.text('body', str(f, 'body'), { x: left, w, size: 44, fill: '$muted', lines: 6 });
        d.y = Math.max(d.y, y0 + 340 * 1.05 + 2);
      });
      return mk(d, { type: 'step', fitAs: 'listicle-numeral', slide: { type: 'step', number: Number(num) || 1, headline: str(f, 'title'), body: str(f, 'body') }, bleedLeft: Math.max(0, Math.round(0.12 * nw)), glyphW: nw });
    },
  },
  // 18 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'stat-grid', label: 'Stat grid', shapes: ['metric', 'number'], variants: ['hero left', 'hero top'],
    fields: [{ name: 'title', required: false, max: 36 }, { name: 'numbers', required: true, max: 9, list: { min: 3, max: 4 } }, { name: 'labels', required: true, max: 24, list: { min: 3, max: 4 } }],
    samples: {
      normal: { title: 'Quick Flip in numbers', numbers: ['10 sec', '1.2 kg', '16 in', '30%'], labels: ['to flip', 'total weight', 'laptop fits', 'early discount'] },
      long: { title: 'Quick Flip in numbers, at launch', numbers: ['10 sec', '1.25 kg', '16 inch', '30% off'], labels: ['to flip it over', 'total weight', 'laptop pocket', 'early backer deal'] },
      short: { numbers: ['10s', '1 kg', '16"'], labels: ['to flip', 'light', 'laptop'] },
    },
    plan(f, v, st, cx) {
      const ns = arr(f, 'numbers');
      const ls = arr(f, 'labels');
      const k = Math.min(ns.length, ls.length);
      const pad = CARD_PAD;
      const bm = (t: string, size: number, w: number, wt = 500) => measure(t, st.fonts.body, nearestWeight(st.fonts.body, wt), size, w, 1.1);
      const fitNum = (t: string, w: number, size: number) => {
        let s2 = size;
        while (s2 > 60 && measureWidth(t, st.fonts.headline, nearestWeight(st.fonts.headline, 800), s2) > w) s2 -= 4;
        return s2;
      };
      const d = place(st, cx, 'center', (d) => {
        if (str(f, 'title')) d.text('title', str(f, 'title'), { size: 84, weight: 800, font: 'h', lines: 2, min: 72, gap: 44 });
        d.part();
        const cell = (i: number, x: number, y: number, w: number, hero: boolean, h?: number) => {
          const iw = w - 2 * pad;
          const ns0 = fitNum(ns[i], iw, hero ? 144 : 64);
          const nh = bm(ns[i], ns0, iw, 800).h + 2;
          const lhh = bm(ls[i], 44, iw).h + 2;
          const ch = Math.max(h ?? 0, pad + nh + 8 + lhh + pad);
          d.rect(x, y, w, ch, hero ? '$accent' : '$surface', { rx: 28 });
          d.text('body', ns[i], { x: x + pad, w: iw, size: ns0, weight: 800, font: 'h', fill: hero ? '$onAccent' : '$text', lines: 1, min: 60, at: y + pad });
          d.text('body', ls[i], { x: x + pad, w: iw, size: 44, fill: hero ? '$onAccent' : '$muted', lines: 3, min: 44, at: y + pad + nh + 8 });
          return ch;
        };
        const need = (i: number, w: number, hero: boolean) => pad * 2 + bm(ns[i], fitNum(ns[i], w - 2 * pad, hero ? 144 : 64), w - 2 * pad, 800).h + 10 + bm(ls[i], 44, w - 2 * pad).h;
        if (v === 0) {
          const hw = Math.round((d.w - 24) * 0.44);
          const sw = d.w - 24 - hw;
          const smalls = Array.from({ length: k - 1 }, (_, j) => need(j + 1, sw, false));
          const stackH = smalls.reduce((a, b) => a + b, 0) + 24 * (k - 2);
          const hh = Math.max(stackH, need(0, hw, true));
          cell(0, d.x0, d.y, hw, true, hh);
          let y = d.y;
          const extra = (hh - stackH) / (k - 1);
          for (let j = 1; j < k; j++) y += cell(j, d.x0 + hw + 24, y, sw, false, smalls[j - 1] + extra) + 24;
          d.y += hh;
        } else {
          const hh = cell(0, d.x0, d.y, d.w, true);
          d.y += hh + 24;
          const sw = (d.w - 24 * (k - 2)) / (k - 1);
          const hs = Math.max(...Array.from({ length: k - 1 }, (_, j) => need(j + 1, sw, false)));
          for (let j = 1; j < k; j++) cell(j, d.x0 + (j - 1) * (sw + 24), d.y, sw, false, hs);
          d.y += hs;
        }
      });
      return mk(d, { type: 'checklist', fitAs: 'stat-grid', slide: { type: 'checklist', headline: str(f, 'title') } });
    },
  },
  // 19 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'timeline', label: 'Timeline', shapes: ['history', 'process'], variants: ['label beside', 'label above'],
    fields: [{ name: 'title', required: true, max: 36 }, { name: 'labels', required: true, max: 12, list: { min: 3, max: 5 } }, { name: 'events', required: true, max: 34, list: { min: 3, max: 5 } }],
    samples: {
      normal: { title: 'How we got here', labels: ['2023', '2024', '2025', 'Today'], events: ['A sketch on a napkin', 'First prototype sewn', 'Rain tested in Oslo', 'Live on Kickstarter'] },
      long: { title: 'How we got here, step by step', labels: ['Spring 23', 'Autumn 23', 'Winter 24', 'Summer 25', 'This week'], events: ['A first sketch on a napkin', 'First prototype sewn by hand', 'Rain tested all winter in Oslo', 'A factory partner signed on', 'Live on Kickstarter today'] },
      short: { title: 'Our path', labels: ['2024', '2025', 'Now'], events: ['Idea', 'Prototype', 'Launch day'] },
    },
    plan(f, v, st, cx) {
      const ls = arr(f, 'labels');
      const es = arr(f, 'events');
      const n = Math.min(ls.length, es.length);
      const pad = CARD_PAD;
      const bm = (t: string, w: number, wt = 500) => measure(t, st.fonts.body, nearestWeight(st.fonts.body, wt), 44, w, 1.25);
      const d = place(st, cx, 'center', (d) => {
        d.text('title', str(f, 'title'), { size: 76, weight: 800, font: 'h', lines: 2, min: 72, gap: 36 });
        d.part();
        const lw = v === 0 ? 230 : 0;
        const lineX = d.x0 + pad + (v === 0 ? lw + 18 : 14);
        const tx = lineX + 14 + 30;
        const tw = d.x0 + d.w - pad - tx;
        const rows: { cy: number; last: boolean }[] = [];
        for (let i = 0; i < n; i++) {
          const last = i === n - 1;
          const lh = bm(ls[i], v === 0 ? lw : tw, 800).h + 2;
          const th = bm(es[i], tw).h + 2;
          const h = v === 0 ? Math.max(lh, th) : lh + 4 + th;
          const top = d.y + (last ? pad : 0);
          const ink = last ? '$onAccent' : '$text';
          if (last) d.rect(d.x0, d.y, d.w, h + 2 * pad, '$accent', { rx: 28 });
          d.text('body', ls[i], { x: v === 0 ? d.x0 + pad : tx, w: v === 0 ? lw : tw, size: 44, weight: 800, font: 'h', fill: last ? ink : accentInk(st), lines: 1, min: 44, at: top });
          d.text('body', es[i], { x: tx, w: tw, size: 44, fill: ink, lines: 3, min: 44, at: v === 0 ? top : top + lh + 4 });
          rows.push({ cy: top + 28, last });
          d.y += h + (last ? 2 * pad : 0) + 14;
        }
        d.y -= 14;
        if (n >= 2) d.rect(lineX - 2, rows[0].cy, 4, rows[n - 1].cy - rows[0].cy, '$muted');
        rows.forEach((r) => d.circle(lineX, r.cy, 14, r.last ? '$onAccent' : '$accent'));
      });
      return mk(d, { type: 'checklist', fitAs: 'timeline', slide: { type: 'checklist', headline: str(f, 'title') } });
    },
  },
  // 20 -----------------------------------------------------------------------------------------------------------------------------
  {
    id: 'spotlight', label: 'Spotlight', shapes: ['product', 'feature'], variants: ['callouts below', 'callouts beside'],
    fields: [{ name: 'subject', required: true, max: 24 }, { name: 'callouts', required: true, max: 32, list: { min: 3, max: 3 } }],
    samples: {
      normal: { subject: 'Quick Flip hoodie', callouts: ['Hidden zip pocket', 'Padded laptop sleeve', 'Waterproof shell'] },
      long: { subject: 'The Quick Flip hoodie', callouts: ['A hidden zip chest pocket', 'A padded laptop sleeve', 'A waterproof outer shell'] },
      short: { subject: 'The hoodie', callouts: ['Pocket', 'Sleeve', 'Shell'] },
    },
    plan(f, v, st, cx) {
      const cs = arr(f, 'callouts').slice(0, 3);
      const pad = CARD_PAD;
      const bm = (t: string, size: number, w: number, wt = 500) => measure(t, st.fonts.body, nearestWeight(st.fonts.body, wt), size, w, 1.25);
      const d = place(st, cx, 'center', (d) => {
        // A hero card for the subject (an accent card, the subject set big in its ink, a short accent rule under it) and three numbered callouts, all on the type scale: the card and the
        // rows grow with the text until the block fills the free area. Callouts are body text (44 px and up, 48 and up when the scale allows).
        const plateW = v === 0 ? d.w : Math.round(d.w * 0.5);
        const rx = v === 0 ? d.x0 : d.x0 + plateW + 28;
        const rw = v === 0 ? d.w : d.w - plateW - 28;
        const badge = S(38);
        const tx = rx + 120 + 16; // the number's text slot is 120 px wide (the engine's narrowest), centred on the badge
        const tw = rw - (tx - rx);
        const hs = cs.map((c) => Math.max(bm(c, 56, tw).h + 2, S(112)));
        const rowGap = S(30);
        const listH = hs.reduce((a, b) => a + b, 0) + rowGap * (cs.length - 1);
        const plateH = v === 0 ? S(400) : Math.max(S(560), listH);
        const y0 = d.y;
        d.rect(d.x0, y0, plateW, plateH, '$accent', { rx: 40 });
        d.text('title', str(f, 'subject'), { x: d.x0 + pad, w: plateW - 2 * pad, size: 100, max: 150, weight: 800, font: 'h', fill: '$onAccent', align: 'center', lines: 3, min: 72, at: y0 + S(24), boxH: plateH - S(24) - S(70) });
        d.rect(d.x0 + plateW / 2 - 70, y0 + plateH - S(54), 140, 10, '$onAccent', { rx: 5 });
        let y = v === 0 ? y0 + plateH + S(56) : y0 + (plateH - listH) / 2;
        cs.forEach((c, i) => {
          d.circle(rx + 60, y + hs[i] / 2, badge, '$accent');
          d.text('body', String(i + 1), { x: rx, w: 120, size: 52, max: 72, weight: 800, font: 'h', fill: '$onAccent', align: 'center', lines: 1, min: 44, at: y, boxH: hs[i] });
          d.text('body', c, { x: tx, w: tw, size: 56, max: 72, lines: 3, min: 44, at: y, boxH: hs[i] });
          y += hs[i] + rowGap;
        });
        d.y = v === 0 ? y - rowGap : y0 + plateH;
      });
      return mk(d, { type: 'checklist', fitAs: 'spotlight', slide: { type: 'checklist', headline: str(f, 'subject') } });
    },
  },
];

export const LAYOUTS_BY_ID = Object.fromEntries(LAYOUT_LIST.map((l) => [l.id, l])) as Record<LayoutId, LayoutDef>;
export const LAYOUT_IDS = LAYOUT_LIST.map((l) => l.id) as LayoutId[];
export const layoutDef = (id: string): LayoutDef | undefined => LAYOUTS_BY_ID[id as LayoutId];
export type { Slot };

// The cuts each layout supports (plain always). Hero layouts keep the engine's full-width headline, so they have no side plane.
const ALL: Cut[] = ['plain', 'edge-h', 'edge-v', 'angle', 'curve'];
const HERO: Cut[] = ['plain', 'edge-h', 'angle', 'curve'];
const NOSIDE: Cut[] = ['plain', 'edge-h', 'angle', 'curve'];
const CUTS: Partial<Record<LayoutId, Cut[]>> = { checklist: NOSIDE, statement: HERO, 'lead-statement': HERO, 'big-question': HERO, 'split-text': HERO, 'cta-button': HERO, stepper: NOSIDE, 'step-numeral': NOSIDE, comparison: NOSIDE, 'listicle-numeral': NOSIDE, 'stat-grid': NOSIDE, spotlight: NOSIDE, 'card-grid': NOSIDE, timeline: NOSIDE, 'photo-led': ['plain'] };
LAYOUT_LIST.forEach((l) => (l.cuts = CUTS[l.id] ?? ALL));
export const cutsOf = (id: string): Cut[] => layoutDef(id)?.cuts ?? ['plain'];
