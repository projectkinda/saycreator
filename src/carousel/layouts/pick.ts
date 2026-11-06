// Deterministic picking helpers. The model gives a content shape (or a layout id) and text; the code decides the rest.
import { LAYOUT_IDS, cutsOf, layoutDef } from './library';
import { contrast } from './draw';
import type { ContentShape, Cut, Fields, Flavour, LayoutId, LayoutStyle } from './types';

/** The layouts that suit a content shape, in library order. photo-led is only a candidate for the 'photo' shape. */
export function layoutFor(shape: ContentShape): LayoutId[] {
  const out = LAYOUT_IDS.filter((id) => (id === 'photo-led' ? shape === 'photo' : layoutDef(id)!.shapes.includes(shape)));
  return out.length ? out : ['statement'];
}

export interface DeckItem {
  /** The layout the model (or the code) wants for this slide; optional when only a shape is known. */
  layout?: LayoutId;
  shape?: ContentShape;
}
export interface Picked {
  layout: LayoutId;
  variant: 0 | 1;
  /** Why it differs from what was asked (empty when it does not). */
  note: string;
}

/**
 * Picks the layout and variant of every slide of a deck: no two consecutive slides share a layout, no layout is used more than twice, and the variants of a layout alternate
 * (first use variant 1, second use variant 2). A request that breaks a rule falls back to the next candidate for the slide's shape, then to any layout that obeys the rules.
 */
/** The key of the "no neighbours" rule: a layout is its own family, except that step-numeral and listicle-numeral are ONE family (two giant numerals side by side look the same). */
export const neighbourFamily = (l: string): string => (l === 'step-numeral' || l === 'listicle-numeral' ? 'numeral' : l);
export function rotateVariants(deck: DeckItem[], opts: { photo?: boolean; flavour?: Flavour } = {}): Picked[] {
  const fl = opts.flavour;
  // a preset's flavour orders the layouts a replacement is taken from: liked first, avoided last (the neighbour and twice-at-most rules still decide)
  const rank = (id: LayoutId) => (fl?.prefer?.includes(id) ? 0 : fl?.avoid?.includes(id) ? 2 : 1);
  const used: Record<string, number> = {};
  const out: Picked[] = [];
  deck.forEach((item, i) => {
    const prev = out[i - 1]?.layout;
    const ok = (id: LayoutId) => (!prev || neighbourFamily(id) !== neighbourFamily(prev)) && (used[id] ?? 0) < 2 && (opts.photo || id !== 'photo-led');
    const wanted = item.layout ? [item.layout, ...(item.shape ? layoutFor(item.shape) : [])] : item.shape ? layoutFor(item.shape) : [];
    const pool = [...wanted, ...LAYOUT_IDS.filter((id) => id !== 'photo-led' || !!opts.photo).sort((a, b) => rank(a) - rank(b))];
    const layout = pool.find(ok) ?? pool[0];
    const n = used[layout] ?? 0;
    used[layout] = n + 1;
    const first = wanted[0];
    // the first use of a layout takes the preset's preferred variant (the cover its cover variant), the second the other one
    const pv = i === 0 && fl?.coverVariant !== undefined ? fl.coverVariant : fl?.variants?.[layout];
    const variant = (pv === undefined ? n % 2 : n % 2 === 0 ? pv : 1 - pv) as 0 | 1;
    out.push({ layout, variant, note: first && first !== layout ? `"${first}" was replaced by "${layout}" (${first === prev || (prev && neighbourFamily(first) === neighbourFamily(prev)) ? 'it repeats the slide before' : (used[first] ?? 0) >= 2 ? 'it is already used twice' : 'it is not allowed here'}).` : '' });
  });
  return out;
}

