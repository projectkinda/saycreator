// UI round 3 (ZERO model calls beyond the one FAKE writer answer that makes the written deck):
//   A  highlight drawn in a pasted deck; a truthful phone-size line; plain wording; a small live preview while editing on a phone; Fine-tune without a gap; an "Upload a new picture" button
//   B  switching the style of an existing deck (written and pasted): redrawn from the stored plan, text kept, one undo step, no model call
//   C  a pasted script with one very long slide: only that slide falls back
// Screenshots: out/ui-round-3/
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { deckDrawn, openTab, toStep } from './ui';

test.setTimeout(300_000);
const KEY = 'creator.carousel.project.v1';
const OUT = 'out/ui-round-3';
const SAMPLE = fs.readFileSync(path.join('sample-scripts', 'agency-client-brief.json'), 'utf8');
const N = JSON.parse(SAMPLE).slides.length;

const fixture = JSON.parse(fs.readFileSync('tests/image-engine/fixtures/hot-flat-app-library.json', 'utf8')).library;
const SPECS = fixture.plan.specs.map((s: any) => ({ layout: s.layout, fields: s.fields, accents: s.accents }));
const WRITER = JSON.stringify({ title: fixture.plan.title ?? 'Stop storing your life in your head', slides: SPECS });
const TEXT = 'Stop storing your life in your head. Hold things in a system you trust. Three steps: capture, sort, review. Build your own. Join the waitlist today.';

async function counting(page: Page, writer = '{}') {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'x' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'x' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: writer, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const proj = (page: Page) => page.evaluate((key) => {
  const d = (JSON.parse(localStorage.getItem(key) ?? '{}') as { project?: { doc?: any } }).project?.doc;
  const l = d?.designed?.library;
  return {
    style: d?.style as string, source: l?.source as string, hasLibrary: !!l?.plan, route: d?.route as { route: string; reason: string } | undefined,
    specs: (l?.plan?.specs ?? []) as { layout: string; fields: Record<string, any>; accents: string[]; keepAsWritten?: boolean }[],
    layouts: (l?.layouts ?? []) as string[], marks: (l?.ownMarks ?? []) as (string | null)[], calls: (d?.designed?.calls ?? 0) as number, script: d?.script,
    built: Object.fromEntries(Object.entries(d?.designed?.slides ?? {}).map(([k, v]: [string, any]) => [k, { svg: String(v?.built?.svg ?? ''), layers: (v?.built?.layers ?? []) as any[] }])) as Record<string, { svg: string; layers: any[] }>,
  };
}, KEY);
const marked = (layers: any[]) => layers.some((l) => l.kind === 'text' && (l.highlight || (l.runs && l.runs.length)));

async function pasteScript(page: Page, text: string, style = 'Hot flat') {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: new RegExp(style) }).first().click();
  await toStep(page, 1);
  await page.getByRole('button', { name: 'I already have a script' }).click();
  await page.getByLabel('Paste the script Claude wrote (JSON)').fill(text);
  await page.getByRole('button', { name: 'Use this script' }).click();
  await deckDrawn(page, JSON.parse(text).slides.length);
}
async function writtenDeck(page: Page) {
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, SPECS.length);
}
const pickStyle = async (page: Page, title: RegExp) => {
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: title }).first().click();
};

test('A1: in a pasted deck the highlight "success" is drawn on the step-numeral slide; the Text tab says nothing is unmarked', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await counting(page);
  await pasteScript(page, SAMPLE);
  const p = await proj(page);
  expect(p.specs[1].layout).toBe('step-numeral');
  expect(p.specs[1].accents.join(' ').toLowerCase()).toContain('success');
  expect(marked(p.built['1'].layers), 'a marker (or coloured run) is drawn on the step slide').toBe(true);
  await openTab(page, 'Text', 2);
  await expect(page.getByLabel('Highlighted words (optional)')).toHaveValue(/success/i);
  await expect(page.getByTestId('no-mark')).toHaveCount(0);
});

test('A2/A3: the line above the preview is truthful about warnings, and the edit hint has no left/above directions for the strip', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await counting(page);
  await pasteScript(page, SAMPLE);
  const line = page.locator('p[role="status"]').filter({ hasText: /slides? pass|something to fix/ }).first();
  await expect(line).toBeVisible();
  const txt = await line.innerText();
  expect(txt).not.toContain('Every slide passes');
  // the sample deck has a slide with a warning (36 words on a step slide): "N slides pass, M have a warning."
  expect(txt).toMatch(/\d+ slides? pass, \d+ (has|have) a warning\.|All slides pass the phone-size check\./);
  if (/warning/.test(txt)) expect(txt).toMatch(/^\s*[\s\S]*\d+ slides? pass, \d+ (has|have) a warning\./);
  await page.getByTestId('edit-slides').click();
  await expect(page.getByTestId('edit-view')).toContainText('Pick a slide in the strip to edit it. Undo and Redo are above the preview.');
  expect(await page.getByTestId('edit-view').innerText()).not.toContain('on the left');
});

