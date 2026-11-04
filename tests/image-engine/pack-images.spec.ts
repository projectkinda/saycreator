// Image slots and the image provider (the FAKE provider only; no real image call): slots parsed from a pack and never holding a picture, empty slots draw placeholders, pictures baked with
// treatments fill the slots in the faithful drawing and the export, the contrast safety net, prompt hygiene and the cap, the square quote design for quote posts, thumbnails parked.
import { expect, test } from '@playwright/test';

test.setTimeout(240_000);

const pal = `data-palette='{"bg":"#101820","text":"#F5F0EB","accent":"#FF8A4C","surface":"#1B2733","muted":"#9AA5B1"}'`;
const text = (role: string, x: number, y: number, size: number) => `<text data-role="${role}" data-min-size="40" data-max-lines="4" x="${x}" y="${y}" font-size="${size}" font-family="Schibsted Grotesk" font-weight="700" fill="$text">${role} words</text>`;
const SVGS = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="cover" ${pal}><rect width="1080" height="1350" fill="$bg"/><rect data-image-slot="background" data-scrim="0.3" data-scrim-from="bottom" x="0" y="0" width="1080" height="1350"/><image href="https://example.com/leak.png" x="0" y="0" width="100" height="100"/><rect data-image-slot="inset" data-mask="circle" data-fit="cover" x="620" y="160" width="340" height="340"/>${text('title', 80, 1000, 90)}${text('body', 80, 1200, 44)}</svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="content"><rect width="1080" height="1350" fill="$bg"/><rect data-image-slot="strip" data-count="2" data-mask="rounded" x="80" y="700" width="920" height="300"/>${text('title', 80, 240, 64)}${text('body', 80, 420, 44)}</svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="quote"><rect width="1080" height="1350" fill="$bg"/>${text('title', 140, 480, 70)}${text('caption', 140, 1160, 36)}</svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" data-type="quote" data-format="square"><rect width="1080" height="1080" fill="$bg"/><rect data-image-slot="inset" data-mask="arch" x="700" y="120" width="280" height="360"/>${text('title', 90, 700, 72)}${text('caption', 90, 960, 36)}</svg>`,
].join('\n');

test('image slots are parsed from a pack without ever keeping a picture; a square quote design is kept apart', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (svgs) => {
    const P = await import('/src/reference/pack.ts');
    const p = await P.parsePack(svgs, 'Slots');
    if (!p.ok) return { ok: false, reasons: p.reasons };
    const all = JSON.stringify(p.pack.svgs);
    return {
      ok: true,
      kinds: p.pack.imageSlots!.cover!.map((s) => `${s.kind}/${s.mask}`),
      strip: p.pack.imageSlots!.content![0],
      cover: p.pack.imageSlots!.cover!,
      leak: /example\.com|<image|data-image-slot|data:image/.test(all),
      marker: all.includes('imgslot-0'),
      designs: Object.keys(p.pack.designs).sort(),
      square: p.pack.square ? { w: p.pack.square.canvas.w, h: p.pack.square.canvas.h, slots: p.pack.square.slots!.map((s) => s.mask), svgMarker: p.pack.square.svg!.includes('imgslot-0') } : null,
    };
  }, SVGS);
  expect(r.ok, JSON.stringify(r)).toBe(true);
  const res = r as Extract<typeof r, { kinds: string[] }>;
  expect(res.kinds).toEqual(['background/rect', 'inset/circle']);
  expect(res.cover[0].scrim).toEqual({ amount: 0.3, from: 'bottom' });
  expect(res.strip).toMatchObject({ kind: 'strip', count: 2, mask: 'rounded' });
  expect(res.leak, 'no external picture, link or picture data in the stored SVG').toBe(false);
  expect(res.marker).toBe(true);
  expect(res.designs).toEqual(['content', 'cover', 'quote']);
  expect(res.square).toEqual({ w: 1080, h: 1080, slots: ['arch'], svgMarker: true });
});

