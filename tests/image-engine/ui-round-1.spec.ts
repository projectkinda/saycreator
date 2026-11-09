// UI round 1 (ZERO model calls beyond the one FAKE writer answer that makes the deck): the carousel page as four steps, the Edit slides view, the developer tools toggle,
// and a deck stored by older drawing code that is drawn again when it is opened.
// Screenshots of the four steps and the Edit slides view at a phone width and a desktop width: out/ui-round-1/
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(300_000);

const fixture = JSON.parse(fs.readFileSync('tests/image-engine/fixtures/hot-flat-app-library.json', 'utf8')).library;
const SPECS = fixture.plan.specs.map((s: any) => ({ layout: s.layout, fields: s.fields, accents: s.accents }));
const WRITER = JSON.stringify({ title: fixture.plan.title ?? 'Stop storing your life in your head', slides: SPECS });
const TEXT = 'Stop storing your life in your head. Hold things in a system you trust. Three steps: capture, sort, review. Build your own. Join the waitlist today.';
const KEY = 'creator.carousel.project.v1';

async function fake(page: Page) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const step = (page: Page, name: string) => page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name });
const lib = (page: Page) => page.evaluate((key) => {
  const d = (JSON.parse(localStorage.getItem(key) ?? '{}') as { project?: { doc?: any } }).project?.doc;
  const l = d?.designed?.library;
  return l ? { drawVersion: l.drawVersion as number | undefined, redraws: (l.redraws ?? 0) as number, calls: d.designed.calls as number, layouts: l.layouts as string[] } : null;
}, KEY);

/** Steps 1 to 3 by hand, then the make button: the page lands on step 4. */
async function makeDeck(page: Page) {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  await page.getByLabel('Your text or topic').fill(TEXT);
  await page.getByRole('button', { name: 'Next: Format' }).click();
  await page.getByRole('button', { name: 'Next: Style' }).click();
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(step(page, 'Your slides')).toHaveAttribute('aria-current', 'step', { timeout: 60_000 });
  await expect(page.locator('.cr-film img')).toHaveCount(SPECS.length, { timeout: 120_000 });
}

