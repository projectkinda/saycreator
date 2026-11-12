// Round 14 A: a picture is a screenshot or a photo, read from its pixels (the rule is in src/carousel/pictureKind.ts); a screenshot is NEVER under text and never the cover unless the person pinned it.
// Synthetic pictures only (screenshot-like: flat areas and text-like bars; photo-like: smooth gradients plus noise). A fake writer only: ZERO real model calls.
// Output: out/round-14/classification.md, out/round-14/screenshots-not-under-text.png
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(15 * 60_000);
const OUT = 'out/round-14';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const STYLES = ['style-6', 'editorial-collage', 'style-4'];

/** In the page: canvases of screenshot-like and photo-like pictures, and the data URLs a picture resolver gives back. */
const MAKE = `window.__MK = (() => {
  const rnd = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  // a screenshot: a window with a title bar, a sidebar, rows of text-like bars, buttons, on flat colours
  const shot = (w, h, seed, bg, ink, accent) => {
    const [c, g] = canvas(w, h); const r = rnd(seed);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = ink; g.fillRect(0, 0, w, Math.round(h * 0.06));
    g.fillStyle = '#e8e8e8'; g.fillRect(0, Math.round(h * 0.06), Math.round(w * 0.22), h);
    for (let i = 0; i < 18; i++) { g.fillStyle = i % 5 === 0 ? accent : ink; g.fillRect(Math.round(w * 0.27), Math.round(h * (0.1 + i * 0.045)), Math.round(w * (0.2 + r() * 0.5)), Math.round(h * 0.014)); }
    g.fillStyle = accent; g.fillRect(Math.round(w * 0.27), Math.round(h * 0.93), Math.round(w * 0.2), Math.round(h * 0.04));
    return c;
  };
  // a photo: smooth gradients (sky, ground), soft blobs, and noise on every pixel
  const photo = (w, h, seed, noise) => {
    const [c, g] = canvas(w, h); const r = rnd(seed);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'hsl(' + Math.round(200 + r() * 40) + ',60%,70%)'); gr.addColorStop(0.55, 'hsl(' + Math.round(30 + r() * 30) + ',50%,60%)'); gr.addColorStop(1, 'hsl(' + Math.round(90 + r() * 40) + ',40%,30%)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) { const x = r() * w, y = r() * h, rad = (0.1 + r() * 0.25) * Math.min(w, h); const rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, 'rgba(' + Math.round(r() * 255) + ',' + Math.round(r() * 255) + ',' + Math.round(r() * 255) + ',0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); }
    const id = g.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 2 * noise; d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n)); }
    g.putImageData(id, 0, 0);
    return c;
  };
  return { shot, photo };
})();`;

