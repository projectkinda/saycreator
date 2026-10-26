// Turns a style's photo settings into plain values for one slide: "$accent" becomes that colour of the slide's own palette.
// Pure (no DOM).
import type { Treatment } from '../types';

type PaletteLike = Record<string, unknown>;

/** A colour string that may be "$role" (a palette colour name). A gradient background has no single colour, so its first stop stands in. */
export function resolveColor(v: string, pal: PaletteLike): string {
  if (!v.startsWith('$')) return v;
  const c = pal[v.slice(1)];
  if (typeof c === 'string') return c;
  const stops = (c as { stops?: { color: string }[] } | undefined)?.stops;
  return stops?.[0]?.color ?? '#000000';
}

/** The same treatments with every "$role" colour replaced. */
export function resolveTreatments(list: Treatment[], pal: PaletteLike): Treatment[] {
  return list.map((t) => {
    const out: Record<string, unknown> = { ...t };
    for (const [k, v] of Object.entries(out)) if (typeof v === 'string' && v.startsWith('$')) out[k] = resolveColor(v, pal);
    return out as unknown as Treatment;
  });
}
