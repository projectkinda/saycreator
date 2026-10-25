// Layout catalogue, part 2: stat, checklist, before/after, quote, closing.
import type { SlideScript } from '../carousel/types';
import { arrowRight, button, buildText, divider, ellipse, icon, inkWidth, pathLayer, quoteMarks, rect } from '../carousel/toolbox';
import { add, bg, body, head, num, type LCtx } from './kit';
import { labelText, outlinePill, rule } from './tools';

type S<T extends SlideScript['type']> = Extract<SlideScript, { type: T }>;
const words = (h?: string) => h?.split(/\s+/).filter(Boolean);

/** Stat: a huge number, the label under it, an outlined arrow pill, a short note. */
export function statGiant(c: LCtx, s: S<'stat'>) {
  bg(c);
  const t = c.theme;
  const { M, W } = c;
  const cw = W - 2 * M;
  const gap = t.spacing.gap;
  const sec = t.spacing.section;
  const kick = s.kicker ? labelText(t, c.pal, 'kicker', M, 0, s.kicker, { width: cw }) : null;
  const val = buildText({ id: 'value', x: M, y: 0, width: cw, text: s.value, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: t.type.stat, minSize: 140, maxHeight: t.type.stat * 1.3, color: c.pal.accent, lineHeight: 1, balance: false });
  const lab = head(c, 'label', s.label, { region: [0, 360], size: 66, min: 48, asWritten: true, dry: true });
  const note = s.note ? body(c, 'note', s.note, { y: 0, size: t.type.body - 4, min: 32, maxH: 220, color: c.pal.muted, dry: true }) : null;
  const pill = c.params.pill ? 86 : 0;
  const total = (kick ? kick.height + gap : 0) + val.height + gap + lab.height + (pill ? gap + pill : 0) + (note ? sec + note.height : 0);
  let y = Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * 0.42));
  if (kick) {
    add(c, { ...kick.layer, y });
    y += kick.height + gap;
  }
  c.notes.push(...val.notes);
  add(c, { ...val.layer, y });
  y += val.height + gap;
  head(c, 'label', s.label, { region: [y, y + lab.height], size: 66, min: 48, asWritten: true });
  y += lab.height;
  if (pill) {
    y += gap;
    const w = Math.round(cw * 0.6);
    add(c, rect('pill', 'container', M, y, w, pill, 'rgba(0,0,0,0)', { radius: pill / 2, stroke: { color: c.pal.line, width: Math.max(2, t.shape.outline || 3) } }));
    add(c, arrowRight('pill-arrow', M + w - 150, y + (pill - 63) / 2, 90, c.pal.text, Math.max(3, t.shape.stroke - 2)));
    y += pill;
  }
  if (note && note.layer) {
    y += sec;
    add(c, { ...note.layer, y });
  }
}

/** Stat: the number and its label inside a card, the note under the card. */
export function statCard(c: LCtx, s: S<'stat'>) {
  bg(c);
  const t = c.theme;
  const { M, W } = c;
  const cw = W - 2 * M;
  const gap = t.spacing.gap;
  const sec = t.spacing.section;
  const pad = 56;
  const iw = cw - 2 * pad;
  const val = buildText({ id: 'value', x: M + pad, y: 0, width: iw, text: s.value, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: t.type.stat * 0.9, minSize: 120, maxHeight: t.type.stat * 1.2, color: c.pal.accent, lineHeight: 1, balance: false });
  const lab = head(c, 'label', s.label, { region: [0, 300], x: M + pad, width: iw, size: 60, min: 44, asWritten: true, pal: c.pal, color: c.pal.onSurface, dry: true });
  const note = s.note ? body(c, 'note', s.note, { y: 0, size: t.type.body - 4, min: 32, maxH: 220, color: c.pal.muted, dry: true }) : null;
  const cardH = pad + val.height + gap + lab.height + pad;
  const total = cardH + (note ? sec + note.height : 0);
  const y0 = Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * 0.4));
  const d = t.shape.hardShadow;
  const rad = Math.min(t.shape.radius, 44);
  if (d) add(c, rect('card-shadow', 'decor', M + d, y0 + d, cw, cardH, c.pal.line, { radius: rad }));
  add(c, rect('card', 'container', M, y0, cw, cardH, c.pal.surface, { radius: rad, stroke: t.shape.outline ? { color: c.pal.line, width: t.shape.outline } : undefined }));
  c.notes.push(...val.notes);
  add(c, { ...val.layer, y: y0 + pad });
  head(c, 'label', s.label, { region: [y0 + pad + val.height + gap, y0 + pad + val.height + gap + lab.height], x: M + pad, width: iw, size: 60, min: 44, asWritten: true, color: c.pal.onSurface });
  if (note) add(c, { ...note.layer, y: y0 + cardH + sec });
}