test('classification: screenshot-like pictures are screenshots, photo-like pictures are photos (numbers in out/round-14/classification.md)', async ({ page }) => {
  await page.goto('/images/carousel');
  await page.evaluate(MAKE);
  const r: any = await page.evaluate(async () => {
    const K: any = await import('/src/carousel/pictureKind.ts');
    const MK = (window as any).__MK;
    const rows: any[] = [];
    const add = (name: string, want: string, c: HTMLCanvasElement) => { const x = K.readContentOf(c, c.width, c.height); rows.push({ name, want, ...x }); };
    add('screenshot white window 1170x2532', 'screenshot', MK.shot(1170, 2532, 1, '#ffffff', '#222222', '#2f6fed'));
    add('screenshot dark window 1402x1313', 'screenshot', MK.shot(1402, 1313, 2, '#16181d', '#d8dce6', '#ff7a1a'));
    add('screenshot cream window 1600x1000', 'screenshot', MK.shot(1600, 1000, 3, '#f6f1e6', '#3a3a3a', '#b43c28'));
    add('screenshot blue window 609x757', 'screenshot', MK.shot(609, 757, 4, '#0b2a5a', '#ffffff', '#ffd23f'));
    add('screenshot wide 2400x1000', 'screenshot', MK.shot(2400, 1000, 5, '#ffffff', '#555555', '#0a9b6b'));
    add('screenshot grey 1000x1000', 'screenshot', MK.shot(1000, 1000, 6, '#dcdcdc', '#101010', '#d03030'));
    add('photo noise 12, 1500x1000', 'photo', MK.photo(1500, 1000, 11, 12));
    add('photo noise 20, 1000x1500', 'photo', MK.photo(1000, 1500, 12, 20));
    add('photo noise 8, 1200x1200', 'photo', MK.photo(1200, 1200, 13, 8));
    add('photo noise 16, 2400x1000', 'photo', MK.photo(2400, 1000, 14, 16));
    add('photo noise 10, 1170x2532', 'photo', MK.photo(1170, 2532, 15, 10));
    add('photo noise 24, 800x600', 'photo', MK.photo(800, 600, 16, 24));
    return rows;
  });
  const md = ['# Screenshot or photo: the numbers per picture', '', 'Rule (src/carousel/pictureKind.ts): a screenshot when top16 > 0.60, or flat >= 0.50 and edges >= 0.02; otherwise a photo. top16 = share of pixels in the 16 most common colours (4 bits per channel); flat = share of 4x4 blocks that are flat (each channel varies by 6 or less); edges = share of pixels on a sharp horizontal or vertical edge. Pictures are synthetic (screenshot-like: flat areas and text-like bars; photo-like: smooth gradients plus noise).', '', '| picture | expected | result | top16 | flat | edges | colours |', '|---|---|---|---|---|---|---|', ...r.map((x: any) => `| ${x.name} | ${x.want} | ${x.content} | ${x.top16} | ${x.flat} | ${x.edges} | ${x.buckets} |`), ''].join('\n');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/classification.md`, md);
  for (const x of r) expect(x.content, `${x.name}: top16 ${x.top16}, flat ${x.flat}, edges ${x.edges}`).toBe(x.want);
});

test('no picture layout other than title-over-photo puts text over a picture (3 styles, every shape, both variants); a screenshot is never placed in title-over-photo', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  const r: any = await page.evaluate(async (styles) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const P: any = await import('/src/carousel/imagePlace.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    const over: string[] = [];
    const overByLayout: Record<string, number> = {};
    for (const style of styles) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const id of IM.IMAGE_LAYOUT_IDS as string[]) {
        const def = L.layoutDef(id);
        const keys = def.fields.filter((q: any) => q.image).map((q: any) => q.name);
        for (const pic of ['landscape', 'portrait', 'square', 'tall', 'wide']) for (const v of [0, 1] as const) {
          const s = H.SHAPES[pic];
          const f: any = { ...def.samples.normal };
          keys.forEach((k: string) => { f[k] = H.IM.makeRef({ id: pic, w: s[0], h: s[1], ...(s[0] / s[1] <= 0.5 ? { fy: 0.1 } : {}) }); });
          const d = await H.D.drawOne({ layout: id, fields: f, accents: [] }, v, st, { handle: '@h', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
          if (!d.built) continue;
          const imgs: any[] = d.built.images ?? [];
          const texts = d.built.layers.filter((l: any) => l.kind === 'text' && l.text && !/recurring/.test(l.id + l.name));
          for (const t of texts) {
            const b = T.layoutText(t);
            if (!b.lines.length) continue;
            const x0 = t.x + Math.min(...b.lines.map((q: any) => q.x)), x1 = t.x + Math.max(...b.lines.map((q: any) => q.x + q.width)), y0 = t.y, y1 = t.y + b.lines.length * b.lineStep;
            for (const im of imgs) if (x0 < im.x + im.w - 2 && x1 > im.x + 2 && y0 < im.y + im.h - 2 && y1 > im.y + 2) { overByLayout[id] = (overByLayout[id] ?? 0) + 1; over.push(`${style} ${id} v${v + 1} ${pic}: ${t.name} is over the picture`); }
          }
        }
      }
    }
    // a screenshot is never placed in a layout that sets text over the picture
    const shot = { id: 's1', width: 1170, height: 2532, content: 'screenshot' };
    const photo = { id: 'f1', width: 1500, height: 1000, content: 'photo' };
    return {
      over, overByLayout,
      placeShot: !!P.placeOne('title-over-photo', 0, [shot]),
      placePhoto: !!P.placeOne('title-over-photo', 0, [photo]),
      fitShot: IM.fittingPictures('title-over-photo', [shot]),
      fitPhoto: IM.fittingPictures('title-over-photo', [photo]),
    };
  }, STYLES);
  console.log('TEXT OVER PICTURE by layout', JSON.stringify(r.overByLayout));
  const bad = r.over.filter((x: string) => !/ title-over-photo /.test(x));
  expect(bad.slice(0, 20), 'only title-over-photo sets text over its picture').toEqual([]);
  expect(r.placeShot).toBe(false);
  expect(r.fitShot).toBe(0);
  expect(r.placePhoto).toBe(true);
  expect(r.fitPhoto).toBe(1);
});

test('the deck: a screenshot is not the cover and not under text, in 3 styles; a pinned screenshot cover is kept; photos still get title-over-photo; the sheet is saved', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  await page.evaluate(MAKE);
  const r: any = await page.evaluate(async (styles) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const P: any = await import('/src/carousel/imagePlace.ts');
    const PP: any = await import('/src/carousel/picturePass.ts');
    const MK = (window as any).__MK;
    // the project's pictures as the resolver gives them: two screenshots, two photos
    const spec: [string, number, number, string][] = [['s1', 1170, 2532, 'shot'], ['s2', 1402, 1313, 'shot'], ['f1', 1500, 1000, 'photo'], ['f2', 1000, 1500, 'photo']];
    const urls: Record<string, string> = {};
    for (const [id, w, h, kind] of spec) { const c = kind === 'shot' ? MK.shot(w, h, id.charCodeAt(1), '#ffffff', '#222222', '#2f6fed') : MK.photo(w, h, id.charCodeAt(1) + 9, 14); urls[id] = c.toDataURL('image/jpeg', 0.7); }
    H.FA.setPictureResolver(async (ref: string) => urls[ref.slice('picture:'.length).split('#')[0]] ?? null);
    const infos = (kinds: Record<string, string>) => spec.map(([id, w, h]) => ({ id, width: w, height: h, content: kinds[id] }));
    const text = 'Most creators do not have a design problem. Write a good post, then turn it into slides. Pick a look from fifteen styles. Get slides you can edit. Add your own pictures too.';
    const plan = [
      { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
      { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging boxes.' }, accents: [] },
      { layout: 'numbered-list', fields: { title: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: [] },
      { layout: 'headline-card', fields: { headline: 'Change a headline and nothing reruns.', card: 'Switch the style and your words stay put.' }, accents: [] },
      { layout: 'statement-card', fields: { headline: 'You can add your own pictures too.' }, accents: [] },
      { layout: 'split-text', fields: { headline: 'Try a look', paragraph: 'Pick one of fifteen styles.' }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." }, accents: [] },
    ];
    const run = async (style: string, kinds: Record<string, string>, mod?: (p: any[]) => any[]) => {
      const slides = mod ? mod(JSON.parse(JSON.stringify(plan))) : plan;
      const provider: any = { id: 'dev-cli', label: 'fake', async write() { return { text: JSON.stringify({ title: 'Say Creator', slides }), ms: 1 }; } };
      const look = { pack: H.PR.presetPackFor(style, false), brief: '', hasPhoto: true, images: infos(kinds), site: '' };
      const res: any = await H.D.designLibraryDeck({ text, slides: 7, tone: 'clear', format: 'carousel', styleChoice: style, styles: [] }, look, '', provider, new AbortController().signal);
      return res;
    };
    const out: any = { allShots: [], mixed: [], pinned: null, coverPhoto: [] };
    const svgs: string[] = [];
    for (const style of styles) {
      const onlyShots = await run(style, { s1: 'screenshot', s2: 'screenshot', f1: 'screenshot', f2: 'screenshot' }, (p) => { p[0] = { layout: 'title-over-photo', fields: { headline: "Most creators don't have a design problem.", line: 'They have a "this takes two hours" problem.' }, accents: [] }; return p; });
      const specs = onlyShots.designed.library.plan.specs;
      out.allShots.push({ style, layouts: specs.map((s: any) => s.layout), coverPictured: !!P.usedIds(specs[0].fields).length, textOver: specs.filter((s: any) => s.layout === 'title-over-photo' && P.usedIds(s.fields).length).length, used: specs.map((s: any) => P.usedIds(s.fields).length) });
      svgs.push(onlyShots.designed.slides['0'].built.svg);
      const pic = specs.findIndex((s: any, i: number) => i > 0 && P.usedIds(s.fields).length);
      svgs.push(onlyShots.designed.slides[String(pic < 0 ? 1 : pic)].built.svg);
      // two photos and two screenshots: the cover may take a photo, never a screenshot
      const mixed = await run(style, { s1: 'screenshot', s2: 'screenshot', f1: 'photo', f2: 'photo' }, (p) => { p[0] = { layout: 'title-over-photo', fields: { headline: "Most creators don't have a design problem." }, accents: [] }; return p; });
      const ms = mixed.designed.library.plan.specs;
      const coverIds = P.usedIds(ms[0].fields);
      out.mixed.push({ style, cover: ms[0].layout, coverIds, textOverIds: ms.filter((s: any) => s.layout === 'title-over-photo').flatMap((s: any) => P.usedIds(s.fields)) });
      svgs.push(mixed.designed.slides['0'].built.svg);
      const mp = ms.findIndex((s: any, i: number) => i > 0 && P.usedIds(s.fields).length);
      svgs.push(mixed.designed.slides[String(mp < 0 ? 1 : mp)].built.svg);
    }
    // a screenshot the person pinned as the cover keeps it (the placement and the passes leave a pinned slide alone)
    const specs0 = JSON.parse(JSON.stringify(plan)).map((s: any) => ({ ...s, accents: [] }));
    specs0[0] = { layout: 'photo-full-caption', fields: { headline: 'Pinned cover', image: IM.makeRef({ id: 's1', w: 1170, h: 2532 }) }, accents: [], pin: { picture: 's1' } };
    const placed = P.placeImages(specs0, specs0.map(() => 0), infos({ s1: 'screenshot', s2: 'screenshot', f1: 'photo', f2: 'photo' }));
    const passed = PP.picturePass(placed, { images: infos({ s1: 'screenshot', s2: 'screenshot', f1: 'photo', f2: 'photo' }) });
    out.pinned = { coverImage: placed[0].fields.image, afterPass: passed.specs[0].fields.image, layout: passed.specs[0].layout };
    // the sheet: 3 styles x (cover + picture slide) with screenshots only, then with a photo
    const cols = 4, w = 270, h = 338;
    const cv = document.createElement('canvas'); cv.width = cols * w; cv.height = Math.ceil(svgs.length / cols) * h;
    const g = cv.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < svgs.length; i++) { const bm = await createImageBitmap(await H.FA.svgToPng(svgs[i], w * 2)); g.drawImage(bm, (i % cols) * w, Math.floor(i / cols) * h, w, h); }
    const blob: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), 'image/png'));
    const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x);
    out.sheet = btoa(t);
    return out;
  }, STYLES);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/screenshots-not-under-text.png`, Buffer.from(r.sheet, 'base64'));
  console.log('DECKS', JSON.stringify({ allShots: r.allShots, mixed: r.mixed, pinned: r.pinned }));
  for (const x of r.allShots) {
    expect(x.coverPictured, `${x.style}: a screenshot is not the cover (${x.layouts})`).toBe(false);
    expect(x.textOver, `${x.style}: no screenshot under text`).toBe(0);
  }
  for (const x of r.mixed) {
    for (const id of x.textOverIds) expect(['s1', 's2'], `${x.style}: a screenshot is under a title`).not.toContain(id);
    for (const id of x.coverIds) expect(['s1', 's2'], `${x.style}: a screenshot is the cover`).not.toContain(id);
  }
  expect(r.pinned.coverImage).toContain('picture:s1');
  expect(r.pinned.afterPass, 'the pass leaves the pinned cover alone').toContain('picture:s1');
});

