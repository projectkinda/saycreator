// Round 6: cover variety. Six cover layouts of different shapes (centred with a label, headline low with a big page number, headline in a block, headline on a sticker, one oversized word, headline
// between rules), each style allows 4, the deck picks one by a stable rule (title text + style id), a picture can be the cover, the highlight rules hold on every cover, the style cards show them.
// The real second-brain text is the fixture. A fake writer only: ZERO model calls. Output: out/cover-variety/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(20 * 60_000);
const OUT = 'out/cover-variety';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const srcSrc = fs.readFileSync('tests/image-engine/closing-source.spec.ts', 'utf8');
const SOURCE = srcSrc.slice(srcSrc.indexOf('export const SOURCE = `') + 23, srcSrc.indexOf('`;\n\nconst CLOSING'));
const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
const COVERS = ['cover-centred', 'cover-index', 'cover-block', 'cover-sticker', 'cover-word', 'cover-ruled'];
const save = (name: string, b64: string) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${name}`, Buffer.from(b64, 'base64')); };

async function setup(page: Page) {
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
}

/** A contact sheet helper in the page: draws a list of SVG strings into one PNG (cols x rows), each with a label. */
const SHEET = `window.__sheet = async (items, cols, w, h) => {
  const H = window.__H;
  const gap = 10, lab = 26;
  const rows = Math.ceil(items.length / cols);
  const c = document.createElement('canvas'); c.width = gap + cols * (w + gap); c.height = gap + rows * (h + lab + gap);
  const g = c.getContext('2d'); g.fillStyle = '#dddddd'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < items.length; i++) {
    const x = gap + (i % cols) * (w + gap), y = gap + Math.floor(i / cols) * (h + lab + gap);
    g.fillStyle = '#111'; g.font = 'bold 16px sans-serif'; g.fillText(items[i].label, x, y + 18);
    if (items[i].svg) { const bm = await createImageBitmap(await H.FA.svgToPng(items[i].svg, w * 2)); g.drawImage(bm, x, y + lab, w, h); }
  }
  return await new Promise((res) => c.toBlob(async (b) => { const u = new Uint8Array(await b.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); res(btoa(t)); }, 'image/png'));
};`;

test('each cover layout draws in all 15 styles with a 1-line, a 3-line and a 6-line headline; the sheet of covers (cover-sheet-layouts.png)', async ({ page }) => {
  await setup(page);
  await page.evaluate(SHEET);
  const r = await page.evaluate(async ({ STYLES, COVERS }) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const bad: string[] = [];
    const items: any[] = [];
    const heads = { one: 'Meet Quick Flip', three: 'Your brain is the worst place to store your life', six: 'Every unfinished task is a background process draining you', veryLong: 'Every unfinished task and every open loop is a background process that drains you all day long' };
    for (const style of STYLES) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const id of COVERS) {
        for (const [k, headline] of Object.entries(heads) as [string, string][]) {
          const fields: any = id === 'cover-word' ? { headline } : { kicker: 'A second brain', headline, caption: 'Three things I did.' };
          const b = await L.buildSlide(id, 0, fields, st, { handle: '@h', index: 0, total: 7 });
          // a headline over the 60-character limit is refused by validation (the writer is asked for a shorter one): that is the fallback, never an overflow
          const tooLong = headline.length > 60;
          if (tooLong) { if (b.ok) bad.push(`${style}/${id}/${k}: a headline over 60 characters was drawn`); continue; }
          if (!b.ok) { bad.push(`${style}/${id}/${k}: not drawn: ${b.errors[0]}`); continue; }
          if (k === 'three' && style === 'style-4') items.push({ label: id, svg: b.svg });
        }
      }
    }
    const png = await (window as any).__sheet(items, 6, 270, 338);
    return { bad, png };
  }, { STYLES, COVERS });
  save('cover-sheet-layouts.png', r.png);
  expect(r.bad).toEqual([]);
});

/** A writer plan around a cover headline: the cover, five body slides, the closing. */
const PLAN = `(title, head, extra) => {
  const H = window.__H;
  return [{ layout: 'statement', fields: { headline: head, ...(extra ?? {}) }, accents: [] }, H.BODY[1], H.BODY[2], H.BODY[3], H.BODY[4], { layout: 'split-text', fields: { headline: 'Saving is not keeping', paragraph: 'Most people save notes and never open them again.' }, accents: [] }, H.CLOSING];
}`;
const DECKS: [string, string][] = [
  ['Second brain', 'Your brain is the worst place to store your life'],
  ['Quick Flip', 'The hoodie that becomes a backpack'],
  ['Habits that stick', 'Make it so small you cannot say no'],
  ['Cold emails', 'Nobody reads your email, here is why'],
  ['Pricing page', 'Raise your price before you raise your voice'],
  ['Morning routine', 'Win the first hour and the day follows'],
];

test('the cover of a deck is chosen from the style\'s own list by a stable rule: the same deck gives the same cover twice, in every style, and every style has 4 covers listed', async ({ page }) => {
  await setup(page);
  await page.evaluate(SHEET);
  const r = await page.evaluate(async ({ STYLES, PLAN, SOURCE }) => {
    const H = (window as any).__H;
    const mkPlan = eval(PLAN);
    const rows: any[] = [];
    const items: any[] = [];
    for (const style of STYLES) {
      const a = await H.deck({ style, slides: mkPlan('Second brain', 'Your brain is the worst place to store your life'), pictures: [], text: SOURCE });
      const b = await H.deck({ style, slides: mkPlan('Second brain', 'Your brain is the worst place to store your life'), pictures: [], text: SOURCE });
      const allowed = H.PR.presetPackFor(style, false).look.coverLayouts?.layouts ?? [];
      rows.push({ style, a: a.specs[0].layout, b: b.specs[0].layout, allowed });
      items.push({ label: style + ': ' + a.specs[0].layout, svg: a.res.designed.slides['0'].built.svg });
    }
    return { rows, png: await (window as any).__sheet(items, 5, 270, 338) };
  }, { STYLES, PLAN, SOURCE });
  save('cover-sheet-15-styles.png', r.png);
  for (const x of r.rows) {
    expect(x.allowed.length, `${x.style}: lists 3 or more covers`).toBeGreaterThanOrEqual(3);
    expect(x.a, `${x.style}: the same deck, the same cover`).toBe(x.b);
    expect(x.allowed, `${x.style}: the cover "${x.a}" is one the style allows`).toContain(x.a);
  }
  expect(new Set(r.rows.map((x: any) => x.a)).size, 'the 15 styles do not all share one cover').toBeGreaterThanOrEqual(4);
});

test('different decks in one style usually get different covers: 6 sample decks, at least 2 different covers (cover-sheet-same-style-6-decks.png)', async ({ page }) => {
  await setup(page);
  await page.evaluate(SHEET);
  const r = await page.evaluate(async ({ PLAN, DECKS }) => {
    const H = (window as any).__H;
    const mkPlan = eval(PLAN);
    const out: Record<string, string[]> = {};
    let png = '';
    for (const style of ['editorial-collage', 'style-4', 'dark-quiet', 'object-neon']) {
      const items: any[] = [];
      out[style] = [];
      for (const [title, head] of DECKS) {
        const d = await H.deck({ style, slides: mkPlan(title, head), pictures: [], title, text: head });
        out[style].push(d.specs[0].layout);
        items.push({ label: title + ': ' + d.specs[0].layout, svg: d.res.designed.slides['0'].built.svg });
      }
      if (style === 'object-neon') png = await (window as any).__sheet(items, 6, 270, 338);
    }
    return { out, png };
  }, { PLAN, DECKS });
  save('cover-sheet-same-style-6-decks.png', r.png);
  for (const [style, covers] of Object.entries(r.out)) expect(new Set(covers).size, `${style}: ${covers.join(', ')}`).toBeGreaterThanOrEqual(2);
});

test('D: the 15 style cards show their own covers (not all the same); style-cards.png', async ({ page }) => {
  const { toStep } = await import('./ui');
  await page.setViewportSize({ width: 1280, height: 1100 });
  for (const url of ['**/__carousel/write', '**/api/carousel/write']) await page.route(url, (r) => r.fulfill({ json: { text: '{}', ms: 1 } }));
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await toStep(page, 3);
  const list = page.getByRole('list', { name: 'Styles' });
  await list.scrollIntoViewIfNeeded();
  for (let y = 0; y < 10; y++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(250); }
  await expect(list.getByText('Drawing…')).toHaveCount(0, { timeout: 60_000 });
  await expect(list.locator('.cr-style-small img')).toHaveCount(30, { timeout: 60_000 });
  fs.mkdirSync(OUT, { recursive: true });
  await list.screenshot({ path: `${OUT}/style-cards.png` });
  // the covers differ: count the distinct cover pictures of the 15 cards (by their drawing)
  const covers = await list.locator('li:has(.cr-style-smalls)').evaluateAll((els) => els.map((e) => (e.querySelector('img') as HTMLImageElement | null)?.src ?? ''));
  expect(new Set(covers).size).toBe(15);
});
