// Turns a script and a theme into seven slide plans. Every plan is ordinary layers, so patches can edit it.
// Needs the fonts loaded first (call loadFonts()), because it measures real text.
import { findHighlight, missingHighlightNote } from '../draw/words';
import type { Layer, Plan } from '../types';
import { DECOR_BAND, background, badge, button, buildText, decor, divider, icon, inkWidth, marker, progressDots, quoteMarks, rect, solidOf, sticker, swipeCue, ellipse, type Built } from './toolbox';
import { SLIDE, type CarouselScript, type ComposedSlide, type Palette, type SlideScript, type Theme } from './types';

interface Ctx {
  theme: Theme;
  W: number;
  H: number;
  M: number;
  /** The area slides put their content in: above the dots and swipe cue. */
  top: number;
  bottom: number;
  index: number;
  count: number;
  notes: string[];
  layers: Layer[];
}

const CHROME_MID = (H: number) => H - 112;

function newCtx(theme: Theme, index: number, count: number): Ctx {
  const M = theme.spacing.margin;
  return { theme, W: SLIDE.width, H: SLIDE.height, M, top: M, bottom: SLIDE.height - 210, index, count, notes: [], layers: [] };
}

const add = (c: Ctx, ...l: Layer[]) => c.layers.push(...l);
const take = (c: Ctx, b: Built) => {
  c.notes.push(...b.notes);
  return b;
};

/** A headline-style text with an optional marked word, and the marker layers drawn behind it. */
function headline(c: Ctx, pal: Palette, id: string, y: number, text: string, size: number, minSize: number, maxHeight: number, mark?: string, width = c.W - 2 * c.M): Built {
  const t = c.theme;
  const plain = take(c, buildText({ id, x: c.M, y, width, text, font: t.fonts.headline, weight: t.fonts.headlineWeight, size, minSize, maxHeight, color: pal.text, lineHeight: 1.08 }));
  if (!mark) {
    add(c, plain.layer);
    return plain;
  }
  const all = mark.split(/\s+/).filter(Boolean);
  const hl = findHighlight(text, all);
  for (const w of hl.missing) c.notes.push(missingHighlightNote(w));
  if (hl.found.length === 0) {
    add(c, plain.layer);
    return plain;
  }
  const m = marker(t, pal, plain.layer, hl.found, `${id}-marker`);
  add(c, ...m.behind, { ...plain.layer, ...(m.highlight ? { highlight: m.highlight } : {}) });
  return plain;
}

function body(c: Ctx, pal: Palette, id: string, y: number, text: string, size: number, minSize: number, maxHeight: number, color = pal.text, width = c.W - 2 * c.M, x = c.M): Built {
  const t = c.theme;
  const b = take(c, buildText({ id, x, y, width, text, font: t.fonts.body, weight: t.fonts.bodyWeight, size, minSize, maxHeight, color, lineHeight: 1.32 }));
  add(c, b.layer);
  return b;
}

/** Dots and the swipe cue. Every slide has them; the last slide has no swipe cue. */
function chrome(c: Ctx, pal: Palette) {
  const mid = CHROME_MID(c.H);
  add(c, ...progressDots(pal, 'dots', c.M, mid, c.index, c.count));
  if (c.index < c.count - 1) add(c, ...swipeCue(c.theme, pal, 'swipe', c.W - c.M, mid));
}

const seed = (c: Ctx, pal: Palette) => add(c, background(pal, c.W, c.H));

/** Vertical start for a block of a given height, a little above the middle of the content area. */
function startY(c: Ctx, total: number, bias = 0.4) {
  return Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * bias));
}

type Build = (c: Ctx, s: never) => Palette;

const cover: Build = (c, s: Extract<SlideScript, { type: 'cover' }>) => {
  const { theme: t } = c;
  const pal = t.hero;
  seed(c, pal);
  add(c, ...decor(t, pal, c.W));
  let y = c.top;
  if (s.kicker) {
    const k = sticker(t, pal, 'kicker', c.M, y, s.kicker);
    add(c, ...k.layers);
    y += k.height + t.spacing.section;
  }
  y = Math.max(y, DECOR_BAND + 20);
  const subB = s.sub ? buildText({ id: 'sub', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.sub, font: t.fonts.body, weight: t.fonts.bodyWeight, size: t.type.body, minSize: 36, maxHeight: 220, color: pal.muted, lineHeight: 1.32 }) : null;
  const subH = subB ? subB.height + t.spacing.section : 0;
  const room = c.bottom - y - subH;
  const hl = headline(c, pal, 'headline', y, s.headline, t.type.cover, 84, room, s.highlight);
  // Put the block lower on the slide, as covers usually are.
  const total = hl.height + subH;
  const shift = Math.max(0, Math.round((c.bottom - y - total) * 0.55));
  if (shift) for (const l of c.layers) if (l.id.startsWith('headline')) l.y += shift;
  if (subB) {
    c.notes.push(...subB.notes);
    add(c, { ...subB.layer, y: y + shift + hl.height + t.spacing.section });
  }
  chrome(c, pal);
  return pal;
};

