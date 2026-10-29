// Step 15b-1, REAL (REAL_CUTOUT=1): BiRefNet_lite on this computer, on three of the private test photos. Records seconds per image and numbers about the edge
// (how much of the mask is soft, how much of the picture is kept), and saves each cutout on a flat colour, small, for looking at. Tests only: test-assets/ is
// never used by the app.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './reference-helpers';

test.skip(process.env.REAL_CUTOUT !== '1', 'The real model is opt-in (REAL_CUTOUT=1).');
const OUT = path.join(ROOT, 'out/image-engine/cutout-real');

test('BiRefNet_lite on three test photos', async ({ page }) => {
  test.setTimeout(600_000);
  fs.mkdirSync(OUT, { recursive: true });
  const dir = path.join(ROOT, 'test-assets');
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).slice(0, 3);
  expect(files.length).toBe(3);
  await page.goto('/images');
  const status = await (await page.request.get('/__cutout/status')).json();
  expect(status.available, status.reason).toBe(true);
  const rows: Record<string, unknown>[] = [];
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    const r = await page.evaluate(async (b64) => {
      const { LocalCutoutProvider } = await import('/src/image-engine/cutout/provider.ts');
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], { type: 'image/jpeg' });
      const res = await new LocalCutoutProvider().remove(blob);
      // Edge numbers from the mask: kept share, soft (neither clear nor solid) share of the edge band.
      const mb = await createImageBitmap(res.mask);
      const c = new OffscreenCanvas(mb.width, mb.height);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(mb, 0, 0);
      const d = g.getImageData(0, 0, mb.width, mb.height).data;
      let kept = 0, soft = 0, solid = 0;
      for (let i = 0; i < mb.width * mb.height; i++) {
        const v = d[i * 4];
        if (v > 250) solid++;
        else if (v > 5) soft++;
        if (v > 127) kept++;
      }
      // The cutout on a flat colour, small, for looking at.
      const cb = await createImageBitmap(res.cutout);
      const k = 480 / Math.max(cb.width, cb.height);
      const o = new OffscreenCanvas(Math.round(cb.width * k), Math.round(cb.height * k));
      const og = o.getContext('2d')!;
      og.fillStyle = '#ff00ff';
      og.fillRect(0, 0, o.width, o.height);
      og.drawImage(cb, 0, 0, o.width, o.height);
      const png = new Uint8Array(await (await o.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let bin2 = '';
      for (let i = 0; i < png.length; i += 8192) bin2 += String.fromCharCode(...png.subarray(i, i + 8192));
      const n = mb.width * mb.height;
      return { ms: res.ms, size: [res.width, res.height], keptPct: Math.round((kept / n) * 100), softPct: Math.round((soft / n) * 1000) / 10, solidPct: Math.round((solid / n) * 100), png: btoa(bin2) };
    }, b64);
    fs.writeFileSync(path.join(OUT, `${path.parse(f).name.replace(/\W+/g, '-')}.png`), Buffer.from(r.png, 'base64'));
    rows.push({ file: f, seconds: Math.round(r.ms.total) / 1000, ms: r.ms, size: r.size, keptPct: r.keptPct, softPct: r.softPct, solidPct: r.solidPct });
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(rows, null, 2));
  console.log('CUTOUT', JSON.stringify(rows));
});
