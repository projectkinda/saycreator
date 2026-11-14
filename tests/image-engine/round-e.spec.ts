// Round E: product fixes seen in the app. D: a tall picture (0.62 wide or narrower) matched by name, or picked in the picker, uses the phone frame when the slide can show one (no word lost, a pick stays pinned,
// zero writer calls). A: a short numbered list fills at least 0.75 of the height in all 15 styles. G: the big headline of split-text never wraps one word per line.
// Pictures: out/round-e/named-tall-phone.png, split-text-headline.png. A FAKE writer only: ZERO real model calls.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { deckDrawn, openEdit, toStep } from './ui';

test.setTimeout(10 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const OUT = 'out/round-e';
const PARAS = [
  "Most creators don't have a design problem.",
  'You write a good post. Then the evening goes to dragging text boxes.',
  'Pick a look from 15 styles.',
  'Paste your text and get slides you can edit.',
  'Change a headline and nothing reruns.',
  'Post it straight from your phone.',
  'Try it on your next post.',
];
const POST = PARAS.join('\n\n');
const doc = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
const picIds = (s: any) => Object.entries(s.fields).filter(([k]) => /^image\d?$/.test(k)).map(([, v]) => /^picture:([^#]+)#/.exec(String(v))?.[1]).filter(Boolean) as string[];
const words = (s: any) => (JSON.stringify(Object.entries(s.fields).filter(([k]) => !/^image\d?$/.test(k)).map(([, v]) => v)).toLowerCase().match(/[a-z0-9']+/g) ?? []);

async function tallDeck(page: Page, name: string | null) {
  let calls = 0;
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  const w = (x: any) => { calls++; return x.fulfill({ json: { text: '{}', ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  await page.goto('/images/carousel');
  const b64 = await page.evaluate(async () => {
    const wd = 1107, ht = 2400; const c = document.createElement('canvas'); c.width = wd; c.height = ht; const g = c.getContext('2d')!;
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, wd, ht); g.fillStyle = '#1f3a5f'; g.fillRect(0, 0, wd, 190);
    g.fillStyle = '#d9d4c7'; for (let y = 330; y < 2250; y += 170) g.fillRect(90, y, 700, 72);
    g.fillStyle = '#b4452b'; g.font = 'bold 120px sans-serif'; g.fillText('phone', 90, 150);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png')); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
  });
  await page.getByLabel('Choose images for the slides').setInputFiles([{ name: 'phone.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') }]);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(1, { timeout: 60_000 });
  if (name) await page.getByTestId('image-0-label').fill(name);
  await page.getByLabel('Your text or topic').fill(POST);
  await page.getByTestId('text-mode').getByRole('radio', { name: /Use my paragraphs as slides/ }).check();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 7);
  await page.waitForTimeout(800);
  return () => calls;
}

test('D: a tall picture matched by name goes in the phone frame (every word kept, no writer call); a tall picture picked in the picker does too, and stays pinned', async ({ page }) => {
  const calls = await tallDeck(page, 'phone');
  const d = await doc(page);
  const specs = d.designed.library.plan.specs as any[];
  const id = d.photos[0].id;
  const at = specs.findIndex((s) => picIds(s).includes(id));
  expect(at, 'the picture named "phone" is on a slide').toBeGreaterThan(0);
  expect(JSON.stringify(specs[at].fields), 'it is on the slide with "your phone"').toMatch(/your phone/);
  expect(specs[at].layout, 'a tall picture matched by name sits in the phone frame, not on a grey panel').toBe('phone-frame');
  const all = specs.flatMap(words);
  for (const w of POST.toLowerCase().match(/[a-z0-9']+/g)!) expect(all, `word "${w}" kept`).toContain(w);
  expect(picIds(specs[0])).toEqual([]);
  // the picture of the slide
  fs.mkdirSync(OUT, { recursive: true });
  await page.getByRole('button', { name: `Show slide ${at + 1}`, exact: true }).click();
  await page.waitForTimeout(600);
  const png = await page.evaluate(async () => { const img = document.querySelector('.cr-stage-pic img') as HTMLImageElement; const blob = await (await fetch(img.src)).blob(); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); });
  fs.writeFileSync(`${OUT}/named-tall-phone.png`, Buffer.from(png, 'base64'));
  // a pick in the picker: slide 5 (a plain text slide) takes the tall picture in the phone frame and keeps it pinned
  const target = specs.findIndex((s, i) => i > 0 && i !== at && picIds(s).length === 0 && !/numbered-list|list-/.test(s.layout));
  const before = words(specs[target]);
  await openEdit(page, target + 1);
  await page.getByTestId(`pick-${target}-0`).click();
  await expect(page.getByTestId(`pick-${target}-msg`)).not.toHaveText('', { timeout: 30_000 });
  await page.waitForTimeout(600);
  const d1 = await doc(page);
  const s1 = d1.designed.library.plan.specs[target];
  expect(s1.layout, 'the picked tall picture uses the phone frame').toBe('phone-frame');
  expect(s1.pin.picture, 'the pick is pinned').toBe(id);
  for (const w of before) expect(words(s1), `word "${w}" kept by the pick`).toContain(w);
  expect(calls(), 'no writer call at all (the deck is the paragraphs route)').toBe(0);
});

test('A: a numbered list of three short items fills at least 0.75 of the height in all 15 styles, both variants', async ({ page }) => {
  const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
  const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
  const r: any = await page.evaluate(async (styles) => {
    const H = (window as any).__H;
    const sets = [{ title: 'Three ways to wear it', items: ['As a hoodie on the street', 'As a bag on the train', 'As a pillow on the plane'] }, { title: 'Wear it', items: ['Hoodie', 'Bag', 'Pillow'] }];
    const bad: string[] = []; let n = 0;
    for (const style of styles) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const f of sets) for (const v of [0, 1]) {
        const d = await H.D.drawOne({ layout: 'numbered-list', fields: f, accents: [] }, v, st, { handle: '@h', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
        if (!d.built) { bad.push(`${style}: not drawn`); continue; }
        n++;
        const layers = d.built.layers as any[];
        const boxes = layers.filter((l) => (l.kind === 'text' && !String(l.name).startsWith('recurring') && l.text) || (l.kind !== 'text' && (l.height ?? 0) > 0 && l.height < 1000 && l.y > 100 && l.y < 1260 && !/background|recurring|plane/.test(String(l.name))));
        const fill = (Math.max(...boxes.map((q) => q.y + q.height)) - Math.min(...boxes.map((q) => q.y))) / 1000;
        if (fill < 0.75) bad.push(`${style} v${v + 1} "${f.title}": ${Math.round(fill * 100) / 100}`);
        const text = layers.filter((l) => l.kind === 'text' && l.text).map((l) => l.text).join(' ').toLowerCase();
        for (const it of f.items) if (!text.includes(it.toLowerCase())) bad.push(`${style}: lost "${it}"`);
      }
    }
    return { bad, n };
  }, STYLES);
  expect(r.n).toBe(60);
  expect(r.bad).toEqual([]);
});

test('G: the big headline of split-text never wraps as a ladder (three lines or more with two single-word lines) in 15 styles, short, long and worst-case text, every cut; no word is cut', async ({ page }) => {
  const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
  const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
  const r: any = await page.evaluate(async (styles) => {
    const H = (window as any).__H; const T: any = await import('/src/image-engine/draw/text.ts');
    const heads = ['Why', 'Why we built it', 'Why we decided to build it ourselves', 'Four steps to a post that sells', 'Seven reasons your carousels never get saved today', 'Ten minutes for the idea, a night for the slides'];
    const para = 'One layer replaces two things you carry.';
    const bad: string[] = []; let n = 0;
    for (const style of styles) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const head of heads) for (const cut of ['plain', 'edge-v', 'angle']) {
        const d = await H.D.drawOne({ layout: 'split-text', fields: { headline: head, paragraph: para }, accents: [] }, 0, st, { handle: '@h', index: 1, total: 7, cut, invert: false, density: 'normal' });
        if (!d.built) continue;
        n++;
        const t = (d.built.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
        const lines: string[] = T.layoutText(t).lines.map((q: any) => (q.words ? q.words.map((x: any) => x.text).join(' ') : ''));
        const single = lines.filter((q) => q.trim().indexOf(' ') < 0).length;
        if (lines.length >= 3 && single >= 2) bad.push(`${style}/${cut} "${head}": ${JSON.stringify(lines)}`);
        const flat = lines.join(' ').toLowerCase().replace(/[^a-z0-9 ]/g, '');
        for (const w of head.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')) if (!flat.includes(w)) bad.push(`${style}: lost "${w}"`);
      }
    }
    return { bad, n };
  }, STYLES);
  expect(r.n).toBeGreaterThan(200);
  expect(r.bad).toEqual([]);
});
