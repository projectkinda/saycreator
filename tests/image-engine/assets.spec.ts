// Step 6: the element layer. Library elements are drawn where the plan says, recoloured, tinted, outlined and shadowed;
// they work with patches and undo; plans from before still load.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/step6');

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

interface L { id: string; kind: string; x: number; y: number; width: number; height: number; rotation: number; opacity: number; [k: string]: unknown }
const plan = (layers: L[]) => ({ schema: 1 as const, revision: 1, canvas: { width: 400, height: 300, background: '#FFFFFF' }, layers });
const element = (o: Partial<L> & { element: string }): L => ({ id: 'e', kind: 'element', x: 50, y: 50, width: 100, height: 100, rotation: 0, opacity: 1, ...o });

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

test('an element is drawn inside its box, recoloured by source colour token, and nothing spills outside', async ({ page }) => {
  const colors = { accent: '#FF0000', 'accent-dark': '#00FF00', 'accent-light': '#0000FF' };
  const p = plan([element({ element: 'code:cube:1', colors })]);
  // Cube faces in a 100 x 100 box at (50, 50): top face (100, 78), left face (80, 110), right face (120, 110).
  const px = await call<number[][]>(page, 'pixels', p, [[100, 78], [80, 110], [120, 110], [30, 110], [100, 170], [100, 30]]);
  expect(px[0].slice(0, 3)).toEqual([0, 0, 255]);
  expect(px[1].slice(0, 3)).toEqual([255, 0, 0]);
  expect(px[2].slice(0, 3)).toEqual([0, 255, 0]);
  for (const outside of [px[3], px[4], px[5]]) expect(outside.slice(0, 3)).toEqual([255, 255, 255]);
  const r = await call<{ b64: string; report: { warnings: { code: string }[] } }>(page, 'renderPlan', p);
  expect(r.report.warnings).toEqual([]);
  fs.writeFileSync(path.join(OUT, 'element-cube.png'), Buffer.from(r.b64, 'base64'));
});

test('a wide element is fitted, not stretched: a 200 x 60 squiggle in a 100 x 100 box keeps its shape and sits in the middle', async ({ page }) => {
  const p = plan([element({ element: 'code:squiggle:1', colors: { accent: '#FF0000' } })]);
  const rows = await call<number[][]>(page, 'pixels', p, [[100, 55], [100, 150], [100, 100]]);
  expect(rows[0].slice(0, 3)).toEqual([255, 255, 255]); // box is 100 tall, the squiggle is 30 tall in the middle
  expect(rows[1].slice(0, 3)).toEqual([255, 255, 255]);
});

test('tint makes one flat colour; sticker draws an outline outside the shape; shadow falls to one side', async ({ page }) => {
  const tinted = await call<number[][]>(page, 'pixels', plan([element({ element: 'code:cube:1', tint: '#000000' })]), [[100, 78], [80, 110], [120, 110]]);
  for (const t of tinted) expect(t.slice(0, 3)).toEqual([0, 0, 0]);
  // A sticker: red sphere with a thick blue outline. Just outside the sphere's edge there is blue; far outside there is not.
  const s = plan([element({ element: 'code:sphere:1', x: 100, y: 50, width: 160, height: 160, colors: { accent: '#FF0000', 'accent-dark': '#990000', 'accent-light': '#FFCCCC' }, sticker: { color: '#0000FF', width: 8 } })]);
  const ring = await call<number[][]>(page, 'pixels', s, [[103, 130], [180, 130], [5, 5]]);
  expect(ring[0].slice(0, 3)).toEqual([0, 0, 255]); // the outline, outside the sphere
  expect(ring[1][0]).toBeGreaterThan(150); // red inside
  expect(ring[2].slice(0, 3)).toEqual([255, 255, 255]);
  const shadowed = plan([element({ element: 'code:cube:1', shadow: { color: '#000000', blur: 0, offsetX: 30, offsetY: 30 }, colors: { accent: '#FF0000', 'accent-dark': '#FF0000', 'accent-light': '#FF0000' } })]);
  const sp = await call<number[][]>(page, 'pixels', shadowed, [[150, 140], [60, 60]]);
  expect(sp[0][0]).toBeLessThan(80); // a dark shadow where nothing else is drawn
  const png = await call<{ b64: string }>(page, 'renderPlan', s);
  fs.writeFileSync(path.join(OUT, 'element-sticker.png'), Buffer.from(png.b64, 'base64'));
});

