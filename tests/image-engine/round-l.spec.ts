// Round L: photo or screenshot, grain first (src/carousel/pictureKind.ts). Every reading here goes through the app's own read, photoLibrary.prepare(file, 'photo') (createImageBitmap, the work
// canvas, readContentOf), never a separate decode. No writer call.
//   (a) the labelled set in out/test-pictures (labels.json): every photo is a photo, no screenshot or screenshot-like is a photo. Skipped when the folder is not on this computer.
//   (b) pictures made at test time (always runs): code-drawn graphics and a JPEG of a screenshot-like page are never photos; noisy photo-like pictures are photos; PNG and "screenshot" names stay screenshots.
//   (c) the decode path: the app's class equals the <img>-decode class for every real file (skipped without the folder).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(5 * 60_000);
const DIR = process.env.REAL_PICTURES_DIR ?? 'out/test-pictures';
const LABELS = path.join(DIR, 'labels.json');
const labels: Record<string, string> = fs.existsSync(LABELS) ? JSON.parse(fs.readFileSync(LABELS, 'utf8')) : {};
const files = Object.keys(labels).filter((f) => fs.existsSync(path.join(DIR, f)));

/** The app's class (and numbers) of a file, read the way the app reads a picture when it is added; and the same file through an <img> decode. */
async function readBoth(page: Page, f: string) {
  const b64 = fs.readFileSync(path.join(DIR, f)).toString('base64');
  return page.evaluate(async ({ b64, f }) => {
    const PL: any = await import('/src/carousel/photoLibrary.ts');
    const K: any = await import('/src/carousel/pictureKind.ts');
    const type = /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';
    const blob = await (await fetch(`data:${type};base64,${b64}`)).blob();
    const app = (await PL.prepare(new File([blob], f, { type }), 'photo')).reading;
    const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode();
    const viaImg = K.readContentOf(img, img.naturalWidth, img.naturalHeight, type === 'image/png', f);
    return { app, img: viaImg };
  }, { b64, f });
}

test('L-a: the labelled set: every real photo is a photo, no screenshot or screenshot-like is ever a photo (the app read)', async ({ page }) => {
  test.skip(!files.length, `no labelled pictures in ${DIR} (labels.json and the pictures are kept on the developer's computer, not in git; set REAL_PICTURES_DIR to use another folder)`);
  await page.goto('/images/carousel');
  const bad: string[] = [];
  let photos = 0, others = 0;
  for (const f of files) {
    const { app } = await readBoth(page, f);
    const want = labels[f] === 'photo' ? 'photo' : 'screenshot';
    if (labels[f] === 'photo') photos++; else others++;
    if (app.content !== want) bad.push(`${f} (${labels[f]}): ${app.content}, grain ${app.grain}, top16 ${app.top16}, ${app.why}`);
  }
  expect(photos, 'photos in the set').toBeGreaterThanOrEqual(1);
  expect(others, 'screenshots and screenshot-likes in the set').toBeGreaterThanOrEqual(1);
  expect(bad).toEqual([]);
});

test('L-c: the decode path does not change the class: the app read and an <img> decode agree on every real file', async ({ page }) => {
  test.skip(!files.length, `no labelled pictures in ${DIR}`);
  await page.goto('/images/carousel');
  const differ: string[] = [];
  for (const f of files) {
    const { app, img } = await readBoth(page, f);
    if (app.content !== img.content) differ.push(`${f}: app ${app.content} (grain ${app.grain}), <img> ${img.content} (grain ${img.grain})`);
  }
  expect(differ).toEqual([]);
});

