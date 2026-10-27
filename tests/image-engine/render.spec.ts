// Real Chrome. Renders plans with Fabric and writes the PNGs to out/image-engine/ for people to open.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Patch, Plan, RenderReport, TextLayer } from '../../src/image-engine/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../out/image-engine');
const plan = (name: string): Plan => JSON.parse(fs.readFileSync(path.join(here, 'plans', name), 'utf8'));
const save = (name: string, b64: string) => fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'));
const findings: Record<string, unknown> = {};

type Rendered = { b64: string; width: number; height: number; report: RenderReport; ms: number };
const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

const blank = (w: number, h: number, layers: Plan['layers']): Plan => ({ schema: 1, revision: 1, canvas: { width: w, height: h, background: '#FFFFFF' }, layers });
const box = { rotation: 0, opacity: 1 };

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));
test.afterAll(() => fs.writeFileSync(path.join(OUT, 'step1-findings.json'), JSON.stringify(findings, null, 2)));

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
  await call(page, 'loadFonts');
  test.info().annotations.push({ type: 'page-errors', description: errors.join('; ') || 'none' });
});

test('fonts: every bundled face loads from the repo and is really used', async ({ page }) => {
  const s = await call<{ loaded: string[]; expected: string[]; ours: number; serif: number }>(page, 'fontStatus');
  for (const e of s.expected) expect(s.loaded).toContain(e);
  expect(Math.abs(s.ours - s.serif)).toBeGreaterThan(s.serif * 0.03); // not the fallback font
  findings.fonts = { loaded: s.loaded };
});

test('carousel slide renders from plan JSON to a 1080x1350 PNG', async ({ page }) => {
  const p = plan('carousel-slide.plan.json');
  const r = await call<Rendered>(page, 'renderPlan', p, 1);
  expect([r.width, r.height]).toEqual([1080, 1350]);
  expect(r.report.warnings).toEqual([]);
  save('step1-carousel-slide.png', r.b64);
  fs.writeFileSync(path.join(OUT, 'step1-carousel-slide.plan.json'), JSON.stringify(p, null, 2));
  findings.carouselSlideMs = r.ms;
  const quarter = await call<Rendered>(page, 'renderPlan', p, 0.25);
  expect([quarter.width, quarter.height]).toEqual([270, 337]); // 337.5 is rounded down by Fabric
  save('step1-carousel-slide-quarter-size.png', quarter.b64);
});

test('quote card renders from plan JSON to a 1080x1080 PNG', async ({ page }) => {
  const p = plan('quote-card.plan.json');
  const r = await call<Rendered>(page, 'renderPlan', p, 1);
  expect([r.width, r.height]).toEqual([1080, 1080]);
  expect(r.report.warnings).toEqual([]);
  save('step1-quote-card.png', r.b64);
  fs.writeFileSync(path.join(OUT, 'step1-quote-card.plan.json'), JSON.stringify(p, null, 2));
  findings.quoteCardMs = r.ms;
});

test('a patch changes the picture, undo gives back the exact same pixels, redo restores the change', async ({ page }) => {
  const p = plan('quote-card.plan.json');
  const patch: Patch = {
    baseRevision: 1,
    label: 'Warm quote and badge',
    ops: [
      { op: 'set', id: 'quote', path: 'style.color', value: '#FFE6A8' },
      { op: 'set', id: 'canvas', path: 'background', value: '#124E4C' },
      { op: 'add', layer: { id: 'badge', kind: 'shape', x: 860, y: 80, width: 130, height: 130, ...box, shape: 'ellipse', fill: '#E8A33D' } },
    ],
  };
  const c = await call<{ shots: Record<string, string>; revs: Record<string, number>; ok: boolean[]; entries: unknown; planAfterUndoEqualsBefore: boolean }>(page, 'patchCycle', p, patch);
  expect(c.ok).toEqual([true, true, true]);
  expect(c.shots.after).not.toBe(c.shots.before);
  expect(c.shots.undone).toBe(c.shots.before); // byte-identical PNG
  expect(c.shots.redone).toBe(c.shots.after);
  expect(c.revs).toEqual({ before: 1, after: 2, undone: 3, redone: 4 });
  expect(c.planAfterUndoEqualsBefore).toBe(true);
  for (const k of ['before', 'after', 'undone', 'redone']) save(`step1-patch-${k}.png`, c.shots[k]);
  findings.patchCycle = { revisions: c.revs, undoIsByteIdentical: c.shots.undone === c.shots.before, history: c.entries };
});

