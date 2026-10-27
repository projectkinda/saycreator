// Words per slide (a check with a warning and a failing limit) and the platform choice (a ceiling on the slide count).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORMS, platformWarning } from '../../src/carousel/platform';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/words');
const readDecks = (dir: string) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, dir, f), 'utf8')));
const WORDS_CHECKED_TYPES = ['content', 'step', 'checklist', 'beforeafter'];
const SAMPLE = readDecks('tests/image-engine/carousels');
const PHOTO = readDecks('tests/image-engine/carousels-photo');
const BAD = readDecks('tests/image-engine/carousels-bad');
const STYLES = fs.readdirSync(path.join(ROOT, 'src/image-engine/styles'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

interface Lint { id: string; pass: boolean; warn?: boolean; reason: string; measured?: number; limit?: number }
interface Slide { id: string; type: string; lint: Lint[] }
const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

test('platform: the ceilings are 20, 20, 10 and 4, and a script or a request over it gets a plain warning', () => {
  expect(PLATFORMS.map((p) => [p.id, p.max])).toEqual([['instagram', 20], ['linkedin', 20], ['facebook', 10], ['x', 4]]);
  expect(platformWarning(7, null)).toBeNull();
  expect(platformWarning(4, 'x')).toBeNull();
  expect(platformWarning(5, 'x')).toContain('This script has 5 slides, and X allows at most 4');
  expect(platformWarning(5, 'x')).toContain('cut 1 slide,');
  expect(platformWarning(7, 'x', 'asked')).toContain('X allows at most 4 slides in a post, and 7 are asked for');
  expect(platformWarning(11, 'facebook')).toContain('Facebook allows at most 10');
  expect(platformWarning(20, 'instagram')).toBeNull();
  expect(platformWarning(21, 'linkedin')).toContain('LinkedIn allows at most 20');
});

test.describe('in the browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/image-engine/harness/index.html');
    await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
    await call(page, 'loadFonts');
  });

  test('the limits live in the same block as the other lint limits: warn above 35, fail above 50, on slides that carry body copy', async ({ page }) => {
    const c = await call<{ limits: Record<string, number>; wordsTypes: string[] }>(page, 'carouselLimits');
    expect(c.limits.wordsWarn).toBe(35);
    expect(c.limits.wordsFail).toBe(50);
    expect(c.limits.minTextPx).toBe(32); // the same block as the other limits
    expect(c.wordsTypes).toEqual(WORDS_CHECKED_TYPES);
  });

  test('two deliberately wordy decks: the slide fails the words check in plain words, in every style, and nothing else gets the check', async ({ page }) => {
    test.setTimeout(180_000);
    const seen: Record<string, number> = {};
    for (const deck of BAD) {
      const at = deck.id === 'bad-wordy-content' ? 3 : 1;
      for (const style of STYLES) {
        const slides = await call<Slide[]>(page, 'styleRun', deck, style);
        const w = slides[at].lint.find((l) => l.id === 'words')!;
        expect(w, `${deck.id} in ${style}: the words check is on the slide`).toBeDefined();
        expect(w.pass, `${deck.id} in ${style}`).toBe(false);
        expect(w.measured!).toBeGreaterThan(50);
        expect(w.reason).toMatch(/This slide has \d+ words, over the limit of 50\. Nobody reads that much on a swipe/);
        // The other slides of the deck are not failed by it.
        for (const [i, s] of slides.entries()) if (i !== at) expect(s.lint.find((l) => l.id === 'words')?.pass ?? true, `${deck.id} ${style} slide ${i + 1}`).toBe(true);
        seen[`${deck.id}/${style}`] = w.measured!;
      }
    }
    fs.writeFileSync(path.join(OUT, 'bad-variants.json'), JSON.stringify(seen, null, 2));
    expect(Object.keys(seen)).toHaveLength(2 * STYLES.length);
  });

  test('which slides get the check, and how a slide between the two limits is shown (a pass with a warning)', async ({ page }) => {
    const deck = SAMPLE.find((d) => d.id === 'awkward-hiring')!;
    const slides = await call<Slide[]>(page, 'styleRun', deck, 'dark-quiet');
    for (const s of slides) expect(s.lint.some((l) => l.id === 'words'), `${s.type} slide`).toBe(WORDS_CHECKED_TYPES.includes(s.type));
    const kinds = slides.filter((s) => WORDS_CHECKED_TYPES.includes(s.type)).map((s) => s.lint.find((l) => l.id === 'words')!);
    const warn = kinds.find((k) => k.pass && k.warn);
    expect(warn, 'awkward-hiring has a slide between 36 and 50 words').toBeDefined();
    expect(warn!.reason).toMatch(/This slide has \d+ words\. More than 35 is a lot for one swipe, and more than 50 fails this check\. Try to shorten it\./);
    expect(kinds.find((k) => k.pass && !k.warn)!.reason).toMatch(/\(a warning above 35, a failure above 50\)/);
  });

  test('are the limits sensible? Every slide of the sample decks and the real generations, counted', async ({ page }) => {
    test.setTimeout(240_000);
    const real: { id: string; script: unknown }[] = [];
    const rd = path.join(ROOT, 'out/image-engine/oneshot-real');
    if (fs.existsSync(rd)) for (const f of fs.readdirSync(rd).filter((x) => x.endsWith('-script.json'))) real.push({ id: 'real-' + f.replace('-script.json', ''), script: JSON.parse(fs.readFileSync(path.join(rd, f), 'utf8')) });
    const groups: Record<string, unknown[]> = { 'sample decks': SAMPLE, 'photo decks': PHOTO, 'real generations': real.map((r) => ({ ...(r.script as object), id: r.id })) };
    const report: Record<string, unknown> = {};
    for (const [name, decks] of Object.entries(groups)) {
      let checked = 0;
      let warn = 0;
      let fail = 0;
      const rows: { deck: string; slide: number; type: string; words: number; verdict: string; style: string }[] = [];
      for (const deck of decks as { id: string; slides: { type: string }[] }[]) {
        // Styles add small words of their own (a step label, a number), so the count is taken in every style, and a slide counts as
        // its worst result.
        const worst = new Map<number, { type: string; words: number; verdict: string; style: string }>();
        for (const style of STYLES) {
          const slides = await call<Slide[]>(page, 'styleRun', deck, style);
          slides.forEach((s, i) => {
            const w = s.lint.find((l) => l.id === 'words');
            if (!w) return;
            const verdict = !w.pass ? 'fail' : w.warn ? 'warn' : 'ok';
            const rank = { ok: 0, warn: 1, fail: 2 } as Record<string, number>;
            const cur = worst.get(i);
            if (!cur || rank[verdict] > rank[cur.verdict] || (rank[verdict] === rank[cur.verdict] && w.measured! > cur.words)) worst.set(i, { type: s.type, words: w.measured!, verdict, style });
          });
        }
        for (const [i, w] of worst) {
          checked++;
          if (w.verdict === 'warn') warn++;
          if (w.verdict === 'fail') fail++;
          rows.push({ deck: deck.id, slide: i + 1, ...w });
        }
      }
      report[name] = { checkedSlides: checked, warn, fail, words: rows.map((r) => r.words).sort((a, b) => a - b), rows };
    }
    fs.writeFileSync(path.join(OUT, 'words-report.json'), JSON.stringify(report, null, 2));
    expect((report['sample decks'] as { checkedSlides: number }).checkedSlides).toBeGreaterThan(10);
  });
});

