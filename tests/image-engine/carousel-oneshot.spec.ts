// Step 9: one-shot Generate, tested with a FAKE writer. The page's requests to the writer endpoints are answered by the test,
// so no real call is made (the real dev server's endpoints are never reached).
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleScript } from '../../src/carousel/script';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/oneshot');
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1280, height: 900 } });
test.beforeAll(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
});

const TEXT = 'I film five videos in one afternoon once a week. The night before I write the five titles. I keep one setup so I never rebuild the lights. Then I edit all five back to back the next day.';

/** A valid script with `n` slides (7 is the example; fewer drops the middle ones). */
const script = (n: number, extra: Record<string, unknown> = {}) => {
  const j = JSON.parse(exampleScript('carousel'));
  j.slides = [...j.slides.slice(0, n - 1), j.slides[6]].slice(0, n);
  return JSON.stringify({ ...j, ...extra });
};

interface Fake {
  calls: { prompt: string }[];
  status: { cli: boolean; api: boolean };
}
/** Answers the writer endpoints. `answer(n, prompt)` returns the text for call n (1-based), or an error. */
async function fake(page: Page, answer: (n: number, prompt: string) => { text: string; delayMs?: number } | { error: string; status?: number; kind?: string }, status = { cli: true, api: false }): Promise<Fake> {
  const f: Fake = { calls: [], status };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: status.cli ? { available: true } : { available: false, reason: 'not here' } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: status.api ? { available: true } : { available: false, reason: 'no key' } }));
  const write = async (r: Route) => {
    const prompt = (r.request().postDataJSON() as { prompt: string }).prompt;
    f.calls.push({ prompt });
    const a = answer(f.calls.length, prompt);
    if ('error' in a) return r.fulfill({ status: a.status ?? 502, json: { error: a.error, kind: a.kind ?? 'failed' } });
    if (a.delayMs) await new Promise((x) => setTimeout(x, a.delayMs));
    return r.fulfill({ json: { text: a.text, ms: a.delayMs ?? 5 } }).catch(() => undefined);
  };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}

