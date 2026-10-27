// Puts "Style from references (round 2)" on the Results screen: for each of the real runs, the reference, the old replica (round 1 of the work, kept
// in out/image-engine/reference-real-round1/) and the new replica side by side, the measured similarity and the reader's score before and after, the
// time, which round was kept and why, and the values the toolbox moved. Reads what reference-real.spec.ts saved; the files stay between runs.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { outUrl, writeStepResults, type ResultsItem } from './results';
import { ROOT } from './reference-helpers';

const NEW = path.join(ROOT, 'out/image-engine/reference-real');
const OLD = path.join(ROOT, 'out/image-engine/reference-real-round1');
interface Round {
  header: string;
  made: string;
  files: string[];
}
interface Run {
  id: string;
  label: string;
  seconds: number;
  alert: string[];
  rounds?: Round[];
  kept?: string;
  clamped?: string[];
  missing?: string[];
}
const TAG = 'REAL READER on your own reference (not shippable: references are never bundled)';

const read = (dir: string, id: string): Run | null => {
  const f = path.join(dir, id, 'result.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as Run) : null;
};
/** The numbers in a round's header line: measured similarity, the reader's score, and the combined score. */
const numbers = (h: string) => ({ measured: Number(/Measured (\d+)%/.exec(h)?.[1] ?? NaN), reader: Number(/scores it (\d+)\/100/.exec(h)?.[1] ?? NaN), score: Number(/Score (\d+)/.exec(h)?.[1] ?? NaN) });
/** The round that was kept: the best combined score (the first of equals), which is what both versions of the screen kept. */
const keptIndex = (r: Run) => (r.rounds ?? []).reduce((b, x, k, a) => (numbers(x.header).score > numbers(a[b].header).score ? k : b), 0);

test('Style from references, round 2: Results items', async () => {
  const ids = ['deck-a', 'deck-b', 'single', 'new-single'];
  const groups = [];
  const summary: string[] = [];
  for (const id of ids) {
    const now = read(NEW, id);
    if (!now || !now.rounds?.length) continue;
    const old = read(OLD, id);
    const ni = keptIndex(now);
    const nn = numbers(now.rounds[ni].header);
    const items: ResultsItem[] = [];
    const oi = old?.rounds?.length ? keptIndex(old) : -1;
    const on = old && oi >= 0 ? numbers(old.rounds![oi].header) : null;
    const nfiles = now.rounds[ni].files;
    const ofiles = old && oi >= 0 ? old.rounds![oi].files : [];
    for (let k = 0; k < nfiles.length; k += 2) {
      const images = [{ url: outUrl(path.join(NEW, id, nfiles[k])), label: 'Reference' }];
      if (ofiles[k + 1]) images.push({ url: outUrl(path.join(OLD, id, ofiles[k + 1])), label: 'Before (round 1 of the work)' });
      images.push({ url: outUrl(path.join(NEW, id, nfiles[k + 1])), label: 'After (this round)' });
      items.push({ id: `slide-${k / 2 + 1}`, title: nfiles.length > 2 ? `Slide ${k / 2 + 1}` : 'The slide', tag: TAG, images, verdictWords: ['matches', 'close', 'off', 'wrong'] });
    }
    const fmt = (n: { measured: number; reader: number } | null) => (n ? `measured ${n.measured}%, reader ${n.reader}/100` : 'no earlier run');
    const facts = [
      `Before: ${fmt(on)}${old ? `, ${old.seconds} s, ${old.rounds!.length} rounds` : ''}.`,
      `After: ${fmt(nn)}, ${now.seconds} s, ${now.rounds.length} rounds drawn, round ${ni} kept.`,
      now.kept ? `Why: ${now.kept}` : 'The screen did not say which round it kept.',
      now.clamped?.length ? `Moved to what the toolbox supports: ${now.clamped.join(' ')}` : 'Nothing had to be moved to what the toolbox supports.',
    ];
    if (now.alert.length) facts.push(`The reader failed: ${now.alert.join(' ')}`);
    items.push({ id: 'numbers', title: 'Before and after, in numbers', tag: TAG, images: [], facts });
    groups.push({ title: `Run: ${now.label}`, note: old ? undefined : 'A new reference: there is no round 1 to compare with.', items });
    summary.push(`${id}: ${fmt(on)} -> ${fmt(nn)}`);
  }
  const FINDINGS = path.join(NEW, 'findings-round2.json');
  const findings = fs.existsSync(FINDINGS) ? (JSON.parse(fs.readFileSync(FINDINGS, 'utf8')) as { id: string; title: string; facts: string[] }[]) : [];
  expect(groups.length).toBeGreaterThan(0);
  writeStepResults({
    id: 'style-from-references-round2',
    title: 'Style from references (round 2)',
    order: 15,
    intro: 'The same screen after the replication-quality step: a blank base, photos in the samples, the best round kept, values moved to what the toolbox supports, five more fonts, and badges, marks and textures drawn in code. The same three real references as round 1 plus one new one, read by the real dev reader. Each card: the reference, the old replica, the new replica.',
    groups: [...groups, ...(findings.length ? [{ title: 'What improved and what did not', items: findings.map((f) => ({ id: f.id, title: f.title, images: [], facts: f.facts, tag: TAG })) }] : [])],
  });
  fs.writeFileSync(path.join(NEW, 'summary-round2.txt'), summary.join('\n'));
});