export interface Validation {
  ok: boolean;
  errors: string[];
}
/** Enforces the required fields and the character, word and item budgets of a layout. The errors say in plain words what to change. */
export function validateSlideContent(layoutId: string, fields: Fields): Validation {
  const def = layoutDef(layoutId);
  if (!def) return { ok: false, errors: [`"${layoutId}" is not a layout (use one of: ${LAYOUT_IDS.join(', ')}).`] };
  const errors: string[] = [];
  const known = new Set([...def.fields.map((f) => f.name), 'accent']);
  for (const k of Object.keys(fields)) if (!known.has(k)) errors.push(`${layoutId}: "${k}" is not a field of this layout (fields: ${[...known].join(', ')}).`);
  for (const spec of def.fields) {
    const v = fields[spec.name];
    const empty = v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.filter((x) => x.trim()).length === 0);
    if (empty) {
      if (spec.required) errors.push(`${layoutId}: "${spec.name}" is required.`);
      continue;
    }
    if (spec.list) {
      if (!Array.isArray(v)) {
        errors.push(`${layoutId}: "${spec.name}" must be a list of ${spec.list.min} to ${spec.list.max} items.`);
        continue;
      }
      const items = v.map((x) => x.trim()).filter(Boolean);
      if (items.length < spec.list.min || items.length > spec.list.max) errors.push(`${layoutId}: "${spec.name}" needs ${spec.list.min} to ${spec.list.max} items (got ${items.length}).`);
      items.forEach((x, i) => x.length > spec.max && errors.push(`${layoutId}: "${spec.name}" item ${i + 1} is ${x.length} characters; the most is ${spec.max}.`));
      continue;
    }
    if (typeof v !== 'string') {
      errors.push(`${layoutId}: "${spec.name}" must be text, not a list.`);
      continue;
    }
    const t = v.trim();
    if (t.length > spec.max) errors.push(`${layoutId}: "${spec.name}" is ${t.length} characters; the most is ${spec.max}. Shorten it.`);
    if (spec.maxWords && t.split(/\s+/).length > spec.maxWords) errors.push(`${layoutId}: "${spec.name}" has ${t.split(/\s+/).length} words; the most is ${spec.maxWords}.`);
    if (spec.percent && (!/^\d{1,3}$/.test(t) || Number(t) > 100)) errors.push(`${layoutId}: "${spec.name}" must be a whole number from 0 to 100.`);
    if (spec.name === 'step' && !/^[1-9]$/.test(t)) errors.push(`${layoutId}: "step" must be a number from 1 to 9.`);
  }
  if (Array.isArray(fields.accent) && fields.accent.length > 3) errors.push(`${layoutId}: "accent" takes at most 3 phrases (got ${fields.accent.length}).`);
  return { ok: errors.length === 0, errors };
}

export interface CutPick {
  /** The ground of a palette rhythm this slide takes (an index into style.rhythm; -1 = the closing ground). Absent without a rhythm. */
  ground?: number;
  cut: Cut;
  /** 'full' swaps field and plane colours (with no plane it is a full-bleed accent slide); 'tint' moves the field to the surface colour. */
  invert: false | 'full' | 'tint';
  /** 'statement' drops secondary copy and sets the headline huge (statement, big-question, cta-button only). */
  density: 'normal' | 'statement';
}
// edge-v (a side plane with nothing on it) is supported but never picked by rotateCuts: the planes that carry content are edge-h, curve and angle.
const CUT_CYCLE: Cut[] = ['edge-h', 'curve', 'plain', 'angle', 'edge-h', 'plain'];
const DENSE = new Set<string>(['statement', 'big-question', 'cta-button']);
/**
 * Picks the cut, invert and density of every slide of a deck, deterministically.
 * - A style with planes: no two adjacent slides share a cut, at most 2 plain in a row, invert on at most one slide in 4.
 * - A style without a plane device (flat white and lime): every cut is plain. Variety comes from scale (statement density on the first slide that allows it), a tint on two
 *   slides (not adjacent, about 1 in 3) and one full-bleed accent slide (the last slide, the closing one). Unless `planes` is forced on.
 */