const open = async (page: Page) => {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
};
const source = (page: Page) => page.getByLabel('Your text, idea or article');
const generate = (page: Page) => page.getByRole('button', { name: 'Generate', exact: true });
const allDrawn = async (page: Page, count = 7) => {
  await expect(page.locator('.cr-card')).toHaveCount(count, { timeout: 30_000 });
  await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(count, { timeout: 30_000 });
};
const progress = (page: Page) => page.getByTestId('progress');
let shots = 0;
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${String(++shots).padStart(2, '0')}-${name}.png`) });
};

test('paste text, press Generate: progress is shown, then the full editable carousel appears; one Undo takes it back', async ({ page }) => {
  const f = await fake(page, () => ({ text: script(7), delayMs: 700 }));
  await open(page);
  await expect(page.getByTestId('writer-label')).toContainText('Claude Code on this computer');
  await expect(generate(page)).toBeDisabled();
  await expect(page.getByText(/at least 40 characters/)).toBeVisible();
  await source(page).fill(TEXT);
  await expect(generate(page)).toBeEnabled();
  await shot(page, 'start');
  await generate(page).click();
  await expect(progress(page)).toContainText('Writing the script');
  await expect(page.locator('#main').getByRole('button', { name: 'Cancel' })).toBeVisible();
  await shot(page, 'writing');
  await expect(progress(page)).toContainText(/Drawing slide \d of 7/, { timeout: 15_000 });
  await allDrawn(page);
  await expect(progress(page)).toContainText('Done: 7 slides');
  await shot(page, 'done');
  // The prompt carries the person's text, the rules, the tone, the slide count and the tag vocabulary.
  const p = f.calls[0].prompt;
  expect(p).toContain(TEXT);
  expect(p).toContain('Never invent statistics');
  expect(p).toContain('7-slide carousel');
  expect(p).toContain('Tone: Clear');
  expect(p).toMatch(/money, growth, warning, idea/);
  expect(p).toContain('element_tags');
  // It is the normal editor: edit a headline, tags are chips, undo takes back the whole generation in one step.
  const card = page.getByRole('listitem', { name: /^Slide 2 of/ });
  await expect(card.getByLabel('Headline')).toHaveValue('Rewrite your headline');
  await expect(page.getByRole('button', { name: /^Undo: Generate from your text/ })).toBeVisible();
  await page.getByRole('button', { name: /^Undo: Generate from your text/ }).click();
  await expect(page.locator('.cr-card')).toHaveCount(0);
  await page.getByRole('button', { name: /^Redo: Generate from your text/ }).click();
  await allDrawn(page);
});

test('tone, slide count and style choice reach the writer; "Pick for me" uses the style the writer names', async ({ page }) => {
  const f = await fake(page, () => ({ text: script(5, { style: 'hot-flat' }) }));
  await open(page);
  await source(page).fill(TEXT);
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await page.getByRole('combobox', { name: /^Slides/ }).selectOption('5');
  await expect(page.getByRole('button', { name: /^Pick for me/ })).toHaveAttribute('aria-pressed', 'true');
  await generate(page).click();
  await allDrawn(page, 5);
  const p = f.calls[0].prompt;
  expect(p).toContain('5-slide carousel');
  expect(p).toContain('Tone: Bold');
  expect(p).toMatch(/top-level "style" set to the one of these/);
  expect(p).toContain('"hot-flat"');
  // The writer's style was applied, and the Pick for me tile still says it is in charge.
  await expect(page.getByRole('list', { name: 'Styles' }).getByRole('listitem').filter({ hasText: 'hot-flat' }).getByText('In use')).toBeVisible();
  // A style chosen by hand is not asked for and is kept.
  await page.getByRole('list', { name: 'Styles' }).getByRole('listitem').filter({ hasText: 'dark-quiet' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Friendly', exact: true }).click();
  await generate(page).click();
  await allDrawn(page, 5);
  expect(f.calls[1].prompt).not.toMatch(/top-level "style"/);
  expect(f.calls[1].prompt).toContain('Tone: Friendly');
  await expect(page.getByRole('list', { name: 'Styles' }).getByRole('listitem').filter({ hasText: 'dark-quiet' }).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
});

test('a bad answer is retried once automatically, with the problems sent back, and then it works', async ({ page }) => {
  const f = await fake(page, (n) => (n === 1 ? { text: 'Sure! Here is your carousel: {"title": "x", "slides": [ {"type": "cover"} ]}' } : { text: script(7) }));
  await open(page);
  await source(page).fill(TEXT);
  await generate(page).click();
  await allDrawn(page);
  expect(f.calls).toHaveLength(2);
  expect(f.calls[1].prompt).toContain('Your previous answer was:');
  expect(f.calls[1].prompt).toMatch(/It cannot be used, for these reasons:\n- A carousel needs 3 to 10 slides/);
  expect(f.calls[1].prompt).toContain(TEXT);
  await expect(progress(page)).toContainText('It needed a second try');
});

test('a bad answer twice: plain errors, the text is kept, nothing is drawn, and Generate can be pressed again', async ({ page }) => {
  const f = await fake(page, (n) => (n < 3 ? { text: JSON.stringify({ title: 'x', slides: [{ type: 'banner' }, { type: 'cover' }, { type: 'closing', headline: 'a', cta: 'b', element_tags: ['one'] }] }) } : { text: script(7) }));
  await open(page);
  await source(page).fill(TEXT);
  await generate(page).click();
  const alert = page.getByRole('alert').filter({ hasText: 'neither answer could be used' });
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText('Your text is kept');
  await expect(alert).toContainText('has the type "banner"');
  await expect(alert).toContainText('"headline" is missing');
  await shot(page, 'error-twice');
  expect(f.calls).toHaveLength(2);
  await expect(source(page)).toHaveValue(TEXT);
  await expect(page.locator('.cr-card')).toHaveCount(0);
  await expect(generate(page)).toBeEnabled();
  await generate(page).click(); // third call is good
  await allDrawn(page);
  await expect(page.getByRole('alert').filter({ hasText: 'neither answer' })).toHaveCount(0);
});

test('a writer that fails or is not found says so plainly and keeps the text', async ({ page }) => {
  await fake(page, () => ({ error: 'The Claude Code command line tool was not found on this computer. Install it, or set CLAUDE_BIN to its full path.', status: 503, kind: 'unavailable' }));
  await open(page);
  await source(page).fill(TEXT);
  await generate(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'was not found on this computer' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Your text is kept');
  await expect(source(page)).toHaveValue(TEXT);
});

test('cancel while writing: the request is abandoned, the text is kept, and nothing is drawn', async ({ page }) => {
  await fake(page, () => ({ text: script(7), delayMs: 8000 }));
  await open(page);
  await source(page).fill(TEXT);
  await generate(page).click();
  await expect(progress(page)).toContainText('Writing the script');
  await page.locator('#main').getByRole('button', { name: 'Cancel' }).click();
  await expect(progress(page)).toContainText('Cancelled. Your text is kept.');
  await expect(generate(page)).toBeEnabled();
  await expect(source(page)).toHaveValue(TEXT);
  await page.waitForTimeout(500);
  await expect(page.locator('.cr-card')).toHaveCount(0);
});

test('cancel while drawing: the generated slides are taken back and the earlier state returns', async ({ page }) => {
  await fake(page, () => ({ text: script(7) }));
  await open(page);
  await source(page).fill(TEXT);
  await generate(page).click();
  await expect(progress(page)).toContainText(/Drawing slide/, { timeout: 15_000 });
  await page.locator('#main').getByRole('button', { name: 'Cancel' }).click();
  await expect(progress(page)).toContainText('Cancelled');
  await expect(page.locator('.cr-card')).toHaveCount(0);
  await expect(source(page)).toHaveValue(TEXT);
});

test('too long: a clear limit is shown and nothing is sent; too short: Generate waits', async ({ page }) => {
  const f = await fake(page, () => ({ text: script(7) }));
  await open(page);
  await source(page).fill('x '.repeat(6500));
  await expect(page.getByTestId('progress')).toBeAttached();
  await expect(page.getByRole('alert').filter({ hasText: /13,000 of 12,000|12,000/ }).first()).toBeVisible();
  await expect(page.getByText(/The limit is 12,000/)).toBeVisible();
  await expect(generate(page)).toBeDisabled();
  await expect(source(page)).toHaveValue('x '.repeat(6500)); // nothing was cut
  expect(f.calls).toHaveLength(0);
  await source(page).fill('Too short.');
  await expect(generate(page)).toBeDisabled();
});

test('a thin text: the writer makes fewer slides and says so, and the note is shown', async ({ page }) => {
  await fake(page, () => ({ text: script(4, { note: 'The text only supports four different ideas, so I wrote 4 slides instead of 7.' }) }));
  await open(page);
  await source(page).fill(TEXT);
  await generate(page).click();
  await allDrawn(page, 4);
  await expect(progress(page)).toContainText('Done: 4 slides');
  await expect(progress(page)).toContainText('only supports four different ideas');
});

test('refresh and recover: the text, the options, the slides and the history are all back', async ({ page }) => {
  await fake(page, () => ({ text: script(7, { style: 'object-neon' }) }));
  await open(page);
  await source(page).fill(TEXT);
  await page.getByRole('button', { name: 'Expert', exact: true }).click();
  await page.getByRole('combobox', { name: /^Slides/ }).selectOption('7');
  await generate(page).click();
  await allDrawn(page);
  await page.getByRole('listitem', { name: /^Slide 2 of/ }).getByLabel('Headline').fill('Edited after generating');
  await expect(page.getByRole('button', { name: /^Undo: Edit headline/ })).toBeVisible();
  await expect(page.getByText(/Saved in this browser/)).toBeVisible();
  await page.reload();
  await allDrawn(page);
  await expect(source(page)).toHaveValue(TEXT);
  await expect(page.getByRole('button', { name: 'Expert', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('listitem', { name: /^Slide 2 of/ }).getByLabel('Headline')).toHaveValue('Edited after generating');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(page.getByRole('listitem', { name: /^Slide 2 of/ }).getByLabel('Headline')).toHaveValue('Rewrite your headline');
  await shot(page, 'recovered');
});

test('no writer available: Generate says why, and the Advanced fold still works', async ({ page }) => {
  await fake(page, () => ({ text: script(7) }), { cli: false, api: false });
  await open(page);
  await source(page).fill(TEXT);
  await expect(generate(page)).toBeDisabled();
  await expect(page.getByText(/No writer is available on this server yet/)).toBeVisible();
  await expect(page.getByTestId('writer-label')).toContainText('none available');
  await page.getByText('Advanced: write the script yourself').click();
  await page.getByRole('button', { name: 'Try an example script' }).click();
  await allDrawn(page);
});

test('the API writer is preferred when the server has a key; the browser only ever calls this app', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => asked.push(r.url()));
  await fake(page, () => ({ text: script(7) }), { cli: true, api: true });
  await open(page);
  await expect(page.getByTestId('writer-label')).toContainText('Claude API');
  await source(page).fill(TEXT);
  await generate(page).click();
  await allDrawn(page);
  const origin = new URL(page.url()).origin;
  expect(asked.some((u) => u.endsWith('/api/carousel/write'))).toBe(true);
  expect(asked.some((u) => u.endsWith('/__carousel/write'))).toBe(false);
  expect(asked.filter((u) => /anthropic\.com/.test(u))).toEqual([]);
  expect(asked.filter((u) => u.startsWith(origin) && /key/i.test(new URL(u).search))).toEqual([]);
});

test('the Advanced fold keeps copy prompt, paste JSON and the example', async ({ page }) => {
  await fake(page, () => ({ text: script(7) }));
  await open(page);
  await page.getByText('Advanced: write the script yourself').click();
  await expect(page.getByRole('button', { name: 'Copy prompt for Claude' })).toBeVisible();
  await expect(page.getByLabel('Paste the script Claude wrote (JSON)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try an example script' })).toBeVisible();
  await page.getByLabel('Paste the script Claude wrote (JSON)').fill(script(5));
  await expect(page.getByText('This script looks good: 5 slides')).toBeVisible();
  await page.getByRole('button', { name: 'Use this script' }).click();
  await allDrawn(page, 5);
});