test('empty slots draw placeholders, pictures (fake provider, treatments) fill them in the drawing and the export, text keeps its contrast, quote posts use the square design', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (svgs) => {
    const P = await import('/src/reference/pack.ts');
    const T = await import('/src/reference/templates.ts');
    const B = await import('/src/reference/blank.ts');
    const D = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    const C = await import('/src/carousel/render.ts');
    const IP = await import('/src/images/provider.ts');
    const ST = await import('/src/images/store.ts');
    const SL = await import('/src/images/slots.ts');
    IP.setImageProvider(IP.fakeImageProvider);
    const parsed = await P.parsePack(svgs, 'Slots');
    if (!parsed.ok) return { ok: false };
    await T.ensureTemplatesLoaded();
    const tpl = await T.saveTemplate({ name: 'Slots', target: 'carousel', spec: { ...B.blankStyle(), name: T.styleNameFor('slots') }, preview: '', pack: parsed.pack });
    const pack = tpl.pack!;
    const slides = [
      { type: 'cover', kicker: 'k', headline: 'A cover headline', sub: 'sub' },
      { type: 'content', headline: 'Why it works', body: 'People finish what they start.' },
      { type: 'quote', quote: 'Clear beats clever.', by: 'An editor' },
    ];
    const base = { ...D.emptyDoc(tpl.spec.name), script: { ...S.EXAMPLE, title: 'Morning habits, mail me at jo@example.com @jo_handle 555123456', slides } };
    const px = async (b: Blob, x: number, y: number) => {
      const bm = await createImageBitmap(b);
      const c = new OffscreenCanvas(bm.width, bm.height);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(bm, 0, 0);
      const d = g.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    // Empty: placeholders, no failure.
    const empty = C.composeDoc(base as never);
    const emptySvg = C.faithfulOf(empty.slides[0])!.svg;
    const emptyPng = (await C.renderer.render(empty.slides[0], empty.margin)).png;
    const emptyPx = await px(emptyPng, 790, 330);
    // Requests from the script: short prompts, nothing personal, capped.
    const slotsOf = (type: string) => P.slotsFor(pack, type);
    const plan = ST.planImageRequests(base.script as never, slotsOf, pack.palette);
    const hygiene = { prompts: plan.map((x) => x.prompt), kinds: plan.map((x) => `${x.slide}:${x.kind}`), count: plan.length };
    const capPlan = ST.planImageRequests({ ...base.script, slides: Array.from({ length: 12 }, () => slides[0]) } as never, slotsOf, pack.palette).length;
    const typed = ST.requestFromText('put a sunrise over hills as the background here', 0, pack.palette);
    // Generate with the fake provider, then treat and bake.
    const cover = plan.find((x) => x.slide === 0 && x.kind === 'inset') ?? plan[0];
    const blob = await IP.fakeImageProvider.generate(cover.prompt, { w: 340, h: 340 });
    const blob2 = await IP.fakeImageProvider.generate(cover.prompt, { w: 340, h: 340 });
    await ST.saveOriginal(cover.id, blob);
    const reqs = plan.map((x) => (x.id === cover.id ? { ...x, source: 'generated' as const, generations: 1, treatments: ['duotone', 'grain'] } : x));
    const fresh = await ST.ensureBaked(reqs, (i) => slotsOf(slides[i]?.type ?? 'cover'), pack.palette);
    const filled = C.composeDoc({ ...base, imageRequests: reqs } as never);
    const fa = C.faithfulOf(filled.slides[0])!;
    const filledPng = (await C.renderer.render(filled.slides[0], filled.margin)).png;
    const filledPx = await px(filledPng, 790, 330);
    const bm = await createImageBitmap(filledPng);
    // The safety net: light text on a bright picture gets a scrim that holds 4.5:1.
    const bright = { url: '', w: 1, h: 1, dark: [235, 235, 235], light: [255, 255, 255] } as never;
    const veil = SL.scrimFor(['#F5F0EB'], bright, undefined);
    // Quote post: the square design.
    const q = C.composeDoc({ ...base, format: 'quote', script: { ...base.script, slides: [slides[2]] } } as never);
    const qa = C.faithfulOf(q.slides[0])!;
    const qpng = await createImageBitmap((await C.renderer.render(q.slides[0], q.margin)).png);
    const ps = P.packSlide(pack, 'quote', slides[2], '@me', { square: true });
    // A pack built by the code has a square quote design and slots too.
    const built = P.packFromStyle(C.getStyles().styles.find((s) => s.spec.name === 'editorial-collage')!.spec);
    return {
      ok: true,
      emptyHasPlaceholder: emptySvg.includes('clip-imgslot-1-c0') && !/<image/.test(emptySvg),
      emptyPx, filledPx, fresh, hygiene, capPlan,
      typed: typed && { kind: typed.kind, prompt: typed.prompt },
      filledHasImage: /<image href="data:image\//.test(fa.svg), hasScrim: fa.svg.includes('scrim-imgslot-0'),
      size: [bm.width, bm.height], veil, sameBlob: blob.size > 0 && blob2.size === blob.size,
      quote: { canvas: qa.canvas, png: [qpng.width, qpng.height], psCanvas: ps.canvas, hasInset: qa.svg.includes('clip-imgslot-0-c0') },
      built: { square: !!built.square, slots: Object.keys(built.imageSlots ?? {}), squareSlots: built.square!.slots!.map((s) => s.kind) },
    };
  }, SVGS);
  expect(r.ok).toBe(true);
  const res = r as Extract<typeof r, { fresh: number }>;
  expect(res.emptyHasPlaceholder, 'an empty slot draws a placeholder').toBe(true);
  expect(res.fresh).toBeGreaterThan(0);
  expect(res.filledHasImage).toBe(true);
  expect(Math.abs(res.filledPx[0] - res.emptyPx[0]) + Math.abs(res.filledPx[1] - res.emptyPx[1]) + Math.abs(res.filledPx[2] - res.emptyPx[2]), 'the picture shows in the exported PNG').toBeGreaterThan(30);
  expect(res.size).toEqual([1080, 1350]);
  expect(res.veil!.raised || res.veil!.amount > 0, 'light text on a bright picture needs a scrim').toBe(true);
  expect(res.veil!.amount).toBeGreaterThanOrEqual(0.5);
  for (const p of res.hygiene.prompts) {
    expect(p).not.toMatch(/example\.com|@|\d{4,}/);
    expect(p.length).toBeLessThan(220);
  }
  expect(res.capPlan).toBeLessThanOrEqual(5);
  expect(res.typed).toMatchObject({ kind: 'background' });
  expect(res.typed!.prompt).toContain('sunrise over hills');
  expect(res.quote.canvas).toEqual({ w: 1080, h: 1080 });
  expect(res.quote.png).toEqual([1080, 1080]);
  expect(res.quote.hasInset).toBe(true);
  expect(res.built).toEqual({ square: true, slots: ['cover', 'content'], squareSlots: ['background', 'inset'] });
});

