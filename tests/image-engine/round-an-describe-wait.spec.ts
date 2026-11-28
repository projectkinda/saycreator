// Round AN: "Make carousel" waits for picture descriptions that are still running, so the writer is told the pictures' names ("named ...") and can put each picture on the slide
// whose words it matches. The wait is at most 30 s and Cancel stops it; a description that fails or comes too late leaves the deck as before (pictures placed by their shape) with a
// plain note. Nothing waits when no description is running. A FAKE describer (its answer delayed, never sent, or an error) and a FAKE writer: no real model call.
import { expect, test, type Page } from '@playwright/test';
import { deckDrawn, toStep } from './ui';

test.setTimeout(4 * 60_000);
test.use({ viewport: { width: 390, height: 844 } });

const TEXT = "Three walls I walked past this week.\n\nA red brick wall. It was warm from the sun.\n\nA blue sea under the sky. Behind the harbour wall.\n\nTell me your favourite wall.";
const PLAN = { title: 'Walls', slides: [
  { layout: 'statement', fields: { headline: 'Three walls I walked past this week.' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'A red brick wall', paragraph: 'It was warm from the sun.' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'A blue sea under the sky', paragraph: 'Behind the harbour wall.' }, accents: [] },
  { layout: 'cta-button', fields: { headline: 'Tell me your favourite wall.', button: 'Comment below' }, accents: [] },
] };
const CAPTIONS = ['red brick wall in sun', 'blue sea under sky'];

type Describer = 'delay' | 'hang' | 'error';
/** The page with the fake writer and the fake describer; counts calls and keeps when each was asked and answered. */
async function setup(page: Page, describer: Describer, on = true) {
  const f = { writes: 0, describes: 0, prompts: [] as string[], t: { describeAsked: 0, describeAnswered: 0, writeAsked: 0 } };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/__picture/describe', async (r) => {
    f.describes++;
    f.t.describeAsked = Date.now();
    if (describer === 'hang') return; // never answered
    if (describer === 'error') { await new Promise((res) => setTimeout(res, 3000)); f.t.describeAnswered = Date.now(); return r.fulfill({ status: 502, json: { error: 'the describer failed', kind: 'failed' } }); }
    await new Promise((res) => setTimeout(res, 3000));
    f.t.describeAnswered = Date.now();
    return r.fulfill({ json: { captions: CAPTIONS, calls: 1 } }).catch(() => undefined);
  });
  const write = (r: any) => {
    f.writes++;
    f.t.writeAsked = Date.now();
    f.prompts.push(JSON.parse(r.request().postData() ?? '{}').prompt ?? '');
    return r.fulfill({ json: { text: JSON.stringify(PLAN), ms: 5, usage: { input: 10, output: 5 } } });
  };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await page.evaluate((on) => localStorage.setItem('creator.carousel.describe.v1', on ? 'on' : 'off'), on);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  return f;
}
async function addTwoAndMake(page: Page) {
  const pic = async (i: number) => {
    const b64 = await page.evaluate(async (i) => {
      const c = document.createElement('canvas'); c.width = 1500; c.height = 1000; const g = c.getContext('2d')!; g.fillStyle = `hsl(${i * 97},60%,45%)`; g.fillRect(0, 0, 1500, 1000);
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.8)); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
    }, i);
    return { name: `w${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
  };
  await page.getByLabel('Choose images for the slides').setInputFiles([await pic(0), await pic(1)]);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(2, { timeout: 60_000 });
  // as a person in a hurry: the text, the style and Make carousel right away
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
}
const pictureLine = (prompt: string) => prompt.split('\n').find((l) => l.includes('Pictures available')) ?? '';

test('AN1 Make carousel waits for the descriptions: "Describing your pictures…", then ONE writer call whose prompt names both pictures', async ({ page }) => {
  const f = await setup(page, 'delay');
  await addTwoAndMake(page);
  await expect(page.getByTestId('progress')).toHaveText('Describing your pictures…', { timeout: 10_000 });
  await page.evaluate(() => { const bar = document.querySelector('.cr-edit-bar') as HTMLElement | null; if (bar) bar.style.position = 'static'; });
  await page.getByTestId('progress').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'out/round-an/describing-wait-390.png' });
  await deckDrawn(page, 4);
  expect(f.describes).toBe(1);
  expect(f.writes, 'one writer call').toBe(1);
  expect(f.t.writeAsked, 'the writer is asked after the captions arrived').toBeGreaterThanOrEqual(f.t.describeAnswered);
  const line = pictureLine(f.prompts[0]);
  for (const c of CAPTIONS) expect(line, `the writer is told "${c}"`).toContain(`named "${c}"`);
  await expect(page.locator('p.small[role="status"]').filter({ hasText: 'placed by their shape' })).toHaveCount(0);
});

test('AN2 a description that never arrives: after 30 s the deck is made without names, with a plain note; one describe call, one writer call', async ({ page }) => {
  const f = await setup(page, 'hang');
  await addTwoAndMake(page);
  await expect(page.getByTestId('progress')).toHaveText('Describing your pictures…', { timeout: 10_000 });
  await page.waitForTimeout(3000);
  expect(f.writes, 'still waiting').toBe(0);
  await deckDrawn(page, 4);
  expect(f.t.writeAsked - f.t.describeAsked, 'the wait was about 30 s').toBeGreaterThanOrEqual(29_000);
  expect(f.describes).toBe(1);
  expect(f.writes).toBe(1);
  expect(pictureLine(f.prompts[0])).not.toContain('named "');
  const note = page.locator('p.small[role="status"]').filter({ hasText: 'placed by their shape' });
  await expect(note).toHaveText(/^(?:.* )?Some pictures were placed by their shape: their descriptions did not arrive within 30 seconds\. You can name them and make the carousel again\.$/);
  await note.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'out/round-an/describing-late-note-390.png' });
});

test('AN3 a description that fails while Make carousel waits: no wait beyond the error, the deck is made as before, and the note says the pictures could not be described', async ({ page }) => {
  const f = await setup(page, 'error');
  await addTwoAndMake(page);
  await deckDrawn(page, 4);
  expect(f.describes).toBe(1);
  expect(f.writes).toBe(1);
  expect(f.t.writeAsked - f.t.describeAnswered, 'asked right after the error').toBeLessThan(10_000);
  expect(pictureLine(f.prompts[0])).not.toContain('named "');
  await expect(page.locator('p.small[role="status"]').filter({ hasText: 'placed by their shape' })).toHaveText(/Some pictures were placed by their shape: they could not be described\./);
});

test('AN4 nothing running (describing switched off): no wait, no describe call, no note', async ({ page }) => {
  const f = await setup(page, 'delay', false);
  await addTwoAndMake(page);
  await deckDrawn(page, 4);
  expect(f.describes).toBe(0);
  expect(f.writes).toBe(1);
  await expect(page.locator('p.small[role="status"]').filter({ hasText: 'placed by their shape' })).toHaveCount(0);
});

test('AN5 Cancel during the wait stops it: no writer call, the text is kept', async ({ page }) => {
  const f = await setup(page, 'hang');
  await addTwoAndMake(page);
  await expect(page.getByTestId('progress')).toHaveText('Describing your pictures…', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('progress')).toHaveText('Cancelled. Your text is kept.');
  await page.waitForTimeout(1500);
  expect(f.writes).toBe(0);
  await expect(page.getByLabel('Your text or topic')).toHaveValue(TEXT);
});
