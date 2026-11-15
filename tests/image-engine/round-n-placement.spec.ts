// Round N part 1: the photo shape rule (photoShape.ts), ZERO model calls.
//  - a portrait photo is never drawn whole with bars when a layout exists that shows it at least 15% larger within the 25% crop budget and keeps every word;
//  - a photo that already fits is not touched, a screenshot is never moved, a layout the person chose in the Layout tab and a picture they picked are never changed;
//  - no word is ever lost;
//  - the app route (the pasted 8-block post with the real test photos, when they are on this computer): every photo slide either fills its slot within the budget, covers 55% of it drawn
//    whole, or no layout that keeps its words shows it larger; 0 writer calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(4 * 60_000);
const POST = fs.readFileSync('tests/image-engine/script-route.spec.ts', 'utf8').match(/export const POST = `([\s\S]*?)`;/)![1];
const DIR = process.env.REAL_PICTURES_DIR ?? 'out/test-pictures';

test('N1: the rule on a deck: a portrait photo drawn whole moves to a layout that shows it larger, every word kept; fits, screenshots and the person\'s choices stay', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const PS: any = await import('/src/carousel/photoShape.ts');
    const PP: any = await import('/src/carousel/picturePass.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts');
    await fonts.loadFonts();
    const images = [
      { id: 'portrait', width: 960, height: 1280, content: 'photo' },
      { id: 'wide', width: 1225, height: 689, content: 'photo' },
      { id: 'shot', width: 1440, height: 900, content: 'screenshot' },
      { id: 'portrait2', width: 960, height: 1280, content: 'photo' },
      { id: 'portrait3', width: 960, height: 1280, content: 'photo' },
    ];
    const ref = (id: string, extra = '') => { const p = images.find((q) => q.id === id)!; return IM.makeRef({ id, w: p.width, h: p.height, ...(p.content === 'photo' ? { photo: true } : {}) }) + extra; };
    const look = { pack: PR.presetPackFor('editorial-collage', false, null), hasPhoto: true, images, site: '' };
    const style = DL.styleFromPack(look.pack).style;
    // each layout's own field names: art-side-text heading + paragraph, photo-cover headline + intro, headline-body-image headline + body
    const KEYS: Record<string, [string, string]> = { 'art-side-text': ['heading', 'paragraph'], 'photo-cover': ['headline', 'intro'], 'headline-body-image': ['headline', 'body'] };
    const H = (headline: string, body: string, layout: string, image: string, more: Record<string, unknown> = {}) => ({ layout, fields: { [KEYS[layout][0]]: headline, [KEYS[layout][1]]: body, image }, accents: [], ...more });
    const specs = [
      { layout: 'statement', fields: { headline: 'Mornings on the motorbike' }, accents: [] },
      // (each photo stays on its slide as a NAMED picture does: the placement leaves it; the rule still looks at it)
      // 2: a portrait photo in art-side-text, drawn whole on a small part of its slot
      H('The road opens up', 'Past the trees the sky is wide.', 'art-side-text', ref('portrait'), { named: 'portrait' }),
      { layout: 'numbered-list', fields: { title: 'What I pack', items: ['Water', 'A jacket', 'Gloves'] }, accents: [] },
      // 4: a landscape photo in a wide slot: already the best fit
      H('Near the coast', 'The light changes over the palms.', 'headline-body-image', ref('wide'), { named: 'wide' }),
      { layout: 'split-text', fields: { headline: 'Slow down', paragraph: 'The road is narrow here.' }, accents: [] },
      // 6: a wide screenshot drawn whole: never moved by this rule
      H('The route I use', 'Saved in my maps app.', 'photo-cover', ref('shot'), { named: 'shot' }),
      // 7: the same as slide 2, but the person chose its layout in the Layout tab
      H('Back home by eight', 'The whole day feels lighter.', 'art-side-text', ref('portrait2'), { pin: { layout: true } }),
      // 8: the same again, but the person picked its picture
      H('Before the city wakes', 'The streets are still empty.', 'art-side-text', ref('portrait3'), { pin: { picture: 'portrait3' } }),
      { layout: 'cta-button', fields: { headline: 'Try a morning ride this week', button: 'Follow for more' }, accents: [] },
    ];
    const sh = await DL.applyPhotoShape(specs, look, style, '@x');
    const lost = specs.map((s: any, i: number) => (PP.keepsText(s.fields, sh.specs[i].fields) ? null : i + 1)).filter(Boolean);
    return { layouts: sh.specs.map((s: any) => s.layout), pins: sh.specs.map((s: any) => s.pin ?? null), rows: sh.rows, swaps: sh.swaps, lost, budget: PS.PHOTO_CROP_BUDGET ?? 0.25 };
  });
  const row = (n: number) => r.rows.find((x: any) => x.slide === n);
  // slide 2: drawn whole before; after: not whole, within the budget, at least 15% larger
  expect(row(2).before.whole, 'slide 2 starts drawn whole').toBe(true);
  expect(row(2).after.whole, JSON.stringify(row(2))).toBe(false);
  expect(row(2).after.crop).toBeLessThanOrEqual(0.25 + 1e-6);
  expect(row(2).after.slideShare).toBeGreaterThanOrEqual(row(2).before.slideShare * 1.15);
  expect(r.layouts[1]).not.toBe('art-side-text');
  // slide 4: the landscape photo already fills its wide slot: untouched
  expect(r.layouts[3]).toBe('headline-body-image');
  expect(row(4).why).toMatch(/^kept/);
  // slide 6: a screenshot is never moved by this rule (no row at all)
  expect(r.layouts[5]).toBe('photo-cover');
  expect(row(6)).toBeUndefined();
  // slides 7 and 8: the person's layout and the person's picture
  expect(r.layouts[6]).toBe('art-side-text');
  expect(r.layouts[7]).toBe('art-side-text');
  expect(row(7)).toBeUndefined();
  expect(row(8)).toBeUndefined();
  // no word lost anywhere; at most 2 moved slides in one layout
  expect(r.lost).toEqual([]);
  const to: Record<string, number> = {};
  for (const w of r.swaps) to[w.to] = (to[w.to] ?? 0) + 1;
  expect(Math.max(0, ...Object.values(to))).toBeLessThanOrEqual(2);
});

