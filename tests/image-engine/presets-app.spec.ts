// Presets in the app (FAKE writer, zero real model calls): a built-in preset is drawn by the layout library; the toggles and the layout picker work on it with no model call and
// one undo step; the saved reference cache is never read; "Pick for me" lands on the library; the template route stays behind creator.templateRoute.
import { deckDrawn, openFineTune, openTab, toStep } from './ui';
import { expect, test, type Page, type Route } from '@playwright/test';
import { exampleScript } from '../../src/carousel/script';

test.setTimeout(240_000);
test.use({ viewport: { width: 1280, height: 900 } });
test.describe.configure({ mode: 'default' }); // was 'serial': one failing test used to skip every test after it in the file; the tests here do not share state

const TEXT = 'Quick Flip is a hoodie that flips into a backpack in 10 seconds. Slide the zip and bite the clasp. The shell is waterproof and fits a 16-inch laptop. Early backers save 30%. Back it today on Kickstarter before it closes.';
const LIB = JSON.stringify({ title: 'Quick Flip', slides: [
  { layout: 'statement', fields: { kicker: 'New on Kickstarter', headline: 'A hoodie that flips into a backpack', caption: 'One piece. Two jobs.' }, accents: ['backpack'] },
  { layout: 'big-stat', fields: { number: '10', label: 'seconds to flip it', source: 'Measured in our workshop' } },
  { layout: 'stepper', fields: { title: 'How to flip it', steps: ['Zip the hood into the pocket', 'Fold the sleeves behind you', 'Pull the straps and go'] } },
  { layout: 'quote', fields: { quote: 'I stopped carrying a bag the day this arrived.', author: 'An early backer' }, accents: ['stopped carrying'] },
  { layout: 'checklist', fields: { title: 'What you get', items: ['Waterproof shell', 'Fits a 16-inch laptop', 'Machine washable'] } },
  { layout: 'stat-bar', fields: { number: '30%', label: 'off for early backers', bar: '30', note: 'Open to 20 backers only.' } },
  { layout: 'split-text', fields: { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' }, accents: ['built it'] },
  { layout: 'cta-button', fields: { headline: 'Early backers save 30%', button: 'Back on Kickstarter', sub: 'Open to 20 backers only.' }, accents: ['save 30%'] },
] });
const SCRIPT7 = (() => { const j = JSON.parse(exampleScript('carousel')); return JSON.stringify(j); })();

interface Fake { calls: { prompt: string }[]; refRequests: string[]; cacheLogs: string[] }
async function fake(page: Page, answer: (prompt: string) => string): Promise<Fake> {
  const f: Fake = { calls: [], refRequests: [], cacheLogs: [] };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  const write = async (r: Route) => {
    const prompt = (r.request().postDataJSON() as { prompt: string }).prompt;
    f.calls.push({ prompt });
    return r.fulfill({ json: { text: answer(prompt), ms: 5, usage: { input: 10, output: 5 } } });
  };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  page.on('request', (r) => { if (/\/(__|api\/)reference\//.test(r.url()) && !/status/.test(r.url())) f.refRequests.push(r.url()); });
  page.on('console', (m) => { if (m.text().startsWith('[whole-cache]')) f.cacheLogs.push(m.text()); });
  return f;
}
const open = async (page: Page) => {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
};
const project = (page: Page) => page.evaluate(() => {
  const d = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as { project?: { doc?: any } }).project?.doc;
  return d ? { style: d.style, route: d.route?.route ?? null, reason: d.route?.reason ?? '', designed: !!d.designed, lib: d.designed?.library ? { source: d.designed.library.source, layouts: d.designed.library.layouts, cuts: d.designed.library.cuts, devices: d.designed.library.style?.devices, rhythm: (d.designed.library.style?.rhythm ?? []).length, caseStyle: d.designed.library.style?.caseStyle ?? null, calls: d.designed.library.calls, grounds: d.designed.library.grounds } : null } : null;
});
const pickStyle = async (page: Page, re: RegExp) => {
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: re }).first().click();
};
const make = async (page: Page, n: number) => {
  await toStep(page, 1);
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, n);
};

test('chooseRoute: a preset goes to the library; quick, square cards and the flag keep the templates; a reference is unchanged', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const Dz = await import('/src/carousel/designed.ts');
    const P = await import('/src/carousel/presets.ts');
    const pack = P.presetPackFor('hot-flat');
    const refPack: any = { name: 'ref', palette: {}, designs: {} };
    const A = 'mine-reference-active';
    const out: any = {
      preset: Dz.chooseRoute({ style: 'hot-flat', activeStyle: A, pack: null, presetPack: pack, format: 'carousel' }).route,
      quick: Dz.chooseRoute({ style: 'hot-flat', activeStyle: A, pack: null, presetPack: pack, mode: 'quick', format: 'carousel' }).route,
      square: Dz.chooseRoute({ style: 'hot-flat', activeStyle: A, pack: null, presetPack: pack, format: 'quote' }).route,
      noPack: Dz.chooseRoute({ style: 'hot-flat', activeStyle: A, pack: null, presetPack: null, format: 'carousel' }).route,
      reference: Dz.chooseRoute({ style: A, activeStyle: A, pack: refPack, presetPack: pack, format: 'carousel' }).route,
      referenceQuick: Dz.chooseRoute({ style: A, activeStyle: A, pack: refPack, mode: 'quick' }).route,
      slideText: Dz.chooseRoute({ style: 'hot-flat', activeStyle: A, pack: null, presetPack: pack, slideText: true }).route,
      mine: P.presetPackFor('mine-abc'),
      active: P.presetPackFor(A),
      unknown: P.presetPackFor('no-such-style'),
      look: pack && { rhythm: pack.look?.rhythm?.length, caseStyle: pack.look?.caseStyle, closing: !!pack.look?.closing, flavour: !!pack.look?.flavour, devices: pack.devices },
    };
    localStorage.setItem('creator.templateRoute', '1');
    out.flagPack = P.presetPackFor('hot-flat');
    localStorage.removeItem('creator.templateRoute');
    return out;
  });
  expect(r).toMatchObject({ preset: 'designed', quick: 'pack', square: 'pack', noPack: 'pack', reference: 'designed', referenceQuick: 'pack', slideText: 'pack', mine: null, active: null, unknown: null, flagPack: null });
  expect(r.look).toMatchObject({ rhythm: 3, caseStyle: 'upper', closing: true, flavour: true });
  expect(r.look.devices.marker).toBe(true);
});

