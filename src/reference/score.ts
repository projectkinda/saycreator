// How close the replica is in layout, measured the same way on both: the detection of the reference against the detection of the replica. Overlap is
// intersection over union of the boxes. Text regions are compared block by block (each reference block against the replica block that fits it best, weighted
// by its area); photos, shapes and graphics the same; the title size as a ratio; and how many of the text treatments found in the reference also show
// up in the replica.
import type { Box, Detected } from './regions';
import { overlap } from './truth';

export interface LayoutScore {
  /** 0 to 1, or null when the reference has none of this. */
  text: number | null;
  photo: number | null;
  shapes: number | null;
  graphics: number | null;
  /** Smaller title over bigger title (1 is the same size), or null. */
  titleRatio: number | null;
  treatments: { found: number; reproduced: number; missing: string[] };
}

const area = (b: Box) => b.w * b.h;
function matchAll(ref: Box[], rep: Box[]): number | null {
  if (ref.length === 0) return null;
  const total = ref.reduce((a, b) => a + area(b), 0) || 1;
  return ref.reduce((a, b) => a + area(b) * Math.max(0, ...rep.map((r) => overlap(b, r).iou)), 0) / total;
}

export function scoreLayout(ref: Detected, rep: Detected): LayoutScore {
  const refTitle = Math.max(0, ...ref.texts.map((t) => t.fontPx));
  const repTitle = Math.max(0, ...rep.texts.map((t) => t.fontPx));
  const repKinds = new Set(rep.texts.flatMap((t) => t.treatments.map((x) => x.kind)));
  // A highlight or text-on-shape counts as reproduced when the replica has a shape holding text; an underline when it has a bar.
  const repHasHolder = rep.shapes.some((s) => s.holds);
  const repHasBar = rep.shapes.some((s) => s.kind === 'bar');
  const refTreat = ref.texts.flatMap((t) => t.treatments).filter((t) => t.kind !== 'over-photo');
  const missing: string[] = [];
  let reproduced = 0;
  for (const t of refTreat) {
    const ok = repKinds.has(t.kind) || ((t.kind === 'highlight-box' || t.kind === 'on-shape') && repHasHolder) || (t.kind === 'underline' && repHasBar) || (t.kind === 'circled' && rep.graphics.some((g) => g.kind === 'ring'));
    if (ok) reproduced++;
    else missing.push(t.detail);
  }
  return {
    text: matchAll(ref.texts.map((t) => t.box), rep.texts.map((t) => t.box)),
    photo: matchAll(ref.photos.map((p) => p.box), rep.photos.map((p) => p.box)),
    shapes: matchAll(ref.shapes.map((p) => p.box), rep.shapes.map((p) => p.box)),
    graphics: matchAll(ref.graphics.map((p) => p.box), [...rep.graphics.map((p) => p.box), ...rep.shapes.map((p) => p.box)]),
    titleRatio: refTitle && repTitle ? Math.min(refTitle, repTitle) / Math.max(refTitle, repTitle) : null,
    treatments: { found: refTreat.length, reproduced, missing },
  };
}

export const pctText = (v: number | null) => (v === null ? 'none in the reference' : `${Math.round(v * 100)}%`);
export function meanOf(list: (number | null)[]): number | null {
  const v = list.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
