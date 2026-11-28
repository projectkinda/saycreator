// Round AL part 3: the layout picker's tiles show THIS slide with its own pictures, exactly as a click would draw it (the tiles showed a grey stand-in with a sun and hills before).
// A tile and the redraw share one function (choiceDraw): the slide's own picture on its own layout, on another layout the project picture the change would place, the text-only form
// when there is none. The pictures in a tile are small copies (480 px on the long side). ZERO model calls (a fake writer for the app test).
import { expect, test, type Page } from '@playwright/test';
import { deckDrawn, openTab, toStep } from './ui';

test.setTimeout(6 * 60_000);

test('AL4 every tile of a picture slide is exactly the slide a click gives (same SVG), with the project\'s pictures and never the stand-in', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const P: any = await import('/src/carousel/designLibraryPick.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const style = D.styleFromPack(PR.presetPackFor('editorial-collage', false)).style;
    const images = [{ id: 'pA', width: 1000, height: 1500, content: 'photo' }, { id: 'pB', width: 1500, height: 1000, content: 'photo' }];
    const look = { hasPhoto: true, images };
    const ref = IM.makeRef({ id: 'pA', w: 1000, h: 1500, photo: true });
    const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style, styleNotes: [], plan: { title: 'T', specs: [
      { layout: 'split-half', fields: { headline: 'Look for reflections', body: 'Puddles, windows and wet streets give you a second picture for free.', image: ref }, accents: [] },
      { layout: 'statement', fields: { headline: 'Get low or get high.', caption: 'Eye level is what everyone else does.' }, accents: [] },
      { layout: 'listicle-numeral', fields: { numeral: '3', title: 'Leave empty space', body: 'A small subject in a big scene feels like a story.' }, accents: [] },
    ] } };
    const res = await D.redrawLibraryDeck(lib, { pack: PR.presetPackFor('editorial-collage', false), hasPhoto: true, images }, '@h');
    const stand = [IM.placeholderImage('photo'), IM.placeholderImage('art'), IM.placeholderImage('portrait')];
    const out: any[] = [];
    for (const i of [0, 1]) {
      const m = P.galleryModel(res.library, look, '@h', i);
      for (const e of m.entries.filter((x: any) => x.enabled)) for (const v of [0, 1]) {
        const tile = await P.drawGalleryTile(res.library, look, '@h', i, e.layout, v);
        const red = await P.redrawLibrarySlide(res.library, look, '@h', i, { layout: e.layout, variant: v });
        out.push({ i, layout: e.layout, v, same: !!tile && red.ok && red.slide.built.svg === tile, pics: [...new Set([...(tile ?? '').matchAll(/picture:(p[AB])/g)].map((x) => x[1]))], stand: stand.some((s) => (tile ?? '').includes(s)), slots: IM.imageSlotsOf(e.layout).length });
      }
    }
    return out;
  });
  expect(r.length).toBeGreaterThan(10);
  for (const t of r) {
    expect(t.same, `slide ${t.i + 1} ${t.layout} look ${t.v}: the tile is the slide a click gives`).toBe(true);
    expect(t.stand, `${t.layout}: never the grey stand-in`).toBe(false);
  }
  const own = r.filter((t: any) => t.i === 0 && t.layout === 'split-half');
  for (const t of own) expect(t.pics, 'the slide\'s own layout shows its own picture').toEqual(['pA']);
  const withPic = r.filter((t: any) => t.i === 0 && t.slots > 0);
  expect(withPic.length).toBeGreaterThan(2);
  for (const t of withPic) expect(t.pics.length, `${t.layout}: a picture layout shows a project picture`).toBeGreaterThan(0);
  for (const t of r.filter((x: any) => x.slots === 0)) expect(t.pics, `${t.layout}: a text layout shows no picture`).toEqual([]);
});

