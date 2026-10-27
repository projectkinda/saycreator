// The replication loop: draw samples with the person's own content in the candidate style, compare each with its reference, and let the
// reader refine the style in up to three rounds. Every round is kept. The best round is the one with the highest score, which is the measured
// similarity (palette distance, text-zone overlap, title size ratio) plus the reader's own judgement of how close the replica is.
import type { CarouselScript } from '../image-engine/carousel/types';
import { composeStyled } from '../image-engine/styles/compose';
import type { LoadedStyle } from '../image-engine/styles/load';
import type { SlideType, StyleSpec } from '../image-engine/styles/format';
import { composeThumbs, type ThumbOption } from '../image-engine/thumbnail/v2/compose';
import { checkThumb, loadImage } from '../image-engine/thumbnail/v2/check';
import { FabricAdapter } from '../image-engine/fabric-adapter';
import { loadFonts } from '../image-engine/fonts';
import { EXAMPLE } from '../carousel/script';
import { renderer } from '../carousel/render';
import { guessFor } from '../thumbnail/render';
import { bitmapOf, cut, pairImage, pxOfCanvas } from './images';
import { refineStyle, type ReferenceReader } from './reader';
import { measure } from './measure';
import { meanSimilarity, similarity, type Similarity } from './similarity';
import type { Judgement, Measured, ReferenceItem, Target } from './types';

/** What the samples are made of: a title and a photo (the person's own, or a built-in sample). */
export interface SampleContent {
  title: string;
  photo: { id: string; url: string; width: number; height: number };
}

export interface Replica {
  itemId: string;
  /** An object URL of the replica's PNG. */
  url: string;
  blob: Blob;
  measured: Measured;
  similarity: Similarity;
  /** What was drawn: a slide type, or a thumbnail layout. */
  what: string;
}
export interface Round {
  n: number;
  label: string;
  spec: StyleSpec;
  replicas: Replica[];
  similarity: Similarity;
  /** The reader's judgement of this round's replica (null when it was not asked, for example after the person's own feedback). */
  judgement: Judgement | null;
  /** The patches the reader made from this round's replica (they make the next round), and what was refused. */
  patchesOut: { path: string; value: unknown }[];
  refused: string[];
  /** The patches that made this round from the one before it. */
  madeBy: { path: string; value: unknown }[];
  /** 0 to 1: measured similarity, plus the reader's judgement when there is one. */
  score: number;
  ms: number;
  note?: string;
}

export const scoreOf = (sim: Similarity, j: Judgement | null) => Math.round((j ? 0.7 * sim.total + 0.3 * (j.score / 100) : sim.total) * 1000) / 1000;
const loaded = (spec: StyleSpec): LoadedStyle => ({ spec, assets: {}, warnings: [] });

const kindOf = (item: ReferenceItem, target: Target): 'slide' | 'thumbnail' => (target === 'carousel' ? 'slide' : target === 'thumbnail' ? 'thumbnail' : item.width / item.height > 1.3 ? 'thumbnail' : 'slide');
const slideOf = (seen: SlideType[], i: number): SlideType => seen[i % Math.max(1, seen.length)] ?? 'cover';

async function toPx(blob: Blob): Promise<Measured> {
  const bm = await bitmapOf(blob);
  const m = measure(pxOfCanvas(cut(bm, null, 420)));
  bm.close();
  return m;
}

/** Draws every reference's sample in this style, measures it and compares it with the reference. */
export async function renderReplicas(o: { spec: StyleSpec; target: Target; items: ReferenceItem[]; measured: Measured[]; seen: SlideType[]; content: SampleContent }): Promise<Replica[]> {
  await loadFonts();
  const style = loaded(o.spec);
  const out: Replica[] = [];
  let adapter: FabricAdapter | null = null;
  try {
    for (let i = 0; i < o.items.length; i++) {
      const item = o.items[i];
      if (kindOf(item, o.target) === 'slide') {
        const type = slideOf(o.seen, i);
        const script = { ...EXAMPLE, id: 'sample', title: o.content.title, slides: EXAMPLE.slides } as unknown as CarouselScript;
        const slides = composeStyled(script, style, { width: 1080, height: 1350, handle: '@yourname', elements: 'shippable' }, false);
        const at = Math.max(0, slides.findIndex((s) => s.type === type));
        const r = await renderer.render(slides[at], o.spec.spacing.margin);
        const m = await toPx(r.png);
        out.push({ itemId: item.id, url: URL.createObjectURL(r.png), blob: r.png, measured: m, similarity: similarity(o.measured[i], m), what: `${type} slide` });
      } else {
        const aspect = item.width >= item.height ? '16:9' : '9:16';
        const subject = await guessFor(o.content.photo.id).catch(() => ({ x: 0.5, y: 0.5 }));
        const opts: ThumbOption[] = composeThumbs({ aspect, title: o.content.title, photo: { id: o.content.photo.id, src: o.content.photo.url, width: o.content.photo.width, height: o.content.photo.height }, subject, seed: 'reference' }, style).slice(0, 4);
        if (!adapter) {
          adapter = new FabricAdapter();
          await adapter.mount(null);
        }
        const img = await loadImage(o.content.photo.url);
        const src = { photo: { img, width: img.naturalWidth, height: img.naturalHeight } };
        let best: Replica | null = null;
        for (const opt of opts) {
          const c = await checkThumb(adapter, opt, src);
          const m = await toPx(c.png);
          const s = similarity(o.measured[i], m);
          if (!best || s.total > best.similarity.total) {
            if (best) URL.revokeObjectURL(best.url);
            best = { itemId: item.id, url: URL.createObjectURL(c.png), blob: c.png, measured: m, similarity: s, what: `thumbnail, ${opt.layout}` };
          }
        }
        if (best) out.push(best);
      }
    }
  } finally {
    adapter?.dispose();
  }
  return out;
}

