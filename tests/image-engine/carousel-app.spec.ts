// Step 8: the carousel editor inside the real app (Images > Make a carousel), used like a person would use it.
// Screenshots of each state go to out/image-engine/app-flow/ and are shown on the Results screen (Step 8).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { exampleScript } from '../../src/carousel/script';
import { outUrl, writeStepResults, type ResultsItem } from './results';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/app-flow');
const SHOTS: { file: string; title: string; note: string }[] = [];

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1280, height: 900 } });
test.beforeAll(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
});

let shotN = 0;
const shot = async (page: Page, name: string, title: string, note: string) => {
  const file = `${String(++shotN).padStart(2, '0')}-${name}.png`;
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, file) });
  SHOTS.push({ file, title, note });
};

const EXAMPLE = exampleScript('carousel');
const open = async (page: Page) => {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
};
/** The copy-prompt, paste and example tools live in the Advanced fold since Step 9. */
const openAdvanced = async (page: Page) => {
  const d = page.locator('details.cr-advanced');
  if (!(await d.evaluate((el) => (el as HTMLDetailsElement).open))) await page.getByText('Advanced: write the script yourself').click();
};
const paste = async (page: Page, text: string) => {
  await openAdvanced(page);
  const box = page.getByLabel('Paste the script Claude wrote (JSON)');
  await box.fill(text);
};
const slideCard = (page: Page, n: number) => page.getByRole('listitem', { name: new RegExp(`^Slide ${n} of`) });
/** Every slide has been drawn and checked. */
const allDrawn = async (page: Page, count = 7) => {
  await expect(page.locator('.cr-card')).toHaveCount(count);
  await expect(page.locator('.cr-card .cr-pic img')).toHaveCount(count, { timeout: 30_000 });
  await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(count, { timeout: 30_000 });
};
const srcs = (page: Page) => page.locator('.cr-card .cr-pic img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
const loadExample = async (page: Page) => {
  await open(page);
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Try an example script' }).click();
  await allDrawn(page);
};
const undoBtn = (page: Page) => page.getByRole('button', { name: /^Undo/ });
const redoBtn = (page: Page) => page.getByRole('button', { name: /^Redo/ });

test.beforeEach(async ({ page, context }) => {
  // The shuffle button picks a random salt. A fixed seed makes every run the same (the button must work for any seed: see the test of 20 presses).
  await page.addInitScript(() => {
    let a = 0x9e3779b9;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
});

test('the Images screen has a Make a carousel action that opens the editor, with the text box, format, style and Generate', async ({ page }) => {
  await page.goto('/images');
  await shot(page, 'images-screen', 'The Images screen', 'A new "Make a carousel" button sits beside "Create image". Nothing else on the screen changed.');
  await page.getByRole('link', { name: 'Make a carousel' }).click();
  await expect(page).toHaveURL(/\/images\/carousel$/);
  await expect(page.getByRole('heading', { name: 'Make it from your text' })).toBeVisible();
  await expect(page.getByLabel('Your text, idea or article')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Carousel/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Quote card/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'Style', exact: true })).toBeVisible();
  await expect(page.getByText('Advanced: write the script yourself')).toBeVisible();
  await expect(page.getByText('No script yet')).toBeVisible();
  // Every stored style is in the picker with a small preview that really drew.
  const styles = page.getByRole('list', { name: 'Styles' }).getByRole('listitem');
  expect(await styles.count()).toBeGreaterThanOrEqual(5); // "Pick for me" and every stored style
  await expect(page.getByRole('button', { name: /^Pick for me/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('list', { name: 'Styles' }).locator('img')).toHaveCount((await styles.count()) - 1, { timeout: 30_000 });
  const ok = await page.getByRole('list', { name: 'Styles' }).locator('img').evaluateAll((els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 0));
  expect(ok).toBe(true);
  await shot(page, 'start', 'Start: format, style, script', 'Pick a format, pick a style (each has a small preview), then get a script.');
});

test('Advanced: Copy prompt for Claude puts the topic, the format and the rules on the clipboard', async ({ page }) => {
  await open(page);
  await page.getByLabel('Your text, idea or article').fill('Why small teams should write down decisions');
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Copy prompt for Claude' }).click();
  await expect(page.getByText(/Prompt copied/)).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Why small teams should write down decisions');
  expect(text).toContain('Exactly 7 slides');
  expect(text).toContain('"element_tags"');
  expect(text).toContain('one idea per slide'.replace('one', 'One'));
  expect(text).toMatch(/Do not invent figures/);
  expect(text).toMatch(/"type": "stat"/);
  await page.getByText('Show the prompt').click();
  const norm = (s: string) => s.replace(/\r/g, ''); // Windows clipboards turn line ends into CRLF
  expect(norm(await page.getByLabel('The prompt to paste into Claude').inputValue())).toBe(norm(text));
  // Quote cards ask for something different.
  await page.getByRole('button', { name: /^Quote card/ }).click();
  await page.getByRole('button', { name: 'Copy prompt for Claude' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('quote cards');
  await shot(page, 'prompt', 'Copy the prompt', 'In the Advanced fold: the prompt holds the text, the JSON format, and the rules, for anyone who wants to write the script in a chat.');
});

test('pasting a bad script says what is wrong and where, in plain words, and will not use it', async ({ page }) => {
  await open(page);
  await openAdvanced(page);
  const use = page.getByRole('button', { name: 'Use this script' });
  await expect(use).toBeDisabled();
  // 1. Not JSON at all: a missing comma.
  await paste(page, '{\n  "title": "x"\n  "slides": []\n}');
  const alert = page.locator('#cr-check [role="alert"]');
  await expect(alert).toContainText('not valid JSON');
  await expect(alert).toContainText(/line 3/);
  await expect(use).toBeDisabled();
  // 2. JSON, but the script is wrong in several places.
  const bad = JSON.parse(EXAMPLE);
  bad.slides = [...bad.slides, ...bad.slides]; // 14 slides: too many
  bad.slides[1].type = 'banner';
  delete bad.slides[2].headline;
  bad.slides[3].element_tags = ['one'];
  bad.slides[4].items = 'not a list';
  await paste(page, JSON.stringify(bad, null, 2));
  await expect(alert).toContainText('problems to fix');
  await expect(alert).toContainText('A carousel needs 3 to 10 slides (7 is usual). This script has 14.');
  await expect(alert).toContainText('Slide 2 has the type "banner". Use one of: cover, content, step');
  await expect(alert).toContainText('Slide 3 "headline" is missing');
  await expect(alert).toContainText('element_tags must have 2 to 4 tags');
  await expect(alert).toContainText('Slide 5 "items" must be a list');
  await expect(alert.locator('code').first()).toBeVisible();
  await expect(alert).toContainText('slides[2].headline');
  await expect(use).toBeDisabled();
  await expect(page.getByText('No script yet')).toBeVisible();
  await shot(page, 'bad-script', 'A bad script', 'Each problem names the slide and the place (for example slides[2].headline) and says what to do. The script is not used.');
});

test('pasting a good script (even inside a chat code block) loads it: seven slides, each drawn with its phone checks', async ({ page }) => {
  await open(page);
  await paste(page, 'Here is your carousel:\n\n```json\n' + EXAMPLE + '\n```\n\nLet me know if you want changes!');
  await expect(page.getByText('This script looks good: 7 slides')).toBeVisible();
  await page.getByRole('button', { name: 'Use this script' }).click();
  await allDrawn(page);
  await expect(page.getByText(/Script loaded: 7 slides/)).toBeAttached();
  await expect(page.getByLabel('Paste the script Claude wrote (JSON)')).toBeHidden(); // the Advanced fold closes once a script is in use
  const first = slideCard(page, 1);
  await expect(first.getByLabel('Headline')).toHaveValue('Fix your profile in 15 minutes');
  await expect(first.getByRole('list', { name: 'Picture tags (2 to 4)' }).getByText('profile')).toBeVisible();
  // Every card says what it is, has its phone-check badge, and the picture is one slide (1080 x 1350).
  const dims = await page.locator('.cr-card .cr-pic img').evaluateAll((els) => els.map((e) => `${(e as HTMLImageElement).naturalWidth}x${(e as HTMLImageElement).naturalHeight}`));
  expect([...new Set(dims)]).toEqual(['1080x1350']);
  await page.getByRole('heading', { name: 'Your slides' }).scrollIntoViewIfNeeded();
  await shot(page, 'slides', 'The script loaded: seven slides', 'Each slide is a card: its own picture with phone-size check badges, every field editable, tag chips and per-slide actions.');
  await slideCard(page, 5).scrollIntoViewIfNeeded();
  await shot(page, 'slide-card', 'One slide card', 'Type, fields, tags, layout, shuffle, regenerate, download, and the elements on the slide.');
});

test('editing a headline redraws only that slide; undo and redo bring the old and new text back', async ({ page }) => {
  await loadExample(page);
  const before = await srcs(page);
  const card = slideCard(page, 2);
  await card.getByLabel('Headline').fill('Say who you help');
  await expect.poll(async () => (await srcs(page))[1], { timeout: 20_000 }).not.toBe(before[1]);
  await allDrawn(page);
  const after = await srcs(page);
  for (const i of [0, 2, 3, 4, 5, 6]) expect(after[i], `slide ${i + 1} should not have been redrawn`).toBe(before[i]);
  await expect(undoBtn(page)).toContainText('Edit headline on slide 2');
  await undoBtn(page).click();
  await expect(card.getByLabel('Headline')).toHaveValue('Rewrite your headline');
  await expect.poll(async () => (await srcs(page))[1], { timeout: 20_000 }).toBe(before[1]);
  await redoBtn(page).click();
  await expect(card.getByLabel('Headline')).toHaveValue('Say who you help');
  // A required field cannot be emptied: it says so and keeps the old text on the slide.
  await card.getByLabel('Headline').fill('');
  await expect(card.getByRole('alert').filter({ hasText: /headline.*missing/i })).toBeVisible();
  await card.getByLabel('Headline').fill('Say who you help, first');
  await expect(card.getByRole('alert').filter({ hasText: /missing/ })).toHaveCount(0);
  // Typing many characters is one undo step.
  await undoBtn(page).click();
  await expect(card.getByLabel('Headline')).toHaveValue('Say who you help');
  await shot(page, 'edit-headline', 'Edit a headline', 'The slide redraws a moment after typing stops. The Undo button names the last change.');
});

test('tags are chips: removing below two or adding above four is refused with a reason; adding a good tag works and can be undone', async ({ page }) => {
  await loadExample(page);
  const card = slideCard(page, 3);
  const tags = card.getByRole('list', { name: 'Picture tags (2 to 4)' });
  await expect(tags.getByRole('listitem')).toHaveCount(2);
  await card.getByRole('button', { name: 'Remove tag growth' }).click();
  await expect(card.getByRole('alert').filter({ hasText: /2 to 4 tags/ })).toBeVisible();
  await expect(tags.getByRole('listitem')).toHaveCount(2);
  const add = card.getByLabel('Add a picture tag');
  await add.fill('money');
  await add.press('Enter');
  await expect(tags.getByRole('listitem')).toHaveCount(3);
  await expect(undoBtn(page)).toContainText('Change tags on slide 3');
  await undoBtn(page).click();
  await expect(tags.getByRole('listitem')).toHaveCount(2);
});

test('changing the style restyles the same script; undo goes back', async ({ page }) => {
  await loadExample(page);
  const before = await srcs(page);
  const picker = page.getByRole('list', { name: 'Styles' });
  const buttons = picker.getByRole('button');
  const pressed = await buttons.evaluateAll((els) => els.findIndex((e) => e.getAttribute('aria-pressed') === 'true'));
  const current = buttons.nth(pressed);
  const currentName = await current.innerText();
  const count = await buttons.count();
  const other = buttons.nth(pressed + 1 < count ? pressed + 1 : 1); // index 0 is "Pick for me"
  const otherName = await other.innerText();
  await other.click();
  await expect(other).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await srcs(page))[0], { timeout: 30_000 }).not.toBe(before[0]);
  await allDrawn(page);
  await expect(slideCard(page, 1).getByLabel('Headline')).toHaveValue('Fix your profile in 15 minutes'); // same words
  await expect(undoBtn(page)).toContainText('Change style to');
  await shot(page, 'style-switched', 'Another style, same script', `Switched from ${currentName.split('\n')[0]} to ${otherName.split('\n')[0]}. The words did not change.`);
  await undoBtn(page).click();
  await expect(current).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await srcs(page))[0], { timeout: 30_000 }).toBe(before[0]);
});

test('per-slide actions are patches: layout, shuffle, swap an element, regenerate, and undo each', async ({ page }) => {
  await loadExample(page);
  const card = slideCard(page, 2);
  const start = (await srcs(page))[1];
  // layout
  const layout = card.getByLabel('Layout');
  const options = await layout.locator('option').allInnerTexts();
  expect(options.length).toBeGreaterThanOrEqual(2);
  const now = await layout.inputValue();
  await layout.selectOption(options.find((o) => o !== now)!);
  await expect.poll(async () => (await srcs(page))[1], { timeout: 20_000 }).not.toBe(start);
  await expect(undoBtn(page)).toContainText('Change layout on slide 2');
  // shuffle
  const afterLayout = (await srcs(page))[1];
  await card.getByRole('button', { name: 'Shuffle elements' }).click();
  await expect(undoBtn(page)).toContainText('Shuffle elements on slide 2');
  await expect.poll(async () => (await srcs(page))[1], { timeout: 20_000 }).not.toBe(afterLayout);
  // swap
  await card.getByText(/Elements on this slide/).click();
  const swap = card.getByRole('combobox', { name: /^Swap .* for another element/ }).first();
  await expect(swap).toBeVisible();
  const afterShuffle = (await srcs(page))[1];
  const choice = (await swap.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean)))[0];
  await swap.selectOption(choice);
  await expect(undoBtn(page)).toContainText('Swap an element on slide 2');
  await expect.poll(async () => (await srcs(page))[1], { timeout: 20_000 }).not.toBe(afterShuffle);
  await expect(card.getByText(choice, { exact: false }).first()).toBeVisible();
  // regenerate from the plan: back to the style's own choice, undoable
  await card.getByRole('button', { name: 'Regenerate from the plan' }).click();
  await expect(undoBtn(page)).toContainText('Regenerate slide 2 from the plan');
  await expect.poll(async () => (await srcs(page))[1], { timeout: 20_000 }).toBe(start);
  // undo all four
  for (const label of ['Regenerate slide 2', 'Swap an element on slide 2', 'Shuffle elements on slide 2', 'Change layout on slide 2']) {
    await expect(undoBtn(page)).toContainText(label);
    await undoBtn(page).click();
  }
  await expect.poll(async () => (await srcs(page))[1], { timeout: 20_000 }).toBe(start);
  await expect(redoBtn(page)).toContainText('Change layout on slide 2');
  await shot(page, 'slide-actions', 'Per-slide actions', 'Layout, shuffle, swap and regenerate are all undoable patches.');
});

