// The honest closeness panel: what matched (measured), what is only approximated, what was extrapolated, and what the toolbox cannot do.
// It never says a result is identical or perfect. Pure.
import { SLIDE_TYPES, type SlideType } from '../image-engine/styles/format';
import type { Round } from './loop';
import type { Judgement, MissingTool, Target } from './types';

export interface Closeness {
  /** One line per measured number, and which side of "matched" it falls on. */
  matched: string[];
  approximated: string[];
  /** Slide types the references did not show: the style made them up from what it saw. */
  extrapolated: SlideType[];
  /** "Built from one image. Other slide types are extrapolated from it." when that is so. */
  singleImage: string | null;
  missing: MissingTool[];
  /** The reader's own words about the replica it looked at. */
  reader: Judgement | null;
  /** The reader's score and the measured total, as a plain sentence (no claim of a perfect copy). */
  summary: string;
}

export const SINGLE_IMAGE_NOTE = 'Built from one image. Other slide types are extrapolated from it.';
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function closenessOf(round: Round, o: { itemCount: number; seen: SlideType[]; target: Target; missing: MissingTool[] }): Closeness {
  const s = round.similarity;
  const matched: string[] = [];
  const approximated: string[] = [];
  (s.palette >= 0.75 ? matched : approximated).push(`Colours: the replica's palette is ${s.palette >= 0.75 ? 'close to' : 'noticeably different from'} the reference (mean colour distance ${s.paletteDistance}; under about 10 looks the same, over 30 is clearly different).`);
  (s.zones >= 0.5 ? matched : approximated).push(`Where the words sit: ${pct(s.zones)} of the text areas overlap the reference's.`);
  (s.title >= 0.8 ? matched : approximated).push(`Title size: the replica's biggest line is ${pct(s.title)} of the size of the reference's (the smaller over the bigger).`);
  const extrapolated = o.target === 'thumbnail' ? [] : SLIDE_TYPES.filter((t) => !o.seen.includes(t));
  const j = round.judgement;
  return {
    matched,
    approximated,
    extrapolated,
    singleImage: o.itemCount === 1 ? SINGLE_IMAGE_NOTE : null,
    missing: o.missing,
    reader: j,
    summary: `Measured similarity ${pct(s.total)}${j ? `, the reader scores it ${Math.round(j.score)} out of 100` : ''}. It is as close as our toolbox allows, not a copy.`,
  };
}

/** The missing tools of several runs, most-needed first: how many references need each one. */
export function rankMissing(runs: { name: string; missing: MissingTool[] }[]): { tool: string; count: number; references: string[]; why: string }[] {
  const by = new Map<string, { tool: string; refs: Set<string>; why: string }>();
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const r of runs)
    for (const m of r.missing) {
      const k = key(m.tool);
      const e = by.get(k) ?? { tool: m.tool, refs: new Set<string>(), why: m.why };
      e.refs.add(r.name);
      by.set(k, e);
    }
  return [...by.values()].map((e) => ({ tool: e.tool, count: e.refs.size, references: [...e.refs], why: e.why })).sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool));
}
