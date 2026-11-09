// The simple "Make a carousel" flow and who pays for what, with FAKE models only (no real call): an existing style = 0 design calls and 0 or 1 writer call; pasted slide text = 0 calls;
// "New style" = exactly 1 design call, and only after the person confirms; a missing style = an error and no call; "Redesign this slide" = 1 design call on a click;
// script notes ("Placeholder: ...", "Note: ...", "TODO", [brackets]) are never drawn and are flagged.
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleScript } from '../../src/carousel/script';
import { deckDrawn, openEdit, toStep } from './ui';

test.setTimeout(240_000);
test.use({ viewport: { width: 1280, height: 900 } });
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TEXT = 'I film five videos in one afternoon once a week. The night before I write the five titles. I keep one setup so I never rebuild the lights. Then I edit all five back to back the next day.';
const SCRIPT = exampleScript('carousel');
const script = JSON.parse(SCRIPT) as { slides: Record<string, unknown>[]; brand: { handle: string } };
const PAL = `data-palette='{"bg":"#101820","text":"#F5F0EB","accent":"#FF8A4C","accent2":"#4CC9F0","surface":"#1B2733","muted":"#9AA5B1"}'`;
const Y = [300, 800, 520, 700, 380, 760, 600];
const titleOf = (s: Record<string, unknown>) => String(s.headline ?? s.quote ?? s.label ?? s.value ?? s.body ?? 'x');
/** A design for slide i that uses only the slide's own words (3 shapes beyond the text, a different arrangement per slide). */
function svgFor(i: number, s: Record<string, unknown>): string {
  const title = titleOf(s).split(/\s+/).slice(0, 3).join(' ').replace(/&/g, '&amp;');
  const items = Array.isArray(s.items) ? (s.items as string[]) : [];
  const rows = s.type === 'checklist' ? items.map((it, k) => `<text data-role="body" data-min-size="40" data-max-lines="2" x="120" y="${900 + k * 110}" font-size="44" font-family="Instrument Sans" fill="$text">${it.split(/\s+/).slice(0, 3).join(' ').replace(/&/g, '&amp;')}</text>`).join('') : '';
  const stat = s.type === 'stat' && s.value ? `<text data-role="number" data-min-size="120" data-max-lines="1" x="80" y="560" font-size="240" font-family="Schibsted Grotesk" font-weight="700" fill="$accent">${String(s.value).replace(/&/g, '&amp;')}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-slide="${i + 1}" data-type="${String(s.type)}" ${PAL}><rect width="1080" height="1350" fill="$bg"/><g id="icon-${i}"><circle cx="${880 - i * 20}" cy="${160 + i * 10}" r="${50 + i * 6}" fill="$accent"/></g><rect x="80" y="240" width="160" height="10" fill="$accent"/><circle cx="960" cy="1100" r="70" fill="$surface"/><text data-role="title" data-min-size="44" data-max-lines="4" x="${80 + (i % 3) * 40}" y="${Y[i % 7]}" font-size="64" font-family="Schibsted Grotesk" font-weight="700" fill="$text">${title}</text>${rows}${stat}<text x="80" y="1270" font-size="30" font-family="Instrument Sans" fill="$muted">${i + 1} / 7</text></svg>`;
}
const DESIGNS = script.slides.map((s, i) => svgFor(i, s)).join('\n');

interface Call { kind: string; prompt: string }
/** Answers the writer endpoints: the cheap writer ("write") with the script, the draw model ("draw") with designs. */
async function fake(page: Page, answer?: (c: Call, n: number) => string): Promise<Call[]> {
  const calls: Call[] = [];
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = async (r: Route) => {
    const b = r.request().postDataJSON() as { prompt: string; kind?: string };
    const c = { kind: b.kind ?? 'write', prompt: b.prompt };
    calls.push(c);
    const text = answer ? answer(c, calls.length) : c.kind === 'draw' ? SCRIPT + '\n' + DESIGNS : SCRIPT;
    await r.fulfill({ json: { text, ms: 5 } }).catch(() => undefined);
  };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return calls;
}
const open = async (page: Page, text = TEXT) => {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
  await page.getByLabel('Your text or topic').fill(text);
};
const make = (page: Page) => page.getByRole('button', { name: 'Make carousel', exact: true });
const styles = (page: Page) => page.getByRole('list', { name: 'Styles' });
/** The deck is drawn: the page moved to step 4 by itself and the strip has n thumbnails. */
const drawn = (page: Page, n = 7) => deckDrawn(page, n);