test('Shuffle elements changes the picture every time it is pressed (20 presses)', async ({ page }) => {
  test.setTimeout(240_000);
  await loadExample(page);
  const card = slideCard(page, 2);
  let last = (await srcs(page))[1];
  for (let n = 1; n <= 20; n++) {
    await card.getByRole('button', { name: 'Shuffle elements' }).click();
    await expect.poll(async () => (await srcs(page))[1], { timeout: 20_000, message: `press ${n} did not change the picture` }).not.toBe(last);
    await expect(card.getByText('No other pictures fit this slide.')).toHaveCount(0);
    last = (await srcs(page))[1];
  }
});

test('Shuffle elements says so, and changes nothing, when no other choice fits the slide', async ({ page }) => {
  // A random source that always gives the same number can only ever try one salt: the second press has nothing new to try.
  await page.addInitScript(() => {
    Math.random = () => 0.123456;
  });
  await loadExample(page);
  const card = slideCard(page, 2);
  await card.getByRole('button', { name: 'Shuffle elements' }).click();
  await page.waitForTimeout(1500);
  await card.getByRole('button', { name: 'Shuffle elements' }).click();
  await expect(card.getByText('No other pictures fit this slide.')).toBeVisible();
  const before = (await srcs(page))[1];
  await page.waitForTimeout(1500);
  expect((await srcs(page))[1]).toBe(before);
});

