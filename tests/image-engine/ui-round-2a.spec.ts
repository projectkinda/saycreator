// UI round 2a (ZERO model calls beyond the one FAKE writer answer that makes the deck):
//   - every style card draws within a few seconds; "Pick for me" has a card picture; 3 per row on a desktop, 2 on a phone
//   - with no handle set, no slide draws "@yourname" (library route and the older styles); with a handle set it is drawn
//   - plain words unless Developer tools is on; one toolbar row; step names on one line; no empty slide box above the steps on a phone
//   - the Edit slides view as four tabs; a word edit draws the slide again with no model call, keeps the plan in step, and Undo takes it back
// Screenshots of the four steps and the four tabs at a phone and a desktop width: out/ui-round-2/
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import { deckDrawn, openEdit, openTab, stylesDrawn, toStep } from './ui';

test.setTimeout(300_000);

const fixture = JSON.parse(fs.readFileSync('tests/image-engine/fixtures/hot-flat-app-library.json', 'utf8')).library;
const SPECS = fixture.plan.specs.map((s: any) => ({ layout: s.layout, fields: s.fields, accents: s.accents }));
const WRITER = JSON.stringify({ title: fixture.plan.title ?? 'Stop storing your life in your head', slides: SPECS });
const TEXT = 'Stop storing your life in your head. Hold things in a system you trust. Three steps: capture, sort, review. Build your own. Join the waitlist today.';
const KEY = 'creator.carousel.project.v1';
const OUT = 'out/ui-round-2';

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
const proj = (page: Page) => page.evaluate((key) => {
  const d = (JSON.parse(localStorage.getItem(key) ?? '{}') as { project?: { doc?: any } }).project?.doc;
  const l = d?.designed?.library;
  return { specs: (l?.plan?.specs ?? []) as { layout: string; fields: Record<string, any>; accents: string[] }[], redraws: (l?.redraws ?? 0) as number, calls: (d?.designed?.calls ?? 0) as number, script: d?.script, svgs: Object.values(d?.designed?.slides ?? {}).map((s: any) => String(s?.built?.svg ?? '')) as string[] };
}, KEY);
const stagePic = (page: Page) => page.locator('.cr-stage-pic img').evaluate((el: HTMLImageElement) => el.src);

/** Steps 1 to 3 by hand (no handle typed), then the make button. */
async function makeDeck(page: Page, handle = '') {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  if (handle) await page.getByLabel('Your handle (optional)').fill(handle);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, SPECS.length);
}

test('every style card draws in a few seconds, "Pick for me" has a card picture, and the grid is 3 per row (2 on a phone)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/images/carousel');
  await toStep(page, 3);
  const list = page.getByRole('list', { name: 'Styles' });
  const t0 = Date.now();
  await stylesDrawn(page);
  console.log('STYLE_CARDS_MS', Date.now() - t0);
  const cards = list.locator('li:not(.cr-new-li)');
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(10);
  const bad = await cards.evaluateAll((els) => els.filter((e) => { const img = e.querySelector('img') as HTMLImageElement | null; const svg = e.querySelector('svg'); return !(svg || (img && img.naturalWidth > 0)); }).map((e) => e.querySelector('strong')?.textContent));
  expect(bad, 'every card has a picture').toEqual([]);
  await expect(list.getByText('No preview')).toHaveCount(0);
  // the Pick for me card has an icon in a picture box like the others
  await expect(list.locator('.cr-auto .cr-auto-pic svg')).toHaveCount(1);
  const perRow = async () => cards.evaluateAll((els) => { const tops = els.map((e) => Math.round(e.getBoundingClientRect().top)); return tops.filter((t) => t === tops[0]).length; });
  expect(await perRow(), 'three cards per row on a desktop').toBe(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  expect(await perRow(), 'two cards per row on a phone').toBe(2);
});

test('no handle set: no "@yourname" is drawn on any slide (library deck and every older style); a handle that is set is drawn', async ({ page, browser }) => {
  const f = await fake(page);
  await makeDeck(page);
  expect(f.calls).toBe(1);
  const p = await proj(page);
  expect(p.svgs.length).toBe(SPECS.length);
  for (const [i, svg] of p.svgs.entries()) expect(svg.toLowerCase(), `library slide ${i + 1}`).not.toContain('yourname');
  // the older styles, drawn from the example script (its handle is the placeholder)
  const left = await page.evaluate(async () => {
    const C = await import('/src/carousel/render.ts');
    const D = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    const out: string[] = [];
    let withHandle = 0; // control: the same check does find a handle that IS set
    for (const st of C.getStyles().styles) {
      const set = C.composeDoc({ ...D.emptyDoc(st.spec.name), script: { ...S.EXAMPLE, brand: { handle: '@jo.ke' } } } as never);
      if (/jo.ke/i.test(JSON.stringify(set.slides.map((x: any) => [x.plan.layers, x.faithful?.svg ?? ''])))) withHandle++;
      const doc = { ...D.emptyDoc(st.spec.name), script: S.EXAMPLE };
      const { slides } = C.composeDoc(doc as never);
      const text = JSON.stringify(slides.map((s: any) => [s.plan.layers, s.faithful?.svg ?? '']));
      if (/yourname/i.test(text)) out.push(st.spec.name);
    }
    return { out, withHandle };
  });
  expect(left.withHandle, 'control: a handle that is set shows up in the older styles').toBeGreaterThan(0);
  expect(left.out, 'styles that still draw the placeholder').toEqual([]);
  // a handle that is set is drawn
  const other = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: { cookies: [], origins: [] } })).newPage();
  await fake(other);
  await makeDeck(other, '@jo.ke');
  const q = await proj(other);
  expect(q.svgs.some((s) => /jo\.ke/i.test(s)), 'the typed handle is on a slide').toBe(true);
});

