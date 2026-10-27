// The Results screen (/lab), driven like a person would: through the left menu, in real Chrome.
// It is organised by what a person needs to judge (Overview, Styles, Slides, Photo tools, Thumbnails, Cutouts, Elements,
// Coverage, Checks and tests), and verdicts saved before the reorganisation are still there.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { goView, openResults, scriptList, styleList } from './lab-nav';
import { RESULTS_DIR, writeStepResults } from './results';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/results-screen');
const IMAGES = fs.readdirSync(path.join(ROOT, 'test-images')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const PRIVATE = path.join(ROOT, 'test-assets');
const PRIVATE_COUNT = fs.existsSync(PRIVATE) ? fs.readdirSync(PRIVATE).filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f)).length : 0;

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1500, height: 1000 } });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const verdictsText = (page: Page) => page.getByRole('status').filter({ hasText: /verdicts/ });
const SECTIONS = ['Overview', 'Styles', 'Slides', 'Photo tools', 'Thumbnails', 'Cutouts', 'Elements', 'Coverage', 'Checks and tests'];

test('Results is in the left menu, looks like the app, and is organised by what to judge, with no step numbers in the titles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openResults(page);
  await expect(page.locator('aside#sidebar')).toBeVisible();
  await expect(page.locator('.page-header .page-title')).toHaveText('Results');
  // The list of sections, in the order a person needs them.
  const links = page.getByRole('navigation', { name: 'Sections of this page' }).getByRole('link');
  await expect(links).toHaveCount(SECTIONS.length);
  const names = (await links.allTextContents()).map((t) => t.replace(/\d+$/, '').trim());
  expect(names).toEqual(SECTIONS);
  // Every section starts with the two-line guide, and none has a "Step N" title.
  for (const v of SECTIONS) {
    await goView(page, v as never);
    const pane = page.locator('.res-pane:not([hidden])');
    await expect(pane.locator('.res-guide')).toContainText("What you're looking at.");
    await expect(pane.locator('.res-guide')).toContainText('What to do here.');
    // A real time, for every section (the Overview shows the newest of them all).
    await expect(pane.locator('.res-view-meta')).toContainText(/Latest run [A-Z][a-z]{2} \d{1,2}, \d{4}/);
  }
  const headings = await page.locator('h2, h3').allTextContents();
  expect(headings.filter((h) => /^Step \d+/.test(h))).toEqual([]);
  expect(errors).toEqual([]);
  await goView(page, 'Overview');
  await page.screenshot({ path: path.join(OUT, '01-overview.png') });
});

test('Overview: a card per area with a status chip, one sentence and what is waiting; a progress bar over everything', async ({ page }) => {
  await openResults(page);
  const cards = page.locator('.res-area');
  await expect(cards).toHaveCount(6);
  const titles = await cards.locator('h3').allTextContents();
  expect(titles).toEqual(['Carousel styles', 'Photo tools', 'Thumbnails', 'Cutouts', 'Element library', 'Checks and tests']);
  for (const c of await cards.all()) {
    await expect(c.locator('.chip').first()).toHaveText(/^(Working|Partly working|Blocked)$/);
    await expect(c).toContainText(/waiting for your verdict/);
    await expect(c.getByRole('button', { name: /^Open / })).toBeVisible();
  }
  await expect(cards.filter({ hasText: 'Cutouts' }).locator('.chip').first()).toHaveText('Blocked');
  const bar = page.getByRole('progressbar', { name: 'Items rated' });
  await expect(bar).toHaveAttribute('aria-valuenow', '0');
  expect(Number(await bar.getAttribute('aria-valuemax'))).toBeGreaterThan(300);
  // An area's button opens that area.
  await cards.filter({ hasText: 'Photo tools' }).getByRole('button', { name: 'Open Photo tools' }).click();
  await expect(page.locator('.res-pane:not([hidden]) h2')).toHaveText('Photo tools');
});

