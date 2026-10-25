// Layout catalogue, part 1: cover, content, step. Each layout reads the style's tokens and the rule's params.
import type { SlideScript } from '../carousel/types';
import { badge, buildText, divider, inkWidth, rect } from '../carousel/toolbox';
import { add, asset, bg, body, cased, head, kicker, num, type LCtx } from './kit';
import { glow, labelText, outlinePill, roundArrow, uiCard } from './tools';

type S<T extends SlideScript['type']> = Extract<SlideScript, { type: T }>;
const markOf = (c: LCtx, highlight?: string) => {
  const bar = c.params.bar;
  return bar === 'last' ? ('last-line' as const) : bar === 'all' ? ('all-lines' as const) : highlight ? ('words' as const) : ('none' as const);
};
const words = (h?: string) => h?.split(/\s+/).filter(Boolean);

/** Cover: the headline fills the slide and sits low; the first line and a small graphic sit above it. */
export function coverStack(c: LCtx, s: S<'cover'>) {
  bg(c);
  const { M, W } = c;
  const sec = c.theme.spacing.section;
  let y = c.top;
  let artBottom = 0;
  if (c.params.asset) artBottom = c.top + asset(c, c.params.asset, 'art', W - M - num(c, 'assetSize', 240), c.top, num(c, 'assetSize', 240)).height + c.theme.spacing.gap;
  if (s.kicker) y += kicker(c, s.kicker, M, y) + sec;
  y = Math.max(y, artBottom);
  const sub = s.sub ? body(c, 'sub', s.sub, { y: 0, width: (c.W - 2 * M) * 0.82, size: c.theme.type.body, min: 32, maxH: 240, color: c.pal.muted, dry: true }) : null;
  const subH = sub ? sub.height + sec : 0;
  head(c, 'headline', s.headline, { region: [y, c.bottom - subH], anchor: 'bottom', size: c.theme.type.cover, min: 84, mark: markOf(c, s.highlight), words: words(s.highlight) });
  if (sub) add(c, { ...sub.layer, y: c.bottom - sub.height });
}

/** Cover: the headline starts at the top; a small visual (a UI card, a glow or an asset) fills the lower half. */
export function coverTop(c: LCtx, s: S<'cover'>) {
  bg(c);
  const { M, W } = c;
  const cw = W - 2 * M;
  const sec = c.theme.spacing.section;
  let y = c.top;
  if (s.kicker) y += kicker(c, s.kicker, M, y) + sec;
  const sub = s.sub ? body(c, 'sub', s.sub, { y: 0, width: cw * 0.8, size: c.theme.type.body, min: 32, maxH: 220, color: c.pal.muted, dry: true }) : null;
  // The headline gets a share of the room. If it cannot fit in that share, it may use everything above the sub line, and the visual is dropped.
  const share: [number, number] = [y, y + (c.bottom - y) * num(c, 'headlineShare', 0.62)];
  const probe = head(c, 'headline', s.headline, { region: share, size: c.theme.type.cover, min: 84, dry: true });
  const region: [number, number] = probe.notes.some((n) => /does not fit/.test(n)) ? [y, c.bottom - (sub ? sub.height + sec * 1.5 : 0)] : share;
  const hd = head(c, 'headline', s.headline, { region, size: c.theme.type.cover, min: 84, mark: markOf(c, s.highlight), words: words(s.highlight) });
  y += hd.height + c.theme.spacing.gap * 1.2;
  if (sub) {
    add(c, { ...sub.layer, y });
    y += sub.height + sec;
  }
  const room = c.bottom - y;
  const visual = String(c.params.visual ?? 'none');
  if (room >= 260) {
    if (visual === 'ui-card') add(c, ...uiCard(c.theme, c.pal, 'card', M + cw * 0.12, y, cw * 0.88 - 4, Math.min(room - 6, 620), c.params.chart === 'line' ? 'line' : 'bars'));
    else if (visual === 'glow') add(c, ...glow('glow', W - M - 220, y + room * 0.5, Math.min(room * 0.5, 330), c.pal.accent, 0.45));
    else if (visual === 'asset') asset(c, c.params.asset, 'art', M, y, Math.min(cw, num(c, 'assetSize', 520)));
  } else c.notes.push('No room for the cover visual under the headline.');
  if (c.params.button) add(c, ...roundArrow(c.theme, c.pal, 'go', W - M - 110, c.bottom - 110, 110, { filled: true }));
}