const content: Build = (c, s: Extract<SlideScript, { type: 'content' }>) => {
  const { theme: t } = c;
  const pal = t.base;
  seed(c, pal);
  const hl = buildText({ id: 'headline', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.headline, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: t.type.headline + 8, minSize: 64, maxHeight: 360, color: pal.text, lineHeight: 1.08 });
  const bd = buildText({ id: 'body', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.body, font: t.fonts.body, weight: t.fonts.bodyWeight, size: t.type.body + 12, minSize: 40, maxHeight: 520, color: pal.text, lineHeight: 1.32 });
  const total = hl.height + t.spacing.section + bd.height;
  const y0 = startY(c, total);
  headline(c, pal, 'headline', y0, s.headline, t.type.headline + 8, 64, 360, s.highlight);
  add(c, divider(t, pal, 'divider', c.M, y0 + hl.height + t.spacing.section / 2, 140));
  body(c, pal, 'body', y0 + hl.height + t.spacing.section, s.body, t.type.body + 12, 40, 520);
  chrome(c, pal);
  return pal;
};

const step: Build = (c, s: Extract<SlideScript, { type: 'step' }>) => {
  const { theme: t } = c;
  const pal = t.base;
  seed(c, pal);
  const size = 170;
  const hl = buildText({ id: 'headline', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.headline, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: t.type.headline, minSize: 64, maxHeight: 300, color: pal.text, lineHeight: 1.08 });
  const bd = buildText({ id: 'body', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.body, font: t.fonts.body, weight: t.fonts.bodyWeight, size: t.type.body + 8, minSize: 40, maxHeight: 420, color: pal.text, lineHeight: 1.32 });
  const total = size + t.spacing.section + hl.height + t.spacing.gap + bd.height;
  const y0 = startY(c, total, 0.3);
  add(c, ...badge(t, pal, 'badge', c.M, y0, size, String(s.number)));
  const stepLabel = buildText({ id: 'step-label', x: c.M + size + 36, y: y0 + (size - t.type.small) / 2, width: 500, text: 'STEP', font: t.fonts.body, weight: t.fonts.strong, size: t.type.small, color: pal.muted, lineHeight: 1, balance: false });
  add(c, stepLabel.layer);
  const y1 = y0 + size + t.spacing.section;
  headline(c, pal, 'headline', y1, s.headline, t.type.headline, 64, 300, s.highlight);
  body(c, pal, 'body', y1 + hl.height + t.spacing.gap, s.body, t.type.body + 8, 40, 420);
  chrome(c, pal);
  return pal;
};

const stat: Build = (c, s: Extract<SlideScript, { type: 'stat' }>) => {
  const { theme: t } = c;
  const pal = t.hero;
  seed(c, pal);
    const kick = s.kicker ? buildText({ id: 'kicker', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.kicker, font: t.fonts.body, weight: t.fonts.strong, size: t.type.small, color: pal.muted, lineHeight: 1, upper: true, balance: false }) : null;
  const val = buildText({ id: 'value', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.value, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: t.type.stat, minSize: 140, maxHeight: t.type.stat * 1.3, color: pal.accent, lineHeight: 1, balance: false });
  const label = buildText({ id: 'label', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.label, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: 66, minSize: 48, maxHeight: 300, color: pal.text, lineHeight: 1.12 });
  const note = s.note ? buildText({ id: 'note', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.note, font: t.fonts.body, weight: t.fonts.bodyWeight, size: t.type.body - 4, minSize: 36, maxHeight: 200, color: pal.muted, lineHeight: 1.32 }) : null;
  const gap = t.spacing.gap;
  const total = (kick ? kick.height + gap : 0) + val.height + gap + label.height + (note ? t.spacing.section + note.height : 0);
  let y = startY(c, total, 0.45);
  if (kick) {
    add(c, { ...kick.layer, y });
    c.notes.push(...kick.notes);
    y += kick.height + gap;
  }
  c.notes.push(...val.notes);
  add(c, { ...val.layer, y });
  y += val.height + gap;
  c.notes.push(...label.notes);
  add(c, { ...label.layer, y });
  y += label.height;
  if (note) {
    y += t.spacing.section;
    add(c, divider(t, pal, 'divider', c.M, y - t.spacing.section / 2, 140));
    c.notes.push(...note.notes);
    add(c, { ...note.layer, y });
  }
  chrome(c, pal);
  return pal;
};

