// fillRecreate / packSlide (no model): same-role text layers are one slot, a slide with no matching slots falls back to the content design, and a long title widens before it shrinks.
import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('duplicate roles fill once; no matching slot falls back; a title widens before it shrinks', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const R = await import('/src/reference/recreate.ts');
    const P = await import('/src/reference/pack.ts');
    const F = await import('/src/image-engine/fonts.ts');
    const T = await import('/src/image-engine/draw/text.ts');
    await F.loadFonts();
    const font = 'Schibsted Grotesk';
    const w = F.FONT_WEIGHTS[font];
    const text = (id: string, name: string, x: number, y: number, wd: number, h: number, size: number, color: string, sample: string, slot?: object) =>
      ({ kind: 'text', id, name, role: 'content', x, y, width: wd, height: h, rotation: 0, opacity: 1, text: sample, style: { font, weight: w[w.length - 1], size, color, align: 'left', valign: 'top', lineHeight: 1.1 }, autoFit: { minSize: 32 }, ...(slot ? { slot } : {}) }) as any;
    const bg = { kind: 'shape', id: 'bg', name: 'background', role: 'decor', x: 0, y: 0, width: 1080, height: 1350, rotation: 0, opacity: 1, shape: 'rect', fill: '#101010' } as any;
    const canvas = { w: 1080, h: 1350 };
    const visible = (ls: any[], role: string) => ls.filter((l) => l.kind === 'text' && l.name === role && l.visible !== false);

    // 1. a headline in two colours: two title layers
    const dup = R.fillRecreate({ layers: [bg, text('t1', 'title', 60, 200, 900, 300, 120, '#ffffff', 'So what have you'), text('t2', 'title', 60, 520, 400, 100, 120, '#ff0000', 'shipped'), text('g1', 'tag', 60, 60, 300, 50, 40, '#ffffff', 'STEP 1'), text('g2', 'tag', 400, 60, 100, 30, 40, '#ffffff', 'STEP 1')], palette: {}, canvas, notes: [] } as any, { title: 'Ship something real this week', tag: 'STEP 1' });
    const dupTitles = visible(dup.layers, 'title');
    const dupTags = visible(dup.layers, 'tag');

    // 2. the cover design has no title slot: the slide falls back to the content design
    const pack = { name: 'p', palette: { bg: '#101010', text: '#ffffff' }, fonts: { headline: font, body: font }, motifs: [], canvas, notes: [], designs: { cover: [bg, text('k', 'kicker', 60, 60, 600, 50, 40, '#ffffff', 'kicker')], content: [bg, text('ct', 'title', 60, 100, 900, 200, 90, '#ffffff', 'Title'), text('cb', 'body', 60, 400, 900, 400, 44, '#ffffff', 'Body')] } } as any;
    const fb = P.packSlide(pack, 'cover', { type: 'cover', headline: 'Hello brave world', body: 'More words here' }, '@me');
    const fbWords = fb.layers.filter((l: any) => l.kind === 'text' && l.visible !== false).map((l: any) => l.text);

    // 3. a long title in a short, narrow slot: widen first
    const slot = { minSize: 32, maxLines: 2 };
    const wide = R.fillRecreate({ layers: [bg, text('w1', 'title', 60, 100, 300, 150, 150, '#ffffff', 'Big', slot)], palette: {}, canvas, notes: [] } as any, { title: 'Ship something real this week' });
    const tl = visible(wide.layers, 'title')[0];
    return {
      dupTitles: dupTitles.map((l: any) => l.text), dupTags: dupTags.map((l: any) => l.text), dupNotes: dup.notes,
      fbWords, fbNotes: fb.notes,
      wideWidth: tl.width, wideHeight: tl.height, wideSize: Math.round(T.layoutText(tl).size), wideNotes: wide.notes,
    };
  });
  expect(r.dupTitles).toEqual(['Ship something real this week']);
  expect(r.dupTags).toEqual(['STEP 1']);
  expect(r.dupNotes.join(' ')).toMatch(/one slot, filled once/);
  expect(r.fbWords).toEqual(['Hello brave world', 'More words here']);
  expect(r.fbNotes.join(' ')).toMatch(/Warning: .*content design is used/);
  expect(r.wideWidth).toBeGreaterThan(300);
  expect(r.wideSize).toBeGreaterThanOrEqual(56);
  expect(r.wideNotes.join(' ')).toMatch(/widened/);
});
