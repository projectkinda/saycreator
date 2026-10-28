// The cost of a job in model use, counted where the calls are made. Every call goes through `counted`: it is refused when the job's cap is reached,
// so a call that the person did not start, or that the cap does not allow, cannot happen. Tokens are only known if the reader reports them.
import { ReaderError, type ReferenceReader } from './reader';

export interface Cost {
  calls: number;
  images: number;
  /** Null: the reader does not report tokens (the Claude Code command line, as run here, does not). */
  tokens: number | null;
  cap: number;
}
/** Calls a job may make by default: the first read, and one "Improve" the person asks for with their own words. */
export const DEFAULT_CAP = 2;
/** With the Advanced toggle on: the first read, the automatic rounds (up to 3 looks, each with a second try), and the person's own improvements. */
export const ADVANCED_CAP = 10;

export const freshCost = (cap = DEFAULT_CAP): Cost => ({ calls: 0, images: 0, tokens: null, cap });

/** A reader that counts: it adds to `cost` before each call and refuses the call when the cap is reached. */
export function counted(inner: ReferenceReader, cost: { current: Cost }, onChange: (c: Cost) => void): ReferenceReader {
  return {
    id: inner.id,
    label: inner.label,
    async read(call, signal) {
      if (cost.current.calls >= cost.current.cap) throw new ReaderError('failed', `The limit of ${cost.current.cap} model calls for this job is reached, so no more were made. Turn on Advanced to allow more.`);
      cost.current = { ...cost.current, calls: cost.current.calls + 1, images: cost.current.images + call.images.length };
      onChange(cost.current);
      return inner.read(call, signal);
    },
  };
}
