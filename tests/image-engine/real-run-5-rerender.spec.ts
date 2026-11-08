// Re-renders the picture carousel of run 4 (out/real-run-4/B-style-7-pics.json) from its SAVED plan, no model call: the saved layouts and fields go back to the deck maker through a fake writer,
// with two flat landscape pictures of the saved sizes. The accent words were not saved: the two rings of the first render (round "cost" on slide 1 and "different habits" on slide 7, read from
// that sheet) are given back by hand. Output: out/real-run-5/B-style-7-pics.png (+ .json). Skipped unless REAL_RERENDER5=1.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.skip(!process.env.REAL_RERENDER5, 'only when REAL_RERENDER5=1');
test.setTimeout(5 * 60_000);
const IN = path.resolve(process.cwd(), 'out/real-run-4/B-style-7-pics.json');
const OUT = path.resolve(process.cwd(), 'out/real-run-5');
const ACCENTS: Record<number, string[]> = { 0: ['cost'], 6: ['different habits'] };

test('re-render B-style-7-pics from the saved json', async ({ page }) => {
  const saved = JSON.parse(fs.readFileSync(IN, 'utf8'));
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ saved, ACCENTS }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const L = await import('/src/carousel/layouts/index.ts');
    const I = await import('/src/carousel/layouts/images.ts');
    const F = await import('/src/reference/faithful.ts');
    const PL = await import('/src/carousel/photoLibrary.ts');
    const flat = async (name: string, w: number, h: number, color: string) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.2, 0, Math.PI * 2); g.fill();
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.9));
      return (await PL.addPicture(new File([blob], name + '.jpg', { type: 'image/jpeg' }), 'photo')).meta;
    };
    const metas = [await flat('landscape-1', saved.offered[0].width, saved.offered[0].height, '#2471a3'), await flat('landscape-2', saved.offered[1].width, saved.offered[1].height, '#c0392b')];
    const images = metas.map((m: any) => ({ id: m.id, width: m.width, height: m.height }));
    const slides = saved.layouts.map((layout: string, i: number) => {
      const def = L.layoutDef(layout)!;
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries<string>(saved.fields[i])) {
        if (I.IMAGE_KEYS.includes(k)) continue; // the code places the pictures
        fields[k] = def.fields.find((f: any) => f.name === k)?.list ? v.split(' | ') : v;
      }
      return { layout, fields, accents: ACCENTS[i] ?? [] };
    });
    let calls = 0;
    const provider: any = { id: 'dev-cli', label: 'fake: the saved plan', async write() { calls++; return { text: JSON.stringify({ title: 'T', slides }), ms: 1 }; } };
    const res: any = await D.designLibraryDeck({ text: 'saved plan '.repeat(20), slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'style-7', styles: [] }, { pack: PR.presetPackFor('style-7', false), hasPhoto: true, images }, '@maya.designs', provider, new AbortController().signal);
    const lib = res.designed.library;
    const ids = Object.keys(res.designed.slides).sort((a, b) => Number(a) - Number(b));
    const bms: ImageBitmap[] = [];
    const decor: string[] = [];
    for (const id of ids) {
      const b = res.designed.slides[id].built;
      bms.push(await createImageBitmap(await F.svgToPng(b.svg, 1080)));
      decor.push(((b.devices ?? []) as any[]).filter((d) => d.kind === 'sticker' || d.id === 'pen-circle' || d.id.startsWith('art:')).map((d) => d.id).join('+') || '-');
    }
    const w = 300, h = 375;
    const c = document.createElement('canvas'); c.width = bms.length * (w + 10) + 10; c.height = h + 20;
    const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
    bms.forEach((u, i) => g.drawImage(u, 10 + i * (w + 10), 10, w, h));
    const out = { calls, layouts: lib.layouts, decor, pictureSlots: (lib.plan.specs as any[]).map((s, i) => ({ slide: i + 1, layout: s.layout, pictures: I.IMAGE_KEYS.filter((k: string) => s.fields[k]).length })).filter((q) => q.pictures), sheet: c.toDataURL('image/png').split(',')[1] };
    for (const m of metas) await PL.removePicture(m.id);
    return out;
  }, { saved, ACCENTS });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'B-style-7-pics.png'), Buffer.from(r.sheet, 'base64'));
  fs.writeFileSync(path.join(OUT, 'B-style-7-pics.json'), JSON.stringify({ from: 'out/real-run-4/B-style-7-pics.json (saved plan; accents re-added by hand on slides 1 and 7)', fakeWriterCalls: r.calls, layouts: r.layouts, decorationPerSlide: r.decor, pictureSlots: r.pictureSlots }, null, 1));
  console.log('RERENDER5 ' + JSON.stringify({ layouts: r.layouts, decor: r.decor, pictureSlots: r.pictureSlots, calls: r.calls }));
  expect(r.layouts.length).toBe(7);
});
