// Style-7 decoration clutter (ZERO model calls): stickers are rare and never touch a picture, card, pill or button; a pen ring is drawn only tight round an accent word; a slide gets at most one
// decoration of the three kinds (ring > sticker > art).
import { expect, test } from '@playwright/test';

test.setTimeout(10 * 60_000);

const DECK = [
  { layout: 'statement', fields: { headline: 'Job or freelance? Both have a cost', caption: 'The honest comparison' }, accents: ['cost'] },
  { layout: 'headline-body-image', fields: { headline: 'What a job gives you', body: 'Steady salary, health insurance, paid leave and colleagues to learn from.' }, accents: [] },
  { layout: 'comparison', fields: { title: 'Control or stability', leftLabel: 'Full-time job', leftText: 'Steady pay, fixed hours', rightLabel: 'Freelancing', rightText: 'You choose clients and hours' }, accents: [] },
  { layout: 'do-dont', fields: { title: 'Pack it', num: '1', wrong: 'A bag and a hoodie, both heavy.', right: 'One hoodie that becomes the bag.' }, accents: [] },
  { layout: 'statement-card', fields: { headline: 'Neither is better. They reward different habits.' }, accents: ['different habits'] },
  { layout: 'pill-stagger', fields: { headline: 'Who each one suits', items: ['You like variety', 'You handle uncertainty', 'You want stability', 'You want a team'] }, accents: [] },
  { layout: 'split-text', fields: { headline: 'The catch with freelancing', paragraph: 'Income is uneven and you carry your own insurance and taxes.' }, accents: ['catch'] },
  { layout: 'bullet-list', fields: { title: 'What a job gives you', items: ['A steady salary', 'Health insurance', 'Paid leave'] }, accents: [] },
  { layout: 'statement', fields: { headline: 'Decide which habits fit you' }, accents: ['habits'] },
];
const IMAGES = [{ id: 'pa', width: 1600, height: 900 }, { id: 'pb', width: 1500, height: 1000 }, { id: 'pc', width: 1200, height: 1200 }];

