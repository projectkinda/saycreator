// More layouts for the library (Round C), taken from the inventory of the 8 style packs (out/layouts-inventory/inventory.md): prose, four statement forms, contact-closing,
// cta-pair, numbered-stagger, bullet-list, pill-stagger and headline-card. Each is drawn from the style tokens like the first 20; the registry (library.ts) lists them, so the
// layout gallery, the picker, the writer menu and the tests pick them up with no per-layout code. Shapes are our own (no pictures); every text is at its role minimum or above.
import { measureWidth } from '../../image-engine/draw/text';
import { star } from './devices';
import { CARD_PAD, measure, nearestWeight, S, arrow, type Draw } from './draw';
import { arr, kickerOf, layoutDef, mk, place, str, withAccent } from './library';
import type { LayoutDef, LayoutStyle } from './types';

/** The size a text is really drawn at: its planned size on the type scale, up to its own largest size. */
const eff = (size: number, max: number) => Math.min(max, S(size));
const bw = (st: LayoutStyle, wt = 500) => nearestWeight(st.fonts.body, wt);
const hw = (st: LayoutStyle, wt = 800) => nearestWeight(st.fonts.headline, wt);
/** The widest single word of a text at a size (headline font): a stacked display needs the biggest size at which it still fits the width. */
const widest = (st: LayoutStyle, text: string, size: number) => Math.max(...text.split(/\s+/).filter(Boolean).map((w) => measureWidth(w, st.fonts.headline, hw(st), size)));

/** A checklist-type slide: the headline and the texts of every body slot in reading order (the engine fills each row from them). */
const rowsSlide = (d: Draw, headline: string): Record<string, unknown> => ({ type: 'checklist', ...(headline ? { headline } : {}), items: [...d.slots].filter((s) => s.role === 'body').sort((a, b) => a.y - b.y || a.x - b.x).map((s) => s.text) });

