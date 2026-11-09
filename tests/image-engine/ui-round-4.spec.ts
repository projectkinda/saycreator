// UI round 4 (ZERO model calls beyond the one FAKE writer answer that makes a written deck):
//   B  "Split into two slides" for a slide with too many words: every word kept, in order; one undo step; both halves pass the phone check
//   C1 a highlight in a colour-only style is clearly visible (Quiet dark cover, "saves two rounds")
//   C2 no sample handle in the example script or the prompt; a pasted script with no handle draws none, one with its own handle draws it
//   C3 the phone edit bar: Done at the right of the title row
// Screenshots: out/ui-round-4/
import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { deckDrawn, openTab, toStep } from './ui';

test.setTimeout(300_000);
const KEY = 'creator.carousel.project.v1';
const OUT = 'out/ui-round-4';
const SAMPLE = fs.readFileSync(path.join('sample-scripts', 'agency-client-brief.json'), 'utf8');
const LONG_BODY = 'The brief is the one page the whole project leans on, so write it for a stranger. State the goal, the owner and the date in the first lines. Say who will use the result and what they do next. Name the one thing that must not change. Then list what is out of scope, so nobody has to guess. Finish with how you will know it worked. Read it out loud once.';
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);

const fixture = JSON.parse(fs.readFileSync('tests/image-engine/fixtures/hot-flat-app-library.json', 'utf8')).library;
const TEXT = 'Stop storing your life in your head. Hold things in a system you trust. Three steps: capture, sort, review. Build your own. Join the waitlist today.';

async function counting(page: Page, writer = '{}') {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'x' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'x' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: writer, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const proj = (page: Page) => page.evaluate((key) => {
  const d = (JSON.parse(localStorage.getItem(key) ?? '{}') as { project?: { doc?: any } }).project?.doc;
  const l = d?.designed?.library;
  return { specs: (l?.plan?.specs ?? []) as { layout: string; fields: Record<string, any>; accents: string[] }[], layouts: (l?.layouts ?? []) as string[], calls: (d?.designed?.calls ?? 0) as number, script: d?.script, choices: d?.choices ?? {}, built: Object.keys(d?.designed?.slides ?? {}).length };
}, KEY);
async function pasteScript(page: Page, text: string, style = 'Hot flat') {
  await page.goto('/images/carousel');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: new RegExp(style) }).first().click();
  await toStep(page, 1);
  await page.getByRole('button', { name: 'I already have a script' }).click();
  await page.getByLabel('Paste the script Claude wrote (JSON)').fill(text);
  await page.getByRole('button', { name: 'Use this script' }).click();
  await deckDrawn(page, JSON.parse(text).slides.length);
}
/** The text of a spec's body fields in reading order (what a split must keep). */
const bodyWords = (f: Record<string, any>) => words(['p1', 'p2', 'p3', 'pull', 'paragraph', 'body'].flatMap((k) => (Array.isArray(f[k]) ? f[k] : typeof f[k] === 'string' ? [f[k]] : [])).join(' '));