test.describe('platform chip (the page)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  const open = async (page: Page) => {
    await page.goto('/images/carousel');
    await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
  };
  const chip = (page: Page, name: string) => page.getByRole('group', { name: 'Platform' }).getByRole('button', { name, exact: true });

  test('no platform is selected by default, the slide count stays 7, and there is no warning', async ({ page }) => {
    await open(page);
    for (const p of PLATFORMS) await expect(chip(page, p.label)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('combobox', { name: /^Slides/ })).toHaveValue('7');
    await expect(page.getByTestId('platform-warning')).toHaveCount(0);
  });

  test('choosing X caps the 7 slides at 4 and says so; the list stops at 4; choosing it again lifts the limit; LinkedIn leaves 4 alone', async ({ page }) => {
    await open(page);
    const slides = page.getByRole('combobox', { name: /^Slides/ });
    await chip(page, 'X').click();
    await expect(chip(page, 'X')).toHaveAttribute('aria-pressed', 'true');
    await expect(slides).toHaveValue('4');
    await expect(page.getByTestId('platform-cap')).toContainText('Capped at 4 for X');
    await expect(page.getByTestId('platform-cap')).toContainText('X allows up to 4 slides in a post');
    expect(await slides.locator('option').allTextContents()).toEqual(['3', '4']);
    await chip(page, 'X').click();
    await expect(chip(page, 'X')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('platform-cap')).toHaveCount(0);
    expect((await slides.locator('option').allTextContents()).length).toBe(8);
    await slides.selectOption('7');
    await chip(page, 'Facebook').click();
    await expect(slides).toHaveValue('7');
    await expect(page.getByTestId('platform-cap')).not.toContainText('Capped');
    await slides.selectOption('10');
    await chip(page, 'Facebook').click();
    await chip(page, 'LinkedIn').click();
    await expect(slides).toHaveValue('10');
    await page.screenshot({ path: path.join(OUT, 'platform-chip.png') });
  });

  test('the choice survives a refresh', async ({ page }) => {
    await open(page);
    await chip(page, 'Facebook').click();
    await expect(page.getByText(/Saved in this browser/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
    await expect(chip(page, 'Facebook')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'X')).toHaveAttribute('aria-pressed', 'false');
    // 7 slides is fine on Facebook (10), so no warning; the choice does not change the slide count.
    await expect(page.getByRole('combobox', { name: /^Slides/ })).toHaveValue('7');
    await expect(page.getByTestId('platform-warning')).toHaveCount(0);
  });
});
