// Flavour pass (meaning-protected) on the three real decks, from the STORED writer answers (out/presets-real/<preset>/write1-answer.txt): a fake provider hands the stored answer back, so the whole
// library route runs again with the flavour pass and there is no model call. Output: out/presets-real-v3/<preset>/{sheet.png, report.json} and all-presets.png.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(10 * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
const SRC = path.resolve(process.cwd(), 'out/presets-real');
const OUT = path.resolve(process.cwd(), 'out/presets-real-v3');
const PRESETS = ['hot-flat', 'editorial-collage', 'glass-gradient'];

test('flavour pass v3 on the stored real answers', async ({ page }) => {
  const answers = Object.fromEntries(PRESETS.map((id) => [id, fs.readFileSync(path.join(SRC, id, 'write1-answer.txt'), 'utf8')]));
  await page.goto('/images/carousel');
  const res = await page.evaluate(async ({ presets, answers }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const P = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const out: any = { presets: {} };
    const sheets: Record<string, ImageBitmap[]> = {};
    for (const id of presets) {
      const pack = P.presetPackFor(id, false);
      let calls = 0;
      const provider: any = { id: 'dev-cli', label: 'stored answer', async write() { calls++; return { text: answers[id], ms: 1 }; } };
      const req = { text: 'Quick Flip is a hoodie that flips into a backpack in 10 seconds. '.repeat(3), slides: 8, tone: 'clear', format: 'carousel', styleChoice: id, styles: [] };
      const r = await D.designLibraryDeck(req as any, { pack, hasPhoto: false }, '@quick.flip', provider, new AbortController().signal);
      const lib = r.designed.library!;
      const writer = JSON.parse(answers[id]).slides.map((s: any) => s.layout);
      const slides = Object.entries<any>(r.designed.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s);
      const bms = await Promise.all(slides.map(async (s) => createImageBitmap(await F.svgToPng(s.built.svg, 540))));
      sheets[id] = bms;
      const w = 270, h = 338;
      const c = document.createElement('canvas'); c.width = bms.length * (w + 10) + 10; c.height = h + 20;
      const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
      bms.forEach((b, i) => g.drawImage(b, 10 + i * (w + 10), 10, w, h));
      out.presets[id] = { calls, writer, layouts: lib.layouts, variants: lib.variants, cuts: lib.cuts, grounds: lib.grounds, flavour: lib.flavour, notes: r.designed.notes.filter((n: string) => /^Flavour/.test(n)), fallbacks: lib.fallbacks, retries: lib.retries, flavourStyle: lib.style.flavour, sheet: c.toDataURL('image/png').split(',')[1] };
    }
    const w = 270, h = 338, labelW = 190;
    const c = document.createElement('canvas'); c.width = 8 * (w + 10) + 10 + labelW; c.height = presets.length * (h + 10) + 10;
    const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
    presets.forEach((id: string, r: number) => { g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText(id, 12, 10 + r * (h + 10) + 30); sheets[id].slice(0, 8).forEach((b, i) => g.drawImage(b, labelW + 10 + i * (w + 10), 10 + r * (h + 10), w, h)); });
    out.combo = c.toDataURL('image/png').split(',')[1];
    return out;
  }, { presets: PRESETS, answers });

  const diff = (a: string[], b: string[]) => Math.round((a.filter((x, i) => x !== b[i]).length / a.length) * 100) / 100;
  const jac = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); const i = [...A].filter((x) => B.has(x)).length; return Math.round((1 - i / (A.size + B.size - i)) * 100) / 100; };
  const pairs: any[] = [];
  for (let i = 0; i < PRESETS.length; i++) for (let j = i + 1; j < PRESETS.length; j++) {
    const A = res.presets[PRESETS[i]], B = res.presets[PRESETS[j]];
    pairs.push({ a: PRESETS[i], b: PRESETS[j], before: { positionsDifferent: diff(A.writer, B.writer), setDistance: jac(A.writer, B.writer) }, after: { positionsDifferent: diff(A.layouts, B.layouts), setDistance: jac(A.layouts, B.layouts) } });
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const id of PRESETS) {
    const d = path.join(OUT, id);
    fs.mkdirSync(d, { recursive: true });
    const { sheet, ...rest } = res.presets[id];
    fs.writeFileSync(path.join(d, 'sheet.png'), Buffer.from(sheet, 'base64'));
    fs.writeFileSync(path.join(d, 'report.json'), JSON.stringify(rest, null, 2));
    expect(rest.calls, id + ': the stored answer was handed back once, no real call').toBe(1);
  }
  fs.writeFileSync(path.join(OUT, 'all-presets.png'), Buffer.from(res.combo, 'base64'));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ modelCalls: 0, pairs, perPreset: Object.fromEntries(PRESETS.map((id) => [id, { writer: res.presets[id].writer, after: res.presets[id].layouts, swaps: res.presets[id].flavour?.swaps ?? [], kept: res.presets[id].flavour?.kept ?? [] }])) }, null, 2));
  console.log('FLAV ' + JSON.stringify(Object.fromEntries(PRESETS.map((id) => [id, { before: res.presets[id].writer, after: res.presets[id].layouts, swaps: (res.presets[id].flavour?.swaps ?? []).map((s: any) => `${s.slide}:${s.from}>${s.to}`), kept: (res.presets[id].flavour?.kept ?? []).map((k: any) => `${k.slide}:${k.layout} ${k.why}`) }]))));
  console.log('PAIRS ' + JSON.stringify(pairs));
});