test('the Content step: each picture shows a "Screenshot" or "Photo" chip from its pixels, and clicking the chip switches it', async ({ page }) => {
  await page.goto('/images/carousel');
  await page.evaluate(MAKE);
  const mk = async (kind: string) => page.evaluate(async (kind) => {
    const MK = (window as any).__MK;
    const c: HTMLCanvasElement = kind === 'shot' ? MK.shot(1170, 1500, 3, '#ffffff', '#222222', '#2f6fed') : MK.photo(1500, 1000, 12, 20);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png')); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
  }, kind);
  const shot = Buffer.from(await mk('shot'), 'base64');
  const photo = Buffer.from(await mk('photo'), 'base64');
  await page.getByLabel('Choose images for the slides').setInputFiles([{ name: 'shot.png', mimeType: 'image/png', buffer: shot }, { name: 'photo.png', mimeType: 'image/png', buffer: photo }]);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(2, { timeout: 60_000 });
  const chip0 = page.getByTestId('image-0-content');
  const chip1 = page.getByTestId('image-1-content');
  await expect(chip0).toHaveText('Screenshot');
  await expect(chip1).toHaveText('Photo');
  await chip0.click();
  await expect(chip0).toHaveText('Photo');
  await chip1.click();
  await expect(chip1).toHaveText('Screenshot');
});

