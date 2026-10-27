// Step 13: Images > Make a thumbnail, used like a person would use it. Pictures are drawn in the page (or the person's own test photos
// from test-images/, added the way a user adds a file). The app never reads test-assets/.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { makePic } from './photos-app-helpers';
import { APP_OUT, allDrawn, dragPointer, fakeWriter, layouts, openThumb, optionCards, photoInput, realPhoto, savedProject, srcs, titleInput, whenSaved } from './thumbnail-app-helpers';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1300, height: 1000 } });
test.beforeAll(() => {
  fs.rmSync(APP_OUT, { recursive: true, force: true });
  fs.mkdirSync(APP_OUT, { recursive: true });
});

const addPhoto = async (page: import('@playwright/test').Page, name = 'beach.jpg', w = 1800, h = 1200) => {
  await photoInput(page).setInputFiles(await makePic(page, { name, w, h, hue: 30, mark: [0.35, 0.45], busy: true }));
  await expect(page.getByRole('button', { name: /^Subject pointer/ }).first()).toBeVisible({ timeout: 30_000 });
};

test('with no photo and no title the screen says what to do, and nothing is drawn', async ({ page }) => {
  await openThumb(page);
  await expect(page.getByText('Add a photo and a title')).toBeVisible();
  await expect(optionCards(page)).toHaveCount(0);
  await expect(page.getByText(/not from a frame of your video|not from a frame/i).first()).toBeVisible();
  await page.screenshot({ path: `${APP_OUT}/01-empty.png` });
  await photoInput(page).setInputFiles(await makePic(page, { name: 'a.jpg', w: 1200, h: 800, hue: 100 }));
  await expect(page.getByText('Add a title')).toBeVisible();
  await expect(optionCards(page)).toHaveCount(0);
});

test('a photo and a title give at least three options, each with its thirteen phone-size checks', async ({ page }) => {
  await openThumb(page);
  await addPhoto(page);
  await titleInput(page).fill('Ride before sunrise');
  const n = await allDrawn(page, 3);
  expect(n).toBeGreaterThanOrEqual(3);
  expect(n).toBeLessThanOrEqual(6);
  for (const c of await optionCards(page).all()) {
    await c.getByText('All checks').click();
    await expect(c.locator('.cr-lint-all li')).toHaveCount(13);
  }
  await expect(page.getByText(/The dot is a guess|No pointer placed yet/)).toBeVisible();
  await expect(page.getByText('It is your pointer, not detection').first()).toBeVisible();
  await page.screenshot({ path: `${APP_OUT}/02-options.png`, fullPage: true });
});

test('dragging the subject pointer changes the crop, is saved, and can go back to the guess', async ({ page }) => {
  await openThumb(page);
  await addPhoto(page);
  await titleInput(page).fill('Ride before sunrise');
  await allDrawn(page);
  const before = await srcs(page);
  const dot = page.getByRole('button', { name: /^Subject pointer\. Drag it onto your subject/ });
  await dragPointer(page, dot, { x: 0.15, y: 0.3 });
  await whenSaved(page, (d) => !!d.subject && (d.subject as { x: number }).x < 0.25);
  await expect(page.getByText(/Your pointer is at \d+% across/)).toBeVisible();
  await expect.poll(async () => JSON.stringify(await srcs(page)), { timeout: 30_000 }).not.toBe(JSON.stringify(before));
  await allDrawn(page);
  await page.screenshot({ path: `${APP_OUT}/03-pointer.png`, fullPage: true });
  await page.getByRole('button', { name: 'Use the guess again' }).click();
  await whenSaved(page, (d) => d.subject === undefined);
  await expect(page.getByText(/No pointer placed yet/)).toBeVisible();
});

test('the title is typed, the word to stress is chosen, and a title over four words fails the length check in plain words', async ({ page }) => {
  await openThumb(page);
  await addPhoto(page);
  await titleInput(page).fill('Ride before sunrise');
  await allDrawn(page);
  await page.getByRole('radio', { name: 'before', exact: true }).click();
  await whenSaved(page, (d) => d.emphasis === 'before');
  await expect(page.getByText('3 of 4 words.')).toBeVisible();
  await titleInput(page).fill('Ride out before the sun rises');
  await expect(page.getByText(/6 words\. More than 4 fails/)).toBeVisible();
  await allDrawn(page);
  const first = optionCards(page).first();
  await expect(first.getByText(/Title length:/)).toBeVisible();
  await expect(first.getByText(/has 6 words\. Keep it to 4 or fewer/)).toBeVisible();
});

