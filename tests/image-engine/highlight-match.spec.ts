// Bug fix: a highlighted word with punctuation ("5,000", "$5,000", "99.9%", "3.5x", "50%", "e-mail", "it's") must be found in the
// slide's text, the same way in the validator, the layout and the marker. And a highlight that is genuinely not in the text must
// never fail a slide: it is drawn without the highlight and the slide card says so.
import { expect, test, type Page } from '@playwright/test';
import { validatePlan } from '../../src/image-engine/validate';
import { findHighlight, missingHighlightNote, wordKey, wordKeys } from '../../src/image-engine/draw/words';

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

test.describe('one comparison for words (no browser)', () => {
  const KEYS: [string, string][] = [
    ['5,000', '5000'],
    ['$5,000,', '5000'],
    ['99.9%', '999'],
    ['3.5x', '35x'],
    ['50%', '50'],
    ['e-mail', 'e-mail'],
    ['E-Mail.', 'e-mail'],
    ["it's", "it's"],
    ['It’s', "it's"], // curly apostrophe
    ['‘quoted’', 'quoted'],
    ['"word,"', 'word'],
    ['—', ''], // a dash alone is only punctuation
    ['Café', 'café'],
    ['non‑stop', 'non-stop'], // a non-breaking hyphen is a hyphen
  ];
  for (const [raw, key] of KEYS) test(`wordKey(${JSON.stringify(raw)}) is ${JSON.stringify(key)}`, () => expect(wordKey(raw)).toBe(key));

  test('wordKeys splits on any white space, even a no-break space, and drops punctuation-only words', () => {
    expect(wordKeys('Earn $5,000, fast.')).toEqual(['earn', '5000', 'fast']);
    expect(wordKeys('keep together — please')).toEqual(['keep', 'together', 'please']);
  });

  test('findHighlight: every punctuation case is found in a headline that has the punctuation next to it', () => {
    const cases: [string, string[]][] = [
      ['Earn $5,000, fast.', ['5,000']],
      ['Earn $5,000, fast.', ['$5,000']],
      ['Earn $5,000, fast.', ['$5,000,']],
      ['Earn $5,000, fast.', ['5,000', 'fast']],
      ['Only 99.9% uptime, always', ['99.9%']],
      ['Get 3.5x more replies', ['3.5x']],
      ['Save 50% today', ['50%']],
      ['Send an e-mail today', ['e-mail']],
      ["It's time to start", ["it's"]],
      ['It’s time to start', ["it's"]],
      ["It's time to start", ['It’s']],
      ['Get 3.5x more replies and 99.9% uptime', ['3.5x', 'more', 'replies', 'and', '99.9%']],
    ];
    for (const [text, words] of cases) expect(findHighlight(text, words), `${text} / ${words.join(' ')}`).toEqual({ found: words, missing: [] });
    expect(findHighlight('Earn $5,000, fast.', ['6,000', 'fast'])).toEqual({ found: ['fast'], missing: ['6,000'] });
    expect(findHighlight('Hello', ['—'])).toEqual({ found: [], missing: ['—'] });
    expect(missingHighlightNote('x')).toBe("Highlight 'x' not found; drawn without it.");
  });

  test('the strict check for hand-written plans accepts punctuation and still refuses a word that is not there', () => {
    const plan = (text: string, words: string[]) => ({
      schema: 1,
      revision: 1,
      canvas: { width: 1080, height: 1350, background: '#ffffff' },
      layers: [{ id: 't', kind: 'text', x: 80, y: 80, width: 900, height: 300, rotation: 0, opacity: 1, text, style: { font: 'Schibsted Grotesk', weight: 800, size: 80, color: '#000000', lineHeight: 1, align: 'left' }, highlight: { words, color: '#ffee00', paddingX: 4, paddingY: 2, radius: 4 } }],
    });
    expect(validatePlan(plan('Earn $5,000, fast.', ['5,000']))).toEqual([]);
    expect(validatePlan(plan('Earn $5,000, fast.', ['$5,000,']))).toEqual([]);
    expect(validatePlan(plan('Only 99.9% uptime', ['99.9%']))).toEqual([]);
    expect(validatePlan(plan("It’s fine", ["it's"]))).toEqual([]);
    expect(validatePlan(plan('Earn $5,000, fast.', ['6,000'])).join(' ')).toContain('the highlighted word "6,000" is not in the text');
  });
});

const STYLES = ['dark-quiet', 'editorial-collage', 'hot-flat', 'object-neon'];
interface Slide { type: string; notes: string[]; plan: { layers: { id: string; kind: string; highlight?: { words: string[] } }[] } }
interface Marks { id: string; bars: number; lines: number; highlightedWords: string[]; highlightWords: string[] }

