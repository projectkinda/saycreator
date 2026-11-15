// Round N part 4a: a tall screenshot (0.62 wide or narrower) is never drawn under 22% of the slide's width by the code, and the Picture picker refuses it there with a plain message.
// list-under-band (21 to 23% whatever the text) never gets one; the other layouts are measured on the slide as drawn. ZERO model calls (a fake writer that counts every call).
import { expect, test, type Page } from '@playwright/test';
import { deckDrawn, openEdit, openTab } from './ui';

test.setTimeout(6 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const SHOT = (id: string) => ({ id, width: 1170, height: 2532, content: 'screenshot' });

test('N4a: placement never gives list-under-band a tall screenshot; the rule moves a too-small one to a layout that draws it at 22% or more, every word kept', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (shots) => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const LIB: any = await import('/src/carousel/layouts/library.ts');
    const IP: any = await import('/src/carousel/imagePlace.ts');
    const PP: any = await import('/src/carousel/picturePass.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const look = { pack: PR.presetPackFor('style-3', false, null), hasPhoto: true, images: shots, site: '' };
    const style = DL.styleFromPack(look.pack).style;
    const ref = (id: string) => `picture:${id}#w=1170&h=2532&fx=0.5&fy=0.1&z=1`;
    const lub = LIB.layoutDef('list-under-band').samples;
    const specs = [
      { layout: 'statement', fields: { headline: 'Three screens from the app' }, accents: [] },
      { layout: 'list-under-band', fields: { ...lub.normal, image: ref('s0') }, accents: [], named: 's0' },
      { layout: 'split-text', fields: { headline: 'Then the style', paragraph: 'Pick a look from fifteen styles.' }, accents: [] },
      { layout: 'photo-cover', fields: { ...LIB.layoutDef('photo-cover').samples.long, image: ref('s1') }, accents: [], named: 's1', pin: { variant: 0 } },
      { layout: 'split-text', fields: { headline: 'And the result', paragraph: 'Slides you can edit, no reruns.' }, accents: [] },
      { layout: 'list-under-band', fields: { ...lub.long, image: ref('s2') }, accents: [], named: 's2' },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post', button: 'Follow for more' }, accents: [] },
    ];
    const sh = await DL.applyPhotoShape(specs, look, style, '@x');
    return {
      placeOne: IP.placeOne('list-under-band', 0, [shots[0]]),
      rows: sh.rows.map((x: any) => ({ slide: x.slide, before: x.before.widthShare, after: x.after.widthShare, layout: x.after.layout, why: x.why })),
      lost: specs.map((s: any, i: number) => (PP.keepsText(IP.withoutImages(s.fields), sh.specs[i].fields) ? null : i + 1)).filter(Boolean),
    };
  }, [SHOT('s0'), SHOT('s1'), SHOT('s2')]);
  expect(r.placeOne, 'list-under-band takes no tall screenshot').toBeNull();
  expect(r.rows.map((x: any) => x.slide)).toEqual([2, 4, 6]);
  for (const x of r.rows) {
    expect(x.before, `slide ${x.slide} starts too small`).toBeLessThan(0.235);
    expect(x.after, `slide ${x.slide}: ${x.why}`).toBeGreaterThanOrEqual(0.22);
    expect(x.layout).not.toBe('list-under-band');
  }
  expect(r.lost).toEqual([]);
});

const PLAN = JSON.stringify({ title: 'The app', slides: [
  { layout: 'statement', fields: { headline: 'Three screens from the app' }, accents: [] },
  { layout: 'photo-cover', fields: { headline: 'The jacket that folds into its own pocket in five seconds', intro: 'We stitched a zip pouch into the lining and wore it for a year on buses, bikes and boats.' }, accents: [] },
  { layout: 'statement', fields: { headline: 'Then the style', caption: 'Pick a look from fifteen styles.' }, accents: [] },
  { layout: 'photo-cover', fields: { headline: 'The hoodie that turns into a backpack in ten seconds', intro: 'We sewed a waterproof bag into the hood and tested it for two years on trains and planes.' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'And the result', paragraph: 'Slides you can edit, no reruns.' }, accents: [] },
  { layout: 'cta-button', fields: { headline: 'Try it on your next post', button: 'Follow for more' }, accents: [] },
] });