const checklist: Build = (c, s: Extract<SlideScript, { type: 'checklist' }>) => {
  const { theme: t } = c;
  const pal = t.base;
  seed(c, pal);
  const hl = buildText({ id: 'headline', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.headline, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: t.type.headline, minSize: 64, maxHeight: 300, color: pal.text, lineHeight: 1.08 });
  const dot = 84;
  const tx = c.M + dot + 32;
  const tw = c.W - c.M - tx;
  const rowGap = Math.round(t.spacing.gap * 1.5);
  const items = s.items.map((text, i) => buildText({ id: `item-${i + 1}`, x: tx, y: 0, width: tw, text, font: t.fonts.body, weight: t.fonts.strong === 600 && t.fonts.body === 'Instrument Sans' ? 500 : t.fonts.bodyWeight, size: t.type.body, minSize: 36, maxHeight: 190, color: pal.text, lineHeight: 1.25 }));
  const rows = items.map((b) => Math.max(dot, b.height));
  const total = hl.height + t.spacing.section + rows.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1);
  let y = startY(c, total, 0.3);
  headline(c, pal, 'headline', y, s.headline, t.type.headline, 64, 300, s.highlight);
  y += hl.height + t.spacing.section;
  const o = t.shape.outline;
  items.forEach((b, i) => {
    const rowH = rows[i];
    const cy = y + rowH / 2;
    const shape = t.shape.badge === 'circle' ? ellipse(`check-bg-${i + 1}`, 'container', c.M, cy - dot / 2, dot, dot, pal.accent, { stroke: o ? { color: pal.line, width: o } : undefined }) : rect(`check-bg-${i + 1}`, 'container', c.M, cy - dot / 2, dot, dot, pal.accent, { radius: t.shape.badge === 'rounded' ? 26 : 0, stroke: o ? { color: pal.line, width: o } : undefined });
    add(c, shape, icon('check', `check-${i + 1}`, c.M + dot * 0.22, cy - dot * 0.28, dot * 0.56, pal.onAccent, t.shape.stroke));
    c.notes.push(...b.notes);
    add(c, { ...b.layer, y: Math.round(cy - b.height / 2) });
    y += rowH + rowGap;
  });
  chrome(c, pal);
  return pal;
};

const beforeAfter: Build = (c, s: Extract<SlideScript, { type: 'beforeafter' }>) => {
  const { theme: t } = c;
  const top = t.base;
  const bot = t.hero;
  const half = Math.round(c.H / 2);
  add(c, background(top, c.W, c.H, 'bg'), rect('bg-after', 'decor', 0, half, c.W, c.H - half, bot.bg));
  const badgeSize = 124;
  const bx = c.W - c.M - badgeSize;
  const labelB = sticker(t, { ...top, accent: top.muted, onAccent: solidOf(top.bg) }, 'before-label', c.M, c.top, s.beforeLabel);
  // The "before" label uses muted colours so the "after" half is the one that shines.
  add(c, ...labelB.layers);
  const gap = t.spacing.gap;
  const y1 = c.top + labelB.height + gap;
  const roomTop = half - badgeSize / 2 - t.spacing.gap - y1 - 20;
  const before = buildText({ id: 'before', x: c.M, y: y1, width: c.W - 2 * c.M, text: s.before, font: t.fonts.body, weight: t.fonts.bodyWeight, size: 76, minSize: 40, maxHeight: roomTop, color: top.muted, lineHeight: 1.25 });
  c.notes.push(...before.notes);
  add(c, before.layer);
  const ya = half + badgeSize / 2 + gap;
  const labelA = sticker(t, bot, 'after-label', c.M, ya, s.afterLabel);
  add(c, ...labelA.layers);
  const y2 = ya + labelA.height + gap;
  const after = buildText({ id: 'after', x: c.M, y: y2, width: c.W - 2 * c.M, text: s.after, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: 84, minSize: 44, maxHeight: c.bottom - y2, color: bot.text, lineHeight: 1.15 });
  c.notes.push(...after.notes);
  add(c, after.layer);
  // The seam badge sits across the split, on the right, with a down arrow inside.
  const circle = t.shape.badge === 'circle';
  const o = t.shape.outline;
  const seamStroke = o ? { color: bot.line, width: o } : undefined;
  if (t.shape.hardShadow) add(c, circle ? ellipse('seam-shadow', 'decor', bx + t.shape.hardShadow, half - badgeSize / 2 + t.shape.hardShadow, badgeSize, badgeSize, bot.line) : rect('seam-shadow', 'decor', bx + t.shape.hardShadow, half - badgeSize / 2 + t.shape.hardShadow, badgeSize, badgeSize, bot.line));
  add(c, circle ? ellipse('seam', 'container', bx, half - badgeSize / 2, badgeSize, badgeSize, bot.accent, { stroke: seamStroke }) : rect('seam', 'container', bx, half - badgeSize / 2, badgeSize, badgeSize, bot.accent, { radius: t.shape.badge === 'rounded' ? 36 : 0, stroke: seamStroke }));
  add(c, icon('arrow-down', 'seam-arrow', bx + badgeSize * 0.25, half - badgeSize * 0.25, badgeSize * 0.5, bot.onAccent, t.shape.stroke));
  chrome(c, bot);
  return top;
};