test('B: a pasted-script slide with 84 words gets "Split into two slides": every word kept in order, the second slide has no headline, one Undo, 0 model calls, both halves pass the phone check', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const f = await counting(page);
  const long = JSON.parse(SAMPLE);
  const k = 2;
  long.slides[k].body = LONG_BODY;
  await pasteScript(page, JSON.stringify(long));
  const before = await proj(page);
  expect(before.specs.length).toBe(7);
  expect(words(LONG_BODY).length, 'the test slide is over the words limit').toBeGreaterThan(70);
  // the warning and the button under it
  await page.getByTestId('edit-slides').click();
  await page.getByRole('button', { name: 'Show slide 3', exact: true }).click();
  await openTab(page, 'Text', 3);
  const split = page.getByTestId('split-slide');
  await expect(split).toBeVisible();
  await expect(split).toHaveText('Split into two slides');
  await split.click();
  await expect(page.getByTestId('split-msg')).toContainText('Every word is kept', { timeout: 60_000 });
  await expect.poll(async () => (await proj(page)).specs.length, { timeout: 30_000 }).toBe(8);
  const after = await proj(page);
  expect(after.specs.length, 'two slides instead of one').toBe(8);
  await expect(page.locator('.cr-film li')).toHaveCount(8);
  await expect(page.locator('.cr-stage-n')).toContainText('/ 8');
  // every word, exactly as written and in order; the headline stays on the first slide; the second has none
  expect(bodyWords(after.specs[k].fields).concat(bodyWords(after.specs[k + 1].fields))).toEqual(words(LONG_BODY));
  expect(JSON.stringify(after.specs[k].fields)).toContain('Name the one decision maker');
  expect(after.specs[k + 1].fields.heading ?? after.specs[k + 1].fields.title ?? after.specs[k + 1].fields.headline ?? '').toBe('');
  expect(after.script.slides.length).toBe(8);
  // the cut is at a sentence end: the first half ends with a full stop
  expect(String(after.specs[k].fields.p2 ?? after.specs[k].fields.p1 ?? after.specs[k].fields.body).trim()).toMatch(/[.!?]$/);
  // both halves pass the phone check: nothing "to fix" in the line above the preview
  await expect(page.locator('p[role="status"]').filter({ hasText: /slides? pass|something to fix/ }).first()).not.toContainText('something to fix', { timeout: 60_000 });
  expect(f.calls).toBe(0);
  expect(after.calls).toBe(0);
  // one Undo takes the whole split back
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await proj(page)).specs.length, { timeout: 30_000 }).toBe(7);
  const undone = await proj(page);
  expect(JSON.stringify(undone.specs)).toBe(JSON.stringify(before.specs));
  expect(undone.script.slides.length).toBe(7);
  await expect(page.locator('.cr-film li')).toHaveCount(7);
  expect(f.calls).toBe(0);
});

test('B: in a written deck the split works the same way (a prose slide whose text was lengthened in the Text tab)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const specs = fixture.plan.specs.map((s: any) => ({ layout: s.layout, fields: s.fields, accents: s.accents }));
  const P1 = 'Most plans fail on day two because nobody wrote down the first small step. Write it now.';
  specs[1] = { layout: 'prose', fields: { heading: 'Why it matters', p1: P1 }, accents: [] };
  const f = await counting(page, JSON.stringify({ title: 'Stop storing your life in your head', slides: specs }));
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Hot flat/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, specs.length);
  expect(f.calls).toBe(1);
  await page.getByTestId('edit-slides').click();
  await page.getByRole('button', { name: 'Show slide 2', exact: true }).click();
  await openTab(page, 'Text', 2);
  const P2 = 'Then say who does it, by when, and how you will know it is done. Put the answer where the whole team can see it every morning. Review it on Friday. Write the next small step at once, before anything else gets in the way. Then do it again, and again, and again, until it is a habit.';
  await page.getByLabel(/^Paragraph 2/).fill(P2);
  await expect.poll(async () => JSON.stringify((await proj(page)).specs[1].fields), { timeout: 30_000 }).toContain('who does it');
  const before = await proj(page);
  expect(bodyWords(before.specs[1].fields).length).toBeGreaterThan(70);
  await expect(page.getByTestId('split-slide')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('split-slide').click();
  await expect(page.getByTestId('split-msg')).toContainText('Every word is kept', { timeout: 60_000 });
  await expect.poll(async () => (await proj(page)).specs.length, { timeout: 30_000 }).toBe(before.specs.length + 1);
  const after = await proj(page);
  expect(bodyWords(after.specs[1].fields).concat(bodyWords(after.specs[2].fields))).toEqual(bodyWords(before.specs[1].fields));
  expect(after.specs[1].fields.heading).toBe('Why it matters');
  expect(after.calls).toBe(before.calls);
  expect(f.calls).toBe(1);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await proj(page)).specs.length, { timeout: 30_000 }).toBe(before.specs.length);
});

