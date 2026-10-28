// Step 15a: the layout gallery from the Crello TEST set. No model calls anywhere. The first group needs no browser: the converter keeps boxes only, near-identical
// layouts are folded, and the guard fails when a preview picture, template text or the data itself could end up in a build. The second group opens the real
// gallery against the derived file (skipped, and said so, when the file has not been made).
import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GUARD = path.join(ROOT, 'scripts/check-test-assets.mjs');
const DATA = path.join(ROOT, 'test-data/crello/layouts.json');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const build = async (): Promise<any> => import(pathToFileURL(path.join(ROOT, 'scripts/crello-build.mjs')).href);

const guard = (tree: string, ...extra: string[]) => spawnSync(process.execPath, [GUARD, '--root', tree, ...extra], { encoding: 'utf8' });
function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crello-guard-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const SENT = 'CRELLO-TEST-DATA-SENTINEL-7f3a';
const envelope = (layouts: unknown[]) => JSON.stringify({ [SENT]: true, label: 'TEST DATA: Crello, not shippable until licences are checked', layouts });

// A template as crello-fetch.mjs leaves it: the text content is already gone, only its length is kept.
const el = (o: Record<string, unknown>) => ({ t: 'TextElement', x: 0, y: 0, w: 100, h: 100, a: 0, o: 1, c: [], len: 0, lines: 0, font: '', fs: 0, al: '', cap: false, lh: 1, ls: 0, tc: '', bold: false, ...o });
const template = (id: string, shift = 0) => ({
  id, split: 'train', format: 'Youtube Thumbnail', category: 'foodDrinks', w: 1280, h: 720, keywords: ['pizza', 'a'.repeat(60)], industries: [], mobile: false,
  el: [
    el({ t: 'ColoredBackground', x: 0, y: 0, w: 1280, h: 720, c: ['rgba(20, 30, 40, 1)'] }),
    el({ t: 'ImageElement', x: 640 + shift, y: 0, w: 640, h: 720 }),
    el({ t: 'SvgElement', x: 40, y: 500, w: 500, h: 120, c: ['rgba(255, 200, 0, 1)'] }),
    el({ x: 60 + shift, y: 120, w: 540, h: 260, len: 24, lines: 2, fs: 120, lh: 1.05, al: 'left', tc: 'rgba(255, 255, 255, 1)', bold: true, cap: true }),
    el({ x: 60, y: 520, w: 480, h: 80, len: 18, lines: 1, fs: 44, al: 'left', tc: 'rgba(20, 30, 40, 1)' }),
  ],
});

