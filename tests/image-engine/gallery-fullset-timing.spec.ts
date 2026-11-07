// How long a FULL gallery takes: every layout of the registry in both variants (draw + rasterise to 220 px), cold. ZERO model calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test('a full gallery (every registry layout x 2 variants) opens in a few seconds', async ({ page }) => {
  const { library: lib } = JSON.parse(fs.readFileSync('tests/image-engine/fixtures/hot-flat-app-library.json', 'utf8'));
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ lib }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const L = await import('/src/carousel/layouts/index.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const style: any = D.styleFromPack(PR.presetPackFor('hot-flat', false)).style;
    const t0 = performance.now();
    let tiles = 0;
    for (const id of L.LAYOUT_IDS) for (const v of [0, 1] as const) {
      const def: any = L.layoutDef(id);
      const d: any = await D.drawOne({ layout: id, fields: def.samples.normal, accents: [] }, v, style, { handle: '@h', index: 0, total: 7, cut: 'plain', invert: false, density: 'normal' });
      if (d.built) { await F.svgToPng(d.built.svg, 220); tiles++; }
    }
    return { ms: Math.round(performance.now() - t0), tiles, layouts: L.LAYOUT_IDS.length };
  }, { lib });
  console.log('FULLSET', JSON.stringify(r));
  expect(r.tiles).toBeGreaterThanOrEqual(r.layouts * 2 - 4);
  expect(r.ms).toBeLessThan(15_000);
});
