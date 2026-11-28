// Round AL part 2: the layout picker by PURPOSE. Every layout of the library is in exactly one purpose; the grid shows one tile per purpose that fits the slide (the slide's own
// layout first, marked "Now"); "More like this" opens the other layouts of that purpose in the same place; purposes with no layout that fits are under "Why not the others (N)"
// with a plain reason; "Adjust this layout" holds the layout's two looks in plain words, the colour block and the light/dark swap. A FAKE writer makes the deck: ZERO model calls.
import { expect, test, type Page } from '@playwright/test';
import { deckDrawn, openTab, toStep } from './ui';

test.setTimeout(6 * 60_000);

test('AL2 the purposes: every layout in exactly one; the grid of a slide: own purpose first, the first layout that fits on each tile, the others under "More like this", the rest with a reason; two plain looks per layout', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const L: any = await import('/src/carousel/layouts/index.ts');
    const P: any = await import('/src/carousel/layoutPurpose.ts');
    const all = P.PURPOSES.flatMap((p: any) => p.layouts);
    const E = (layout: string, enabled: boolean, current = false, reason?: string) => ({ layout, enabled, current, reason });
    const entries = (L.LAYOUT_IDS as string[]).map((id) => E(id, ['statement-card', 'statement', 'big-question', 'cover-art', 'cover-ruled'].includes(id), id === 'statement-card', ['statement-card', 'statement', 'big-question', 'cover-art', 'cover-ruled'].includes(id) ? undefined : `why ${id}`));
    const g = P.purposeGrid(entries);
    return {
      ids: [...L.LAYOUT_IDS].sort(), all: [...all].sort(), dup: all.length - new Set(all).size, names: P.PURPOSES.map((p: any) => p.name),
      tiles: g.tiles.map((t: any) => [t.purpose.name, t.best, t.more, t.current]), off: g.off.map((o: any) => [o.purpose.name, o.reason]),
      looks: (L.LAYOUT_IDS as string[]).map((id) => [id, P.looksOf(id)]), label: [P.purposeLabel('statement-card'), P.purposeLabel('quote'), P.purposeLabel('split-half')],
    };
  });
  expect(r.all, 'every layout of the library is in a purpose').toEqual(r.ids);
  expect(r.dup, 'and in only one').toBe(0);
  for (const n of ['Compare', 'Do and do not', 'Timeline', 'Spotlight', 'Feature slider', 'Cards']) expect(r.names).toContain(n);
  expect(r.names).not.toContain('Other');
  expect(r.tiles[0], 'the slide\'s own purpose first, its own layout on the tile').toEqual(['Big statement', 'statement-card', ['statement'], true]);
  expect(r.tiles.slice(1)).toEqual([['Question', 'big-question', [], false], ['Cover', 'cover-art', ['cover-ruled'], false]]);
  expect(r.off.length, 'every other purpose is under "Why not the others"').toBe(r.names.length - 3);
  for (const [, why] of r.off) expect(why).toMatch(/^why /);
  expect(r.label).toEqual(['Big statement, on a card', 'Quote', 'Photo on the side, half and half']);
  for (const [id, l] of r.looks) {
    expect(l.length, id).toBe(2);
    expect(l[0], `${id}: two different looks`).not.toBe(l[1]);
    for (const x of l) expect(x, `${id}: plain words`).not.toMatch(/\b(variant|cut|invert|density|plane|kicker|numerals?|2x2)\b/i);
  }
});

