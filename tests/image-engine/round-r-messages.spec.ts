// Round R part 3: the slide-count line says when photo slides filled the slides the text did not need ("You asked for 7 slides. Your text needed 5, so 2 photo slides were added for your
// pictures."), keeps the truthful sentence wording of Round Q, and keeps the order: phone line, slide-count line, sentences notice, pictures notice. Under the pictures line, "Add as photo
// slide" (44 px or taller) puts the unused photos on photo slides before the closing slide with no writer call. A FAKE writer: ZERO real model calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import { toStep } from './ui';

test.setTimeout(6 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const TEXT = "Had a wonderful blast at the Hyderabad event. Thank you Punit Chawla for the crazy day man. Met some wonderful people there. And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun. Looking forward for some more of these going forward. And also don't you forget man Punit Chawla";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const SLIDES5 = [
  S('photo-full-caption', { headline: 'Had a wonderful blast at the Hyderabad event.' }),
  S('lead-statement', { lead: 'Thank you Punit Chawla', headline: 'for the crazy day man.' }),
  S('title-over-photo', { headline: 'Met some wonderful people there.' }),
  S('prose', { p1: 'And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun.', pull: "And also don't you forget man Punit Chawla." }),
  S('cta-button', { headline: 'Looking forward for some more of these going forward.', button: 'Follow for more' }),
];
// the same deck with one sentence on no slide ("Met some wonderful people there.")
const SLIDES4 = [SLIDES5[0], SLIDES5[1], SLIDES5[3], SLIDES5[4]];

async function fake(page: Page, slides: unknown[]) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: JSON.stringify({ title: 'Hyderabad event', slides }), ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
async function addPhotos(page: Page, n: number) {
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (let i = 0; i < n; i++) {
    const b64 = await page.evaluate(async (i) => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 960; const g = c.getContext('2d')!;
      const img = g.createImageData(1280, 960); let seed = 3 + i;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let k = 0; k < img.data.length; k += 4) { const y = Math.floor(k / 4 / 1280); const v = 50 + 140 * (y / 960) + (rnd() - 0.5) * 60; img.data[k] = v * (0.5 + 0.08 * i); img.data[k + 1] = v * 0.85; img.data[k + 2] = v; img.data[k + 3] = 255; }
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }, i);
    files.push({ name: `event${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  }
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(n, { timeout: 60_000 });
  for (let i = 0; i < n; i++) { const chip = page.getByTestId(`image-${i}-content`); if ((await chip.getAttribute('data-content')) === 'screenshot') await chip.click(); }
}
async function make(page: Page, asked: number, keep = true) {
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 2);
  await page.getByTestId('options').getByRole('combobox').first().selectOption(String(asked));
  const sw = page.getByRole('switch', { name: /Keep every sentence/ });
  if ((await sw.getAttribute('aria-checked')) !== String(keep)) await sw.click();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.getByTestId('slide-count-line').or(page.getByTestId('pictures-unused')).or(page.locator('.cr-film li').nth(asked - 1)).first()).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(2000);
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
/** The status lines in page order. */
const order = (page: Page) => page.evaluate(() => {
  const ids = ['slide-count-line', 'not-on-slides', 'pictures-unused'];
  const status = [...document.querySelectorAll('p[role=status]')].find((p) => /phone-size check|pass, /.test(p.textContent ?? ''))!;
  const els = [status, ...ids.map((id) => document.querySelector(`[data-testid="${id}"]`))].filter(Boolean) as Element[];
  return els.every((e, i) => i === 0 || !!(els[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
});

test('R3: the wording in every case (slideCountLine)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const PS: any = await import('/src/carousel/photoSlides.ts');
    const L = (o: any) => PS.slideCountLine(o);
    return {
      photo: L({ asked: 7, total: 7, photo: 2, keep: true, missing: 0 }),
      photoOne: L({ asked: 6, total: 6, photo: 1, keep: true, missing: 0 }),
      photoMissing: L({ asked: 7, total: 7, photo: 3, keep: true, missing: 1 }),
      photoOff: L({ asked: 7, total: 7, photo: 2, keep: false, missing: 1 }),
      none: L({ asked: 5, total: 5, photo: 0, keep: true, missing: 0 }),
      more: L({ asked: 5, total: 7, photo: 0, keep: true, missing: 0 }),
      moreMissing: L({ asked: 5, total: 7, photo: 0, keep: true, missing: 2 }),
      moreOff: L({ asked: 5, total: 7, photo: 0, keep: false, missing: 2 }),
      button: L({ asked: 5, total: 7, photo: 2, keep: true, missing: 0 }),
    };
  });
  expect(r.photo).toBe('You asked for 7 slides. Your text needed 5, so 2 photo slides were added for your pictures.');
  expect(r.photoOne).toBe('You asked for 6 slides. Your text needed 5, so 1 photo slide was added for your pictures.');
  expect(r.photoMissing).toBe('You asked for 7 slides. Your text needed 4, so 3 photo slides were added for your pictures. 1 sentence still did not fit; it is listed below.');
  expect(r.photoOff).toBe('You asked for 7 slides. The writer made 5, so 2 photo slides were added for your pictures.');
  expect(r.none).toBeNull();
  expect(r.more).toBe('Your text needed 7 slides instead of 5 so no sentence is lost.');
  expect(r.moreMissing).toBe('Your text needed 7 slides instead of 5, but 2 sentences still did not fit; they are listed below.');
  expect(r.moreOff).toBe('The writer made 7 slides instead of 5.');
  expect(r.button).toBe('2 photo slides were added for your pictures.');
});

test('R3: photo slides added: the line says so, in order, no pictures line', async ({ page }) => {
  const f = await fake(page, SLIDES5);
  await page.goto('/images/carousel');
  await addPhotos(page, 6);
  await make(page, 7);
  await expect(page.locator('.cr-film img')).toHaveCount(7, { timeout: 60_000 });
  await expect(page.getByTestId('slide-count-line')).toHaveText('You asked for 7 slides. Your text needed 5, so 2 photo slides were added for your pictures.');
  await expect(page.getByTestId('not-on-slides')).toHaveCount(0);
  await expect(page.getByTestId('pictures-unused')).toHaveCount(0);
  expect(await order(page)).toBe(true);
  expect(f.calls).toBe(1);
});

test('R3: some sentences still missing: the photo line keeps the sentence count, the notice lists it, in order', async ({ page }) => {
  const f = await fake(page, SLIDES4);
  await page.goto('/images/carousel');
  await addPhotos(page, 6);
  await make(page, 7);
  const d = await stored(page);
  const photo = d.designed.library.plan.specs.filter((s: any) => s.photoSlide).length;
  const total = d.designed.library.plan.specs.length;
  expect(photo).toBeGreaterThan(0);
  await expect(page.getByTestId('slide-count-line')).toHaveText(`You asked for 7 slides. Your text needed ${total - photo}, so ${photo} photo slide${photo === 1 ? ' was' : 's were'} added for your pictures. 1 sentence still did not fit; it is listed below.`);
  await expect(page.getByTestId('not-on-slides')).toContainText('1 of 6 sentences from your text is not on any slide.');
  expect(await order(page)).toBe(true);
  expect(f.calls).toBe(1);
});

test('R3: none added (no spare slide): no slide-count line; "Add as photo slide" (44 px) puts the unused photos before the closing, no writer call', async ({ page }) => {
  const f = await fake(page, SLIDES5);
  await page.goto('/images/carousel');
  await addPhotos(page, 6);
  await make(page, 5);
  await expect(page.locator('.cr-film img')).toHaveCount(5, { timeout: 60_000 });
  await expect(page.getByTestId('slide-count-line')).toHaveCount(0);
  await expect(page.getByTestId('pictures-unused')).toBeVisible();
  const btn = page.getByTestId('add-photo-slides');
  await expect(btn).toHaveText('Add as photo slide');
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await order(page)).toBe(true);
  const before = await stored(page);
  await btn.click();
  await expect(page.getByTestId('add-photo-slides-msg')).toContainText('photo slide', { timeout: 60_000 });
  await expect(page.locator('.cr-film img')).toHaveCount(before.designed.library.plan.specs.length + 2, { timeout: 60_000 });
  const d = await stored(page);
  const specs = d.designed.library.plan.specs;
  // the photo slides sit just before the closing, which stays last; the writer's slides are unchanged
  expect(specs[specs.length - 1].fields.headline).toBe('Looking forward for some more of these going forward.');
  expect(specs.slice(-3, -1).every((s: any) => s.photoSlide)).toBe(true);
  expect(specs.filter((s: any) => !s.photoSlide).map((s: any) => s.layout)).toEqual(before.designed.library.plan.specs.map((s: any) => s.layout));
  expect(d.script.slides.length).toBe(specs.length);
  await expect(page.getByTestId('pictures-unused')).toHaveCount(0);
  await expect(page.getByTestId('slide-count-line')).toHaveText('2 photo slides were added for your pictures.');
  expect(f.calls, 'no writer call for the button').toBe(1);
});