test('A4: on a phone (480 px or less) a small live preview stays at the top while editing text, follows the redraw, and never covers the fields', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await counting(page);
  await pasteScript(page, SAMPLE);
  await page.getByTestId('edit-slides').click();
  await openTab(page, 'Text', 2);
  const mini = page.getByTestId('edit-mini');
  await expect(mini).toBeVisible();
  const w = await mini.evaluate((e) => e.getBoundingClientRect().width);
  expect(w / 390, 'about 40% of the screen width').toBeGreaterThan(0.3);
  expect(w / 390).toBeLessThan(0.5);
  // it stays on screen while the fields scroll under the bar, and no field is covered by it
  await page.evaluate(() => window.scrollTo(0, document.querySelector('[data-testid="text-tab-1"]')!.getBoundingClientRect().top + scrollY - 300));
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const m = document.querySelector('[data-testid="edit-mini"]')!.getBoundingClientRect();
    const bar = document.querySelector('.cr-edit-bar')!.getBoundingClientRect();
    const f = document.querySelector('[data-testid="text-tab-1"] input, [data-testid="text-tab-1"] textarea') as HTMLElement;
    const fr = f.getBoundingClientRect();
    return { miniTop: m.top, miniBottom: m.bottom, barBottom: bar.bottom, fieldTop: fr.top, vh: innerHeight };
  });
  expect(r.miniTop, 'the preview is still on screen').toBeGreaterThanOrEqual(0);
  expect(r.miniBottom).toBeLessThan(r.vh * 0.5);
  // the first field is either fully below the bar or scrolled out under it: never drawn over the preview
  const field = page.getByTestId('text-tab-1').getByLabel(/^Headline/).first();
  await field.scrollIntoViewIfNeeded();
  const after = await page.evaluate(() => {
    const bar = document.querySelector('.cr-edit-bar')!.getBoundingClientRect();
    const f = (document.querySelector('[data-testid="text-tab-1"] input') as HTMLElement).getBoundingClientRect();
    return { barBottom: bar.bottom, fieldTop: f.top };
  });
  expect(after.fieldTop, 'a field scrolled into view sits below the preview bar').toBeGreaterThanOrEqual(after.barBottom - 2);
  // it follows the redraw
  const src0 = await mini.getAttribute('src');
  await field.fill('Another headline');
  await expect.poll(() => mini.getAttribute('src'), { timeout: 30_000 }).not.toBe(src0);
  // on a desktop it is not there
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByTestId('edit-mini')).toBeHidden();
});