test('L-b: pictures made at test time: graphics and a JPEG screenshot are never photos, noisy photo-like pictures are photos, a PNG or a "screenshot" name stays a screenshot', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const PL: any = await import('/src/carousel/photoLibrary.ts');
    const K: any = await import('/src/carousel/pictureKind.ts');
    const rnd = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
    const read = async (c: OffscreenCanvas, name: string, type = 'image/jpeg', q = 0.85) => {
      const blob = await c.convertToBlob(type === 'image/jpeg' ? { type, quality: q } : { type });
      return (await PL.prepare(new File([blob], name, { type }), 'photo')).reading;
    };
    const W = 1080, H = 1350;
    const card = new OffscreenCanvas(W, H); { const g = card.getContext('2d')!; g.fillStyle = '#F2A900'; g.fillRect(0, 0, W, H); g.fillStyle = '#0B3C5D'; g.fillRect(120, 900, 840, 260); }
    const grad = new OffscreenCanvas(W, H); { const g = grad.getContext('2d')!; const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#2557D6'); gr.addColorStop(0.5, '#8B7CFF'); gr.addColorStop(1, '#FF6B5B'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    const text = new OffscreenCanvas(1200, 1500); { const g = text.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1200, 1500); g.fillStyle = '#222'; g.font = '28px sans-serif'; for (let i = 0; i < 40; i++) g.fillText('Most creators do not have a design problem, they have a time problem ' + i, 40, 60 + i * 34); }
    // a screenshot-like page (title bar, sidebar, buttons, text) saved as a low-quality JPEG: compression artefacts, as a screenshot sent through a chat app
    const page = new OffscreenCanvas(1170, 2532); { const g = page.getContext('2d')!; const r = rnd(5); g.fillStyle = '#f6f6f8'; g.fillRect(0, 0, 1170, 2532); g.fillStyle = '#1d1d1f'; g.fillRect(0, 0, 1170, 160); g.fillStyle = '#6d3be8'; g.fillRect(60, 300, 500, 120); g.fillStyle = '#333'; g.font = '44px sans-serif'; for (let i = 0; i < 30; i++) g.fillText('Row ' + i + ' ' + 'lorem ipsum dolor sit amet'.slice(0, 10 + Math.floor(r() * 16)), 60, 560 + i * 62); }
    // photo-like: smooth light, soft shapes, and sensor-like noise on every pixel
    const photoLike = (w: number, h: number, seed: number, noise: number) => {
      const c = new OffscreenCanvas(w, h); const g = c.getContext('2d')!; const r = rnd(seed);
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9cc7ef'); gr.addColorStop(0.55, '#d8b48a'); gr.addColorStop(1, '#3e5a2c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * h, rad = (0.1 + r() * 0.25) * Math.min(w, h); const rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, `rgba(${Math.round(r() * 255)},${Math.round(r() * 255)},${Math.round(r() * 255)},0.6)`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); }
      const id = g.getImageData(0, 0, w, h); const d = id.data;
      for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 2 * noise; d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n)); }
      g.putImageData(id, 0, 0);
      return c;
    };
    return {
      likes: {
        card: await read(card, 'card.jpg'), gradient: await read(grad, 'gradient.jpg'), textOnWhite: await read(text, 'notes.jpg'),
        pageJpeg60: await read(page, 'IMG_2041.jpg', 'image/jpeg', 0.6), cardPng: await read(card, 'card.png', 'image/png'),
      },
      photos: { a: await read(photoLike(1600, 1200, 11, 14), 'IMG_1.jpg'), b: await read(photoLike(1200, 1600, 12, 20), 'IMG_2.jpg'), c: await read(photoLike(2000, 1000, 13, 10), 'IMG_3.jpg', 'image/jpeg', 0.6) },
      // the same noisy photo, but as a PNG, or named a screenshot: a screenshot by the file rule
      byFile: { png: await read(photoLike(1600, 1200, 11, 14), 'IMG_1.png', 'image/png'), named: await read(photoLike(1600, 1200, 11, 14), 'Screenshot 2026-11-15.jpg') },
      unknown: K.contentOr(undefined),
      empty: K.readContent(new Uint8ClampedArray(0), 0, 0).content,
      rule: K.PHOTO_RULE,
    };
  });
  for (const [k, v] of Object.entries<any>(r.likes)) expect(v.content, `${k}: grain ${v.grain}, top16 ${v.top16} (${v.why})`).toBe('screenshot');
  for (const [k, v] of Object.entries<any>(r.photos)) expect(v.content, `noisy photo-like ${k}: grain ${v.grain}, top16 ${v.top16} (${v.why})`).toBe('photo');
  expect(r.byFile.png.content, 'a PNG is a screenshot').toBe('screenshot');
  expect(r.byFile.png.why).toBe('a PNG');
  expect(r.byFile.named.content, 'a file named "screenshot" is a screenshot').toBe('screenshot');
  expect(r.unknown).toBe('screenshot');
  expect(r.empty).toBe('screenshot');
  expect(r.rule.grainUnsure).toBeLessThan(r.rule.grainPhoto);
});