/** Checklist: the heading, then a row for each item with a round tick. */
export function checklistIcons(c: LCtx, s: S<'checklist'>) {
  bg(c);
  const t = c.theme;
  const { M, W } = c;
  const sec = t.spacing.section;
  const dot = 84;
  const tx = M + dot + 32;
  const rowGap = Math.round(t.spacing.gap * 1.5);
  const hd = head(c, 'headline', s.headline, { region: [0, 320], size: t.type.headline, min: 64, dry: true });
  const items = s.items.map((text, i) => buildText({ id: `item-${i + 1}`, x: tx, y: 0, width: W - M - tx, text, font: t.fonts.body, weight: t.fonts.strong, size: t.type.body, minSize: 36, maxHeight: 200, color: c.pal.text, lineHeight: 1.25 }));
  const rows = items.map((b) => Math.max(dot, b.height));
  const total = hd.height + sec + rows.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1);
  let y = Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * 0.3));
  head(c, 'headline', s.headline, { region: [y, y + hd.height], size: t.type.headline, min: 64, mark: s.highlight ? 'words' : 'none', words: words(s.highlight) });
  y += hd.height + sec;
  const o = t.shape.outline;
  items.forEach((b, i) => {
    const cy = y + rows[i] / 2;
    const stroke = o ? { color: c.pal.line, width: o } : undefined;
    add(c, t.shape.badge === 'circle' ? ellipse(`tick-bg-${i + 1}`, 'container', M, cy - dot / 2, dot, dot, c.pal.accent, { stroke }) : rect(`tick-bg-${i + 1}`, 'container', M, cy - dot / 2, dot, dot, c.pal.accent, { radius: t.shape.badge === 'rounded' ? 26 : 0, stroke }));
    add(c, icon('check', `tick-${i + 1}`, M + dot * 0.22, cy - dot * 0.28, dot * 0.56, c.pal.onAccent, t.shape.stroke));
    c.notes.push(...b.notes);
    add(c, { ...b.layer, y: Math.round(cy - b.height / 2) });
    y += rows[i] + rowGap;
  });
}

/** Checklist: numbered rows separated by rules. No icons. */
export function checklistLines(c: LCtx, s: S<'checklist'>) {
  bg(c);
  const t = c.theme;
  const { M, W } = c;
  const sec = t.spacing.section;
  const tx = M + 120;
  const pad = 30;
  const hd = head(c, 'headline', s.headline, { region: [0, 320], size: t.type.headline, min: 64, dry: true });
  const items = s.items.map((text, i) => buildText({ id: `item-${i + 1}`, x: tx, y: 0, width: W - M - tx, text, font: t.fonts.body, weight: t.fonts.strong, size: t.type.body, minSize: 36, maxHeight: 200, color: c.pal.text, lineHeight: 1.25 }));
  const total = hd.height + sec + items.reduce((a, b) => a + b.height + 2 * pad, 0);
  let y = Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * 0.3));
  head(c, 'headline', s.headline, { region: [y, y + hd.height], size: t.type.headline, min: 64, mark: s.highlight ? 'words' : 'none', words: words(s.highlight) });
  y += hd.height + sec;
  items.forEach((b, i) => {
    add(c, rule(t, c.pal, `rule-${i + 1}`, M, y, W - 2 * M));
    const n = labelText(t, c.pal, `n-${i + 1}`, M, y + pad + 4, String(i + 1).padStart(2, '0'), { color: c.pal.accent });
    add(c, n.layer);
    c.notes.push(...b.notes);
    add(c, { ...b.layer, y: y + pad });
    y += b.height + 2 * pad;
  });
  add(c, rule(t, c.pal, "rule-end", M, y, W - 2 * M));
}