test('coordinates, rotation, opacity and masks land where the plan says (pixel checks)', async ({ page }) => {
  const rect = { id: 'r', kind: 'shape', x: 20, y: 20, width: 100, height: 60, ...box, shape: 'rect', fill: '#FF0000' } as const;
  const at = (l: Plan['layers'][number], pts: [number, number][]) => call<number[][]>(page, 'pixels', blank(200, 200, [l]), pts);

  const plain = await at(rect, [[70, 50], [10, 10], [130, 50]]);
  expect(plain[0].slice(0, 3)).toEqual([255, 0, 0]);
  expect(plain[1].slice(0, 3)).toEqual([255, 255, 255]);
  expect(plain[2].slice(0, 3)).toEqual([255, 255, 255]);

  const turned = await at({ ...rect, rotation: 90 }, [[70, 5], [25, 50]]);
  expect(turned[0].slice(0, 3)).toEqual([255, 0, 0]); // now tall: reaches y=5
  expect(turned[1].slice(0, 3)).toEqual([255, 255, 255]); // no longer reaches x=25

  const half = await at({ ...rect, opacity: 0.5 }, [[70, 50]]);
  expect(half[0][0]).toBe(255);
  expect(Math.abs(half[0][1] - 128)).toBeLessThanOrEqual(2);

  const ellipse = await at({ ...rect, x: 0, y: 0, width: 200, height: 200, mask: { shape: 'ellipse' } }, [[100, 100], [3, 3], [197, 3]]);
  expect(ellipse[0].slice(0, 3)).toEqual([255, 0, 0]);
  expect(ellipse[1].slice(0, 3)).toEqual([255, 255, 255]); // corner is clipped away
  expect(ellipse[2].slice(0, 3)).toEqual([255, 255, 255]);
});

test('cover-crop follows the focal point', async ({ page }) => {
  const photo = { id: 'p', kind: 'image', x: 0, y: 0, width: 400, height: 400, ...box, src: '/test-assets/synthetic-photo.svg', fit: 'cover' } as const;
  const left = await call<number[][]>(page, 'pixels', blank(400, 400, [{ ...photo, focal: { x: 0.3, y: 0.5 } }]), [[134, 200], [266, 200]]);
  const right = await call<number[][]>(page, 'pixels', blank(400, 400, [{ ...photo, focal: { x: 1, y: 0.5 } }]), [[134, 200], [266, 200]]);
  const [r, g, b] = left[0];
  expect(r).toBeGreaterThan(150);
  expect(g).toBeLessThan(80);
  expect(b).toBeLessThan(80); // red marker kept when focused left
  const blueRight = right[1];
  expect(blueRight[2]).toBeGreaterThan(150);
  expect(blueRight[0]).toBeLessThan(80); // blue marker kept when focused right
});

test('text layout: real wrapping, fit-to-box with a minimum, overflow is reported not hidden', async ({ page }) => {
  const text = (over: Partial<TextLayer>): Plan => blank(600, 400, [{ id: 't', kind: 'text', x: 20, y: 20, width: 300, height: 120, ...box, text: 'Cutting onboarding from fourteen days to three', style: { font: 'Schibsted Grotesk', weight: 700, size: 80, color: '#000000', align: 'left', lineHeight: 1.1 }, ...over } as TextLayer]);

  const fitted = text({ autoFit: { minSize: 20 } });
  const lay = await call<{ size: number; lines: { text: string; width: number }[]; fits: boolean; height: number }>(page, 'layout', fitted.layers[0]);
  expect(lay.fits).toBe(true);
  expect(lay.size).toBeLessThan(80);
  expect(lay.size).toBeGreaterThanOrEqual(20);
  expect(lay.lines.length).toBeGreaterThan(1);
  for (const l of lay.lines) expect(l.width).toBeLessThanOrEqual(300 + 0.5);
  expect(lay.height).toBeLessThanOrEqual(120);
  const one = await call<{ size: number }>(page, 'layout', { ...fitted.layers[0], autoFit: { minSize: lay.size + 1 } });
  expect(one.size).toBeGreaterThan(lay.size - 1); // bigger minimum cannot make it smaller than a size that fits
  findings.fitSize = { requested: 80, fitted: lay.size, lines: lay.lines.map((l) => l.text) };

  const tooMuch = await call<Rendered>(page, 'renderPlan', text({ width: 560, height: 60, autoFit: { minSize: 70 } }), 1);
  expect(tooMuch.report.ok).toBe(false);
  expect(tooMuch.report.warnings[0].code).toBe('text-overflow');
  expect(tooMuch.report.warnings[0].message).toMatch(/does not fit its box even at the smallest size \(70px\)/);

  const longWord = await call<Rendered>(page, 'renderPlan', text({ text: 'Supercalifragilisticexpialidocious', style: { font: 'Schibsted Grotesk', weight: 700, size: 80, color: '#000', align: 'left', lineHeight: 1.1 } }), 1);
  expect(longWord.report.warnings[0].message).toMatch(/wider than its box/);

  const wrongWeight = await call<Rendered>(page, 'renderPlan', text({ style: { font: 'Instrument Sans', weight: 800, size: 30, color: '#000', align: 'left', lineHeight: 1.1 } }), 1);
  expect(wrongWeight.report.warnings.some((w) => w.code === 'font-missing')).toBe(true);
});

