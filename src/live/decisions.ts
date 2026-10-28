// What was decided, in plain words, each marked with where it came from: MEASURED (the code measured the picture and the style says the same),
// READER (the model said it), CLAMPED (moved to what the toolbox supports) or REJECTED (turned down, with the reason).
import type { StyleSpec } from '../image-engine/styles/format';
import type { Measured } from '../reference/types';
import type { Decision } from './jobs';

type Bag = Record<string, unknown>;
const isObj = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);
const hexOf = (v: unknown): string => (typeof v === 'string' ? v.toUpperCase() : isObj(v) && Array.isArray(v.stops) && isObj(v.stops[0]) ? String((v.stops[0] as Bag).color).toUpperCase() : '');
const near = (a: string, b: string) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (!/^#[0-9A-F]{6}$/.test(a) || !/^#[0-9A-F]{6}$/.test(b)) return false;
  const [x, y] = [p(a), p(b)];
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 36;
};

/** The decisions in a style as first read: the colours (measured when they match the measurement), type, shapes and anything added. */
export function decisionsOfSpec(spec: StyleSpec, measured: Measured[], clamps: string[]): Decision[] {
  const out: Decision[] = [];
  const pal = Object.values(spec.palettes)[0] as unknown as Bag | undefined;
  const m0 = measured[0];
  if (pal && m0) {
    const bg = hexOf(pal.bg);
    out.push({ text: `background → ${bg}`, source: near(bg, m0.background.toUpperCase()) ? 'MEASURED' : 'READER' });
    const tc = hexOf(pal.text);
    if (tc) out.push({ text: `text → ${tc}`, source: m0.textColour && near(tc, m0.textColour.toUpperCase()) ? 'MEASURED' : 'READER' });
    const ac = hexOf(pal.accent);
    if (ac) out.push({ text: `accent → ${ac}`, source: m0.palette.some((c) => near(ac, c.hex.toUpperCase())) ? 'MEASURED' : 'READER' });
  }
  out.push({ text: `title → ${spec.type.headline} px, ${spec.caseStyle} case, ${spec.fonts.headline} ${spec.fonts.headlineWeight}`, source: 'READER' });
  out.push({ text: `margin → ${spec.spacing.margin} px`, source: 'READER' });
  const added = [...(spec.elements?.rules.flatMap((r) => r.tags) ?? []), ...(spec.marks?.map((m) => m.kind) ?? [])];
  out.push({ text: added.length ? `added: ${[...new Set(added)].join(', ')}` : 'added: nothing (a blank base)', source: 'READER' });
  for (const c of clamps) out.push({ text: c, source: 'CLAMPED', why: 'the toolbox cannot draw the value that was asked for' });
  return out;
}

/** The decisions in one refinement round: each patch the reader asked for, each one refused, each value moved. */
export function decisionsOfPatches(patches: { path: string; value: unknown }[], refused: string[], clamps: string[]): Decision[] {
  const val = (v: unknown) => (isObj(v) || Array.isArray(v) ? 'a list of changes' : String(v));
  return [
    ...patches.map((p) => ({ text: `${p.path} → ${val(p.value)}`, source: 'READER' as const })),
    ...refused.map((r) => ({ text: r.split(':')[0], source: 'REJECTED' as const, why: r.includes(':') ? r.split(':').slice(1).join(':').trim() : 'not allowed' })),
    ...clamps.map((c) => ({ text: c, source: 'CLAMPED' as const, why: 'moved to what the toolbox supports' })),
  ];
}
