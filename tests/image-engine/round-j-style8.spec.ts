// Round J part 2: switching to style-8 (from every other style) on three decks shows no phone-check warning. A FAKE writer only: one fake call to make a deck, 0 for every switch.
// The deck is drawn again from its stored plan on each switch; a colour that does not read is fixed by changing a colour on the same layout (the same rule as a new deck), never by another layout.
// Every switch's result is written to out/round-j/warning-style8.json (the reproduction record).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(10 * 60_000);
const DOC_KEY = 'creator.carousel.project.v1';
const HOODIE = fs.readFileSync('tests/image-engine/fixtures/hoodie-deck.json', 'utf8');
const STYLES = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7'];
const PLAN = JSON.stringify({ title: 'Say Creator', slides: [
  { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
  { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }, accents: [] },
  { layout: 'stepper', fields: { title: 'How it works', steps: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: ['it works'] },
  { layout: 'big-stat', fields: { number: '15', label: 'styles to pick from' }, accents: [] },
  { layout: 'statement-card', fields: { headline: 'You can add your own pictures too.' }, accents: [] },
  { layout: 'checklist', fields: { title: 'What you get', items: ['Slides you can edit', 'Words that stay put', 'A look in one click'] }, accents: [] },
  { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." }, accents: [] },
] });
const TEXT = 'Most creators do not have a design problem. Write a good post, then turn it into slides. How it works: paste your text, pick a look from 15 styles, get slides you can edit. Fifteen styles to pick from. Add your own pictures. What you get: slides you can edit. Comment "slides" and I will send you the link.';

async function fake(page: Page) {
  let calls = 0;
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const w = (r: any) => { calls++; return r.fulfill({ json: { text: PLAN, ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  return () => calls;
}
const step = (page: Page, n: number) => page.locator('.cr-wiz-steps button').nth(n - 1).click();
const title = (page: Page, id: string) => page.evaluate(async (n) => (await import('/src/carousel/render.ts')).styleByName(n)?.spec.title as string, id);
async function pick(page: Page, id: string) {
  const t = await title(page, id);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').project?.doc?.style, DOC_KEY), { timeout: 30_000 }).toBe(id);
  await page.waitForTimeout(1200);
}
/** The phone-size line after the deck is drawn: the warning text, or '' when every slide passes. */
async function warning(page: Page): Promise<string> {
  await expect(page.locator('p[role=status]').filter({ hasText: /phone-size check|something to fix|too many words|have a warning/ }).first()).toBeVisible({ timeout: 30_000 });
  const w = page.getByTestId('phone-warning');
  return (await w.count()) ? ((await w.textContent()) ?? '').replace(/\s+/g, ' ').trim() : '';
}
async function picturesFiles(page: Page) {
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (const [name, wd, ht] of [['wide', 1600, 900], ['tall', 1107, 2400]] as [string, number, number][]) {
    const b64 = await page.evaluate(async ({ wd, ht }) => {
      const c = document.createElement('canvas'); c.width = wd; c.height = ht; const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, wd, ht); g.fillStyle = '#1d1d1f'; g.fillRect(0, 0, wd, ht * 0.06); g.fillStyle = '#ececf0'; g.fillRect(0, ht * 0.06, wd * 0.2, ht);
      for (let i = 0; i < 16; i++) { g.fillStyle = i % 4 === 0 ? '#2f6fed' : '#333'; g.fillRect(wd * 0.26, ht * (0.1 + i * 0.05), wd * (0.25 + ((i * 37) % 40) / 100), ht * 0.014); }
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png')); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
    }, { wd, ht });
    files.push({ name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  }
  return files;
}
type Deck = 'hoodie' | 'most-creators' | 'with-pictures';
async function openDeck(page: Page, deck: Deck) {
  const calls = await fake(page);
  if (deck === 'hoodie') {
    await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k as string, v as string); sessionStorage.setItem('seeded', '1'); } }, [DOC_KEY, HOODIE] as const);
    await page.goto('/images/carousel');
    await expect(page.locator('.cr-film img')).toHaveCount(7, { timeout: 60_000 });
  } else {
    await page.goto('/images/carousel');
    if (deck === 'with-pictures') {
      await page.getByLabel('Choose images for the slides').setInputFiles(await picturesFiles(page));
      await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(2, { timeout: 60_000 });
    }
    await page.getByLabel('Your text or topic').fill(TEXT);
    await step(page, 3);
    await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
    await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
    await expect(page.locator('.cr-film img')).toHaveCount(7, { timeout: 120_000 });
  }
  await page.waitForTimeout(1500);
  await step(page, 3);
  return calls;
}

const record: Record<string, { from: string; warning: string; undoBack: boolean }[]> = {};
for (const deck of ['hoodie', 'most-creators', 'with-pictures'] as Deck[]) {
  test(`J2: ${deck}: switching to style-8 from each of the other 14 styles shows no phone-check warning, 0 writer calls, one Undo takes it back`, async ({ page }) => {
    const calls = await openDeck(page, deck);
    const made = calls();
    const rows: { from: string; warning: string; undoBack: boolean }[] = [];
    for (const from of STYLES) {
      await pick(page, from);
      await pick(page, 'style-8');
      const w = await warning(page);
      // one Undo puts the deck back in the style it came from
      await page.getByRole('button', { name: /^Undo: Change style/ }).first().click();
      const back = await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').project?.doc?.style, DOC_KEY), { timeout: 15_000 }).toBe(from).then(() => true, () => false);
      rows.push({ from, warning: w, undoBack: back });
    }
    record[deck] = rows;
    fs.mkdirSync('out/round-j', { recursive: true });
    const all = fs.existsSync('out/round-j/warning-style8.json') ? JSON.parse(fs.readFileSync('out/round-j/warning-style8.json', 'utf8')) : {};
    all[deck] = rows;
    fs.writeFileSync('out/round-j/warning-style8.json', JSON.stringify(all, null, 1));
    expect(calls(), 'the switches made no writer call').toBe(made);
    for (const r of rows) {
      expect.soft(r.warning, `${deck}: ${r.from} -> style-8`).toBe('');
      expect.soft(r.undoBack, `${deck}: ${r.from} -> style-8, Undo goes back to ${r.from}`).toBe(true);
    }
  });
}