async function tallPng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 585; c.height = 1266; const g = c.getContext('2d')!;
    g.fillStyle = '#f4f4f6'; g.fillRect(0, 0, 585, 1266); g.fillStyle = '#222'; g.font = '28px sans-serif';
    for (let y = 80; y < 1200; y += 70) { g.fillText('Settings row ' + y, 40, y); g.fillStyle = '#5b5bd6'; g.fillRect(420, y - 26, 120, 34); g.fillStyle = '#222'; }
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
    const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
  });
  return Buffer.from(b64, 'base64');
}

test('N4a: the Picture picker refuses a tall screenshot for a slide that would draw it under 22% wide, with the plain message, and the slide is unchanged (0 writer calls after the deck)', async ({ page }) => {
  const calls: string[] = [];
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const w = (r: any) => { calls.push('write'); return r.fulfill({ json: { text: PLAN, ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  await page.goto('/images/carousel');
  await page.getByLabel('Choose images for the slides').setInputFiles({ name: 'settings-phone.png', mimeType: 'image/png', buffer: await tallPng(page) });
  await page.getByTestId('image-0').waitFor({ timeout: 60_000 });
  await expect(page.getByTestId('image-0-content')).toHaveAttribute('data-content', 'screenshot');
  await page.getByLabel('Your text or topic').fill('Three screens from the app. The jacket that folds into its own pocket in five seconds. We stitched a zip pouch into the lining and wore it for a year on buses, bikes and boats. Then the style: pick a look from fifteen styles. The hoodie that turns into a backpack in ten seconds. We sewed a waterproof bag into the hood and tested it for two years on trains and planes. And the result: slides you can edit, no reruns. Try it on your next post.');
  await page.locator('.cr-wiz-steps button').nth(2).click();
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 6);
  await page.waitForTimeout(1200);
  const made = calls.length;
  const doc = () => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
  const d0 = await doc();
  // a photo-cover slide with no picture yet, put in its first variant with the Layout tab (as a person would): with its long text a tall screenshot would be drawn at 17% of the width there
  const i = (d0.designed.library.plan.specs as any[]).findIndex((s) => s.layout === 'photo-cover' && !/picture:/.test(JSON.stringify(s.fields)));
  expect(i, 'the long photo-cover slide is in the deck: ' + d0.designed.library.layouts.join(',') + ' variants ' + d0.designed.library.variants.join(',') + ' pins ' + JSON.stringify(d0.designed.library.plan.specs.map((s: any) => s.pin ?? null))).toBeGreaterThan(0);
  await openTab(page, 'Layout', i + 1);
  if ((await page.getByTestId('gal-photo-cover-0').getAttribute('data-state')) !== 'current') await page.getByTestId('gal-photo-cover-0').click();
  await expect(page.getByTestId('gal-photo-cover-0')).toHaveAttribute('data-state', 'current', { timeout: 30_000 });
  await page.waitForTimeout(800);
  const before = JSON.stringify((await doc()).designed.library.plan.specs[i]);
  await openTab(page, 'Pictures', i + 1);
  await page.getByTestId(`pick-${i}-0`).click();
  const msg = page.getByTestId(`pick-${i}-msg`);
  await expect(msg).not.toHaveText('', { timeout: 30_000 });
  const text = (await msg.textContent()) ?? '';
  const d1 = await doc();
  const after = d1.designed.library.plan.specs[i];
  expect(text, 'the refusal').toMatch(/too small in this layout/);
  if (/too small in this layout/.test(text)) {
    expect(text).toContain('A tall screenshot is too small in this layout; try Split or Phone frame.');
    expect(JSON.stringify(after), 'the slide is unchanged').toBe(before);
  } else {
    // the picker put it somewhere: then it is drawn at 22% of the width or more
    const im = d1.designed.slides[String(i)].built.images[0];
    expect(im, text).toBeTruthy();
    const r: any = await page.evaluate(async (im) => (await import('/src/carousel/photoShape.ts')).photoFitOf([im], im.src.slice(8).split('#')[0], '', 0), im);
    expect(r.widthShare, `${after.layout}: ${text}`).toBeGreaterThanOrEqual(0.22);
  }
  expect(calls.length, 'the pick made no writer call').toBe(made);
});
