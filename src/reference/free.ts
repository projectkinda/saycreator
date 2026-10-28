// Builds a free layout from what the code detected in a reference (regions.ts), with no model. Roles are guessed from size and place (the one reader
// call then labels them properly); what the drawing cannot do is listed as missing for this reference, ranked, never dropped silently.
import type { FreeBox, FreeLayout, FreeRole, FreeShape, FreeSlot, FreeTreatment } from '../image-engine/styles/free-spec';
import { MAX_PHOTOS, MAX_SHAPES, MAX_SLOTS } from '../image-engine/styles/free-spec';
import type { Detected, TextBlock, Treatment } from './regions';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (n: number) => Math.round(n * 10) / 10;
const pad = (b: FreeBox, px: number, py: number): FreeBox => {
  const x = clamp(b.x - px, 0, 100);
  const y = clamp(b.y - py, 0, 100);
  return { x: round1(x), y: round1(y), w: round1(Math.min(100 - x, b.w + 2 * px)), h: round1(Math.min(100 - y, b.h + 2 * py)) };
};

/** A detected text treatment as one the drawing can do, or null when it cannot. */
function drawable(t: Treatment): FreeTreatment | null {
  if (t.kind === 'caps') return { kind: 'caps' };
  if (t.kind === 'outline') return { kind: 'outline', colour: t.colour };
  if (t.kind === 'shadow') return { kind: 'shadow', colour: t.colour };
  if (t.kind === 'tilt') return { kind: 'tilt', angle: t.angle };
  return null;
}

/** The role a text block most likely has, from its size, place and what sits under it. */
function guessRoles(texts: TextBlock[], shapes: Detected['shapes']): Map<string, FreeRole> {
  const roles = new Map<string, FreeRole>();
  const bySize = [...texts].sort((a, b) => b.fontPx * Math.max(1, b.lines.length) - a.fontPx * Math.max(1, a.lines.length));
  const title = bySize[0];
  if (title) roles.set(title.id, 'title');
  for (const t of bySize.slice(1)) {
    const onShape = shapes.find((s) => s.holds === t.id);
    if (onShape && (onShape.kind === 'pill' || onShape.kind === 'rounded' || onShape.kind === 'rect') && t.lines.length === 1 && t.box.w < 55 && onShape.box.h < 12) roles.set(t.id, 'button');
    else if (title && t.fontPx < title.fontPx * 0.45 && t.lines.length === 1 && (t.box.y < 14 || t.box.y > 88)) roles.set(t.id, 'label');
    else if (title && t.box.y >= title.box.y && t.fontPx >= title.fontPx * 0.35 && !roles.has(t.id) && ![...roles.values()].includes('subtitle')) roles.set(t.id, 'subtitle');
    else roles.set(t.id, t.lines.length >= 2 || t.box.w > 40 ? 'body' : 'label');
  }
  return roles;
}

export function buildFree(d: Detected): { free: FreeLayout; pendingMarks: { id: string; box: FreeBox; colour: string }[]; clamps: string[] } {
  const clamps: string[] = [];
  const roles = guessRoles(d.texts, d.shapes);
  const missing: string[] = [];
  const texts = [...d.texts].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h).slice(0, MAX_SLOTS);
  if (d.texts.length > MAX_SLOTS) missing.push(`${d.texts.length - MAX_SLOTS} small text blocks beyond the ${MAX_SLOTS} a slide can have were left out`);
  const slots: FreeSlot[] = texts.map((t) => {
    const treatments: FreeTreatment[] = [];
    for (const tr of t.treatments) {
      const ok = drawable(tr);
      if (ok) treatments.push(ok);
      else if (!tr.supported && tr.kind !== 'over-photo') missing.push(`${t.id}: ${tr.detail}`);
    }
    if (t.fontPx < 32) clamps.push(`${t.id}: the text is about ${t.fontPx} px in the reference, raised to the phone minimum of 32 px`);
    return {
      id: t.id,
      role: roles.get(t.id) ?? 'body',
      box: pad(t.box, 1.2, 0.6),
      align: t.align,
      maxLines: clamp(t.lines.length, 1, 12),
      anchor: 'middle',
      sizePx: clamp(t.fontPx, 32, 420),
      colour: t.colour,
      weight: t.weight,
      treatments,
    };
  });
  const shapes: FreeShape[] = d.shapes.slice(0, MAX_SHAPES).map((s) => ({ id: s.id, kind: s.kind, box: s.box, colour: s.colour }));
  for (const g of d.graphics) if (g.kind === 'ring' && shapes.length < MAX_SHAPES) shapes.push({ id: g.id, kind: 'ring', box: g.box, colour: g.colour });
  const pendingMarks = d.graphics.filter((g) => g.kind === 'mark').map((g) => ({ id: g.id, box: g.box, colour: g.colour }));
  if (pendingMarks.length) missing.push(`${pendingMarks.length} graphic${pendingMarks.length === 1 ? '' : 's'} (${pendingMarks.map((m) => m.id).join(', ')}) not identified yet: they are drawn once the reader says what they are, and only if the toolbox has them`);
  const free: FreeLayout = {
    background: { kind: d.background.kind === 'photo' ? 'flat' : d.background.kind, colours: d.background.colours, ...(d.background.direction ? { direction: d.background.direction } : {}), ...(d.background.split !== undefined ? { split: d.background.split } : {}) },
    photos: d.photos.slice(0, MAX_PHOTOS).map((p) => ({ id: p.id, box: p.box, shape: p.shape })),
    shapes,
    graphics: [],
    slots,
    missing: [...new Set(missing)],
  };
  return { free, pendingMarks, clamps };
}

/** What the detection found that the drawing cannot do, ranked by how many times it was found (for the closeness panel). */
export function missingRanked(lists: string[][]): { what: string; count: number }[] {
  const n = new Map<string, number>();
  for (const l of lists)
    for (const m of l) {
      const key = m.replace(/^text\d+: /, '').replace(/\(#[0-9A-F]{6}\)/g, '').trim();
      n.set(key, (n.get(key) ?? 0) + 1);
    }
  return [...n.entries()].map(([what, count]) => ({ what, count })).sort((a, b) => b.count - a.count);
}