export const MORE_LAYOUTS: LayoutDef[] = [
  // prose ---------------------------------------------------------------------------------------------------------------------------
  {
    id: 'prose', label: 'Prose', shapes: ['explainer', 'story'], variants: ['regular text', 'large text'],
    fields: [
      { name: 'p1', required: true, max: 300 },
      { name: 'heading', required: false, max: 60 },
      { name: 'num', required: false, max: 1, percent: true, note: 'a number 1-9: the heading reads "1. Heading"' },
      { name: 'p2', required: false, max: 300 },
      { name: 'p3', required: false, max: 260 },
      { name: 'pull', required: false, max: 110, note: 'one bold line' },
      { name: 'bullets', required: false, max: 80, list: { min: 2, max: 4 } },
    ],
    samples: {
      normal: { heading: 'Why we built it', p1: 'We sewed a bag into the hood, so one layer does both jobs. It took two years of testing in the rain.', p2: 'Today it flips from hoodie to backpack in ten seconds.', pull: 'One layer. Two jobs.' },
      long: { heading: 'Why we decided to build it ourselves', num: '2', p1: 'We sewed a waterproof bag into the hood and tested it for two years on trains, planes and rainy streets, so one layer does both jobs and nothing rattles around in your bag.', p2: 'Early backers told us the flip was the part they loved most, so we kept it to one zip and ten seconds.', p3: 'The shell is machine washable at thirty degrees and every seam is taped.', pull: 'Built to be worn all day, flipped in ten seconds.' },
      short: { heading: 'The idea', p1: 'One hoodie that turns into a backpack. No more carrying two things.' },
    },
    plan(f, v, st, cx) {
      const head = str(f, 'heading');
      const num = str(f, 'num');
      const paras = ['p1', 'p2', 'p3'].map((k) => str(f, k)).filter(Boolean);
      const pull = str(f, 'pull');
      const bullets = arr(f, 'bullets').slice(0, 4);
      const big = v === 1;
      const rows = paras.length + bullets.length + (pull ? 1 : 0);
      // the base size: the biggest body size at which all the text fits 90% of the free height (tried in steps of 2 px, so the text takes the room it has) (short text starts big and the type scale takes it further; long text starts small)
      const fh = cx.field.y1 - cx.field.y0;
      const fits = (sz: number) => {
        const para = paras.reduce((a, p) => a + measure(p, st.fonts.body, bw(st), sz, cx.field.w, 1.3).h, 0) + 40 * Math.max(0, paras.length - 1);
        const bul = bullets.reduce((a, b) => a + Math.max(measure(b, st.fonts.body, bw(st), sz, cx.field.w - 56, 1.25).h, 60) + 20, 0);
        const pl = pull ? measure(pull, st.fonts.headline, hw(st), sz + 4, cx.field.w, 1.2).h + 40 : 0;
        const hd = head ? 2 * 100 + 52 : 0;
        return para + bul + pl + hd <= 0.9 * fh;
      };
      const ts = big ? 96 : 88; // the heading's base size; the body base stays at most 70% of it, so the heading is the largest text on the slide
      const sizes = Array.from({ length: 31 }, (_, i) => (big ? 104 : 96) - 2 * i); // 104 (or 96) down to 44
      const bs = (sizes.filter((z) => !head || z <= Math.floor(ts * 0.7)).find((z) => z >= 44 && fits(z))) ?? 44;
      const lo = bs >= 48 ? 48 : 44; // the body is at least 48 px whenever it fits at 48 (the fit step may not shrink it below)
      const d = place(st, cx, 'center', (d) => {
        if (head) d.text('title', num ? `${num}. ${head}` : head, { size: ts, max: big ? 150 : 200, weight: 800, font: 'h', lines: 3, min: 72, gap: 52 });
        paras.forEach((p, i) => d.text('body', p, { size: bs, max: big ? 150 : 140, lines: 9, min: lo, lh: 1.3, gap: i < paras.length - 1 || bullets.length || pull ? 40 : 0 }));
        bullets.forEach((b, i) => {
          const m = measure(b, st.fonts.body, bw(st), eff(bs, 72), d.w - S(56), 1.25);
          const h = Math.max(m.h + 2, S(60));
          d.circle(d.x0 + S(12), d.y + h / 2, S(9), '$accent');
          d.text('body', b, { x: d.x0 + S(56), w: d.w - S(56), size: bs, max: 100, lines: 3, min: lo, boxH: h, gap: i < bullets.length - 1 || pull ? 20 : 0 });
        });
        if (pull) d.text('body', pull, { size: bs + 4, max: 120, weight: 800, font: 'h', lines: 3, min: lo, lh: 1.2 });
      });
      const items = rows >= 1 ? [...paras, ...bullets, ...(pull ? [pull] : [])] : [];
      // one text block alone is a plain content slide; several blocks are rows (like a checklist's)
      if (rows <= 1) return mk(d, { type: 'content', fitAs: 'prose', slide: { type: 'content', ...(head ? { headline: num ? `${num}. ${head}` : head } : {}), body: paras[0] ?? '' } });
      return mk(d, { type: 'checklist', fitAs: 'prose', slide: { type: 'checklist', ...(head ? { headline: num ? `${num}. ${head}` : head } : {}), items } });
    },
  },
  // statement-stacked ---------------------------------------------------------------------------------------------------------------
  {
    id: 'statement-stacked', label: 'Stacked display', shapes: ['claim', 'hook'], variants: ['left', 'centred'],
    fields: [{ name: 'headline', required: true, max: 36, maxWords: 4 }, { name: 'caption', required: false, max: 90 }],
    samples: {
      normal: { headline: 'Flip it, wear it', caption: 'One hoodie that turns into a backpack in ten seconds.' },
      long: { headline: 'Pack less, go more', caption: 'One piece of clothing, two jobs, and zero bags to carry on the train.' },
      short: { headline: 'Meet Quick Flip' },
    },
    plan(f, v, st, cx) {
      const al = v === 0 ? 'left' : 'center';
      const head = str(f, 'headline');
      const cap = cx.density === 'statement' ? '' : str(f, 'caption');
      const ws = head.split(/\s+/).filter(Boolean);
      const d = place(st, cx, 'center', (d) => {
        // one word per line: the slot is as wide as the widest word at the biggest size that fits, so the lines cannot take a second word
        let sz = 280;
        const fh = cx.field.y1 - cx.field.y0;
        while (sz > 120 && (widest(st, head, sz) > d.w * 0.98 || ws.length * sz * 0.95 > fh * (cap ? 0.7 : 0.82))) sz -= 6;
        const stacked = sz >= 160 && ws.length >= 2;
        const w = stacked ? Math.min(d.w, Math.ceil(widest(st, head, sz) * 1.04)) : d.w;
        d.text('title', head, { x: al === 'center' ? d.cx - w / 2 : d.x0, w, size: stacked ? sz : 150, max: stacked ? sz : 150, weight: 800, font: 'h', lines: Math.max(ws.length, 1), min: 72, align: al, lh: 0.95, gap: cap ? 56 : 0 });
        if (cap) d.text('body', cap, { size: 48, max: 56, fill: '$muted', align: al, lines: 3, min: 44 });
      });
      return mk(d, { type: 'cover', fitAs: 'statement', slide: withAccent({ type: 'cover', headline: head, sub: cap }, head, f, st) });
    },
  },
  // statement-card ------------------------------------------------------------------------------------------------------------------
  {
    id: 'statement-card', label: 'Statement on a card', shapes: ['claim', 'hook'], variants: ['surface card', 'accent card'],
    fields: [{ name: 'headline', required: true, max: 70 }, { name: 'kicker', required: false, max: 24 }, { name: 'caption', required: false, max: 60 }],
    samples: {
      normal: { kicker: 'New this week', headline: 'Your bag is now your hoodie', caption: 'Zip, flip, go.' },
      long: { kicker: 'New this week', headline: 'The hoodie that carries your laptop, your lunch and your umbrella', caption: 'Zip it, flip it, and go.' },
      short: { headline: 'Meet Quick Flip' },
    },
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const kick = str(f, 'kicker');
      const cap = cx.density === 'statement' ? '' : str(f, 'caption');
      const inkT = v === 1 ? '$onAccent' : '$text';
      const inkM = v === 1 ? '$onAccent' : '$muted';
      // The card is planned around its text, at fixed sizes (no type scale: the scale would grow the text past the card): the headline takes the biggest size at which the
      // kicker, the headline and the caption sit inside the card with 72 px of padding on every side and the card stays inside the free field.
      const fh = cx.field.y1 - cx.field.y0;
      const pad = 72;
      const padX = 100; // the engine may widen a text box by up to ~40 px: the sides keep more room than the top and bottom
      const w = cx.field.w - 2 * padX;
      const kH = kick ? Math.ceil(48 * 1.25) + 24 : 0;
      const slack = cap ? 44 : 0; // the engine may make a small caption box a little taller: that room stays inside the card
      const capBox = Math.ceil(44 * 1.3) * Math.min(2, measure(cap || 'x', st.fonts.body, bw(st), 44, w, 1.3).n) + 16; // a roomy box: the engine does not need to make it taller
      const capH = cap ? 36 + capBox : 0;
      const sizes = [150, 138, 126, 114, 102, 92, 84, 76, 72];
      const sz = sizes.find((z) => { const m = measure(head, st.fonts.headline, hw(st), z, w, 1.05); return m.n <= 5 && kH + m.h + 2 + capH + slack + 2 * pad <= fh - 24; }) ?? 72;
      const tm = measure(head, st.fonts.headline, hw(st), sz, w, 1.05);
      const blockH = kH + Math.ceil(tm.h) + 2 + capH;
      const ph = Math.min(fh - 24, Math.max(blockH + slack + 2 * pad, Math.round(fh * 0.7)));
      const d = place(st, cx, 'center', (d) => {
        const y0 = d.y;
        d.rect(d.x0, y0, d.w, ph, v === 1 ? '$accent' : '$surface', { rx: 56 });
        let yy = y0 + (ph - blockH - slack) / 2;
        const x = d.x0 + padX;
        if (kick) { d.text('kicker', kick, { x, w, size: 48, max: 48, weight: 600, fill: inkM, align: 'center', lines: 1, min: 48, at: yy }); yy += kH; }
        d.text('title', head, { x, w, size: sz, max: sz, weight: 800, font: 'h', fill: inkT, align: 'center', lines: 5, min: 72, lh: 1.05, at: yy });
        yy += Math.ceil(tm.h) + 2;
        if (cap) d.text('body', cap, { x, w, size: 44, max: 44, fill: inkM, align: 'center', lines: 2, min: 44, at: yy + 36, boxH: capBox });
        d.y = y0 + ph;
      });
      // an accent colour on an accent card would vanish: the card variant in the accent colour keeps the headline plain. A content slide (not a cover): a cover would be set across the whole width.
      // Round B: `accent: []` is explicit: without it the builder puts the writer's accent phrase back from the fields, and on a light ground the accent card is the accent colour, so the phrase
      // was set in the card's own colour (1.0:1, an invisible word)
      const slide = { type: 'content', kicker: kick, headline: head, body: cap };
      return mk(d, { type: 'content', fitAs: 'statement-card', noBalance: true, slide: v === 1 ? { ...slide, accent: [] } : withAccent(slide, head, f, st) });
    },
  },
  // statement-pill ------------------------------------------------------------------------------------------------------------------
  {
    id: 'statement-pill', label: 'Statement with a pill', shapes: ['claim', 'hook'], variants: ['pill below, centred', 'pill below, left'],
    fields: [{ name: 'headline', required: true, max: 60 }, { name: 'kicker', required: false, max: 24 }, { name: 'caption', required: true, max: 40 }],
    samples: {
      normal: { kicker: 'New on Kickstarter', headline: 'A hoodie that flips into a backpack', caption: 'Back it before Friday' },
      long: { kicker: 'New on Kickstarter now', headline: 'A hoodie that flips into a backpack in ten seconds flat', caption: 'Early backers save thirty percent' },
      short: { headline: 'Meet Quick Flip', caption: 'Back it now' },
    },
    plan(f, v, st, cx) {
      const al = v === 0 ? 'center' : 'left';
      const head = str(f, 'headline');
      const cap = str(f, 'caption');
      const d = place(st, cx, 'center', (d) => {
        kickerOf(d, str(f, 'kicker'), al, 32);
        d.text('title', head, { size: 130, max: 220, weight: 800, font: 'h', lines: 4, min: 72, align: al, lh: 1.02, gap: 56 });
        const fs = eff(48, 56);
        const th = Math.ceil(fs * 1.25) + 2;
        const ph = th + 2 * CARD_PAD;
        const pw = Math.min(d.w, Math.max(Math.round(measureWidth(cap, st.fonts.headline, hw(st, 700), fs) + 2 * CARD_PAD + 28), 380));
        const px = al === 'center' ? d.cx - pw / 2 : d.x0;
        d.rect(px, d.y, pw, ph, '$text', { rx: ph / 2 });
        d.text('body', cap, { x: px + CARD_PAD, w: pw - 2 * CARD_PAD, size: 48, max: 56, weight: 700, font: 'h', fill: '$bg', align: 'center', lines: 1, min: 44, at: d.y + CARD_PAD, boxH: th });
        d.y += ph;
      });
      return mk(d, { type: 'cover', fitAs: 'statement', slide: withAccent({ type: 'cover', kicker: str(f, 'kicker'), headline: head, sub: cap }, head, f, st) });
    },
  },
  // statement-question --------------------------------------------------------------------------------------------------------------
  {
    id: 'statement-question', label: 'Question under a rule', shapes: ['question', 'hook'], variants: ['left', 'centred'],
    fields: [{ name: 'question', required: true, max: 100 }, { name: 'line', required: false, max: 70 }],
    samples: {
      normal: { question: 'What if your hoodie was also your bag?', line: 'Keep reading to see how.' },
      long: { question: 'What if the hoodie you already wear could also carry your laptop, your lunch and your umbrella?', line: 'Keep reading to see exactly how it works.' },
      short: { question: 'Why carry two?' },
    },
    plan(f, v, st, cx) {
      const al = v === 0 ? 'left' : 'center';
      const q = str(f, 'question');
      const line = cx.density === 'statement' ? '' : str(f, 'line');
      const d = place(st, cx, 'center', (d) => {
        d.rect(d.x0, d.y, d.w, 4, '$muted', { opacity: 0.6 });
        d.gap(64);
        d.text('title', q, { size: 96, max: 220, weight: 500, font: 'h', lines: 6, min: 72, align: al, lh: 1.12, gap: line ? 48 : 0 });
        if (line) d.text('body', line, { size: 48, max: 60, fill: '$muted', align: al, lines: 2, min: 44 });
      });
      return mk(d, { type: 'content', fitAs: 'statement-question', slide: withAccent({ type: 'content', headline: q, body: line }, q, f, st) });
    },
  },
  // contact-closing -----------------------------------------------------------------------------------------------------------------
  {
    id: 'contact-closing', label: 'Contact closing', shapes: ['ask'], variants: ['with a button', 'with a line'],
    fields: [{ name: 'headline', required: true, max: 50 }, { name: 'contacts', required: true, max: 36, list: { min: 2, max: 4 } }, { name: 'brand', required: false, max: 20 }, { name: 'line', required: false, max: 70 }, { name: 'button', required: false, max: 20 }],
    samples: {
      normal: { brand: 'Quick Flip', headline: 'Back Quick Flip today', line: 'Early backers save 30%.', button: 'Back it now', contacts: ['@quickflip', 'quickflip.com', 'hello@quickflip.com'] },
      long: { brand: 'Quick Flip Studio', headline: 'Back Quick Flip on Kickstarter today', line: 'Early backers save thirty percent this week.', button: 'Back the project', contacts: ['@quickflip.studio', 'quickflip.com/backers', '+1 123 456 7890', 'hello@quickflip.com'] },
      short: { headline: 'Say hello', contacts: ['@quickflip', 'quickflip.com'] },
    },
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const brand = str(f, 'brand');
      const line = str(f, 'line');
      const button = v === 0 ? str(f, 'button') : '';
      const contacts = arr(f, 'contacts').slice(0, 4);
      const d = place(st, cx, 'center', (d) => {
        if (brand) {
          d.shape(star(d.x0 + S(20), d.y + S(24), S(20), '$accent'), { y0: d.y, y1: d.y + S(48) });
          d.text('body', brand, { x: d.x0 + S(56), w: d.w - S(56), size: 48, max: 52, weight: 700, font: 'h', lines: 1, min: 44, at: d.y, boxH: S(48), gap: 0 });
          d.y += S(48);
          d.gap(36);
        }
        d.text('title', head, { size: 100, max: 200, weight: 800, font: 'h', lines: 3, min: 72, lh: 1.05, gap: 32 });
        if (line) d.text('body', line, { size: 48, max: 60, fill: '$muted', lines: 2, min: 44, gap: 36 });
        if (button) {
          const fs = eff(48, 52);
          const th = Math.ceil(fs * 1.25) + 2;
          const bh = th + 2 * CARD_PAD;
          // the label on the left and the arrow at the far right, the same padding at both ends (layouts/buttons.ts): a wide pill, like the call-to-action button
          const bwid = Math.min(d.w, Math.max(measureWidth(button, st.fonts.headline, hw(st, 700), fs) + 2 * CARD_PAD + 52 + 28, 640));
          d.rect(d.x0, d.y, bwid, bh, '$accent', { rx: bh / 2 });
          d.text('body', button, { x: d.x0 + CARD_PAD, w: bwid - 2 * CARD_PAD - 52, size: 48, max: 52, weight: 700, font: 'h', fill: '$onAccent', lines: 1, min: 44, at: d.y + CARD_PAD, boxH: th });
          arrow(d, d.x0 + bwid - CARD_PAD - 36, d.y + bh / 2, 36);
          d.y += bh;
          d.gap(48);
        } else if (line) d.gap(0);
        contacts.forEach((c, i) => {
          const h = S(64);
          const cy = d.y + h / 2;
          d.circle(d.x0 + S(16), cy, S(14), 'none', { stroke: '$muted', sw: 4 });
          d.circle(d.x0 + S(16), cy, S(5), '$muted');
          d.text('body', c, { x: d.x0 + S(56), w: d.w - S(56), size: 44, max: 56, lines: 1, min: 44, boxH: h, gap: i < contacts.length - 1 ? 14 : 0 });
        });
      });
      return mk(d, { type: 'checklist', fitAs: 'contact-closing', slide: rowsSlide(d, head) });
    },
  },
  // cta-pair ------------------------------------------------------------------------------------------------------------------------
  {
    id: 'cta-pair', label: 'Two actions', shapes: ['ask'], variants: ['centred', 'left'],
    fields: [{ name: 'headline', required: true, max: 60 }, { name: 'button1', required: true, max: 20 }, { name: 'button2', required: true, max: 20 }, { name: 'line1', required: false, max: 60 }, { name: 'line2', required: false, max: 60 }, { name: 'link', required: false, max: 40 }],
    samples: {
      normal: { headline: 'Two ways to join', button1: 'Back it now', line1: 'Early backers save 30%.', button2: 'See how it works', line2: 'Watch the ten-second flip.', link: 'quickflip.com/demo' },
      long: { headline: 'Two easy ways to join the Quick Flip launch', button1: 'Back the project', line1: 'Early backers save thirty percent this week.', button2: 'Watch the demo', line2: 'See the ten-second flip in action.', link: 'quickflip.com/demo' },
      short: { headline: 'Join us', button1: 'Back it', button2: 'Learn more' },
    },
    plan(f, v, st, cx) {
      const al = v === 0 ? 'center' : 'left';
      const head = str(f, 'headline');
      const d = place(st, cx, 'center', (d) => {
        d.text('title', head, { size: 88, max: 140, weight: 800, font: 'h', lines: 2, min: 72, align: al, lh: 1.05, gap: 48 });
        const block = (label: string, line: string, filled: boolean, link?: string) => {
          const fs = eff(48, 52);
          const th = Math.ceil(fs * 1.25) + 2;
          const bh = th + 2 * CARD_PAD;
          const bwid = Math.min(d.w, Math.max(measureWidth(label, st.fonts.headline, hw(st, 700), fs) + 2 * CARD_PAD + (filled ? 52 : 0) + 28, filled ? 640 : 420));
          const bx = al === 'center' ? d.cx - bwid / 2 : d.x0;
          if (filled) d.rect(bx, d.y, bwid, bh, '$accent', { rx: bh / 2 });
          else d.rect(bx, d.y, bwid, bh, 'none', { rx: bh / 2, stroke: '$text', sw: 5, noShadow: true });
          d.text('body', label, { x: bx + CARD_PAD, w: bwid - 2 * CARD_PAD - (filled ? 52 : 0), size: 48, max: 52, weight: 700, font: 'h', fill: filled ? '$onAccent' : '$text', align: filled ? 'left' : 'center', lines: 1, min: 44, at: d.y + CARD_PAD, boxH: th });
          if (filled) arrow(d, bx + bwid - CARD_PAD - 36, d.y + bh / 2, 36);
          d.y += bh;
          if (line) {
            d.gap(24);
            d.text('body', line, { size: 44, max: 56, align: al, lines: 2, min: 44 });
          }
          if (link) {
            d.gap(8);
            d.text('body', link, { size: 44, max: 52, weight: 700, font: 'h', align: al, lines: 1, min: 44 });
          }
        };
        block(str(f, 'button1'), str(f, 'line1'), true);
        d.gap(56);
        block(str(f, 'button2'), str(f, 'line2'), false, str(f, 'link'));
      });
      return mk(d, { type: 'checklist', fitAs: 'cta-pair', slide: rowsSlide(d, head) });
    },
  },
  // numbered-stagger ----------------------------------------------------------------------------------------------------------------
  {
    id: 'numbered-stagger', label: 'Numbered, staggered', shapes: ['list', 'step'], variants: ['numbers in the text', 'big numerals'],
    fields: [{ name: 'title', required: true, max: 40 }, { name: 'items', required: true, max: 90, list: { min: 2, max: 3 } }],
    samples: {
      normal: { title: 'Two ways to wear it', items: ['Zip the hood into the pocket and the hoodie becomes a bag you can carry on one shoulder.', 'Pull the straps out and wear it as a backpack on the train.'] },
      long: { title: 'Three ways to wear it every day', items: ['Zip the hood into the pocket and the hoodie becomes a small bag.', 'Pull the straps out and wear it as a backpack on the train, on a bike or on a hike.', 'Fold the sleeves behind you and use it as a pillow on the plane.'] },
      short: { title: 'Wear it', items: ['As a hoodie.', 'As a bag.'] },
    },
    plan(f, v, st, cx) {
      const items = arr(f, 'items').slice(0, 3);
      // Numbered points, each a sentence: the numerals sit in ONE column at the left margin (variant 2: big bold numerals, at least twice the body size) and the sentences share one left edge, so
      // wrapped lines never start under a number and no row is indented. The type is the biggest at which the title and every row fit 86% of the free height, so a short list fills the page.
      // Three items of long text (over 60 characters, or more than two lines) are a numbered list instead.
      const fh = cx.field.y1 - cx.field.y0;
      const NW = (bs: number, ns: number) => (v === 1 ? Math.round(ns * 0.62) + 24 : Math.round(bs * 1.1) + 36);
      const lines = (it: string) => measure(it, st.fonts.body, bw(st), 44, cx.field.w - NW(44, 110) - 20, 1.3).n;
      if (items.length >= 3 && (items.some((it) => it.length > 60) || items.some((it) => lines(it) > 2))) {
        return layoutDef('numbered-list')!.plan({ title: str(f, 'title'), items }, v, st, cx);
      }
      const SZ: [number, number][] = [[72, 160], [64, 144], [56, 128], [52, 116], [48, 104], [44, 96]];
      const rowH = (it: string, bs: number, ns: number) => Math.max(measure(it, st.fonts.body, bw(st), bs, cx.field.w - NW(bs, ns) - 20, 1.3).h + 2, v === 1 ? Math.round(ns * 0.95) : Math.round(bs * 1.3));
      const [bs, ns] = SZ.find(([b, n]) => items.reduce((a, it) => a + rowH(it, b, n) + 52, 0) + 88 * 2.1 + 64 <= 0.86 * fh) ?? SZ[SZ.length - 1];
      const d = place(st, cx, 'center', (d) => {
        d.text('title', str(f, 'title'), { size: 88, max: 120, weight: 800, font: 'h', lines: 2, min: 72, gap: 64 });
        const nw = NW(eff(bs, 96), eff(ns, 200)); // the type scale may have grown the numerals: the column is as wide as the scaled numeral needs
        items.forEach((it, i) => {
          const h = Math.max(measure(it, st.fonts.body, bw(st), eff(bs, 96), d.w - nw - 20, 1.3).h + 2, v === 1 ? Math.round(eff(ns, 200) * 0.95) : Math.round(eff(bs, 96) * 1.3));
          d.text('body', String(i + 1), { x: d.x0, w: nw, size: v === 1 ? ns : bs, max: v === 1 ? 200 : 96, weight: 800, font: 'h', fill: '$accentText', lines: 1, min: 44, at: d.y, boxH: h });
          d.text('body', it, { x: d.x0 + nw + 20, w: d.w - nw - 20, size: bs, max: 96, lines: 4, min: 44, lh: 1.3, boxH: h, gap: i < items.length - 1 ? 52 : 0 });
        });
      });
      return mk(d, { type: 'checklist', fitAs: 'numbered-stagger', slide: rowsSlide(d, str(f, 'title')) });
    },
  },
  // bullet-list ---------------------------------------------------------------------------------------------------------------------
  {
    id: 'bullet-list', label: 'Bullet list', shapes: ['list', 'benefits'], variants: ['dot bullets', 'square bullets'],
    fields: [{ name: 'title', required: true, max: 40 }, { name: 'items', required: true, max: 46, list: { min: 3, max: 5 } }],
    samples: {
      normal: { title: 'What is in the box', items: ['The Quick Flip hoodie', 'A waterproof pouch', 'A pocket guide', 'A thank-you card'] },
      long: { title: 'Everything that is in the box', items: ['The Quick Flip hoodie in your size', 'A waterproof pouch for the hood', 'A pocket guide to every way to wear it', 'A thank-you card from the team', 'A repair kit with spare zips'] },
      short: { title: 'In the box', items: ['Hoodie', 'Pouch', 'Guide'] },
    },
    plan(f, v, st, cx) {
      const items = arr(f, 'items').slice(0, 5);
      const d = place(st, cx, 'center', (d) => {
        d.text('title', str(f, 'title'), { size: 88, max: 170, weight: 800, font: 'h', lines: 2, min: 72, gap: 56 });
        items.forEach((it, i) => {
          const tx = d.x0 + S(60);
          const m = measure(it, st.fonts.body, bw(st, 700), eff(52, 110), d.w - S(60), 1.2);
          const h = Math.max(m.h + 2, S(72));
          if (v === 0) d.circle(d.x0 + S(14), d.y + h / 2, S(10), '$text');
          else d.rect(d.x0 + S(4), d.y + h / 2 - S(10), S(20), S(20), '$accent', { rx: 4 });
          d.text('body', it, { x: tx, w: d.w - S(60), size: 52, max: 110, weight: 700, font: 'h', lines: 2, min: 44, lh: 1.2, boxH: h, gap: i < items.length - 1 ? 28 : 0 });
        });
      });
      return mk(d, { type: 'checklist', fitAs: 'bullet-list', slide: rowsSlide(d, str(f, 'title')) });
    },
  },
  // pill-stagger --------------------------------------------------------------------------------------------------------------------
  {
    id: 'pill-stagger', label: 'Staggered pills', shapes: ['list', 'benefits'], variants: ['zig-zag', 'centred'],
    fields: [{ name: 'headline', required: true, max: 50 }, { name: 'items', required: true, max: 36, list: { min: 3, max: 4 } }, { name: 'subline', required: false, max: 70 }],
    samples: {
      normal: { headline: 'Four ways to wear it', subline: 'Pick the one that fits your day.', items: ['As a hoodie', 'As a backpack', 'As a pillow', 'As a blanket'] },
      long: { headline: 'Four different ways to wear it every day', subline: 'Pick the one that fits your day.', items: ['As a hoodie on the street', 'As a backpack on the train', 'As a pillow on the plane', 'As a blanket at the park'] },
      short: { headline: 'Wear it', items: ['Hoodie', 'Bag', 'Pillow'] },
    },
    plan(f, v, st, cx) {
      const items = arr(f, 'items').slice(0, 4);
      const sub = str(f, 'subline');
      const d = place(st, cx, 'center', (d) => {
        d.text('title', str(f, 'headline'), { size: 80, max: 130, weight: 800, font: 'h', lines: 2, min: 72, align: 'center', lh: 1.05, gap: sub ? 24 : 44 });
        if (sub) d.text('body', sub, { size: 44, max: 52, fill: '$muted', align: 'center', lines: 1, min: 44, gap: 44 });
        items.forEach((it, i) => {
          const fs = eff(46, 56);
          const th = Math.ceil(fs * 1.25) + 2;
          const h = th + 2 * CARD_PAD;
          const tw = measureWidth(it, st.fonts.body, bw(st, 600), fs);
          const pw = Math.min(d.w - 24, Math.max(Math.round(tw + 2 * CARD_PAD + 28), S(300)));
          const slots = [0.0, 0.28, 0.56, 0.18, 0.42];
          const px = v === 1 ? d.cx - pw / 2 : d.x0 + Math.max(0, Math.min(d.w - pw - 12, (d.w - pw) * slots[i % slots.length]));
          d.rect(px, d.y, pw, h, '$surface', { rx: h / 2 });
          d.text('body', it, { x: px + CARD_PAD, w: pw - 2 * CARD_PAD, size: 46, max: 56, weight: 600, align: 'center', lines: 1, min: 44, at: d.y + CARD_PAD, boxH: th, gap: 0 });
          d.y += h;
          d.gap(i < items.length - 1 ? 22 : 0);
        });
      });
      return mk(d, { type: 'checklist', fitAs: 'pill-stagger', slide: rowsSlide(d, str(f, 'headline')) });
    },
  },
  // headline-card -------------------------------------------------------------------------------------------------------------------
  {
    id: 'headline-card', label: 'Headline and card', shapes: ['explainer', 'story'], variants: ['surface card', 'accent card'],
    fields: [{ name: 'headline', required: true, max: 50 }, { name: 'card', required: true, max: 170 }, { name: 'subline', required: false, max: 80 }, { name: 'paragraph', required: false, max: 150 }, { name: 'closing', required: false, max: 60 }],
    samples: {
      normal: { headline: 'How it works', subline: 'Three things happen when you zip.', card: 'The hood folds into a waterproof pocket that holds a 16-inch laptop.', paragraph: 'The straps slide out of the sleeves in one pull.', closing: 'That is the whole trick.' },
      long: { headline: 'How the hoodie turns into a bag', subline: 'Three things happen when you zip it.', card: 'The hood folds into a waterproof pocket that holds a sixteen-inch laptop, a lunch box and a folded umbrella.', paragraph: 'The straps slide out of the sleeves in one pull, and the zip locks them in place.', closing: 'It takes ten seconds, start to finish.' },
      short: { headline: 'The trick', card: 'One zip turns the hood into a bag.', closing: 'It takes ten seconds.' },
    },
    plan(f, v, st, cx) {
      const head = str(f, 'headline');
      const sub = str(f, 'subline');
      const card = str(f, 'card');
      const para = str(f, 'paragraph');
      const closing = str(f, 'closing');
      const ink = v === 1 ? '$onAccent' : '$text';
      const d = place(st, cx, 'center', (d) => {
        d.text('title', head, { size: 96, max: 140, weight: 800, font: 'h', lines: 3, min: 72, align: 'center', lh: 1.05, gap: sub ? 24 : 52 });
        if (sub) d.text('body', sub, { size: 44, max: 56, fill: '$muted', align: 'center', lines: 2, min: 44, gap: 52 });
        const pad = 44;
        const w = d.w - 2 * pad;
        const m = measure(card, st.fonts.body, bw(st), eff(52, 64), w, 1.3);
        const ch = Math.max(m.h + 2 * pad, S(260));
        const y0 = d.y;
        d.rect(d.x0, y0, d.w, ch, v === 1 ? '$accent' : '$surface', { rx: 44 });
        d.text('body', card, { x: d.x0 + pad, w, size: 52, max: 64, fill: ink, lines: 7, min: 44, lh: 1.3, at: y0, boxH: ch });
        d.y = y0 + ch;
        if (para) {
          d.gap(48);
          d.text('body', para, { size: 44, max: 56, align: 'center', lines: 3, min: 44, gap: closing ? 24 : 0 });
        }
        if (closing) {
          if (!para) d.gap(48);
          d.text('body', closing, { size: 52, max: 64, weight: 800, font: 'h', align: 'center', lines: 2, min: 44 });
        }
      });
      return mk(d, { type: 'checklist', fitAs: 'headline-card', slide: rowsSlide(d, head) });
    },
  },
];