test('B: the split rule on its own: a sentence boundary nearest the middle; one long sentence is cut at a comma, then at a space, never inside a word', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const S = await import('/src/carousel/splitSlide.ts');
    const fits = () => true;
    const run = (p1: string) => S.splitSpec({ layout: 'prose', fields: { heading: 'H', p1 } as never, accents: [] }, fits) as any;
    const sent = run('One two three four five. Six seven eight nine ten eleven twelve. Thirteen fourteen fifteen.');
    const comma = run('One long sentence that runs on and on, with a comma near the middle, and then it keeps going until the very end of it');
    const space = run('Onelongsentencewithoutanycommas continues here until the very end of this single unbroken line of words');
    const one = run('Word');
    return { sent: sent.ok ? [sent.a.fields.p1, sent.b.fields.p1] : sent.reason, comma: comma.ok ? [comma.a.fields.p1, comma.b.fields.p1] : comma.reason, space: space.ok ? [space.a.fields.p1, space.b.fields.p1] : space.reason, one: one.ok };
  });
  expect(r.sent).toEqual(['One two three four five.', 'Six seven eight nine ten eleven twelve. Thirteen fourteen fifteen.']);
  const joined = (x: string[] | string) => (Array.isArray(x) ? x.join(' ') : x);
  expect(joined(r.comma)).toBe('One long sentence that runs on and on, with a comma near the middle, and then it keeps going until the very end of it');
  expect((r.comma as string[])[0].endsWith(',')).toBe(true);
  expect(joined(r.space)).toBe('Onelongsentencewithoutanycommas continues here until the very end of this single unbroken line of words');
  expect(r.one, 'a single word cannot be split').toBe(false);
});

