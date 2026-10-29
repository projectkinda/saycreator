// Step 10: other formats and sizes through Generate, with a FAKE writer (no real call): quote cards, a 3-slide and a 10-slide
// carousel, and a text right under the 12,000-character limit. Every slide is saved as its own file for the Results screen.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/step10/formats');
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1280, height: 900 } });
test.beforeAll(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
});

const SOURCE = fs.readFileSync(path.join(ROOT, 'sample-inputs/creator.txt'), 'utf8');
const tags = (a: string, b: string) => [a, b];

const quoteScript = (n: number) => ({
  title: 'Batching, in three lines',
  brand: { handle: '@woodbench.daily' },
  slides: [
    { type: 'quote', quote: 'Deciding while the camera is on is what used to eat my hours.', by: 'From the text', highlight: 'camera', element_tags: tags('time', 'idea') },
    { type: 'quote', quote: 'Viewers only see the finished video.', by: 'From the text', highlight: 'finished video', element_tags: tags('people', 'proof') },
    { type: 'quote', quote: 'I now have two full days off every week.', by: 'From the text', highlight: 'two full days', element_tags: tags('time', 'love') },
    { type: 'quote', quote: 'Keep filming and editing as two separate blocks of time.', by: 'From the text', element_tags: tags('work', 'time') },
  ].slice(0, n),
});

/** n slides with every kind of slide in turn: a cover, middle slides of mixed types, and a closing. */
const bigScript = (n: number) => {
  const mids: Record<string, unknown>[] = [
    { type: 'content', headline: 'Daily filming wore me out', body: 'Every morning meant a topic, the lights, filming, then editing at night. No days off.', element_tags: tags('time', 'warning') },
    { type: 'step', number: 1, headline: 'Write five titles the night before', body: 'Add a rough outline for each. Deciding on camera eats the hours.', highlight: 'five titles', element_tags: tags('write', 'idea') },
    { type: 'step', number: 2, headline: 'Keep one setup for all five', body: 'Same light, same shirt, same background. Only the project changes.', highlight: 'one setup', element_tags: tags('work', 'quality') },
    { type: 'checklist', headline: 'Before the first take', headline2: '', items: ['Five titles written', 'One setup, lights fixed', 'Phone on silent', 'Water within reach'], element_tags: tags('proof', 'time') },
    { type: 'stat', kicker: 'The result', value: '2 days', label: 'off every week', note: 'From the text', element_tags: tags('time', 'growth') },
    { type: 'beforeafter', beforeLabel: 'Worry', before: 'Batching makes videos feel stale.', afterLabel: 'What happened', after: 'Viewers only see the finished video.', element_tags: tags('warning', 'people') },
    { type: 'step', number: 3, headline: 'Edit all five the next day', body: 'Back to back, while the outlines are still fresh.', element_tags: tags('time', 'speed') },
    { type: 'content', headline: 'Posting on time matters more', body: 'Viewers care about the upload, not the filming date.', element_tags: tags('people', 'message') },
  ].map((s) => {
    const c = { ...s };
    delete c.headline2;
    return c;
  });
  const middle = Array.from({ length: n - 2 }, (_, i) => mids[i % mids.length]);
  return {
    title: `${n} slides about batching`,
    brand: { handle: '@woodbench.daily' },
    slides: [
      { type: 'cover', kicker: 'Woodworking channel', headline: 'Film five videos in one afternoon', sub: 'How batching ended daily filming.', highlight: 'five videos', element_tags: tags('time', 'launch') },
      ...middle,
      { type: 'closing', headline: 'Two days off, no missed uploads', cta: 'Save this and try one batch week', element_tags: tags('launch', 'love') },
    ],
  };
};

async function fake(page: Page, answer: (prompt: string) => string) {
  const calls: string[] = [];
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.route('**/__carousel/write', (r) => {
    const prompt = (r.request().postDataJSON() as { prompt: string }).prompt;
    calls.push(prompt);
    return r.fulfill({ json: { text: answer(prompt), ms: 5 } });
  });
  return calls;
}
const open = async (page: Page) => {
  await page.goto('/images/carousel');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('creator.groups', 'all'); });
  await page.reload();
  await expect(page.getByTestId('writer-label')).toContainText('Claude Code');
};
const source = (page: Page) => page.getByLabel('Your text, idea or article');

