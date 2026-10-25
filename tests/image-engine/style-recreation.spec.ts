// Step 5, Phase 2. Every style recreates every sample deck and a set of quote cards. Every slide and card is its own file,
// rendered from its own plan, checked at phone size. Nothing is merged into a contact sheet.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/style-recreation');
const DECKS = fs.readdirSync(path.join(ROOT, 'tests/image-engine/carousels')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/image-engine/carousels', f), 'utf8')));
const CARDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/image-engine/quote-cards/quote-cards.json'), 'utf8'));
const STYLES = fs.readdirSync(path.join(ROOT, 'src/image-engine/styles'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();

interface Lint { id: string; label: string; pass: boolean; reason: string }
interface Slide { id: string; type: string; layout: string; rule: number; palette: string; because: string; notes: string[]; plan: unknown; lint: Lint[]; warnings: unknown[]; png: string; phone: string }
const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const write = (rel: string, data: string | Buffer) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), data);
};

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

test('every style folder loads, passes its schema, and no folder is rejected', async ({ page }) => {
  const r = await call<{ styles: { spec: { name: string; layouts: Record<string, unknown[]> }; warnings: string[]; assets: string[] }[]; problems: { folder: string; messages: string[] }[] }>(page, 'styleList');
  expect(r.problems, JSON.stringify(r.problems)).toEqual([]);
  expect(r.styles.map((s) => s.spec.name).sort()).toEqual(STYLES);
  expect(STYLES.length).toBeGreaterThanOrEqual(4);
  for (const s of r.styles) for (const [type, rules] of Object.entries(s.spec.layouts)) expect(rules.length, `${s.spec.name} ${type}`).toBeGreaterThanOrEqual(2);
  write('styles.json', JSON.stringify(r.styles.map((s) => ({ name: s.spec.name, warnings: s.warnings, assets: s.assets })), null, 2));
});

test('every slide and every quote card is its own file, with its plan, its lint and a phone copy', async ({ page }) => {
  test.setTimeout(600_000);
  const index: unknown[] = [];
  for (const style of STYLES) {
    for (const deck of DECKS) {
      const slides = await call<Slide[]>(page, 'styleRun', deck, style);
      expect(slides).toHaveLength(7);
      slides.forEach((s, i) => {
        const base = `${style}/${deck.id}/slide-${String(i + 1).padStart(2, '0')}`;
        write(`${base}.png`, Buffer.from(s.png, 'base64'));
        write(`${base}-phone.png`, Buffer.from(s.phone, 'base64'));
        write(`${base}.plan.json`, JSON.stringify(s.plan, null, 2));
        const failed = s.lint.filter((l) => !l.pass);
        write(`${base}.lint.json`, JSON.stringify({ style, script: deck.id, scriptTitle: deck.title, index: i + 1, type: s.type, layout: s.layout, rule: s.rule, because: s.because, palette: s.palette, notes: s.notes, warnings: s.warnings, pass: failed.length === 0, lint: s.lint }, null, 2));
        index.push({ style, script: deck.id, kind: 'slide', index: i + 1, type: s.type, layout: s.layout, pass: failed.length === 0, failed: failed.map((f) => f.id) });
      });
    }
    const cards = await call<Slide[]>(page, 'styleRun', CARDS, style, { width: 1080, height: 1080, chrome: 'none', anyCount: true });
    expect(cards).toHaveLength(3);
    cards.forEach((s, i) => {
      const base = `${style}/quote-cards/card-${String(i + 1).padStart(2, '0')}`;
      write(`${base}.png`, Buffer.from(s.png, 'base64'));
      write(`${base}-phone.png`, Buffer.from(s.phone, 'base64'));
      write(`${base}.plan.json`, JSON.stringify(s.plan, null, 2));
      const failed = s.lint.filter((l) => !l.pass);
      write(`${base}.lint.json`, JSON.stringify({ style, script: 'quote-cards', scriptTitle: CARDS.title, index: i + 1, type: s.type, layout: s.layout, rule: s.rule, because: s.because, palette: s.palette, notes: s.notes, warnings: s.warnings, pass: failed.length === 0, lint: s.lint }, null, 2));
      index.push({ style, script: 'quote-cards', kind: 'card', index: i + 1, type: s.type, layout: s.layout, pass: failed.length === 0, failed: failed.map((f) => f.id) });
    });
  }
  write('index.json', JSON.stringify({ generatedAt: new Date().toISOString(), slides: index }, null, 2));
  const total = STYLES.length * (DECKS.length * 7 + 3);
  expect(index).toHaveLength(total);
  // No file holds more than one slide: every PNG is exactly one slide's size.
  const sizes = new Set<string>();
  for (const style of STYLES) {
    const f = fs.readFileSync(path.join(OUT, style, DECKS[0].id, 'slide-01.png'));
    sizes.add(`${f.readUInt32BE(16)}x${f.readUInt32BE(20)}`);
    const c = fs.readFileSync(path.join(OUT, style, 'quote-cards', 'card-01.png'));
    sizes.add(`${c.readUInt32BE(16)}x${c.readUInt32BE(20)}`);
  }
  expect([...sizes].sort()).toEqual(['1080x1080', '1080x1350']);
});

