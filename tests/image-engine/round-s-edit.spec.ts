// Round S part 1: "Remove slide", "Move up", "Move down" in Edit slides. The person's own choice: the slide goes or swaps with its neighbour, every other slide keeps its layout, fields,
// accents and pictures; the page numbers and the position-based rhythm follow the new order; one Undo (the project's own undo) puts the deck back exactly; the edit lives in the stored plan,
// so a style, colour or brand switch and a reload keep it. A FAKE writer: ZERO real model calls, and no writer call for any of these actions.
import { expect, test, type Page, type Route } from '@playwright/test';
import { toStep } from './ui';

test.setTimeout(8 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const TEXT = "Had a wonderful blast at the Hyderabad event. Thank you Punit Chawla for the crazy day man. Met some wonderful people there. And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun. Looking forward for some more of these going forward. And also don't you forget man Punit Chawla";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const SLIDES5 = [
  S('photo-full-caption', { headline: 'Had a wonderful blast at the Hyderabad event.' }),
  S('lead-statement', { lead: 'Thank you Punit Chawla', headline: 'for the crazy day man.' }),
  S('title-over-photo', { headline: 'Met some wonderful people there.' }),
  S('prose', { p1: 'And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun.', pull: "And also don't you forget man Punit Chawla." }),
  S('statement-card', { headline: 'Looking forward for some more of these going forward.' }),
];
const SLIDES3 = [SLIDES5[1], SLIDES5[3], SLIDES5[4]];

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
    files.push({ name: `event photo ${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  }
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(n, { timeout: 60_000 });
  for (let i = 0; i < n; i++) { const chip = page.getByTestId(`image-${i}-content`); if ((await chip.getAttribute('data-content')) === 'screenshot') await chip.click(); }
}
async function make(page: Page, asked: number, style = 'Cream ink') {
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 2);
  await page.getByTestId('options').getByRole('combobox').first().selectOption(String(asked));
  const sw = page.getByRole('switch', { name: /Keep every sentence/ });
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: new RegExp(style) }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film li').nth(asked - 1)).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(2000);
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
const words = (d: any) => d.designed.library.plan.specs.map((s: any) => JSON.stringify(s.fields));
const same = (s: any) => JSON.stringify({ layout: s.layout, fields: s.fields, accents: s.accents, pin: s.pin ?? null, photoSlide: !!s.photoSlide });
/** Every drawn slide's text layers, joined. */
const textOf = (d: any, k: number) => (d.designed.slides[String(k)]?.built?.layers ?? []).filter((l: any) => l.kind === 'text').map((l: any) => l.text).join(' | ');
async function openEdit(page: Page, slide: number) {
  if (!(await page.getByTestId('arrange-box').isVisible().catch(() => false))) await page.getByTestId('edit-slides').click();
  await page.getByRole('button', { name: `Show slide ${slide}`, exact: true }).click();
  await expect(page.getByRole('group', { name: `Arrange slide ${slide}` })).toBeVisible();
}
async function settle(page: Page, n: number) {
  await expect.poll(async () => (await stored(page))?.designed?.library?.plan?.specs.length, { timeout: 60_000 }).toBe(n);
  await expect(page.locator('.cr-film li')).toHaveCount(n);
  await page.waitForTimeout(1200);
}
const report = (page: Page) => page.evaluate(async () => {
  const RP: any = await import('/src/reference/report.ts');
  const doc = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project.doc;
  return JSON.parse((await RP.buildReport({ doc, includeRefs: false, verdicts: {}, note: '' })).json);
});

test('S1 order rules: remove, move up and down, the fewest slides, the record and the labels', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const E: any = await import('/src/carousel/slideEdit.ts');
    return {
      remove: E.arrangeOrder(5, 2, { kind: 'remove' }, 3), up: E.arrangeOrder(5, 2, { kind: 'move', by: -1 }, 3), down: E.arrangeOrder(5, 2, { kind: 'move', by: 1 }, 3),
      firstUp: E.arrangeOrder(5, 0, { kind: 'move', by: -1 }, 3), lastDown: E.arrangeOrder(5, 4, { kind: 'move', by: 1 }, 3),
      minCarousel: E.arrangeOrder(3, 1, { kind: 'remove' }, 3), lastCard: E.arrangeOrder(1, 0, { kind: 'remove' }, 1), twoCards: E.arrangeOrder(2, 1, { kind: 'remove' }, 1),
      keys: E.remapKeys({ '0': 'a', '2': 'c', '3': 'd' }, [0, 1, 3, 4]),
      rec: E.recordEdit(E.recordEdit(undefined, 3, { kind: 'remove' }, 'prose', ['x']), 5, { kind: 'move', by: -1 }, 'statement'),
      labels: [E.arrangeLabel(3, { kind: 'remove' }), E.arrangeLabel(0, { kind: 'move', by: 1 })],
    };
  });
  expect(r.remove).toEqual([0, 1, 3, 4]);
  expect(r.up).toEqual([0, 2, 1, 3, 4]);
  expect(r.down).toEqual([0, 1, 3, 2, 4]);
  expect(r.firstUp).toBe('The first slide cannot move up.');
  expect(r.lastDown).toBe('The last slide cannot move down.');
  expect(r.minCarousel).toBe('A carousel needs at least 3 slides, so no slide can be removed.');
  expect(r.lastCard).toBe('This is the only slide left, so it cannot be removed.');
  expect(r.twoCards).toEqual([0]);
  expect(r.keys).toEqual({ '0': 'a', '2': 'd' });
  expect(r.rec).toEqual({ removed: [{ slide: 4, layout: 'prose', sentences: ['x'] }], moved: [{ from: 6, to: 5 }] });
  expect(r.labels).toEqual(['Remove slide 4', 'Move slide 1 down']);
});

test('S1 remove a middle slide: count, page numbers, footers and report.json renumber; the other slides are unchanged; one Undo puts it back exactly; 0 writer calls', async ({ page }) => {
  const f = await fake(page, SLIDES5);
  await page.goto('/images/carousel');
  await make(page, 5);
  const made = f.calls; // the writer's call(s) for the deck: a picture layout with no picture gets one retry
  const before = await stored(page);
  expect(before.designed.library.plan.specs.length).toBe(5);
  await openEdit(page, 3);
  const rm = page.getByRole('button', { name: 'Remove slide 3', exact: true });
  for (const name of ['Remove slide 3', 'Move slide 3 up', 'Move slide 3 down']) expect((await page.getByRole('button', { name, exact: true }).boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
  await rm.click();
  await settle(page, 4);
  const d = await stored(page);
  // the other slides: the same layout, fields, accents (in order); only slide 3 went
  const kept = before.designed.library.plan.specs.filter((_: any, k: number) => k !== 2).map(same);
  expect(d.designed.library.plan.specs.map(same)).toEqual(kept);
  expect(d.script.slides.length).toBe(4);
  expect(Object.keys(d.designed.slides).length).toBe(4);
  // the header counter of Cream ink: "N / 4" on every slide
  for (let k = 0; k < 4; k++) expect(textOf(d, k)).toContain(`${k + 1} / 4`);
  await expect(page.locator('.cr-stage-n')).toContainText('/ 4');
  expect(d.designed.library.manualEdits.removed).toEqual([expect.objectContaining({ slide: 3, layout: before.designed.library.plan.specs[2].layout })]);
  // the status with its one-step Undo
  await expect(page.getByTestId('arrange-status')).toContainText('Removed slide 3. The deck has 4 slides now.');
  const rep = await report(page);
  expect(rep.slidesMade).toBe(4);
  expect(rep.slides.map((s: any) => s.number)).toEqual([1, 2, 3, 4]);
  expect(rep.manualEdits).toEqual({ removed: [{ slide: 3, layout: before.designed.library.plan.specs[2].layout }], moved: [] });
  // Undo: exactly as before
  const undoBtn = page.getByTestId('arrange-undo');
  expect((await undoBtn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await undoBtn.click();
  await settle(page, 5);
  const u = await stored(page);
  expect(JSON.stringify(u.designed.library.plan.specs)).toBe(JSON.stringify(before.designed.library.plan.specs));
  expect(JSON.stringify(u.script)).toBe(JSON.stringify(before.script));
  expect(JSON.stringify(u.choices)).toBe(JSON.stringify(before.choices));
  expect(u.designed.library.manualEdits).toBeUndefined();
  for (let k = 0; k < 5; k++) expect(textOf(u, k)).toBe(textOf(before, k));
  await expect(page.getByTestId('arrange-status')).toHaveCount(0);
  expect((await report(page)).manualEdits).toEqual({ removed: [], moved: [] });
  expect(f.calls, 'no writer call for a remove or an undo').toBe(made);
});

test('S1 move up and down: only the position changes (layout, fields, accents, pictures stay with the slide); Move up is disabled on slide 1 and Move down on the last', async ({ page }) => {
  const f = await fake(page, SLIDES5);
  await page.goto('/images/carousel');
  await addPhotos(page, 6);
  await make(page, 7);
  const before = await stored(page);
  const n = before.designed.library.plan.specs.length;
  expect(n).toBe(7);
  await openEdit(page, 1);
  await expect(page.getByRole('button', { name: 'Move slide 1 up', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move slide 1 down', exact: true })).toBeEnabled();
  await openEdit(page, n);
  await expect(page.getByRole('button', { name: `Move slide ${n} down`, exact: true })).toBeDisabled();
  // slide 5 up: it is slide 4 now; slide 4 is slide 5
  await openEdit(page, 5);
  await page.getByRole('button', { name: 'Move slide 5 up', exact: true }).click();
  await expect(page.getByTestId('arrange-status')).toContainText('Moved slide 5 up: it is slide 4 now.', { timeout: 60_000 });
  await page.waitForTimeout(1200);
  const a = await stored(page);
  const was = before.designed.library.plan.specs.map(same);
  expect(a.designed.library.plan.specs.map(same)).toEqual([was[0], was[1], was[2], was[4], was[3], was[5], was[6]]);
  expect(a.script.slides[3]).toEqual(before.script.slides[4]);
  expect(a.designed.library.manualEdits.moved).toEqual([{ from: 5, to: 4 }]);
  // the selected slide follows the slide
  await expect(page.getByRole('group', { name: 'Arrange slide 4' })).toBeVisible();
  // now slide 4 down: back where it was (every spec as before)
  await page.getByRole('button', { name: 'Move slide 4 down', exact: true }).click();
  await expect(page.getByTestId('arrange-status')).toContainText('Moved slide 4 down: it is slide 5 now.', { timeout: 60_000 });
  await page.waitForTimeout(1200);
  const b = await stored(page);
  expect(b.designed.library.plan.specs.map(same)).toEqual(was);
  expect(b.designed.library.manualEdits.moved).toEqual([{ from: 5, to: 4 }, { from: 4, to: 5 }]);
  expect((await report(page)).manualEdits.moved).toEqual([{ from: 5, to: 4 }, { from: 4, to: 5 }]);
  expect(f.calls).toBe(1);
});

test('S1 remove a slide that holds pictures: they are freed, the pictures line names them and "Add as photo slide" shows; 0 writer calls', async ({ page }) => {
  const f = await fake(page, SLIDES5);
  await page.goto('/images/carousel');
  await addPhotos(page, 6);
  await make(page, 7);
  await expect(page.getByTestId('pictures-unused')).toHaveCount(0);
  const before = await stored(page);
  const k = before.designed.library.plan.specs.findIndex((s: any) => s.photoSlide);
  expect(k).toBeGreaterThan(0);
  const pics = Object.values(before.designed.library.plan.specs[k].fields).filter((v: any) => String(v).startsWith('picture:')).length;
  expect(pics).toBeGreaterThan(0);
  await openEdit(page, k + 1);
  await page.getByRole('button', { name: `Remove slide ${k + 1}`, exact: true }).click();
  await settle(page, 6);
  await expect(page.getByTestId('pictures-unused')).toContainText(`${pics} of your 6 pictures ${pics === 1 ? 'was' : 'were'} not used`);
  await expect(page.getByTestId('add-photo-slides')).toBeVisible();
  expect((await report(page)).picturesUnused.count).toBe(pics);
  expect(f.calls).toBe(1);
});

test('S1 the fewest slides: a 3-slide carousel cannot lose a slide (disabled, with a plain line)', async ({ page }) => {
  const f = await fake(page, SLIDES3);
  await page.goto('/images/carousel');
  await make(page, 3);
  await openEdit(page, 2);
  await expect(page.getByRole('button', { name: 'Remove slide 2', exact: true })).toBeDisabled();
  await expect(page.getByTestId('remove-blocked')).toHaveText('A carousel needs at least 3 slides, so no slide can be removed.');
  await expect(page.getByRole('button', { name: 'Move slide 2 up', exact: true })).toBeEnabled();
  expect(f.calls).toBe(1);
});

test('S1 the edit is kept by a style switch, a colour switch, a brand and a reload; the removed slide never comes back; 0 writer calls', async ({ page }) => {
  const f = await fake(page, SLIDES5);
  await page.goto('/images/carousel');
  await make(page, 5);
  const made = f.calls;
  const gone = 'Met some wonderful people there.';
  const k = (await stored(page)).designed.library.plan.specs.findIndex((s: any) => JSON.stringify(s.fields).includes(gone));
  expect(k).toBeGreaterThan(0);
  await openEdit(page, k + 1);
  await page.getByRole('button', { name: `Remove slide ${k + 1}`, exact: true }).click();
  await settle(page, 4);
  const removed = await stored(page);
  const check = async (what: string) => {
    const d = await stored(page);
    expect(d.designed.library.plan.specs.length, what).toBe(4);
    expect(d.script.slides.length, what).toBe(4);
    expect(words(d).join(' '), what).not.toContain(gone);
    expect(d.designed.library.manualEdits?.removed.length, what).toBe(1);
    expect(words(d), what).toEqual(words(removed));
    await expect(page.locator('.cr-film li'), what).toHaveCount(4);
  };
  // another style
  await page.locator('.cr-wiz-steps button').nth(2).click();
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Mono editorial glow/ }).first().click();
  await expect.poll(async () => (await stored(page)).designed.library.source, { timeout: 60_000 }).toBe('style-1');
  await page.waitForTimeout(1500);
  await check('style switch');
  // a colour combination
  await expect(page.getByTestId('colours-row')).toBeVisible();
  await page.getByTestId('combo-list').getByRole('radio').first().click();
  await expect.poll(async () => !!(await stored(page)).scheme, { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(1500);
  await check('colour switch');
  // a brand
  await page.getByTestId('brand-add').click();
  await page.getByTestId('brand-name').fill('Round S');
  await page.getByTestId('brand-hex-0').fill('#14213D');
  await page.getByTestId('brand-hex-0').blur();
  await page.getByTestId('brand-save').click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await check('brand');
  // a reload: the project is saved in this browser
  await page.reload();
  await expect(page.locator('.cr-film li')).toHaveCount(4, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await check('reload');
  expect(f.calls, 'no writer call for the remove, the switches or the reload').toBe(made);
});