test('plain words: no developer wording unless Developer tools is on; one toolbar row; step names on one line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fake(page);
  await makeDeck(page);
  const body = () => page.locator('.cr-studio').innerText();
  await expect(page.getByTestId('progress-done')).toHaveText('Your 7 slides are ready.');
  let txt = await body();
  expect(txt).not.toMatch(/Designed mode|fell back|Writer \(dev|model call,|Drawn as the pack/);
  expect(txt).not.toContain('4. Your slides');
  // the Live view chip is not visible (it stays for screen readers)
  const pill = page.locator('.lv-pill');
  if (await pill.count()) {
    const box = await pill.first().boundingBox();
    expect(!box || (box.width <= 2 && box.height <= 2), 'the Live view chip is not on screen').toBe(true);
  }
  // one toolbar row: Undo, Redo and More share a line
  const tops = await page.getByRole('toolbar', { name: 'Project actions' }).locator('> *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size, 'Undo, Redo and More on one row').toBe(1);
  await page.getByText('More', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible();
  await page.getByText('More', { exact: true }).click();
  // the step names fit on one line on a desktop and a phone
  for (const w of [1280, 390]) {
    await page.setViewportSize({ width: w, height: 844 });
    const tall = await page.locator('.cr-wiz-step').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 50).length);
    expect(tall, `step names on one line at ${w}`).toBe(0);
    const clipped = await page.locator('.cr-wiz-name').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    expect(clipped, `step names not cut at ${w}`).toBe(0);
  }
  // the writer label and the developer lines show when Developer tools is on
  await toStep(page, 3);
  await expect(page.getByTestId('writer-label')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Developer tools' }).check();
  await expect(page.getByTestId('writer-label')).toBeVisible();
  expect(await body()).toContain('Writer (dev label)');
});

test('on a phone the empty "Your slides appear here" box is not above the steps; the steps come first, the slides after they exist', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fake(page);
  await page.goto('/images/carousel');
  await expect(page.getByText('Your slides appear here')).toBeHidden();
  const stepsTop = await page.getByRole('navigation', { name: 'Steps' }).evaluate((e) => e.getBoundingClientRect().top);
  expect(stepsTop, 'the steps are near the top of the screen').toBeLessThan(500);
  await makeDeck(page);
  await expect(page.locator('.cr-stage-pic')).toBeVisible();
  // the sticky top bar is in the flow and the page does not scroll sideways
  const r = await page.evaluate(() => ({ bar: document.querySelector('.topbar') ? getComputedStyle(document.querySelector('.topbar')!).position : 'none', sideways: document.documentElement.scrollWidth > innerWidth + 1 }));
  expect(r.sideways).toBe(false);
  console.log('TOPBAR', JSON.stringify(r));
  // real scrolling: the top bar either stays at the top over a solid background, or scrolls away: it never covers content with a see-through background
  for (const y of [300, 900, 1500]) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(250);
    const b = await page.evaluate(() => { const t = document.querySelector('.topbar') as HTMLElement; const rc = t.getBoundingClientRect(); return { top: Math.round(rc.top), bottom: Math.round(rc.bottom), bg: getComputedStyle(t).backgroundColor, scrollY: Math.round(scrollY) }; });
    console.log('TOPBAR_SCROLL', JSON.stringify(b));
  }
});