test('the page: a text box, the styles with "New style" last, one button with its cost, and the other tools behind a Developer tools toggle', async ({ page }) => {
  await fake(page);
  await open(page);
  await expect(page.getByLabel('Your text or topic')).toBeVisible();
  await toStep(page, 3);
  const cards = styles(page).getByRole('listitem');
  await expect(cards.last()).toContainText('New style');
  await expect(make(page)).toBeVisible();
  await expect(page.getByTestId('cost-line')).toHaveText('0 design calls, 1 small writing call.');
  // the handle sits in step 3; the rebuild buttons, the image requests and the photos are in Developer tools, off to start with
  await expect(page.getByLabel('Your handle (optional)')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Rebuild the .* style as a pack$/ }).first()).toBeHidden();
  await expect(page.getByRole('button', { name: 'Quick (free, templates)' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Developer tools' }).check();
  await expect(page.getByRole('button', { name: /^Rebuild the .* style as a pack$/ }).first()).toBeVisible();
  fs.mkdirSync(path.join(ROOT, 'out/image-engine/page'), { recursive: true });
});

test('an existing style: 0 design calls and 1 writer call (the cheap model\'s kind); code fills the slides', async ({ page }) => {
  const calls = await fake(page);
  await open(page);
  await toStep(page, 3);
  await styles(page).getByRole('button', { name: /dark-quiet/ }).click();
  await make(page).click();
  await drawn(page);
  expect(calls.length).toBe(1);
  expect(calls[0].kind, 'the script is a writing call, not a design call').toBe('write');
  expect(calls[0].prompt).not.toContain('PART 2');
  await expect(page.getByTestId('designed-card')).toHaveCount(0);
});

test('pasted slide text (blocks split by blank lines): 0 calls of any kind', async ({ page }) => {
  const calls = await fake(page);
  const slides = 'Fix your profile in 15 minutes\nThree edits that make people stop scrolling\n\n1. Rewrite your headline\nSkip the job title. Say who you help and how.\n\nPin one proof post\nFeature your best post at the top.\n\nBefore you hit save\n- Clear, well-lit photo\n- Headline names who you help\n- Contact info is current\n\nSave this and fix it tonight\nFollow for weekly posts';
  await open(page, slides);
  await toStep(page, 3);
  await expect(page.getByTestId('cost-line')).toHaveText('0 design calls, 0 writing calls: your slide text is used as it is.');
  await styles(page).getByRole('button', { name: /dark-quiet/ }).click();
  await make(page).click();
  await drawn(page, 5);
  expect(calls.length).toBe(0);
  await openEdit(page, 4);
  await expect(page.locator('.cr-card').getByLabel('Headline')).toHaveValue('Before you hit save');
});

test('a missing style: an error and the picker, and no call', async ({ page }) => {
  const calls = await fake(page);
  await page.addInitScript(() => {
    localStorage.setItem('creator.carousel.project.v1', JSON.stringify({ project: { doc: { version: 1, format: 'carousel', style: 'mine-gone-style', topic: '', options: { slides: 7, tone: 'clear', autoStyle: false, handle: '', platform: null }, script: null, choices: {} }, past: [], future: [] } }));
  });
  await open(page);
  await toStep(page, 3);
  await make(page).click();
  await expect(page.getByText(/is missing or broken/)).toBeVisible();
  await expect(styles(page)).toBeVisible();
  expect(calls.length).toBe(0);
});

test('New style from a description: nothing runs until the person confirms, then exactly 1 design call; the style is saved, selected, and used by code', async ({ page }) => {
  const calls = await fake(page);
  await open(page);
  await toStep(page, 3);
  await styles(page).getByRole('button', { name: /New style/ }).click();
  const flow = page.getByTestId('new-style');
  await flow.getByLabel('Describe the look').fill('warm paper big serif');
  await expect(page.getByTestId('new-style-cost')).toContainText('1 Sonnet call, about 1 minute');
  await flow.getByRole('button', { name: 'Make the style' }).click();
  await expect(flow.getByRole('alertdialog')).toContainText('1 Sonnet call, about 1 minute');
  expect(calls.length, 'asking is not running').toBe(0);
  await flow.getByRole('button', { name: 'Confirm and make the style' }).click();
  await expect(page.getByText('Made the style warm paper big serif and selected it.')).toBeVisible({ timeout: 60_000 });
  await drawn(page);
  expect(calls.length).toBe(1);
  expect(calls[0].kind).toBe('draw');
  // saved as a style, listed first (Mine), selected; the slides were filled by code from it
  await toStep(page, 3);
  const mine = styles(page).getByRole('listitem').nth(1);
  await expect(mine).toContainText('warm paper big serif');
  await expect(mine.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('new-style')).toHaveCount(0);
  expect(calls.length, 'no further call').toBe(1);
});

test('Redesign this slide: shows its cost, and runs 1 design call only when pressed', async ({ page }) => {
  const calls = await fake(page, (c) => (c.kind === 'draw' ? svgFor(1, script.slides[1]) : SCRIPT));
  await open(page);
  await toStep(page, 3);
  await styles(page).getByRole('button', { name: /dark-quiet/ }).click();
  await make(page).click();
  await drawn(page);
  await openEdit(page, 2);
  const second = page.locator('.cr-card').first();
  await expect(second.getByText(/1 Sonnet call, about 30 seconds/)).toBeVisible();
  expect(calls.length, 'only the writer so far').toBe(1);
  await second.getByLabel('Words for redesigning slide 2').fill('bolder');
  await second.getByRole('button', { name: 'Redesign this slide' }).click();
  await expect(second.getByText(/Redesigned slide 2/)).toBeVisible({ timeout: 30_000 });
  expect(calls.length).toBe(2);
  expect(calls[1].kind).toBe('draw');
  await expect(page.getByTestId('faithful-note')).toHaveCount(1);
});

test('script notes ("Placeholder: ...", "Note: ...", "TODO", [brackets]) are never drawn, and are flagged to edit', async ({ page }) => {
  const dirty = JSON.parse(SCRIPT) as { slides: Record<string, unknown>[] };
  const stat = dirty.slides.find((s) => s.type === 'stat')!;
  stat.note = 'Placeholder: use your own number';
  const check = dirty.slides.find((s) => s.type === 'checklist')!;
  (check.items as string[])[0] = 'TODO: first item';
  const content = dirty.slides.find((s) => s.type === 'step')!;
  content.body = '[add one sentence here]';
  const calls = await fake(page, () => JSON.stringify(dirty));
  await open(page);
  await toStep(page, 3);
  await styles(page).getByRole('button', { name: /dark-quiet/ }).click();
  await make(page).click();
  await drawn(page);
  expect(calls.length).toBe(1);
  const flags = page.getByTestId('deck-flags');
  await expect(flags).toContainText('3 notes in your script are not drawn on the slides: edit this');
  await expect(flags).toContainText('Placeholder: use your own number');
  await expect(flags).toContainText('TODO: first item');
  await expect(flags).toContainText('[add one sentence here]');
  // and none of it is in what is drawn
  const drawnText = await page.evaluate(async (s) => {
    const R = await import('/src/carousel/render.ts');
    const doc = { version: 1 as const, format: 'carousel' as const, style: 'dark-quiet', topic: '', script: JSON.parse(s), choices: {} };
    return JSON.stringify(R.composeDoc(doc).slides.map((x) => x.plan.layers));
  }, JSON.stringify(dirty));
  expect(drawnText).not.toMatch(/Placeholder|TODO|add one sentence here/);
});