test.describe('derived layouts and the guard (no browser)', () => {
  test('a template becomes boxes in percent at its own shape, roles by rank, sizes as a fraction of the height; no words, no picture', async () => {
    const { convert } = await build();
    const l = convert(template('0123456789abcdef01234567'));
    expect(l.ratio).toBe('16:9');
    expect([l.w, l.h]).toEqual([1280, 720]);
    expect(l.free.background).toEqual({ kind: 'flat', colours: ['#141E28'] });
    expect(l.free.photos).toEqual([{ id: 'photo1', box: { x: 50, y: 0, w: 50, h: 100 }, shape: 'rect' }]);
    expect(l.free.slots.map((s: { role: string }) => s.role)).toEqual(['title', 'subtitle']);
    const [title, sub] = l.free.slots;
    expect(title.box).toEqual({ x: 4.7, y: 16.7, w: 42.2, h: 36.1 });
    expect(title.sizePx).toBe(Math.round((120 / 720) * 1350));
    expect(title.treatments).toEqual([{ kind: 'caps' }]);
    expect(sub.sizePx).toBe(Math.round((44 / 720) * 1350));
    expect(l.free.shapes[0]).toMatchObject({ kind: 'rect', colour: '#FFC800' });
    // nothing but boxes: no text key, no long strings, no link
    const text = JSON.stringify(l);
    expect(text).not.toMatch(/"(text|title|preview|image|src|url)"\s*:/);
    expect(l.keywords.every((k: string) => k.length <= 24)).toBe(true);
    expect(l.keywords).toEqual(['pizza']);
  });

  test('a text under 32 px at 1350 px high is raised to 32 and the layout says so; a template with no text is left out', async () => {
    const { convert } = await build();
    const t = template('aaaaaaaaaaaaaaaaaaaaaaaa');
    t.el[4] = el({ x: 60, y: 520, w: 480, h: 20, len: 9, lines: 1, fs: 12, al: 'left', tc: 'rgba(0, 0, 0, 1)' });
    const l = convert(t);
    expect(l.free.slots[1].sizePx).toBe(32);
    expect(l.free.missing.join(' ')).toMatch(/phone minimum of 32 px/);
    expect(convert({ ...template('bbbbbbbbbbbbbbbbbbbbbbbb'), el: [el({ t: 'ColoredBackground', c: ['rgba(1, 1, 1, 1)'] })] })).toBeNull();
  });

  test('near-identical layouts are one group and one is kept; a different layout stays', async () => {
    const { convert, dedupe } = await build();
    const a = convert(template('cccccccccccccccccccccc01'));
    const b = convert(template('cccccccccccccccccccccc02', 4));
    const c = convert({ ...template('cccccccccccccccccccccc03'), el: [el({ t: 'ColoredBackground', c: ['rgba(1, 1, 1, 1)'] }), el({ x: 500, y: 600, w: 700, h: 90, len: 5, lines: 1, fs: 50, al: 'right', tc: 'rgba(255, 255, 255, 1)' }), el({ x: 20, y: 20, w: 300, h: 90, len: 5, lines: 1, fs: 50, al: 'left', tc: 'rgba(255, 255, 255, 1)' })] });
    const r = dedupe([a, b, c]);
    expect(r.kept.map((k: { id: string }) => k.id)).toEqual([a.id, c.id]);
    expect(r.kept[0].similar).toBe(1);
  });

  test('the derived file check passes for boxes only and fails for a preview key, a link, a picture file or a long text', () => {
    const good = tree({ 'f.json': envelope([{ id: 'cr-1', format: 'Instagram', free: { slots: [{ id: 'text1', role: 'title' }], missing: ['2 small pictures (stickers or logos) not drawn'] } }]) });
    const ok = spawnSync(process.execPath, [GUARD, '--check-crello', path.join(good, 'f.json')], { encoding: 'utf8' });
    expect(ok.status, ok.stderr).toBe(0);
    for (const [why, layout, expected] of [
      ['a preview key', { id: 'cr-1', preview: 'x' }, 'preview'],
      ['text content', { id: 'cr-1', free: { slots: [{ text: 'hi' }] } }, 'holds content'],
      ['a data link', { id: 'cr-1', note: 'data:image/png;base64,AAAA' }, 'link or a picture'],
      ['a long text', { id: 'cr-1', note: 'x'.repeat(60) }, 'long text'],
    ] as const) {
      const bad = tree({ 'f.json': envelope([layout]) });
      const r = spawnSync(process.execPath, [GUARD, '--check-crello', path.join(bad, 'f.json')], { encoding: 'utf8' });
      expect(r.status, why).toBe(1);
      expect(r.stderr, why).toContain(expected);
    }
    const noMarker = tree({ 'f.json': JSON.stringify({ label: 'x', layouts: [] }) });
    expect(spawnSync(process.execPath, [GUARD, '--check-crello', path.join(noMarker, 'f.json')], { encoding: 'utf8' }).status).toBe(1);
  });

  test('the build guard fails when the test data, a picture beside it, or its marker turns up where a build would pick it up', () => {
    const data = envelope([{ id: 'cr-1' }]);
    const clean = guard(tree({ 'test-data/crello/layouts.json': data, 'src/a.ts': 'export const a = 1;', 'public/b.txt': 'hello' }));
    expect(clean.status, clean.stderr).toBe(0);
    // the data copied into public/ or dist/, under its own name or another
    expect(guard(tree({ 'test-data/crello/layouts.json': data, 'public/layouts.json': 'x' })).status).toBe(1);
    expect(guard(tree({ 'test-data/crello/layouts.json': data, 'dist/assets/renamed.json': data })).status).toBe(1);
    // the marker alone, without the file
    const marked = guard(tree({ 'test-data/crello/layouts.json': data, 'dist/assets/index.js': `const x="${SENT}"` }));
    expect(marked.status).toBe(1);
    expect(marked.stderr).toContain('marker');
    // a name with "crello" in public/ or dist/, and source that points at the folder
    expect(guard(tree({ 'public/crello-layouts.bin': 'x' })).status).toBe(1);
    expect(guard(tree({ 'test-data/crello/layouts.json': data, 'src/a.ts': "fetch('/test-data/crello/x')" })).status).toBe(1);
    // a preview picture or a dataset file kept in the folder, or a data file with preview keys
    expect(guard(tree({ 'test-data/crello/layouts.json': data, 'test-data/crello/preview.png': 'PNG' })).status).toBe(1);
    expect(guard(tree({ 'test-data/crello/layouts.json': envelope([{ id: 'cr-1', preview: 'x' }]) })).status).toBe(1);
  });

  test('the real repository passes the guard, and the real derived file (when made) is boxes only and says it is test data', () => {
    const r = spawnSync(process.execPath, [GUARD], { encoding: 'utf8', cwd: ROOT });
    expect(r.status, r.stderr).toBe(0);
    test.skip(!fs.existsSync(DATA), 'The derived file has not been made here (npm run crello:fetch, then npm run crello:build).');
    const j = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    expect(j.label).toMatch(/^TEST DATA: Crello, not shippable until licences are checked/);
    expect(JSON.stringify(j).length).toBeLessThan(2_000_000);
  });
});