function otherPalette(c: LCtx) {
  const names = Object.keys(c.style.palettes);
  const pick = typeof c.params.alt === 'string' && c.style.palettes[c.params.alt] ? c.params.alt : names.find((n) => n !== c.palName) ?? c.palName;
  return c.style.palettes[pick];
}

/** Before and after: the slide is cut in two halves, the top in this palette and the bottom in another. */
export function baSplit(c: LCtx, s: S<'beforeafter'>) {
  const t = c.theme;
  const top = c.pal;
  const bot = otherPalette(c);
  const { M, W, H } = c;
  const half = Math.round(H / 2);
  const gap = t.spacing.gap;
  const seam = 124;
  bg(c);
  add(c, rect('bg-after', 'decor', 0, half, W, H - half, bot.bg));
  c.chromePal = bot;
  const l1 = outlinePill(t, top, 'before-label', M, c.top, s.beforeLabel);
  add(c, ...l1.layers);
  const y1 = c.top + l1.height + gap;
  const room1 = half - seam / 2 - gap - y1 - 20;
  add(c, buildText({ id: 'before', x: M, y: y1, width: W - 2 * M, text: s.before, font: t.fonts.body, weight: t.fonts.bodyWeight, size: 72, minSize: 38, maxHeight: room1, color: top.muted, lineHeight: 1.25 }).layer);
  const ya = half + seam / 2 + gap;
  const l2 = outlinePill(t, bot, 'after-label', M, ya, s.afterLabel, { filled: true });
  add(c, ...l2.layers);
  const y2 = ya + l2.height + gap;
  const aft = buildText({ id: 'after', x: M, y: y2, width: W - 2 * M, text: s.after, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: 84, minSize: 44, maxHeight: c.bottom - y2, color: bot.text, lineHeight: 1.12 });
  c.notes.push(...aft.notes);
  add(c, aft.layer);
  const bx = W - M - seam;
  add(c, ellipse('seam', 'container', bx, half - seam / 2, seam, seam, bot.accent, { stroke: t.shape.outline ? { color: bot.line, width: t.shape.outline } : undefined }));
  add(c, icon('arrow-down', 'seam-arrow', bx + seam * 0.25, half - seam * 0.25, seam * 0.5, bot.onAccent, t.shape.stroke));
}