test('an element that is not in the library is reported, not hidden, and does not stop the rest drawing', async ({ page }) => {
  const r = await call<{ report: { ok: boolean; warnings: { code: string; layerId: string; message: string }[] } }>(page, 'renderPlan', plan([element({ element: 'nopack:missing' }), { id: 'r', kind: 'shape', shape: 'rect', x: 10, y: 10, width: 30, height: 30, rotation: 0, opacity: 1, fill: '#FF0000', radius: 0 }]));
  expect(r.report.ok).toBe(false);
  expect(r.report.warnings[0]).toMatchObject({ code: 'element-missing', layerId: 'e' });
  expect(r.report.warnings[0].message).toMatch(/not in the library/);
});

test('bad element layers are refused in plain words, and plans from before this layer type still load', async ({ page }) => {
  const val = (layer: unknown) => call<string[]>(page, 'validate', plan([layer as L]));
  expect((await val(element({ element: 'not an id' }))).join(' ')).toMatch(/the element id "not an id" is not an id like/);
  expect((await val(element({ element: 'code:blob:1', tint: 'red' }))).join(' ')).toMatch(/the tint "red" is not a colour/);
  expect((await val(element({ element: 'code:blob:1', sticker: { color: '#000000', width: 99 } }))).join(' ')).toMatch(/sticker outline width must be between 0 and 60/);
  expect((await val(element({ element: 'code:blob:1', shadow: { color: '#000000', blur: 500, offsetX: 0, offsetY: 0 } }))).join(' ')).toMatch(/shadow blur must be between 0 and 100/);
  expect(await val(element({ element: 'code:blob:1', tint: '#112233', colors: { accent: '#FF0000' }, sticker: { color: '#FFFFFF', width: 6 }, shadow: { color: '#00000066', blur: 8, offsetX: 4, offsetY: 6 } }))).toEqual([]);
  // A plan saved before elements existed (Step 1 sample) validates and draws as before.
  const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/image-engine/plans/carousel-slide.plan.json'), 'utf8'));
  expect(await call<string[]>(page, 'validate', old)).toEqual([]);
  const r = await call<{ width: number; height: number }>(page, 'renderPlan', old);
  expect([r.width, r.height]).toEqual([1080, 1350]);
});

test('elements are edited with patches: change the tint, move it, undo gives identical pixels, redo restores', async ({ page }) => {
  const p = plan([element({ element: 'code:blob:2', colors: { accent: '#FF0000' } })]);
  const patch = { baseRevision: 1, label: 'Tint and move', ops: [{ op: 'set', id: 'e', path: 'tint', value: '#0000FF' }, { op: 'set', id: 'e', path: 'x', value: 200 }] };
  const cycle = await call<{ shots: Record<string, string>; ok: boolean[]; planAfterUndoEqualsBefore: boolean }>(page, 'patchCycle', p, patch);
  expect(cycle.ok).toEqual([true, true, true]);
  expect(cycle.planAfterUndoEqualsBefore).toBe(true);
  expect(cycle.shots.undone).toBe(cycle.shots.before);
  expect(cycle.shots.after).not.toBe(cycle.shots.before);
  expect(cycle.shots.redone).toBe(cycle.shots.after);
});

