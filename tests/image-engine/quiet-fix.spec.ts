// Fix: the Quiet dark style met the phone-size minimum only for labels. Now every text in it is 32 px or more, the stat note and
// quote byline are style settings (type.note, type.byline) that the validator checks, and the body line height is opened up.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outUrl, writeStepResults, type ResultsItem } from './results';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/quiet-fix');
const DECKS = fs.readdirSync(path.join(ROOT, 'tests/image-engine/carousels')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/image-engine/carousels', f), 'utf8')));
const readStyle = (n: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/image-engine/styles', n, 'style.json'), 'utf8'));

interface Lint { id: string; pass: boolean; reason: string }
interface Slide { lint: Lint[]; png: string }
const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

test('the validator checks every text size, including the note and the byline (even when they are left to default), and every shipped style is clean', async ({ page }) => {
  const check = (raw: unknown, name = 'x') => call<{ errors: string[]; warnings: string[] }>(page, 'styleValidate', raw, name);
  const size = (r: { warnings: string[] }) => r.warnings.filter((w) => /32 px/.test(w)).join('\n');
  for (const n of ['hot-flat', 'editorial-collage', 'dark-quiet', 'object-neon']) {
    const r = await check(readStyle(n), n);
    expect(r.errors, n).toEqual([]);
    expect(size(r), `${n} has text under 32 px`).toBe('');
  }
  // Left out, note and byline are body - 4 and body - 6: a body of 32 would give 28 and 26, which the validator now sees.
  const q = readStyle('dark-quiet');
  delete q.type.note;
  delete q.type.byline;
  const w1 = size(await check(q));
  expect(w1).toMatch(/type\.note is 28 px\..*the line under a big number will fail/);
  expect(w1).toMatch(/type\.byline is 26 px\..*the name under a quote will fail/);
  // Set explicitly, a note under 32 is caught, and a value out of range is an error in words.
  q.type.note = 24;
  expect(size(await check(q))).toMatch(/type\.note is 24 px/);
  q.type.note = 3;
  expect((await check(q)).errors.join(' ')).toMatch(/type\.note must be a number from 10 to 400/);
  const lh = readStyle('dark-quiet');
  lh.bodyLineHeight = 3;
  expect((await check(lh)).errors.join(' ')).toMatch(/bodyLineHeight.*1\.0 to 2\.0/);
});

test('Quiet dark is clean: every slide of every sample deck passes every phone-size check; before and after for three slides', async ({ page }) => {
  test.setTimeout(240_000);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const size = (s: Slide) => s.lint.find((l) => l.id === 'size')!;
  const summary: Record<string, unknown> = {};
  let first: { before: Slide[]; after: Slide[] } | null = null;
  for (const deck of DECKS) {
    const before = await call<Slide[]>(page, 'styleRun', deck, 'dark-quiet', { variant: 'before-quiet-clean' });
    const after = await call<Slide[]>(page, 'styleRun', deck, 'dark-quiet');
    const failsAfter = after.flatMap((s, i) => s.lint.filter((l) => !l.pass).map((l) => `Slide ${i + 1}: ${l.id}: ${l.reason}`));
    summary[deck.id] = { slidesFailingBefore: before.filter((s) => s.lint.some((l) => !l.pass)).length, slidesFailingAfter: after.filter((s) => s.lint.some((l) => !l.pass)).length, failsAfter };
    expect(failsAfter, deck.id).toEqual([]);
    if (deck.id === 'howto-linkedin') first = { before, after };
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  const { before, after } = first!;
  expect(before.filter((s) => !size(s).pass).length).toBeGreaterThan(0);
  const items: ResultsItem[] = [];
  for (const i of [0, 1, 5]) {
    fs.writeFileSync(path.join(OUT, `before-${i + 1}.png`), Buffer.from(before[i].png, 'base64'));
    fs.writeFileSync(path.join(OUT, `after-${i + 1}.png`), Buffer.from(after[i].png, 'base64'));
    items.push({
      id: `slide-${i + 1}`,
      title: `Slide ${i + 1}, before and after`,
      images: [{ url: outUrl(path.join(OUT, `before-${i + 1}.png`)), label: 'Before: body 28, small 30, note 24, line height 1.3' }, { url: outUrl(path.join(OUT, `after-${i + 1}.png`)), label: 'After: all 32, line height 1.5' }],
      checker: { pass: after[i].lint.every((l) => l.pass), reasons: after[i].lint.filter((l) => !l.pass).map((l) => l.reason) },
      facts: [`size check before: ${size(before[i]).pass ? 'pass' : 'fail'}: ${size(before[i]).reason}`, `size check after: ${size(after[i]).pass ? 'pass' : 'fail'}`],
      tag: 'REAL',
    });
  }
  writeStepResults({
    id: 'step8-quiet-fix',
    title: 'Step 8 fix: Quiet dark style',
    order: 8.5,
    intro: 'Quiet dark now passes every phone-size check. Body, small text, the stat note and the quote byline are all 32 px (they were 28, 30, 24 and 22). Colours, weights and spacing are unchanged; the body line height went from 1.3 to 1.5 so the text stays airy. The note and byline are now style settings (type.note, type.byline), so the style validator sees them.',
    groups: [{ title: 'Quiet dark, "How-to list" deck', items }],
  });
});