/** Before and after: two cards, one over the other, the second in the accent colour. */
export function baCards(c: LCtx, s: S<'beforeafter'>) {
  bg(c);
  const t = c.theme;
  const { M, W } = c;
  const cw = W - 2 * M;
  const pad = 44;
  const gap = t.spacing.section + 20;
  const lab = 56;
  const rad = Math.min(t.shape.radius, 40);
  const avail = c.bottom - c.top - gap;
  const per = avail / 2;
  const b = buildText({ id: 'before', x: M + pad, y: 0, width: cw - 2 * pad, text: s.before, font: t.fonts.body, weight: t.fonts.bodyWeight, size: 62, minSize: 38, maxHeight: per - 2 * pad - lab - 20, color: c.pal.onSurface, lineHeight: 1.25 });
  const a = buildText({ id: 'after', x: M + pad, y: 0, width: cw - 2 * pad, text: s.after, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: 72, minSize: 40, maxHeight: per - 2 * pad - lab - 20, color: c.pal.onAccent, lineHeight: 1.12 });
  c.notes.push(...b.notes, ...a.notes);
  const h1 = pad + lab + 20 + b.height + pad;
  const h2 = pad + lab + 20 + a.height + pad;
  const y0 = Math.round(c.top + Math.max(0, (avail - h1 - h2) / 2));
  const d = t.shape.hardShadow;
  const o = t.shape.outline;
  const card = (id: string, y: number, h: number, fill: string, shadow: boolean) => {
    if (d && shadow) add(c, rect(`${id}-shadow`, 'decor', M + d, y + d, cw, h, c.pal.line, { radius: rad }));
    add(c, rect(id, 'container', M, y, cw, h, fill, { radius: rad, stroke: o ? { color: c.pal.line, width: o } : undefined }));
  };
  card('card-before', y0, h1, c.pal.surface, false);
  const lb = labelText(t, c.pal, 'before-label', M + pad, y0 + pad, s.beforeLabel, { color: c.pal.muted });
  add(c, lb.layer, { ...b.layer, y: y0 + pad + lab + 20 });
  const y2 = y0 + h1 + gap;
  card('card-after', y2, h2, c.pal.accent, true);
  const la = labelText(t, c.pal, 'after-label', M + pad, y2 + pad, s.afterLabel, { color: c.pal.onAccent });
  add(c, la.layer, { ...a.layer, y: y2 + pad + lab + 20 });
  add(c, icon('arrow-down', 'between', W - M - 90, y0 + h1 + (gap - 56) / 2, 56, c.pal.text, t.shape.stroke));
}

/** Quote: two big quote marks, the quote at the left, a short rule, the source. */
export function quoteMarks_(c: LCtx, s: S<'quote'>) {
  bg(c);
  const t = c.theme;
  const sec = t.spacing.section;
  const gap = t.spacing.gap;
  const qm = num(c, 'markSize', c.H < 1200 ? 90 : 120);
  const hq = head(c, 'quote', s.quote, { region: [0, 620], size: t.type.quote, min: 56, dry: true });
  const by = body(c, 'by', s.by, { y: 0, size: t.type.body - 6, min: 32, maxH: 140, color: c.pal.muted, dry: true });
  const total = qm * 1.2 + gap + hq.height + sec + by.height;
  const y0 = Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * 0.4));
  add(c, ...quoteMarks('qmark', c.M, y0, qm, c.pal.accent));
  const yq = y0 + qm * 1.2 + gap;
  head(c, 'quote', s.quote, { region: [yq, yq + hq.height], size: t.type.quote, min: 56, mark: s.highlight ? 'words' : 'none', words: words(s.highlight) });
  add(c, divider(t, c.pal, 'rule', c.M, yq + hq.height + sec / 2, 140));
  add(c, { ...by.layer, y: yq + hq.height + sec });
}

/** Quote: everything centred on the slide, a small mark above the quote. */
export function quoteCentre(c: LCtx, s: S<'quote'>) {
  bg(c);
  const t = c.theme;
  const { W, M } = c;
  const sec = t.spacing.section;
  const gap = t.spacing.gap;
  const qm = c.H < 1200 ? 70 : 90;
  const hq = head(c, 'quote', s.quote, { region: [0, 640], size: t.type.quote, min: 56, align: 'center', dry: true });
  const by = body(c, 'by', s.by, { y: 0, size: t.type.body - 6, min: 32, maxH: 140, color: c.pal.muted, align: 'center', dry: true });
  const total = qm * 1.2 + gap + hq.height + sec + by.height;
  const y0 = Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * 0.45));
  add(c, ...quoteMarks('qmark', Math.round((W - qm * 2.3) / 2), y0, qm, c.pal.accent));
  const yq = y0 + qm * 1.2 + gap;
  head(c, 'quote', s.quote, { region: [yq, yq + hq.height], size: t.type.quote, min: 56, align: 'center', mark: s.highlight ? 'words' : 'none', words: words(s.highlight) });
  add(c, divider(t, c.pal, 'rule', Math.round((W - 140) / 2), yq + hq.height + sec / 2, 140));
  add(c, { ...by.layer, y: yq + hq.height + sec });
  void M;
}

