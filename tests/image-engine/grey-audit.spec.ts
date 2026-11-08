// Grey audit (ZERO model calls): for all 15 presets and every ground of the rhythm: the preset's own card colour, the card colour the code ends up with, and whether the result is a
// low-saturation grey on a tinted ground. GREY_TAG=before|after writes out/grey-fix/audit-<tag>.json; the sheet test (when both exist) draws before / after side by side.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);
const PRESETS = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
const TAG = process.env.GREY_TAG ?? 'after';

test('audit: card colour per preset and ground, before / after', async ({ page }) => {
  await page.goto('/images/carousel');
  const rows = await page.evaluate(async (PRESETS) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const hsl = (h: string) => { const [r, g, b] = rgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); return { s, l }; };
    const lum = (h: string) => { const c = rgb(h).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const out: any[] = [];
    for (const p of PRESETS) {
      const raw = await (await fetch(`/src/image-engine/styles/${p}/style.json`)).json();
      const st = D.styleFromPack(PR.presetPackFor(p, false)).style as any;
      const grounds = (st.rhythm?.length ? st.rhythm : [st.palette]) as any[];
      const names = Object.keys(raw.palettes);
      grounds.forEach((g, i) => {
        const rp = raw.palettes[(raw.rhythm ?? names)[i] ?? names[0]] ?? raw.palettes[names[0]];
        const bg: string = g.bg.toUpperCase();
        const own: string = String(rp.surface).toUpperCase();
        const fin: string = g.surface.toUpperCase();
        const hb = hsl(bg), hf = hsl(fin), ho = hsl(own);
        out.push({ preset: p, i, bg, own, fin, finSat: Math.round(hf.s * 100), bgSat: Math.round(hb.s * 100), cardVsGround: Number(cr(fin, bg).toFixed(2)), ink: Number(cr(fin, g.text).toFixed(1)), greyOnTint: (hb.s >= 0.12 || ho.s >= 0.12) && hf.s < 0.2 && fin !== own });
      });
    }
    return out;
  }, PRESETS);
  fs.mkdirSync('out/grey-fix', { recursive: true });
  fs.writeFileSync(`out/grey-fix/audit-${TAG}.json`, JSON.stringify(rows, null, 1));
  const seen = new Set<string>();
  const uniq = rows.filter((r) => { const k = r.preset + r.bg + r.fin; if (seen.has(k)) return false; seen.add(k); return true; });
  console.log('GREYS ' + TAG + '\n' + uniq.map((r) => `${r.preset} g${r.i} ground ${r.bg} own ${r.own} final ${r.fin} sat ${r.finSat}% (ground ${r.bgSat}%) ${r.cardVsGround}:1 ink ${r.ink}:1${r.greyOnTint ? '  GREY ON TINT' : ''}`).join('\n'));
  expect(rows.length).toBeGreaterThan(30);
  if (TAG === 'after') expect(rows.filter((r) => r.greyOnTint).map((r) => `${r.preset} g${r.i} ${r.bg} -> ${r.fin}`)).toEqual([]);
});

test('sheet: before / after card colours of all 15 presets (out/grey-fix/greys.png)', async ({ page }) => {
  test.skip(!fs.existsSync('out/grey-fix/audit-before.json') || !fs.existsSync('out/grey-fix/audit-after.json'), 'needs both audit files');
  const before = JSON.parse(fs.readFileSync('out/grey-fix/audit-before.json', 'utf8'));
  const after = JSON.parse(fs.readFileSync('out/grey-fix/audit-after.json', 'utf8'));
  await page.goto('/images/carousel');
  const png = await page.evaluate(({ before, after }) => {
    const names = [...new Set((after as any[]).map((r) => r.preset))];
    const W = 1100, rowH = 92;
    const c = document.createElement('canvas'); c.width = W; c.height = 50 + names.length * rowH;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.font = '16px sans-serif'; g.fillStyle = '#000'; g.fillText('preset', 12, 30); g.fillText('BEFORE: ground / card', 220, 30); g.fillText('AFTER: ground / card', 660, 30);
    const draw = (rows: any[], x0: number, y: number) => {
      const seen = new Set<string>(); let x = x0;
      for (const r of rows) { const k = r.bg + r.fin; if (seen.has(k)) continue; seen.add(k);
        g.fillStyle = r.bg; g.fillRect(x, y, 90, 70); g.fillStyle = r.fin; g.fillRect(x + 14, y + 14, 62, 42);
        g.strokeStyle = 'rgba(0,0,0,0.15)'; g.strokeRect(x + 0.5, y + 0.5, 90, 70);
        g.fillStyle = '#000'; g.font = '11px monospace'; g.fillText(r.fin, x + 6, y + 84); x += 100; if (x > x0 + 400) break; }
    };
    names.forEach((n, i) => { const y = 44 + i * rowH; g.fillStyle = '#000'; g.font = '16px sans-serif'; g.fillText(n, 12, y + 40); draw((before as any[]).filter((r) => r.preset === n), 220, y); draw((after as any[]).filter((r) => r.preset === n), 660, y); });
    return c.toDataURL('image/png').split(',')[1];
  }, { before, after });
  fs.writeFileSync('out/grey-fix/greys.png', Buffer.from(png, 'base64'));
  expect(png.length).toBeGreaterThan(1000);
});