const TEXT = "5 small habits that make your photos look less like everyone else's.\n\n1. Shoot at golden hour. Sunrise and the hour before sunset do more than any filter.\n2. Look for reflections. Puddles, windows and wet streets give you a second picture for free.\n3. Get low or get high. Eye level is what everyone else does.\n4. Leave empty space. A small subject in a big scene feels like a story.\n5. Pick one detail. A single leaf on a table can beat a whole landscape.\n\nSave this for your next shoot, and tell me which one you'll try first.";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const WRITER = JSON.stringify({
  title: '5 small habits',
  slides: [
    S('statement', { headline: '5 small habits for your photos', caption: "Look less like everyone else's." }),
    S('listicle-numeral', { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' }),
    S('split-text', { headline: 'Look for reflections', paragraph: 'Puddles, windows and wet streets give you a second picture for free.' }),
    S('statement', { headline: 'Get low or get high.', caption: 'Eye level is what everyone else does.' }),
    S('prose', { heading: 'Leave empty space.', p1: 'A small subject in a big scene feels like a story.' }),
    S('statement-card', { headline: 'Pick one detail.', caption: 'A single leaf on a table can beat a whole landscape.' }),
    S('cta-pair', { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me', line2: "Tell me which one you'll try first." }),
  ],
});
async function deck(page: Page) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  const write = (r: any) => { f.calls++; return r.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 7);
  return f;
}
const lib = (page: Page) => page.evaluate(() => {
  const l = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as any).project?.doc?.designed?.library;
  return l ? { layouts: l.plan.specs.map((s: any) => s.layout) as string[], variants: l.variants as number[] } : null;
});

for (const vp of [{ name: '390 px', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 1000 }]) {
  test(`AL3 the picker in the app at ${vp.name}: one tile per purpose that fits, "Now" first with a picture on every tile, "More like this" opens in place, "Why not the others", plain looks; one click changes the slide; no model call`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const f = await deck(page);
    await openTab(page, 'Layout', 4);
    const g = page.getByTestId('gallery-3');
    await g.scrollIntoViewIfNeeded();
    await expect(g).not.toHaveAttribute('data-ready-ms', '', { timeout: 60_000 });
    const m = await g.evaluate((el) => {
      const cells = [...el.querySelectorAll('[data-testid^="purpose-"]:not([data-testid^="purpose-off-"])')];
      return {
        cells: cells.map((c) => ({ id: c.getAttribute('data-testid'), tiles: c.querySelectorAll('button[data-testid^="gal-"]').length, imgs: c.querySelectorAll('img').length, more: c.querySelector('[data-testid^="more-"]')?.textContent ?? '' })),
        first: cells[0]?.querySelector('button[data-testid^="gal-"]')?.textContent ?? '', firstState: cells[0]?.querySelector('button[data-testid^="gal-"]')?.getAttribute('data-state'),
        off: el.querySelector('[data-testid^="gallery-off-"] summary')?.textContent ?? '', offItems: el.querySelectorAll('[data-testid^="purpose-off-"]').length,
        looks: [...el.querySelectorAll('[data-testid^="look-"]')].map((b) => b.textContent), overflow: document.documentElement.scrollWidth - window.innerWidth,
        cols: getComputedStyle(el.querySelector('.cr-lp-grid')!).gridTemplateColumns.split(' ').length,
      };
    });
    expect(m.cells.length, JSON.stringify(m.cells)).toBeGreaterThanOrEqual(3);
    expect(m.cells.length).toBeLessThanOrEqual(8);
    for (const c of m.cells) { expect(c.tiles, `${c.id}: one tile while closed`).toBe(1); expect(c.imgs, `${c.id}: a picture of this slide`).toBe(1); }
    expect(m.first, 'the slide\'s own layout first, marked Now').toMatch(/^Now Big statement/);
    expect(m.firstState).toBe('current');
    expect(m.off).toMatch(/^Why not the others \(\d+\)$/);
    expect(Number(/\((\d+)\)/.exec(m.off)![1])).toBe(m.offItems);
    expect(m.cells.length + m.offItems, 'every purpose is in the grid or under "Why not the others"').toBe(19);
    expect(m.looks.length).toBe(2);
    expect(m.overflow, 'no sideways scroll').toBeLessThanOrEqual(0);
    expect(m.cols, 'columns').toBe(vp.width < 600 ? 2 : 3);

    // "More like this" opens the other layouts of the purpose in the same cell
    const cell = g.locator('[data-testid^="purpose-"]:has([data-testid^="more-"])').first();
    const cid = (await cell.getAttribute('data-testid'))!;
    const n = Number(/\((\d+)\)/.exec((await cell.locator('[data-testid^="more-"]').textContent())!)![1]);
    await cell.locator('[data-testid^="more-"]').click();
    const open = g.getByTestId(cid);
    await expect(open).toHaveAttribute('data-open', 'true');
    await expect(open.locator('button[data-testid^="gal-"]')).toHaveCount(n + 1);
    await expect(open.locator('img')).toHaveCount(n + 1, { timeout: 30_000 });

    // one click on another purpose changes this slide only; then the other look
    const before = (await lib(page))!;
    const calls = f.calls;
    const other = g.locator('[data-testid^="purpose-"]:not([data-testid^="purpose-off-"]) button[data-state="ready"][data-testid^="gal-"]').last();
    await other.click();
    await expect(g.getByRole('status')).toHaveText(/^Slide 4 is now [A-Z][^:]*: no model call\. Undo brings the old one back\.$/, { timeout: 60_000 });
    await expect.poll(async () => (await lib(page))!.layouts[3], { timeout: 30_000 }).not.toBe(before.layouts[3]);
    const after = (await lib(page))!;
    expect(after.layouts.filter((l, i) => l !== before.layouts[i]).length).toBe(1);
    await expect(g).not.toHaveAttribute('data-ready-ms', '', { timeout: 60_000 });
    const look = g.locator('[data-testid^="look-"]:not([disabled])').first();
    await look.click();
    await expect.poll(async () => (await lib(page))!.variants[3], { timeout: 30_000 }).not.toBe(after.variants[3]);
    expect(f.calls, 'one fake writer call for the deck; the picker costs nothing').toBe(calls);
    expect(f.calls).toBe(1);
    await g.screenshot({ path: `test-results/round-al-picker-${vp.width}.png` });
  });
}