test('a slide opens full size, with next and previous, and closes with Escape', async ({ page }) => {
  await loadExample(page);
  await page.getByRole('button', { name: /slide 3 full size/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Slide at full size' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByText('Slide 3 of 7')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(dlg.getByText('Slide 4 of 7')).toBeVisible();
  await shot(page, 'full-size', 'Full size', 'A click opens the slide big. Left and right arrows move between slides, Escape closes.');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
});

test('export: one slide as a PNG, all slides as a zip of individual files named by deck and number', async ({ page }) => {
  await loadExample(page);
  // one slide
  const [one] = await Promise.all([page.waitForEvent('download'), slideCard(page, 4).getByRole('button', { name: 'Download PNG' }).click()]);
  expect(one.suggestedFilename()).toBe('fix-your-profile-in-15-minutes-04.png');
  const png = fs.readFileSync((await one.path())!);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1350);
  // all
  const [all] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all/ }).click()]);
  expect(all.suggestedFilename()).toBe('fix-your-profile-in-15-minutes.zip');
  const zip = fs.readFileSync((await all.path())!);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(zip.readUInt16LE(end + 10)).toBe(7);
  let p = zip.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < 7; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(p + 16);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const at = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    names.push(name);
    const dataStart = at + 30 + zip.readUInt16LE(at + 26) + zip.readUInt16LE(at + 28);
    const data = zip.subarray(dataStart, dataStart + size);
    expect(zlib.crc32(data), name).toBe(crc);
    expect([...data.subarray(0, 4)], name).toEqual([137, 80, 78, 71]);
    expect(data.readUInt32BE(16)).toBe(1080);
    p += 46 + nameLen;
  }
  expect(names).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `fix-your-profile-in-15-minutes-0${n}.png`));
  await shot(page, 'exported', 'Exported', 'One PNG per slide, or a zip of individual files named by deck and number.');
});

