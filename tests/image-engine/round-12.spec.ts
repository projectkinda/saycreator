// Round 12: (B) the card of a cover hugs its text and sits in the middle; (C) the headline and the body of the phone-frame / split layouts are one block, centred against the picture.
// Output: out/round-12/cover-card-fixed.png, out/round-12/phone-frame-fixed.png. A fake provider only: no model is called.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(10 * 60_000);
const OUT = 'out/round-12';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const routeSrc = fs.readFileSync('tests/image-engine/script-route.spec.ts', 'utf8');
const POST = routeSrc.slice(routeSrc.indexOf('export const POST = `') + 21, routeSrc.indexOf('`;\n\nconst IDS'));
const save = (name: string, b64: string) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${name}`, Buffer.from(b64, 'base64')); };

async function setup(page: Page) {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  await page.evaluate(`window.__sheet = async (svgs, cols, w, h) => {
    const H = window.__H;
    const rows = Math.ceil(svgs.length / cols);
    const c = document.createElement('canvas'); c.width = cols * w; c.height = rows * h;
    const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < svgs.length; i++) { if (!svgs[i]) continue; const bm = await createImageBitmap(await H.FA.svgToPng(svgs[i], w * 2)); g.drawImage(bm, (i % cols) * w, Math.floor(i / cols) * h, w, h); }
    return await new Promise((res) => c.toBlob(async (b) => { const u = new Uint8Array(await b.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); res(btoa(t)); }, 'image/png'));
  };`);
}

test('B: the cover card hugs its text and sits in the middle: 15 styles, the headline with and without its sub line', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async ({ post }) => {
    const H = (window as any).__H;
    const P: any = await import('/src/carousel/pasted.ts');
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    const styles = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
    const script = P.scriptFromBlocks(P.slideBlocks(post), 'carousel', '').script;
    const noSub = { ...script, slides: script.slides.map((s: any, i: number) => (i === 0 ? { type: 'cover', headline: s.headline } : s)) };
    const out: any[] = [];
    const svgs: string[] = [];
    for (const style of styles) for (const [label, sc] of [['with sub', script], ['no sub', noSub]] as [string, any][]) {
      const made: any = await FS.libraryDeckFromScript(sc, { pack: H.PR.presetPackFor(style, false), brief: '', hasPhoto: false, images: [], site: '' }, '');
      const b = made.designed.slides['0'].built;
      if (label === 'with sub') svgs.push(b.svg);
      const layout = made.designed.library.plan.specs[0].layout;
      // the card: the smallest filled shape that holds the headline (cover-block / cover-sticker / statement-card)
      const title = b.layers.find((l: any) => l.kind === 'text' && l.name === 'title');
      const tb = T.layoutText(title);
      const th = tb.lines.length * tb.lineStep;
      const cards = b.layers.filter((l: any) => l.kind === 'shape' && l.width > 600 && l.height > 150 && l.height < 1000 && l.x <= title.x && l.x + l.width >= title.x + 100 && l.y <= title.y + 1 && l.y + l.height >= title.y + th - 1);
      const card = cards.sort((a: any, c: any) => a.width * a.height - c.width * c.height)[0];
      if (card) {
        const texts = b.layers.filter((l: any) => l.kind === 'text' && !/recurring/.test(l.id + l.name) && l.y >= card.y - 1 && l.y < card.y + card.height);
        const top = Math.min(...texts.map((l: any) => l.y)), bottom = Math.max(...texts.map((l: any) => { const q = T.layoutText(l); return l.y + q.lines.length * q.lineStep; }));
        out.push({ style, label, layout, card: [Math.round(card.y), Math.round(card.height)], empty: Math.round((1 - (bottom - top) / card.height) * 100), centre: Math.round(card.y + card.height / 2) });
      } else out.push({ style, label, layout, card: null });
    }
    return { out, sheet: await (window as any).__sheet(svgs, 5, 432, 540) };
  }, { post: POST });
  save('cover-card-fixed.png', r.sheet);
  console.log('B', JSON.stringify(r.out.filter((x: any) => x.card)));
  for (const x of r.out.filter((x: any) => x.card)) {
    expect(x.empty, `${x.style} (${x.layout}, ${x.label}): ${x.empty}% of the card is empty`).toBeLessThanOrEqual(45);
  }
  expect(r.out.filter((x: any) => x.card).length, 'cards were found').toBeGreaterThan(5);
});

test('C: phone-frame and the split layouts: the headline and the body are one block (the normal gap) centred against the picture', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async () => {
    const H = (window as any).__H;
    const T: any = await import('/src/image-engine/draw/text.ts');
    const out: any[] = [];
    const svgs: string[] = [];
    const TEXTS = [
      { headline: 'Open the app and tap start', body: 'The first screen takes ten seconds.' },
      { headline: 'You can add your own pictures too.', body: 'Photos, screenshots, a product shot. They land where they fit, not where a template forces them.' },
      { headline: 'Open the app and tap start to begin', body: 'The first screen takes ten seconds, and the second one is faster, so you can start at once.' },
    ];
    for (const style of ['style-6', 'editorial-collage', 'style-4']) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const [id, pic] of [['phone-frame', 'tall'], ['phone-frame', 'portrait'], ['split-half', 'tall'], ['split-half', 'landscape']] as [string, string][]) for (const [ti, t] of TEXTS.entries()) {
        const s = H.SHAPES[pic];
        const f: any = { ...t, image: H.IM.makeRef({ id: pic, w: s[0], h: s[1], ...(s[0] / s[1] <= 0.5 ? { fy: 0.1 } : {}) }) };
        const d = await H.D.drawOne({ layout: id, fields: f, accents: [] }, 0, st, { handle: '@h', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
        if (!d.built) { out.push({ style, id, pic, ti, refused: true }); continue; }
        if (id === 'phone-frame' && pic === 'tall' && ti !== 0) svgs.push(d.built.svg);
        const title = d.built.layers.find((l: any) => l.kind === 'text' && l.name === 'title');
        const body = d.built.layers.find((l: any) => l.kind === 'text' && l.name === 'body');
        const tq = T.layoutText(title), bq = T.layoutText(body);
        const tTop = title.y, tBot = title.y + tq.lines.length * tq.lineStep, bTop = body.y, bBot = body.y + bq.lines.length * bq.lineStep;
        const im = d.built.images?.[0];
        out.push({ style, id, pic, ti, gap: Math.round(bTop - tBot), blockCentre: Math.round((tTop + bBot) / 2), picCentre: im ? Math.round(im.y + im.h / 2) : null, side: !!im && im.w < 800, fitsBeside: !!im && bBot - tTop <= im.h });
      }
    }
    return { out, sheet: await (window as any).__sheet(svgs, 3, 432, 540) };
  });
  save('phone-frame-fixed.png', r.sheet);
  console.log('C', JSON.stringify(r.out.filter((x: any) => !x.refused).slice(0, 12)));
  for (const x of r.out.filter((x: any) => !x.refused)) {
    expect(x.gap, `${x.style} ${x.id} ${x.pic} text ${x.ti}: gap between headline and body`).toBeLessThanOrEqual(34);
    expect(x.gap).toBeGreaterThanOrEqual(8);
  }
  // beside a picture (a phone, or a tall picture in a half) the block is centred on the picture
  for (const x of r.out.filter((x: any) => !x.refused && x.side && x.fitsBeside)) {
    expect(Math.abs(x.blockCentre - x.picCentre), `${x.style} ${x.id} ${x.pic} text ${x.ti}: block centre ${x.blockCentre} vs picture centre ${x.picCentre}`).toBeLessThanOrEqual(30);
  }
});