test('C1: the Quiet dark cover shows the highlight "saves two rounds" clearly (a marker or a tint that differs enough from the text)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (script) => {
    const PR: any = await import('/src/carousel/presets.ts');
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const R: any = await import('/src/carousel/render.ts');
    const D: any = await import('/src/carousel/doc.ts');
    const pack = PR.presetPackFor('dark-quiet');
    const S: any = await import('/src/carousel/script.ts');
    const checked = S.validateScriptText(JSON.stringify(script), 'carousel').script;
    const made: any = await FS.libraryDeckFromScript(checked, { pack, brief: '', hasPhoto: false, images: [], site: '' }, '');
    if (!made.ok) throw new Error('not converted: ' + made.reason);
    const doc = { ...D.emptyDoc('dark-quiet'), script: made.script, designed: { ...made.designed, library: { ...made.designed.library, source: 'dark-quiet' } } };
    const { slides, margin } = R.composeDoc(doc);
    const layers = (made.designed.slides['0'].built.layers as any[]).filter((l) => l.kind === 'text');
    const hit = layers.find((l) => l.highlight || (l.runs && l.runs.length));
    const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const rendered: any = await R.renderer.render(slides[0], margin);
    const png = URL.createObjectURL(rendered.png);
    return { marked: !!hit, marker: !!hit?.highlight, words: hit?.highlight?.words ?? [], tintVsText: hit?.runs?.[0]?.color && hit?.style?.color ? ratio(String(hit.runs[0].color), String(hit.style.color)) : null, fails: rendered.lint.filter((l: any) => !l.pass).map((l: any) => l.reason), png: await (await fetch(png)).arrayBuffer().then((b) => { const u = new Uint8Array(b); let t = ''; for (let i = 0; i < u.length; i += 8192) t += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(t); }) };
  }, JSON.parse(SAMPLE));
  expect(r.marked, 'the phrase is marked on the Quiet dark cover').toBe(true);
  // either a marker bar on the words, or a tint that differs enough from the text colour (1.8:1 or more)
  expect(r.marker || (r.tintVsText ?? 0) >= 1.8, `marker ${r.marker}, tint vs text ${r.tintVsText}`).toBe(true);
  if (r.marker) expect(r.words.join(' ').toLowerCase()).toContain('saves');
  expect(r.fails, 'the slide passes the phone check').toEqual([]);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/desktop-3-quiet-dark-cover-highlight.png`, Buffer.from(r.png, 'base64'));
});

test('C2: the example script and the prompt carry no sample handle; a pasted script without a handle draws none, one with its own handle draws it', async ({ page, browser }) => {
  await page.goto('/images/carousel');
  const ex = await page.evaluate(async () => {
    const S: any = await import('/src/carousel/script.ts');
    return { carousel: S.exampleScript('carousel'), quote: S.exampleScript('quote'), prompt: S.scriptPrompt('A topic', 'carousel'), promptQuote: S.scriptPrompt('A topic', 'quote') };
  });
  for (const [name, t] of Object.entries(ex)) expect(t as string, `${name} has no sample handle`).not.toMatch(/@your\w+|"handle"/i);
  for (const file of fs.readdirSync('sample-scripts').filter((x) => x.endsWith('.json'))) expect(fs.readFileSync(path.join('sample-scripts', file), 'utf8'), file).not.toMatch(/@your\w+/i);
  // no handle drawn
  await counting(page);
  await pasteScript(page, SAMPLE);
  const built = await page.evaluate((key) => { const d = JSON.parse(localStorage.getItem(key) ?? '{}').project?.doc; return Object.values(d.designed.slides).map((s: any) => String(s.built.svg)); }, KEY);
  for (const [i, svg] of built.entries()) expect(svg.toLowerCase(), `slide ${i + 1}`).not.toMatch(/@your|yourname/);
  // its own handle is drawn as written
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await counting(p);
  const withHandle = { ...JSON.parse(SAMPLE), brand: { handle: '@jo.ke' } };
  await pasteScript(p, JSON.stringify(withHandle));
  const drawn = await p.evaluate((key) => { const d = JSON.parse(localStorage.getItem(key) ?? '{}').project?.doc; return Object.values(d.designed.slides).map((s: any) => String(s.built.svg)); }, KEY);
  expect(drawn.some((svg) => /jo\.ke/i.test(svg)), 'the handle in the script is drawn').toBe(true);
  await ctx.close();
});

test('C3: on a phone the Done button is at the right of the title row, centred with the title; the preview stays', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await counting(page);
  await pasteScript(page, SAMPLE);
  await page.getByTestId('edit-slides').click();
  await openTab(page, 'Text', 2);
  const r = await page.evaluate(() => {
    const bar = document.querySelector('.cr-edit-bar')!.getBoundingClientRect();
    const h = document.querySelector('.cr-edit-bar h2')!.getBoundingClientRect();
    const d = document.querySelector('.cr-edit-bar .btn')!.getBoundingClientRect();
    const m = document.querySelector('[data-testid="edit-mini"]')!.getBoundingClientRect();
    return { barRight: bar.right, hMid: h.top + h.height / 2, dMid: d.top + d.height / 2, dLeft: d.left, dRight: d.right, hRight: h.right, mRight: m.right, mW: m.width };
  });
  expect(Math.abs(r.hMid - r.dMid), 'Done is centred on the title line').toBeLessThan(6);
  expect(r.dRight, 'Done sits at the right edge of the bar').toBeGreaterThan(r.barRight - 8);
  expect(r.dLeft, 'Done is to the right of the title').toBeGreaterThan(r.hRight - 1);
  expect(r.mW / 390, 'the small preview stays (about 40%)').toBeGreaterThan(0.3);
});

test('screenshots: the Split button on the long slide, the result after splitting, the phone sticky bar', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const long = JSON.parse(SAMPLE);
  long.slides[2].body = LONG_BODY;
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    await counting(p);
    await pasteScript(p, JSON.stringify(long));
    await p.getByTestId('edit-slides').click();
    await p.getByRole('button', { name: 'Show slide 3', exact: true }).click();
    await openTab(p, 'Text', 3);
    await expect(p.getByTestId('split-slide')).toBeVisible();
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/desktop-1-text-tab-split-button.png` });
    await p.getByTestId('split-slide').click();
    await expect(p.getByTestId('split-msg')).toBeVisible({ timeout: 60_000 });
    await p.getByRole('button', { name: 'Done', exact: true }).first().click();
    await p.getByRole('button', { name: 'Show slide 3', exact: true }).click();
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/desktop-2-after-split-two-slides.png` });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    await counting(p);
    await pasteScript(p, SAMPLE);
    await p.getByTestId('edit-slides').click();
    await openTab(p, 'Text', 2);
    await p.evaluate(() => window.scrollTo(0, document.querySelector('[data-testid="text-tab-1"]')!.getBoundingClientRect().top + scrollY - 280));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/phone-4-sticky-bar-done-right.png` });
    await ctx.close();
  }
});