test('refresh and recover: the script, the edits, the style and the undo history survive a reload', async ({ page }) => {
  await loadExample(page);
  const card = slideCard(page, 2);
  await card.getByLabel('Headline').fill('Say who you help');
  await expect(undoBtn(page)).toContainText('Edit headline on slide 2');
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { pressed: false }).filter({ hasNotText: 'Pick for me' }).first().click();
  await allDrawn(page);
  const styleName = await page.getByRole('list', { name: 'Styles' }).getByRole('button', { pressed: true }).innerText();
  await expect(page.getByText(/Saved in this browser/)).toBeVisible();
  await page.reload();
  await allDrawn(page);
  await expect(slideCard(page, 2).getByLabel('Headline')).toHaveValue('Say who you help');
  expect(await page.getByRole('list', { name: 'Styles' }).getByRole('button', { pressed: true }).innerText()).toBe(styleName);
  await expect(undoBtn(page)).toContainText('Change style to');
  await undoBtn(page).click();
  await undoBtn(page).click();
  await expect(slideCard(page, 2).getByLabel('Headline')).toHaveValue('Rewrite your headline');
  await shot(page, 'recovered', 'After a refresh', 'The project is back as it was, including the undo history.');
  // Pasted text that was not used yet is kept too.
  await paste(page, '{ "slides": [');
  await expect(page.getByText(/not valid JSON/)).toBeVisible();
  await page.reload();
  await openAdvanced(page);
  await expect(page.getByLabel('Paste the script Claude wrote (JSON)')).toHaveValue('{ "slides": [');
});

