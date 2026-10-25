// Step 6. The element-rich styles recreated with illustrative elements, in two versions:
//   SHIPPABLE: only elements from our library (permissive packs and shapes drawn in code)
//   TEST: the user's private test-assets/ (not shippable, labelled so). Skipped when that folder is empty.
// Every slide is its own file with its plan, lint and phone copy. No contact sheets.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/asset-recreation');
const BASE = path.join(ROOT, 'out/image-engine/style-recreation');
const TEST_DIR = path.join(ROOT, 'test-assets');
const DECKS = fs.readdirSync(path.join(ROOT, 'tests/image-engine/carousels')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/image-engine/carousels', f), 'utf8')));
const STYLES = ['hot-flat', 'editorial-collage', 'object-neon'];

interface Lint { id: string; pass: boolean; reason: string }
interface Slide { id: string; type: string; layout: string; palette: string; notes: string[]; plan: { layers: { id: string; kind: string; src?: string; element?: string; name?: string; role?: string }[] }; lint: Lint[]; elementsUsed: string[]; png: string; phone: string; warnings: { code: string }[] }
interface TA { name: string; url: string; width: number; height: number; tags: string[] }

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const write = (rel: string, data: string | Buffer) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), data);
};

/** A small valid PNG of one colour (for the test that proves test-asset mode works without needing your pictures). */
function makePng(w: number, h: number, rgba: [number, number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgba).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const IMG = /\.(png|jpe?g|webp|svg|gif)$/i;
const realTestAssets = () => (fs.existsSync(TEST_DIR) ? fs.readdirSync(TEST_DIR).filter((f) => IMG.test(f)) : []);
const tagsOf = (name: string) => name.toLowerCase().replace(/\.[^.]+$/, '').split(/[^a-z]+/).filter((w) => w.length > 1);

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

test('placing elements is repeatable and never changes the words: same plan twice, same text layers, no covering of content', async ({ page }) => {
  const deck = DECKS.find((d) => d.id === 'howto-linkedin');
  const a = await call<Slide[]>(page, 'styleCompose', deck, 'hot-flat', { elements: 'shippable' });
  const b = await call<Slide[]>(page, 'styleCompose', deck, 'hot-flat', { elements: 'shippable' });
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  const plain = await call<Slide[]>(page, 'styleCompose', deck, 'hot-flat');
  const texts = (s: Slide[]) => s.map((x) => x.plan.layers.filter((l) => l.kind === 'text').map((l) => JSON.stringify(l)).join('|'));
  expect(texts(a)).toEqual(texts(plain)); // elements are added; no text layer moved or changed
  expect(a.some((s) => s.plan.layers.some((l) => l.kind === 'element'))).toBe(true);
});

test('SHIPPABLE: every element-rich style, every deck, every slide as its own file, using only the library', async ({ page }) => {
  test.setTimeout(600_000);
  const summary: unknown[] = [];
  for (const style of STYLES) {
    for (const deck of DECKS) {
      const slides = await call<Slide[]>(page, 'styleRun', deck, style, { elements: 'shippable' });
      expect(slides).toHaveLength(7);
      slides.forEach((s, i) => {
        const base = `${style}/shippable/${deck.id}/slide-${String(i + 1).padStart(2, '0')}`;
        write(`${base}.png`, Buffer.from(s.png, 'base64'));
        write(`${base}-phone.png`, Buffer.from(s.phone, 'base64'));
        write(`${base}.plan.json`, JSON.stringify(s.plan, null, 2));
        const failed = s.lint.filter((l) => !l.pass);
        write(`${base}.lint.json`, JSON.stringify({ style, script: deck.id, scriptTitle: deck.title, index: i + 1, type: s.type, layout: s.layout, palette: s.palette, assetMode: 'shippable', label: 'SHIPPABLE', elementsUsed: s.elementsUsed, notes: s.notes, warnings: s.warnings, pass: failed.length === 0, lint: s.lint }, null, 2));
        // Only library elements: no picture layers at all, every element resolved, nothing mentions the private folder.
        expect(s.plan.layers.filter((l) => l.kind === 'image'), `${base} has picture layers`).toEqual([]);
        expect(s.warnings.filter((w) => w.code === 'element-missing'), base).toEqual([]);
        expect(JSON.stringify(s.plan)).not.toContain('test-assets');
        summary.push({ style, deck: deck.id, slide: i + 1, type: s.type, elements: s.elementsUsed.length, pass: failed.length === 0, failed: failed.map((f) => f.id) });
      });
    }
  }
  write('summary.json', JSON.stringify(summary, null, 2));
  // Elements really appear: on average at least 1.5 per slide in every style.
  for (const style of STYLES) {
    const rows = (summary as { style: string; elements: number }[]).filter((r) => r.style === style);
    const avg = rows.reduce((n, r) => n + r.elements, 0) / rows.length;
    // Since Step 10 decoration needs a job, hot-flat (made mostly of decoration) has fewer pictures: a lower bar there.
    expect(avg, `${style} average elements per slide`).toBeGreaterThan(style === 'hot-flat' ? 0.5 : 1.5);
  }
});

test('elements did not make slides worse: no check fails that did not already fail without them', () => {
  for (const style of STYLES)
    for (const deck of DECKS)
      for (let i = 1; i <= 7; i++) {
        const n = String(i).padStart(2, '0');
        const before = path.join(BASE, style, deck.id, `slide-${n}.lint.json`);
        if (!fs.existsSync(before)) continue;
        const was = new Set((JSON.parse(fs.readFileSync(before, 'utf8')).lint as Lint[]).filter((l) => !l.pass).map((l) => l.id));
        const now = (JSON.parse(fs.readFileSync(path.join(OUT, style, 'shippable', deck.id, `slide-${n}.lint.json`), 'utf8')).lint as Lint[]).filter((l) => !l.pass);
        for (const f of now) expect(was.has(f.id), `${style}/${deck.id}/slide-${n}: new failure ${f.id}: ${f.reason}`).toBe(true);
      }
});

test('TEST ASSETS: your private pictures are placed the same way and labelled; skipped when the folder is empty', async ({ page }) => {
  test.setTimeout(300_000);
  const files = realTestAssets();
  if (files.length === 0) {
    write('test-assets-skipped.json', JSON.stringify({ skipped: true, reason: 'test-assets/ has no pictures yet, so there is no TEST version to render.', checkedAt: new Date().toISOString() }, null, 2));
    test.info().annotations.push({ type: 'skipped', description: 'test-assets/ is empty' });
    return;
  }
  fs.rmSync(path.join(OUT, 'test-assets-skipped.json'), { force: true });
  const sizes = await call<{ url: string; width: number; height: number }[]>(page, 'probeImages', files.map((f) => '/test-assets/' + encodeURIComponent(f)));
  const testAssets: TA[] = files.map((f, i) => ({ name: f, url: sizes[i].url, width: sizes[i].width, height: sizes[i].height, tags: tagsOf(f) }));
  for (const style of STYLES)
    for (const deck of DECKS) {
      const slides = await call<Slide[]>(page, 'styleRun', deck, style, { elements: 'test', testAssets });
      slides.forEach((s, i) => {
        const base = `${style}/test/${deck.id}/slide-${String(i + 1).padStart(2, '0')}`;
        write(`${base}.png`, Buffer.from(s.png, 'base64'));
        write(`${base}-phone.png`, Buffer.from(s.phone, 'base64'));
        write(`${base}.plan.json`, JSON.stringify(s.plan, null, 2));
        const failed = s.lint.filter((l) => !l.pass);
        write(`${base}.lint.json`, JSON.stringify({ style, script: deck.id, scriptTitle: deck.title, index: i + 1, type: s.type, layout: s.layout, palette: s.palette, assetMode: 'test', label: 'TEST ASSETS: not shippable', elementsUsed: s.elementsUsed, notes: s.notes, warnings: s.warnings, pass: failed.length === 0, lint: s.lint }, null, 2));
      });
    }
});

test('test-asset mode works: temporary pictures are placed as TEST ASSET layers and removed again', async ({ page }) => {
  const made = ['arrow-test.png', 'star-test.png'].map((n) => path.join(TEST_DIR, `zz-${n}`)).map((f, i) => { fs.mkdirSync(TEST_DIR, { recursive: true }); fs.writeFileSync(f, makePng(48, 48, i ? [255, 0, 128, 255] : [0, 120, 255, 255])); return f; });
  try {
    const names = made.map((f) => path.basename(f));
    const sizes = await call<{ url: string; width: number; height: number }[]>(page, 'probeImages', names.map((n) => '/test-assets/' + n));
    const assets: TA[] = names.map((n, i) => ({ name: n, url: sizes[i].url, width: sizes[i].width, height: sizes[i].height, tags: tagsOf(n) }));
    const deck = DECKS.find((d) => d.id === 'howto-linkedin');
    const slides = await call<Slide[]>(page, 'styleRun', deck, 'hot-flat', { elements: 'test', testAssets: assets });
    const used = slides.flatMap((s) => s.elementsUsed);
    expect(used.length).toBeGreaterThan(3);
    for (const u of used) expect(names).toContain(u);
    const imgs = slides.flatMap((s) => s.plan.layers.filter((l) => l.kind === 'image'));
    expect(imgs.length).toBeGreaterThan(3);
    for (const l of imgs) {
      expect(l.name).toMatch(/^TEST ASSET: /);
      expect(l.role).toBe('decor');
    }
  } finally {
    for (const f of made) fs.rmSync(f, { force: true });
  }
});