test('A5/A6: Fine-tune has no big gap; the picture slot has an "Upload a new picture" button (no plain file input) and shows the file name', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await counting(page);
  await pasteScript(page, SAMPLE);
  await openTab(page, 'Fine-tune', 1);
  const gap = await page.evaluate(() => {
    const h = document.querySelector('[data-testid="fine-scope"]')!.getBoundingClientRect();
    const c = document.querySelector('[data-testid="detected-style"]')!.getBoundingClientRect();
    return c.top - h.bottom;
  });
  expect(gap, 'the gap under "Applies to all slides"').toBeLessThan(24);
  // the upload button, on a written deck with pictures
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await counting(p, JSON.stringify({ title: 'Quick Flip', slides: [
    { layout: 'photo-cover', fields: { headline: 'A hoodie that flips into a backpack', intro: 'We sewed a bag into the hood.' }, accents: [] },
    { layout: 'do-dont', fields: { title: 'Pack it', num: '1', wrong: 'A bag and a hoodie, both heavy.', right: 'One hoodie that becomes the bag.' }, accents: [] },
    { layout: 'portrait-closing', fields: { headline: 'Meet the maker', heading: 'Back Quick Flip today', p1: 'We are two friends who got tired of carrying a bag.', url: 'quickflip.com' }, accents: [] },
  ] }));
  await p.goto('/images/carousel');
  const b64 = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1500; c.height = 1000; const g = c.getContext('2d')!; g.fillStyle = '#c0392b'; g.fillRect(0, 0, 1500, 1000); if (c.width * c.height <= 4000000) { let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); const gr = g.createLinearGradient(0, 0, c.width, c.height); gr.addColorStop(0, '#c0392b'); gr.addColorStop(1, '#ffe9c4'); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height); for (let i = 0; i < 6000; i++) { g.fillStyle = 'hsla(' + Math.floor(rnd() * 360) + ', 60%, ' + (20 + rnd() * 60) + '%, 0.55)'; const s = (0.004 + rnd() * 0.03) * Math.min(c.width, c.height); g.fillRect(rnd() * c.width, rnd() * c.height, s, s); } }
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85)); const buf = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of buf) t += String.fromCharCode(x); return btoa(t);
  });
  const jpg = { name: 'land.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
  await p.getByLabel('Choose images for the slides').setInputFiles([jpg]);
  await expect(p.getByTestId(/^image-\d+$/)).toHaveCount(1, { timeout: 30_000 });
  await p.getByLabel('Your text or topic').fill('A hoodie that flips into a backpack. We sewed a bag into the hood. Back Quick Flip today.');
  await toStep(p, 3);
  await p.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await p.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(p, 3);
  await openTab(p, 'Pictures', 1);
  await p.getByTestId('slot-tab-0-1').click();
  const up = p.getByRole('button', { name: 'Upload a new picture' });
  await expect(up).toBeVisible();
  // the file input is there for the picker only: it takes no room on the screen
  const box = await p.getByTestId('slot-file-0').boundingBox();
  expect(!box || (box.width <= 2 && box.height <= 2), 'no visible browser file box').toBe(true);
  await p.getByTestId('slot-file-0').setInputFiles({ ...jpg, name: 'my-new-picture.jpg' });
  await expect(p.getByTestId('slot-file-name-0')).toHaveText('my-new-picture.jpg');
  await ctx.close();
});

test('B: switching the style of a written deck redraws it from the stored plan: text kept, a Text-tab edit survives, one Undo, 0 model calls, the phone-size line still runs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const f = await counting(page, WRITER);
  await writtenDeck(page);
  expect(f.calls).toBe(1);
  // a Text-tab edit first: it must survive the switch
  await openTab(page, 'Text', 2);
  const field = page.getByTestId('text-tab-1').locator('input, textarea').first();
  await field.fill('My own words survive');
  await expect.poll(async () => JSON.stringify((await proj(page)).specs[1].fields), { timeout: 30_000 }).toContain('My own words survive');
  const before = await proj(page);
  await pickStyle(page, /Quiet dark minimal/);
  await expect(page.getByRole('status').filter({ hasText: 'Style changed. Slides redrawn, no model call.' }).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await proj(page)).style, { timeout: 30_000 }).toBe('dark-quiet');
  const after = await proj(page);
  expect(after.source).toBe('dark-quiet');
  expect(f.calls, 'no model call for a style switch').toBe(1);
  expect(after.calls).toBe(before.calls);
  // the words are identical on every slide whose layout stayed; an edited slide keeps its edit
  let same = 0;
  before.specs.forEach((s, i) => { if (after.specs[i].layout === s.layout) { expect(after.specs[i].fields, `slide ${i + 1} text`).toEqual(s.fields); same++; } });
  expect(same).toBeGreaterThan(0);
  expect(JSON.stringify(after.specs[1].fields)).toContain('My own words survive');
  expect(JSON.stringify(after.script.slides.map((s: any) => [s.headline ?? s.quote ?? s.value ?? ''])).length).toBeGreaterThan(10);
  expect(Object.values(after.built).map((b) => b.svg)).not.toEqual(Object.values(before.built).map((b) => b.svg));
  await deckDrawn(page, SPECS.length);
  await expect(page.locator('p[role="status"]').filter({ hasText: /phone-size check|have a warning|something to fix/ }).first()).toBeVisible({ timeout: 60_000 });
  // one Undo brings the old style back
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await proj(page)).style, { timeout: 30_000 }).toBe('hot-flat');
  const undone = await proj(page);
  expect(undone.source).toBe('hot-flat');
  expect(Object.values(undone.built).map((b) => b.svg)).toEqual(Object.values(before.built).map((b) => b.svg));
  expect(f.calls).toBe(1);
});