/** Cover: a small mark, a centred headline and a small outlined button. */
export function coverCentre(c: LCtx, s: S<'cover'>) {
  bg(c);
  const { M, W } = c;
  const cw = W - 2 * M;
  const sec = c.theme.spacing.section;
  let top = c.top;
  if (s.kicker) {
    const t = labelText(c.theme, c.pal, 'kicker', 0, 0, s.kicker, { color: c.pal.muted });
    const w = Math.ceil(inkWidth(t));
    add(c, { ...t.layer, x: Math.round((W - w) / 2), y: top, width: w + 2 });
    top += t.height + sec;
  }
  const markSize = num(c, 'assetSize', 150);
  const pill = outlinePill(c.theme, c.pal, 'btn', 0, 0, 'Swipe', { arrow: true });
  const sub = s.sub ? body(c, 'sub', s.sub, { y: 0, width: cw * 0.78, size: c.theme.type.body, min: 32, maxH: 220, color: c.pal.muted, align: 'center', dry: true }) : null;
  const below = (sub ? sub.height + sec : 0) + pill.height + sec;
  const withMark = c.params.asset ? markSize + sec : 0;
  const hd = head(c, 'headline', s.headline, { region: [top + withMark, c.bottom - below], anchor: 'middle', size: c.theme.type.cover, min: 80, align: 'center', mark: markOf(c, s.highlight), words: words(s.highlight) });
  const hy = (c.layers.find((l) => l.id === 'headline') as { y: number }).y;
  if (c.params.asset) asset(c, c.params.asset, 'art', (W - markSize) / 2, hy - markSize - sec, markSize);
  let y = hy + hd.height + c.theme.spacing.gap;
  if (sub) {
    add(c, { ...sub.layer, x: Math.round(M + cw * 0.11), y });
    y += sub.height + sec;
  }
  const out = outlinePill(c.theme, c.pal, 'btn', Math.round((W - pill.width) / 2), y, 'Swipe', { arrow: true });
  add(c, ...out.layers);
}

/** Content: heading, a short rule, then the body. */
export function contentStack(c: LCtx, s: S<'content'>) {
  bg(c);
  const sec = c.theme.spacing.section;
  const hd = head(c, 'headline', s.headline, { region: [0, 400], size: c.theme.type.headline + 8, min: 64, dry: true });
  const bd = body(c, 'body', s.body, { y: 0, size: c.theme.type.body + 10, min: 36, maxH: 520, dry: true });
  const total = hd.height + sec + bd.height;
  const y0 = Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * 0.38));
  head(c, 'headline', s.headline, { region: [y0, y0 + hd.height], size: c.theme.type.headline + 8, min: 64, mark: markOf(c, s.highlight), words: words(s.highlight) });
  add(c, divider(c.theme, c.pal, 'rule', c.M, y0 + hd.height + sec / 2, num(c, 'ruleWidth', 140)));
  add(c, { ...bd.layer, y: y0 + hd.height + sec });
}

/** Content: the heading on solid bars (one bar per line), the body in plain text below, a small graphic in the corner. */
export function contentBar(c: LCtx, s: S<'content'>) {
  bg(c);
  const { M, W } = c;
  const cw = W - 2 * M;
  const sec = c.theme.spacing.section;
  if (c.params.asset) asset(c, c.params.asset, 'art', W - M - num(c, 'assetSize', 150), c.bottom - num(c, 'assetSize', 150), num(c, 'assetSize', 150));
  const bd = body(c, 'body', s.body, { y: 0, width: cw * 0.72, size: c.theme.type.body + 4, min: 36, maxH: 480, dry: true });
  const hd = head(c, 'headline', s.headline, { region: [c.top, c.bottom - bd.height - sec], size: c.theme.type.headline + 12, min: 64, mark: 'all-lines' });
  add(c, { ...bd.layer, y: c.top + hd.height + sec });
}