// Round 16 D: no picture overlaps the handle, the avatar, the page counter or the footer (every picture layout x 3 styles x every shape x both variants), with the profile header on and off.
test('chrome: no picture overlaps the handle, avatar, name, page counter or footer in any picture layout (3 styles, profile header on and off)', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  const r: any = await page.evaluate(async (styles) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const CH: any = await import('/src/carousel/layouts/chrome.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    const bad: string[] = [];
    let checked = 0, shrunk = 0;
    for (const style of styles) for (const profile of [true, false]) {
      const st0 = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      const st = { ...st0, devices: { ...st0.devices, profileHeader: profile } };
      for (const id of IM.IMAGE_LAYOUT_IDS as string[]) {
        const def = L.layoutDef(id);
        const keys = def.fields.filter((q: any) => q.image).map((q: any) => q.name);
        for (const pic of ['landscape', 'portrait', 'square', 'tall', 'wide']) for (const v of [0, 1] as const) for (const index of [0, 3, 6]) {
          const s = H.SHAPES[pic];
          const f: any = { ...def.samples.normal };
          keys.forEach((k: string) => { f[k] = H.IM.makeRef({ id: pic, w: s[0], h: s[1], ...(s[0] / s[1] <= 0.5 ? { fy: 0.1 } : {}) }); });
          const d = await H.D.drawOne({ layout: id, fields: f, accents: [] }, v, st, { handle: '@maya.designs', name: 'Maya Designs', index, total: 7, cut: 'plain', invert: false, density: 'normal' });
          if (!d.built) continue;
          // the chrome as the builder draws it, measured with the engine's own text widths (not the builder's estimate)
          const rec: any[] = CH.chromeFor({ handle: '@maya.designs', name: 'Maya Designs', index, total: 7, profile, font: st.fonts.body, deco: st.deco, site: st.site });
          const boxes = rec.map((c) => {
            if (c.shape) return { n: c.shape, x: c.x - c.size, y: c.y - c.size, w: 2 * c.size, h: 2 * c.size };
            const w = T.measureWidth(c.text, c.font || st.fonts.body, c.weight ?? 500, c.size);
            const x0 = c.anchor === 'end' ? c.x - w : c.anchor === 'middle' ? c.x - w / 2 : c.x;
            return { n: c.text, x: x0, y: c.y - c.size * 0.8, w, h: c.size * 1.0 };
          });
          checked++;
          for (const im of (d.built.images ?? []) as any[]) {
            if (im.circle) continue;
            for (const b of boxes) if (b.x < im.x + im.w && b.x + b.w > im.x && b.y < im.y + im.h && b.y + b.h > im.y) bad.push(`${style} profile=${profile} ${id} v${v + 1} ${pic} slide ${index + 1}: the picture (${Math.round(im.x)},${Math.round(im.y)} ${Math.round(im.w)}x${Math.round(im.h)}) overlaps "${b.n}"`);
          }
        }
      }
    }
    return { bad, checked, shrunk };
  }, STYLES);
  console.log('CHROME checked', r.checked, 'overlaps', r.bad.length);
  expect(r.checked).toBeGreaterThan(500);
  expect(r.bad.slice(0, 15)).toEqual([]);
});