test('B2: a deck made from a pasted script switches style the same way', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const f = await counting(page);
  await pasteScript(page, SAMPLE);
  const before = await proj(page);
  await pickStyle(page, /Quiet dark minimal/);
  await expect(page.getByRole('status').filter({ hasText: 'Style changed. Slides redrawn, no model call.' }).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await proj(page)).style, { timeout: 30_000 }).toBe('dark-quiet');
  const after = await proj(page);
  expect(after.hasLibrary).toBe(true);
  expect(f.calls).toBe(0);
  expect(after.calls).toBe(0);
  let same = 0;
  before.specs.forEach((s, i) => { if (after.specs[i].layout === s.layout) { expect(after.specs[i].fields, `slide ${i + 1} text`).toEqual(s.fields); same++; } });
  expect(same).toBeGreaterThan(0);
  // every word of the pasted script is still on the slides
  const flat = JSON.stringify(after.specs.map((s) => s.fields)).toLowerCase();
  for (const s of JSON.parse(SAMPLE).slides) { const h = String(s.headline ?? s.quote ?? s.value ?? '').toLowerCase(); if (h) expect(flat).toContain(h.slice(0, 18)); }
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await proj(page)).style, { timeout: 30_000 }).toBe('hot-flat');
  expect(Object.values((await proj(page)).built).map((b) => b.svg)).toEqual(Object.values(before.built).map((b) => b.svg));
});

test('C: a pasted script with one long slide: only that slide falls back (a simple layout), the other six stay as before, 0 model calls; a text too long for any layout keeps its words with a warning', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const f = await counting(page);
  // control: the same script without a long slide
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: { cookies: [], origins: [] } });
  const c = await ctx.newPage();
  await counting(c);
  await pasteScript(c, SAMPLE);
  const control = await proj(c);
  await ctx.close();
  // one long slide (a step with a long body that the step layout cannot hold, but the prose layout can)
  const long = JSON.parse(SAMPLE);
  const k = 2;
  long.slides[k].body = 'The brief is the one page the whole project leans on, so write it for a stranger. State the goal, the owner and the date in the first lines. Say who will use the result and what they do next. Name the one thing that must not change. Then list what is out of scope, so nobody has to guess. Finish with how you will know it worked. ' + 'Read it out loud once.';
  await pasteScript(page, JSON.stringify(long));
  const p = await proj(page);
  expect(p.hasLibrary, 'the deck stays on the library route').toBe(true);
  expect(p.route?.route).toBe('designed');
  expect(p.layouts[k], 'the long slide uses the simple layout').toBe('prose');
  expect(p.marks[k]).toBe('simple');
  for (let i = 0; i < N; i++) if (i !== k) expect(p.layouts[i], `slide ${i + 1} is drawn as before`).toBe(control.layouts[i]);
  expect(Object.keys(p.built).length, 'all seven are library drawings').toBe(N);
  expect(f.calls).toBe(0);
  expect(p.calls).toBe(0);
  expect(JSON.stringify(p.specs[k].fields), 'no word is dropped').toContain('Read it out loud once.');
  await openTab(page, 'Text', k + 1);
  await expect(page.getByTestId('own-note')).toContainText('This slide uses a simple layout because the text is long.');
  // an enormous text: kept word for word, a warning on the slide, the deck is not failed
  const huge = JSON.parse(SAMPLE);
  huge.slides[k].body = Array.from({ length: 40 }, (_, i) => `Sentence number ${i + 1} says one more thing about the brief.`).join(' ');
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: { cookies: [], origins: [] } });
  const h = await ctx2.newPage();
  const f2 = await counting(h);
  await pasteScript(h, JSON.stringify(huge));
  const q = await proj(h);
  expect(q.hasLibrary).toBe(true);
  expect(q.marks[k]).toBe('kept');
  expect(Object.keys(q.built).length, 'the six others are library drawings').toBe(N - 1);
  expect(q.script.slides[k].body, 'the words are exactly as pasted').toBe(huge.slides[k].body);
  await openTab(h, 'Text', k + 1);
  await expect(h.getByTestId('own-note')).toContainText('Your words are all kept');
  expect(f2.calls).toBe(0);
  await ctx2.close();
});

