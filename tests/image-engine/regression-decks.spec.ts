// Regression (ZERO model calls): the stored plans of the two real decks (quickflip-dark, harsh-light) drawn again with the CURRENT code, next to what the library drew before.
//
//   before = out/designed-library-real/<deck>/slide-N-overrides.png: drawn by the library as it was at the end of step 3 (before the preset rounds), from the same plan, with the
//            style as the person left it (the detected style + the two toggles flipped). No library snapshot was ever committed, so this recorded render is the only "baseline".
//   after  = the same plan and the same style tokens, drawn now: styleFromPack on a stub pack made from the stored tokens (so the muted ink is re-derived by current code), then
//            redrawLibraryDeck (rotation, cuts, drawing).
// Needs out/designed-library-real/<deck>/report.json + slide-N-overrides.png (made by designed-library-app-real.spec.ts). Output: out/regression/<deck>/.
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(10 * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
const SRC = path.resolve(process.cwd(), 'out/designed-library-real');
const OUT = path.resolve(process.cwd(), 'out/regression');
const DECKS = [{ name: 'quickflip-dark', handle: '@quick.flip' }, { name: 'harsh-light', handle: '@harsh.parekh' }];

for (const deck of DECKS) {
  test('regression: ' + deck.name, async ({ page }) => {
    const rep = JSON.parse(fs.readFileSync(path.join(SRC, deck.name, 'report.json'), 'utf8')) as { library: any };
    const lib = rep.library;
    const before = lib.plan.specs.map((_: unknown, i: number) => fs.readFileSync(path.join(SRC, deck.name, `slide-${i + 1}-overrides.png`)).toString('base64'));
    await page.goto('/images/carousel');
    const res = await page.evaluate(async ({ lib, before, handle }) => {
      const D = await import('/src/carousel/designLibrary.ts');
      const F = await import('/src/reference/faithful.ts');
      const st = lib.style;
      const dev = st.devices;
      const pack: any = {
        name: 'stub', palette: { ...st.palette }, fonts: { ...st.fonts }, motifs: [], designs: {}, canvas: { w: 1080, h: 1350 }, notes: [],
        svgs: st.background === 'glow' ? { cover: '<svg><radialGradient id="g"/></svg>' } : {},
        devices: { marker: dev.marker, profileHeader: dev.profileHeader, underline: dev.underline, slides: 1, counts: { marker: 0, profileHeader: 0, underline: 0 } },
        overrides: { marker: dev.marker, underline: dev.underline, profileHeader: dev.profileHeader, shapes: dev.planes ? (st.planeStrength ?? 'bold') : 'off' },
      };
      const libIn = { ...lib, redraws: 0 };
      const out = await D.redrawLibraryDeck(libIn, { pack, hasPhoto: false }, handle);
      const slides = Object.entries<any>(out.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s);
      const bm = async (b: Blob) => createImageBitmap(b);
      const after = await Promise.all(slides.map(async (s) => bm(await F.svgToPng(s.built.svg, 1080))));
      const bef = await Promise.all(before.map(async (b64: string) => bm(await (await fetch('data:image/png;base64,' + b64)).blob())));
      const px = (b: ImageBitmap) => { const c = document.createElement('canvas'); c.width = 270; c.height = 338; const g = c.getContext('2d')!; g.drawImage(b, 0, 0, 270, 338); return g.getImageData(0, 0, 270, 338).data; };
      const near = (d: Uint8ClampedArray, rgb: number[], tol: number) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - rgb[0]) + Math.abs(d[i + 1] - rgb[1]) + Math.abs(d[i + 2] - rgb[2]) < tol) n++; return n; };
      const hex2 = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const accent = hex2(out.library.style.palette.accent);
      // accent colours the new drawing uses on text and bars
      const used = new Set<string>();
      slides.forEach((s: any) => (s.built.layers as any[]).forEach((l: any) => { if (l.kind === 'text') { for (const r of l.runs ?? []) used.add(String(r.color).toUpperCase()); if (l.highlight?.color && l.highlight.color.length >= 7) used.add(String(l.highlight.color).toUpperCase()); } }));
      const rows = after.map((a, i) => {
        const pa = px(a), pb = px(bef[i]);
        let changed = 0, sum = 0, x0 = 270, x1 = 0, y0 = 338, y1 = 0;
        for (let k = 0; k < pa.length; k += 4) {
          const d = Math.abs(pa[k] - pb[k]) + Math.abs(pa[k + 1] - pb[k + 1]) + Math.abs(pa[k + 2] - pb[k + 2]);
          sum += d;
          if (d > 60) { changed++; const q = k / 4; const x = q % 270, y = Math.floor(q / 270); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
        return { slide: i + 1, layout: out.library.layouts[i], cut: out.library.cuts[i], meanDiff: Math.round((sum / (pa.length / 4) / 765) * 10000) / 100, changedPct: Math.round((changed / (pa.length / 4)) * 1000) / 10, box: changed ? [x0 * 4, y0 * 4, x1 * 4, y1 * 4] : null, accentPxBefore: near(pb, accent, 90), accentPxAfter: near(pa, accent, 90) };
      });
      const sheet = (bms: ImageBitmap[]) => { const w = 300, h = 375; const c = document.createElement('canvas'); c.width = bms.length * (w + 10) + 10; c.height = h + 20; const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height); bms.forEach((b, i) => g.drawImage(b, 10 + i * (w + 10), 10, w, h)); return c.toDataURL('image/png').split(',')[1]; };
      const marks = slides.map((s: any) => { const ls = s.built.layers as any[]; return { highlights: ls.filter((l: any) => l.kind === 'text' && l.highlight && l.highlight.color && l.highlight.color.length >= 7 && !/^(transparent|none)$/i.test(l.highlight.color)).length, accentRuns: ls.reduce((n: number, l: any) => n + (l.kind === 'text' ? (l.runs ?? []).length : 0), 0), mutedMin: 0 }; });
      return { rows, beforeSheet: sheet(bef), afterSheet: sheet(after), style: out.library.style, usedAccentColours: [...used], marks, notes: out.library.codeAdjustments };
    }, { lib, before, handle: deck.handle });
    const dir = path.join(OUT, deck.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'before.sheet.png'), Buffer.from(res.beforeSheet, 'base64'));
    fs.writeFileSync(path.join(dir, 'after.sheet.png'), Buffer.from(res.afterSheet, 'base64'));
    const { beforeSheet, afterSheet, ...rest } = res;
    void beforeSheet; void afterSheet;
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ baselineNote: 'before = the recorded step-3 render (slide-N-overrides.png); no library snapshot was ever committed', ...rest }, null, 1));
    console.log('REG ' + deck.name + ' ' + JSON.stringify(res.rows));
  });
}