test('highlight draws a background behind the chosen word', async ({ page }) => {
  const layer: TextLayer = {
    id: 'h', kind: 'text', x: 40, y: 40, width: 520, height: 120, ...box,
    text: 'Make it stand out', style: { font: 'Schibsted Grotesk', weight: 800, size: 64, color: '#000000', align: 'left', lineHeight: 1.2 },
    highlight: { words: ['stand'], color: '#FF0000', paddingX: 14, paddingY: 4, radius: 10 },
  };
  const lay = await call<{ size: number; lineStep: number; lines: { y: number; marks: { x: number; width: number }[] }[] }>(page, 'layout', layer);
  const mark = lay.lines[0].marks[0];
  const y = Math.round(layer.y + lay.lines[0].y + lay.lineStep / 2);
  const pts: [number, number][] = [[Math.round(layer.x + mark.x - 7), y], [Math.round(layer.x + mark.x - 40), y]];
  const px = await call<number[][]>(page, 'pixels', blank(600, 200, [layer]), pts);
  expect(px[0].slice(0, 3)).toEqual([255, 0, 0]); // inside the padding, left of the word
  expect(px[1].slice(0, 3)).toEqual([255, 255, 255]); // well outside
  const r = await call<Rendered>(page, 'renderPlan', blank(600, 200, [layer]), 1);
  save('step1-highlight-check.png', r.b64);
});

test('dragging on an editable canvas proposes a patch and changes nothing until it is applied', async ({ page }) => {
  const p = blank(600, 400, [{ id: 'box', kind: 'shape', x: 100, y: 100, width: 200, height: 150, ...box, shape: 'rect', fill: '#FF0000' }]);
  await call(page, 'mountInteractive', p);
  const upper = page.locator('#stage .upper-canvas');
  const b = (await upper.boundingBox())!;
  await page.mouse.move(b.x + 200, b.y + 175);
  await page.mouse.down();
  await page.mouse.move(b.x + 230, b.y + 190, { steps: 4 });
  await page.mouse.move(b.x + 260, b.y + 205, { steps: 4 });
  await page.mouse.up();
  const patches = await page.evaluate(() => (window as unknown as { __patches: Patch[] }).__patches);
  const selected = await page.evaluate(() => (window as unknown as { __selected: (string | null)[] }).__selected);
  expect(selected).toContain('box');
  expect(patches).toHaveLength(1);
  expect(patches[0].label).toBe('Move');
  expect(patches[0].baseRevision).toBe(1);
  const byPath = Object.fromEntries(patches[0].ops.map((o) => [(o as { path: string }).path, (o as { value: number }).value]));
  expect(Math.abs(byPath.x - 160)).toBeLessThanOrEqual(2);
  expect(Math.abs(byPath.y - 130)).toBeLessThanOrEqual(2);
  const applied = await call<{ ok: boolean; b64: string }>(page, 'applyToInteractive', patches[0]);
  expect(applied.ok).toBe(true);
  save('step1-after-drag.png', applied.b64);
  const stale = await call<{ ok: boolean; reasons: string[] }>(page, 'applyToInteractive', patches[0]);
  expect(stale.ok).toBe(false); // same patch again is now written for an old version
  expect(stale.reasons[0]).toMatch(/older|version/i);
});

test('findings: Fabric headless, in a Worker, and mounted vs off-screen output', async ({ page }) => {
  const probe = await call<Record<string, unknown>>(page, 'workerProbe');
  findings.workerProbe = probe;
  const p = plan('quote-card.plan.json');
  const a = await call<Rendered>(page, 'renderPlan', p, 1);
  const b = await call<Rendered>(page, 'renderPlan', p, 1);
  findings.offScreenIsRepeatable = a.b64 === b.b64;
  expect(a.b64).toBe(b.b64);
  expect(probe).toHaveProperty('fabricImport');
});