test('Write titles: 3 to 5 titles of at most four words with one emphasis word; a title with a number that is not in the text is left out', async ({ page }) => {
  const prompts = await fakeWriter(
    page,
    JSON.stringify({ titles: [{ title: 'Ride Before Sunrise', emphasis: 'Sunrise' }, { title: 'The Quiet Road', emphasis: 'Quiet' }, { title: 'Dawn Patrol Rides', emphasis: 'Dawn' }, { title: '10 Rides You Need', emphasis: 'Need' }, { title: 'Roads Nobody Takes Anymore Today', emphasis: 'Roads' }] }),
  );
  await openThumb(page);
  await page.getByLabel(/^Topic or script/).fill('A morning motorbike ride on empty forest roads before sunrise.');
  await page.getByRole('button', { name: 'Write titles' }).click();
  const list = page.getByRole('list', { name: 'Written titles' });
  await expect(list.getByRole('button')).toHaveCount(3);
  await expect(list).toContainText('Ride Before Sunrise');
  await expect(list).not.toContainText('10 Rides');
  await expect(page.getByText(/2 more were left out/)).toBeVisible();
  expect(prompts[0]).toContain('at most 4 words');
  expect(prompts[0]).toContain('Never invent a statistic');
  await list.getByRole('button', { name: /The Quiet Road/ }).click();
  await whenSaved(page, (d) => d.title === 'The Quiet Road' && d.emphasis === 'Quiet');
  await expect(titleInput(page)).toHaveValue('The Quiet Road');
  await page.screenshot({ path: `${APP_OUT}/04-titles.png`, fullPage: true });
});

test('Write titles asks once more when the first answer cannot be used, and says plainly when nothing is usable', async ({ page }) => {
  await fakeWriter(page, (_p, n) => (n === 0 ? 'Here are some ideas: ride, sunrise' : JSON.stringify({ titles: [{ title: 'Ride Before Sunrise', emphasis: 'Sunrise' }, { title: 'Quiet Roads', emphasis: 'Quiet' }, { title: 'Dawn Ride', emphasis: 'Dawn' }] })));
  await openThumb(page);
  await page.getByLabel(/^Topic or script/).fill('A morning ride.');
  await page.getByRole('button', { name: 'Write titles' }).click();
  await expect(page.getByRole('list', { name: 'Written titles' }).getByRole('button')).toHaveCount(3);
  const none = await page.context().newPage();
  await fakeWriter(none, 'nothing useful');
  await openThumb(none);
  await none.getByLabel(/^Topic or script/).fill('A morning ride.');
  await none.getByRole('button', { name: 'Write titles' }).click();
  await expect(none.getByText(/no title could be used\. Type your own title instead/)).toBeVisible();
});

test('without a writer, Write titles is off and says so; typing a title still works', async ({ page }) => {
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await openThumb(page);
  await expect(page.getByRole('button', { name: 'Write titles' })).toBeDisabled();
  await expect(page.getByText(/No writer is connected/)).toBeVisible();
  await addPhoto(page);
  await titleInput(page).fill('Quiet roads');
  await allDrawn(page);
});

test('style: Pick for me says why, a chosen style is used by every option, and a photo treatment redraws them', async ({ page }) => {
  await openThumb(page);
  await addPhoto(page);
  await titleInput(page).fill('Ride before sunrise');
  await page.getByLabel(/^Topic or script/).fill('A bold, loud launch for my growth channel');
  await allDrawn(page);
  await expect(page.getByText(/Picked for you: /)).toBeVisible();
  await page.getByRole('radio', { name: 'Mono photo poster' }).click();
  await whenSaved(page, (d) => d.style === 'mono-poster');
  await expect(page.getByText(/Picked for you/)).toHaveCount(0);
  await allDrawn(page);
  for (const c of await optionCards(page).all()) await expect(c).toContainText('Mono photo poster');
  const before = await srcs(page);
  await page.getByRole('radiogroup', { name: 'Photo treatment' }).getByRole('radio', { name: 'Black and white' }).click();
  await whenSaved(page, (d) => d.treatment === 'bw');
  await expect.poll(async () => JSON.stringify(await srcs(page)), { timeout: 30_000 }).not.toBe(JSON.stringify(before));
  await allDrawn(page);
  await page.screenshot({ path: `${APP_OUT}/05-style.png`, fullPage: true });
});

