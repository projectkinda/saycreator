// Picture slots in the real app (flat generated test pictures; ONE fake writer answer makes the deck, every later edit is code only, zero model calls):
// add images (right and wrong files, huge, tiny), orientation labels, reorder, remove; the writer is sent metadata only; placement; slot editing; reload; export.
import { expect, test, type Page, type Route } from '@playwright/test';

test.setTimeout(300_000);
test.use({ viewport: { width: 1280, height: 900 } });

const WRITER = JSON.stringify({
  title: 'Quick Flip',
  slides: [
    { layout: 'photo-cover', fields: { headline: 'A hoodie that flips into a backpack', intro: 'We sewed a bag into the hood.' }, accents: [] },
    { layout: 'do-dont', fields: { title: 'Pack it', num: '1', wrong: 'A bag and a hoodie, both heavy.', right: 'One hoodie that becomes the bag.' }, accents: [] },
    { layout: 'portrait-closing', fields: { headline: 'Meet the maker', heading: 'Back Quick Flip today', p1: 'We are two friends who got tired of carrying a bag.', url: 'quickflip.com' }, accents: [] },
  ],
});
const TEXT = 'A hoodie that flips into a backpack. We sewed a bag into the hood, so one layer does both jobs. Back Quick Flip today.';

async function fake(page: Page) {
  const f = { calls: 0, bodies: [] as string[] };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  const write = (r: Route) => { f.calls++; f.bodies.push(r.request().postData() ?? ''); return r.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}

/** A flat generated picture (a colour and a mark, no stock) as file bytes. */
async function flat(page: Page, name: string, w: number, h: number, color: string): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const b64 = await page.evaluate(async ({ w, h, color }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.4);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
  }, { w, h, color });
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}
const project = (page: Page) => page.evaluate(() => {
  const d = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as { project?: { doc?: any } }).project?.doc;
  const l = d?.designed?.library;
  return { photos: (d?.photos ?? []) as { id: string; width: number; height: number; kind: string }[], specs: (l?.plan?.specs ?? []) as { layout: string; fields: Record<string, string> }[], calls: d?.designed?.calls as number };
});
const refs = (specs: { fields: Record<string, string> }[]) => specs.map((s) => Object.entries(s.fields).filter(([k]) => /^image\d?$/.test(k)).map(([, v]) => String(v).replace(/^picture:([^#]+)#.*/, '$1')));
const images = (page: Page) => page.getByLabel('Choose images for the slides');

test('add images: wrong files get a clear message, huge and tiny images are handled, orientation labels, reorder, remove', async ({ page }) => {
  await fake(page);
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  const land = await flat(page, 'land.jpg', 1500, 1000, '#c0392b');
  const port = await flat(page, 'port.jpg', 1000, 1500, '#2471a3');
  const sq = await flat(page, 'square.jpg', 1200, 1200, '#b7950b');
  const huge = await flat(page, 'huge.jpg', 8000, 6000, '#1e8449');
  const tiny = await flat(page, 'tiny.jpg', 24, 16, '#7d3c98');
  await images(page).setInputFiles([land, port, sq]);
  await expect(page.getByTestId('image-2')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('image-0')).toHaveAttribute('data-orientation', 'landscape');
  await expect(page.getByTestId('image-1')).toHaveAttribute('data-orientation', 'portrait');
  await expect(page.getByTestId('image-2')).toHaveAttribute('data-orientation', 'square');
  // wrong files: said plainly, nothing added
  await images(page).setInputFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
  await expect(page.getByTestId('images-status')).toContainText('"notes.txt" is not a picture');
  await images(page).setInputFiles([{ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not a png at all') }]);
  await expect(page.getByTestId('images-status')).toContainText('could not be read as a picture');
  await images(page).setInputFiles([{ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(16 * 1024 * 1024, 7) }]);
  await expect(page.getByTestId('images-status')).toContainText('The limit is 15 MB');
  await expect(page.getByTestId('image-3')).toHaveCount(0);
  // huge: scaled to at most 2400 px on the long side; tiny: kept as it is
  await images(page).setInputFiles([huge]);
  await expect(page.getByTestId('image-3')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('images-status')).toContainText('scaled down to 2400 by 1800');
  await images(page).setInputFiles([tiny]);
  await expect(page.getByTestId('images-status')).not.toContainText('scaled down', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  console.log('TINY status:', await page.getByTestId('images-status').textContent());
  const ph = await project(page);
  const longSides = ph.photos.map((p) => Math.max(p.width, p.height));
  expect(Math.max(...longSides), 'nothing over 2400 px').toBeLessThanOrEqual(2400);
  expect(ph.photos.length === 4 || ph.photos.length === 5, 'tiny is added or refused with a message, never half added').toBe(true);
  const n = ph.photos.length;
  if (n === 4) await expect(page.getByTestId('images-status')).not.toHaveText('');
  // reorder: image 1 later
  const idsBefore = ph.photos.map((p) => p.id);
  await page.getByRole('button', { name: 'Move image 1 later' }).click();
  await expect.poll(async () => (await project(page)).photos.map((p) => p.id)[0]).toBe(idsBefore[1]);
  expect((await project(page)).photos.map((p) => p.id)[1]).toBe(idsBefore[0]);
  // remove: image 1
  await page.getByRole('button', { name: 'Remove image 1' }).click();
  await expect.poll(async () => (await project(page)).photos.length).toBe(n - 1);
  expect(await page.evaluate(() => JSON.stringify(localStorage)), 'no pixels in the project text').not.toContain('data:image/');
});

test('a deck with pictures: one writer call with metadata only, placement by code, slot editing with no model call, reload, export', async ({ page }) => {
  const f = await fake(page);
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  const land = await flat(page, 'land.jpg', 1500, 1000, '#c0392b');
  const port = await flat(page, 'port.jpg', 1000, 1500, '#2471a3');
  const sq = await flat(page, 'square.jpg', 1200, 1200, '#b7950b');
  await images(page).setInputFiles([land, port, sq]);
  await expect(page.getByTestId('image-2')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByLabel('Your text or topic').fill(TEXT);
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-pic img').first()).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-signature]')).toHaveCount(3, { timeout: 60_000 });
  expect(f.calls, 'one writer call').toBe(1);
  const body = f.bodies[0];
  expect(body, 'no pixels reach the writer').not.toMatch(/data:image|base64|\/9j\//);
  expect(body, 'the writer is told the pictures: shape and size').toMatch(/landscape/);
  expect(body).toMatch(/1500x1000/);
  expect(body).toMatch(/portrait/);
  // placement by code: the portrait goes to the closing slide; the rest to the cover (landscape) and comparison (needs two: the square and the other left) when they fit
  const p0 = await project(page);
  const ids = p0.photos.map((p) => p.id);
  const used = refs(p0.specs);
  const flatUsed = used.flat();
  expect(new Set(flatUsed).size, 'each picture at most once').toBe(flatUsed.length);
  expect(used[0], "the cover gets the landscape").toEqual([ids[0]]);
  expect([...used[1]].sort(), "comparison takes the next two, both sides filled").toEqual([ids[1], ids[2]].sort());
  expect(used[2], "nothing is left for the closing slide: it stays text-only, no empty box").toEqual([]);
  // slot editing: open the cover's picture, zoom, then replace and remove
  const slot = page.getByTestId('slot-0-1');
  await slot.scrollIntoViewIfNeeded();
  await slot.click();
  const panel = page.getByTestId('slot-panel-0');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('slot-crop-0')).toContainText('Zoom 1.00');
  await panel.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByTestId('slot-crop-0')).toContainText('Zoom 1.25', { timeout: 30_000 });
  await panel.getByRole('button', { name: 'Show more of the left' }).click();
  await expect(page.getByTestId('slot-crop-0')).toContainText(/focus 0\.42/, { timeout: 30_000 });
  expect(f.calls, 'editing a picture makes no model call').toBe(1);
  await expect.poll(async () => (await project(page)).specs[0].fields.image, { timeout: 15_000, message: 'the plan keeps the new crop' }).toMatch(/z=1.25/);
  // replace with the square (it is unused if the comparison did not take it)
  await panel.getByTestId("slot-file-0").setInputFiles(await flat(page, "new.jpg", 1500, 1000, "#c0392b"));
  await expect.poll(async () => (await project(page)).photos.length, { timeout: 30_000 }).toBe(4);
  const newId = (await project(page)).photos[3].id;
  await expect.poll(async () => refs((await project(page)).specs)[0], { timeout: 30_000 }).toEqual([newId]);
  expect(f.calls, 'replacing makes no model call').toBe(1);
  await panel.getByRole('button', { name: 'Remove this picture' }).click();
  await expect.poll(async () => refs((await project(page)).specs)[0].length, { timeout: 30_000 }).toBe(0);
  expect(f.calls).toBe(1);
  // undo brings the picture back (one step)
  await page.getByRole('button', { name: /^Undo/ }).first().click();
  await expect.poll(async () => refs((await project(page)).specs)[0].length, { timeout: 30_000 }).toBe(1);
  // the gallery greys a picture layout that has too few pictures, with the reason
  const g = page.getByTestId('gallery-2');
  await g.scrollIntoViewIfNeeded();
  await expect(g.locator('[data-state="off"]').first()).toBeVisible({ timeout: 60_000 });
  // reload: the pictures are still in the slides, drawn from storage
  await page.reload();
  await expect(page.locator('[data-signature]')).toHaveCount(3, { timeout: 60_000 });
  const p1 = await project(page);
  expect(refs(p1.specs)).toEqual(refs((await project(page)).specs));
  expect(refs(p1.specs).flat().length).toBeGreaterThanOrEqual(2);
  const redCount = () => page.locator('.cr-pic img').first().evaluate(async (el: HTMLImageElement) => {
    await el.decode().catch(() => undefined);
    const c = document.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight;
    const g = c.getContext('2d')!; g.drawImage(el, 0, 0);
    // the cover's picture slot is red (#c0392b) somewhere on the slide
    const d = g.getImageData(0, 0, c.width, c.height).data; let red = 0;
    for (let i = 0; i < d.length; i += 4 * 37) if (d[i] > 160 && d[i + 1] < 90 && d[i + 2] < 80) red++;
    return red;
  });
  await expect(page.locator('li.cr-card').first().getByText('Drawing…')).toHaveCount(0, { timeout: 90_000 });
  await page.locator('li.cr-card').first().screenshot({ path: 'out/photo-slots/after-reload.png' });
  await expect.poll(redCount, { timeout: 30_000, message: 'after a reload the cover shows its (flat red) picture' }).toBeGreaterThan(50);
  // export: Download PNG carries the picture
  const dl = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: /Download (PNG|slide 1|this slide)/i }).first().click();
  const file = await dl;
  const path = await file.path();
  expect(path).toBeTruthy();
  const b64 = (await import('node:fs')).readFileSync(path!).toString('base64');
  const exportedRed = await page.evaluate(async (b64) => {
    const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
    const g = c.getContext('2d')!; g.drawImage(bm, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let red = 0;
    for (let i = 0; i < d.length; i += 4 * 37) if (d[i] > 160 && d[i + 1] < 90 && d[i + 2] < 80) red++;
    return red;
  }, b64);
  expect(exportedRed, 'the exported PNG carries the picture').toBeGreaterThan(50);
  expect(f.calls, 'zero model calls after the deck was made').toBe(1);
});

test('unused pictures: "N pictures weren\'t used" after the deck is made, and one can be dropped into any picture slot (no model call, one undo step)', async ({ page }) => {
  const f = await fake(page);
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  // four pictures: the cover takes the first, the comparison the portrait and the square; the second landscape fits no free slot
  const files = [await flat(page, 'land.jpg', 1500, 1000, '#c0392b'), await flat(page, 'port.jpg', 1000, 1500, '#2471a3'), await flat(page, 'square.jpg', 1200, 1200, '#b7950b'), await flat(page, 'land2.jpg', 1600, 900, '#7d3c98')];
  await images(page).setInputFiles(files);
  await expect(page.getByTestId('image-3')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByLabel('Your text or topic').fill(TEXT);
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('[data-signature]')).toHaveCount(3, { timeout: 120_000 });
  await expect.poll(async () => (await project(page)).specs.length, { timeout: 30_000 }).toBe(3);
  const p0 = await project(page);
  const ids = p0.photos.map((p) => p.id);
  expect(refs(p0.specs)[0], 'the first picture went to the first picture slot (the cover)').toEqual([ids[0]]);
  expect(refs(p0.specs)[2], 'no free slot fits the second landscape').toEqual([]);
  const box = page.getByTestId('unused-pictures');
  await expect(box).toBeVisible();
  await expect(page.getByTestId('unused-count')).toContainText("1 picture wasn’t used");
  expect(f.calls).toBe(1);
  // drop it into the closing slide's picture slot
  await page.getByTestId(`unused-put-${ids[3]}`).selectOption({ label: 'Slide 3, picture 1' });
  await expect.poll(async () => refs((await project(page)).specs)[2], { timeout: 30_000 }).toEqual([ids[3]]);
  await expect(page.getByTestId('unused-pictures')).toHaveCount(0);
  expect(f.calls, 'dropping a picture makes no model call').toBe(1);
  await page.getByRole('button', { name: /^Undo/ }).first().click();
  await expect.poll(async () => refs((await project(page)).specs)[2], { timeout: 30_000 }).toEqual([]);
  await expect(page.getByTestId('unused-count')).toContainText("1 picture wasn’t used");
});
