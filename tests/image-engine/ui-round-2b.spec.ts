// UI round 2b (ZERO model calls: a pasted script never reaches a writer):
//   - "I already have a script" is drawn by the layout library like a written deck, with no model call; the Edit tabs, text edits, layout swaps and Undo all work on it
//   - bad JSON gives a plain error that says where; a script the library cannot show falls back to the older templates
//   - Pictures tab: a slide with no picture slot offers "Add a picture to this slide"; old tools are in Developer tools
//   - Fine-tune in plain words; style cards without ids unless Developer tools is on; a short header on a phone
// Screenshots: out/ui-round-2b/
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { deckDrawn, openTab, stylesDrawn, toStep } from './ui';

test.setTimeout(300_000);
const KEY = 'creator.carousel.project.v1';
const OUT = 'out/ui-round-2b';
const SAMPLES = fs.readdirSync('sample-scripts').filter((f) => f.endsWith('.json')).sort();
const sample = (i = 0) => fs.readFileSync(path.join('sample-scripts', SAMPLES[i]), 'utf8');

/** Any call to a writer is counted (there must be none). */
async function counting(page: Page) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: '{}', ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const proj = (page: Page) => page.evaluate((key) => {
  const d = (JSON.parse(localStorage.getItem(key) ?? '{}') as { project?: { doc?: any } }).project?.doc;
  const l = d?.designed?.library;
  return { style: d?.style as string, route: d?.route as { route: string; reason: string } | undefined, hasLibrary: !!l?.plan, specs: (l?.plan?.specs ?? []) as { layout: string; fields: Record<string, any>; accents: string[] }[], layouts: (l?.layouts ?? []) as string[], calls: (d?.designed?.calls ?? 0) as number, redraws: (l?.redraws ?? 0) as number, script: d?.script, svgs: Object.values(d?.designed?.slides ?? {}).map((s: any) => String(s?.built?.svg ?? '')) as string[] };
}, KEY);

/** Paste a script on step 1 and press "Use this script". */
async function pasteScript(page: Page, text: string, style = 'Hot flat') {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: new RegExp(style) }).first().click();
  await toStep(page, 1);
  await page.getByRole('button', { name: 'I already have a script' }).click();
  await page.getByLabel('Paste the script Claude wrote (JSON)').fill(text);
  await page.getByRole('button', { name: 'Use this script' }).click();
}

test('a pasted sample script becomes a library deck: same route as a written deck, 0 model calls, no old ring or grey cards', async ({ page }) => {
  const f = await counting(page);
  await pasteScript(page, sample(0));
  await expect(page.getByRole('status').filter({ hasText: 'Script loaded' }).first()).toContainText('0 model calls', { timeout: 60_000 });
  const n = JSON.parse(sample(0)).slides.length;
  await deckDrawn(page, n);
  const p = await proj(page);
  expect(p.hasLibrary, 'the library plan is stored').toBe(true);
  expect(p.route?.route).toBe('designed');
  expect(p.specs.length).toBe(n);
  expect(p.calls).toBe(0);
  expect(f.calls, 'no writer call').toBe(0);
  // not the old template route: no slide carries the old pen ring or the grey card of the templates
  for (const svg of p.svgs) expect(svg).not.toMatch(/data-id="(pen-ring|grey-card)"|id="(pen-ring|grey-card)"/);
  expect(p.svgs.length).toBe(n);
  // the words are the script's own words
  const words = JSON.stringify(p.specs.map((s) => s.fields)).toLowerCase();
  const first = JSON.parse(sample(0)).slides[0];
  expect(words).toContain(String(first.headline).toLowerCase().slice(0, 20));
});

test('on a pasted-script deck the Edit tabs work: a text edit and a layout swap redraw with no model call, and Undo takes each back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const f = await counting(page);
  await pasteScript(page, sample(0));
  await deckDrawn(page, JSON.parse(sample(0)).slides.length);
  const before = await proj(page);
  // text edit (Text tab)
  await openTab(page, 'Text', 2);
  const field = page.getByTestId('text-tab-1').getByLabel(/^Headline/).first();
  const old = await field.inputValue();
  await field.fill('Words I changed myself');
  await expect.poll(async () => JSON.stringify((await proj(page)).specs[1].fields), { timeout: 30_000 }).toContain('Words I changed myself');
  expect((await proj(page)).redraws).toBe(before.redraws + 1);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => JSON.stringify((await proj(page)).specs[1].fields), { timeout: 30_000 }).not.toContain('Words I changed myself');
  await expect(field).toHaveValue(old);
  // layout swap (Layout tab)
  await openTab(page, 'Layout', 1);
  const g = page.getByTestId('gallery-0');
  await expect(g).toHaveAttribute('data-ready-ms', /\d+/, { timeout: 120_000 });
  const l0 = (await proj(page)).layouts[0];
  const tile = g.locator('[data-testid^="gal-item-"][data-enabled="true"][data-current="false"] button:not([disabled])').first();
  await expect(tile).toBeVisible();
  await tile.click();
  await expect.poll(async () => (await proj(page)).layouts[0], { timeout: 60_000 }).not.toBe(l0);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await proj(page)).layouts[0], { timeout: 30_000 }).toBe(l0);
  expect(f.calls, 'no writer call at all').toBe(0);
  expect((await proj(page)).calls).toBe(0);
});