test.describe('drawn in the real layout (browser)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/image-engine/harness/index.html');
    await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
  });
  const cover = (headline: string, highlight: string) => ({ id: 'hl', brand: { handle: '@x' }, slides: [{ type: 'content', headline, body: 'A short line of body text to go under it.', highlight }] });

  test('every punctuation case is highlighted: the right words get a bar, in every style, with no note and no error', async ({ page }) => {
    const cases: [string, string, string[]][] = [
      ['Earn $5,000, fast.', '5,000', ['$5,000,']],
      ['Earn $5,000, fast.', '$5,000', ['$5,000,']],
      ['Only 99.9% uptime, always', '99.9%', ['99.9%']],
      ['Get 3.5x more replies', '3.5x', ['3.5x']],
      ['Save 50% today', '50%', ['50%']],
      ['Send an e-mail today', 'e-mail', ['e-mail']],
      ["It's time to start", "it's", ["It's"]],
      ['It’s time to start', "it's", ['It’s']],
      ['Earn $5,000, fast. No risk.', '$5,000, fast', ['$5,000,', 'fast.']],
      ['Get 3.5x more replies and 99.9% uptime', '3.5x more', ['3.5x', 'more']],
    ];
    let checked = 0;
    for (const style of STYLES)
      for (const [headline, highlight, expected] of cases) {
        const run = await call<Slide[]>(page, 'styleCompose', cover(headline, highlight), style, { anyCount: true });
        const s = run[0];
        expect(s.notes.filter((n) => n.startsWith("Highlight '")), `${style}: ${headline} / ${highlight}`).toEqual([]);
        const marks = await call<Marks[]>(page, 'highlightMarks', { schema: 1, revision: 1, canvas: { width: 1080, height: 1350, background: '#fff' }, layers: s.plan.layers });
        const h = marks.find((m) => m.id === 'headline');
        // Styles that mark whole lines rather than words still must not fail; for word markers the words themselves are checked.
        if (h && h.highlightWords.length > 0) {
          expect(h.highlightedWords.map((w) => w.toLowerCase()).sort(), `${style}: ${headline} / ${highlight}`).toEqual(expected.map((w) => w.toLowerCase()).sort());
          expect(h.bars, `${style}: ${headline} / ${highlight} is one bar`).toBe(1);
          checked++;
        }
      }
    expect(checked, 'at least some styles use word markers, so the words were really checked').toBeGreaterThan(10);
  });

  test('a headline where the highlight sits next to punctuation: "Earn $5,000, fast."', async ({ page }) => {
    for (const style of STYLES) {
      const run = await call<Slide[]>(page, 'styleCompose', { id: 'hl', brand: { handle: '@x' }, slides: [{ type: 'cover', headline: 'Earn $5,000, fast.', sub: 'No risk.', highlight: '5,000' }] }, style, { anyCount: true });
      expect(run[0].notes.filter((n) => n.startsWith("Highlight '"))).toEqual([]);
    }
  });

  test('a highlight that is not in the text never fails the slide: drawn without it, with a note', async ({ page }) => {
    for (const style of STYLES) {
      const out = await call<{ png: string; notes: string[]; lint: { id: string; pass: boolean }[]; plan: Slide['plan'] }[]>(page, 'styleRun', cover('Launch day is here', 'banana'), style, { anyCount: true });
      const s = out[0];
      expect(s.notes, style).toContain("Highlight 'banana' not found; drawn without it.");
      expect(s.png.length).toBeGreaterThan(1000); // it was drawn
      const h = s.plan.layers.find((l) => l.id === 'headline');
      expect(h?.highlight?.words ?? [], style).toEqual([]);
      expect(await call<string[]>(page, 'validate', { schema: 1, revision: 1, canvas: { width: 1080, height: 1350, background: '#ffffff' }, layers: s.plan.layers }), style).toEqual([]);
    }
    // Part found, part missing: the found part is still highlighted.
    const run = await call<Slide[]>(page, 'styleCompose', cover('Launch day is here', 'launch banana'), 'editorial-collage', { anyCount: true });
    expect(run[0].notes).toContain("Highlight 'banana' not found; drawn without it.");
    expect(run[0].plan.layers.find((l) => l.id === 'headline')?.highlight?.words).toEqual(['launch']);
  });
});

test.describe('on the slide card (the app)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test('the card says "Highlight \'banana\' not found; drawn without it" and the slide is drawn; a punctuation highlight shows no warning', async ({ page }) => {
    const script = {
      title: 'Highlights',
      brand: { handle: '@x' },
      slides: [
        { type: 'cover', headline: 'Earn $5,000, fast.', sub: 'No risk, no catch.', highlight: '5,000', element_tags: ['money', 'growth'] },
        { type: 'content', headline: 'Launch day is here', body: 'Everything is ready for the first customers.', highlight: 'banana', element_tags: ['launch', 'idea'] },
        { type: 'content', headline: 'Save 50% on e-mail tools', body: 'It’s a limited offer for early users.', highlight: '50% e-mail', element_tags: ['money', 'message'] },
      ],
    };
    await page.goto('/images/carousel');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText('Advanced: write the script yourself').click();
    await page.getByLabel('Paste the script Claude wrote (JSON)').fill(JSON.stringify(script));
    // The checker only warns about the highlight, it does not refuse the script.
    await expect(page.getByText('This script looks good: 3 slides')).toBeVisible();
    await expect(page.getByText(/highlights "banana"/)).toBeVisible();
    await page.getByRole('button', { name: 'Use this script' }).click();
    await expect(page.locator('.cr-card .cr-pic img')).toHaveCount(3, { timeout: 30_000 });
    const card = (n: number) => page.getByRole('listitem', { name: new RegExp(`^Slide ${n} of`) });
    await expect(card(2).getByText("Highlight 'banana' not found; drawn without it.")).toBeVisible();
    await expect(card(1).getByText(/not found/)).toHaveCount(0);
    await expect(card(3).getByText(/not found/)).toHaveCount(0);
    await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(3, { timeout: 30_000 });
    // Fixing the highlight in the editor removes the warning.
    await card(2).getByLabel('Highlighted words (optional)').fill('Launch');
    await expect(card(2).getByText(/not found/)).toHaveCount(0, { timeout: 15_000 });
  });
});