test('style-7: stickers are rare and clear of pictures and cards, rings enclose an accent word, one decoration per slide', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ DECK, IMAGES }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const pack = PR.presetPackFor('style-7', false);
    const req: any = { text: 'Freelancing versus a full-time job. '.repeat(8), slides: 9, tone: 'clear', format: 'carousel', styleChoice: 'style-7', styles: [] };
    const provider: any = { id: 'dev-cli', label: 'fake', async write() { return { text: JSON.stringify({ title: 'T', slides: DECK }), ms: 5 }; } };
    const res: any = await D.designLibraryDeck(req, { pack, hasPhoto: true, images: IMAGES }, '@maya.designs', provider, new AbortController().signal);
    const lib = res.designed.library;
    const hit = (a: any, b: any, pad: number) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
    const slides: any[] = [];
    const ids = Object.keys(res.designed.slides).sort((a, b) => Number(a) - Number(b));
    for (const id of ids) {
      const b = res.designed.slides[id].built;
      const devices = (b.devices ?? []) as { id: string; kind: string; box: any }[];
      const pics = ((b.images ?? []) as any[]).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
      const shapes = (b.layers as any[]).filter((l) => l.kind === 'shape' && !/background|recurring/.test(String(l.name)) && l.width * l.height < 1080 * 1350 * 0.5 && l.height > 20).map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height }));
      const stickers = devices.filter((d) => d.kind === 'sticker');
      const rings = devices.filter((d) => d.id === 'pen-circle');
      const unders = devices.filter((d) => d.id === 'pen-underline'); // the fallback of a ring that other text is too close to: one decoration too
      const arts = devices.filter((d) => d.id.startsWith('art:'));
      const bad: string[] = [];
      for (const s of stickers) {
        for (const p of pics) if (hit(s.box, p, 23)) bad.push(`sticker within 24 px of a picture (${Math.round(p.x)},${Math.round(p.y)})`);
        for (const q of shapes) if (hit(s.box, q, 23)) bad.push(`sticker within 24 px of a shape ${Math.round(q.x)},${Math.round(q.y)} ${Math.round(q.w)}x${Math.round(q.h)}`);
      }
      // rings: the ring box encloses the measured box of an accent word
      const doc = new DOMParser().parseFromString(b.svg, 'image/svg+xml');
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-9999px;top:0;width:1080px;height:1350px;visibility:hidden';
      host.appendChild(document.importNode(doc.documentElement, true));
      document.body.appendChild(host);
      const accentBoxes: any[] = [];
      host.querySelectorAll('text[data-role="title"] tspan[fill]').forEach((t: any) => { try { const bb = t.getBBox(); accentBoxes.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height }); } catch { /* not measurable */ } });
      host.remove();
      for (const ring of rings) {
        const ok = accentBoxes.some((a) => ring.box.x <= a.x + 3 && ring.box.x + ring.box.w >= a.x + a.w - 3 && ring.box.y <= a.y + a.h && ring.box.y + ring.box.h >= a.y && ring.box.w <= a.w + 80 && ring.box.h <= a.h * 1.6 + 20);
        if (!ok) bad.push(`a ring (${Math.round(ring.box.x)},${Math.round(ring.box.y)} ${Math.round(ring.box.w)}x${Math.round(ring.box.h)}) does not enclose an accent word (${accentBoxes.map((a) => `${Math.round(a.x)},${Math.round(a.y)} ${Math.round(a.w)}x${Math.round(a.h)}`).join(' / ') || 'none'})`);
      }
      slides.push({ layout: lib.layouts[Number(id)], accents: lib.plan.specs[Number(id)].accents.length, rings: rings.length + unders.length, stickers: stickers.length, arts: arts.map((a) => a.id), ringArtDrawn: /data-art="style-7\/sticker-/.test(b.svg) || /<path data-ring-art="(?:loop|underline)" d="M|<path d="M [^"]+" fill="none" stroke="[^"]+" stroke-width="\d+" stroke-linecap="round"/.test(b.svg), kinds: (rings.length + unders.length ? 1 : 0) + (stickers.length ? 1 : 0) + (arts.length ? 1 : 0), pics: pics.length, bad });
    }
    return slides;
  }, { DECK, IMAGES });
  console.log('DECOR ' + JSON.stringify(r.map((s: any, i: number) => `${i + 1}:${s.layout}${s.rings ? ' RING' : ''}${s.stickers ? ' STICKER' : ''}${s.arts.length ? ' ART' : ''}${s.pics ? ' pics' + s.pics : ''}`)));
  expect(r.length).toBeGreaterThanOrEqual(8);
  r.forEach((s: any, i: number) => {
    expect(s.bad, `slide ${i + 1} (${s.layout})`).toEqual([]);
    expect(s.kinds, `slide ${i + 1}: at most one decoration (ring > sticker > art)`).toBeLessThanOrEqual(1);
    expect(s.arts.filter((a: string) => /style-7\/sticker-/.test(a)), `slide ${i + 1}: no free-floating ring art`).toEqual([]);
    if (!s.accents) expect(s.rings, `slide ${i + 1}: no accent word, no ring`).toBe(0);
  });
  const stickerSlides = r.map((s: any, i: number) => (s.stickers ? i : -1)).filter((i: number) => i >= 0);
  expect(stickerSlides.length, 'at most one sticker per 3 slides').toBeLessThanOrEqual(Math.ceil(r.length / 3));
  for (let i = 1; i < stickerSlides.length; i++) expect(stickerSlides[i] - stickerSlides[i - 1], 'never consecutive').toBeGreaterThan(1);
  // the rings that exist are drawn from the pack's ring art, round an accent word
  expect(r.some((s: any) => s.rings > 0), 'a ring (or its underline fallback) appears where an accent word is').toBe(true);
  expect(r.filter((s: any) => s.rings > 0).every((s: any) => s.ringArtDrawn), 'the ring is the pack ring art, or the generated rounded loop or underline where the art ellipse would not clear the letters or other text').toBe(true);
  // a picture slide and a card slide are in the deck (the check above is meaningful)
  expect(r.some((s: any) => s.pics > 0)).toBe(true);
});