export function rotateCuts(deck: { layout: LayoutId }[], st: LayoutStyle, opts: { planes?: boolean; /** The model's suggested cuts: used when the rotation rules allow them (never edge-v, which carries nothing). */ suggest?: { cut?: Cut }[] } = {}): CutPick[] {
  const planes = opts.planes ?? !!st.devices.planes;
  const n = deck.length;
  const out: CutPick[] = [];
  // a palette rhythm already varies the ground: no tints on top of it
  const flatTint = st.palette.surface.toUpperCase() !== st.palette.bg.toUpperCase() && !((st.rhythm?.length ?? 0) > 1);
  const tints = new Set<number>(n >= 5 && flatTint ? [1, Math.min(n - 3, Math.floor(n * 0.65))] : n >= 3 && flatTint ? [1] : []);
  let dense = 0;
  deck.forEach((item, i) => {
    let density: CutPick['density'] = 'normal';
    // the dense statement drops the secondary copy, which a plane would carry: only for styles without planes
    if (!planes && DENSE.has(item.layout) && dense < 2 && (i === 0 || i === n - 1)) {
      density = 'statement';
      dense++;
    }
    if (!planes) {
      const invert = n >= 4 && i === n - 1 ? (st.closing ? false : 'full') : tints.has(i) ? 'tint' : false;
      return void out.push({ cut: 'plain', invert, density });
    }
    const invert = i % 4 === 3 ? 'full' : false;
    const prev = out[i - 1]?.cut;
    const plainRun = out[i - 1]?.cut === 'plain' && out[i - 2]?.cut === 'plain';
    const ok = (c: Cut) => c !== prev && !(c === 'plain' && plainRun) && cutsOf(item.layout).includes(c);
    const order = [...CUT_CYCLE.slice(i % CUT_CYCLE.length), ...CUT_CYCLE.slice(0, i % CUT_CYCLE.length)];
    const want = opts.suggest?.[i]?.cut;
    const cut = want && want !== 'edge-v' && ok(want) ? want : order.find(ok) ?? cutsOf(item.layout).find((c) => c !== prev) ?? 'plain';
    out.push({ cut, invert, density });
  });
  // The palette rhythm: slide i takes ground i mod n; the closing slide takes the preset's closing ground; no two neighbouring slides end on the same ground colour.
  const R = st.rhythm;
  if (R && R.length > 1) {
    const L = R.length;
    const closing = !!st.closing && n >= 4;
    const key = (g: number, inv: false | 'full' | 'tint') => (g < 0 ? st.closing!.bg : inv === 'full' ? R[g].accent : R[g].bg).toUpperCase();
    const same = (a: string, b: string) => a === b || contrast(a, b) < 1.12;
    // the grounds that differ least from the plain cycle, with no two neighbours (the closing slide included) on the same ground colour: a small search over the slides
    const m = closing ? n - 1 : n;
    const INF = 1e9;
    const cost: number[][] = Array.from({ length: m }, () => Array(L).fill(INF));
    const from: number[][] = Array.from({ length: m }, () => Array(L).fill(-1));
    for (let g = 0; g < L; g++) cost[0][g] = g === 0 % L ? 0 : 1;
    for (let i = 1; i < m; i++)
      for (let g = 0; g < L; g++)
        for (let q = 0; q < L; q++) {
          if (cost[i - 1][q] >= INF || same(key(g, out[i].invert), key(q, out[i - 1].invert))) continue;
          const c = cost[i - 1][q] + (g === i % L ? 0 : 1);
          if (c < cost[i][g]) {
            cost[i][g] = c;
            from[i][g] = q;
          }
        }
    let end = -1;
    for (let g = 0; g < L; g++) if (cost[m - 1][g] < INF && (!closing || !same(key(g, out[m - 1].invert), key(-1, false))) && (end < 0 || cost[m - 1][g] < cost[m - 1][end])) end = g;
    const path: number[] = Array(m).fill(0).map((_, i) => i % L);
    if (end >= 0) for (let i = m - 1, g = end; i >= 0; i--) {
      path[i] = g;
      g = from[i][g];
    }
    for (let i = 0; i < m; i++) out[i] = { ...out[i], ground: path[i] };
    if (closing) out[n - 1] = { ...out[n - 1], ground: -1, invert: false };
  }
  return out;
}