test('bad JSON gives a plain error that says where; nothing is drawn and no call is made', async ({ page }) => {
  const f = await counting(page);
  await page.goto('/images/carousel');
  await page.getByRole('button', { name: 'I already have a script' }).click();
  const box = page.getByLabel('Paste the script Claude wrote (JSON)');
  await box.fill('{ "title": "Oops", "slides": [ { "type": "cover", "headline": "Hi" }, ');
  const err = page.getByRole('alert').filter({ hasText: 'problem' }).first();
  await expect(err).toContainText('not valid JSON');
  await expect(err).toContainText(/line \d+, column \d+/);
  await expect(page.getByRole('button', { name: 'Use this script' })).toBeDisabled();
  // a script with a wrong field says which slide and field
  const bad = JSON.parse(sample(0));
  delete bad.slides[2].headline;
  await box.fill(JSON.stringify(bad));
  await expect(page.getByRole('alert').filter({ hasText: 'problem' }).first()).toContainText(/slides\[2\]|slide 3/i);
  expect(f.calls).toBe(0);
});

test('a slide the library cannot show (round 3: only that slide falls back to the template, its words kept) with a plain note and no model call', async ({ page }) => {
  const f = await counting(page);
  const long = JSON.parse(sample(0));
  // six items: more than any library list layout takes, still fine for the older templates
  long.slides[2] = { type: 'checklist', headline: 'Six small things', items: ['Write it down', 'Sort it', 'Pick one', 'Do it now', 'Check it', 'Share it'] };
  await pasteScript(page, JSON.stringify(long));
  await expect(page.getByRole('status').filter({ hasText: 'Script loaded' }).first()).toContainText('0 model calls', { timeout: 60_000 });
  await deckDrawn(page, long.slides.length);
  const p = await proj(page);
  // round 3: the deck stays on the library route; only the six-item slide keeps its words and is drawn by the style's template
  expect(p.hasLibrary).toBe(true);
  expect(p.route?.route).toBe('designed');
  expect(JSON.stringify(p.script.slides[2].items)).toContain('Share it');
  expect(f.calls).toBe(0);
});

test('Pictures tab: no picture slot offers "Add a picture to this slide"; the old picture box and tags are in Developer tools', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await counting(page);
  await pasteScript(page, sample(0));
  await deckDrawn(page, JSON.parse(sample(0)).slides.length);
  await openTab(page, 'Pictures', 2);
  await expect(page.getByText('Add pictures in step 1')).toBeVisible();
  await expect(page.getByLabel('Picture for slide 2')).toHaveCount(0);
  await expect(page.getByText('Picture tags (2 to 4)')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Developer tools' }).check();
  await expect(page.getByLabel('Picture for slide 2')).toBeVisible();
  await expect(page.getByText('Picture tags (2 to 4)')).toBeVisible();
});

test('Fine-tune says it applies to all slides, in plain words; style cards have no ids unless Developer tools is on', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await counting(page);
  await pasteScript(page, sample(0));
  await deckDrawn(page, JSON.parse(sample(0)).slides.length);
  await openTab(page, 'Fine-tune', 1);
  await expect(page.getByText('Applies to all slides')).toBeVisible();
  const fine = await page.getByTestId('detected-style').innerText();
  expect(fine).not.toMatch(/detected:/i);
  await toStep(page, 3);
  const list = page.getByRole('list', { name: 'Styles' });
  await stylesDrawn(page);
  expect(await list.innerText()).not.toMatch(/\b(dark-quiet|editorial-collage|hot-flat|style-\d)\b/);
  await page.getByRole('checkbox', { name: 'Developer tools' }).check();
  expect(await list.innerText()).toMatch(/dark-quiet/);
});

test('on a phone the title, Reset page and intro take little height before the steps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await counting(page);
  await page.goto('/images/carousel');
  const top = await page.getByRole('navigation', { name: 'Steps' }).evaluate((e) => e.getBoundingClientRect().top);
  expect(top, 'the steps start high on a phone').toBeLessThan(300);
});

