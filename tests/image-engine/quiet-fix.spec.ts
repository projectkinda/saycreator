// Fix: the Quiet dark style's page number was 26 px against the 32 px minimum, so every slide failed the phone-size check.
// Also: the style validator now warns, when a style is loaded, about any text size under the minimum.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outUrl, writeStepResults, type ResultsItem } from './results';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/quiet-fix');
const DECK = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/image-engine/carousels/howto-linkedin.json'), 'utf8'));
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

test('the validator warns, in plain words, about every text size under the phone minimum, and stays quiet when there is none', async ({ page }) => {
  const check = (raw: unknown) => call<{ errors: string[]; warnings: string[] }>(page, 'styleValidate', raw, 'dark-quiet');
  const base = readStyle('hot-flat');
  expect((await check(base)).warnings.filter((w) => /32 px/.test(w))).toEqual([]);
  const low = structuredClone(base);
  low.type.headline = 30;
  low.type.small = 24;
  low.type.label = 20;
  const w = (await check(low)).warnings.join('\n');
  expect(w).toMatch(/type\.headline is 30 px\. The phone-size checker needs at least 32 px, so headlines will fail/);
  expect(w).toMatch(/type\.small is 24 px.*small text will fail/);
  expect(w).toMatch(/type\.label is 20 px.*labels and page numbers will fail/);
  expect(w).toMatch(/knownLintConflicts/);
  // The shipped Quiet dark style: labels and page numbers now pass; body and small text still warn (kept for its look, listed as known).
  const quiet = readStyle('dark-quiet');
  expect(quiet.type.label).toBeGreaterThanOrEqual(32);
  const qw = (await check(quiet)).warnings.join('\n');
  expect(qw).not.toMatch(/type\.label/);
  expect(qw).toMatch(/type\.body is 28 px/);
  expect(qw).toMatch(/type\.small is 30 px/);
});

test('before and after: page numbers and labels pass the size check; what still fails is written down', async ({ page }) => {
  test.setTimeout(120_000);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const before = await call<Slide[]>(page, 'styleRun', DECK, 'dark-quiet', { variant: 'before-quiet-label' });
  const after = await call<Slide[]>(page, 'styleRun', DECK, 'dark-quiet');
  const size = (s: Slide) => s.lint.find((l) => l.id === 'size')!;
  const pageNumberFails = (s: Slide) => /\d\d \/ \d\d/.test(size(s).reason) && !size(s).pass;
  expect(before.filter(pageNumberFails).length).toBeGreaterThan(0);
  expect(before.every((s) => !size(s).pass)).toBe(true); // every slide failed before
  expect(after.filter(pageNumberFails)).toHaveLength(0);
  const failsAfter = after.map((s, i) => ({ slide: i + 1, ...size(s) })).filter((x) => !x.pass);
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ slidesFailingSizeBefore: before.filter((s) => !size(s).pass).length, slidesFailingSizeAfter: failsAfter.length, afterReasons: failsAfter.map((f) => `Slide ${f.slide}: ${f.reason}`), otherFailsAfter: after.flatMap((s, i) => s.lint.filter((l) => !l.pass && l.id !== 'size').map((l) => `Slide ${i + 1}: ${l.id}: ${l.reason}`)) }, null, 2));
  const items: ResultsItem[] = [];
  for (const i of [0, 1, 5]) {
    fs.writeFileSync(path.join(OUT, `before-${i + 1}.png`), Buffer.from(before[i].png, 'base64'));
    fs.writeFileSync(path.join(OUT, `after-${i + 1}.png`), Buffer.from(after[i].png, 'base64'));
    items.push({
      id: `slide-${i + 1}`,
      title: `Slide ${i + 1}, before and after`,
      images: [{ url: outUrl(path.join(OUT, `before-${i + 1}.png`)), label: 'Before: label 26 px' }, { url: outUrl(path.join(OUT, `after-${i + 1}.png`)), label: 'After: label 32 px' }],
      checker: { pass: size(after[i]).pass, reasons: size(after[i]).pass ? [] : [size(after[i]).reason] },
      facts: [`size check before: ${size(before[i]).pass ? 'pass' : 'fail'}: ${size(before[i]).reason}`, `size check after: ${size(after[i]).pass ? 'pass' : 'fail'}: ${size(after[i]).reason}`],
      tag: 'REAL',
    });
  }
  writeStepResults({
    id: 'step8-quiet-fix',
    title: 'Step 8 fix: Quiet dark page number',
    order: 8.5,
    intro: `The page number and labels in the Quiet dark style went from 26 px to 32 px (same muted grey, same weight, same place). Before: ${before.filter((s) => !size(s).pass).length} of 7 slides failed the size check. After: ${failsAfter.length} of 7 still fail, because body text (28 px) and small text (30 px) are still below 32 px on purpose. The style validator now warns about any text size under the minimum when a style is loaded.`,
    groups: [{ title: 'Quiet dark, "How-to list" deck', items }],
  });
});
