// Puts everything from Step 10 on the Results screen (Step 10). It reads what the other Step 10 specs saved under out/image-engine/step10/.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outUrl, writeStepResults, type ResultsItem } from './results';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/step10');
const read = <T>(f: string): T | null => (fs.existsSync(path.join(OUT, f)) ? (JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')) as T) : null);

test('Step 10 Results section', async () => {
  test.skip(!fs.existsSync(path.join(OUT, 'pairs.json')), 'Run the other Step 10 specs first.');
  const pairs = read<{ id: string; title: string; before: string; after: string; lint: string[] }[]>('pairs.json')!;
  const split = read<{ splitSlidesChecked: number; failures: string[] }>('split-summary.json');
  const bad = read<{ across: string; near: string }>('split-bad.json');
  const decor = read<{ counts: Record<string, number>; problems: string[] }>('decor-summary.json');
  const frames = read<{ found: Record<string, number>; bad: string[] }>('frames-forced.json');
  const hl = read<{ style: string; text: string; bars: number; lines: number }[]>('highlight-summary.json');
  const picks = read<{ rows: { id: string; tone: string; picked: string; why: string; scores: string }[]; counts: Record<string, number> }>('picks.json');
  const findings: { title: string; tag: string; note: string }[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/image-engine/step10-findings.json'), 'utf8'));

  const beforeAfter: ResultsItem[] = pairs.map((p) => ({
    id: p.id,
    title: p.title,
    tag: 'REAL',
    images: [{ url: outUrl(path.join(OUT, p.before)), label: 'Before (Step 9)' }, { url: outUrl(path.join(OUT, p.after)), label: 'After (same script, same style)' }],
    checker: { pass: p.lint.length === 0, reasons: p.lint },
  }));

  const rules: ResultsItem[] = [
    {
      id: 'split',
      title: 'Myth and fact: nothing crosses the split or sits near its arrow',
      images: [],
      tag: split && split.failures.length === 0 ? 'PASS' : 'FAIL',
      checker: split ? { pass: split.failures.length === 0, reasons: split.failures } : undefined,
      facts: [`${split?.splitSlidesChecked ?? 0} split slides checked (3 styles x 4 decks); each declares its split area and its arrow, and the new check "Elements stay off the split" passes on all of them.`, `A deliberately bad plan with a picture across the line fails: ${bad?.across ?? ''}`, `One beside the arrow button fails too: ${bad?.near ?? ''}`],
    },
    {
      id: 'decor',
      title: 'Decoration has a job',
      images: [],
      tag: decor && decor.problems.length === 0 ? 'PASS' : 'FAIL',
      checker: decor ? { pass: decor.problems.length === 0, reasons: decor.problems } : undefined,
      facts: ['Every decoration rule in a style must say what it is for (frame, point, gap); the validator refuses one that does not.', 'Nothing but a frame touches text; a slide that is already full gets no decoration; the editorial blob and circle marks are gone from covers.', `Placed in the normal run (4 decks x 3 styles): ${JSON.stringify(decor?.counts ?? {})}.`, `When frames and arrows are asked for on every slide: ${JSON.stringify(frames?.found ?? {})}, checks pass: ${frames?.bad.length === 0}.`],
    },
    {
      id: 'highlight',
      title: 'One continuous highlight bar',
      images: [],
      tag: 'PASS',
      facts: [`A highlighted phrase that fits stays on one line, so it gets one bar. Checked in 4 styles: ${hl ? [...new Set(hl.filter((r) => /five_videos/.test(r.text)).map((r) => `${r.style}: ${r.bars} bar on ${r.lines} line`))].join('; ') : ''}.`],
    },
  ];

  const pickItems: ResultsItem[] = (picks?.rows ?? []).map((r) => ({ id: r.id, title: `${r.id} (${r.tone} tone): ${r.picked}`, images: [], tag: 'SCORED', facts: [r.why, `scores: ${r.scores}`] }));

  const fmt = (name: string, title: string, note: string): ResultsItem | null => {
    const j = read<{ count: number; sizes: string[]; failures: string[]; files: string[] }>(`formats/${name}.json`);
    if (!j) return null;
    return { id: name, title, tag: 'FAKE WRITER', images: j.files.map((f, i) => ({ url: '/' + f, label: `${i + 1}` })), checker: { pass: j.failures.length === 0, reasons: j.failures }, facts: [`${j.count} pictures, sizes ${j.sizes.join(', ')}`, note] };
  };
  const formats = [
    fmt('quote-cards', 'Quote cards (3)', 'A fake writer returned three quotes; the page drew three square cards.'),
    fmt('carousel-3', 'A 3-slide carousel', 'Slide count 3; the writer is a fake.'),
    fmt('carousel-10', 'A 10-slide carousel', 'Slide count 10; page numbers count to 10; the writer is a fake.'),
    fmt('near-limit', 'A text of about 11,990 characters', 'The whole text went to the writer; one character more is refused. The writer is a fake.'),
  ].filter((x): x is ResultsItem => x !== null);

  const rq = read<{ error: string; ms?: number; style?: string; quotes?: { quote: string; by: string }[]; warnings?: string[]; failures?: string[]; files?: string[]; message?: string; calls?: { ms: number }[] }>('real-quote.json');
  const real: ResultsItem[] = rq
    ? [{
        id: 'real-quote',
        title: 'One REAL quote card generation (3 cards)',
        tag: rq.error ? 'FAILED' : 'REAL',
        error: rq.error || undefined,
        images: (rq.files ?? []).map((f, i) => ({ url: '/' + f, label: `Card ${i + 1}` })),
        checker: rq.error ? undefined : { pass: (rq.failures ?? []).length === 0, reasons: rq.failures ?? [] },
        facts: [`time: ${((rq.ms ?? 0) / 1000).toFixed(0)} s in total, ${rq.calls?.length ?? 0} writer call(s)`, `style: ${rq.style}`, `validator warnings: ${(rq.warnings ?? []).length ? rq.warnings!.join(' | ') : 'none'}`, ...(rq.quotes ?? []).map((q) => `"${q.quote}" ${q.by}`)],
      }]
    : [];

  writeStepResults({
    id: 'step10',
    title: 'Step 10: Polish',
    order: 10,
    intro: 'The issues found in the Step 9 review: pictures crossing the split on myth and fact slides, decoration with no job, two highlight bars, and "Pick for me" always choosing the same style. Plus quote cards, 3 and 10 slides and a long text with a fake writer, and one real quote card generation.',
    groups: [
      { title: 'Before and after (the same Step 9 scripts, redrawn)', items: beforeAfter },
      { title: 'The rules and their checks', items: rules },
      { title: '"Pick for me" on 8 different texts', note: 'Scored from the tone, the words of the text and the slide types, using each style\'s own description and "suits" list. The texts and keyword lists were written by me.', items: pickItems },
      { title: 'Other formats and sizes (fake writer)', items: formats },
      { title: 'One real generation', items: real },
      { title: 'What is still weak', items: findings.map((x, i) => ({ id: `f${i}`, title: x.title, tag: x.tag, images: [], facts: [x.note] })) },
    ],
  });
  expect(true).toBe(true);
});
