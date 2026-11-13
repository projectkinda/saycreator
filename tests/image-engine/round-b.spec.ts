// Round B: (1) the closing of a text that asks for an action: in style-5 it stays the preset's green card, in all 15 styles the closing is never moved by the repair stage; saved as
// out/round-b/style5-closing-<tag>.png. (2) the "underline" toggle draws an underline under the accent word on a dark deck and on a light deck; saved as out/round-b/underline-dark-<tag>.png.
// A fake writer only: ZERO model calls. RB_TAG=before (run on the old code) only saves the pictures.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(10 * 60_000);
const TAG = process.env.RB_TAG ?? 'after';
const OUT = 'out/round-b';
const closingSrc = fs.readFileSync('tests/image-engine/style5-closing.spec.ts', 'utf8');
const HEAD = closingSrc.slice(closingSrc.indexOf('const head = ['), closingSrc.indexOf('const CLOSINGS'));
const styleSrc = fs.readFileSync('tests/image-engine/designed-library-style.spec.ts', 'utf8');
const consts = styleSrc.slice(styleSrc.indexOf('const PACKS'), styleSrc.indexOf('const REQ'));
const { PACKS, ANSWER } = new Function(consts + '\n return { PACKS, ANSWER };')() as { PACKS: string; ANSWER: string };
const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];

const png64 = `async (svg, w) => { const F = await import('/src/reference/faithful.ts'); const blob = await F.svgToPng(svg, w); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t); }`;