test('the fake provider is deterministic, the real one stays off without server variables, and thumbnails are parked in the menus', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const IP = await import('/src/images/provider.ts');
    const a = await IP.fakeImageProvider.generate('calm blue hills', { w: 200, h: 200 });
    const b = await IP.fakeImageProvider.generate('calm blue hills', { w: 200, h: 200 });
    const c = await IP.fakeImageProvider.generate('another prompt entirely', { w: 200, h: 200 });
    const same = new Uint8Array(await a.arrayBuffer()).join(',') === new Uint8Array(await b.arrayBuffer()).join(',');
    const diff = new Uint8Array(await a.arrayBuffer()).join(',') !== new Uint8Array(await c.arrayBuffer()).join(',');
    const real = await IP.serverImageProvider.available();
    return { same, diff, real, notice: IP.noticeAccepted() };
  });
  expect(r.same).toBe(true);
  expect(r.diff).toBe(true);
  expect(r.real.available, 'off without IMAGE_API_KEY and IMAGE_MODEL').toBe(false);
  expect(r.notice, 'the first-use notice has not been accepted yet').toBe(false);
  await page.goto('/images');
  await expect(page.getByRole('heading', { name: 'Images' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Make a thumbnail/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Thumbnails' })).toHaveCount(0);
  const res = await page.goto('/images/thumbnail');
  expect(res?.status(), 'the thumbnail route still works by its address').toBeLessThan(400);
});
