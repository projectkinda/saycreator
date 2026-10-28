// Puts "Layout and graphic style transfer" on the Results screen: the ground-truth detection scores on our own styles, and for each real reference set the
// before and after layout overlap, the model calls and seconds, with the detection overlay and the two results. Reads what regions-truth.spec.ts and
// layout-real.spec.ts saved (the real one only runs with REAL_LAYOUT=1; its files stay between runs).
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { outUrl, writeStepResults, type ResultsItem } from './results';
import { ROOT } from './reference-helpers';

const TRUTH = path.join(ROOT, 'out/image-engine/regions-truth');
const REAL = path.join(ROOT, 'out/image-engine/layout-real');
const TAG = 'REAL READER on your own references (not shippable: references are never bundled)';
interface Run { id: string; label: string; mode: string; seconds: number; calls?: string; overlap?: string[]; boxes?: string[]; notDrawn?: string[] }
const read = (id: string, mode: string): Run | null => (fs.existsSync(path.join(REAL, `${id}-${mode}.json`)) ? (JSON.parse(fs.readFileSync(path.join(REAL, `${id}-${mode}.json`), 'utf8')) as Run) : null);
const first = (l: string[] | undefined, k: string) => (l ?? []).find((x) => x.startsWith(k)) ?? `${k}: n/a`;

test('Layout transfer: Results items', async () => {
  const groups = [];
  if (fs.existsSync(path.join(TRUTH, 'summary.json'))) {
    const t = JSON.parse(fs.readFileSync(path.join(TRUTH, 'summary.json'), 'utf8')) as { summary: Record<string, string>; styles: Record<string, string>[] };
    const imgs = fs.readdirSync(TRUTH).filter((f) => f.endsWith('.png')).slice(0, 6).map((f) => ({ url: outUrl(path.join(TRUTH, f)), label: f.replace('.png', '') }));
    groups.push({
      title: 'Ground truth: detection on slides drawn from our own styles',
      note: 'Every box, text effect and graphic of these slides is known from the plan. Right out of the total shown: the detection found it.',
      items: [{ id: 'truth', title: 'Detected correctly, per property (all styles)', tag: 'Our own styles (known layout)', images: imgs, facts: Object.entries(t.summary).filter(([k]) => k !== 'misses').map(([k, v]) => `${k}: ${v}`) } as ResultsItem],
    });
  }
  const sets = ['deck-a', 'deck-b', 'deck-c', 'single', 'laptop'];
  const items: ResultsItem[] = [];
  for (const id of sets) {
    const b = read(id, 'before');
    const a = read(id, 'after');
    if (!a) continue;
    const images = [
      ...(fs.existsSync(path.join(REAL, `${id}-detected.png`)) ? [{ url: outUrl(path.join(REAL, `${id}-detected.png`)), label: 'What was detected in the reference' }] : []),
      ...(fs.existsSync(path.join(REAL, `${id}-before-result.png`)) ? [{ url: outUrl(path.join(REAL, `${id}-before-result.png`)), label: 'Before (stored layouts)' }] : []),
      ...(fs.existsSync(path.join(REAL, `${id}-after-result.png`)) ? [{ url: outUrl(path.join(REAL, `${id}-after-result.png`)), label: 'After (detected boxes)' }] : []),
    ];
    items.push({
      id,
      title: a.label,
      tag: TAG,
      images,
      verdictWords: ['matches', 'close', 'off', 'wrong'],
      facts: [
        `Before: ${b ? `${b.seconds} s, ${(b.calls ?? '').split('·')[0].trim()}` : 'not run'}. After: ${a.seconds} s, ${(a.calls ?? '').split('·')[0].trim()}.`,
        `Text regions: ${first(b?.overlap, 'Text regions')} before, ${first(a.overlap, 'Text regions')} after.`,
        `Shapes: ${first(b?.overlap, 'Shapes')} before, ${first(a.overlap, 'Shapes')} after. Graphics: ${first(b?.overlap, 'Graphics')} before, ${first(a.overlap, 'Graphics')} after.`,
        `After: ${first(a.overlap, 'Photo regions')}; ${first(a.overlap, 'Title size')}; ${first(a.overlap, 'Text treatments')}`,
        ...(a.notDrawn?.length ? [`Found but not drawn: ${a.notDrawn.slice(0, 6).join('; ')}`] : []),
      ],
    });
  }
  if (items.length) groups.push({ title: 'Real references: before and after (the same five sets)', note: 'Before: the stored layouts only (the free layout switched off, the full style read with rounds). After: the detected boxes and one labelling call.', items });
  const FINDINGS = path.join(REAL, 'findings.json');
  if (fs.existsSync(FINDINGS)) groups.push({ title: 'What improved and what did not', items: (JSON.parse(fs.readFileSync(FINDINGS, 'utf8')) as { id: string; title: string; facts: string[] }[]).map((f) => ({ id: f.id, title: f.title, images: [], facts: f.facts, tag: TAG })) });
  expect(groups.length).toBeGreaterThan(0);
  writeStepResults({ id: 'layout-transfer', title: 'Layout and graphic style transfer', order: 17, intro: 'The layout of a reference is measured in code (boxes in percent, text effects, shapes, graphics) and rebuilt as a free layout; the reader only labels. Scored against the reference the same way on both.', groups });
});