test('a broken or unknown saved project never crashes the page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('creator.carousel.project.v1', JSON.stringify({ project: { doc: { version: 1, format: 'carousel', style: 'gone', topic: 'kept', script: { slides: [1, 2] }, choices: {} }, past: [], future: [] } })));
  await open(page);
  await expect(page.getByLabel('Your text, idea or article')).toHaveValue('kept');
  await expect(page.getByText('No script yet')).toBeVisible();
  await page.addInitScript(() => localStorage.setItem('creator.carousel.project.v1', '{not json'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
});

test('quote cards: a different format, square, with its own example; changing format keeps the script safe with undo', async ({ page }) => {
  await loadExample(page);
  await page.getByRole('button', { name: /^Quote card/ }).click();
  await expect(page.getByText(/script was for the other format, so it was cleared/)).toBeAttached();
  await expect(page.getByText('No script yet')).toBeVisible();
  await undoBtn(page).click();
  await allDrawn(page);
  await page.getByRole('button', { name: /^Quote card/ }).click();
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Try an example script' }).click();
  await allDrawn(page, 3);
  const dims = await page.locator('.cr-card .cr-pic img').evaluateAll((els) => els.map((e) => `${(e as HTMLImageElement).naturalWidth}x${(e as HTMLImageElement).naturalHeight}`));
  expect([...new Set(dims)]).toEqual(['1080x1080']);
  await shot(page, 'quote-cards', 'Quote cards', 'Square 1:1 cards from the same style, one per quote.');
});

test('keyboard and screen readers: the whole flow works without a mouse, and controls have names', async ({ page }) => {
  await open(page);
  // Tab reaches the format chips, the styles, the topic, the buttons, in reading order.
  await page.getByRole('button', { name: /^Carousel/ }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Quote card/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: /^Slides/ })).toBeFocused();
  const firstStyle = page.getByRole('list', { name: 'Styles' }).getByRole('listitem').filter({ hasNotText: 'Pick for me' }).first().getByRole('button');
  await firstStyle.focus();
  await page.keyboard.press('Enter');
  await expect(firstStyle).toHaveAttribute('aria-pressed', 'true');
  // The example loads with the keyboard, and fields are reachable by their labels.
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Try an example script' }).focus();
  await page.keyboard.press('Enter');
  await allDrawn(page);
  const card = slideCard(page, 6);
  await expect(card.getByLabel('Big number')).toBeVisible();
  await expect(card.getByLabel('What the number means')).toBeVisible();
  // Undo with the keyboard outside a text field.
  await card.getByLabel('Big number').fill('4x');
  await expect(undoBtn(page)).toContainText('Edit big number on slide 6');
  await page.getByRole('heading', { name: 'Your slides' }).click();
  await page.keyboard.press('Control+z');
  await expect(card.getByLabel('Big number')).toHaveValue('3x');
  await page.keyboard.press('Control+Shift+z');
  await expect(card.getByLabel('Big number')).toHaveValue('4x');
  // Every button and field on the page has a name, and every picture has alt text.
  const unnamed = await page.evaluate(() => {
    const bad: string[] = [];
    document.querySelectorAll('button, input, textarea, select').forEach((el) => {
      const e = el as HTMLElement;
      const name = e.getAttribute('aria-label') || (e as HTMLInputElement).labels?.[0]?.textContent || e.textContent || e.getAttribute('title');
      if (!name || !name.trim()) bad.push(e.outerHTML.slice(0, 80));
    });
    document.querySelectorAll('img').forEach((i) => !i.getAttribute('alt') && bad.push(i.outerHTML.slice(0, 80)));
    return bad;
  });
  expect(unnamed).toEqual([]);
});

