// Puts "Live view and speed" on the Results screen: for each long job, where the time went (stage, seconds, share of the total), the picture-size
// comparison (time and result for each size on the same references), the cache, and the Live view as it looked at the end of a real run.
// Reads what live-real.spec.ts saved (it only runs with REAL_LIVE=1; the files stay between runs).
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { outUrl, writeStepResults, type ResultsItem } from './results';
import { ROOT } from './reference-helpers';

const DIR = path.join(ROOT, 'out/image-engine/live-real');
interface Job {
  id: string;
  profile: string;
  title: string;
  seconds: number;
  cached?: boolean;
  stages: { label: string; status: string; seconds?: number; note?: string }[];
  rounds: { n: number; label: string; measuredPct: number; readerScore: number | null; score: number; kept?: boolean; draft?: boolean }[];
}
const load = (id: string): Job | null => (fs.existsSync(path.join(DIR, `${id}.json`)) ? (JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8')) as Job) : null);
const TAG = 'REAL READER / WRITER on your own references and text (not shippable)';

/** The stage table as lines: stage, seconds, share of the total. */
const table = (j: Job): string[] => {
  const total = j.stages.reduce((a, s) => a + (s.seconds ?? 0), 0) || 1;
  return j.stages.filter((s) => s.seconds !== undefined).map((s) => `${s.label}: ${s.seconds} s (${Math.round(((s.seconds ?? 0) / total) * 100)}%)${s.note ? `, ${s.note}` : ''}`);
};
const kept = (j: Job) => j.rounds.find((r) => r.kept) ?? j.rounds.filter((r) => !r.draft).slice(-1)[0];

test('Live view and speed: Results items', async () => {
  const jobs: [string, string][] = [['style-deck-now', 'Style from a 12-slide deck'], ['style-one-now', 'Style from one slide'], ['one-shot', 'One-shot carousel'], ['thumbnail', 'Thumbnail']];
  const timeItems: ResultsItem[] = [];
  for (const [id, title] of jobs) {
    const j = load(id);
    if (!j) continue;
    const shot = path.join(DIR, `${id}.png`);
    timeItems.push({ id, title: `${title}: ${j.seconds} s in all`, tag: TAG, images: fs.existsSync(shot) ? [{ url: outUrl(shot), label: 'The page at the end of the run, with the Live view' }] : [], facts: table(j) });
  }
  const sizeItems: ResultsItem[] = [];
  for (const [kind, title] of [['style-one', 'One slide'], ['style-deck', '12-slide deck']] as const) {
    const facts: string[] = [];
    for (const p of ['before', 'now', 'small']) {
      const j = load(`${kind}-${p}`);
      if (!j) continue;
      const k = kept(j);
      const reader = j.stages.find((s) => s.label === 'Ask the reader')?.seconds;
      facts.push(`${p}: ${j.seconds} s in all, the first read ${reader} s, ${j.rounds.filter((r) => !r.draft).length} rounds, kept round measured ${k?.measuredPct}% and the reader scored it ${k?.readerScore === null || k?.readerScore === undefined ? 'n/a' : Math.round(k.readerScore)}/100`);
    }
    if (facts.length) sizeItems.push({ id: kind, title: `Picture size sent to the reader: ${title}`, tag: TAG, images: [], facts });
  }
  const cold = load('style-one-cold');
  const warm = load('style-one-cached');
  const cacheItems: ResultsItem[] = cold && warm ? [{ id: 'cache', title: `Cache: ${cold.seconds} s the first time, ${warm.seconds} s the second`, tag: TAG, images: [], facts: [`First read: ${(cold.stages.find((s) => s.label === 'Ask the reader')?.seconds ?? 0)} s asking the reader.`, `Second read, same pictures and choices: ${(warm.stages.find((s) => s.label === 'Ask the reader')?.seconds ?? 0)} s, ${warm.cached ? 'from cache' : 'NOT from cache'}.`] }] : [];
  const FINDINGS = path.join(DIR, 'findings.json');
  const findings = fs.existsSync(FINDINGS) ? (JSON.parse(fs.readFileSync(FINDINGS, 'utf8')) as { id: string; title: string; facts: string[] }[]) : [];
  expect(timeItems.length).toBeGreaterThan(0);
  writeStepResults({
    id: 'live-view-speed',
    title: 'Live view and speed',
    order: 16,
    intro: 'Real runs of the four long jobs with the Live view on: where the time went for each, how small the pictures sent to the reader can be, the cache, and what the Live view looked like.',
    groups: [
      { title: 'Where the time went', note: 'Stage, seconds, share of the total. The same table is in the Live view when a job ends.', items: timeItems },
      ...(sizeItems.length ? [{ title: 'Picture sizes sent to the reader, on the same references', note: 'before = 900 px pairs and 1100 px references; now = 760 and 1000; small = 560 and 720.', items: sizeItems }] : []),
      ...(cacheItems.length ? [{ title: 'Cache', items: cacheItems }] : []),
      ...(findings.length ? [{ title: 'What helped, what is still slow, and why', items: findings.map((f) => ({ id: f.id, title: f.title, images: [], facts: f.facts, tag: TAG })) }] : []),
    ],
  });
});