test('four steps: the content step holds the text, the images and the script choice; nothing is sent before the make button', async ({ page }) => {
  const f = await fake(page);
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  // the progress indicator names the four steps; step 1 is the current one
  for (const n of ['Your content', 'Format', 'Style', 'Your slides']) await expect(step(page, n)).toBeVisible();
  await expect(step(page, 'Your content')).toHaveAttribute('aria-current', 'step');
  await expect(step(page, 'Your slides')).toBeDisabled();
  // the text box, the images area and the script choice are on step 1, the choice right under the text box
  const box = page.getByLabel('Your text or topic');
  await expect(box).toBeVisible();
  await expect(page.getByText('Add images').first()).toBeVisible();
  const mine = page.getByRole('button', { name: 'Write my script for me' });
  const own = page.getByRole('button', { name: 'I already have a script' });
  await expect(mine).toHaveAttribute('aria-pressed', 'true');
  const bt = await box.boundingBox(), ct = await mine.boundingBox();
  expect(ct!.y, 'the script choice sits under the text box').toBeGreaterThan(bt!.y + bt!.height - 2);
  expect(ct!.y - (bt!.y + bt!.height), 'and right next to it').toBeLessThan(160); // the character count is the only thing between them
  await expect(page.getByRole('button', { name: 'Copy prompt for Claude' })).toHaveCount(0);
  await own.click();
  await expect(page.getByRole('button', { name: 'Copy prompt for Claude' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try an example script' })).toBeVisible();
  await expect(page.getByLabel('Paste the script Claude wrote (JSON)')).toBeVisible();
  await mine.click();
  await expect(page.getByRole('button', { name: 'Copy prompt for Claude' })).toHaveCount(0);
  // step 2: two format cards, each with one plain sentence; slides and platform on the same step
  await box.fill(TEXT);
  await page.getByRole('button', { name: 'Next: Format' }).click();
  await expect(step(page, 'Format')).toHaveAttribute('aria-current', 'step');
  const cards = page.getByRole('group', { name: 'Format' }).getByRole('button');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('A swipeable set of slides. Best for teaching, lists and stories.');
  await expect(cards.nth(1)).toContainText('One square image with a single line. Best for a quick, punchy post.');
  await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Platform', { exact: true })).toBeVisible();
  await expect(page.locator('select.cr-select').first()).toBeVisible();
  // step 3: the style picker with Pick for me, tone, handle and the make button
  await page.getByRole('button', { name: 'Next: Style' }).click();
  await expect(page.getByRole('list', { name: 'Styles' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pick for me/ })).toBeVisible();
  await expect(page.getByText('Tone', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('@yourname')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make carousel', exact: true })).toBeVisible();
  // back and forth loses nothing
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(box).toHaveValue(TEXT);
  await step(page, 'Style').click();
  await expect(page.getByRole('button', { name: 'Make carousel', exact: true })).toBeEnabled();
  expect(f.calls, 'no model call before the make button').toBe(0);
});

test('make: lands on step 4; Edit slides sits under the strip; the Edit view follows the selected thumbnail; Done returns with everything kept', async ({ page }) => {
  const f = await fake(page);
  await makeDeck(page);
  expect(f.calls).toBe(1);
  const before = (await lib(page))!;
  // the preview and strip stay on the left; the Edit slides button is directly under the strip
  const film = await page.locator('.cr-film').boundingBox();
  const edit = page.getByRole('button', { name: 'Edit slides' });
  await expect(edit).toBeVisible();
  const eb = await edit.boundingBox();
  expect(eb!.y, 'under the thumbnail strip').toBeGreaterThan(film!.y + film!.height - 2);
  expect(eb!.y - (film!.y + film!.height), 'directly under it').toBeLessThan(80);
  await expect(page.getByTestId('step-slides')).toBeVisible();
  await expect(page.getByRole('button', { name: /Download all/ })).toBeVisible();
  // open the Edit view: not a numbered step
  await edit.click();
  await expect(page.getByTestId('edit-view')).toBeVisible();
  await expect(page.locator('.cr-wiz-steps button')).toHaveCount(4);
  await expect(page.getByTestId('gallery-0')).toBeVisible();
  await expect(page.getByTestId('gallery-1')).toHaveCount(0);
  // selecting a thumbnail selects the slide being edited
  await page.getByRole('button', { name: 'Show slide 3' }).click();
  await expect(page.getByTestId('gallery-2')).toBeVisible();
  await expect(page.getByTestId('gallery-0')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Edit slide 3 of/ })).toBeVisible();
  // Fine-tune holds the detected-style toggles
  const fine = page.locator('details.cr-fine');
  await expect(fine).toBeVisible();
  await fine.locator('summary').click();
  await expect(fine.getByText(/Detected style|devices/i).first()).toBeVisible();
  // Done returns to step 4; the deck is untouched and no model call was made
  await page.getByRole('button', { name: 'Done', exact: true }).first().click();
  await expect(page.getByTestId('edit-view')).toHaveCount(0);
  await expect(step(page, 'Your slides')).toHaveAttribute('aria-current', 'step');
  expect(await lib(page)).toEqual(before);
  expect(f.calls).toBe(1);
  // an earlier step keeps its content
  await step(page, 'Your content').click();
  await expect(page.getByLabel('Your text or topic')).toHaveValue(TEXT);
});

test('developer tools: hidden by default, one toggle, remembered in the browser, nothing deleted', async ({ page }) => {
  await fake(page);
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  const dev = page.getByTestId('dev-tools');
  await expect(dev).toBeHidden();
  for (const t of ['Recreate and Match mode', 'Reference reader', 'Rebuild a built-in style as a pack', 'Designed slides, pictures and photos']) await expect(dev.getByText(t).first()).toBeHidden();
  const toggle = page.getByRole('checkbox', { name: 'Developer tools' });
  await toggle.check();
  await expect(dev).toBeVisible();
  for (const t of ['Recreate and Match mode', 'Rebuild a built-in style as a pack', 'Designed slides, pictures and photos']) await expect(dev.getByText(t).first()).toBeVisible();
  await expect(dev.getByText('Reference reader').first()).toBeVisible();
  await expect(dev.getByText('Report', { exact: false }).first()).toBeAttached();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Developer tools' })).toBeChecked();
  await expect(page.getByTestId('dev-tools')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Developer tools' }).uncheck();
  await page.reload();
  await expect(page.getByTestId('dev-tools')).toBeHidden();
});

test('a deck stored by older drawing code is drawn again when it is opened: from the stored plan, zero model calls, one undo step', async ({ page }) => {
  const f = await fake(page);
  await makeDeck(page);
  const fresh = (await lib(page))!;
  expect(fresh.drawVersion, 'a new deck carries the drawing version').toBeGreaterThanOrEqual(2);
  // make it look stored by older code: no drawing version, and an old drawing in the stored slides
  await page.addInitScript((key) => {
    if (localStorage.getItem('__stale') !== '1') return;
    localStorage.removeItem('__stale');
    const o = JSON.parse(localStorage.getItem(key)!);
    const d = o.project.doc.designed;
    delete d.library.drawVersion;
    for (const k of Object.keys(d.slides)) if (d.slides[k].built) d.slides[k].built.svg = d.slides[k].built.svg.replace('<svg', '<svg data-old-drawing="1"');
    localStorage.setItem(key, JSON.stringify(o));
  }, KEY);
  await page.evaluate(() => localStorage.setItem('__stale', '1'));
  const calls = f.calls;
  await page.reload();
  await expect.poll(async () => (await lib(page))?.drawVersion, { timeout: 60_000 }).toBe(fresh.drawVersion);
  const after = (await lib(page))!;
  expect(after.redraws, 'drawn again once').toBe(fresh.redraws + 1);
  expect(after.layouts, 'same plan').toEqual(fresh.layouts);
  expect(f.calls, 'no model call').toBe(calls);
  const old = await page.evaluate((key) => JSON.stringify(JSON.parse(localStorage.getItem(key)!).project.doc.designed.slides).includes('data-old-drawing'), KEY);
  expect(old, 'the old drawing is gone from the stored slides').toBe(false);
  // a second open does not draw it again
  await page.reload();
  await page.waitForTimeout(1500);
  expect((await lib(page))!.redraws).toBe(after.redraws);
});

for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]] as const) {
  test(`screenshots: the four steps and the Edit slides view, ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await fake(page);
    fs.mkdirSync('out/ui-round-1', { recursive: true });
    const shot = (n: string) => page.screenshot({ path: `out/ui-round-1/${name}-${n}.png`, fullPage: true });
    await page.goto('/images/carousel');
    await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
    await page.getByLabel('Your text or topic').fill(TEXT);
    await page.getByRole('button', { name: 'I already have a script' }).click();
    await shot('1-content-own-script');
    await page.getByRole('button', { name: 'Write my script for me' }).click();
    await shot('1-content');
    await page.getByRole('button', { name: 'Next: Format' }).click();
    await shot('2-format');
    await page.getByRole('button', { name: 'Next: Style' }).click();
    await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
    await shot('3-style');
    await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
    await expect(step(page, 'Your slides')).toHaveAttribute('aria-current', 'step', { timeout: 60_000 });
    await expect(page.locator('.cr-film img')).toHaveCount(SPECS.length, { timeout: 120_000 });
    await shot('4-slides');
    await page.getByRole('button', { name: 'Edit slides' }).click();
    await expect(page.getByTestId('gallery-0')).toBeVisible();
    await expect(page.getByTestId('gallery-0')).toHaveAttribute('data-ready-ms', /\d+/, { timeout: 120_000 });
    await shot('5-edit-slides');
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sideways, 'no sideways scroll').toBeLessThanOrEqual(0);
  });
}
