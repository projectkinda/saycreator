// The slide self-check (Contrast) reads accent runs and marker bars, not only the slot's own colour. ZERO model calls.
//   It used to measure one colour per text slot (the headline's own ink against the ground), so white accent words on a lime ground passed with "3 text slots have enough contrast".
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test('the contrast self-check sees accent runs and words on a bar', async ({ page }) => {
  const { library: lib } = JSON.parse(fs.readFileSync('tests/image-engine/fixtures/hot-flat-app-library.json', 'utf8'));
  const spec = lib.plan.specs[0];
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ spec }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const L = await import('/src/carousel/layouts/index.ts');
    const PR = await import('/src/carousel/presets.ts');
    const C = await import('/src/reference/faithfulChecks.ts');
    const style: any = D.styleFromPack(PR.presetPackFor('hot-flat', false)).style;
    const b: any = await L.buildSlide('statement', 0, { ...spec.fields, accent: spec.accents }, style, { handle: '@h', index: 0, total: 7, ground: 0 });
    const opts = { canvas: { w: 1080, h: 1350 }, bg: b.fieldBg ?? style.palette.bg, k: 1, slideType: 'cover' };
    const contrast = (layers: any[]) => C.faithfulChecks(layers, opts).find((c: any) => c.id === 'contrast');
    const good = contrast(b.layers);
    // the accent words with no bar behind them
    const noBar = b.layers.map((l: any) => (l.name === 'title' ? { ...l, highlight: undefined } : l));
    return { good, noBar: contrast(noBar), runs: b.layers.find((l: any) => l.name === 'title').runs };
  }, { spec });
  expect(r.good.pass, r.good.reason).toBe(true);
  // accent words set in white (the marker ink) with no bar behind them on the lime ground: the check fails and names the word
  expect(r.noBar.pass).toBe(false);
  expect(r.noBar.reason).toMatch(/title "YOUR HEAD" \(1\.\d:1\)/);
  expect(r.runs.length).toBeGreaterThan(0);
});