test('the library lists every pack with its licence, and every element has tags and a recolour map', async ({ page }) => {
  const lib = await call<{ packs: { id: string; licence: string; version: string; count: number; attribution: string }[]; elements: { id: string; pack: string; tags: string[]; recolour: Record<string, string>; slots: string[] }[] }>(page, 'elementList');
  const ids = lib.packs.map((p) => p.id);
  expect(ids).toContain('code');
  expect(lib.elements.length).toBeGreaterThan(40);
  for (const e of lib.elements) {
    expect(e.tags.length, e.id).toBeGreaterThan(0);
    expect(Object.keys(e.recolour).length, e.id).toBeGreaterThan(0);
    expect(e.slots.length, e.id).toBeGreaterThan(0);
  }
  const allowed = ['ISC', 'MIT', 'Apache-2.0', 'CC0-1.0', 'Ours (no third-party material)'];
  for (const p of lib.packs) {
    expect(allowed, `${p.id} licence`).toContain(p.licence);
    expect(p.attribution.length).toBeGreaterThan(5);
  }
  // The tags people ask for exist.
  const tagged = (t: string) => lib.elements.filter((e) => e.tags.includes(t)).length;
  for (const t of ['arrow', 'star', 'doodle', 'sticker', 'tape', 'halftone', 'blob']) expect(tagged(t), `tag ${t}`).toBeGreaterThan(0);
  if (ids.includes('fluent')) for (const t of ['school', 'money', 'speech-bubble', 'rocket']) expect(tagged(t), `tag ${t}`).toBeGreaterThan(0);
});

test('fetched pack elements draw and recolour like the rest (skipped if npm run fetch:assets has not been run)', async ({ page }) => {
  const lib = await call<{ packs: { id: string }[]; elements: { id: string; recolour: Record<string, string> }[] }>(page, 'elementList');
  test.skip(!lib.packs.some((p) => p.id === 'lucide'), 'packs not fetched');
  const pick = (id: string) => lib.elements.find((e) => e.id === id)!;
  const layers = [
    element({ id: 'a', element: 'lucide:arrow-right', x: 10, y: 10, width: 80, height: 80, colors: { currentcolor: '#FF0000' } }),
    element({ id: 'b', element: 'phosphor-fill:star', x: 110, y: 10, width: 80, height: 80, tint: '#0000FF' }),
    element({ id: 'c', element: 'fluent:rocket', x: 210, y: 10, width: 80, height: 80 }),
    element({ id: 'd', element: 'phosphor-bold:heart', x: 310, y: 10, width: 80, height: 80, colors: { currentcolor: '#00AA00' } }),
  ];
  const r = await call<{ b64: string; report: { warnings: { message: string }[] } }>(page, 'renderPlan', plan(layers));
  expect(r.report.warnings, JSON.stringify(r.report.warnings)).toEqual([]);
  fs.writeFileSync(path.join(OUT, 'pack-elements.png'), Buffer.from(r.b64, 'base64'));
  // Every one of the four boxes has ink in it, and the first is red, the second blue, the fourth green.
  const probes = await call<number[][]>(page, 'pixels', plan(layers), [[50, 50], [150, 46], [250, 50], [350, 56], [200, 200]]);
  expect(probes[4].slice(0, 3)).toEqual([255, 255, 255]);
  const dominant = (p: number[]) => p.slice(0, 3).indexOf(Math.max(...p.slice(0, 3)));
  const inked = async (x0: number) => {
    const pts: [number, number][] = [];
    for (let y = 15; y < 90; y += 5) for (let x = x0 + 5; x < x0 + 85; x += 5) pts.push([x, y]);
    const px = await call<number[][]>(page, 'pixels', plan(layers), pts);
    return px.filter((p) => p[0] + p[1] + p[2] < 740);
  };
  const red = await inked(10);
  expect(red.length).toBeGreaterThan(8);
  expect(dominant(red[0])).toBe(0);
  const blue = await inked(110);
  expect(blue.length).toBeGreaterThan(30);
  expect(dominant(blue[0])).toBe(2);
  const rocket = await inked(210);
  expect(rocket.length).toBeGreaterThan(30);
  const green = await inked(310);
  expect(green.length).toBeGreaterThan(20);
  expect(dominant(green[0])).toBe(1);
  expect(pick('fluent:rocket').recolour).toBeTruthy();
});
