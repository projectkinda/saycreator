// Style-5 closing through the REAL path (designLibraryDeck with a fake writer: the preset flavour pass runs on the writer's plan; zero model calls to a real model): whatever light
// closing the writer picks (how-it-works card, call to action), the closing is the preset's own library.byType.closing: statement-card, accent variant (green card, white text), and the
// rendered pixels pass 4.5:1. A closing with contact details keeps its layout.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(5 * 60_000);
const OUT = path.resolve(process.cwd(), 'out/presets-v14');

const head = [
  { layout: 'statement-card', fields: { kicker: 'New this week', headline: 'Your bag is now your hoodie', caption: 'Zip, flip, go.' }, accents: ['hoodie'] },
  { layout: 'prose', fields: { p1: 'We sewed a bag into the hood, so one layer does both jobs.', p2: 'It took two years of testing in the rain.' }, accents: [] },
  { layout: 'lead-statement', fields: { lead: 'It started in a rainy taxi', headline: 'We ditched the bag and kept the hoodie' }, accents: ['hoodie'] },
  { layout: 'split-text', fields: { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' }, accents: [] },
  { layout: 'prose', fields: { p1: 'Early backers told us the flip was the part they loved most.', p2: 'So we kept it to one zip and ten seconds.' }, accents: [] },
  { layout: 'quote', fields: { quote: 'I stopped carrying a bag the day this arrived.', author: 'An early backer' }, accents: [] },
];
const CLOSINGS: Record<string, any> = {
  'how-it-works card': { layout: 'headline-card', fields: { headline: 'How it works', subline: 'Three things happen when you zip.', card: 'The hood folds into a waterproof pocket that holds a 16-inch laptop.', paragraph: 'The straps slide out of the sleeves in one pull.', closing: 'That is the whole trick.' }, accents: [] },
  'call to action': { layout: 'cta-button', fields: { headline: 'Back Quick Flip today', button: 'Back it now' }, accents: ['today'] },
  'contact closing': { layout: 'contact-closing', fields: { brand: 'Quick Flip', headline: 'Back Quick Flip today', line: 'Early backers save 30%.', button: 'Back it now', contacts: ['@quick.flip', 'quickflip.com'] }, accents: ['today'] },
};

test('style-5: the closing slide is the preset closing layout, a green card with white text, on the rendered pixels', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ head, closings }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const rgb = (c: string) => C.parseColor(c).rgb;
    const lum = (c: number[]) => { const q = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * q(c[0]) + 0.7152 * q(c[1]) + 0.0722 * q(c[2]); };
    const cr = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const pack = PR.presetPackFor('style-5', false);
    const out: any = {};
    for (const [name, closing] of Object.entries<any>(closings)) {
      const answer = JSON.stringify({ title: 'Quick Flip', slides: [...head, closing] });
      let calls = 0;
      const provider: any = { id: 'dev-cli', label: 'fake', async write() { calls++; return { text: answer, ms: 5 }; } };
      const req: any = { text: 'Quick Flip is a hoodie that flips into a backpack in ten seconds. '.repeat(3), slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'style-5', styles: [] };
      const res: any = await D.designLibraryDeck(req, { pack }, '@quick.flip', provider, new AbortController().signal);
      const lib = res.designed.library;
      const layouts = lib.layouts as string[];
      const last = layouts.length - 1;
      const b: any = res.designed.slides[String(last)].built;
      const png = await F.svgToPng(b.svg, 1080);
      const bm = await createImageBitmap(png);
      const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
      const g = cv.getContext('2d')!; g.drawImage(bm, 0, 0);
      const shapes = (b.layers as any[]).filter((l) => l.kind === 'shape' && typeof l.fill === 'string' && /^#[0-9a-f]{6}/i.test(l.fill) && (l.opacity ?? 1) >= 0.95 && l.width * l.height < 1080 * 1350 * 0.9 && !/background/.test(String(l.name)));
      const inkLow: string[] = [];
      let thin = 0;
      for (const l of (b.layers as any[]).filter((q) => q.kind === 'text' && q.text)) {
        const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
        let sh: any = null;
        for (const q of shapes) if (q.x <= cx && q.x + q.width >= cx && q.y <= cy && q.y + q.height >= cy && (!sh || q.width * q.height <= sh.width * sh.height)) sh = q;
        const under = sh ? sh.fill : b.bg;
        const sc = bm.width / 1080;
        const d = g.getImageData(Math.max(0, Math.floor(l.x * sc)), Math.max(0, Math.floor(l.y * sc)), Math.max(1, Math.min(bm.width, Math.ceil(l.width * sc))), Math.max(1, Math.min(bm.height, Math.ceil(l.height * sc)))).data;
        const ground = rgb(under);
        const px: { c: number[]; r: number }[] = [];
        for (let k = 0; k < d.length; k += 4) { const c = [d[k], d[k + 1], d[k + 2]]; const rr = cr(c, ground); if (rr > 1.6) px.push({ c, r: rr }); }
        if (px.length >= 12) {
          px.sort((a, c) => c.r - a.r);
          const core = px.slice(0, Math.max(6, Math.round(px.length * 0.15)));
          const m = [0, 1, 2].map((q) => core.reduce((s, p) => s + p.c[q], 0) / core.length);
          const rr = cr(m, ground);
          if (rr < 4.5 && !(l.style.size >= 96 && rr >= 3)) inkLow.push(`${l.name} "${String(l.text).slice(0, 18)}" ${rr.toFixed(2)}`);
        }
        if (/^body/.test(String(l.name)) && l.style.size <= 64 && l.style.weight < 400) thin++;
      }
      const card = shapes.filter((l) => l.width > 800 && l.height > 500).sort((p, q) => q.width * q.height - p.width * p.height)[0];
      const px = card ? g.getImageData(Math.round(card.x + 30), Math.round(card.y + card.height / 2), 1, 1).data : null;
      const title = (b.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
      out[name] = { layouts, variants: lib.variants as number[], flavour: lib.flavour ?? null, calls, inkLow, thin, card: card ? [card.fill, card.height] : null, cardPx: px ? [px[0], px[1], px[2]] : null, titleWeight: title?.style.weight, titleSize: title?.style.size, png64: cv.toDataURL('image/png').split(',')[1] };
    }
    return out;
  }, { head, closings: CLOSINGS });
  for (const [name, x] of Object.entries<any>(r)) {
    expect(x.calls, `${name}: one fake writer answer, nothing else`).toBe(1);
    expect(x.inkLow, `${name}: every text run of the closing reads 4.5:1 on the rendered pixels`).toEqual([]);
    expect(x.thin, `${name}: no thin body weight`).toBe(0);
    if (name === 'contact closing') {
      expect(x.layouts[x.layouts.length - 1], 'a closing with contact details keeps its layout').toBe('contact-closing');
      continue;
    }
    expect(x.layouts[x.layouts.length - 1], `${name}: the closing is the preset's closing layout`).toBe('statement-card');
    expect(x.layouts[x.layouts.length - 1]).not.toBe('headline-card');
    expect(x.variants[x.variants.length - 1], `${name}: the accent variant (variants are stored 1-based)`).toBe(2);
    expect(x.card, `${name}: a big card`).not.toBeNull();
    expect(x.cardPx[1], `${name}: a green card (rendered)`).toBeGreaterThan(x.cardPx[0] + 20);
    expect(x.titleWeight, 'the preset heading weight (EB Garamond 600)').toBe(600);
    fs.writeFileSync(path.join(OUT, `style5-closing-${name.replace(/\W+/g, '-')}.png`), Buffer.from(x.png64, 'base64'));
  }
  const swapped = Object.values<any>(r).filter((x) => x.flavour).map((x) => x.flavour.swaps.filter((s: any) => /closing/.test(s.why)).length);
  expect(swapped.some((n: number) => n > 0), 'the swap is logged with its reason').toBe(true);
});
