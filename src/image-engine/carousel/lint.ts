// Phone-size checks for one carousel slide. Every check is pass or fail with a plain sentence.
// Geometry comes from the plan (text is measured with the real loaded fonts); contrast is measured on rendered pixels.
// All limits are working guesses, not measured facts about what performs well. Change them here.
import { layoutText } from '../draw/text';
import { contrast, luminance, parseColor } from '../lint/color';
import type { Pixels } from '../lint/metrics';
import type { Layer, Plan, TextLayer } from '../types';

export const CAROUSEL_LIMITS = {
  /** Smallest text on a 1080 wide slide, px. On a 320 wide phone copy that is about 9.5 px; on a 390 pt phone about 11.5 pt. */
  minTextPx: 32,
  minContrast: 4.5,
  /** Share of the pixels behind a word that must reach minContrast. */
  minContrastShare: 0.95,
  /** Nothing the reader needs may come closer than this to any edge, px at 1080 wide. */
  edgePx: 48,
  /** The left edge of the content must sit on the theme margin, give or take this many px. */
  marginTolerancePx: 6,
  /** Two boxes may overlap by at most this many px in either direction before it counts. */
  slackPx: 2,
};

export type CarouselLintId = 'fit' | 'size' | 'contrast' | 'orphan' | 'margins' | 'edges' | 'overlap';

export interface CarouselLintResult {
  id: CarouselLintId;
  label: string;
  pass: boolean;
  reason: string;
  measured?: number;
  limit?: number;
}

export const CAROUSEL_CHECK_LABELS: Record<CarouselLintId, string> = {
  fit: 'Text fits its box',
  size: 'Text is big enough',
  contrast: 'Contrast',
  orphan: 'No one-word last line',
  margins: 'Consistent margins',
  edges: 'Nothing near the edge',
  overlap: 'No overlapping elements',
};

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Item {
  id: string;
  role: 'content' | 'container';
  box: Box;
}

const overlapOf = (a: Box, b: Box) => ({
  w: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  h: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
});
const contains = (outer: Box, inner: Box, slack: number) =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.width <= outer.x + outer.width + slack && inner.y + inner.height <= outer.y + outer.height + slack;

/** The box a layer really occupies, including rotation. */
function layerBox(l: Layer): Box {
  if (!l.rotation) return { x: l.x, y: l.y, width: l.width, height: l.height };
  const a = (l.rotation * Math.PI) / 180;
  const w = Math.abs(l.width * Math.cos(a)) + Math.abs(l.height * Math.sin(a));
  const h = Math.abs(l.width * Math.sin(a)) + Math.abs(l.height * Math.cos(a));
  return { x: l.x + l.width / 2 - w / 2, y: l.y + l.height / 2 - h / 2, width: w, height: h };
}

/** Where the text really is: the lines' widest extent and the block's height. */
function textInk(l: TextLayer) {
  const block = layoutText(l);
  const lines = block.lines.filter((x) => x.text);
  const x0 = Math.min(...lines.map((x) => x.x));
  const x1 = Math.max(...lines.map((x) => x.x + x.width));
  return { block, box: { x: l.x + x0, y: l.y, width: x1 - x0, height: block.height } as Box };
}

const snippet = (t: string) => `"${t.replace(/\s+/g, ' ').slice(0, 32)}${t.length > 32 ? '…' : ''}"`;
const nameOf = (l: Layer) => (l.kind === 'text' ? snippet(l.text) : `"${l.name ?? l.id}"`);

export interface CarouselLintInput {
  plan: Plan;
  /** The theme's side margin, px. */
  margin: number;
  /** Phone-size copy of the plan with every word made invisible: what the words sit on. */
  phoneBackground: Pixels;
  /** Size of the phone copy divided by the plan's size. */
  phoneScale: number;
}