/** Content: the heading at the top, a lot of empty space, and the body in a narrow column at the foot with a rule above it. */
export function contentColumns(c: LCtx, s: S<'content'>) {
  bg(c);
  const { M, W } = c;
  const sec = c.theme.spacing.section;
  const bd = body(c, 'body', s.body, { y: 0, width: (W - 2 * M) * 0.66, size: c.theme.type.body + 2, min: 32, maxH: 480, dry: true });
  head(c, 'headline', s.headline, { region: [c.top, c.bottom - bd.height - sec * 2], size: c.theme.type.headline, min: 64, mark: markOf(c, s.highlight), words: words(s.highlight) });
  const y = c.bottom - bd.height;
  add(c, rect('rule', 'decor', M, y - sec * 0.6, W - 2 * M, Math.max(2, Math.round(c.theme.shape.stroke / 3)), c.pal.line));
  add(c, { ...bd.layer, y });
}

/** Step: a badge with the number, a small STEP label, the heading and the body. */
export function stepBadge(c: LCtx, s: S<'step'>) {
  bg(c);
  const t = c.theme;
  const size = num(c, 'badgeSize', 170);
  const sec = t.spacing.section;
  const gap = t.spacing.gap;
  const hd = head(c, 'headline', s.headline, { region: [0, 340], size: t.type.headline, min: 64, dry: true });
  const bd = body(c, 'body', s.body, { y: 0, size: t.type.body + 6, min: 36, maxH: 420, dry: true });
  const total = size + sec + hd.height + gap + bd.height;
  const y0 = Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * 0.3));
  add(c, ...badge(t, c.pal, 'badge', c.M, y0, size, String(s.number)));
  const lab = labelText(t, c.pal, 'step-label', c.M + size + 36, y0 + (size - (t.type.label ?? 32)) / 2, 'STEP', { color: c.pal.muted });
  add(c, lab.layer);
  const y1 = y0 + size + sec;
  head(c, 'headline', s.headline, { region: [y1, y1 + hd.height], size: t.type.headline, min: 64, mark: markOf(c, s.highlight), words: words(s.highlight) });
  add(c, { ...bd.layer, y: y1 + hd.height + gap });
}

/** Step: a huge number in the accent colour, with the heading and body under it. */
export function stepNumeral(c: LCtx, s: S<'step'>) {
  bg(c);
  const t = c.theme;
  const size = num(c, 'numeralSize', 330);
  const gap = t.spacing.gap;
  const sec = t.spacing.section;
  const label = String(s.number).padStart(2, '0');
  const n = buildText({ id: 'numeral', x: c.M, y: c.top, width: c.W - 2 * c.M, text: label, font: t.fonts.headline, weight: t.fonts.headlineWeight, size, color: c.params.ghost ? c.pal.muted : c.pal.accent, lineHeight: 1, balance: false });
  add(c, n.layer);
  const bd = body(c, 'body', s.body, { y: 0, size: t.type.body + 4, min: 36, maxH: 400, dry: true });
  const y = c.top + n.height + gap;
  const hd = head(c, 'headline', s.headline, { region: [y, c.bottom - bd.height - sec], anchor: 'top', size: t.type.headline, min: 64, mark: markOf(c, s.highlight), words: words(s.highlight) });
  add(c, { ...bd.layer, y: y + hd.height + gap });
}

/** Step: a thin outlined pill reading STEP 01, then the heading and body. */
export function stepPill(c: LCtx, s: S<'step'>) {
  bg(c);
  const t = c.theme;
  const sec = t.spacing.section;
  const gap = t.spacing.gap;
  const pill = outlinePill(t, c.pal, 'pill', c.M, c.top, `Step ${String(s.number).padStart(2, '0')}`);
  add(c, ...pill.layers);
  const bd = body(c, 'body', s.body, { y: 0, size: t.type.body + 4, min: 36, maxH: 420, dry: true });
  const y = c.top + pill.height + sec * 1.4;
  const hd = head(c, 'headline', s.headline, { region: [y, c.bottom - bd.height - sec], size: t.type.headline + 6, min: 64, mark: markOf(c, s.highlight), words: words(s.highlight) });
  add(c, { ...bd.layer, y: y + hd.height + gap });
  void cased;
  void glow;
  void uiCard;
}
