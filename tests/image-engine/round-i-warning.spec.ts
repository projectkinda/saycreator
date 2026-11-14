// Round I part E: the false "Text slots do not overlap" warning. The check now compares the TEXT drawn in two slots (the laid lines), not their boxes, because the fit stage widens a label's box to the
// edge of the row (a label a touch bigger than its planned box): "Today" on the timeline slide had a box 890 px wide and 36 px of clear space to the next line. Two lines that really touch still warn.
// A FAKE writer only: ZERO real model calls.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(3 * 60_000);
const DOC_KEY = 'creator.carousel.project.v1';
const OLD_DOC = fs.readFileSync('tests/image-engine/fixtures/old-doc-no-scheme.json', 'utf8');

async function fake(page: Page) {
  let calls = 0;
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  const w = (x: any) => { calls++; return x.fulfill({ json: { text: '{}', ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  return () => calls;
}

test('E: boxes that overlap while the words are apart do not warn; words that really touch still do', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const FC: any = await import('/src/reference/faithfulChecks.ts');
    const base: any = { kind: 'text', rotation: 0, opacity: 1, role: 'content', visible: true, style: { font: 'Inter', weight: 500, size: 64, color: '#000000', align: 'left', valign: 'top', lineHeight: 1.25 } };
    const mk = (id: string, name: string, text: string, x: number, y: number, w: number) => ({ ...base, id, name, text, x, y, width: w, height: 90 });
    const run = (layers: any[]) => FC.faithfulChecks(layers, { canvas: { w: 1080, h: 1350 }, bg: '#FFFFFF', k: 1, slideType: 'content' }).find((c: any) => c.id === 'overlap');
    return {
      // the timeline's "Today" label: a box as wide as the row, the word itself short, the next line well to its right
      wideBoxApart: run([mk('a', 'body7', 'Today', 92, 960, 890), mk('b', 'body8', 'Live on Kickstarter', 384, 960, 598)]),
      // a long label running under the next line
      reallyTouch: run([mk('a', 'body7', 'Today is a long label here', 92, 960, 500), mk('b', 'body8', 'Live on Kickstarter', 300, 960, 598)]),
      // one line set over another (same place)
      sameSpot: run([mk('a', 'title', 'A headline', 100, 400, 800), mk('b', 'body', 'A body line', 100, 420, 800)]),
      // two lines one under the other: never an overlap
      stacked: run([mk('a', 'title', 'A headline', 100, 400, 800), mk('b', 'body', 'A body line', 100, 560, 800)]),
      // centred text in boxes that overlap, words apart
      centredApart: run([{ ...mk('a', 'a', 'Hi', 100, 700, 800), style: { ...base.style, align: 'center' } }, { ...mk('b', 'b', 'Yo', 100, 700, 800), style: { ...base.style, align: 'center' } }]),
    };
  });
  expect(r.wideBoxApart.pass, 'the wide box of "Today" next to a line 36 px away').toBe(true);
  expect(r.reallyTouch.pass, 'a long label that runs under the next line').toBe(false);
  expect(r.reallyTouch.reason).toMatch(/body7 and body8/);
  expect(r.sameSpot.pass, 'two lines on the same spot').toBe(false);
  expect(r.stacked.pass).toBe(true);
  expect(r.centredApart.pass, 'two short centred words in one wide box each, the words in the middle: they do touch').toBe(false);
});

test('E: the timeline slide of the flip-it deck draws without an overlap warning in the Warm editorial collage style', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const FC: any = await import('/src/reference/faithfulChecks.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts');
    await fonts.loadFonts();
    const pack = PR.presetPackFor('editorial-collage', false, null);
    const { style } = DL.styleFromPack(structuredClone(pack));
    const spec = { layout: 'timeline', fields: { title: 'how we got here', labels: ['2023', '2024', '2025', 'Today'], events: ['A sketch on a napkin', 'First prototype sewn', 'Rain tested in Oslo', 'Live on Kickstarter'] }, accents: [] };
    const d = await DL.drawOne(spec, 0, style, { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
    if (!d.built) return { drawn: false };
    const layers = d.built.layers as any[];
    const checks = FC.faithfulChecks(layers, { canvas: { w: 1080, h: 1350 }, bg: d.built.fieldBg ?? style.palette.bg, k: 1, slideType: 'checklist', svg: d.built.svg, devices: d.built.devices });
    const today = layers.find((l) => l.kind === 'text' && l.text === 'Today');
    const next = layers.find((l) => l.kind === 'text' && l.text === 'Live on Kickstarter');
    const ext = (l: any) => { const b = T.layoutText(l); return { x0: l.x + Math.min(...b.lines.map((q: any) => q.x)), x1: l.x + Math.max(...b.lines.map((q: any) => q.x + q.width)) }; };
    return { drawn: true, overlap: checks.find((c: any) => c.id === 'overlap'), todayBoxRight: today.x + today.width, nextBoxLeft: next.x, todayInk: ext(today), nextInk: ext(next) };
  });
  expect(r.drawn).toBe(true);
  expect(r.overlap.pass, r.overlap.reason).toBe(true);
  expect(r.todayInk.x1, 'the word "Today" ends before the next line starts').toBeLessThan(r.nextInk.x0);
});

test('E: the slide warning names the slide and what is wrong in plain words, and the slide name selects that slide', async ({ page }) => {
  const calls = await fake(page);
  // the saved 4-slide deck, with two text lines of slide 2 set on the same spot (they really touch)
  const doc = JSON.parse(OLD_DOC);
  const slide = doc.project.doc.designed.slides['1'];
  const texts = slide.built.layers.filter((l: any) => l.kind === 'text' && l.name !== 'recurring');
  expect(texts.length).toBeGreaterThanOrEqual(2);
  texts[1].x = texts[0].x; texts[1].y = texts[0].y + 6; texts[1].width = texts[0].width;
  await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k as string, v as string); sessionStorage.setItem('seeded', '1'); } }, [DOC_KEY, JSON.stringify(doc)] as const);
  await page.goto('/images/carousel');
  await expect(page.locator('.cr-film img')).toHaveCount(4, { timeout: 60_000 });
  const warn = page.getByTestId('phone-warning');
  await expect(warn).toBeVisible({ timeout: 30_000 });
  await expect(warn).toContainText('1 of 4 slides has something to fix at phone size.');
  await expect(warn).toContainText('Slide 2: two lines of text may touch at phone size.');
  const text = (await warn.textContent()) ?? '';
  expect(text, 'plain words: no check names, no numbers beyond the slide').not.toMatch(/overlap|slot|body\d|px/i);
  await page.getByTestId('phone-warning-slide-2').click();
  // the strip now has slide 2 selected
  await expect.poll(() => page.evaluate(() => { const items = [...document.querySelectorAll('.cr-film > *')]; return items.findIndex((e) => e.getAttribute('aria-current') === 'true' || e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' || e.classList.contains('is-selected') || e.classList.contains('selected') || e.querySelector('[aria-current=true],[aria-selected=true],[aria-pressed=true],.is-selected,.selected') !== null); })).toBe(1);
  expect(calls()).toBe(0);
});