test('hot-flat through the library: 1 writer call, the flavour line in the prompt, toggles and picker with no call and one undo step, no reference cache', async ({ page }) => {
  const f = await fake(page, () => LIB);
  await open(page);
  await pickStyle(page, /Hot flat/);
  await make(page, 8);
  expect(f.calls.length).toBe(1);
  expect(f.calls[0].prompt).toContain('[carousel:library]');
  expect(f.calls[0].prompt).toContain('This look suits');
  expect(f.calls[0].prompt).not.toMatch(/<svg|data-slide/);
  // Round B: the project is saved a moment after the deck is drawn: wait for the saved project to hold the library plan instead of reading it at once (the flaky read)
  await expect.poll(async () => (await project(page))?.lib?.grounds?.length, { timeout: 30_000 }).toBe(8);
  const p0 = await project(page);
  expect(p0).toMatchObject({ style: 'hot-flat', route: 'designed', designed: true });
  expect(p0!.lib).toMatchObject({ source: 'hot-flat', rhythm: 3, caseStyle: 'upper' });
  expect(p0!.lib!.devices.marker).toBe(true);
  expect(p0!.lib!.grounds).toHaveLength(8);
  // the style panel shows the preset's devices; flipping one redraws with no model call
  await openFineTune(page, 1);
  const panel = page.getByTestId('detected-style');
  await expect(panel).toBeVisible();
  const imgs = () => page.locator('.cr-film img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  const before = await imgs();
  await panel.getByRole('checkbox', { name: 'Underline' }).click();
  await expect(page.getByText(/^Style devices changed/).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await imgs()).filter((s, i) => s !== before[i]).length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(f.calls.length, 'a toggle makes no model call').toBe(1);
  await expect.poll(async () => (await project(page))?.lib?.devices.underline, { timeout: 30_000 }).toBe(true);
  // one undo step
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await project(page))?.lib?.devices.underline, { timeout: 30_000 }).toBe(false);
  expect(f.calls.length).toBe(1);
  // the layout picker on slide 3: a pick redraws that one slide with no call
  await openTab(page, 'Layout', 3);
  const picker = page.getByTestId('gallery-2');
  await picker.scrollIntoViewIfNeeded();
  const tile = picker.locator('[data-current="false"][data-enabled="true"] button:not([disabled])').first();
  await expect(tile).toBeVisible({ timeout: 120_000 });
  const layoutsBefore = (await project(page))!.lib!.layouts;
  await tile.click();
  await expect(picker.getByText(/^Redrew slide 3/)).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await project(page))!.lib!.layouts[2], { timeout: 30_000 }).not.toBe(layoutsBefore[2]);
  const layoutsAfter = (await project(page))!.lib!.layouts;
  expect(layoutsAfter[2]).not.toBe(layoutsBefore[2]);
  expect(layoutsAfter.filter((l: string, i: number) => l !== layoutsBefore[i]).length).toBe(1);
  expect(f.calls.length, 'a layout pick makes no model call').toBe(1);
  // the preset never touched the reference reader or its cache
  expect(f.refRequests).toEqual([]);
  expect(f.cacheLogs).toEqual([]);
});