function handleRow(c: LCtx, y: number, x = c.M) {
  const t = c.theme;
  const ic = 56;
  add(c, icon('chat', 'handle-icon', x, y + 4, ic, c.pal.accent, t.shape.stroke));
  const b = buildText({ id: 'handle', x: x + ic + 20, y, width: c.W - 2 * c.M - ic - 20, text: c.handle, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: 48, color: c.pal.text, lineHeight: 1, balance: false });
  add(c, { ...b.layer, y: Math.round(y + ic / 2 + 4 - b.size / 2) });
}

/** Closing: the headline, a call-to-action button with an arrow, the account name. */
export function closingButton(c: LCtx, s: S<'closing'>) {
  bg(c);
  const t = c.theme;
  const sec = t.spacing.section;
  const hd = head(c, 'headline', s.headline, { region: [0, 440], size: t.type.headline + 12, min: 64, dry: true });
  const btn = button(t, c.pal, 'cta', c.M, 0, s.cta, c.W - 2 * c.M);
  const total = hd.height + sec + btn.height + sec + 64;
  const y0 = Math.round(c.top + Math.max(0, (c.bottom - c.top - total) * 0.45));
  head(c, 'headline', s.headline, { region: [y0, y0 + hd.height], size: t.type.headline + 12, min: 64, mark: s.highlight ? 'words' : 'none', words: words(s.highlight) });
  const yb = y0 + hd.height + sec;
  add(c, ...button(t, c.pal, 'cta', c.M, yb, s.cta, c.W - 2 * c.M).layers);
  handleRow(c, yb + btn.height + sec);
}

/** Closing: the headline at the top, the account name, and a full-width call-to-action bar at the foot. */
export function closingBar(c: LCtx, s: S<'closing'>) {
  bg(c);
  const t = c.theme;
  const { M, W } = c;
  const cw = W - 2 * M;
  const sec = t.spacing.section;
  const barH = 150;
  const lab = buildText({ id: 'cta-label', x: M + 44, y: 0, width: cw - 88 - 120, text: s.cta, font: t.fonts.headline, weight: t.fonts.headlineWeight, size: t.type.body + 6, minSize: 36, color: c.pal.onAccent, lineHeight: 1.1 });
  const bh = Math.max(barH, lab.height + 70);
  const barY = c.bottom - bh;
  const hd = head(c, 'headline', s.headline, { region: [c.top, barY - 64 - sec * 2], size: t.type.headline + 20, min: 64, mark: s.highlight ? 'words' : 'none', words: words(s.highlight) });
  handleRow(c, c.top + hd.height + sec);
  const d = t.shape.hardShadow;
  if (d) add(c, rect('cta-shadow', 'decor', M + d, barY + d, cw, bh, c.pal.line, { radius: t.shape.radius }));
  add(c, rect('cta', 'container', M, barY, cw, bh, c.pal.accent, { radius: t.shape.radius >= 30 ? bh / 2 : t.shape.radius, stroke: t.shape.outline ? { color: c.pal.line, width: t.shape.outline } : undefined }));
  c.notes.push(...lab.notes);
  add(c, { ...lab.layer, y: Math.round(barY + (bh - lab.height) / 2) });
  add(c, arrowRight('cta-arrow', M + cw - 44 - 90, barY + bh / 2 - 31, 90, c.pal.onAccent, t.shape.stroke));
  void pathLayer;
  void inkWidth;
}