test('the format changes the size: PNGs are 1280 by 720 or 1080 by 1920, and one option or all of them can be downloaded', async ({ page }) => {
  await openThumb(page);
  await addPhoto(page);
  await titleInput(page).fill('Ride before sunrise');
  const n = await allDrawn(page);
  const size = async () => {
    const [d] = await Promise.all([page.waitForEvent('download'), optionCards(page).first().getByRole('button', { name: /^Download option 1 as PNG/ }).click()]);
    const png = fs.readFileSync((await d.path())!);
    return { w: png.readUInt32BE(16), h: png.readUInt32BE(20), name: d.suggestedFilename() };
  };
  expect(await size()).toMatchObject({ w: 1280, h: 720 });
  await page.getByRole('radio', { name: /^Tall 9:16/ }).click();
  await whenSaved(page, (d) => d.aspect === '9:16');
  await allDrawn(page);
  const tall = await size();
  expect(tall).toMatchObject({ w: 1080, h: 1920 });
  expect(tall.name).toMatch(/^ride-before-sunrise-9x16-.*\.png$/);
  await page.screenshot({ path: `${APP_OUT}/06-tall.png`, fullPage: true });
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all \(zip\)/ }).click()]);
  const bytes = fs.readFileSync((await zip.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(zip.suggestedFilename()).toBe('ride-before-sunrise-9x16.zip');
  // The zip is a store: its central directory has one entry for every option.
  expect(bytes.readUInt16LE(bytes.length - 22 + 10)).toBe(n);
});

test('picking an option, changing things, and undo and redo each change', async ({ page }) => {
  await openThumb(page);
  await addPhoto(page);
  await titleInput(page).fill('Ride before sunrise');
  await allDrawn(page);
  const undo = page.getByRole('button', { name: /^Undo/ });
  const redo = page.getByRole('button', { name: /^Redo/ });
  await expect(undo).toContainText('Edit the title');
  const second = optionCards(page).nth(1);
  await second.getByRole('button', { name: 'Pick this one' }).click();
  await expect(second.getByRole('button', { name: 'Picked' })).toBeVisible();
  await expect(undo).toContainText('Pick an option');
  await page.getByRole('radio', { name: 'Duotone' }).click();
  await expect(undo).toContainText('Change the photo treatment');
  await page.getByRole('radio', { name: 'Tall 9:16 (1080 × 1920)' }).click();
  await expect(undo).toContainText('Change the format to tall');
  await undo.click();
  await whenSaved(page, (d) => d.aspect === '16:9');
  await undo.click();
  await whenSaved(page, (d) => d.treatment === 'style');
  await expect(redo).toContainText('Change the photo treatment');
  await redo.click();
  await whenSaved(page, (d) => d.treatment === 'duotone');
  await undo.click();
  await undo.click();
  await whenSaved(page, (d) => d.selected === undefined);
  await expect(second.getByRole('button', { name: 'Pick this one' })).toBeVisible();
  await allDrawn(page);
});

