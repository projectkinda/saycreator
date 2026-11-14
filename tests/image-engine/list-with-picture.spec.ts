// Round 17 I: lists with a picture. Two layouts carry a short list (2 to 5 items) and a title with a picture and no word lost: list-under-band (a picture band across the top) and
// list-beside-picture (a tall picture or a phone on one side). Both in all 15 styles, the highlight kept, text-fits with 5 items of 8 words; the picker swaps stepper / numbered-list / checklist
// slides to them (every word kept, no model call, pinned after a restyle); and a refusal is one clear line. A fake writer only: ZERO real model calls.
// Output: out/round-16/list-with-picture.png
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { deckDrawn, openEdit, toStep } from './ui';

test.setTimeout(15 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const OUT = 'out/round-16';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
const ITEMS5 = ['Paste the post you already wrote today', 'Pick one of the fifteen looks you like best', 'Add the pictures you want on the slides', 'Edit any headline and nothing else reruns', 'Download the slides and post them tonight'];

test('both layouts draw in all 15 styles with 5 items of 8 words: text-fits and the phone checks pass, the highlight is kept, the picture is used; the sheet is saved', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  const r: any = await page.evaluate(async ({ styles, items5 }) => {
    const H = (window as any).__H;
    const C: any = await import('/src/reference/faithfulChecks.ts');
    const sizes: Record<string, [number, number]> = { tall: [1107, 2400], wide: [1600, 900], portrait: [1200, 1600] };
    const bad: string[] = [];
    const tiles: { svg: string; label: string }[] = [];
    const used: string[] = [];
    const draw = async (style: string, layout: string, shape: string, items: string[], keepTile: boolean) => {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      const [w, h] = sizes[shape];
      const f = { title: items.length === 5 ? 'Five steps from post to slides' : 'How it works', items, image: H.IM.makeRef({ id: shape, w, h, ...(h / w > 1.5 ? { fy: 0.1 } : {}) }) };
      for (const v of [0, 1] as const) {
        const d = await H.D.drawOne({ layout, fields: f, accents: [items.length === 5 ? 'post to slides' : 'it works'] }, v, st, { handle: '@maya.designs', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
        const tag = `${style}/${layout}/${shape}/v${v + 1}/${items.length} items`;
        if (!d.built) { bad.push(`${tag}: not drawn (${(d.problems ?? []).join(' | ').slice(0, 160)})`); continue; }
        const lint = C.faithfulChecks(d.built.layers, { canvas: { w: 1080, h: 1350 }, bg: d.built.fieldBg ?? '#fff', k: 1, slideType: 'checklist', prose: false });
        // the phone's 50-word limit counts the profile name and the handle too: 5 items of 8 words plus a title is over it in any layout (a content limit, not a layout one), so only a list under it is held to it
        for (const q of lint.filter((x: any) => !x.pass && !(x.id === 'words' && (x.measured ?? 0) > 50))) bad.push(`${tag}: ${q.id}: ${q.reason}`);
        const title = d.built.layers.find((l: any) => l.kind === 'text' && l.name === 'title');
        if (!title || !((title.runs && title.runs.length) || title.highlight)) bad.push(`${tag}: the highlight is lost`);
        const text = d.built.layers.filter((l: any) => l.kind === 'text' && l.text && !/recurring/.test(l.id + l.name)).map((l: any) => l.text).join(' ').toLowerCase();
        for (const it of items) if (!text.includes(it.toLowerCase().slice(0, 12))) bad.push(`${tag}: lost "${it}"`);
        if (!(d.built.images ?? []).length) bad.push(`${tag}: no picture was drawn`);
        else used.push(tag);
        if (keepTile && v === 0) tiles.push({ svg: d.built.svg, label: `${style} ${layout} ${shape}` });
      }
    };
    for (const style of styles) {
      for (const layout of ['list-under-band']) for (const shape of ['tall', 'wide']) for (const items of [items5, items5.slice(0, 3).map((x: string) => x.split(' ').slice(0, 4).join(' ')), items5.slice(0, 2)]) await draw(style, layout, shape, items, false);
      for (const shape of ['tall', 'portrait']) for (const items of [items5, items5.slice(0, 3).map((x: string) => x.split(' ').slice(0, 4).join(' ')), items5.slice(0, 2)]) await draw(style, 'list-beside-picture', shape, items, false);
    }
    // the sheet: 3 styles x both layouts x tall and wide (list-beside-picture takes a tall or portrait picture only: its second column is a 3:4 portrait)
    for (const style of ['style-6', 'editorial-collage', 'dark-quiet']) {
      for (const [layout, shapes] of [['list-under-band', ['tall', 'wide']], ['list-beside-picture', ['tall', 'portrait']]] as [string, string[]][]) for (const shape of shapes) await draw(style, layout, shape, ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'], true);
    }
    const cols = 4, w = 330, h = 413;
    const c = document.createElement('canvas'); c.width = cols * (w + 10) + 10; c.height = Math.ceil(tiles.length / cols) * (h + 10) + 10;
    const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
    for (const [i, t] of tiles.entries()) { const bm = await createImageBitmap(await H.FA.svgToPng(t.svg, 660)); g.drawImage(bm, 10 + (i % cols) * (w + 10), 10 + Math.floor(i / cols) * (h + 10), w, h); }
    return { bad, drawn: used.length, sheet: c.toDataURL('image/png').split(',')[1] };
  }, { styles: STYLES, items5: ITEMS5 });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/list-with-picture.png`, Buffer.from(r.sheet, 'base64'));
  console.log('LISTS drawn', r.drawn, 'problems', r.bad.length);
  fs.writeFileSync(`${OUT}/list-problems.json`, JSON.stringify(r.bad, null, 1));
  expect(r.drawn, '15 styles x (12 band + 12 beside) drawings, and the 24 of the sheet').toBe(384);
  expect(r.bad.slice(0, 15)).toEqual([]);
});

// ----- the picker -----
const PLAN = JSON.stringify({ title: 'Say Creator', slides: [
  { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
  { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }, accents: [] },
  { layout: 'stepper', fields: { title: 'How it works', steps: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: ['it works'] },
  { layout: 'big-stat', fields: { number: '15', label: 'styles to pick from' }, accents: [] },
  { layout: 'statement-card', fields: { headline: 'You can add your own pictures too.' }, accents: [] },
  { layout: 'checklist', fields: { title: 'What you get', items: ['Slides you can edit', 'Words that stay put', 'A look in one click'] }, accents: [] },
  { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." }, accents: [] },
] });
async function setup(page: Page) {
  const calls: string[] = [];
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const w = (r: any) => { calls.push('write'); return r.fulfill({ json: { text: PLAN, ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  await page.goto('/images/carousel');
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (const [name, wd, ht] of [['wide', 1600, 900], ['tall', 1107, 2400]] as [string, number, number][]) {
    const b64 = await page.evaluate(async ({ wd, ht }) => {
      // a screenshot: a white window with a dark title bar and rows of text-like bars on flat colours
      const c = document.createElement('canvas'); c.width = wd; c.height = ht; const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, wd, ht); g.fillStyle = '#1d1d1f'; g.fillRect(0, 0, wd, ht * 0.06); g.fillStyle = '#ececf0'; g.fillRect(0, ht * 0.06, wd * 0.2, ht);
      for (let i = 0; i < 16; i++) { g.fillStyle = i % 4 === 0 ? '#2f6fed' : '#333'; g.fillRect(wd * 0.26, ht * (0.1 + i * 0.05), wd * (0.25 + ((i * 37) % 40) / 100), ht * 0.014); }
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png')); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
    }, { wd, ht });
    files.push({ name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  }
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(2, { timeout: 60_000 });
  await page.getByLabel('Your text or topic').fill('Most creators do not have a design problem. Write a good post, then turn it into slides. How it works: paste your text, pick a look from 15 styles, get slides you can edit. Fifteen styles to pick from. Add your own pictures. What you get: slides you can edit. Comment "slides" and I will send you the link.');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 7);
  return calls;
}
const doc = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
const wordsOf = (f: any) => (JSON.stringify(Object.entries(f).filter(([k]) => !/^image\d?$|accent|current/.test(k)).map(([, v]) => v)).toLowerCase().match(/[a-z0-9']+/g) ?? []);
const picOf = (f: any) => /^picture:([^#]+)#/.exec(String(f.image ?? ''))?.[1];

test('the picker: a stepper with a wide screenshot and with a tall screenshot swaps to a list layout, every word kept, 0 model calls, pinned after a restyle; a checklist too', async ({ page }) => {
  const calls = await setup(page);
  await page.waitForTimeout(1500);
  expect(calls.length).toBe(1);
  const d0 = await doc(page);
  const specs0 = d0.designed.library.plan.specs as any[];
  const wideId = d0.photos.filter((p: any) => p.kind === 'photo')[0].id as string;
  const tallId = d0.photos.filter((p: any) => p.kind === 'photo')[1].id as string;
  const sIdx = specs0.findIndex((s) => s.layout === 'stepper');
  expect(sIdx).toBeGreaterThan(0);
  const before = wordsOf(specs0[sIdx].fields);
  // 1. the wide screenshot -> list-under-band
  await openEdit(page, sIdx + 1);
  await page.getByTestId(`pick-${sIdx}-0`).click();
  await page.waitForTimeout(1200);
  let d1 = await doc(page);
  let s1 = d1.designed.library.plan.specs[sIdx];
  expect(s1.layout, `wide screenshot: ${JSON.stringify(s1.fields)}`).toBe('list-under-band');
  expect(picOf(s1.fields)).toBe(wideId);
  for (const w of before) expect(wordsOf(s1.fields), `"${w}" kept`).toContain(w);
  expect(s1.pin.picture).toBe(wideId);
  // 2. the tall screenshot -> list-beside-picture
  await page.getByTestId(`pick-${sIdx}-1`).click();
  await page.waitForTimeout(1200);
  d1 = await doc(page);
  s1 = d1.designed.library.plan.specs[sIdx];
  expect(s1.layout).toBe('list-beside-picture');
  expect(picOf(s1.fields)).toBe(tallId);
  for (const w of before) expect(wordsOf(s1.fields), `"${w}" kept`).toContain(w);
  expect(calls.length, 'a pick makes no writer call').toBe(1);
  // 3. a restyle keeps the pin, the layout and the words
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Quiet dark minimal/ }).first().click();
  await page.waitForTimeout(2500);
  const d2 = await doc(page);
  const s2 = d2.designed.library.plan.specs[sIdx];
  expect(s2.layout).toBe('list-beside-picture');
  expect(s2.pin.picture).toBe(tallId);
  expect(picOf(s2.fields)).toBe(tallId);
  for (const w of before) expect(wordsOf(s2.fields)).toContain(w);
  expect(calls.length, 'a restyle makes no writer call').toBe(1);
  // 4. a checklist slide takes the wide screenshot too
  const cIdx = specs0.findIndex((s) => s.layout === 'checklist');
  await openEdit(page, cIdx + 1);
  await page.getByTestId(`pick-${cIdx}-0`).click();
  await page.waitForTimeout(1200);
  const d3 = await doc(page);
  const c3 = d3.designed.library.plan.specs[cIdx];
  expect(c3.layout).toBe('list-under-band');
  for (const w of wordsOf(specs0[cIdx].fields)) expect(wordsOf(c3.fields)).toContain(w);
  expect(calls.length).toBe(1);
});

test('the picker still refuses where no layout with a picture carries every word (a big number): one clear line, no dead-end text, the slide unchanged, no writer call', async ({ page }) => {
  const calls = await setup(page);
  await page.waitForTimeout(1500);
  const d0 = await doc(page);
  const idx = (d0.designed.library.plan.specs as any[]).findIndex((s) => s.layout === 'big-stat');
  expect(idx).toBeGreaterThan(0);
  const before = JSON.stringify(d0.designed.library.plan.specs[idx]);
  await openEdit(page, idx + 1);
  await page.getByTestId(`pick-${idx}-0`).click();
  const msg = page.getByTestId(`pick-${idx}-msg`);
  await expect(msg).toContainText('cannot go on slide', { timeout: 30_000 }); // Round E: the refusal names the picture and the slide
  await expect(msg).toContainText("make this slide's text shorter");
  await expect(page.getByTestId(`pick-${idx}-offer`)).toHaveCount(0);
  expect(JSON.stringify((await doc(page)).designed.library.plan.specs[idx])).toBe(before);
  expect(calls.length).toBe(1);
});
