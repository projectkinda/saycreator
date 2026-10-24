// How a step puts its results on the Results screen (/lab, menu: Results).
// RULE: every new step ends its tests by calling writeStepResults(). The screen picks the file up on its own, newest
// step first, with a "last run" time, a refresh button, verdict boxes and the JSON export. The folders under out/ are backup only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const RESULTS_DIR = path.join(ROOT, 'out/image-engine/results');

export interface ResultsImage {
  /** A URL the dev server can serve, for example "/out/image-engine/step5/thing.png". */
  url: string;
  label?: string;
  /** Opened when the picture is clicked. Defaults to url. */
  full?: string;
  /** Show it on this background (for cutouts). */
  background?: 'checker' | 'dark' | 'light' | 'colour';
}
export interface ResultsItem {
  id: string;
  title: string;
  images: ResultsImage[];
  /** Leave out when nothing checks this item automatically. */
  checker?: { pass: boolean; reasons: string[] };
  /** Short facts: model, backend, times, sizes. */
  facts?: string[];
  /** For example "TOY: plumbing test only" or "REAL". */
  tag?: string;
  /** A failure to show instead of hiding. */
  error?: string;
}
export interface StepResults {
  /** Becomes the file name, for example "step5". */
  id: string;
  /** For example "Step 5: Style system". */
  title: string;
  /** Bigger is newer; sections are sorted by it, newest first. Use the step number. */
  order: number;
  intro?: string;
  groups: { title: string; note?: string; items: ResultsItem[] }[];
}

/** Turns an absolute path under out/ into the URL the dev server serves. */
export const outUrl = (file: string) => '/' + path.relative(ROOT, file).split(path.sep).join('/');

export function writeStepResults(r: StepResults) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, `${r.id}.json`), JSON.stringify({ title: r.title, order: r.order, intro: r.intro, groups: r.groups }, null, 2));
}
