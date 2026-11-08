// Re-renders the plans of two app reports (reports/style-6.json, reports/style-7.json) WITHOUT a model call: the saved layouts, fields and accent words go back to the deck maker through a
// fake writer. Output: out/grey-fix/style-6.png and style-7.png (every slide, in one sheet) + .json with the app's own phone checks (faithfulChecks) per slide.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);

for (const name of ['style-6', 'style-7']) {
  test(`re-render ${name} from the saved plan`, async ({ page }) => {
    test.skip(!fs.existsSync(`reports/${name}.json`), 'no report');
    const rep = JSON.parse(fs.readFileSync(`reports/${name}.json`, 'utf8'));
    const specs = rep.designed.library.plan.specs.map((s: any) => ({ layout: s.layout, fields: s.fields, accents: s.accents }));
    await page.goto('/images/carousel');
    const r = await page.evaluate(async ({ name, specs }: any) => {
      const D = await import('/src/carousel/designLibrary.ts');
      const PR = await import('/src/carousel/presets.ts');
      const F = await import('/src/reference/faithful.ts');
      const C = await import('/src/reference/faithfulChecks.ts');
      let calls = 0;
      const provider: any = { id: 'dev-cli', label: 'fake: the saved plan', async write() { calls++; return { text: JSON.stringify({ title: 'T', slides: specs }), ms: 1 }; } };
      const res: any = await D.designLibraryDeck({ text: 'saved plan '.repeat(20), slides: specs.length, tone: 'clear', format: 'carousel', styleChoice: name, styles: [] }, { pack: PR.presetPackFor(name, false), hasPhoto: false, images: [] }, '@maya.designs', provider, new AbortController().signal);
      const lib = res.designed.library;
      const ids = Object.keys(res.designed.slides).sort((a, b) => Number(a) - Number(b));
      const bms: ImageBitmap[] = [];
      const checks: any[] = [];
      for (const id of ids) {
        const s = res.designed.slides[id];
        const b = s.built;
        bms.push(await createImageBitmap(await F.svgToPng(b.svg, 1080)));
        const type = (s.slide?.type ?? s.type ?? 'content') as string;
        const bg = (b.bg as string) ?? '#FFFFFF';
        const lint = C.faithfulChecks(b.layers, { canvas: { w: 1080, h: 1350 }, bg, k: 1, slideType: type, prose: /data-layout="prose"/.test(b.svg) });
        checks.push({ slide: Number(id) + 1, layout: lib.layouts[Number(id)], failed: lint.filter((q: any) => !q.pass).map((q: any) => `${q.id}: ${q.reason}`), words: (lint.find((q: any) => q.id === 'words') as any)?.measured ?? null });
      }
      const w = 450, h = 563, cols = 4;
      const c = document.createElement('canvas'); c.width = cols * (w + 10) + 10; c.height = Math.ceil(bms.length / cols) * (h + 10) + 10;
      const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
      bms.forEach((u, i) => g.drawImage(u, 10 + (i % cols) * (w + 10), 10 + Math.floor(i / cols) * (h + 10), w, h));
      return { calls, layouts: lib.layouts, grounds: lib.inverts, checks, palette: lib.style.palette, sheet: c.toDataURL('image/png').split(',')[1] };
    }, { name, specs });
    fs.mkdirSync('out/ring-fix', { recursive: true });
    fs.writeFileSync(`out/ring-fix/${name}.png`, Buffer.from(r.sheet, 'base64'));
    fs.writeFileSync(`out/ring-fix/${name}.json`, JSON.stringify({ calls: r.calls, layouts: r.layouts, inverts: r.grounds, palette: r.palette, checks: r.checks }, null, 1));
    console.log('RERENDER ' + name + ' ' + JSON.stringify({ calls: r.calls, palette: r.palette, inverts: r.grounds, checks: r.checks }));
    expect(r.checks.length).toBe(specs.length);
  });
}
