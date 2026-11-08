// Re-renders three sheets of run 3 from their SAVED json (no model call): the plan of each carousel (layouts and fields) is given back to the deck maker by a fake writer, so every code fix of this
// round (stat-grid pairing, the long-handle footer, the repeated pill, the art frequency) shows on the same words. Only the saved layouts and fields are used: the accent words were not
// saved in run 3, so the accents are empty here. Output: out/real-run-4/<name>.png. Skipped unless REAL_RERENDER=1.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.skip(!process.env.REAL_RERENDER, 'only when REAL_RERENDER=1');
test.setTimeout(5 * 60_000);
const IN = path.resolve(process.cwd(), 'out/real-run-3');
const OUT = path.resolve(process.cwd(), 'out/real-run-4');

for (const name of ['C-style-7', 'F-style-8', 'E-style-7']) {
  test('re-render ' + name, async ({ page }) => {
    const saved = JSON.parse(fs.readFileSync(path.join(IN, name + '.json'), 'utf8'));
    await page.goto('/images/carousel');
    const r = await page.evaluate(async ({ saved }) => {
      const D = await import('/src/carousel/designLibrary.ts');
      const PR = await import('/src/carousel/presets.ts');
      const L = await import('/src/carousel/layouts/index.ts');
      const F = await import('/src/reference/faithful.ts');
      // the saved fields keep lists as "a | b | c": the layout's own list fields are split back
      const slides = saved.layouts.map((layout: string, i: number) => {
        const def = L.layoutDef(layout)!;
        const fields: Record<string, unknown> = {};
        for (const [k, v] of Object.entries<string>(saved.fields[i])) fields[k] = def.fields.find((f: any) => f.name === k)?.list ? v.split(' | ') : v;
        return { layout, fields, accents: [] };
      });
      let calls = 0;
      const provider: any = { id: 'dev-cli', label: 'fake: the saved plan', async write() { calls++; return { text: JSON.stringify({ title: 'T', slides }), ms: 1 }; } };
      const handle = saved.handle ?? ({ 'C': '@workweekly', 'F': '@buildinpublic.dan', 'E': '@northbeam' } as Record<string, string>)[saved.topic];
      const res: any = await D.designLibraryDeck({ text: 'saved plan '.repeat(20), slides: 7, tone: 'clear', format: 'carousel', styleChoice: saved.preset, styles: [] }, { pack: PR.presetPackFor(saved.preset, false) }, handle, provider, new AbortController().signal);
      const lib = res.designed.library;
      const ids = Object.keys(res.designed.slides).sort((a, b) => Number(a) - Number(b));
      const bms: ImageBitmap[] = [];
      for (const id of ids) bms.push(await createImageBitmap(await F.svgToPng(res.designed.slides[id].built.svg, 1080)));
      const w = 300, h = 375;
      const c = document.createElement('canvas'); c.width = bms.length * (w + 10) + 10; c.height = h + 20;
      const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
      bms.forEach((u, i) => g.drawImage(u, 10 + i * (w + 10), 10, w, h));
      return { calls, layouts: lib.layouts, trims: lib.trims ?? [], adjustments: lib.codeAdjustments, sheet: c.toDataURL('image/png').split(',')[1] };
    }, { saved });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.sheet, 'base64'));
    fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ from: 'out/real-run-3/' + name + '.json (saved plan, accents not saved)', fakeWriterCalls: r.calls, layouts: r.layouts, trims: r.trims, adjustments: r.adjustments }, null, 1));
    console.log('RERENDER ' + name + ' ' + JSON.stringify({ calls: r.calls, layouts: r.layouts, trims: r.trims.map((t: any) => `${t.slide}:${t.field}`) }));
    expect(r.layouts.length).toBeGreaterThanOrEqual(5);
  });
}
