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
const PREV = path.resolve(process.cwd(), 'out/regression-v3');
const OUT = path.resolve(process.cwd(), 'out/regression-v4');
const DECKS = [{ name: 'quickflip-dark', handle: '@quick.flip' }, { name: 'harsh-light', handle: '@harsh.parekh' }];

for (const deck of DECKS) {
  test('regression: ' + deck.name, async ({ page }) => {
    const rep = JSON.parse(fs.readFileSync(path.join(SRC, deck.name, 'report.json'), 'utf8')) as { library: any };
    const lib = rep.library;
    const prevSheet = fs.readFileSync(path.join(PREV, deck.name, 'after.sheet.png')).toString('base64');
    await page.goto('/images/carousel');
    const res = await page.evaluate(async ({ lib, prevSheet, handle }) => {
      const D = await import('/src/carousel/designLibrary.ts');
      const CC = await import('/src/image-engine/lint/color.ts');
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
      const prev = await bm(await (await fetch('data:image/png;base64,' + prevSheet)).blob());
      const bef = await Promise.all(after.map((_, i) => createImageBitmap(prev, 10 + i * 310, 10, 300, 375)));
      // checks on the new drawing: text outside the slide or its margins, and text boxes that overlap each other
      const checks = slides.map((s: any, i: number) => {
        const t = (s.built.layers as any[]).filter((l) => l.kind === 'text' && l.text);
        const issues: string[] = [];
        for (const l of t) if (l.x < 40 || l.x + l.width > 1042 || l.y < 40 || l.y + l.height > 1310) issues.push('outside margins: ' + l.name + ' ' + Math.round(l.x) + ',' + Math.round(l.y) + ' ' + Math.round(l.width) + 'x' + Math.round(l.height));
        for (let a = 0; a < t.length; a++) for (let b = a + 1; b < t.length; b++) { const A = t[a], B = t[b]; const ox = Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x); const oy = Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y); if (ox > 4 && oy > 4) issues.push('boxes overlap: ' + A.name + ' / ' + B.name + ' (' + Math.round(ox) + 'x' + Math.round(oy) + ')'); }
        const ratioOn = (a: string, b: string) => Math.round(CC.contrastRgb(CC.parseColor(a).rgb, CC.parseColor(b).rgb) * 100) / 100;
        const satOf = (h: string) => Math.max(...[1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))) - Math.min(...[1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
        const bgc = (s.built.bg as string);
        const accentTexts = t.flatMap((l: any) => [l.style.color, ...(l.runs ?? []).map((x: any) => x.color)].filter((c: string) => /^#[0-9a-f]{6}$/i.test(c) && satOf(c) > 120).map((c: string) => ({ layer: l.name, size: Math.round(l.style.size), role: l.style.size >= 96 ? 'display' : 'small', color: c.toUpperCase(), contrastOnGround: ratioOn(c, bgc) }))).filter((x: any, i: number, a: any[]) => a.findIndex((y: any) => y.layer === x.layer && y.color === x.color) === i);
        const sizes = Object.fromEntries(t.filter((l: any) => !String(l.name).startsWith('recurring')).map((l: any) => [l.name, Math.round(l.style.size)]));
        return { slide: i + 1, layout: out.library.layouts[i], issues, sizes, accentTexts, ground: bgc };
      });
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
      return { checks, rows, beforeSheet: sheet(bef), afterSheet: sheet(after), style: out.library.style, usedAccentColours: [...used], marks, notes: out.library.codeAdjustments };
    }, { lib, prevSheet, handle: deck.handle });
    const dir = path.join(OUT, deck.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'before.sheet.png'), Buffer.from(res.beforeSheet, 'base64'));
    fs.writeFileSync(path.join(dir, 'after.sheet.png'), Buffer.from(res.afterSheet, 'base64'));
    const { beforeSheet, afterSheet, ...rest } = res;
    void beforeSheet; void afterSheet;
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ cutsBefore: lib.cuts, cutsAfter: res.rows.map((r: any) => r.cut), baselineNote: 'before = the previous after sheet (out/regression/<deck>/after.sheet.png, the render before kickers 48 / big short headlines / stepper spacing); compared at thumbnail scale', ...rest }, null, 1));
    console.log('REG ' + deck.name + ' ' + JSON.stringify(res.rows));
  });
}