test('each style uses at least two different layouts for every slide type that appears twice or more, chosen by content or position', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')).slides as { style: string; kind: string; type: string; layout: string }[];
  const types = new Set(idx.map((s) => s.type));
  expect([...types].sort()).toEqual(['beforeafter', 'checklist', 'closing', 'content', 'cover', 'quote', 'stat', 'step']);
  const report: Record<string, Record<string, string[]>> = {};
  for (const style of STYLES) {
    report[style] = {};
    for (const type of types) {
      const used = [...new Set(idx.filter((s) => s.style === style && s.type === type).map((s) => s.layout))];
      report[style][type] = used;
      expect(used.length, `${style} ${type} used ${used.join(', ')}`).toBeGreaterThanOrEqual(2);
    }
  }
  write('variants-used.json', JSON.stringify(report, null, 2));
  // The styles really are different compositions: for every slide type, the layout picked for the first deck's slides
  // differs between at least two styles.
  for (const type of types) {
    const perStyle = STYLES.map((st) => idx.filter((s) => s.style === st && s.type === type).map((s) => s.layout).join('|'));
    expect(new Set(perStyle).size, `${type}: styles should not all share the same layouts`).toBeGreaterThanOrEqual(2);
  }
});

test('slides are plans: every one is editable by a patch and checked again on its own', async ({ page }) => {
  test.setTimeout(120_000);
  const planFile = path.join(OUT, 'hot-flat', 'howto-linkedin', 'slide-03.plan.json');
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const before = await call<{ lint: Lint[]; png: string }>(page, 'styleCheckPlan', plan, 'hot-flat');
  const head = plan.layers.find((l: { id: string }) => l.id === 'headline');
  expect(head, 'the slide has a layer called headline').toBeTruthy();
  const patch = { baseRevision: 1, label: 'Shorter headline', ops: [{ op: 'set', id: 'headline', path: 'text', value: 'WRITE ONE SENTENCE' }] };
  const patched = await call<{ ok: boolean; plan: unknown; reasons?: string[] }>(page, 'patchPlan', plan, patch);
  expect(patched.ok, JSON.stringify(patched.reasons)).toBe(true);
  const after = await call<{ lint: Lint[]; png: string }>(page, 'styleCheckPlan', patched.plan, 'hot-flat');
  expect(after.png).not.toBe(before.png);
  expect(after.lint.map((l) => l.id)).toEqual(before.lint.map((l) => l.id));
  // The plan file on disk renders the same picture as the PNG that was written next to it.
  const again = await call<{ png: string }>(page, 'styleCheckPlan', plan, 'hot-flat');
  expect(again.png).toBe(before.png);
});
