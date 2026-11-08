// Vector art from a preset's own pack (src/image-engine/art), placed in the safe zones of a finished slide and recoloured to the slide's palette. Same rules as every other device:
//  - off unless the preset lists art (deco.art) and the style panel has not switched it off;
//  - never over text (a clear gap from every text, shape and picture), never over another device;
//  - contrast floor: a line, ring or star that is not a soft background must read 3:1 against the ground, else it takes the ink colour; an item that would be invisible is not drawn;
//  - every item reports its box, so the checks see it.
import { artItem, artMarkup, type ArtItem, type ArtPalette } from '../../image-engine/art/art';
import type { ArtPlacement } from '../../reference/deco';
import { contrast } from './draw';
import { hit, type Box, type DeviceCtx, type PlacedDevice } from './devices';

export interface ArtPlan {
  /** Soft background items (glows): drawn first. */
  behind: string;
  /** Everything else. */
  over: string;
  placed: PlacedDevice[];
  notes: string[];
}

const matches = (on: ArtPlacement['on'], i: number, n: number) => !on || on === 'all' || (on === 'first' && i === 0) || (on === 'last' && i === n - 1) || (on === 'inner' && i > 0 && i < n - 1);
const inCanvas = (b: Box): Box | null => {
  const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y), x1 = Math.min(1080, b.x + b.w), y1 = Math.min(1350, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
};

/** The palette an item is drawn in on this slide, with the contrast floor applied. */
function paletteFor(it: ArtItem, x: DeviceCtx): { pal: ArtPalette; ink: string; visible: boolean } {
  const c = x.c;
  const soft = it.role === 'background';
  const floor = soft ? 1.2 : 3;
  const pick = (col: string) => (contrast(col, c.bg) >= floor ? col : contrast(c.text, c.bg) >= contrast(col, c.bg) ? c.text : col);
  const pal: ArtPalette = { primary: pick(c.accent), accent: pick(c.accent), ink: pick(c.text), surface: c.surface, bg: c.bg };
  const used = it.tokens.length ? it.tokens : ['primary'];
  // an item drawn only in the ground colour or the card colour would not be seen on this slide
  const seen = used.some((t) => t !== 'bg' && contrast(pal[t as keyof ArtPalette], c.bg) >= 1.15);
  const main = (used.find((t) => t === 'primary' || t === 'ink' || t === 'accent') ?? used[0]) as keyof ArtPalette;
  return { pal, ink: pal[main], visible: seen };
}

export function artDevices(x: DeviceCtx, taken: PlacedDevice[], shapeBoxes: Box[], pictureBoxes: Box[] = []): ArtPlan {
  const list = x.deco.art;
  const out: ArtPlan = { behind: '', over: '', placed: [], notes: [] };
  if (!list?.length) return out;
  const busy: Box[] = [
    ...x.textBoxes.map((b) => ({ ...b, gap: Math.max(b.gap ?? 0, 24) })),
    ...shapeBoxes.map((b) => ({ ...b, gap: 24 })),
    ...pictureBoxes.map((b) => ({ ...b, gap: 24 })),
    ...taken.filter((p) => p.id !== 'glow' && p.id !== 'rule' && p.id !== 'scallop' && p.id !== 'inset-card').map((p) => ({ ...p.box, gap: 24 })),
  ];
  const free = (b: Box) => !busy.some((q) => hit(b, q, q.gap ?? 24));
  list.forEach((p, k) => {
    if (!matches(p.on, x.index, x.total)) return;
    const it = artItem(p.item);
    if (!it) { out.notes.push(`Art "${p.item}" is not in the art folder.`); return; }
    const { pal, ink, visible } = paletteFor(it, x);
    if (!visible) { out.notes.push(`Art "${p.item}" would not show on this ground, so it is left out.`); return; }
    const ratio = it.bbox.h / it.bbox.w;
    let w = p.w ?? (p.zone === 'top-edge' || p.zone === 'bottom-edge' ? 1080 : p.zone.startsWith('divider') ? Math.min(320, it.bbox.w) : 220);
    if (p.zone === 'top-edge' || p.zone === 'bottom-edge') w = Math.min(1080, w);
    const h = w * ratio;
    const bleed = Math.max(0, Math.min(0.5, p.bleed ?? 0));
    let spot: { x: number; y: number } | null = null;
    const ok = (px: number, py: number) => { const vis = inCanvas({ x: px, y: py, w, h }); return !!vis && free(vis); };
    if (p.zone === 'top-edge') {
      // an edge row keeps its own vertical offset when the pack bled it off the page (the star row sits half off the top)
      const y = it.source.at.y < 0 ? Math.max(-h, (it.source.at.y * w) / it.bbox.w) : 0;
      if (ok(Math.round((1080 - w) / 2), y)) spot = { x: Math.round((1080 - w) / 2), y };
    } else if (p.zone === 'bottom-edge') {
      const y = 1350 - h * (1 - bleed);
      if (ok(Math.round((1080 - w) / 2), y)) spot = { x: Math.round((1080 - w) / 2), y };
    } else if (p.zone.startsWith('corner')) {
      const left = p.zone.endsWith('l') || p.zone.endsWith('tl') || p.zone === 'corner-bl';
      const top = p.zone === 'corner-tl' || p.zone === 'corner-tr';
      for (let dx = 0; dx <= 360 && !spot; dx += 24) for (let dy = 0; dy <= 360 && !spot; dy += 24) {
        const px = left ? 48 - bleed * w + dx : 1032 - w + bleed * w - dx;
        const py = top ? 150 - bleed * h + dy : 1250 - h + bleed * h - dy;
        if (ok(px, py)) spot = { x: px, y: py };
      }
    } else {
      const xs = [48, Math.round((1080 - w) / 2), 1032 - w];
      const ys: number[] = [];
      if (p.zone === 'divider-low') for (let y = 1226; y >= 1100; y -= 8) ys.push(y);
      else for (let y = 150; y <= 280; y += 8) ys.push(y);
      for (const y of ys) { for (const px of xs) if (!spot && ok(px, y)) spot = { x: px, y }; if (spot) break; }
    }
    if (!spot) { out.notes.push(`No clear spot for the art "${p.item}" (${p.zone}) on this slide.`); return; }
    const mk = artMarkup(it, spot.x, spot.y, w, pal, `art${x.index}x${k}`);
    if (!mk) return;
    if (it.role === 'background') out.behind += mk; else out.over += mk;
    const box = inCanvas({ x: spot.x, y: spot.y, w, h }) as Box;
    out.placed.push({ id: `art:${p.item}`, kind: 'decor', box, ink });
    busy.push({ ...box, gap: 24 });
  });
  return out;
}