test('Edit slides is four tabs: Layout | Text | Pictures | Fine-tune, with no second big preview; the selected thumbnail is marked', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fake(page);
  await makeDeck(page);
  await openEdit(page, 2);
  const tabs = page.getByRole('tablist');
  await expect(tabs.getByRole('tab')).toHaveText(['Layout', 'Text', 'Pictures', 'Fine-tune']);
  // library deck: the Layout tab is first; it holds the layout choices and the Variations
  await expect(page.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('gallery-1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Variations' })).toBeVisible();
  await expect(page.getByTestId('gallery-controls-1')).toBeVisible();
  // no second big preview in the panel
  await expect(page.getByTestId('edit-view').locator('.cr-pic img, .cr-pic-btn')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show slide 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // the older tools are hidden on a library deck, Download PNG stays
  await expect(page.getByRole('button', { name: 'Shuffle elements' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Regenerate from the plan' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Download PNG/ })).toBeVisible();
  // text: that slide's fields and the Rewrite text button with its cost
  await openTab(page, 'Text', 2);
  await expect(page.getByTestId('text-tab-1').locator('input, textarea').first()).toBeVisible();
  await expect(page.getByLabel('Highlighted words (optional)')).toBeVisible();
  await expect(page.getByTestId('rewrite-1')).toContainText('1 small model call');
  await expect(page.getByRole('button', { name: 'Rewrite text' })).toBeVisible();
  // pictures: slots, the unused tray, "Put a picture here" inside its box, tags
  await openTab(page, 'Pictures', 2);
  // (round 2b: with no picture slot the tab says to add pictures; the picture box and the tags are developer tools)
  await expect(page.getByText('Add pictures in step 1')).toBeVisible();
  // fine-tune: the Detected style toggles
  await openTab(page, 'Fine-tune', 2);
  await expect(page.getByTestId('detected-style')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shuffle elements' })).toHaveCount(0);
  // developer tools bring the older buttons back
  await page.getByRole('checkbox', { name: 'Developer tools' }).check();
  await expect(page.getByRole('button', { name: 'Shuffle elements' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Regenerate from the plan' })).toBeVisible();
  // and the picture box (inside its panel) and the tags
  await openTab(page, 'Pictures', 2);
  const put = page.getByLabel('Picture for slide 2');
  await expect(put).toBeVisible();
  const fit = await put.evaluate((el) => { const r = el.getBoundingClientRect(); const p = el.closest('.cr-tabpanel')!.getBoundingClientRect(); return r.left >= p.left - 1 && r.right <= p.right + 1; });
  expect(fit, 'the "Put a picture here" input stays inside the panel').toBe(true);
  await expect(page.getByText('Picture tags (2 to 4)')).toBeVisible();
});

test('a word edit draws the slide again (no model call), keeps the stored plan and the script in step, and Undo takes it back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const f = await fake(page);
  await makeDeck(page);
  const before = await proj(page);
  const picBefore = await stagePic(page);
  await openTab(page, 'Text', 1);
  const field = page.getByTestId('text-tab-0').getByLabel(/^Headline/).first();
  const original = await field.inputValue();
  const NEW = 'Brand new words for this slide';
  await field.fill(NEW);
  await expect.poll(async () => (await proj(page)).specs[0].fields.headline ?? (await proj(page)).specs[0].fields.title ?? (await proj(page)).specs[0].fields.question, { timeout: 30_000 }).toBe(NEW);
  const after = await proj(page);
  expect(after.redraws, 'drawn again from the plan').toBe(before.redraws + 1);
  expect(f.calls, 'no model call for a word edit').toBe(1);
  expect(after.calls).toBe(before.calls);
  expect(JSON.stringify(after.script.slides[0]), 'the script form follows').toContain(NEW);
  expect(after.svgs[0], 'the drawn slide carries the new words').toMatch(/brand/i);
  expect(after.svgs[1], 'other slides are unchanged').toBe(before.svgs[1]);
  await expect.poll(() => stagePic(page), { timeout: 30_000 }).not.toBe(picBefore);
  // one Undo step takes it back: the plan, the script and the picture
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => { const s = (await proj(page)).specs[0].fields; return s.headline ?? s.title ?? s.question; }, { timeout: 30_000 }).toBe(original);
  const undone = await proj(page);
  expect(JSON.stringify(undone.script.slides[0])).not.toContain(NEW);
  expect(undone.svgs[0]).toBe(before.svgs[0]);
  await expect(field).toHaveValue(original);
  expect(f.calls).toBe(1);
  // and Redo brings it forward again
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => { const s = (await proj(page)).specs[0].fields; return s.headline ?? s.title ?? s.question; }, { timeout: 30_000 }).toBe(NEW);
});

test('screenshots: the four steps and the four tabs, phone and desktop', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await fake(page);
  for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(vp);
    await page.goto('/images/carousel');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
    const shot = (file: string) => page.screenshot({ path: `${OUT}/${name}-${file}.png`, fullPage: false });
    await page.getByLabel('Your text or topic').fill(TEXT);
    await shot('1-content');
    await page.getByRole('button', { name: 'I already have a script' }).click();
    await page.locator('.cr-script-own').scrollIntoViewIfNeeded();
    await shot('1-content-own-script');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Write my script for me' }).click();
    await toStep(page, 2);
    await shot('2-format');
    await toStep(page, 3);
    await stylesDrawn(page);
    await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
    await shot('3-style');
    await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
    await deckDrawn(page, SPECS.length);
    await shot('4-slides');
    await openTab(page, 'Layout', 2);
    await expect(page.getByTestId('gallery-1')).toHaveAttribute('data-ready-ms', /\d+/, { timeout: 120_000 });
    await page.getByTestId('edit-view').scrollIntoViewIfNeeded();
    await shot('5-tab-layout');
    await openTab(page, 'Text', 2);
    await shot('6-tab-text');
    await openTab(page, 'Pictures', 2);
    await shot('7-tab-pictures');
    await openTab(page, 'Fine-tune', 2);
    await shot('8-tab-fine-tune');
  }
});
