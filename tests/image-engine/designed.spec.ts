// Designed mode (the model designs every slide), tested with a FAKE writer only: the mode switch and estimate, one call for the story and the designs,
// the checks (extra words, edges), the one retry and the fallback, text edits through the slots with no model call, per-slide redesign, and saving the look as a pack.
import { expect, test, type Page, type Route } from '@playwright/test';
import { exampleScript } from '../../src/carousel/script';

test.setTimeout(240_000);
test.use({ viewport: { width: 1280, height: 900 } });

const TEXT = 'I film five videos in one afternoon once a week. The night before I write the five titles. I keep one setup so I never rebuild the lights. Then I edit all five back to back the next day.';
const PAL = `data-palette='{"bg":"#101820","text":"#F5F0EB","accent":"#FF8A4C","accent2":"#4CC9F0","surface":"#1B2733","muted":"#9AA5B1"}'`;
const Y = [300, 800, 520, 700, 380, 760, 600];
type S = Record<string, unknown>;
const script = JSON.parse(exampleScript('carousel')) as { slides: S[]; brand: { handle: string } };
const titleOf = (s: S) => String(s.headline ?? s.quote ?? s.label ?? s.value ?? s.body ?? 'x');

/** A design for slide i that uses only the slide's own words, a different arrangement per slide, and the recurring page number. */
function svgFor(i: number, s: S, o: { extra?: string; edge?: boolean } = {}): string {
  const base = titleOf(s).split(/\s+/).slice(0, 3).join(' ');
  const title = (o.extra ? base + ' ' + o.extra : base).replace(/&/g, '&amp;');
  const x = o.edge ? 4 : 80 + (i % 3) * 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-slide="${i + 1}" data-type="${String(s.type)}" ${PAL}><rect width="1080" height="1350" fill="$bg"/><g id="icon-${i}"><circle cx="${880 - i * 20}" cy="${160 + i * 10}" r="${50 + i * 6}" fill="$accent"/></g><text data-role="title" data-min-size="44" data-max-lines="4" x="${x}" y="${Y[i % 7]}" font-size="64" font-family="Schibsted Grotesk" font-weight="700" fill="$text">${title}</text><text x="80" y="1270" font-size="30" font-family="Instrument Sans" fill="$muted">${i + 1} / 7</text></svg>`;
}
const answer = (svgs: string[], extra: Record<string, unknown> = {}) => JSON.stringify({ ...script, ...extra }) + '\n' + svgs.join('\n');
const all = (o: Record<number, { extra?: string; edge?: boolean }> = {}) => script.slides.map((s, i) => svgFor(i, s, o[i]));

interface Fake {
  calls: string[];
}
async function fake(page: Page, answerFor: (n: number, prompt: string) => string): Promise<Fake> {
  const f: Fake = { calls: [] };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = async (r: Route) => {
    const prompt = (r.request().postDataJSON() as { prompt: string }).prompt;
    f.calls.push(prompt);
    await r.fulfill({ json: { text: answerFor(f.calls.length, prompt), ms: 5 } }).catch(() => undefined);
  };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const open = async (page: Page) => {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
  await page.getByLabel('Your text, idea or article').fill(TEXT);
};
const generate = (page: Page) => page.getByRole('button', { name: 'Generate', exact: true });
const drawn = async (page: Page, n = 7) => {
  await expect(page.locator('.cr-card')).toHaveCount(n, { timeout: 60_000 });
  await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(n, { timeout: 60_000 });
};

test('mode switch and estimate: Designed is the default and shows the calls and seconds; Quick makes no design call and is unchanged', async ({ page }) => {
  const f = await fake(page, () => JSON.stringify(script));
  await open(page);
  const designed = page.getByRole('button', { name: 'Designed', exact: true });
  const quick = page.getByRole('button', { name: /^Quick \(free, templates\)/ });
  await expect(designed).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('estimate')).toContainText(/1 model call and about \d+ seconds for 7 slides/);
  await expect(page.getByTestId('estimate')).toContainText('Only facts from your text are used');
  await quick.click();
  await expect(quick).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('estimate')).toContainText('no design call');
  await generate(page).click();
  await drawn(page);
  expect(f.calls.length, 'Quick mode makes the one writer call it always did').toBe(1);
  expect(f.calls[0]).not.toContain('PART 2');
  await expect(page.getByTestId('designed-card')).toHaveCount(0);
});

test('Designed: ONE call returns the story and seven designs; each is drawn faithfully, with the page number and a different composition per slide', async ({ page }) => {
  const f = await fake(page, () => answer(all()));
  await open(page);
  await generate(page).click();
  await drawn(page);
  expect(f.calls.length).toBe(1);
  expect(f.calls[0]).toContain('PART 2');
  expect(f.calls[0]).toContain('only facts');
  await expect(page.getByTestId('designed-card')).toContainText('7 of 7 slides were designed by the model');
  await expect(page.getByTestId('designed-card')).toContainText('1 model call');
  await expect(page.getByTestId('faithful-note')).toHaveCount(7);
});

test('the checks: extra words and edge-hugging slots are refused in plain words; the other slides pass', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ text, handle }) => {
    const D = await import('/src/carousel/designed.ts');
    const S = await import('/src/carousel/script.ts');
    const v = S.validateScriptText(text.slice(0, text.search(/<svg/i)), 'carousel');
    const blocks = [...D.svgsOf(text).values()];
    const out: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const slide = v.script!.slides[i] as unknown as Record<string, unknown>;
      out.push(D.checkDesign(slide, handle, 7, blocks[i], null, []));
    }
    return out;
  }, { text: answer([svgFor(0, script.slides[0], { extra: 'zebra unicorn' }), svgFor(1, script.slides[1]), svgFor(2, script.slides[2])]), handle: script.brand.handle });
  expect(r[0][0]).toMatch(/not in this slide's script: .*zebra/);
  expect(r[1]).toEqual([]);
  expect(r[2]).toEqual([]);
});

test('retry and fallback: one retry (a counted call) fixes slide 3; slide 5 stays bad and falls back to the style, and says so', async ({ page }) => {
  const f = await fake(page, (n) => {
    if (n === 1) return answer(all({ 2: { extra: 'zebra' }, 4: { extra: 'giraffe' } }));
    // the retry: slide 3 fixed, slide 5 still carries an invented word
    return [svgFor(2, script.slides[2]), svgFor(4, script.slides[4], { extra: 'giraffe' })].join('\n');
  });
  await open(page);
  await generate(page).click();
  await drawn(page);
  expect(f.calls.length, 'one retry, counted').toBe(2);
  expect(f.calls[1]).toContain('slide 3');
  expect(f.calls[1]).toContain('slide 5');
  expect(f.calls[1]).toContain('zebra');
  await expect(page.getByTestId('designed-card')).toContainText('6 of 7 slides were designed by the model; 1 fell back');
  await expect(page.getByTestId('designed-card')).toContainText('2 model calls');
  await expect(page.getByTestId('designed-card')).toContainText('Slide 5: the design uses words that are not in this slide');
  await expect(page.getByTestId('faithful-note')).toHaveCount(6);
  await expect(page.locator('.cr-card').nth(4)).toContainText("fell back to the style's own design");
});

test('text edits go through the slots with no model call; Make editable works; redesign is one small call; the look saves as a pack', async ({ page }) => {
  const f = await fake(page, (n, prompt) => {
    if (prompt.includes('[carousel:redesign]')) return svgFor(1, script.slides[1], { extra: '' }).replace('y="800"', 'y="450"');
    return answer(all());
  });
  await open(page);
  await generate(page).click();
  await drawn(page);
  // a text edit (the headline of slide 1) is a patch: the slide is redrawn from its slots and no call is made
  const card = page.locator('.cr-card').first();
  const head = card.getByRole('textbox').first();
  await head.fill('A brand new headline here');
  await expect(card.getByTestId('faithful-note')).toBeVisible();
  expect(f.calls.length).toBe(1);
  // make editable
  await card.getByRole('button', { name: 'Make editable' }).click();
  await expect(card.getByTestId('faithful-note')).toHaveCount(0);
  // redesign slide 2: one small call
  const second = page.locator('.cr-card').nth(1);
  await second.getByLabel('Words for redesigning slide 2').fill('bolder');
  await second.getByRole('button', { name: 'Redesign this slide' }).click();
  await expect(second.getByText(/Redesigned slide 2 \(1 model call\)/)).toBeVisible({ timeout: 30_000 });
  expect(f.calls.length).toBe(2);
  expect(f.calls[1]).toContain('bolder');
  expect(f.calls[1]).toContain('Match the style of its neighbours');
  // save the look
  await page.getByRole('button', { name: 'Save this look as a pack' }).click();
  await expect(page.getByTestId('designed-card')).toContainText('Saved “My designed look” as a template', { timeout: 30_000 });
  expect(f.calls.length, 'saving the look is free').toBe(2);
});
