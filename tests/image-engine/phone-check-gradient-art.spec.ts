// Round G part D: the phone check measures a gradient headline along its gradient (the worst point against the ground behind it) and text drawn over art.
// Same thresholds as other text (3:1 from 96 px, 4.5:1 below). No model call.
import { expect, test } from '@playwright/test';

test.setTimeout(3 * 60_000);

test('D: style-8 on yellow, neon green and light blue: the weak gradient headline is reported, then the guard fixes it on the same layout; the default look passes', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const dl: any = await import('/src/carousel/designLibrary.ts');
    const presets: any = await import('/src/carousel/presets.ts');
    const fc: any = await import('/src/reference/faithfulChecks.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts');
    await fonts.loadFonts();
    const slides = [
      { layout: 'stepper', fields: { title: "Here's how it works", steps: ['Paste your text', 'Pick a look', 'Get slides'] }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'I will send you the link.' }, accents: [] },
    ];
    const out: any = {};
    for (const G of [{ n: 'default' }, { n: 'yellow', bg: '#FFE97A', text: '#333333' }, { n: 'neon', bg: '#39FF14', text: '#FFFFFF' }, { n: 'blue', bg: '#5384FF', text: '#000000' }]) {
      const pack = structuredClone(presets.presetPackFor('style-8', false));
      if ((G as any).bg) { pack.palette = { bg: (G as any).bg, text: (G as any).text, accent: (G as any).text }; pack.look = { ...pack.look, rhythm: [] }; }
      const { style } = dl.styleFromPack(pack);
      out[G.n] = [];
      for (const [i, sp] of slides.entries()) {
        const d = await dl.drawOne(sp, 0, style, { handle: '@saycreator', index: i, total: 4, cut: 'plain', invert: false, density: 'normal' });
        const bg = d.built.fieldBg ?? style.palette.bg;
        const o = { canvas: { w: 1080, h: 1350 }, bg, k: 1, slideType: String(dl.scriptSlideOf(sp.layout, sp.fields).type) };
        const find = (b: any, extra: any) => fc.faithfulChecks(b.layers, { ...o, ...extra }).find((q: any) => q.id === 'contrast');
        const oldR = find(d.built, {});
        const newR = find(d.built, { svg: d.built.svg, devices: d.built.devices });
        let guard: any = null;
        if (!newR.pass) {
          const fs2 = dl.readableStyle(style, dl.groundsUnderTitle(d.built.layers, bg));
          const d2 = fs2 ? await dl.drawOne(sp, 0, fs2, { handle: '@saycreator', index: i, total: 4, cut: 'plain', invert: false, density: 'normal' }) : null;
          guard = d2?.built ? { pass: find(d2.built, { svg: d2.built.svg, devices: d2.built.devices }).pass, layout: sp.layout } : { pass: false };
        }
        out[G.n].push({ layout: sp.layout, gradient: /id="htext"/.test(d.built.svg), oldPass: oldR.pass, newPass: newR.pass, reason: newR.reason, guard });
      }
    }
    // text over art: a 60 px headline over a piece of art drawn in a nearly equal colour, and over one in a contrasting colour
    const layer = { kind: 'text', id: 't', name: 'title', role: 'content', x: 100, y: 100, width: 800, height: 300, rotation: 0, opacity: 1, text: 'Words over art', style: { font: 'Schibsted Grotesk', weight: 800, size: 60, color: '#222222', align: 'left', valign: 'top', lineHeight: 1.1 } };
    const base = { canvas: { w: 1080, h: 1350 }, bg: '#FFFFFF', k: 1, slideType: 'content' };
    const dev = (ink: string) => [{ id: 'art:x/sticker', kind: 'decor', box: { x: 80, y: 90, w: 500, h: 200 }, ink }];
    const c = (devices: any) => fc.faithfulChecks([layer], { ...base, devices }).find((q: any) => q.id === 'contrast');
    out.art = { none: c(undefined).pass, near: c(dev('#2A2A2A')), far: c(dev('#F4E9C9')).pass, glow: fc.faithfulChecks([layer], { ...base, devices: [{ id: 'art:x/glow', kind: 'decor', box: { x: 80, y: 90, w: 500, h: 200 }, ink: '#2A2A2A', opacity: 0.3 }] }).find((q: any) => q.id === 'contrast').pass };
    return out;
  });
  // the default look passes with the extended check
  for (const x of r.default) { expect(x.gradient, 'style-8 draws its gradient headline').toBe(true); expect(x.newPass, JSON.stringify(x)).toBe(true); }
  // a weak ground: the old check passed or missed the headline; the new one reports the gradient; the guard fixes it with the layout unchanged
  for (const g of ['yellow', 'neon', 'blue']) for (const x of r[g]) {
    expect(x.newPass, `${g} ${x.layout}`).toBe(false);
    expect(x.reason, `${g} ${x.layout}`).toContain('gradient');
    expect(x.guard?.pass, `${g} ${x.layout} after the guard`).toBe(true);
  }
  // yellow and light blue: the old check said nothing about the headline
  for (const g of ['yellow', 'blue']) for (const x of r[g]) expect(x.oldPass, `${g} ${x.layout}: the old check passed`).toBe(true);
  // art
  expect(r.art.none).toBe(true);
  expect(r.art.near.pass).toBe(false);
  expect(r.art.near.reason).toContain('over');
  expect(r.art.far).toBe(true);
  expect(r.art.glow, 'a soft glow is not art ink').toBe(true);
});

test('D2: the default style-8 caption slide (gradient headline on a grey panel) is measured on the panel and repaired by colour', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const dl: any = await import('/src/carousel/designLibrary.ts');
    const presets: any = await import('/src/carousel/presets.ts');
    const fc: any = await import('/src/reference/faithfulChecks.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts');
    await fonts.loadFonts();
    const img = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#C9D1DB"/></svg>');
    const sp = { layout: 'photo-full-caption', fields: { headline: 'The idea took ten minutes', line: 'The slides took the rest of the night.', image: img }, accents: ['ten minutes'] };
    const { style } = dl.styleFromPack(presets.presetPackFor('style-8', false));
    const d = await dl.drawOne(sp, 2, style, { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
    const o = { canvas: { w: 1080, h: 1350 }, bg: d.built.fieldBg ?? style.palette.bg, k: 1, slideType: 'content', svg: d.built.svg, devices: d.built.devices };
    const first = fc.faithfulChecks(d.built.layers, o).find((q: any) => q.id === 'contrast');
    const fs2 = dl.readableStyle(style, dl.groundsUnderTitle(d.built.layers, o.bg));
    const d2 = fs2 ? await dl.drawOne(sp, 2, fs2, { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' }) : null;
    const second = d2?.built ? fc.faithfulChecks(d2.built.layers, { ...o, svg: d2.built.svg, devices: d2.built.devices }).find((q: any) => q.id === 'contrast') : null;
    return { first, second, same: d2?.built ? d2.built.layers.filter((l: any) => l.kind === 'text').map((l: any) => l.text).join('|') === d.built.layers.filter((l: any) => l.kind === 'text').map((l: any) => l.text).join('|') : false };
  });
  expect(r.first.pass, JSON.stringify(r.first)).toBe(false);
  expect(r.first.reason).toContain('gradient');
  expect(r.second?.pass, JSON.stringify(r.second)).toBe(true);
  expect(r.same, 'the same words').toBe(true);
});