const TEXT = "5 small habits that make your photos look less like everyone else's.\n\n1. Shoot at golden hour. Sunrise and the hour before sunset do more than any filter.\n2. Look for reflections. Puddles, windows and wet streets give you a second picture for free.\n3. Get low or get high. Eye level is what everyone else does.\n4. Leave empty space. A small subject in a big scene feels like a story.\n5. Pick one detail. A single leaf on a table can beat a whole landscape.\n\nSave this for your next shoot, and tell me which one you'll try first.";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const WRITER = JSON.stringify({ title: '5 small habits', slides: [
  S('statement', { headline: '5 small habits for your photos', caption: "Look less like everyone else's." }),
  S('listicle-numeral', { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' }),
  S('photo-cover', { headline: 'Look for reflections', intro: 'Puddles, windows and wet streets give you a second picture for free.' }),
  S('cta-pair', { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me', line2: "Tell me which one you'll try first." }),
] });
async function picture(page: Page, name: string, w: number, h: number, a: string, b: string) {
  const b64 = await page.evaluate(async ({ w, h, a, b }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    let seed = 11; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 60%, ${20 + rnd() * 60}%, 0.55)`; const s = (0.004 + rnd() * 0.03) * Math.min(w, h); g.fillRect(rnd() * w, rnd() * h, s, s); }
    const blob: Blob = await new Promise((res) => c.toBlob((x) => res(x!), 'image/jpeg', 0.85));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
  }, { w, h, a, b });
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

test('AL5 in the app: the tiles of a photo slide show the person\'s photo (the stand-in grey is not in them), drawn from a small copy; one fake writer call', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let calls = 0;
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (x) => x.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (x) => x.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  const write = (x: any) => { calls++; return x.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  // a saturated red-to-orange photo: its colours are far from the stand-in's greys and blues
  await page.getByLabel('Choose images for the slides').setInputFiles([await picture(page, 'wide.jpg', 3000, 2000, '#c0392b', '#f39c12')]);
  await expect(page.getByTestId('image-0')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 4);
  await openTab(page, 'Layout', 3);
  const g = page.getByTestId('gallery-2');
  await g.scrollIntoViewIfNeeded();
  await expect(g).not.toHaveAttribute('data-ready-ms', '', { timeout: 60_000 });
  const ms = Number(await g.getAttribute('data-ready-ms'));
  const tiles = await g.evaluate(async (el) => {
    const out: { id: string; warm: number; stand: number }[] = [];
    for (const b of [...el.querySelectorAll('button[data-testid^="gal-"][data-state]')]) {
      const img = b.querySelector('img') as HTMLImageElement | null;
      if (!img) continue;
      await img.decode().catch(() => undefined);
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let warm = 0, stand = 0;
      for (let k = 0; k < d.length; k += 4) {
        const [r0, g0, b0] = [d[k], d[k + 1], d[k + 2]];
        if (r0 > 150 && r0 - b0 > 60 && g0 < 200) warm++;
        // the stand-in's tint and hills: #D5DBE3, #B7C1CE, #9AA6B6
        if ([[0xd5, 0xdb, 0xe3], [0xb7, 0xc1, 0xce], [0x9a, 0xa6, 0xb6]].some(([R, G, B]) => Math.abs(r0 - R) + Math.abs(g0 - G) + Math.abs(b0 - B) < 9)) stand++;
      }
      out.push({ id: b.getAttribute('data-testid')!, warm: warm / (d.length / 4), stand: stand / (d.length / 4) });
    }
    return out;
  });
  const small = await page.evaluate(async () => {
    const PL: any = await import('/src/carousel/photoLibrary.ts');
    const id = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as any).project?.doc?.photos?.[0]?.id;
    const url = await PL.pictureDataUrl(id, PL.PICTURE_THUMB_MAX);
    const im = new Image(); im.src = url; await im.decode();
    return { w: im.naturalWidth, h: im.naturalHeight, max: PL.PICTURE_THUMB_MAX };
  });
  console.log('AL5 tiles', JSON.stringify(tiles), 'ready', ms, 'ms; small copy', JSON.stringify(small));
  const now = tiles.find((t) => t.id === 'gal-photo-cover');
  expect(now, JSON.stringify(tiles)).toBeTruthy();
  expect(now!.warm, 'the slide\'s own photo is in its tile').toBeGreaterThan(0.15);
  for (const t of tiles) expect(t.stand, `${t.id}: no stand-in picture`).toBeLessThan(0.02);
  expect(Math.max(small.w, small.h)).toBeLessThanOrEqual(small.max);
  expect(ms, 'the tiles are ready within 6 s').toBeLessThan(6000);
  expect(calls).toBe(1);
});
