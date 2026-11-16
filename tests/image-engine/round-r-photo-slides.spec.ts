// Round R part 1: photo slides. When the writer made fewer slides than the person asked for and photos are still unused after every placement pass, the code adds picture-only slides for
// them (photo-full, photo-pair, photo-quad): never more than the slides that were not made, never past the platform's cap or 10, never slide 1, never after the closing, no text on them, every
// word of the text still on the slides, a screenshot never put on one. With "Keep every sentence" OFF the count stays exactly N. A FAKE writer: ZERO real model calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import { openEdit, toStep } from './ui';

test.setTimeout(6 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
// the user's real run (a 63-word thank-you post, 6 landscape photos, 7 slides asked, the writer made 5)
const TEXT = "Had a wonderful blast at the Hyderabad event. Thank you Punit Chawla for the crazy day man. Met some wonderful people there. And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun. Looking forward for some more of these going forward. And also don't you forget man Punit Chawla";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const PLAN5 = { title: 'Hyderabad event', slides: [
  S('photo-full-caption', { headline: 'Had a wonderful blast at the Hyderabad event.' }),
  S('lead-statement', { lead: 'Thank you Punit Chawla', headline: 'for the crazy day man.' }),
  S('title-over-photo', { headline: 'Met some wonderful people there.' }),
  S('prose', { p1: 'And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun.', pull: "And also don't you forget man Punit Chawla." }),
  S('cta-button', { headline: 'Looking forward for some more of these going forward.', button: 'Follow for more' }),
] };
const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

async function fake(page: Page) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: JSON.stringify(PLAN5), ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
/** n landscape 1280 x 960 photo-like JPEGs; the first `named` get a name. */
async function addPhotos(page: Page, n: number, named: number) {
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (let i = 0; i < n; i++) {
    const b64 = await page.evaluate(async (i) => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 960; const g = c.getContext('2d')!;
      const img = g.createImageData(1280, 960); let seed = 7 + i;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let k = 0; k < img.data.length; k += 4) { const y = Math.floor(k / 4 / 1280); const v = 50 + 140 * (y / 960) + (rnd() - 0.5) * 60; img.data[k] = v * (0.5 + 0.08 * i); img.data[k + 1] = v * 0.85; img.data[k + 2] = v; img.data[k + 3] = 255; }
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }, i);
    files.push({ name: `event${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  }
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(n, { timeout: 60_000 });
  for (let i = 0; i < n; i++) {
    const chip = page.getByTestId(`image-${i}-content`);
    if ((await chip.getAttribute('data-content')) === 'screenshot') await chip.click();
    if (i < named) { const box = page.getByTestId(`image-${i}-label`); await box.fill(`event photo ${i + 1}`); await box.blur(); }
  }
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);

test('R1: the user\'s deck (7 asked, 5 made, 6 photos): photo slides fill the 2 spare slides, every photo used, no text on them, closing last, every word kept; a style and a colour switch keep them with no call', async ({ page }) => {
  const f = await fake(page);
  await page.goto('/images/carousel');
  await addPhotos(page, 6, 4);
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 2);
  await page.getByTestId('options').getByRole('combobox').first().selectOption('7');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(7, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const look = async (what: string) => {
    const d = await stored(page);
    const lib = d.designed.library;
    const specs = lib.plan.specs;
    expect(specs.length, `${what}: never more than the 7 asked`).toBe(7);
    expect(lib.slidesRequested).toBe(7);
    const photoSlides = specs.map((s: any, i: number) => ({ s, i })).filter(({ s }: any) => s.photoSlide);
    expect(photoSlides.length, `${what}: the 2 spare slides`).toBe(2);
    for (const { s, i } of photoSlides) {
      expect(['photo-full', 'photo-pair', 'photo-quad']).toContain(s.layout);
      expect(i, 'never slide 1').toBeGreaterThan(0);
      expect(i, 'never after the closing').toBeLessThan(specs.length - 1);
      expect(Object.keys(s.fields).filter((k) => !/^image\d?$/.test(k)), `${what}: no text field on slide ${i + 1}`).toEqual([]);
      // drawn: no text but the page chrome (the handle, the counter, the footer)
      const layers = d.designed.slides[String(i)].built.layers;
      const texts = layers.filter((l: any) => l.kind === 'text' && l.visible !== false && String(l.text ?? '').trim() && l.name !== 'recurring');
      expect(texts.map((l: any) => l.text), `${what}: no words on photo slide ${i + 1}`).toEqual([]);
    }
    // the closing stays last, the writer's first slide keeps its photo
    expect(specs[specs.length - 1].fields.headline).toBe('Looking forward for some more of these going forward.');
    // the closing takes no picture, and (the text asks for no action) no button
    expect(JSON.stringify(specs[specs.length - 1].fields)).not.toMatch(/picture:|Follow for more/);
    // every photo is on a slide
    const used = new Set(JSON.stringify(specs.map((s: any) => s.fields)).match(/picture:[^#"]+/g)!.map((x: string) => x.slice(8)));
    for (const p of d.photos) expect(used.has(p.id), `photo ${p.label ?? p.id} is on a slide`).toBe(true);
    // every word of the text is on a slide
    const have = specs.map((s: any) => Object.entries(s.fields).filter(([k]) => !/^image\d?$/.test(k)).map(([, v]) => String(v)).join(' ')).join(' ');
    const hw = new Set(words(have));
    expect(words(TEXT).filter((w) => !hw.has(w)), `${what}: words of the text not on a slide`).toEqual([]);
    return { d, photoSlides };
  };
  const a = await look('as made');
  await expect(page.getByTestId('pictures-unused')).toHaveCount(0);
  // report.json: photoSlidesAdded
  const rep = await page.evaluate(async () => {
    const RP: any = await import('/src/reference/report.ts');
    const d = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc;
    return JSON.parse((await RP.buildReport({ doc: d, includeRefs: false, verdicts: {}, note: '' })).json).photoSlidesAdded;
  });
  expect(rep.count).toBe(2);
  expect(rep.slides.map((s: any) => s.slide)).toEqual(a.photoSlides.map((p: any) => p.i + 1));
  expect(rep.slides.flatMap((s: any) => s.pictures).length).toBe(4);
  // a normal slide: Edit slides shows it, with the picture picker
  await openEdit(page, a.photoSlides[0].i + 1);
  await expect(page.getByTestId(`pick-${a.photoSlides[0].i}-0`)).toBeVisible();
  await page.getByTestId('edit-view').getByRole('button', { name: /^Done/ }).first().click().catch(() => {});
  // a style and a colour switch: the photo slides stay, no call
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Cream ink/ }).first().click();
  await page.waitForTimeout(2500);
  await page.getByTestId('combo-teal-coral').click();
  await page.waitForTimeout(2500);
  await expect(page.locator('.cr-film img')).toHaveCount(7);
  await look('after a style and a colour switch');
  expect(f.calls, 'one writer call, for the deck').toBe(1);
});

test('R1: no spare slides, OFF, one spare slide, a screenshot, the platform cap: never past what was asked, never a screenshot on a photo slide', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async ({ TEXT, PLAN5 }) => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const FA: any = await import('/src/reference/faithful.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const pic = (w: number, h: number, i: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.fillStyle = `hsl(${i * 50},40%,45%)`; g.fillRect(0, 0, w, h); g.fillStyle = '#eee'; g.fillRect(w * 0.2, h * 0.2, w * 0.3, h * 0.2); return c.toDataURL('image/jpeg', 0.9); };
    const data: Record<string, string> = {};
    FA.setPictureResolver(async (ref: string) => data[ref.slice('picture:'.length).split('#')[0]] ?? null);
    const photos = (n: number, key: string) => Array.from({ length: n }, (_, i) => { const id = `${key}${i}`; data[id] = pic(1280, 960, i); return { id, width: 1280, height: 960, content: 'photo' as const }; });
    const plan7 = { title: 'x', slides: [...PLAN5.slides.slice(0, 4), { layout: 'statement', fields: { headline: 'Met some wonderful people there again.' }, accents: [] }, { layout: 'statement-card', fields: { headline: 'Thank you Punit Chawla.' }, accents: [] }, PLAN5.slides[4]] };
    const run = async (plan: any, slides: number, keep: boolean, images: any[], slidesMax?: number) => {
      let calls = 0;
      const p = { id: 'fake', write: async () => { calls++; return { text: JSON.stringify(plan), ms: 5 }; } };
      const look = { pack: PR.presetPackFor('style-1', false, null), hasPhoto: true, images, site: '' };
      const out = await DL.designLibraryDeck({ text: TEXT, slides, tone: 'clear', format: 'carousel', keepEverySentence: keep, ...(slidesMax ? { slidesMax } : {}) }, look, '@saycreator', p, new AbortController().signal);
      const specs = out.designed.library.plan.specs;
      return { calls, n: specs.length, layouts: specs.map((s: any) => s.layout), photo: specs.map((s: any) => !!s.photoSlide), ids: specs.map((s: any) => JSON.stringify(s.fields).match(/picture:[^#"]+/g)?.map((x: string) => x.slice(8)) ?? []), added: out.designed.library.photoSlidesAdded ?? null, last: specs[specs.length - 1].fields.headline };
    };
    // the screenshot: a desktop screenshot (wide) among five photos
    data.shot = pic(1600, 1000, 9);
    const withShot = [...photos(5, 's'), { id: 'shot', width: 1600, height: 1000, content: 'screenshot' as const }];
    return {
      none: await run(plan7, 7, true, photos(6, 'a')),
      off: await run(PLAN5, 5, false, photos(6, 'b')),
      one: await run(PLAN5, 6, true, photos(3, 'c')),
      shot: await run(PLAN5, 7, true, withShot),
      many: await run(PLAN5, 7, true, photos(9, 'd')),
      cap: await run(PLAN5, 7, true, photos(6, 'e'), 6),
    };
  }, { TEXT, PLAN5 });
  // 7 asked, 7 made: no spare slide, no photo slide
  expect(r.none.n).toBe(7);
  expect(r.none.photo.filter(Boolean).length).toBe(0);
  // OFF, 5 asked, 5 made: exactly 5
  expect(r.off.n).toBe(5);
  expect(r.off.photo.filter(Boolean).length).toBe(0);
  // one spare slide, 3 photos (2 on the writer's slides): one photo slide for the third photo
  expect(r.one.n).toBe(6);
  expect(r.one.photo.filter(Boolean).length).toBe(1);
  expect(new Set(r.one.ids.flat()).size).toBe(3);
  // a screenshot is never put on a photo slide (and never moved)
  r.shot.ids.forEach((ids: string[], i: number) => { if (r.shot.photo[i]) expect(ids).not.toContain('shot'); });
  expect(r.shot.n).toBeLessThanOrEqual(7);
  // 9 photos and 2 spare slides: never more than 7 slides
  expect(r.many.n).toBeLessThanOrEqual(7);
  expect(r.many.photo.filter(Boolean).length).toBeLessThanOrEqual(2);
  // the platform cap (6) bounds the photo slides too
  expect(r.cap.n).toBeLessThanOrEqual(6);
  for (const k of ['none', 'off', 'one', 'shot', 'many', 'cap']) {
    expect(r[k].calls, `${k}: one (fake) writer call`).toBe(1);
    expect(r[k].last, `${k}: the closing stays last`).toBe('Looking forward for some more of these going forward.');
    expect(r[k].photo[0], `${k}: never slide 1`).toBe(false);
    if (r[k].added) expect(r[k].added.count).toBe(r[k].photo.filter(Boolean).length);
  }
});
