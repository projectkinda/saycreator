// The replication loop: draw samples with the person's own content in the candidate style, compare each with its reference, and let the
// reader refine the style in up to three rounds. Every round is kept. The best round is the one with the highest score (the measured
// similarity: palette distance, text-zone overlap and title size ratio; plus the reader's own judgement of how close the replica is).
// The loop stops after the first round that does not beat the best so far, and says which round was kept and why.
import type { CarouselScript } from '../image-engine/carousel/types';
import { composeStyled } from '../image-engine/styles/compose';
import type { LoadedStyle } from '../image-engine/styles/load';
import type { SlideType, StyleSpec } from '../image-engine/styles/format';
import { composeThumbs, type ThumbOption } from '../image-engine/thumbnail/v2/compose';
import { checkThumb, loadImage } from '../image-engine/thumbnail/v2/check';
import { analysePhoto } from '../image-engine/photo/analyse';
import type { PhotoInput } from '../image-engine/photo/zones';
import { FabricAdapter } from '../image-engine/fabric-adapter';
import { loadFonts } from '../image-engine/fonts';
import { EXAMPLE } from '../carousel/script';
import { renderer } from '../carousel/render';
import { guessFor } from '../thumbnail/render';
import { bitmapOf, cut, jpegUrl, pairImage, pxOfCanvas } from './images';
import type { Decision, JobHandle, LiveRound } from '../live/jobs';
import { decisionsOfPatches, decisionsOfSpec } from '../live/decisions';
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
  /** The sample slide was given a photo (because the reference shows one). */
  photo: boolean;
}
export interface RoundTiming {
  /** Drawing and measuring the replicas, ms. */
  renderMs: number;
  /** Making the reference-and-replica pictures for the reader, ms. */
  prepMs: number;
  /** The reader looking at them (the call to the reader), ms. */
  lookMs: number;
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
  /** Values of this round's style that were moved to what the toolbox supports, in plain words. */
  clamped: string[];
  /** 0 to 1: measured similarity, plus the reader's judgement when there is one. */
  score: number;
  ms: number;
  timing: RoundTiming;
  note?: string;
}

/** A round whose style the drawing refused. */
export class RoundError extends Error {}
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

const analysed = new Map<string, Promise<PhotoInput>>();
/** The sample photo with the numbers the layouts use to keep words readable over it. Read once per picture. */
const sampleInput = (p: SampleContent['photo']): Promise<PhotoInput> => {
  let a = analysed.get(p.url);
  if (!a) {
    a = analysePhoto(p.url, p.id, { label: 'sample' });
    analysed.set(p.url, a);
  }
  return a;
};

