// Round F: polish. A: a photo shown whole fades into its blurred fill over at least 24 px (the feather mask). B: the phone frame's speaker slot is in the bezel, not over the screenshot.
// C: the Flavour line has no layout id or layout name. D: every layout thumbnail renders within a few seconds. E: the Variations controls are grouped with their own labels and wrap at 390 px.
// F: nothing sticks under the top bar at 390 px. G: the check:specs script exists. A FAKE writer only: ZERO real model calls. Pictures and numbers: out/round-f/.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);

test('A: a photo shown whole is feathered into its fill over at least 24 px (10% to 90% of a Gaussian of that blur); Round U: the fill is the dissolve, nothing darkened', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const dl: any = await import('/src/carousel/designLibrary.ts');
    const presets: any = await import('/src/carousel/presets.ts');
    const bd: any = await import('/src/carousel/layouts/build.ts');
    const { style } = dl.styleFromPack(presets.presetPackFor('style-3', false));
    // Round AD: a 1.7:1 photo (a cover crop cuts 28%: drawn whole) covers 72% of the 1080 x 880 slot, so it still dissolves (a 2:3 photo here covers 54% and is now drawn sharp: round-ad-sharp.spec)
    const FS: any = await import('/src/carousel/layouts/fillSlide.ts');
    FS.setFillOverrides([['phseam', 'off']]);
    const sp = { layout: 'photo-full-caption', fields: { headline: 'The idea took ten minutes', line: 'The slides took the rest of the night.', image: 'picture:phseam#w=1700&h=1000&k=p' }, accents: [] };
    const d = await dl.drawOne(sp, 0, style, { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
    FS.setFillOverrides([]);
    return { svg: d.built.svg, blur: bd.FEATHER_BLUR, inset: bd.FEATHER_INSET };
  });
  // the mask: the picture's rectangle moved `inset` px in and blurred by `blur`: the picture is 10% to 90% visible over 2 x 1.2816 x blur px
  expect(2 * 1.2816 * r.blur, 'transition width at 1080 wide').toBeGreaterThanOrEqual(24);
  expect(r.inset, 'the 10% point must not be outside the picture edge by more than a pixel').toBeGreaterThanOrEqual(1.2816 * r.blur - 2);
  expect(r.svg).toContain(`stdDeviation="${r.blur}"`);
  // Round U: the fill is the dissolve (the photo's own edge mirrored, blurred 32, faded into the slide), never a darkened copy
  expect(r.svg).toContain('<feGaussianBlur stdDeviation="32" edgeMode="duplicate"/>');
  expect(r.svg).not.toContain('fill="#000000" fill-opacity=');
});

test('B: the phone frame\'s speaker slot sits in the bezel, clear of the screen, and no word is lost', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const dl: any = await import('/src/carousel/designLibrary.ts');
    const presets: any = await import('/src/carousel/presets.ts');
    const { style } = dl.styleFromPack(presets.presetPackFor('style-3', false));
    const sp = { layout: 'phone-frame', fields: { headline: 'Change a headline and nothing reruns.', body: 'Switch the style and your words stay put.', image: 'picture:phscreen#w=1000&h=2170&fy=0.1' }, accents: [] };
    const d = await dl.drawOne(sp, 0, style, { handle: '@saycreator', index: 5, total: 7, cut: 'plain', invert: false, density: 'normal' });
    const svg: string = d.built.svg;
    const speaker = /<path[^>]*d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)"[^>]*stroke-width="22"/.exec(svg);
    const img = /<image href="[^"]*" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    return { speaker: speaker ? [+speaker[2], +speaker[4]] : null, img: img ? { y: +img[2], h: +img[4] } : null, texts: d.built.layers.filter((l: any) => l.kind === 'text').map((l: any) => l.text).join(' ').toLowerCase() };
  });
  expect(r.speaker, 'the speaker slot is drawn').not.toBeNull();
  expect(r.img, 'the screenshot is drawn').not.toBeNull();
  // a 22 px stroke is 11 px above and below its line; the screen starts below the slot with a gap
  expect(r.speaker[0] + 11, 'the bottom of the speaker slot is above the screen').toBeLessThan(r.img.y - 4);
  for (const w of ['change', 'headline', 'nothing', 'reruns', 'switch', 'style', 'words', 'stay', 'put']) expect(r.texts, `the word "${w}" is on the slide`).toContain(w);
});