export interface LoopOptions {
  reader: ReferenceReader | null;
  spec: StyleSpec;
  target: Target;
  sections: string[];
  items: ReferenceItem[];
  measured: Measured[];
  seen: SlideType[];
  content: SampleContent;
  maxRounds?: number;
  signal: AbortSignal;
  onRound: (r: Round) => void;
  onPhase?: (text: string) => void;
}

const roundOf = async (o: LoopOptions, n: number, label: string, spec: StyleSpec, judged: { judgement: Judgement | null; patchesOut: { path: string; value: unknown }[]; refused: string[]; ms: number; note?: string } | null): Promise<Round> => {
  const t0 = performance.now();
  const replicas = await renderReplicas({ spec, target: o.target, items: o.items, measured: o.measured, seen: o.seen, content: o.content });
  const sim = meanSimilarity(replicas.map((r) => r.similarity));
  return { n, label, spec, replicas, similarity: sim, judgement: judged?.judgement ?? null, patchesOut: judged?.patchesOut ?? [], refused: judged?.refused ?? [], madeBy: [], score: scoreOf(sim, judged?.judgement ?? null), ms: Math.round(performance.now() - t0 + (judged?.ms ?? 0)), note: judged?.note };
};

/** One look by the reader at a round's replica: its judgement and its patches. */
async function lookAt(o: LoopOptions, round: Round, n: number, feedback?: string) {
  const reader = o.reader!;
  const pairs = await Promise.all(
    round.replicas.slice(0, 6).map(async (r, i) => {
      const item = o.items.find((x) => x.id === r.itemId)!;
      return { name: `pair${i + 1}.jpg`, image: await pairImage(item.dataUrl, r.blob, `pair${i + 1}.jpg`), reference: o.measured[o.items.indexOf(item)], replica: r.measured };
    }),
  );
  return refineStyle({ reader, spec: round.spec, target: o.target, sections: o.sections, pairs: pairs.map((p) => ({ name: p.name, reference: p.reference, replica: p.replica })), images: pairs.map((p) => p.image), round: n, feedback, signal: o.signal });
}

/** Draws the first replica, then up to three refinement rounds. Stops early when a round does not improve. Returns every round. */
export async function runLoop(o: LoopOptions): Promise<{ rounds: Round[]; best: number }> {
  const max = o.maxRounds ?? 3;
  const rounds: Round[] = [];
  o.onPhase?.('Drawing the first replica…');
  let current = await roundOf(o, 0, 'First replica', o.spec, null);
  let best = 0;
  rounds.push(current);
  o.onRound(current);
  if (!o.reader) return { rounds, best };
  for (let k = 0; k <= max; k++) {
    if (o.signal.aborted) break;
    o.onPhase?.(k === 0 ? 'The reader is looking at the first replica…' : `The reader is looking at round ${k}…`);
    const look = await lookAt(o, current, k + 1);
    // The reader's judgement belongs to the replica it saw.
    current = { ...current, judgement: look.judgement, patchesOut: look.patches, refused: look.refused, score: scoreOf(current.similarity, look.judgement), note: look.problem ?? current.note, ms: current.ms + look.ms };
    rounds[rounds.length - 1] = current;
    o.onRound(current);
    if (current.score > rounds[best].score || rounds.length === 1) best = rounds.length - 1;
    const noPatches = look.patches.length === 0;
    // Stop when it is the last look, the reader says stop, there was nothing to patch, or this round did not beat the best so far.
    const improved = rounds.length === 1 || current.score >= rounds[best].score;
    if (k === max || look.stop || noPatches || look.problem || (rounds.length > 1 && !improved)) break;
    o.onPhase?.(`Drawing round ${k + 1}…`);
    current = { ...(await roundOf(o, k + 1, `Round ${k + 1}`, look.spec, null)), madeBy: look.patches };
    rounds.push(current);
    o.onRound(current);
  }
  return { rounds, best };
}

/** The person's own feedback ("bigger title") turned into patches by the reader, and one more round drawn from them. */
export async function applyFeedback(o: LoopOptions, from: Round, n: number, feedback: string): Promise<Round> {
  if (!o.reader) throw new Error('No reader is connected.');
  const look = await lookAt(o, from, n, feedback);
  const r = await roundOf(o, n, `Your feedback: “${feedback.slice(0, 40)}”`, look.spec, { judgement: null, patchesOut: [], refused: look.refused, ms: look.ms, note: look.problem });
  return { ...r, madeBy: look.patches };
}
