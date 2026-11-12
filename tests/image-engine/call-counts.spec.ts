// Every writer call costs money. This spec counts the calls the app makes to the writer (a FAKE model that counts) for the normal ways of making and changing a carousel, so an extra call
// can never slip in unseen. Expected: text only 1, text with pictures 1, a style switch 0, a text edit 0, a split 0, a pasted script 0.
// (A closing that breaks the closing rule is sent back for ONE targeted retry by design; the fake answers here keep the rule, so a count above 1 means a duplicate call.)
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { deckDrawn, openTab, toStep } from './ui';

test.setTimeout(240_000);
test.use({ viewport: { width: 1280, height: 900 } });

const fixture = JSON.parse(fs.readFileSync('tests/image-engine/fixtures/hot-flat-app-library.json', 'utf8')).library;
const SPECS = fixture.plan.specs.map((s: any) => ({ layout: s.layout, fields: s.fields, accents: s.accents }));
const TEXT = 'Stop storing your life in your head. Hold things in a system you trust. Three steps: capture, sort, review. Build your own. Join the waitlist today.';
const SAMPLE = fs.readFileSync(path.join('sample-scripts', 'agency-client-brief.json'), 'utf8');

async function counting(page: Page, answer: unknown) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'x' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'x' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: JSON.stringify(answer), ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const make = async (page: Page, text: string, n: number, style = /Hot flat/) => {
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(text);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: style }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, n);
};
const settle = (page: Page) => page.waitForTimeout(1500); // a late duplicate call would land here

test('text only: ONE writer call', async ({ page }) => {
  const f = await counting(page, { title: 'Habits', slides: SPECS });
  await make(page, TEXT, SPECS.length);
  await settle(page);
  expect(f.calls).toBe(1);
});

test('text with pictures: ONE writer call (the pictures are placed by code)', async ({ page }) => {
  const specs = [
    { layout: 'photo-cover', fields: { headline: 'A hoodie that flips into a backpack', intro: 'We sewed a bag into the hood.' }, accents: [] },
    { layout: 'do-dont', fields: { title: 'Pack it', num: '1', wrong: 'A bag and a hoodie, both heavy.', right: 'One hoodie that becomes the bag.' }, accents: [] },
    { layout: 'portrait-closing', fields: { headline: 'Meet the maker', heading: 'Back Quick Flip today', p1: 'We are two friends who got tired of carrying a bag.', url: 'quickflip.com' }, accents: [] },
  ];
  const f = await counting(page, { title: 'Quick Flip', slides: specs });
  await page.goto('/images/carousel');
  const flat = async (name: string, w: number, h: number, color: string) => {
    const b64 = await page.evaluate(async ({ w, h, color }) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, w, h);
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85)); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
    }, { w, h, color });
    return { name, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
  };
  await page.getByLabel('Choose images for the slides').setInputFiles([await flat('land.jpg', 1500, 1000, '#c0392b'), await flat('port.jpg', 1000, 1500, '#2471a3'), await flat('square.jpg', 1200, 1200, '#b7950b')]);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(3, { timeout: 30_000 });
  await page.getByLabel('Your text or topic').fill('A hoodie that flips into a backpack. We sewed a bag into the hood, so one layer does both jobs. Back Quick Flip today.');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 3);
  await settle(page);
  expect(f.calls).toBe(1);
});

test('a text edit and a style switch on a made deck: ZERO more calls', async ({ page }) => {
  const f = await counting(page, { title: 'Habits', slides: SPECS });
  await make(page, TEXT, SPECS.length);
  expect(f.calls).toBe(1);
  // text edit
  await openTab(page, 'Text', 2);
  const field = page.getByTestId('text-tab-1').locator('input, textarea').first();
  await field.fill('My own words');
  await expect.poll(async () => JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc?.designed?.library?.plan?.specs?.[1]?.fields)), { timeout: 30_000 }).toContain('My own words');
  expect(f.calls, 'a text edit').toBe(1);
  // style switch
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Quiet dark minimal/ }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Style changed. Slides redrawn, no model call.' }).first()).toBeVisible({ timeout: 60_000 });
  await settle(page);
  expect(f.calls, 'a style switch and a text edit').toBe(1);
});

