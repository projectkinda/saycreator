// Puts "Style from references" on the Results screen: for each real-reader run, every round (reference on the left, ours on the right) with the
// measured and judged numbers, the closeness panel, the missing tools, the time taken, and verdict boxes; then the missing tools ranked by how
// many references need them. Reads what reference-real.spec.ts saved (it only runs when REAL_REFERENCE=1; the files stay between runs).
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { rankMissing } from '../../src/reference/closeness';
import { outUrl, writeStepResults, type ResultsItem } from './results';
import { ROOT } from './reference-helpers';

const REAL = path.join(ROOT, 'out/image-engine/reference-real');
interface RoundOut {
  header: string;
  made: string;
  files: string[];
}
interface RunOut {
  id: string;
  label: string;
  files: string[];
  target: string;
  detectedMode: string | null;
  cells: number;
  seconds: number;
  alert: string[];
  readerCalls: number;
  rounds?: RoundOut[];
  closeness?: string;
  missing?: string[];
  measured?: string;
  notes?: string[];
}
const WORDS = ['matches', 'close', 'off', 'wrong'];
const TAG = 'REAL READER on your own reference (not shippable: references are never bundled)';

test('Style from references: Results items', async () => {
  const runs = fs.existsSync(REAL) ? fs.readdirSync(REAL).filter((d) => fs.existsSync(path.join(REAL, d, 'result.json'))).map((d) => JSON.parse(fs.readFileSync(path.join(REAL, d, 'result.json'), 'utf8')) as RunOut) : [];
  test.skip(runs.length === 0, 'Run reference-real.spec.ts with REAL_REFERENCE=1 first.');
  const order = ['deck-a', 'deck-b', 'single'];
  runs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const groups = runs.map((r) => {
    const items: ResultsItem[] = [];
    (r.rounds ?? []).forEach((round, i) => {
      const imgs = round.files.map((f, k) => ({ url: outUrl(path.join(REAL, r.id, f)), label: k % 2 === 0 ? 'Reference' : 'Ours' }));
      // One card per reference slide in this round: the reference on the left, ours on the right.
      for (let k = 0; k < imgs.length; k += 2) {
        items.push({ id: `round${i}-${k / 2 + 1}`, title: `${i === 0 ? 'First replica' : `Round ${i}`}${imgs.length > 2 ? `, slide ${k / 2 + 1}` : ''}`, tag: TAG, images: [imgs[k], imgs[k + 1]], facts: k === 0 ? [round.header.replace(/ (Use this round|Using this round)$/, ''), ...(round.made ? [round.made] : [])] : [], verdictWords: WORDS });
      }
    });
    const closeness = (r.closeness ?? '').split('\n').filter(Boolean);
    items.push({ id: 'closeness', title: 'The closeness panel and the missing tools, as the app showed them', tag: TAG, images: [], facts: [`Time taken: ${r.seconds} s, ${r.readerCalls} calls to the reader. Grid found by the code: ${r.detectedMode === 'grid' ? `yes, ${r.cells} slides` : 'no (treated as one image)'}.`, ...closeness.slice(0, 40)] });
    return { title: `Run: ${r.label}`, note: `Files: ${r.files.join(', ')}. Target: ${r.target}. ${r.alert.length ? `The reader failed: ${r.alert.join(' ')}` : ''}`, items };
  });
  const ranked = rankMissing(runs.map((r) => ({ name: r.label, missing: (r.missing ?? []).map((m) => ({ tool: m.split(':')[0].trim(), why: m.split(':').slice(1).join(':').trim() })) })));
  const missingItems: ResultsItem[] = ranked.map((m, i) => ({ id: `missing-${i}`, title: `${i + 1}. ${m.tool}`, images: [], facts: [`Needed by ${m.count} of ${runs.length} runs (${m.references.join('; ')}).`, m.why] }));
  const FINDINGS = path.join(REAL, 'findings.json');
  const findings = fs.existsSync(FINDINGS) ? (JSON.parse(fs.readFileSync(FINDINGS, 'utf8')) as { id: string; title: string; facts: string[]; tag?: string }[]) : [];
  expect(groups.length).toBeGreaterThan(0);
  writeStepResults({
    id: 'style-from-references',
    title: 'Style from references',
    order: 14,
    intro: 'Real runs of the new screen on your own references, with the real dev reader (Claude Code on this computer). For each run: every round with the reference on the left and our replica on the right, then the closeness panel as the app showed it. There is no “Reference thumbnails” folder, so no thumbnail group was run. Nothing is called identical or perfect: the replica is only as close as our toolbox allows.',
    groups: [...groups, { title: 'Missing tools, ranked by how many runs need them', note: 'What the reader said our toolbox cannot draw. This is the list to choose from for the next step.', items: missingItems }, ...(findings.length ? [{ title: 'What the model got wrong, and what is poor', items: findings.map((f) => ({ id: f.id, title: f.title, images: [], facts: f.facts, ...(f.tag ? { tag: f.tag } : {}) })) }] : [])],
  });
});