/** Draws every reference's sample in this style, measures it and compares it with the reference. A reference that shows a photo gets a photo slot. */
export async function renderReplicas(o: { spec: StyleSpec; target: Target; items: ReferenceItem[]; measured: Measured[]; seen: SlideType[]; content: SampleContent; photoItems: Set<string> }): Promise<Replica[]> {
  await loadFonts();
  const style = loaded(o.spec);
  const out: Replica[] = [];
  let adapter: FabricAdapter | null = null;
  try {
    for (let i = 0; i < o.items.length; i++) {
      const item = o.items[i];
      if (kindOf(item, o.target) === 'slide') {
        const type = slideOf(o.seen, i);
        const withPhoto = o.photoItems.has(item.id) || (o.measured[i].photo.present && o.measured[i].photo.share > 0.35);
        // A slide with a photo hint (and a photo to fill it) uses the style's photo layout; without one it never does.
        const slidesIn = EXAMPLE.slides.map((s) => (withPhoto && s.type === type ? { ...s, photo_hint: 'a photo like the reference' } : s));
        const script = { ...EXAMPLE, id: 'sample', title: o.content.title, slides: slidesIn } as unknown as CarouselScript;
        const slides = composeStyled(script, style, { width: 1080, height: 1350, handle: '@yourname', elements: 'shippable', ...(withPhoto ? { photos: [await sampleInput(o.content.photo)] } : {}) }, false);
        const at = Math.max(0, slides.findIndex((s) => s.type === type));
        const r = await renderer.render(slides[at], o.spec.spacing.margin);
        const m = await toPx(r.png);
        out.push({ itemId: item.id, url: URL.createObjectURL(r.png), blob: r.png, measured: m, similarity: similarity(o.measured[i], m), what: `${type} slide${withPhoto ? ' with a photo' : ''}`, photo: withPhoto });
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
            best = { itemId: item.id, url: URL.createObjectURL(c.png), blob: c.png, measured: m, similarity: s, what: `thumbnail, ${opt.layout}`, photo: true };
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
  /** The ids of the references that show a photo, a person, a device or an object (from the reader and from the measuring). */
  photoItems: Set<string>;
  /** Values of the first style that were moved to what the toolbox supports. */
  readClamps: string[];
  content: SampleContent;
  maxRounds?: number;
  signal: AbortSignal;
  onRound: (r: Round) => void;
  onPhase?: (text: string) => void;
  /** The Live view's record of this job: stages, pictures and decisions are written to it as the loop goes. */
  job?: JobHandle;
}

/** A round as the Live view shows it: small pictures of its replicas, the numbers and the decisions behind it. */
export async function liveRound(r: Round, decisions: Decision[], o?: { draft?: boolean }): Promise<LiveRound> {
  const pics = await Promise.all(r.replicas.slice(0, 6).map(async (rep) => {
    const bm = await bitmapOf(rep.blob);
    try {
      return await jpegUrl(bm, null, 420);
    } finally {
      bm.close();
    }
  }));
  const th = pics[0] ? pics[0].url : '';
  return { n: r.n, label: r.label, thumb: th, big: pics.map((p) => p.url), measuredPct: Math.round(r.similarity.total * 100), readerScore: r.judgement ? r.judgement.score : null, score: Math.round(r.score * 100), decisions, ...(o?.draft ? { draft: true } : {}) };
}

type Judged = { judgement: Judgement | null; patchesOut: { path: string; value: unknown }[]; refused: string[]; ms: number; note?: string };
const roundOf = async (o: LoopOptions, n: number, label: string, spec: StyleSpec, judged: Judged | null, clamped: string[]): Promise<Round> => {
  const t0 = performance.now();
  let replicas: Replica[];
  try {
    replicas = await renderReplicas({ spec, target: o.target, items: o.items, measured: o.measured, seen: o.seen, content: o.content, photoItems: o.photoItems });
  } catch (e) {
    // A style that passes the checks can still be one the drawing refuses (a value out of range): say so in plain words.
    throw new RoundError(`This style could not be drawn: ${(e as Error).message.replace(/^This plan cannot be drawn: /, '')}`);
  }
  const renderMs = Math.round(performance.now() - t0);
  const sim = meanSimilarity(replicas.map((r) => r.similarity));
  return { n, label, spec, replicas, similarity: sim, judgement: judged?.judgement ?? null, patchesOut: judged?.patchesOut ?? [], refused: judged?.refused ?? [], madeBy: [], clamped, score: scoreOf(sim, judged?.judgement ?? null), ms: renderMs + (judged?.ms ?? 0), timing: { renderMs, prepMs: 0, lookMs: judged?.ms ?? 0 }, note: judged?.note };
};

/** How many reference-and-replica pairs the reader is shown, and how tall each is: fewer and smaller means a faster call. */
const PAIRS_SHOWN = 4;

/** One look by the reader at a round's replica: its judgement and its patches. */
async function lookAt(o: LoopOptions, round: Round, n: number, feedback?: string) {
  const reader = o.reader!;
  const t0 = performance.now();
  const pairs = await Promise.all(
    round.replicas.slice(0, PAIRS_SHOWN).map(async (r, i) => {
      const item = o.items.find((x) => x.id === r.itemId)!;
      return { name: `pair${i + 1}.jpg`, image: await pairImage(item.dataUrl, r.blob, `pair${i + 1}.jpg`), reference: o.measured[o.items.indexOf(item)], replica: r.measured };
    }),
  );
  const prepMs = Math.round(performance.now() - t0);
  const look = await refineStyle({ reader, spec: round.spec, target: o.target, sections: o.sections, pairs: pairs.map((p) => ({ name: p.name, reference: p.reference, replica: p.replica })), images: pairs.map((p) => p.image), round: n, feedback, signal: o.signal });
  return { ...look, prepMs };
}

export type StopReason = 'no-improvement' | 'reader-stop' | 'no-patches' | 'last-round' | 'cannot-draw' | 'problem' | 'no-reader' | 'cancelled';

/** Draws the first replica, then up to three refinement rounds. Stops after the first round that does not improve. Returns every round. */
export async function runLoop(o: LoopOptions): Promise<{ rounds: Round[]; best: number; stopped: StopReason }> {
  const max = o.maxRounds ?? 3;
  const rounds: Round[] = [];
  o.onPhase?.('Drawing the first replica…');
  o.job?.begin('draw0', 'Draw round 1');
  let current = await roundOf(o, 0, 'First replica', o.spec, null, o.readClamps);
  o.job?.end('draw0');
  let liveDecisions = decisionsOfSpec(o.spec, o.measured, o.readClamps);
  if (o.job) o.job.round(await liveRound(current, liveDecisions));
  let best = 0;
  rounds.push(current);
  o.onRound(current);
  if (!o.reader) return { rounds, best, stopped: 'no-reader' };
  let stopped: StopReason = 'last-round';
  for (let k = 0; k <= max; k++) {
    if (o.signal.aborted) {
      stopped = 'cancelled';
      break;
    }
    o.onPhase?.(k === 0 ? 'The reader is looking at the first replica…' : `The reader is looking at round ${k}…`);
    o.job?.begin(`score${k}`, `Score round ${k + 1}: the reader looks at it`);
    o.job?.waiting('the reader');
    let look;
    try {
      look = await lookAt(o, current, k + 1);
    } catch (e) {
      o.job?.waiting(null);
      o.job?.fail(`score${k}`, (e as Error).message);
      throw e;
    }
    o.job?.waiting(null);
    o.job?.end(`score${k}`);
    // The reader's judgement belongs to the replica it saw.
    current = { ...current, judgement: look.judgement, patchesOut: look.patches, refused: look.refused, score: scoreOf(current.similarity, look.judgement), note: look.problem ?? current.note, ms: current.ms + look.ms + look.prepMs, timing: { ...current.timing, prepMs: look.prepMs, lookMs: look.ms } };
    rounds[rounds.length - 1] = current;
    o.onRound(current);
    if (o.job) o.job.round(await liveRound(current, liveDecisions));
    // A round is kept only when it beats the best so far; the first round that does not beat it ends the loop.
    const improved = rounds.length === 1 || current.score > rounds[best].score + 0.002;
    if (improved) best = rounds.length - 1;
    if (rounds.length > 1 && !improved) {
      stopped = 'no-improvement';
      break;
    }
    if (look.problem) {
      stopped = 'problem';
      break;
    }
    if (look.stop) {
      stopped = 'reader-stop';
      break;
    }
    if (look.patches.length === 0) {
      stopped = 'no-patches';
      break;
    }
    if (k === max) {
      stopped = 'last-round';
      break;
    }
    o.onPhase?.(`Drawing round ${k + 1}…`);
    o.job?.begin(`draw${k + 1}`, `Draw round ${k + 2}`);
    try {
      current = { ...(await roundOf(o, k + 1, `Round ${k + 1}`, look.spec, null, look.clamps)), madeBy: look.patches };
      o.job?.end(`draw${k + 1}`);
      liveDecisions = decisionsOfPatches(look.patches, look.refused, look.clamps);
    } catch (e) {
      // The patched style could not be drawn: keep what we have, and say why this round is missing.
      rounds[rounds.length - 1] = { ...rounds[rounds.length - 1], note: `The reader’s next changes could not be drawn, so the loop stopped here. ${(e as Error).message}` };
      o.onRound(rounds[rounds.length - 1]);
      stopped = 'cannot-draw';
      break;
    }
    rounds.push(current);
    o.onRound(current);
    if (o.job) o.job.round(await liveRound(current, liveDecisions));
  }
  if (o.job) {
    o.job.begin('keep', 'Keep the best round');
    o.job.keep(rounds[best].n);
    o.job.end('keep', keptSentence(rounds, best, stopped));
  }
  return { rounds, best, stopped };
}

/** Which round was kept and why, in plain words. */
export function keptSentence(rounds: Round[], best: number, stopped: StopReason): string {
  if (rounds.length === 0) return '';
  const b = rounds[best];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const own = `${best === 0 ? 'The first replica' : `Round ${best}`} was kept: its score of ${Math.round(b.score * 100)} (measured similarity ${pct(b.similarity.total)}${b.judgement ? `, the reader scores it ${Math.round(b.judgement.score)} out of 100` : ''}) is the highest of ${rounds.length} round${rounds.length === 1 ? '' : 's'}.`;
  const last = rounds[rounds.length - 1];
  const why: Record<StopReason, string> = {
    'no-improvement': ` Round ${last.n} scored ${Math.round(last.score * 100)}, no better, so the loop stopped there.`,
    'reader-stop': ' The reader said more changes would not help, so the loop stopped.',
    'no-patches': ' The reader had no more changes to suggest, so the loop stopped.',
    'last-round': ' The loop used all three refinement rounds.',
    'cannot-draw': ' The next changes could not be drawn, so the loop stopped.',
    problem: ' The reader’s next answer could not be used, so the loop stopped.',
    'no-reader': '',
    cancelled: ' It was cancelled.',
  };
  return own + why[stopped];
}

/** The person's own feedback ("bigger title") turned into patches by the reader, and one more round drawn from them. */
export async function applyFeedback(o: LoopOptions, from: Round, n: number, feedback: string): Promise<Round> {
  if (!o.reader) throw new Error('No reader is connected.');
  const look = await lookAt(o, from, n, feedback);
  const r = await roundOf(o, n, `Your feedback: “${feedback.slice(0, 40)}”`, look.spec, { judgement: null, patchesOut: [], refused: look.refused, ms: look.ms, note: look.problem }, look.clamps);
  return { ...r, madeBy: look.patches, timing: { ...r.timing, prepMs: look.prepMs } };
}
