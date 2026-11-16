/**
 * Round S: the person's own remove / move of a slide in Edit slides. Pure helpers: the new order of the deck, the slide-keyed records renumbered, and the record of what the person did
 * (stored in the plan's library report, so a restyle, a colour or brand change, the picker and text edits keep it, it is saved with the project, and Undo takes it back with the rest).
 * The code never re-enforces the build rules (picture layout twice in a row, the cap, the closing last) on a manual move: the person chose the order.
 */

/** What the person did, slide numbers 1-based as they were at the time. `sentences`: the sentences of the text that were on no slide any more once that slide went. */
export interface ManualEdits {
  removed: { slide: number; layout: string; sentences: string[] }[];
  moved: { from: number; to: number }[];
}
export type ArrangeOp = { kind: 'remove' } | { kind: 'move'; by: -1 | 1 };

/** The fewest slides a deck may have (the script's own rule): a carousel needs 3, a quote set 1. */
export const minSlides = (format: 'carousel' | 'quote'): number => (format === 'quote' ? 1 : 3);

/** order[new position] = old position, or a plain reason when the action cannot be done. */
export function arrangeOrder(n: number, i: number, op: ArrangeOp, min: number): number[] | string {
  const all = Array.from({ length: n }, (_, k) => k);
  if (i < 0 || i >= n) return 'There is no such slide.';
  if (op.kind === 'remove') return n <= min ? removeBlockedLine(min) : all.filter((k) => k !== i);
  const j = i + op.by;
  if (j < 0) return 'The first slide cannot move up.';
  if (j >= n) return 'The last slide cannot move down.';
  [all[i], all[j]] = [all[j], all[i]];
  return all;
}

/** The plain line under the disabled "Remove slide". */
export const removeBlockedLine = (min: number): string => (min <= 1 ? 'This is the only slide left, so it cannot be removed.' : `A carousel needs at least ${min} slides, so no slide can be removed.`);

/** A list in the new order. */
export const reorder = <T,>(a: readonly T[], order: number[]): T[] => order.map((k) => a[k]);

/** A record keyed by slide number ("0" first) in the new order: a removed slide's entry goes. */
export function remapKeys<V>(rec: Record<string, V>, order: number[]): Record<string, V> {
  const out: Record<string, V> = {};
  order.forEach((old, pos) => {
    if (rec[String(old)] !== undefined) out[String(pos)] = rec[String(old)];
  });
  return out;
}

/** The new position of the slide that was at `old` (-1: removed). */
export const newIndexOf = (order: number[], old: number): number => order.indexOf(old);

/** The record after one more action. */
export function recordEdit(prev: ManualEdits | undefined, i: number, op: ArrangeOp, layout: string, sentences: string[] = []): ManualEdits {
  const base: ManualEdits = { removed: [...(prev?.removed ?? [])], moved: [...(prev?.moved ?? [])] };
  if (op.kind === 'remove') base.removed.push({ slide: i + 1, layout, sentences });
  else base.moved.push({ from: i + 1, to: i + 1 + op.by });
  return base;
}

/** The undo label of an action (the status Undo shows while this is the last step). */
export const arrangeLabel = (i: number, op: ArrangeOp): string => (op.kind === 'remove' ? `Remove slide ${i + 1}` : `Move slide ${i + 1} ${op.by < 0 ? 'up' : 'down'}`);

/** "slide 4", "slides 4 and 6", "slides 2, 4 and 6". */
export function slidesWord(nums: number[]): string {
  const u = [...new Set(nums)];
  if (u.length === 1) return `slide ${u[0]}`;
  return `slides ${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
}

/**
 * The sentences notice after a removal: "2 of 9 sentences from your text are not on any slide (you removed slide 4)." When only some of the missing sentences went with a removed slide,
 * it says how many: "(1 of them because you removed slide 4)". With no removal (or none that took a sentence) the plain Round M line.
 */
export function sentencesLine(count: number, total: number, missing: string[], edits: ManualEdits | undefined): string {
  const head = `${count} of ${total} sentence${total === 1 ? '' : 's'} from your text ${count === 1 ? 'is' : 'are'} not on any slide`;
  const gone = new Set(missing);
  const by = (edits?.removed ?? []).filter((r) => r.sentences.some((s) => gone.has(s)));
  if (!by.length) return head + '.';
  const caused = new Set(by.flatMap((r) => r.sentences.filter((s) => gone.has(s)))).size;
  const who = `you removed ${slidesWord(by.map((r) => r.slide))}`;
  return caused >= count ? `${head} (${who}).` : `${head} (${caused} of them because ${who}).`;
}