test('Styles: one card per stored style with its reference deck beside a sample of ours; a verdict on the whole style', async ({ page }) => {
  await openResults(page, 'Styles');
  const styles = fs.readdirSync(path.join(ROOT, 'src/image-engine/styles'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  expect(styles).toHaveLength(7);
  const cards = page.locator('.res-style-card');
  await expect(cards).toHaveCount(7);
  const first = cards.first();
  await expect(first.locator('h3')).not.toBeEmpty();
  await expect(first.locator('p').first()).not.toBeEmpty(); // the one-line description
  await expect(first.getByText('Reference deck (comparison only)')).toBeVisible();
  await expect(first.locator('.res-style-sample .res-pic')).toHaveCount(3);
  for (const v of ['matches', 'close', 'off', 'wrong']) await expect(first.getByRole('button', { name: v, exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'close', exact: true }).click();
  await first.getByPlaceholder('why? (one line)').fill('close enough to start');
  await page.screenshot({ path: path.join(OUT, '02-styles.png') });
  // Open slides goes to that style's slides.
  await first.getByRole('button', { name: /^Open the slides of / }).click();
  await expect(page.locator('.res-pane:not([hidden]) h2')).toHaveText('Slides');
  await expect(styleList(page)).toHaveValue(styles[0]);
});

test('Needs my verdict: the filter shows only what is not rated yet, and the counts follow', async ({ page }) => {
  await openResults(page, 'Styles');
  const nav = page.getByRole('navigation', { name: 'Sections of this page' }).getByRole('link', { name: /^Styles/ });
  await expect(nav).toContainText('7');
  const cards = page.locator('.res-style-card');
  await cards.first().getByRole('button', { name: 'off', exact: true }).click();
  await expect(nav).toContainText('6');
  await expect(cards).toHaveCount(7);
  await page.getByLabel('Needs my verdict').check();
  await expect(page.locator('.res-style-card:not(.res-hide)')).toHaveCount(6);
  await page.getByLabel('Needs my verdict').uncheck();
  await expect(page.locator('.res-style-card:not(.res-hide)')).toHaveCount(7);
});

test('Slides: pick a style and a script, every slide is its own card with its check in plain words and a verdict, full size on click', async ({ page }) => {
  await openResults(page, 'Slides');
  const style = styleList(page);
  const script = scriptList(page);
  await expect(style.locator('option')).toHaveCount(7);
  await style.selectOption('hot-flat');
  await script.selectOption('howto-linkedin');
  const cards = page.locator('.res-pane:not([hidden]) .res-rec-card');
  await expect(cards).toHaveCount(7);
  await expect(page.getByText('Rate these 7 slides: matches, close, off or wrong.')).toBeVisible();
  const first = cards.first();
  await expect(first).toContainText(/Passes all 8 phone-size checks|Does not pass at phone size/);
  for (const v of ['matches', 'close', 'off', 'wrong']) await expect(first.getByRole('button', { name: v, exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'matches', exact: true }).click();
  await expect(page.getByText(/6 still waiting for your verdict/)).toBeVisible();
  await first.locator('.res-pic').click();
  const dlg = page.locator('dialog.res-viewer[open]');
  await expect(dlg).toBeVisible();
  expect(await dlg.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1080);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(OUT, '03-slides.png') });
});

test('Slides: a photo deck is labelled TEST ASSETS, and the deck with no photos is labelled as placeholders', async ({ page }) => {
  test.skip(!fs.existsSync(path.join(RESULTS_DIR, 'step11.json')), 'Run the photo tests first.');
  await openResults(page, 'Slides');
  await styleList(page).selectOption('mono-poster');
  await scriptList(page).selectOption('photo:photo-creator-habits');
  const cards = page.locator('.res-pane:not([hidden]) .res-rec-card');
  await expect(cards).toHaveCount(7);
  await expect(cards.first().locator('.chip-warn')).toContainText('TEST ASSETS');
  await scriptList(page).selectOption('photo:no-photos');
  await expect(cards.first().locator('.chip-warn')).toContainText('NO PHOTOS');
});

test('Photo tools: the gallery is grouped, each picture has a caption, a label chip and a verdict', async ({ page }) => {
  test.skip(!fs.existsSync(path.join(RESULTS_DIR, 'step11.json')), 'Run the photo tests first.');
  await openResults(page, 'Photo tools');
  const pane = page.locator('.res-pane:not([hidden])');
  const groups = await pane.locator('h3').allTextContents();
  // "Photos in the app" comes first once its test has written its results.
  const withApp = fs.existsSync(path.join(RESULTS_DIR, 'photos-app.json')) ? ['Photos in the app'] : [];
  expect(groups).toEqual([...withApp, 'Treatments', 'Shapes and frames', 'Backgrounds', 'Objects', 'Findings and weak points']);
  const cards = pane.locator('.res-gal-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(37);
  await expect(cards.first().locator('figcaption')).not.toBeEmpty();
  // The first gallery picture (under Treatments) is one of your test photos.
  await expect(pane.locator('.res-source', { has: page.getByRole('heading', { name: 'Treatments', exact: true }) }).locator('.res-gal-card').first().locator('.chip-warn')).toContainText('TEST ASSETS');
  await expect(pane.locator('.res-gal-card', { hasText: 'Soft contact shadow' }).locator('.chip-warn')).toContainText('SYNTHETIC');
  await page.screenshot({ path: path.join(OUT, '04-photo-tools.png') });
});

test('Coverage: every reference deck with its stored style and what is missing, and every test photo with the slides that used it', async ({ page }) => {
  await openResults(page, 'Coverage');
  const tables = page.locator('.res-pane:not([hidden]) table');
  const decks = tables.nth(0).locator('tbody tr');
  await expect(decks).toHaveCount(16);
  await expect(tables.nth(0).locator('th')).toHaveText(['Reference deck', 'Stored style', 'Photo style', 'Status', 'What is missing']);
  const text = await tables.nth(0).innerText();
  for (const need of ['Needs 3D object PNGs', 'Needs cutouts', 'Needs a font we do not have']) expect(text).toContain(need);
  for (const row of await decks.all()) await expect(row.locator('.chip').first()).toHaveText(/^(Covered|Partly covered|Not covered)$/);
  if (PRIVATE_COUNT > 0) {
    const photos = tables.nth(1).locator('tbody tr');
    await expect(photos).toHaveCount(PRIVATE_COUNT);
    // Each row says which slides used it, or "unused" (the list fills in after the plans are read).
    await expect(photos.first().locator('td').nth(1)).not.toContainText('Checking', { timeout: 20_000 });
    const rows = await photos.allInnerTexts();
    expect(rows.every((r) => /unused|slide \d+|Treatment gallery/.test(r))).toBe(true);
  }
  await page.screenshot({ path: path.join(OUT, '05-coverage.png') });
});

test('Cutouts: says in plain words what is blocked and what to do; the technical results are in a fold', async ({ page }) => {
  await openResults(page, 'Cutouts');
  const pane = page.locator('.res-pane:not([hidden])');
  await expect(pane.locator('.res-blocked')).toContainText('What is blocked, and why');
  await expect(pane.locator('.res-blocked')).toContainText('What you can do');
  await expect(pane.locator('#step4')).toBeHidden();
  await goView(page, 'Cutouts', { details: true });
  await expect(pane.locator('#step4')).toBeVisible();
});

test('Thumbnails: each picture shows the original and every option at phone size, full size on click, with reasons', async ({ page }) => {
  await openResults(page, 'Thumbnails');
  const s = page.locator('#step2');
  await expect(s.locator('.res-source[aria-label^="Source picture"]')).toHaveCount(8);
  const first = s.locator('.res-aspect').first();
  await expect(first.getByRole('img', { name: /^Original / })).toBeVisible();
  await expect(first.locator('.res-opt')).toHaveCount(3);
  const img = first.locator('.res-opt img').first();
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(320);
  expect(await first.locator('.res-opt .chip').count()).toBeGreaterThanOrEqual(3);
  const failing = s.locator('.res-opt', { has: page.locator('.chip-error') }).first();
  await expect(failing.locator('.lab-fails li').first()).not.toBeEmpty();
  await first.locator('.res-opt .res-pic').first().click();
  const dlg = page.locator('dialog.res-viewer[open]');
  await expect(dlg).toBeVisible();
  expect(await dlg.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(320);
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await s.locator('.res-source').first().screenshot({ path: path.join(OUT, '06-thumbnails.png') });
});

test('Checks and tests: closed by default; inside, the plan and patch proof and the older work', async ({ page }) => {
  await openResults(page, 'Checks and tests');
  const pane = page.locator('.res-pane:not([hidden])');
  await expect(pane.locator('details.res-older > summary')).toHaveText('Older work and technical details');
  await expect(pane.locator('#step1')).toBeHidden();
  await goView(page, 'Checks and tests', { details: true });
  const s = pane.locator('#step1');
  await expect(s.getByRole('heading', { name: 'Carousel slide proof' })).toBeVisible();
  const patch = s.locator('.res-item', { hasText: 'Patch test' });
  for (const label of ['before', 'after', 'undone', 'redone']) await expect(patch.getByText(label, { exact: true })).toBeVisible();
  await expect(patch).toContainText('Undo gives back the same pixels: yes');
  // The older results keep their content but not their step numbers in the title.
  const titles = await pane.locator('section.res-section h2').allTextContents();
  expect(titles.some((t) => /Polish/.test(t))).toBe(true);
  expect(titles.filter((t) => /^Step \d/.test(t))).toEqual([]);
});

test('verdicts: autosave, survive a reload, export, and the checker disagreement flag', async ({ page }) => {
  await openResults(page, 'Thumbnails');
  const opt = page.locator('#step2 .res-opt').first();
  const failed = (await opt.locator('.chip-error').count()) > 0;
  await opt.getByRole('button', { name: failed ? 'good' : 'bad' }).click(); // against the checker on purpose
  await opt.getByPlaceholder('why? (one line)').fill('I disagree on purpose');
  await expect(opt.locator('.lab-disagree')).toBeVisible();
  await goView(page, 'Checks and tests', { details: true });
  const slide = page.locator('#step3 .lab-slide').first();
  await slide.getByRole('button', { name: 'meh' }).click();
  await slide.getByPlaceholder('why? (one line)').fill('a bit plain');
  const proof = page.locator('#step1 .res-item').first();
  await proof.getByRole('button', { name: 'good' }).click();
  await goView(page, 'Cutouts', { details: true });
  const cut = page.locator('#step4 .lab-cut-row').first();
  await cut.getByRole('button', { name: 'bad' }).click();
  await cut.getByPlaceholder('why? (one line)').fill('toy, not a cutout');
  await expect(verdictsText(page)).toContainText('4 verdicts');
  await page.reload();
  await expect(verdictsText(page)).toContainText('4 verdicts');
  await goView(page, 'Thumbnails');
  await expect(page.locator('#step2 .res-opt').first().getByPlaceholder('why? (one line)')).toHaveValue('I disagree on purpose');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export verdicts JSON' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^lab-verdicts-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = path.join(OUT, 'export-example.json');
  await file.saveAs(saved);
  const data = JSON.parse(fs.readFileSync(saved, 'utf8'));
  expect(data.verdicts).toHaveLength(4);
  expect(data.verdicts.map((v: { step: string }) => v.step).sort()).toEqual(['step1', 'step2', 'step3', 'step4']);
  const th = data.verdicts.find((v: { kind: string }) => v.kind === 'thumbnail');
  expect(th).toMatchObject({ reason: 'I disagree on purpose', option: expect.stringMatching(/\d+:\d+ \w+/), checker: { pass: !failed, failed: expect.any(Array) } });
  const cutv = data.verdicts.find((v: { kind: string }) => v.kind === 'cutout');
  expect(cutv.timings).toBeTruthy();
  expect(data.cutouts.models.map((m: { id: string }) => m.id)).toContain('isnet-general-use');
});

test('verdicts saved before the screen was reorganised are still there, in the new places', async ({ page }) => {
  test.skip(!fs.existsSync(path.join(RESULTS_DIR, 'step11.json')), 'Run the photo tests first.');
  const rec = (key: string, verdict: string, reason: string) => ({ key, step: key.split('|')[0], kind: 'old', image: 'x', option: 'y', verdict, reason, updatedAt: '2026-10-20T10:00:00.000Z' });
  const old = {
    records: Object.fromEntries([
      rec('style-recreation|hot-flat|howto-linkedin|1', 'close', 'saved on the old Step 5 screen'),
      rec('step11|Gallery: treatments|treatment-grayscale', 'good', 'saved on the old Step 11 screen'),
      rec('step11|Style: Mono photo poster (mono-poster)|mono-poster-photo-creator-habits', 'off', 'whole deck, old screen'),
    ].map((r) => [r.key, r])),
    picks: {},
  };
  await page.addInitScript((s) => localStorage.setItem('ie-lab-v1', JSON.stringify(s)), old);
  await openResults(page);
  await expect(verdictsText(page)).toContainText('3 verdicts');
  // Slides: the old slide verdict is on slide 1 of that style and script.
  await goView(page, 'Slides');
  await styleList(page).selectOption('hot-flat');
  await scriptList(page).selectOption('howto-linkedin');
  const card = page.locator('.res-pane:not([hidden]) .res-rec-card').first();
  await expect(card.getByRole('button', { name: 'close', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByPlaceholder('why? (one line)')).toHaveValue('saved on the old Step 5 screen');
  // The deck verdict from the old photo section.
  await styleList(page).selectOption('mono-poster');
  await scriptList(page).selectOption('photo:photo-creator-habits');
  await expect(page.getByRole('group', { name: /the whole deck/ }).getByRole('button', { name: 'off', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Photo tools: the gallery verdict.
  await goView(page, 'Photo tools');
  const g = page.locator('.res-gal-card', { hasText: 'Grayscale' }).first();
  await expect(g.getByRole('button', { name: 'good', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(g.getByPlaceholder('why? (one line)')).toHaveValue('saved on the old Step 11 screen');
  // Nothing was lost: they are all still in the export.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export verdicts JSON' }).click();
  const file = path.join(OUT, 'export-migrated.json');
  await (await download).saveAs(file);
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).verdicts).toHaveLength(3);
});

test('refresh: each section re-reads its results and keeps a last-run time', async ({ page }) => {
  await openResults(page, 'Checks and tests', { details: true });
  const s = page.locator('#step3');
  await expect(s.locator('.res-last .muted')).toHaveText(/Last run/);
  await s.getByRole('button', { name: /^Refresh/ }).click();
  await expect(s.locator('.lab-slide').first()).toBeVisible();
  await expect(s.locator('.res-last .muted')).toHaveText(/Last run/);
});

test('upload: your own picture can be cut out and made into thumbnails in the browser', async ({ page }) => {
  test.setTimeout(120_000);
  await openResults(page, 'Thumbnails');
  await page.getByLabel('Add pictures to try').setInputFiles(path.join(ROOT, 'test-images', IMAGES[0]));
  await expect(page.getByText('Your pictures (kept only while this tab is open)')).toContainText(IMAGES[0]);
  const s = page.locator('#step2 .res-try');
  await s.getByRole('button', { name: 'Make thumbnails' }).click();
  await expect(s.locator('.res-opt')).toHaveCount(3, { timeout: 60_000 });
  await expect(s.locator('.res-opt .chip').first()).toBeVisible();
  await goView(page, 'Cutouts', { details: true });
  await expect(page.locator('#step4 section[aria-label^="Cutouts for"]', { hasText: 'added by you' })).toHaveCount(1);
});

test('a later step shows up on the screen by itself when it writes its results file (under Checks and tests)', async ({ page }) => {
  writeStepResults({
    id: 'step99-selfcheck',
    title: 'Step 99: Self check',
    order: 99,
    intro: 'Written by a test to prove that new steps appear without page changes.',
    groups: [{ title: 'Sample group', items: [{ id: 'a', title: 'Sample item', tag: 'TOY: plumbing test only', images: [{ url: '/out/image-engine/step1-quote-card.png', label: 'sample' }], checker: { pass: false, reasons: ['Sample reason.'] }, facts: ['model: none', 'total 1 ms'] }] }],
  });
  try {
    await openResults(page, 'Checks and tests', { details: true });
    await expect(page.locator('#step99-selfcheck h2')).toHaveText('Self check'); // the step number is not shown
    const item = page.locator('#step99-selfcheck .res-item');
    await expect(item).toContainText('Sample reason.');
    await expect(item).toContainText('TOY: plumbing test only');
    await item.getByRole('button', { name: 'good' }).click();
    await expect(verdictsText(page)).toContainText('1 verdicts');
  } finally {
    fs.rmSync(path.join(RESULTS_DIR, 'step99-selfcheck.json'), { force: true });
  }
});

test('keyboard: the list of sections and every button can be reached and has a name', async ({ page }) => {
  await openResults(page);
  const styles = page.getByRole('navigation', { name: 'Sections of this page' }).getByRole('link', { name: /^Styles/ });
  await styles.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.res-pane:not([hidden]) h2')).toHaveText('Styles');
  // Every visible button and link in the page has an accessible name.
  const unnamed = await page.locator('.res-pane:not([hidden]) button, .res-pane:not([hidden]) a, .res-nav a, .res-bar button, .res-bar input, .res-pane:not([hidden]) select').evaluateAll((els) =>
    els.filter((e) => !(e.getAttribute('aria-label') || e.textContent?.trim() || (e as HTMLInputElement).placeholder || e.closest('label')?.textContent?.trim())).map((e) => e.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
  // Repeated buttons say what they are for.
  await expect(page.getByRole('button', { name: /^Open the slides of Quiet dark minimal$/ })).toBeVisible();
  await expect(page.getByRole('group', { name: /^Verdict for Quiet dark minimal/ })).toBeVisible();
});

test('phone width: the list of sections becomes a strip at the top and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/lab');
  await expect(page.getByRole('heading', { level: 1, name: 'Results' })).toBeVisible();
  const nav = page.locator('.res-nav');
  await expect(nav).toBeVisible();
  expect(await nav.evaluate((n) => getComputedStyle(n).position)).toBe('sticky');
  expect(await nav.locator('ul').evaluate((u) => getComputedStyle(u).flexDirection)).toBe('row');
  for (const v of SECTIONS) {
    await nav.getByRole('link', { name: new RegExp(`^${v}`) }).click();
    await expect(page.locator('.res-pane:not([hidden]) h2').first()).toHaveText(v);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${v} scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
  }
  await nav.getByRole('link', { name: /^Overview/ }).click();
  await page.screenshot({ path: path.join(OUT, '07-phone-overview.png') });
  // Scrolled down, the strip sits directly under the app's own top bar, not behind it (390 px wide).
  await page.setViewportSize({ width: 390, height: 844 });
  await nav.getByRole('link', { name: /^Slides/ }).click();
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(300);
  const bar = await page.locator('.topbar').evaluate((e) => e.getBoundingClientRect().bottom);
  const top = await nav.evaluate((e) => e.getBoundingClientRect().top);
  expect(top, `the strip starts at ${top}px, the top bar ends at ${bar}px`).toBeGreaterThanOrEqual(bar);
  await page.screenshot({ path: path.join(OUT, '08-phone-strip-scrolled.png') });
});