test('a split: ZERO more calls', async ({ page }) => {
  const specs = SPECS.map((s: any) => ({ ...s }));
  specs[1] = { layout: 'prose', fields: { heading: 'Why it matters', p1: 'Most plans fail on day two because nobody wrote down the first small step. Write it now.' }, accents: [] };
  const f = await counting(page, { title: 'Habits', slides: specs });
  await make(page, TEXT, specs.length);
  expect(f.calls).toBe(1);
  await page.getByTestId('edit-slides').click();
  await page.getByRole('button', { name: 'Show slide 2', exact: true }).click();
  await openTab(page, 'Text', 2);
  await page.getByLabel(/^Paragraph 2/).fill('Then say who does it, by when, and how you will know it is done. Put the answer where the whole team can see it every morning. Review it on Friday. Write the next small step at once, before anything else gets in the way. Then do it again, and again, and again, until it is a habit.');
  await expect(page.getByTestId('split-slide')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('split-slide').click();
  await expect(page.getByTestId('split-msg')).toContainText('Every word is kept', { timeout: 60_000 });
  await settle(page);
  expect(f.calls, 'a split').toBe(1);
});

test('a pasted script: ZERO writer calls', async ({ page }) => {
  const f = await counting(page, { title: 'unused', slides: [] });
  await page.goto('/images/carousel');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await toStep(page, 1);
  await page.getByRole('button', { name: 'I already have a script' }).click();
  await page.getByLabel('Paste the script Claude wrote (JSON)').fill(SAMPLE);
  await page.getByRole('button', { name: 'Use this script' }).click();
  await deckDrawn(page, JSON.parse(SAMPLE).slides.length);
  await settle(page);
  expect(f.calls).toBe(0);
});

// Round 11: a pasted post that is already divided into paragraphs. The writer is the default choice (ONE writer call); "Use my paragraphs as slides" is free (ZERO).
const POST = fs.readFileSync('tests/image-engine/script-route.spec.ts', 'utf8').split('export const POST = `')[1].split('`;')[0];
test('a pasted post with paragraphs, default (writer) choice: ONE writer call', async ({ page }) => {
  const f = await counting(page, { title: 'Habits', slides: SPECS });
  await make(page, POST, SPECS.length);
  await settle(page);
  expect(f.calls).toBe(1);
});
test('a pasted post with paragraphs, "Use my paragraphs as slides": ZERO calls', async ({ page }) => {
  const f = await counting(page, { title: 'unused', slides: [] });
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(POST);
  await page.getByTestId('text-mode').getByRole('radio', { name: /Use my paragraphs as slides/ }).check();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 7);
  await settle(page);
  expect(f.calls).toBe(0);
});

// Round 14: the per-slide picture picker is code only: a pick, "None", "Auto" and a restyle after them make ZERO more writer calls.
test('the picture picker (pick, None, Auto) and a restyle after it: ZERO more writer calls', async ({ page }) => {
  const plan = { title: 'Say Creator', slides: [
    { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
    { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging boxes.' }, accents: [] },
    { layout: 'headline-card', fields: { headline: 'Change a headline and nothing reruns.', card: 'Switch the style and your words stay put.' }, accents: [] },
    { layout: 'statement-card', fields: { headline: 'You can add your own pictures too.' }, accents: [] },
    { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." }, accents: [] },
  ] };
  const f = await counting(page, plan);
  await page.goto('/images/carousel');
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (let i = 0; i < 2; i++) {
    const b64 = await page.evaluate(async (i) => {
      const c = document.createElement('canvas'); c.width = 1500; c.height = 1000; const g = c.getContext('2d')!; g.fillStyle = `hsl(${i * 120},60%,45%)`; g.fillRect(0, 0, 1500, 1000);
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.8)); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
    }, i);
    files.push({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  }
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(2, { timeout: 60_000 });
  await page.getByLabel('Your text or topic').fill('Most creators do not have a design problem. Write a good post, then turn it into slides. Comment "slides" and I will send you the link.');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 5);
  await settle(page);
  const afterDeck = f.calls;
  await openTab(page, 'Layout', 2);
  await page.getByTestId('pick-1-0').click();
  await page.waitForTimeout(800);
  await page.getByTestId('pick-1-none').click();
  await page.waitForTimeout(800);
  await page.getByTestId('pick-1-1').click();
  await page.waitForTimeout(800);
  await page.getByTestId('pick-1-auto').click();
  await page.waitForTimeout(800);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Quiet dark minimal/ }).first().click();
  await page.waitForTimeout(2000);
  await settle(page);
  expect(f.calls, 'the picker and a restyle: no new writer call').toBe(afterDeck);
});
