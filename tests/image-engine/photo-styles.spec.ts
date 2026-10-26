// Step 11: the three photo-led styles, drawn with the user's test photos (TEST ASSETS: private, not shippable) and, to prove the
// empty-slot behaviour, with no photos at all. Every slide is its own PNG, plan, lint file and phone-size copy. No contact sheets.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHOTO_SETS, photoUrl } from './photo-sets';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'out/image-engine/step11');
export const STYLES = ['mono-poster', 'film-paper', 'glass-gradient'] as const;
const DECK_DIR = path.join(ROOT, 'tests/image-engine/carousels-photo');
export const DECKS = fs.readdirSync(DECK_DIR).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(DECK_DIR, f), 'utf8')));

interface Lint { id: string; label: string; pass: boolean; reason: string }
export interface Slide { id: string; type: string; layout: string; rule: number; palette: string; because: string; notes: string[]; repairs: string[]; photoSlots: { id: string; filled: boolean; hint?: string; synthetic?: boolean }[]; plan: { layers: { id: string; kind: string; src?: string }[]; meta?: unknown }; lint: Lint[]; warnings: { code: string }[]; png: string; phone: string }

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

/** Writes one slide as its own files and returns the summary row. */
function writeSlide(dir: string, i: number, s: Slide) {
  fs.mkdirSync(dir, { recursive: true });
  const n = String(i + 1).padStart(2, '0');
  fs.writeFileSync(path.join(dir, `slide-${n}.png`), Buffer.from(s.png, 'base64'));
  fs.writeFileSync(path.join(dir, `slide-${n}.phone.png`), Buffer.from(s.phone, 'base64'));
  fs.writeFileSync(path.join(dir, `slide-${n}.plan.json`), JSON.stringify(s.plan, null, 2));
  fs.writeFileSync(path.join(dir, `slide-${n}.lint.json`), JSON.stringify({ lint: s.lint, notes: s.notes, repairs: s.repairs, photoSlots: s.photoSlots, layout: s.layout, palette: s.palette, because: s.because }, null, 2));
  return { index: i + 1, type: s.type, layout: s.layout, rule: s.rule, palette: s.palette, because: s.because, notes: s.notes, repairs: s.repairs, photoSlots: s.photoSlots, pass: s.lint.every((l) => l.pass), failed: s.lint.filter((l) => !l.pass).map((l) => ({ id: l.id, reason: l.reason })), png: `slide-${n}.png`, phone: `slide-${n}.phone.png`, plan: `slide-${n}.plan.json` };
}

for (const style of STYLES) {
  test(`${style}: every deck draws with the test photos; each slide is its own file; the checks pass (an overlay or plate is added instead of failing)`, async ({ page }) => {
    test.setTimeout(240_000);
    const pool = PHOTO_SETS[style].filter((p) => fs.existsSync(path.join(ROOT, 'test-assets', p.file)));
    test.skip(pool.length < 9, `This style needs its 9 test photos in test-assets/ (found ${pool.length} of 9).`);
    await call(page, 'loadFonts');
    const photos = await call<{ id: string }[]>(page, 'analysePhotos', pool.map((p) => ({ id: p.id, url: photoUrl(p.file), label: p.label, focal: p.focal })));
    expect(photos).toHaveLength(9);
    const summary: Record<string, unknown> = {};
    for (const deck of DECKS) {
      const slides = await call<Slide[]>(page, 'styleRun', deck, style, { photos, repair: true });
      expect(slides).toHaveLength(7);
      const dir = path.join(OUT, style, 'test', deck.id);
      fs.rmSync(dir, { recursive: true, force: true });
      const rows = slides.map((s, i) => writeSlide(dir, i, s));
      summary[deck.id] = { title: deck.title, rows };
      // The photo plans only ever point at the test photos by address; the pictures themselves are never in a plan.
      for (const s of slides) expect(JSON.stringify(s.plan)).not.toMatch(/data:image/);
    }
    fs.writeFileSync(path.join(OUT, style, 'test', 'summary.json'), JSON.stringify({ style, photos: pool.map((p) => ({ id: p.id, file: p.file, label: p.label })), decks: summary, generatedAt: Date.now() }, null, 2));
    const all = Object.values(summary).flatMap((d) => (d as { rows: { pass: boolean; failed: unknown[] }[] }).rows);
    const failed = all.filter((r) => !r.pass);
    expect(failed.map((f) => f.failed), `${failed.length} of ${all.length} slides fail a check`).toEqual([]);
  });
}

test('with no photos at all, a slot that asks for one draws a clean placeholder, carries a warning, and never fails a check', async ({ page }) => {
  test.setTimeout(240_000);
  await call(page, 'loadFonts');
  const report: Record<string, unknown> = {};
  for (const style of STYLES) {
    const slides = await call<Slide[]>(page, 'styleRun', DECKS[0], style, { photos: [], repair: true });
    const dir = path.join(OUT, style, 'no-photos', DECKS[0].id);
    fs.rmSync(dir, { recursive: true, force: true });
    const rows = slides.map((s, i) => writeSlide(dir, i, s));
    const empty = rows.filter((r) => r.photoSlots.some((p) => !p.filled));
    expect(empty.length, `${style}: slides that asked for a photo and got a placeholder`).toBeGreaterThan(0);
    for (const r of empty) expect(r.notes.join(' '), `${style} slide ${r.index} warns about its empty slot`).toMatch(/Photo slot .* is empty/);
    expect(rows.filter((r) => !r.pass).map((r) => r.failed), `${style}: placeholders never fail the checks`).toEqual([]);
    report[style] = { emptySlots: empty.map((r) => ({ slide: r.index, layout: r.layout, slots: r.photoSlots })), slidesWithoutPhotoLayout: rows.filter((r) => r.photoSlots.length === 0).length };
  }
  fs.writeFileSync(path.join(OUT, 'no-photos.json'), JSON.stringify(report, null, 2));
});

test('the same script, style and photos always give the same plans (nothing is random)', async ({ page }) => {
  await call(page, 'loadFonts');
  const pool = PHOTO_SETS['film-paper'].filter((p) => fs.existsSync(path.join(ROOT, 'test-assets', p.file)));
  test.skip(pool.length < 9, 'needs the test photos');
  const photos = await call<unknown[]>(page, 'analysePhotos', pool.map((p) => ({ id: p.id, url: photoUrl(p.file), label: p.label, focal: p.focal })));
  const a = await call<unknown[]>(page, 'styleCompose', DECKS[1], 'film-paper', { photos });
  const b = await call<unknown[]>(page, 'styleCompose', DECKS[1], 'film-paper', { photos });
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