test('1: a call-to-action closing in all 15 styles: style-5 keeps its green closing card; no style has its closing moved by the repair stage', async ({ page }) => {
  await page.goto('/images/carousel');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const head: any[] = eval(`(() => { ${HEAD} return head; })()`);
  const r: any = await page.evaluate(async ({ head, styles, png64 }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const toPng = eval(png64);
    const closing = { layout: 'cta-button', fields: { headline: 'Back Quick Flip today', button: 'Back it now' }, accents: ['today'] };
    const rows: any[] = [];
    let style5: string | null = null;
    for (const style of styles) {
      const pack = PR.presetPackFor(style, false);
      const provider: any = { id: 'dev-cli', label: 'fake', async write() { return { text: JSON.stringify({ title: 'Quick Flip', slides: [...head, closing] }), ms: 5 }; } };
      const req: any = { text: 'Quick Flip is a hoodie that flips into a backpack in ten seconds. '.repeat(3) + ' Back it on Kickstarter today.', slides: 7, tone: 'clear', format: 'carousel', styleChoice: style, styles: [] };
      const res: any = await D.designLibraryDeck(req, { pack }, '@quick.flip', provider, new AbortController().signal);
      const lib = res.designed.library;
      const last = lib.layouts.length - 1;
      rows.push({ style, last: lib.layouts[last], closingRepairs: (lib.repairs ?? []).filter((x: any) => x.slide === lib.layouts.length), accentDrawn: res.designed.slides[String(last)].built.layers.some((l: any) => l.kind === 'text' && l.name === 'title' && (l.runs?.length || l.highlight)) });
      if (style === 'style-5') style5 = await toPng(res.designed.slides[String(last)].built.svg, 540);
    }
    return { rows, style5 };
  }, { head, styles: STYLES, png64 });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/style5-closing-${TAG}.png`, Buffer.from(r.style5, 'base64'));
  fs.writeFileSync(`${OUT}/closing-15-styles-${TAG}.json`, JSON.stringify(r.rows, null, 1));
  if (TAG === 'before') return;
  expect(r.rows).toHaveLength(15);
  const s5 = r.rows.find((x: any) => x.style === 'style-5');
  expect(s5.last, 'style-5 keeps the preset closing card').toBe('statement-card');
  for (const x of r.rows) expect(x.closingRepairs, `${x.style}: the closing was not moved by the repair stage`).toEqual([]);
});

test('2: the underline toggle draws an underline on a dark deck and on a light deck (slide 1 keeps its highlight)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async ({ packsSrc, answer, png64 }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const toPng = eval(png64);
    const { dark, light } = new Function(packsSrc + ' return { dark, light };')();
    const req = { text: 'Quick Flip is a hoodie that flips into a backpack in 10 seconds. '.repeat(3), slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'auto', styles: [] };
    const out: any = {};
    for (const [name, pack] of [['dark', dark], ['light', light]] as any) {
      const provider: any = { id: 'dev-cli', label: 'fake', async write() { return { text: answer, ms: 5 }; } };
      const first = await D.designLibraryDeck(req, { pack }, '@quick.flip', provider, new AbortController().signal);
      const lib0 = first.designed.library;
      const shots: string[] = [];
      const counts: any = {};
      for (const [k, ov] of [['off', undefined], ['on', { underline: true }]] as any) {
        const res = await D.redrawLibraryDeck(lib0, { pack: { ...pack, overrides: ov } }, '@quick.flip');
        const slides = Object.values<any>(res.slides);
        counts[k] = slides.map((s: any) => (s.built.svg.match(/height="10"[^>]*rx="5"/g) || []).length);
        counts[k + 'Hl'] = slides.map((s: any) => s.built.layers.some((l: any) => l.kind === 'text' && l.name === 'title' && !!l.highlight));
        shots.push(await toPng(slides[0].built.svg, 420), await toPng(slides[1].built.svg, 420));
      }
      out[name] = { counts, layouts: lib0.layouts, repairs: lib0.repairs ?? null, shots };
    }
    return out;
  }, { packsSrc: PACKS, answer: ANSWER, png64 });
  fs.mkdirSync(OUT, { recursive: true });
  // a sheet: dark off/on, light off/on (slides 1 and 2 of each)
  const sheet: string = await page.evaluate(async ({ dark, light }) => {
    const all = [...dark.shots, ...light.shots];
    const bms = await Promise.all(all.map(async (b: string) => createImageBitmap(await (await fetch('data:image/png;base64,' + b)).blob())));
    const w = 420, h = 525, pad = 10, cap = 28;
    const c = document.createElement('canvas'); c.width = 4 * (w + pad) + pad; c.height = 2 * (h + cap + pad) + pad;
    const g = c.getContext('2d')!; g.fillStyle = '#e9e6df'; g.fillRect(0, 0, c.width, c.height); g.font = '600 16px sans-serif';
    const names = ['dark: underline off, slide 1', 'dark: off, slide 2', 'dark: underline ON, slide 1', 'dark: ON, slide 2', 'light: off, slide 1', 'light: off, slide 2', 'light: underline ON, slide 1', 'light: ON, slide 2'];
    bms.forEach((b, i) => { const x = pad + (i % 4) * (w + pad), y = pad + Math.floor(i / 4) * (h + cap + pad); g.fillStyle = '#222'; g.fillText(names[i], x, y + 19); g.drawImage(b, x, y + cap, w, (b.height * w) / b.width); });
    return c.toDataURL('image/png').split(',')[1];
  }, { dark: r.dark, light: r.light });
  fs.writeFileSync(`${OUT}/underline-dark-${TAG}.png`, Buffer.from(sheet, 'base64'));
  fs.writeFileSync(`${OUT}/underline-${TAG}.json`, JSON.stringify({ dark: { ...r.dark, shots: undefined }, light: { ...r.light, shots: undefined } }, null, 1));
  if (TAG === 'before') return;
  for (const name of ['dark', 'light']) {
    const c = r[name].counts;
    expect(c.off.reduce((a: number, b: number) => a + b, 0), `${name}: no underline with the toggle off`).toBe(0);
    expect(c.on.reduce((a: number, b: number) => a + b, 0), `${name}: the toggle draws underlines`).toBeGreaterThan(0);
    expect(c.on[0], `${name}: slide 1 (a headline with an accent word) is underlined`).toBeGreaterThan(0);
  }
});
