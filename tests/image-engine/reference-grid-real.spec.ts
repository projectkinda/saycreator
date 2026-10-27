// Opt-in (GRID_REAL=1): runs the grid detector, as the screen runs it (three sizes, first grid found), on every collage in
// "Reference carousels likes" and compares with the hand-read grids in grids.json. The references are read from disk and never stored or bundled.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './reference-helpers';

const DIR = path.join(ROOT, 'Reference carousels likes');
test.skip(!process.env.GRID_REAL, 'opt-in: set GRID_REAL=1 (needs the private reference folder)');

test('grid detection against the hand-read grids', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/images');
  const truth = JSON.parse(fs.readFileSync(path.join(DIR, 'grids.json'), 'utf8')) as Record<string, { grid?: { cols: number; rows: number } }>;
  const rows: { file: string; truth: string; found: string; ok: boolean }[] = [];
  for (const [file, t] of Object.entries(truth)) {
    if (!t.grid) continue;
    const b64 = fs.readFileSync(path.join(DIR, file)).toString('base64');
    const found = await page.evaluate(async (b64) => {
      const { detectGrid } = await import('/src/reference/grid.ts');
      const { bitmapOf, cut, pxOfCanvas } = await import('/src/reference/images.ts');
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bm = await bitmapOf(new Blob([bin], { type: 'image/jpeg' }));
      for (const size of [1400, 900, 600]) {
        const g = detectGrid(pxOfCanvas(cut(bm, null, size)));
        if (g) return { cols: g.cols, rows: g.rows, size, method: g.method };
      }
      return null;
    }, b64);
    const want = `${t.grid.cols}x${t.grid.rows}`;
    const got = found ? `${found.cols}x${found.rows} (${found.size}px, ${found.method})` : 'none';
    rows.push({ file, truth: want, found: got, ok: !!found && found.cols === t.grid.cols && found.rows === t.grid.rows });
  }
  const outDir = path.join(ROOT, 'out/image-engine/reference-real');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'grid-remeasure.json'), JSON.stringify({ right: rows.filter((r) => r.ok).length, of: rows.length, rows }, null, 2));
  console.log(rows.map((r) => `${r.ok ? 'OK ' : 'BAD'} ${r.file.slice(0, 8)} want ${r.truth} got ${r.found}`).join('\n'));
  expect(rows.length).toBeGreaterThan(0);
});