const quote: Build = (c, s: Extract<SlideScript, { type: 'quote' }>) => {
  const { theme: t } = c;
  const pal = t.hero;
  seed(c, pal);
  const qm = 120;
  const q = buildText({ id: 'quote', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.quote, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: t.type.quote, minSize: 56, maxHeight: 560, color: pal.text, lineHeight: 1.16 });
  const by = buildText({ id: 'by', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.by, font: t.fonts.body, weight: t.fonts.strong, size: t.type.body - 4, minSize: 34, maxHeight: 140, color: pal.muted, lineHeight: 1.2, balance: false });
  const total = qm * 1.2 + t.spacing.gap + q.height + t.spacing.section + by.height;
  const y0 = startY(c, total, 0.45);
  add(c, ...quoteMarks('qmark', c.M, y0, qm, pal.accent));
  const yq = y0 + qm * 1.2 + t.spacing.gap;
  const qb = headline(c, pal, 'quote', yq, s.quote, t.type.quote, 56, 560, s.highlight);
  add(c, divider(t, pal, 'divider', c.M, yq + qb.height + t.spacing.section / 2, 140));
  c.notes.push(...by.notes);
  add(c, { ...by.layer, y: yq + qb.height + t.spacing.section });
  chrome(c, pal);
  return pal;
};

const closing: Build = (c, s: Extract<SlideScript, { type: 'closing' }>) => {
  const { theme: t } = c;
  const pal = t.hero;
  seed(c, pal);
  add(c, ...decor(t, pal, c.W));
  const hl = buildText({ id: 'headline', x: c.M, y: 0, width: c.W - 2 * c.M, text: s.headline, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: t.type.headline + 12, minSize: 64, maxHeight: 420, color: pal.text, lineHeight: 1.08 });
  const btnH = Math.round(t.type.body * 2.2);
  const handleH = 64;
  const total = hl.height + t.spacing.section + btnH + t.spacing.section + handleH;
  const y0 = Math.max(startY(c, total, 0.5), DECOR_BAND + 20);
  headline(c, pal, 'headline', y0, s.headline, t.type.headline + 12, 64, 420, s.highlight);
  const yb = y0 + hl.height + t.spacing.section;
  const b = button(t, pal, 'cta', c.M, yb, s.cta, c.W - 2 * c.M);
  add(c, ...b.layers);
  const yh = yb + b.height + t.spacing.section;
  const ic = 56;
  add(c, icon('chat', 'handle-icon', c.M, yh + (handleH - ic) / 2, ic, pal.accent, t.shape.stroke));
  return pal;
};

export interface ComposeOptions {
  /** Called with each slide's plan before it is returned. Handy for tests. */
  tap?: (slide: ComposedSlide) => void;
}

const BUILDERS: Record<SlideScript['type'], Build> = { cover, content, step, stat, checklist, beforeafter: beforeAfter, quote, closing };

/** Handle text on the last slide is added here because it needs the script's brand. */
function addHandle(c: Ctx, pal: Palette, handle: string) {
  const t = c.theme;
  const icon = c.layers.find((l) => l.id === 'handle-icon');
  if (!icon) return;
  const b = buildText({ id: 'handle', x: icon.x + icon.width + 20, y: icon.y, width: c.W - 2 * c.M - icon.width - 20, text: handle, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: 48, color: pal.text, lineHeight: 1, balance: false });
  add(c, { ...b.layer, y: Math.round(icon.y + icon.height / 2 - b.size / 2) });
}

/** Seven slide plans for one script in one theme. */
export function composeCarousel(script: CarouselScript, theme: Theme): ComposedSlide[] {
  if (script.slides.length !== 7) throw new Error(`A carousel script needs exactly 7 slides (this one has ${script.slides.length}).`);
  return script.slides.map((s, i) => {
    const c = newCtx(theme, i, script.slides.length);
    const pal = (BUILDERS[s.type] as (c: Ctx, s: SlideScript) => Palette)(c, s);
    if (s.type === 'closing') addHandle(c, pal, script.brand.handle);
    const plan: Plan = { schema: 1, revision: 1, canvas: { width: c.W, height: c.H, background: solidOf(pal.bg) }, layers: c.layers };
    return { id: `${script.id}-${theme.id}-${i + 1}`, type: s.type, plan, notes: c.notes };
  });
}

export { inkWidth };
