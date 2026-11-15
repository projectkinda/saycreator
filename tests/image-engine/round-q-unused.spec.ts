// Round Q part 2: a plain line when pictures the person added are not on any slide, by the names they typed: "2 of your 4 pictures were not used: motorbike on the street, sun rays
// through palms." In the neutral info style, after the phone-check line; recomputed with no call after a pick, a text edit, a style and a colour switch; report.json picturesUnused. No line when
// every picture is used or none was added. A FAKE writer that counts every call: ZERO real model calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import { openEdit, openTab, toStep } from './ui';

test.setTimeout(5 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const TEXT = "Most creators don't have a design problem. Here's how it works: paste your text, pick a look, get slides you can edit. Try it on your next post.";
const PLAN = { title: 'Design problem', slides: [
  { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
  { layout: 'numbered-list', fields: { title: "Here's how it works", items: ['Paste your text', 'Pick a look', 'Get slides you can edit'] }, accents: [] },
  { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Follow for more' }, accents: [] },
] };
const NAMES = ['sky and tower', 'motorbike on the street', 'sun rays through palms', 'tree-lined road'];

async function fake(page: Page) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: JSON.stringify(PLAN), ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
/** n photo-like JPEGs (portrait), named. */
async function addPictures(page: Page, n: number) {
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (let i = 0; i < n; i++) {
    const b64 = await page.evaluate(async (i) => {
      const c = document.createElement('canvas'); c.width = 900; c.height = 1200; const g = c.getContext('2d')!;
      const img = g.createImageData(900, 1200); let seed = 11 + i;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let k = 0; k < img.data.length; k += 4) { const y = Math.floor(k / 4 / 900); const v = 60 + 120 * (y / 1200) + (rnd() - 0.5) * 50; img.data[k] = v * (0.6 + 0.1 * i); img.data[k + 1] = v * 0.8; img.data[k + 2] = v; img.data[k + 3] = 255; }
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }, i);
    files.push({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  }
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(n, { timeout: 60_000 });
  for (let i = 0; i < n; i++) {
    const chip = page.getByTestId(`image-${i}-content`);
    if ((await chip.getAttribute('data-content')) === 'screenshot') await chip.click();
    const box = page.getByTestId(`image-${i}-label`);
    await box.fill(NAMES[i]); await box.blur();
  }
}
async function make(page: Page) {
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(3, { timeout: 90_000 });
  await page.waitForTimeout(1500);
}
/** What the line must say for the deck as it stands, and report.json's picturesUnused. */
const expected = (page: Page) => page.evaluate(async () => {
  const RP: any = await import('/src/reference/report.ts');
  const d = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc;
  // the pictures in the slides' own fields (the picker's saved Auto copy is not on a slide)
  const used = new Set(JSON.stringify(d.designed.library.plan.specs.map((s: any) => s.fields)).match(/picture:[^#"]+/g)?.map((x: string) => x.slice(8)) ?? []);
  const photos = (d.photos ?? []).filter((p: any) => p.kind !== 'object');
  const left = photos.filter((p: any) => !used.has(p.id));
  const names = left.map((p: any) => p.label?.trim() || `picture ${photos.indexOf(p) + 1}`);
  const rep = JSON.parse((await RP.buildReport({ doc: d, includeRefs: false, verdicts: {}, note: '' })).json).picturesUnused;
  return { count: left.length, total: photos.length, names, rep, line: left.length ? `${left.length} of your ${photos.length} pictures ${left.length === 1 ? 'was' : 'were'} not used: ${names.join(', ')}.` : null };
});
const check = async (page: Page, what: string) => {
  const e = await expected(page);
  expect(e.rep, `${what}: report.json`).toEqual({ count: e.count, total: e.total, names: e.names });
  if (e.line) await expect(page.getByTestId('pictures-unused'), what).toHaveText(e.line);
  else await expect(page.getByTestId('pictures-unused'), what).toHaveCount(0);
  return e;
};

test('Q2: the unused pictures by name, neutral, after the other lines; recomputed with no call after a pick, a text edit, a style and a colour switch', async ({ page }) => {
  const f = await fake(page);
  await page.goto('/images/carousel');
  await addPictures(page, 4);
  await make(page);
  const e0 = await check(page, 'as made');
  expect(e0.count, 'a 3-slide deck cannot show 4 pictures').toBeGreaterThan(0);
  for (const n of e0.names) expect(NAMES).toContain(n);
  // neutral, and after the phone-check line
  const st = await page.evaluate(() => {
    const line = document.querySelector('[data-testid="pictures-unused"]')!;
    const probe = document.createElement('span'); probe.className = 'cr-problem'; document.body.appendChild(probe);
    const red = getComputedStyle(probe).color; probe.remove();
    const status = [...document.querySelectorAll('p[role=status]')].find((p) => /phone-size check/.test(p.textContent ?? ''))!;
    return { colour: getComputedStyle(line).color, red, after: !!(status.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  expect(st.colour).not.toBe(st.red);
  expect(st.after, 'after the phone-check line').toBe(true);
  // a pick: put an unused picture on slide 1 (the picker), then the line follows
  const d0 = await page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
  const firstUnused = d0.photos.findIndex((p: any) => !JSON.stringify(d0.designed.library.plan.specs.map((s: any) => s.fields)).includes('picture:' + p.id));
  await openEdit(page, 1);
  await page.getByTestId(`pick-0-${firstUnused}`).click();
  await expect(page.getByTestId('pick-0-msg')).not.toHaveText('', { timeout: 30_000 });
  await page.waitForTimeout(800);
  await check(page, 'after a pick');
  // a text edit
  await openTab(page, 'Text', 3);
  const field = page.getByTestId('text-tab-2').locator('input, textarea').first();
  await field.fill('Try it on your next post today.');
  await field.blur();
  await page.waitForTimeout(1500);
  await page.getByTestId('edit-view').getByRole('button', { name: /^Done/ }).first().click().catch(() => {});
  await check(page, 'after a text edit');
  // a style and a colour switch
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Cream ink/ }).first().click();
  await page.waitForTimeout(2500);
  await page.getByTestId('combo-teal-coral').click();
  await page.waitForTimeout(2500);
  await check(page, 'after a style and a colour switch');
  expect(f.calls, 'one writer call, for the deck').toBe(1);
});

test('Q2: no line when no picture was added, and none when every picture is on a slide', async ({ page }) => {
  const f = await fake(page);
  await page.goto('/images/carousel');
  await make(page);
  await expect(page.getByTestId('pictures-unused')).toHaveCount(0);
  const e = await expected(page);
  expect(e.rep).toEqual({ count: 0, total: 0, names: [] });
  // one picture, then put it on a slide with the picker if the deck left it out
  await page.locator('.cr-wiz-steps button').nth(0).click();
  await addPictures(page, 1);
  await toStep(page, 3);
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(3, { timeout: 90_000 });
  await page.waitForTimeout(1500);
  const e1 = await expected(page);
  if (e1.count) {
    await openEdit(page, 1);
    await page.getByTestId('pick-0-0').click();
    await expect(page.getByTestId('pick-0-msg')).not.toHaveText('', { timeout: 30_000 });
    await page.waitForTimeout(800);
  }
  const e2 = await check(page, 'one picture');
  expect(e2.count, 'the picture is on a slide').toBe(0);
  await expect(page.getByTestId('pictures-unused')).toHaveCount(0);
  expect(f.calls).toBe(2);
});