test('C: the Flavour line names slide numbers and the style, never a layout id or layout name', async ({ page }) => {
  await page.goto('/images/carousel');
  const lines: string[] = await page.evaluate(async () => {
    const pw: any = await import('/src/carousel/plainWords.ts');
    return [pw.flavourLine([1], 'Warm editorial collage'), pw.flavourLine([1, 5], 'Warm editorial collage'), pw.flavourLine([6, 1, 5], 'Warm editorial collage'), pw.flavourLine([2, 2], undefined)];
  });
  expect(lines[0]).toBe('Slide 1 was laid out differently to fit Warm editorial collage. Undo takes back the whole carousel.');
  expect(lines[1]).toBe('Slides 1 and 5 were laid out differently to fit Warm editorial collage. Undo takes back the whole carousel.');
  expect(lines[2]).toBe('Slides 1, 5 and 6 were laid out differently to fit Warm editorial collage. Undo takes back the whole carousel.');
  expect(lines[3]).toBe('Slide 2 was laid out differently to fit this look. Undo takes back the whole carousel.');
  const ids = await page.evaluate(async () => { const L: any = await import('/src/carousel/layouts/index.ts'); return (L.LAYOUT_IDS as string[]).filter((x) => x.includes('-')); });
  for (const l of lines) for (const id of ids) expect(l, `no layout id (${id})`).not.toContain(id);
});