export function lintSlide(input: CarouselLintInput): CarouselLintResult[] {
  const L = CAROUSEL_LIMITS;
  const { plan, margin } = input;
  const { width: W, height: H } = plan.canvas;
  const layers = plan.layers.filter((l) => l.visible !== false);
  const texts = layers.filter((l): l is TextLayer => l.kind === 'text');
  const out: CarouselLintResult[] = [];
  const res = (id: CarouselLintId, pass: boolean, reason: string, measured?: number, limit?: number) =>
    out.push({ id, label: CAROUSEL_CHECK_LABELS[id], pass, reason, ...(measured === undefined ? {} : { measured }), ...(limit === undefined ? {} : { limit }) });

  const inks = texts.map((t) => ({ layer: t, ...textInk(t) }));

  // 1. fit
  const unfit = inks.filter((i) => !i.block.fits);
  res(
    'fit',
    unfit.length === 0,
    unfit.length === 0
      ? 'Every text fits inside its box.'
      : unfit.map((i) => (i.block.why === 'word-too-wide' ? `${snippet(i.layer.text)} has a word wider than its box.` : `${snippet(i.layer.text)} is taller than its box (${Math.round(i.block.height)} px of text in ${Math.round(i.layer.height)} px). It would be cut off or spill out.`)).join(' '),
  );

  // 2. size
  const smallest = inks.reduce((m, i) => (i.block.size < m.size ? { size: i.block.size, who: i.layer } : m), { size: Infinity, who: texts[0] as TextLayer | undefined });
  const sizeOk = inks.length === 0 || smallest.size >= L.minTextPx;
  res(
    'size',
    sizeOk,
    sizeOk
      ? `Smallest text is ${smallest.size} px (about ${(smallest.size * input.phoneScale).toFixed(1)} px on a 320 px wide phone copy); the minimum is ${L.minTextPx} px.`
      : `${snippet(smallest.who!.text)} is ${smallest.size} px (about ${(smallest.size * input.phoneScale).toFixed(1)} px on a 320 px wide phone copy). The minimum is ${L.minTextPx} px.`,
    smallest.size === Infinity ? undefined : smallest.size,
    L.minTextPx,
  );

  // 3. contrast, measured on pixels with the words removed
  const px = input.phoneBackground;
  let worst = { share: 1, ratio: Infinity, text: '' };
  for (const i of inks) {
    const t = i.layer;
    const hl = t.highlight;
    const marked = new Set((hl?.words ?? []).map((w) => w.toLowerCase()));
    for (const line of i.block.lines)
      for (const w of line.words) {
        const colour = w.highlighted && hl?.textColor ? hl.textColor : t.style.color;
        const tl = luminance(...parseColor(colour).rgb);
        const mid = t.y + line.y + i.block.lineStep / 2;
        const r = { x: (t.x + w.x) * input.phoneScale, y: (mid - i.block.size * 0.34) * input.phoneScale, w: Math.max(1, w.width * input.phoneScale), h: Math.max(1, i.block.size * 0.64 * input.phoneScale) };
        let good = 0;
        let n = 0;
        let min = Infinity;
        for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(px.height, Math.ceil(r.y + r.h)); y++)
          for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(px.width, Math.ceil(r.x + r.w)); x++) {
            const k = (y * px.width + x) * 4;
            const c = contrast(tl, luminance(px.data[k], px.data[k + 1], px.data[k + 2]));
            n++;
            if (c >= L.minContrast) good++;
            if (c < min) min = c;
          }
        if (n === 0) continue;
        const share = good / n;
        if (share < worst.share || (share === worst.share && min < worst.ratio)) worst = { share, ratio: min, text: w.text };
        void marked;
      }
  }
  const contrastOk = worst.share >= L.minContrastShare;
  res(
    'contrast',
    contrastOk,
    contrastOk
      ? `Every word reaches ${L.minContrast}:1 on what is behind it (lowest sampled: ${worst.ratio === Infinity ? 'n/a' : worst.ratio.toFixed(1) + ':1'}).`
      : `The word "${worst.text}" only reaches ${L.minContrast}:1 over ${Math.round(worst.share * 100)}% of the pixels behind it (lowest sampled ${worst.ratio.toFixed(1)}:1). Needs ${L.minContrast}:1 over ${Math.round(L.minContrastShare * 100)}%.`,
    worst.ratio === Infinity ? undefined : Math.round(worst.ratio * 10) / 10,
    L.minContrast,
  );

  // 4. one-word last line
  const orphans = inks.filter((i) => i.block.lines.length >= 2 && i.block.lines[i.block.lines.length - 1].words.length === 1);
  res(
    'orphan',
    orphans.length === 0,
    orphans.length === 0 ? 'No text ends on a line with a single word.' : orphans.map((i) => `${snippet(i.layer.text)} ends with "${i.block.lines[i.block.lines.length - 1].text}" alone on the last line.`).join(' '),
  );

  // Items that must be kept clear of each other and of the edges.
  const items: Item[] = [];
  for (const i of inks) items.push({ id: nameOf(i.layer), role: 'content', box: i.box });
  for (const l of layers) {
    if (l.kind === 'text') continue;
    const role = l.role ?? (l.id === 'bg' ? 'decor' : 'content');
    if (role === 'decor') continue;
    items.push({ id: nameOf(l), role, box: layerBox(l) });
  }

  // 5. margins
  const left = Math.min(...items.map((i) => i.box.x));
  const right = Math.max(...items.map((i) => i.box.x + i.box.width));
  const top = Math.min(...items.map((i) => i.box.y));
  const tol = L.marginTolerancePx;
  const problems: string[] = [];
  if (items.length === 0) problems.push('Nothing is on the slide.');
  else {
    if (Math.abs(left - margin) > tol) problems.push(`The content starts ${Math.round(left)} px from the left edge; the theme's margin is ${margin} px.`);
    if (right > W - margin + tol) problems.push(`The content reaches ${Math.round(W - right)} px from the right edge; the theme's margin is ${margin} px.`);
    if (top < margin - tol) problems.push(`The content starts ${Math.round(top)} px from the top; the theme's margin is ${margin} px.`);
  }
  res('margins', problems.length === 0, problems.length === 0 ? `Content sits on the ${margin} px margin (left ${Math.round(left)} px, right ${Math.round(W - right)} px, top ${Math.round(top)} px).` : problems.join(' '), Math.round(left), margin);

  // 6. edges
  const near = items
    .map((i) => ({ i, d: Math.min(i.box.x, i.box.y, W - (i.box.x + i.box.width), H - (i.box.y + i.box.height)) }))
    .filter((e) => e.d < L.edgePx)
    .sort((a, b) => a.d - b.d);
  res(
    'edges',
    near.length === 0,
    near.length === 0 ? `Nothing is closer than ${L.edgePx} px to an edge.` : `${near[0].i.id} is ${Math.round(Math.max(0, near[0].d))} px from the edge (at least ${L.edgePx} px needed).${near.length > 1 ? ` ${near.length - 1} more are too close.` : ''}`,
    Math.round(Math.max(0, near[0]?.d ?? 0)),
    L.edgePx,
  );

  // 7. overlap
  const clashes: string[] = [];
  for (let a = 0; a < items.length; a++)
    for (let b = a + 1; b < items.length; b++) {
      const p = items[a];
      const q = items[b];
      const o = overlapOf(p.box, q.box);
      if (o.w <= L.slackPx || o.h <= L.slackPx) continue;
      if (p.role === 'container' && q.role === 'container') {
        if (!contains(p.box, q.box, L.slackPx) && !contains(q.box, p.box, L.slackPx)) clashes.push(`${p.id} overlaps ${q.id}.`);
      } else if (p.role === 'container' || q.role === 'container') {
        const [box, thing] = p.role === 'container' ? [p, q] : [q, p];
        if (!contains(box.box, thing.box, L.slackPx)) clashes.push(`${thing.id} sticks out of ${box.id}.`);
      } else clashes.push(`${p.id} overlaps ${q.id}.`);
    }
  res('overlap', clashes.length === 0, clashes.length === 0 ? 'No two elements overlap.' : clashes.slice(0, 3).join(' ') + (clashes.length > 3 ? ` (${clashes.length - 3} more)` : ''), clashes.length, 0);

  return out;
}