test('only shippable pictures: no private test asset is ever asked for, and the build guard still passes', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => asked.push(r.url()));
  await loadExample(page);
  expect(asked.filter((u) => /test-assets|test-images/.test(u))).toEqual([]);
  // No network call to anywhere but this app (no model, no key).
  const origin = new URL(page.url()).origin;
  // The page shell (index.html, older than this step) loads its two UI fonts from Google Fonts; the carousel code makes no call of its own.
  expect(asked.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:') && !new URL(u).hostname.match(/^fonts\.(googleapis|gstatic)\.com$/))).toEqual([]);
  const src = fs.readdirSync(path.join(ROOT, 'src/carousel')).map((f) => fs.readFileSync(path.join(ROOT, 'src/carousel', f), 'utf8')).join('\n');
  expect(src).not.toMatch(/test-assets/);
  expect(src).not.toMatch(/api[_-]?key|Authorization/i);
  const noWriter = fs.readdirSync(path.join(ROOT, 'src/carousel')).filter((f) => f !== 'writer.ts').map((f) => fs.readFileSync(path.join(ROOT, 'src/carousel', f), 'utf8')).join('\n');
  expect(noWriter).not.toMatch(/fetch\(|XMLHttpRequest/); // only writer.ts talks to the network, and only to this app's own endpoints
  const writerSrc = fs.readFileSync(path.join(ROOT, 'src/carousel/writer.ts'), 'utf8');
  expect(writerSrc).not.toMatch(/anthropic\.com|https?:\/\//);
});

test('the old mock carousel path is still there behind a flag', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('creator.mockCarousel', '1'));
  await page.goto('/images');
  await expect(page.getByRole('link', { name: 'Make a carousel' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Make a carousel (mock)' }).click();
  await expect(page.getByRole('heading', { name: 'Create an image' })).toBeVisible();
});

test('on a phone-width screen nothing runs off the side and the controls stay usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await loadExample(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await slideCard(page, 2).scrollIntoViewIfNeeded();
  await shot(page, 'phone-width', 'On a phone-width screen', 'The card stacks: picture, then fields. Tested at 390 px wide in Chrome only, not on a real phone.');
});

test('MEASURE: drawing and exporting 7 slides keeps the page responsive (what was measured, on which machine)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/images/carousel');
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __gaps: number[] };
    w.__long = [];
    w.__gaps = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ entryTypes: ['longtask'] });
    let last = performance.now();
    const tick = (t: number) => {
      w.__gaps.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await openAdvanced(page);
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Try an example script' }).click();
  await allDrawn(page);
  const drawMs = Date.now() - t0;
  const afterDraw = await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __gaps: number[] };
    const r = { long: [...w.__long], gaps: [...w.__gaps] };
    w.__long = [];
    w.__gaps = [];
    return r;
  });
  const t1 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download all/ }).click()]);
  await dl.path();
  const exportMs = Date.now() - t1;
  const afterExport = await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __gaps: number[] };
    return { long: [...w.__long], gaps: [...w.__gaps] };
  });
  const max = (a: number[]) => (a.length ? Math.round(Math.max(...a)) : 0);
  const cpu = os.cpus();
  const result = {
    machine: `${cpu[0].model.trim()}, ${cpu.length} logical cores, ${Math.round(os.totalmem() / 1073741824)} GB memory, ${os.platform()} ${os.release()}`,
    browser: page.context().browser()?.version() ?? 'Chrome',
    note: 'Installed Chrome driven by Playwright, one run, not a benchmark. A slower computer will take longer to draw.',
    draw: { slides: 7, wallMs: drawMs, longestLongTaskMs: max(afterDraw.long), longTasksOver50ms: afterDraw.long.length, longestFrameGapMs: max(afterDraw.gaps) },
    exportAll: { slides: 7, wallMs: exportMs, longestLongTaskMs: max(afterExport.long), longTasksOver50ms: afterExport.long.length, longestFrameGapMs: max(afterExport.gaps) },
  };
  fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  // A page that stays usable: no single block of work longer than a second while drawing or exporting.
  expect(result.draw.longestLongTaskMs).toBeLessThan(1000);
  expect(result.exportAll.longestLongTaskMs).toBeLessThan(1000);
});