const TEXT = "Most creators don't have a design problem. They have a this takes two hours problem. You write a good post, then the evening goes to dragging text boxes. Pick a look from 15 styles, paste your text, get slides you can edit. Change a headline and nothing reruns. Try it on your next post.";
async function deckAt390(page: Page) {
  let calls = 0;
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  await page.goto('/images/carousel');
  const plan = await page.evaluate(async () => {
    const L: any = await import('/src/carousel/layouts/index.ts');
    const pick = (id: string) => ({ layout: id, fields: { ...L.layoutDef(id).samples.normal }, accents: [] });
    return { title: 'Creators and the slide problem', slides: ['statement-stacked', 'split-text', 'timeline', 'stat-grid', 'pill-stagger', 'feature-slider', 'cta-button'].map(pick) };
  });
  const w = (x: any) => { calls++; return x.fulfill({ json: { text: JSON.stringify(plan), ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  await page.getByLabel('Your text or topic').fill(TEXT);
  await page.locator('.cr-wiz-steps button').nth(2).click();
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(7, { timeout: 90_000 });
  await page.waitForTimeout(600);
  return () => calls;
}

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('C: the Flavour line on the Slides step at 390 px has no layout id or name; D: every layout thumbnail renders within 6 s; E: Variations controls are grouped and wrap; F: nothing sticks under the top bar', async ({ page }) => {
    const calls = await deckAt390(page);
    const flav = page.locator('p.small[role=status]').filter({ hasText: /laid out differently/ });
    await expect(flav).toHaveCount(1);
    const text = (await flav.textContent()) ?? '';
    expect(text).toMatch(/^Slides? [\d, and]+ (was|were) laid out differently to fit Warm editorial collage\. Undo takes back the whole carousel\.$/);
    expect(text).not.toMatch(/Flavour|statement|cover|headline and card/i);
    fs.mkdirSync('out/round-f', { recursive: true });
    await flav.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'out/round-f/flavour-line-spec.png' });

    // D: the Layout tab
    await page.getByTestId('edit-slides').click();
    await expect(page.getByTestId('edit-view')).toBeVisible();
    await page.getByRole('tab', { name: 'Layout' }).click();
    const gallery = page.locator('[data-testid^="gallery-"][data-signature]').first();
    await expect(gallery).toBeVisible();
    const pending = () => gallery.evaluate((g) => [...g.querySelectorAll('button[data-testid^="gal-"]:not([data-testid$="-off"])')].filter((b) => !(b.getAttribute('data-testid') ?? '').startsWith('gal-cut') && b.getAttribute('data-testid') !== 'gal-invert' && !b.querySelector('img')).length);
    await expect.poll(pending, { timeout: 6000, intervals: [250] }).toBe(0);
    // Round AL part 2: one tile per purpose that fits (was two per layout): a picture on every tile
    expect(await gallery.locator('img').count(), 'a thumbnail for every tile').toBe(await gallery.locator('button[data-testid^="gal-"][data-state]').count());
    expect(await gallery.locator('img').count()).toBeGreaterThanOrEqual(3);

    // E: the Variations controls
    const v = await page.evaluate(() => {
      const c = document.querySelector('[data-testid^="gallery-controls-"]')!;
      const box = (e: Element) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      return { groups: [...c.querySelectorAll('.cr-var-group')].map((g) => ({ label: g.querySelector('.cr-var-label')!.textContent, lb: box(g.querySelector('.cr-var-label')!), btns: [...g.querySelectorAll('button')].map((b) => box(b)), role: g.getAttribute('role'), labelled: g.getAttribute('aria-labelledby') })), overflow: document.documentElement.scrollWidth - window.innerWidth, hasInvert: !!c.querySelector('[data-testid="gal-invert"]'), invertInColours: !!c.querySelector('.cr-var-colours [data-testid="gal-invert"]') };
    });
    // Round AL part 2: the layout's two looks (Arrangement), the colour block when the layout has more than one, the colours
    expect([['Arrangement', 'Colours'], ['Arrangement', 'Colour block', 'Colours']]).toContainEqual(v.groups.map((g: any) => g.label));
    for (const g of v.groups) {
      expect(g.role).toBe('group');
      expect(g.labelled, 'the group is named by its own label').toBeTruthy();
      for (const b of g.btns) expect(b.y, `${g.label}: the buttons are below their own label`).toBeGreaterThan(g.lb.y + g.lb.h - 2);
    }
    expect(v.invertInColours, 'Invert is in the Colours group').toBe(true);
    expect(v.overflow, 'no sideways scroll at 390 px').toBeLessThanOrEqual(0);
    await page.locator('[data-testid^="gallery-controls-"]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'out/round-f/variations-390-spec.png' });

    // F: the only things that stick are the top bar and, below it, the edit bar
    const sticky = await page.evaluate(() => {
      const bar = document.querySelector('header.topbar')!.getBoundingClientRect();
      return { barBottom: bar.bottom, others: [...document.querySelectorAll('*')].filter((e) => { const cs = getComputedStyle(e); return (cs.position === 'sticky' || cs.position === 'fixed') && e.getBoundingClientRect().width > 0 && !e.matches('header.topbar') && !e.matches('aside') && cs.display !== 'none'; }).map((e) => ({ what: e.tagName + '.' + String(e.className).slice(0, 24), top: parseFloat(getComputedStyle(e).top) })) };
    });
    for (const o of sticky.others) expect(o.top, `${o.what} sticks below the top bar`).toBeGreaterThanOrEqual(sticky.barBottom - 1);
    expect(calls(), 'one fake writer call to make the deck, none for the tabs').toBe(1);
  });
});

test('G: the check:specs script exists and is documented next to the other check scripts', async () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  expect(pkg.scripts['check:specs']).toBe('node scripts/check-specs.mjs');
  expect(fs.existsSync('scripts/check-specs.mjs')).toBe(true);
});