test('the preset toggles are kept under "preset:<name>" and used by the next carousel (not in the reference cache)', async ({ page }) => {
  const f = await fake(page, () => LIB);
  await open(page);
  await pickStyle(page, /editorial/i);
  await make(page, 8);
  await openFineTune(page, 1);
  const panel = page.getByTestId('detected-style');
  await panel.getByRole('radio', { name: 'Shapes: bold' }).click();
  await expect(page.getByText(/^Style devices changed/).first()).toBeVisible({ timeout: 60_000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('creator.styleOverrides.v1') ?? '{}'));
  expect(saved['preset:editorial-collage']).toMatchObject({ shapes: 'bold' });
  await page.reload();
  await pickStyle(page, /editorial/i);
  await make(page, 8);
  expect((await project(page))!.lib!.devices.planes).toBe(true);
  expect(f.refRequests).toEqual([]);
});

test('"Pick for me" now lands on the library (the preset is chosen before the call)', async ({ page }) => {
  const f = await fake(page, () => LIB);
  await open(page);
  await toStep(page, 3);
  await expect(page.getByRole('button', { name: /^Pick for me/ })).toHaveAttribute('aria-pressed', 'true');
  await make(page, 8);
  const p = await project(page);
  expect(p!.route).toBe('designed');
  expect(['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8']).toContain(p!.style);
  expect(p!.lib!.source).toBe(p!.style);
  expect(f.calls.length).toBe(1);
  expect(f.refRequests).toEqual([]);
});

test('the template route stays behind creator.templateRoute=1', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('creator.templateRoute', '1'));
  const f = await fake(page, () => SCRIPT7);
  await open(page);
  await pickStyle(page, /Hot flat/);
  await toStep(page, 1);
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img').first()).toBeVisible({ timeout: 120_000 });
  const p = await project(page);
  expect(p).toMatchObject({ style: 'hot-flat', route: 'pack' });
  expect(p!.lib).toBeNull();
  expect(f.calls[0].prompt).not.toContain('[carousel:library]');
});