test('screenshots: the highlight, the header line, the phone sticky preview, the upload button, a style switch before/after, a deck with a fallback slide', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const fresh = async (vp: { width: number; height: number }, writer?: string) => {
    const ctx = await browser.newContext({ viewport: vp, storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    await counting(p, writer);
    return { ctx, p };
  };
  // desktop: step-numeral slide with the highlight drawn + the header line + a style switch before/after
  {
    const { ctx, p } = await fresh({ width: 1280, height: 900 });
    await pasteScript(p, SAMPLE);
    await p.getByRole('button', { name: 'Show slide 2', exact: true }).click();
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/desktop-1-step-numeral-highlight.png` });
    await p.getByRole('button', { name: 'Show slide 4', exact: true }).click();
    await p.waitForTimeout(400);
    await p.locator('.cr-preview').screenshot({ path: `${OUT}/desktop-2-header-line-with-warning.png` });
    await p.getByRole('button', { name: 'Show slide 1', exact: true }).click();
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/desktop-5-style-switch-before-hot-flat.png` });
    await pickStyle(p, /Quiet dark minimal/);
    await expect(p.getByRole('status').filter({ hasText: 'Style changed. Slides redrawn, no model call.' }).first()).toBeVisible({ timeout: 60_000 });
    await toStep(p, 4);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/desktop-5-style-switch-after-quiet-dark.png` });
    await ctx.close();
  }
  // phone: Edit slide, Text tab, sticky preview
  {
    const { ctx, p } = await fresh({ width: 390, height: 844 });
    await pasteScript(p, SAMPLE);
    await p.getByTestId('edit-slides').click();
    await openTab(p, 'Text', 2);
    await p.evaluate(() => window.scrollTo(0, document.querySelector('[data-testid="text-tab-1"]')!.getBoundingClientRect().top + scrollY - 280));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/phone-3-edit-text-sticky-preview.png` });
    await ctx.close();
  }
  // desktop: Pictures tab with the new upload button
  {
    const { ctx, p } = await fresh({ width: 1280, height: 900 }, JSON.stringify({ title: 'Quick Flip', slides: [
      { layout: 'photo-cover', fields: { headline: 'A hoodie that flips into a backpack', intro: 'We sewed a bag into the hood.' }, accents: [] },
      { layout: 'do-dont', fields: { title: 'Pack it', num: '1', wrong: 'A bag and a hoodie, both heavy.', right: 'One hoodie that becomes the bag.' }, accents: [] },
      { layout: 'portrait-closing', fields: { headline: 'Meet the maker', heading: 'Back Quick Flip today', p1: 'We are two friends who got tired of carrying a bag.', url: 'quickflip.com' }, accents: [] },
    ] }));
    await p.goto('/images/carousel');
    const b64 = await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 1500; c.height = 1000; const g = c.getContext('2d')!; g.fillStyle = '#c0392b'; g.fillRect(0, 0, 1500, 1000); if (c.width * c.height <= 4000000) { let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); const gr = g.createLinearGradient(0, 0, c.width, c.height); gr.addColorStop(0, '#c0392b'); gr.addColorStop(1, '#ffe9c4'); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height); for (let i = 0; i < 6000; i++) { g.fillStyle = 'hsla(' + Math.floor(rnd() * 360) + ', 60%, ' + (20 + rnd() * 60) + '%, 0.55)'; const s = (0.004 + rnd() * 0.03) * Math.min(c.width, c.height); g.fillRect(rnd() * c.width, rnd() * c.height, s, s); } } g.fillStyle = '#fff'; g.fillRect(650, 400, 200, 200);
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85)); const buf = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of buf) t += String.fromCharCode(x); return btoa(t);
    });
    await p.getByLabel('Choose images for the slides').setInputFiles([{ name: 'land.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') }]);
    await expect(p.getByTestId(/^image-\d+$/)).toHaveCount(1, { timeout: 30_000 });
    await p.getByLabel('Your text or topic').fill('A hoodie that flips into a backpack. We sewed a bag into the hood. Back Quick Flip today.');
    await toStep(p, 3);
    await p.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
    await p.getByRole('button', { name: 'Make carousel', exact: true }).click();
    await deckDrawn(p, 3);
    await openTab(p, 'Pictures', 1);
    await p.getByTestId('slot-tab-0-1').click();
    await p.getByTestId('edit-view').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/desktop-4-pictures-upload-button.png` });
    await ctx.close();
  }
  // desktop: a pasted deck with one fallback slide
  {
    const { ctx, p } = await fresh({ width: 1280, height: 900 });
    const long = JSON.parse(SAMPLE);
    long.slides[2].body = 'The brief is the one page the whole project leans on, so write it for a stranger. State the goal, the owner and the date in the first lines. Say who will use the result and what they do next. Name the one thing that must not change. Then list what is out of scope, so nobody has to guess. Finish with how you will know it worked. Read it out loud once.';
    await pasteScript(p, JSON.stringify(long));
    await p.getByTestId('edit-slides').click();
    await p.getByRole('button', { name: 'Show slide 3', exact: true }).click();
    await openTab(p, 'Text', 3);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/desktop-6-pasted-deck-fallback-slide.png` });
    await ctx.close();
  }
});