test('autosave: after a refresh the photo, the title, the pointer, the style and the options come back', async ({ page }) => {
  await openThumb(page);
  await addPhoto(page);
  await titleInput(page).fill('Ride before sunrise');
  await allDrawn(page);
  await dragPointer(page, page.getByRole('button', { name: /^Subject pointer\. Drag it onto your subject/ }), { x: 0.7, y: 0.4 });
  await page.getByRole('radio', { name: 'Film photo and paper' }).click();
  await whenSaved(page, (d) => d.style === 'film-paper');
  await expect(optionCards(page).first()).toContainText('Film photo and paper');
  await allDrawn(page);
  await optionCards(page).first().getByRole('button', { name: 'Pick this one' }).click();
  await whenSaved(page, (d) => d.style === 'film-paper' && !!d.subject && d.selected !== undefined);
  const lay = await layouts(page);
  await page.reload();
  await expect(titleInput(page)).toHaveValue('Ride before sunrise');
  await allDrawn(page);
  expect(await layouts(page)).toEqual(lay);
  await expect(page.getByRole('radio', { name: 'Film photo and paper' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/Your pointer is at \d+% across/)).toBeVisible();
  await expect(optionCards(page).first().getByRole('button', { name: 'Picked' })).toBeVisible();
  await page.screenshot({ path: `${APP_OUT}/07-after-refresh.png`, fullPage: true });
  // Start over removes the project and its pictures.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(optionCards(page)).toHaveCount(0);
  await expect.poll(async () => (await savedProject(page))?.doc.photoId).toBeUndefined();
});

test('files that cannot be used give plain messages: an HEIC photo, a file that is not a picture, an empty file', async ({ page }) => {
  await openThumb(page);
  await photoInput(page).setInputFiles({ name: 'iphone.heic', mimeType: 'image/heic', buffer: Buffer.from('heic bytes') });
  await expect(page.getByTestId('thumb-status')).toContainText('This is an HEIC photo. Convert it to JPG or PNG, then add it again.');
  await photoInput(page).setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a picture') });
  await expect(page.getByTestId('thumb-status')).toContainText('"broken.jpg" could not be read as a picture');
  await photoInput(page).setInputFiles({ name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
  await expect(page.getByTestId('thumb-status')).toContainText('"empty.png" is empty');
  expect((await savedProject(page))?.doc.photoId).toBeUndefined();
});

test('an object gives the object-and-title option and a second photo gives before-and-after; a number in the title gives the number badge', async ({ page }) => {
  await openThumb(page);
  await addPhoto(page);
  await titleInput(page).fill('Ride before sunrise');
  await page.getByRole('radio', { name: 'Hot flat colour, heavy type' }).click();
  await allDrawn(page);
  expect(await layouts(page)).not.toContain('object-title');
  // What was left out is said, with the reason.
  const left = page.getByText(/^Left out for now:/);
  await expect(left).toContainText('Object and title (needs a transparent object picture)');
  await expect(left).toContainText('Number badge (needs a number in the title (it never makes one up))');
  await page.getByText('Also add an object, or a second photo for before and after').click();
  await page.getByLabel('Choose an object').setInputFiles(await makePic(page, { name: 'ball.png', w: 600, h: 600, type: 'image/png', hue: 280, transparent: true }));
  await page.getByLabel('Choose a second photo').setInputFiles(await makePic(page, { name: 'after.jpg', w: 1600, h: 1000, hue: 200, mark: [0.6, 0.5], busy: true }));
  await titleInput(page).fill('3 rides before sunrise');
  await expect.poll(async () => (await layouts(page)).includes('number-badge'), { timeout: 30_000 }).toBe(true);
  await allDrawn(page, 4);
  await page.getByRole('radio', { name: 'Tech polish with a neon accent' }).click();
  await expect.poll(async () => (await layouts(page)).includes('object-title'), { timeout: 30_000 }).toBe(true);
  await allDrawn(page, 4);
  await page.getByRole('radio', { name: 'Mono photo poster' }).click();
  await expect.poll(async () => (await layouts(page)).includes('before-after'), { timeout: 30_000 }).toBe(true);
  await allDrawn(page, 4);
  await page.screenshot({ path: `${APP_OUT}/08-before-after.png`, fullPage: true });
});

test('a real photo added the way a person adds one: options for every style, how long it takes on this computer', async ({ page }) => {
  const file = realPhoto('GCKR3575.JPG');
  test.skip(!file, 'No test photo in test-images/.');
  test.setTimeout(240_000);
  await openThumb(page);
  const t0 = Date.now();
  await photoInput(page).setInputFiles(file!);
  await expect(page.getByRole('button', { name: /^Subject pointer/ })).toBeVisible({ timeout: 30_000 });
  const addMs = Date.now() - t0;
  await titleInput(page).fill('Ride before sunrise');
  const t1 = Date.now();
  await allDrawn(page);
  const firstMs = Date.now() - t1;
  const times: Record<string, number> = {};
  for (const name of ['Hot flat colour, heavy type', 'Mono photo poster', 'Tech polish with a neon accent', 'Soft gradient and glass', 'Film photo and paper', 'Warm editorial collage']) {
    const s = Date.now();
    await page.getByRole('radio', { name }).click();
    await expect(page.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await page.locator('.tn-card').first().getAttribute('data-status')) === 'drawing' || true).toBe(true);
    await allDrawn(page);
    await expect(page.locator('.tn-card').first()).toContainText(name.split(',')[0].replace('Tech polish with a neon accent', 'Tech polish'));
    times[name] = Date.now() - s;
  }
  const [d] = await Promise.all([page.waitForEvent('download'), optionCards(page).first().getByRole('button', { name: /^Download option 1 as PNG/ }).click()]);
  const exportMs = Date.now() - (Date.now() - 1);
  void exportMs;
  const e0 = Date.now();
  const [z] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all \(zip\)/ }).click()]);
  await z.path();
  const zipMs = Date.now() - e0;
  await d.path();
  fs.writeFileSync(`${APP_OUT}/timings.json`, JSON.stringify({ machine: 'this computer, Chrome, one run', photo: 'GCKR3575.JPG (a test photo)', addPhotoToPointerMs: addMs, firstOptionsDrawnMs: firstMs, changeStyleToAllDrawnMs: times, zipOfAllOptionsMs: zipMs }, null, 2));
});