test.describe('the gallery (needs the derived file)', () => {
  test.skip(!fs.existsSync(DATA), 'The derived file has not been made here (npm run crello:fetch, then npm run crello:build).');

  test('every layout passes the free-layout checks, the filters narrow the list, a star stays after a reload', async ({ page }) => {
    await page.goto('/images/layouts');
    await expect(page.getByText('TEST DATA: Crello, not shippable until licences are checked.')).toBeVisible();
    const summary = page.getByText(/^Showing \d+ of \d+ layouts/);
    await expect(summary).toBeVisible({ timeout: 30_000 });
    const text = (await summary.textContent()) ?? '';
    const total = Number(/of (\d+) layouts/.exec(text)![1]);
    expect(total).toBeGreaterThan(100);
    expect(text).not.toContain('failed the layout checks');
    await page.getByLabel('Shape', { exact: true }).selectOption('16:9');
    const n169 = Number(/of (\d+) layouts/.exec((await summary.textContent()) ?? '')![1]);
    expect(n169).toBeGreaterThan(10);
    expect(n169).toBeLessThan(total);
    await page.getByLabel('Text blocks', { exact: true }).selectOption('2');
    await page.getByLabel('Photo', { exact: true }).selectOption('with');
    const narrowed = Number(/of (\d+) layouts/.exec((await summary.textContent()) ?? '')![1]);
    expect(narrowed).toBeLessThan(n169);
    for (const card of await page.locator('.lg-card').all().then((a) => a.slice(0, 5))) await expect(card).toContainText(/16:9 · 2 text blocks · \d photo/);
    const first = page.locator('.lg-card').first();
    const id = (await first.getAttribute('aria-label'))!.replace('Layout ', '');
    await first.getByRole('button', { name: new RegExp(`Star layout ${id}`) }).click();
    await page.reload();
    await page.getByLabel('Shape', { exact: true }).selectOption('16:9');
    await page.getByLabel('Text blocks', { exact: true }).selectOption('2');
    await page.getByLabel('Photo', { exact: true }).selectOption('with');
    await expect(page.getByRole('button', { name: `Remove the star from layout ${id}` })).toBeVisible();
    await page.getByRole('button', { name: `Remove the star from layout ${id}` }).click();
    await page.getByLabel('Search keywords', { exact: true }).fill('zzzzzz-nothing');
    await expect(page.getByText('No layout matches')).toBeVisible();
  });

  test('"Try with my content" draws the person\'s words at the layout\'s own shape (not stretched), and saving makes a Mine template', async ({ page }) => {
    await page.goto('/images/layouts');
    await expect(page.getByText(/^Showing \d+ of \d+ layouts/)).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Shape', { exact: true }).selectOption('1:1');
    await page.getByLabel('Text blocks', { exact: true }).selectOption('3');
    const card = page.locator('.lg-card').first();
    const id = (await card.getAttribute('aria-label'))!.replace('Layout ', '');
    await page.getByLabel('Title', { exact: true }).fill('Ten dishes in ten minutes');
    await card.getByRole('button', { name: `Try layout ${id} with my content` }).click();
    const img = card.locator('.lg-fitted');
    await expect(img).toBeVisible({ timeout: 30_000 });
    const [w, h] = await img.evaluate((e: HTMLImageElement) => [e.naturalWidth, e.naturalHeight]);
    expect(Math.abs(w / h - 1)).toBeLessThan(0.02);
    await expect(card.getByRole('status').first()).toContainText(/Fits\.|Does not fit cleanly\./);
    await card.getByRole('button', { name: `Save layout ${id} as a template` }).click();
    await expect(card.getByText(/Saved as/)).toBeVisible({ timeout: 15_000 });
    await page.goto('/images/styles');
    await expect(page.getByRole('heading', { name: /layout / }).first()).toContainText('Mine');
    // leave no template behind
    await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.deleteDatabase('creator-style-templates'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  });
});