/** Waits for every slide, saves each as its own PNG, and returns the phone-check failures and the picture sizes. */
async function collect(page: Page, name: string, count: number) {
  await expect(page.locator('.cr-card')).toHaveCount(count, { timeout: 30_000 });
  await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(count, { timeout: 60_000 });
  const imgs = await page.locator('.cr-card .cr-pic img').evaluateAll(async (els) =>
    Promise.all(els.map(async (e) => {
      const blob = await (await fetch((e as HTMLImageElement).src)).blob();
      const b64 = await new Promise<string>((res) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(',')[1]);
        fr.readAsDataURL(blob);
      });
      return { b64, w: (e as HTMLImageElement).naturalWidth, h: (e as HTMLImageElement).naturalHeight };
    })),
  );
  const files = imgs.map((im, i) => {
    const f = path.join(OUT, `${name}-${String(i + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(f, Buffer.from(im.b64, 'base64'));
    return path.relative(ROOT, f).split(path.sep).join('/');
  });
  const failures = await page.locator('.cr-card').evaluateAll((cards) => cards.flatMap((c, n) => [...c.querySelectorAll('.cr-lint-fail li')].map((x) => `Slide ${n + 1}: ${x.textContent}`)));
  const result = { name, count, sizes: [...new Set(imgs.map((i) => `${i.w}x${i.h}`))], failures, files };
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(result, null, 2));
  return result;
}

test('quote cards: three square cards from a text', async ({ page }) => {
  const calls = await fake(page, () => JSON.stringify(quoteScript(3)));
  await open(page);
  await source(page).fill(SOURCE);
  await page.getByRole('button', { name: /^Quote card/ }).click();
  await expect(page.getByRole('combobox', { name: /^Cards/ })).toHaveValue('3');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const r = await collect(page, 'quote-cards', 3);
  expect(r.sizes).toEqual(['1080x1080']);
  expect(calls[0]).toContain('a set of 3 quote cards');
  expect(calls[0]).toMatch(/every one of type "quote"/);
  await expect(page.getByTestId('progress')).toContainText('Done: 3 cards');
  expect(r.failures, JSON.stringify(r.failures)).toEqual([]);
});

test('a 3-slide carousel', async ({ page }) => {
  const calls = await fake(page, () => JSON.stringify(bigScript(3)));
  await open(page);
  await source(page).fill(SOURCE);
  await page.getByRole('combobox', { name: /^Slides/ }).selectOption('3');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const r = await collect(page, 'carousel-3', 3);
  expect(r.sizes).toEqual(['1080x1350']);
  expect(calls[0]).toContain('3-slide carousel');
  await expect(page.getByTestId('progress')).toContainText('Done: 3 slides');
  expect(r.failures, JSON.stringify(r.failures)).toEqual([]);
});

test('a 10-slide carousel', async ({ page }) => {
  test.setTimeout(120_000);
  const calls = await fake(page, () => JSON.stringify(bigScript(10)));
  await open(page);
  await source(page).fill(SOURCE);
  await page.getByRole('combobox', { name: /^Slides/ }).selectOption('10');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const r = await collect(page, 'carousel-10', 10);
  expect(r.sizes).toEqual(['1080x1350']);
  expect(calls[0]).toContain('10-slide carousel');
  await expect(page.getByTestId('progress')).toContainText('Done: 10 slides');
  // The page numbers count to 10.
  expect(r.failures, JSON.stringify(r.failures)).toEqual([]);
});

test('a text right under the 12,000-character limit is sent whole; one character over is refused', async ({ page }) => {
  const calls = await fake(page, () => JSON.stringify(bigScript(7)));
  await open(page);
  const near = (SOURCE + ' ').repeat(40).slice(0, 11_990).trim();
  expect(near.length).toBeGreaterThan(11_900);
  expect(near.length).toBeLessThanOrEqual(12_000);
  await source(page).fill(near);
  await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const r = await collect(page, 'near-limit', 7);
  expect(calls[0]).toContain(near);
  expect(r.failures, JSON.stringify(r.failures)).toEqual([]);
  await source(page).fill(near + ' ' + 'x'.repeat(30));
  await expect(page.getByText(/The limit is 12,000/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();
});
