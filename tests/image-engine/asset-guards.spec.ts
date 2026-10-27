// Step 6 guards: the test-assets guard catches every way a private picture could leak into the product, the licence check
// fails on a disallowed asset licence, and the element rules of a style are checked in plain words. No browser pictures needed.
import { expect, test, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GUARD = path.join(ROOT, 'scripts/check-test-assets.mjs');
const LICENCES = path.join(ROOT, 'scripts/check-licenses.mjs');
const MANIFEST = path.join(ROOT, 'scripts/assets.manifest.json');

const guard = (tree: string) => spawnSync(process.execPath, [GUARD, '--root', tree], { encoding: 'utf8' });
function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

test.describe('test-assets guard', () => {
  test('a clean tree passes, even with private pictures present', () => {
    const t = tree({ 'test-assets/sticker-one.png': 'PRIVATE-BYTES-1', 'src/a.ts': 'export const a = 1;', 'public/b.txt': 'hello' });
    const r = guard(t);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('guard passed');
  });
  test('fails when source mentions the folder', () => {
    const r = guard(tree({ 'test-assets/sticker-one.png': 'X1', 'src/a.ts': "const u = '/test-assets/foo.png';" }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/a.ts');
  });
  test('fails when source mentions a test asset file by name', () => {
    const r = guard(tree({ 'test-assets/sticker-one.png': 'X2', 'src/styles/x/style.json': '{"asset":"sticker-one.png"}' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sticker-one.png');
  });
  test('fails when a file with the same name is in public or dist', () => {
    expect(guard(tree({ 'test-assets/sticker-one.png': 'X3', 'public/sticker-one.png': 'other' })).status).toBe(1);
    expect(guard(tree({ 'test-assets/sticker-one.png': 'X3', 'dist/assets/sticker-one.png': 'other' })).status).toBe(1);
  });
  test('fails when a copy of a test asset is bundled under another name', () => {
    const r = guard(tree({ 'test-assets/sticker-one.png': 'SAME-BYTES', 'public/renamed.bin': 'SAME-BYTES' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is a copy of the test asset');
  });
  test('fails when a SHIPPABLE output mentions the folder, but a TEST output may', () => {
    const bad = guard(tree({ 'test-assets/sticker-one.png': 'X4', 'out/image-engine/asset-recreation/hot-flat/shippable/d/slide-01.plan.json': '{"src":"/test-assets/x.png"}' }));
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('SHIPPABLE output');
    const ok = guard(tree({ 'test-assets/sticker-one.png': 'X4', 'out/image-engine/asset-recreation/hot-flat/test/d/slide-01.plan.json': '{"src":"/test-assets/x.png"}' }));
    expect(ok.status, ok.stderr).toBe(0);
  });
  test('the real repository is clean', () => {
    const r = spawnSync(process.execPath, [GUARD], { encoding: 'utf8', cwd: ROOT });
    expect(r.status, r.stderr).toBe(0);
  });
});

test.describe('asset licence check', () => {
  test('passes now, and fails when a source gets a licence that is not permissive (manifest restored afterwards)', () => {
    const run = () => spawnSync(process.execPath, [LICENCES], { encoding: 'utf8', cwd: ROOT });
    const ok = run();
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    const original = fs.readFileSync(MANIFEST, 'utf8');
    try {
      const m = JSON.parse(original);
      m.sources[0].licence = 'CC-BY-SA-4.0';
      fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
      const bad = run();
      expect(bad.status).toBe(1);
      expect(bad.stdout + bad.stderr).toMatch(/not on the permissive list/);
    } finally {
      fs.writeFileSync(MANIFEST, original);
    }
    expect(fs.readFileSync(MANIFEST, 'utf8')).toBe(original);
  });
});

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

test.describe('style elements block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/image-engine/harness/index.html');
    await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
  });
  const base = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/image-engine/styles/hot-flat/style.json'), 'utf8'));
  const check = (page: Page, raw: unknown) => call<{ errors: string[]; warnings: string[] }>(page, 'styleValidate', raw, 'hot-flat');
  const withRule = (patch: Record<string, unknown>) => {
    const s = base();
    s.elements.rules[0] = { ...s.elements.rules[0], ...patch };
    return s;
  };

  test('the shipped element blocks are valid', async ({ page }) => {
    for (const n of ['hot-flat', 'editorial-collage', 'object-neon']) {
      const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/image-engine/styles', n, 'style.json'), 'utf8'));
      expect((await call<{ errors: string[] }>(page, 'styleValidate', raw, n)).errors, n).toEqual([]);
    }
  });
  test('a bad zone, count, tint or colour is named in plain words', async ({ page }) => {
    expect((await check(page, withRule({ zone: 'middle' }))).errors.join(' ')).toMatch(/zone is "middle"\. Zones:/);
    expect((await check(page, withRule({ count: [0, 9] }))).errors.join(' ')).toMatch(/count must be \[fewest, most\]/);
    expect((await check(page, withRule({ tint: 'purple' }))).errors.join(' ')).toMatch(/tint "purple" is not a palette role/);
    expect((await check(page, withRule({ colour: 'rainbow' }))).errors.join(' ')).toMatch(/colour must be "original" or "palette"/);
    expect((await check(page, withRule({ tags: [] }))).errors.join(' ')).toMatch(/tags must be a list of tag words/);
  });
  test('tags that match nothing in the library are a warning, not an error', async ({ page }) => {
    const r = await check(page, withRule({ tags: ['no-such-tag-anywhere'] }));
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/no-such-tag-anywhere/);
  });
  test('a style with no elements block is still valid and gets no elements', async ({ page }) => {
    const s = base();
    delete s.elements;
    delete s.thumbnail; // the thumbnail block of hot-flat asks for elements, so it goes too
    expect((await check(page, s)).errors).toEqual([]);
  });
});