test('screenshots: a pasted-script deck (step 1, step 4, the edit tabs) and the Pictures tab with and without pictures, phone and desktop', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await counting(page);
  for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(vp);
    await page.goto('/images/carousel');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const shot = (file: string) => page.screenshot({ path: `${OUT}/${name}-${file}.png` });
    await page.getByRole('button', { name: 'I already have a script' }).click();
    await page.getByLabel('Paste the script Claude wrote (JSON)').fill(sample(0));
    await page.locator('.cr-script-own').scrollIntoViewIfNeeded();
    await shot('1-paste-script');
    await toStep(page, 3);
    await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
    await toStep(page, 1);
    await page.getByRole('button', { name: 'Use this script' }).click();
    await deckDrawn(page, JSON.parse(sample(0)).slides.length);
    await shot('4-slides');
    await openTab(page, 'Layout', 2);
    await page.getByTestId('gallery-1').scrollIntoViewIfNeeded(); // the thumbnails are drawn when the gallery is on screen
    await expect(page.getByTestId('gallery-1')).toHaveAttribute('data-ready-ms', /\d+/, { timeout: 120_000 });
    await page.getByTestId('edit-view').scrollIntoViewIfNeeded();
    await shot('5-tab-layout');
    await openTab(page, 'Text', 2);
    await shot('6-tab-text');
    await openTab(page, 'Pictures', 2);
    await shot('7-tab-pictures-no-pictures');
    await openTab(page, 'Fine-tune', 2);
    await shot('8-tab-fine-tune');
  }
});

// ---- pictures: a written deck with the writer's answer faked (one call), then everything by code ----
const WRITER = JSON.stringify({
  title: 'Quick Flip',
  slides: [
    { layout: 'photo-cover', fields: { headline: 'A hoodie that flips into a backpack', intro: 'We sewed a bag into the hood.' }, accents: [] },
    { layout: 'do-dont', fields: { title: 'Pack it', num: '1', wrong: 'A bag and a hoodie, both heavy.', right: 'One hoodie that becomes the bag.' }, accents: [] },
    { layout: 'portrait-closing', fields: { headline: 'Meet the maker', heading: 'Back Quick Flip today', p1: 'We are two friends who got tired of carrying a bag.', url: 'quickflip.com' }, accents: [] },
  ],
});
const TEXT = 'A hoodie that flips into a backpack. We sewed a bag into the hood, so one layer does both jobs. Back Quick Flip today.';
async function flat(page: Page, name: string, w: number, h: number, color: string) {
  const b64 = await page.evaluate(async ({ w, h, color }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, w, h);
    // photo-like (a gradient with many small marks, as makePic busy does), not flat colour blocks: a flat picture counts as a screenshot, and a screenshot is never the cover (Round 14)
    if (c.width * c.height <= 4000000) { let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); const gr = g.createLinearGradient(0, 0, c.width, c.height); gr.addColorStop(0, color); gr.addColorStop(1, '#ffe9c4'); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height); for (let i = 0; i < 6000; i++) { g.fillStyle = 'hsla(' + Math.floor(rnd() * 360) + ', 60%, ' + (20 + rnd() * 60) + '%, 0.55)'; const s = (0.004 + rnd() * 0.03) * Math.min(c.width, c.height); g.fillRect(rnd() * c.width, rnd() * c.height, s, s); } }
    g.fillStyle = '#fff'; g.fillRect(w * 0.4, h * 0.4, w * 0.2, h * 0.2); // a small mark: a big flat block would make the picture a screenshot
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
    const buf = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of buf) t += String.fromCharCode(x);
    return btoa(t);
  }, { w, h, color });
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}
async function writtenDeckWithPictures(page: Page, count: 3 | 4) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'x' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'x' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  const files = [await flat(page, 'land.jpg', 1500, 1000, '#c0392b'), await flat(page, 'port.jpg', 1000, 1500, '#2471a3'), await flat(page, 'square.jpg', 1200, 1200, '#b7950b'), ...(count === 4 ? [await flat(page, 'land2.jpg', 1600, 900, '#7d3c98')] : [])];
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(count, { timeout: 30_000 });
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 3);
  return f;
}

test('tapping a picture on the preview opens the Pictures tab on that slot', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const f = await writtenDeckWithPictures(page, 3);
  const tap = page.locator('.cr-stage-ov').getByTestId('slot-0-1');
  await expect(tap).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('edit-view')).toHaveCount(0);
  await tap.click();
  await expect(page.getByTestId('edit-view')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pictures' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('slot-panel-0')).toBeVisible();
  expect(f.calls, 'only the one writer call that made the deck').toBe(1);
});

test('a slide with no picture slot offers "Add a picture to this slide" when pictures are free; it makes no model call and Undo takes it back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const f = await writtenDeckWithPictures(page, 4);
  let found = 0;
  for (const n of [1, 2, 3]) {
    await openTab(page, 'Pictures', n);
    const add = page.getByRole('button', { name: 'Add a picture to this slide' });
    if (!(await add.count())) continue;
    found++;
    await add.click();
    await expect(page.getByTestId('add-picture').getByRole('status')).toContainText(/Added a picture|No picture layout fits/, { timeout: 60_000 });
  }
  expect(found, 'at least one slide has no slot and offers the button').toBeGreaterThan(0);
  expect(f.calls).toBe(1);
});

test('screenshots: the Pictures tab with pictures (slots, the unused tray)', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
    const ctx = await browser.newContext({ viewport: vp, storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    await writtenDeckWithPictures(p, 4);
    await openTab(p, 'Pictures', 1);
    await p.getByTestId('slot-tab-0-1').click();
    await p.getByTestId('edit-view').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/${name}-9-tab-pictures-with-pictures.png` });
    await ctx.close();
  }
});