test.afterAll(() => {
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(SHOTS, null, 2));
  const m = fs.existsSync(path.join(OUT, 'measurements.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'measurements.json'), 'utf8')) : null;
  const states: ResultsItem[] = SHOTS.map((x) => ({ id: x.file, title: x.title, images: [{ url: outUrl(path.join(OUT, x.file)), label: x.note }], tag: 'REAL' }));
  const findings: ResultsItem[] = [
  {
    "id": "json-problems-named-slides-fro",
    "title": "JSON problems named slides from zero",
    "tag": "FIXED",
    "images": [],
    "facts": [
      "A bad script listed slides[1].type next to \"Slide 2\", so two numbers described one slide. The message now comes first and the JSON place is labelled \"(in the JSON: ...)\"."
    ]
  },
  {
    "id": "the-script-form-stayed-huge-af",
    "title": "The script form stayed huge after a script loaded",
    "tag": "FIXED",
    "images": [],
    "facts": [
      "After loading, the paste box and prompt filled a screen above the slides. In Step 9 the old script tools moved into a closed \"Advanced\" fold."
    ]
  },
  {
    "id": "the-slide-scrolled-out-of-sigh",
    "title": "The slide scrolled out of sight while editing its fields",
    "tag": "FIXED",
    "images": [],
    "facts": [
      "A tall form beside a small picture meant you could not see the effect of an edit. The picture now stays in view beside the fields."
    ]
  },
  {
    "id": "two-fields-were-both-called-n",
    "title": "Two fields were both called \"Number\"",
    "tag": "FIXED",
    "images": [],
    "facts": [
      "On the number slide the step number and the big number were hard to tell apart for a screen reader. It is now \"Big number\"."
    ]
  },
  {
    "id": "layout-names-are-technical",
    "title": "Layout names are technical",
    "tag": "NOT FIXED",
    "images": [],
    "facts": [
      "The layout list shows names like step-pill or cover-centre. They do not say what they look like. A small picture per layout would be better."
    ]
  },
  {
    "id": "swapping-an-element-shows-name",
    "title": "Swapping an element shows names, not pictures",
    "tag": "NOT FIXED",
    "images": [],
    "facts": [
      "The swap list is a plain dropdown of names (up to 30), so you cannot see what you are choosing before you choose it."
    ]
  },
  {
    "id": "one-project-at-a-time-and-it-",
    "title": "One project at a time, and it is not listed on the Images screen",
    "tag": "NOT FIXED",
    "images": [],
    "facts": [
      "The project lives in this browser only. A finished carousel does not appear in the Images list, and Start over (a browser confirm box) removes it."
    ]
  },
  {
    "id": "tags-cannot-drop-below-two",
    "title": "Tags cannot drop below two",
    "tag": "NOT FIXED",
    "images": [],
    "facts": [
      "To replace a tag you must add the new one first, then remove the old one. The reason is shown, but the order is surprising."
    ]
  },
  {
    "id": "layout-and-element-choices-mea",
    "title": "Layout and element choices mean nothing after a style change",
    "tag": "NOT FIXED",
    "images": [],
    "facts": [
      "A layout chosen in one style is ignored in a style that lacks it (the style default is used silently)."
    ]
  },
  {
    "id": "copy-when-the-browser-blocks-t",
    "title": "Copy when the browser blocks the clipboard",
    "tag": "NOT TESTED",
    "images": [],
    "facts": [
      "The fallback (the prompt is shown to select by hand) is written but only the allowed path was run."
    ]
  },
  {
    "id": "safari-firefox-a-real-phone-",
    "title": "Safari, Firefox, a real phone, a screen reader",
    "tag": "NOT TESTED",
    "images": [],
    "facts": [
      "Only installed Chrome was used. Keyboard use and accessible names were checked by tests, not by assistive technology."
    ]
  },
  {
    "id": "the-page-shell-loads-google-fo",
    "title": "The page shell loads Google Fonts",
    "tag": "NOTE",
    "images": [],
    "facts": [
      "index.html (older than this step) asks Google for the UI fonts. The carousel code and the slides use only bundled fonts and make no network call of its own."
    ]
  }
];
  const measure: ResultsItem[] = m ? [{ id: 'measure', title: 'Drawing and exporting 7 slides', images: [], tag: 'MEASURED', facts: [m.machine, 'Chrome ' + m.browser, `drawing 7 slides: ${m.draw.wallMs} ms, longest block of work ${m.draw.longestLongTaskMs} ms, ${m.draw.longTasksOver50ms} blocks over 50 ms, longest gap between frames ${m.draw.longestFrameGapMs} ms`, `zip of 7 from the drawn slides: ${m.exportAll.wallMs} ms, longest block ${m.exportAll.longestLongTaskMs} ms`, m.note, 'Fabric cannot run in a Web Worker (it needs a document), so a Worker was not used: slides are drawn one at a time with a pause between them.'] }] : [];
  writeStepResults({
    id: 'step8',
    title: 'Step 8: Carousel editor in the app',
    order: 8,
    intro: 'Images > Make a carousel: format, style, script (copy a prompt for Claude, or paste JSON), editable slide cards with phone checks, per-slide actions with undo, export, autosave. These pictures are screenshots of the real app taken by the tests, state by state. No API key, no network call from the carousel code.',
    groups: [
      { title: 'The flow, state by state', items: states },
      { title: 'Does exporting freeze the page?', items: measure },
      { title: 'What felt confusing or broken when used like a person', note: 'Found by using the editor; FIXED ones were fixed in this step.', items: findings },
    ],
  });
});