test('N1: the measurement: a portrait photo in a wide slot is drawn whole on less than half of it; in a tall slot it fills it within the budget', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const PS: any = await import('/src/carousel/photoShape.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const p = IM.makeRef({ id: 'p', w: 960, height: 1280, h: 1280, photo: true });
    const wide = PS.photoFitOf([{ src: p, x: 0, y: 100, w: 1080, h: 675, rx: 0 }], 'p', 'x', 0);
    const tall = PS.photoFitOf([{ src: p, x: 0, y: 100, w: 600, h: 1000, rx: 0 }], 'p', 'x', 0);
    return { wide, tall, keepWide: PS.looksRight(wide), keepTall: PS.looksRight(tall) };
  });
  expect(r.wide.whole).toBe(true);
  expect(r.wide.slotShare).toBeCloseTo(0.469, 2);
  expect(r.keepWide).toBe(false);
  expect(r.tall.whole).toBe(false);
  expect(r.tall.crop).toBeCloseTo(0.2, 2);
  expect(r.keepTall).toBe(true);
});

test('N1: the app route with the real photos: every photo slide looks right or nothing better keeps its words; 0 writer calls', async ({ page }) => {
  const files = ['sky-tower.jpg', 'motorbike-street.jpg', 'sunrays-palms.jpg', 'tree-road.jpg', 'landscape-crop.jpg', 'tall-crop.jpg'].map((f) => path.join(DIR, f));
  test.skip(!files.every((f) => fs.existsSync(f)), 'the real test photos are not on this computer');
  let calls = 0;
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false } }));
  await page.route('**/__carousel/write', (x) => { calls++; return x.abort(); });
  await page.route('**/api/carousel/write', (x) => { calls++; return x.abort(); });
  await page.goto('/images/carousel');
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await page.getByTestId(`image-${files.length - 1}`).waitFor({ timeout: 60_000 });
  for (let i = 0; i < files.length; i++) {
    const chip = page.getByTestId(`image-${i}-content`);
    if ((await chip.getAttribute('data-content')) === 'screenshot') await chip.click();
  }
  await page.getByLabel('Your text or topic').fill(POST);
  await page.getByTestId('text-mode').getByRole('radio', { name: /Use my paragraphs as slides/ }).check();
  await page.locator('.cr-wiz-steps button').nth(2).click();
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.cr-film img').length >= 7, null, { timeout: 120_000 });
  const r: any = await page.evaluate(async () => {
    const PS: any = await import('/src/carousel/photoShape.ts');
    const doc = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc;
    const lib = doc.designed.library;
    const fits = Object.entries(doc.designed.slides).flatMap(([i, s]: [string, any]) => (s.built.images ?? []).map((im: any) => ({ slide: Number(i) + 1, fit: PS.photoFitOf(s.built.images, im.src.slice(8).split('#')[0], lib.layouts[Number(i)], 0) })));
    return { fits, rows: lib.photoShape ?? [], swaps: lib.pictureSwaps ?? [] };
  });
  expect(calls).toBe(0);
  expect(r.rows.length, 'the rule looked at the photo slides').toBeGreaterThan(0);
  expect(r.rows.some((x: any) => /^moved/.test(x.why)), 'one photo drawn whole on a small part of its slot moved: ' + JSON.stringify(r.rows.map((x: any) => x.why))).toBe(true);
  for (const f of r.fits.filter((x: any) => x.fit && /photo/.test(x.fit.layout + 'photo'))) {
    const row = r.rows.find((x: any) => x.slide === f.slide);
    const ok = f.fit.whole ? f.fit.slotShare >= 0.55 || /no layout that keeps every word/.test(row?.why ?? '') : f.fit.crop <= 0.25 + 1e-6;
    expect(ok, `slide ${f.slide}: ${JSON.stringify(f.fit)} ${row?.why ?? ''}`).toBe(true);
  }
});
