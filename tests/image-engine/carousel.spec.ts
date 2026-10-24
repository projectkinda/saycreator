// Step 3: carousels. Plans are built from theme tokens, drawn correctly, checked at phone size, editable by patches,
// and each check can fail on its own for the right reason.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/step3');
const DIR = path.join(ROOT, 'tests/image-engine/carousels');
const SCRIPTS = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const THEME_IDS = ['paper', 'midnight', 'pop'];

interface Lint { id: string; label: string; pass: boolean; reason: string; measured?: number; limit?: number }
interface Layer { id: string; kind: string; role?: string; x: number; y: number; width: number; height: number; text?: string; fill?: unknown; stroke?: { color: string }; style?: { color: string; font: string; weight: number }; highlight?: { color: string; textColor?: string }; [k: string]: unknown }
interface Plan { schema: 1; revision: number; canvas: { width: number; height: number; background: string }; layers: Layer[] }
interface Slide { id: string; type: string; plan: Plan; notes: string[] }
interface Theme { id: string; base: Record<string, unknown>; hero: Record<string, unknown>; fonts: { headline: string; body: string }; spacing: { margin: number } }

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const save = (rel: string, b64: string) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), Buffer.from(b64, 'base64'));
};

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
  await call(page, 'loadFonts');
});

test('paths and gradients are drawn exactly where the plan says', async ({ page }) => {
  const plan: Plan = {
    schema: 1, revision: 1, canvas: { width: 400, height: 300, background: '#FFFFFF' },
    layers: [
      { id: 'grad', kind: 'shape', shape: 'rect', x: 0, y: 0, width: 400, height: 60, rotation: 0, opacity: 1, fill: { type: 'linear', angle: 90, stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#FFFFFF' }] }, radius: 0 },
      // A filled square drawn as a path: its points start at (0,0) inside the box, so it covers x 100..200, y 100..150.
      { id: 'sq', kind: 'path', x: 100, y: 100, width: 100, height: 50, rotation: 0, opacity: 1, d: 'M 0 0 L 100 0 L 100 50 L 0 50 Z', fill: '#FF0000' },
      // Points that do not start at 0: a block drawn at 30..60 in a box at x 250 must land at x 280..310.
      { id: 'off', kind: 'path', x: 250, y: 100, width: 100, height: 50, rotation: 0, opacity: 1, d: 'M 30 10 L 60 10 L 60 40 L 30 40 Z', fill: '#0000FF' },
    ] as unknown as Layer[],
  };
  const pts: [number, number][] = [[10, 30], [390, 30], [150, 125], [90, 125], [150, 160], [295, 125], [255, 125], [340, 125]];
  const px = await call<number[][]>(page, 'pixels', plan, pts);
  expect(px[0][0]).toBeLessThan(30); // gradient: dark on the left
  expect(px[1][0]).toBeGreaterThan(225); // and light on the right
  expect(px[2].slice(0, 3)).toEqual([255, 0, 0]); // square is where it was drawn
  expect(px[3].slice(0, 3)).toEqual([255, 255, 255]); // not left of it
  expect(px[4].slice(0, 3)).toEqual([255, 255, 255]); // not below it
  expect(px[5].slice(0, 3)).toEqual([0, 0, 255]); // offset path lands at 280..310
  expect(px[6].slice(0, 3)).toEqual([255, 255, 255]); // and not at the box's left edge
  expect(px[7].slice(0, 3)).toEqual([255, 255, 255]);
});

test('bad paths and gradients are refused in plain words', async ({ page }) => {
  const base = { schema: 1, revision: 1, canvas: { width: 400, height: 300, background: '#FFFFFF' } };
  const mk = (layer: unknown) => ({ ...base, layers: [layer] });
  const val = (plan: unknown) => call<string[]>(page, 'validate', plan);
  const common = { x: 0, y: 0, width: 50, height: 50, rotation: 0, opacity: 1 };
  expect((await val(mk({ id: 'p', kind: 'path', ...common, d: 'M 0 0 A 5 5 0 0 1 10 10', fill: '#000000' }))).join(' ')).toMatch(/path data/);
  expect((await val(mk({ id: 'p', kind: 'path', ...common, d: 'M 0 0 L 10 10' }))).join(' ')).toMatch(/fill or a stroke/);
  expect((await val(mk({ id: 's', kind: 'shape', shape: 'rect', ...common, fill: { type: 'linear', angle: 0, stops: [{ at: 0, color: '#000000' }] } }))).join(' ')).toMatch(/2 to 6 colour stops/);
  expect((await val(mk({ id: 's', kind: 'shape', shape: 'rect', ...common, fill: '#000000', role: 'wall' }))).join(' ')).toMatch(/role must be/);
});

test('every slide is built from theme tokens: no colour or font that the theme does not own', async ({ page }) => {
  const themes = await call<Theme[]>(page, 'themes');
  for (const script of SCRIPTS) {
    for (const t of themes) {
      const slides = await call<Slide[]>(page, 'carouselCompose', script, t.id);
      expect(slides).toHaveLength(7);
      const allowed = new Set<string>(['rgba(0,0,0,0)']);
      const take = (v: unknown) => {
        if (typeof v === 'string' && /^(#|rgba?\()/.test(v)) allowed.add(v.toLowerCase());
        else if (v && typeof v === 'object') Object.values(v).forEach(take);
      };
      take(t.base);
      take(t.hero);
      for (const s of slides) {
        const used: string[] = [s.plan.canvas.background];
        const fonts: string[] = [];
        for (const l of s.plan.layers) {
          const f = l.fill;
          if (typeof f === 'string') used.push(f);
          else if (f) (f as { stops: { color: string }[] }).stops.forEach((x) => used.push(x.color));
          if (l.stroke) used.push(l.stroke.color);
          if (l.style) { used.push(l.style.color); fonts.push(l.style.font); }
          if (l.highlight) used.push(l.highlight.color, l.highlight.textColor ?? '#000000');
        }
        for (const c of used) expect(allowed.has(c.toLowerCase()), `${s.id}: colour ${c} is not in theme ${t.id}`).toBe(true);
        for (const f of fonts) expect([t.fonts.headline, t.fonts.body], `${s.id}: font ${f}`).toContain(f);
      }
    }
  }
});

test('the same script gives the same words in every theme, and clearly different pictures', async ({ page }) => {
  test.setTimeout(120_000);
  const script = SCRIPTS.find((s) => s.id === 'howto-linkedin');
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const textsOf = (slides: Slide[]) => slides.map((s) => s.plan.layers.filter((l) => l.kind === 'text' && !/^(dots|swipe|step-label|kicker|handle)/.test(l.id)).map((l) => norm(l.text!)).join(' | '));
  const per: Record<string, Slide[]> = {};
  for (const t of THEME_IDS) per[t] = await call<Slide[]>(page, 'carouselCompose', script, t);
  expect(textsOf(per.midnight)).toEqual(textsOf(per.paper));
  expect(textsOf(per.pop)).toEqual(textsOf(per.paper));
  // Different looks: the cover's background colour and the marker style differ.
  const bg = (t: string) => JSON.stringify(per[t][0].plan.layers.find((l) => l.id === 'bg')!.fill);
  expect(new Set(THEME_IDS.map(bg)).size).toBe(3);
  const markerKinds = THEME_IDS.map((t) => per[t][0].plan.layers.filter((l) => l.id.startsWith('headline-marker')).map((l) => l.kind + (l.stroke ? '-stroke' : '-fill')).join(',') + '|' + (per[t][0].plan.layers.find((l) => l.id === 'headline')?.highlight?.color ?? ''));
  expect(new Set(markerKinds).size).toBe(3);
});

test('all eight slide types appear across the sample scripts', async () => {
  const types = new Set(SCRIPTS.flatMap((s) => s.slides.map((x: { type: string }) => x.type)));
  expect([...types].sort()).toEqual(['beforeafter', 'checklist', 'closing', 'content', 'cover', 'quote', 'stat', 'step']);
  for (const s of SCRIPTS) expect(s.slides).toHaveLength(7);
});

test('each check can fail on its own, for the right reason', async ({ page }) => {
  test.setTimeout(120_000);
  const script = SCRIPTS.find((s) => s.id === 'howto-linkedin');
  const theme = 'paper';
  const slides = await call<Slide[]>(page, 'carouselCompose', script, theme);
  const good = slides[2].plan; // a numbered step
  const margin = 88;
  const layer = (id: string) => good.layers.find((l) => l.id === id)!;
  const set = (id: string, p: string, value: unknown) => ({ op: 'set', id, path: p, value });
  const orphanW = await call<number | null>(page, 'orphanWidth', layer('body'));
  expect(orphanW, 'found a width where the body ends on a single word').not.toBeNull();
  const contentIds = good.layers.filter((l) => l.role === 'content' || l.role === 'container').map((l) => l.id);

  const cases: { name: string; ops: unknown[]; expected: string[]; reason: RegExp }[] = [
    { name: 'fit', ops: [set('headline', 'height', 30)], expected: ['fit'], reason: /taller than its box/ },
    { name: 'size', ops: [set('body', 'style.size', 22), set('body', 'height', 400)], expected: ['size'], reason: /minimum is 32 px/ },
    { name: 'contrast', ops: [set('body', 'style.color', '#E4DCC8')], expected: ['contrast'], reason: /only reaches 4\.5:1/ },
    { name: 'orphan', ops: [set('body', 'width', orphanW), set('body', 'height', 700)], expected: ['orphan'], reason: /alone on the last line/ },
    { name: 'margins', ops: contentIds.map((id) => set(id, 'x', layer(id).x + 40)), expected: ['margins'], reason: /starts 12\d px from the left edge/ },
    { name: 'edges', ops: [set('dots-1', 'x', 20)], expected: ['edges', 'margins'], reason: /px from the edge/ },
    { name: 'overlap', ops: [set('body', 'y', layer('headline').y + 20)], expected: ['overlap'], reason: /overlaps/ },
  ];

  const baseline = await call<{ lint: Lint[]; png: string }>(page, 'carouselCheckPlan', good, theme);
  expect(baseline.lint.filter((l) => !l.pass), 'the unedited slide passes everything').toEqual([]);
  save('bad-variants/00-good.png', baseline.png);

  const tiles: { b64: string; pass: boolean }[] = [{ b64: baseline.png, pass: true }];
  const record: unknown[] = [];
  for (const c of cases) {
    const patched = await call<{ ok: boolean; plan: Plan; reasons?: string[] }>(page, 'patchPlan', good, { baseRevision: 1, label: `Bad: ${c.name}`, ops: c.ops });
    expect(patched.ok, JSON.stringify(patched.reasons)).toBe(true);
    const r = await call<{ lint: Lint[]; png: string }>(page, 'carouselCheckPlan', patched.plan, theme);
    const failed = r.lint.filter((l) => !l.pass);
    expect(failed.map((f) => f.id).sort(), `variant "${c.name}": ${failed.map((f) => f.reason).join(' / ')}`).toEqual([...c.expected].sort());
    expect(failed.find((f) => f.id === c.expected[0])!.reason).toMatch(c.reason);
    save(`bad-variants/${c.name}.png`, r.png);
    fs.writeFileSync(path.join(OUT, `bad-variants/${c.name}.lint.json`), JSON.stringify({ variant: c.name, ops: c.ops.length, expected: c.expected, lint: r.lint }, null, 2));
    tiles.push({ b64: r.png, pass: false });
    record.push({ variant: c.name, failed: failed.map((f) => `${f.id}: ${f.reason}`) });
  }
  save('bad-variants/sheet.png', await call<string>(page, 'makeCarouselSheet', [{ label: 'Good slide, then one deliberately broken copy per check (fit, size, contrast, orphan, margins, edges, overlap)', slides: tiles }], 250));
  fs.writeFileSync(path.join(OUT, 'bad-variants/summary.json'), JSON.stringify(record, null, 2));
  void margin;
});

test('a slide is editable by patches: change, undo, redo, and the checker sees the change', async ({ page }) => {
  const script = SCRIPTS.find((s) => s.id === 'howto-linkedin');
  const slides = await call<Slide[]>(page, 'carouselCompose', script, 'midnight');
  const plan = slides[1].plan;
  const patch = { baseRevision: 1, label: 'New headline', ops: [{ op: 'set', id: 'headline', path: 'text', value: 'Write one clear sentence' }] };
  const cycle = await call<{ shots: Record<string, string>; ok: boolean[]; planAfterUndoEqualsBefore: boolean; entries: unknown[] }>(page, 'patchCycle', plan, patch);
  expect(cycle.ok).toEqual([true, true, true]);
  expect(cycle.planAfterUndoEqualsBefore).toBe(true);
  expect(cycle.shots.undone).toBe(cycle.shots.before); // undo restores identical pixels
  expect(cycle.shots.after).not.toBe(cycle.shots.before);
  expect(cycle.shots.redone).toBe(cycle.shots.after);
});
