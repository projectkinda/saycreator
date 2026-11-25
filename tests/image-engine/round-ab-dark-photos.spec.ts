// Round AB: dark photos are photos (src/carousel/pictureKind.ts). Flat near-black areas have no grain and pack into a few colour buckets, so a dark photo read as a screenshot; the picture is
// now also read leaving out its flat near-black pixels (litGrain >= 0.62 and litTop16 < 0.90: a photo). Every reading goes through the app's own photoLibrary.prepare(file, 'photo').
//   AB1 the real pictures (skipped when they are not on this computer): every ground-truth photo is a photo, every true screenshot stays one, the unsure feed screenshot stays one.
//   AB2 pictures made at test time (always runs): a dark photo is a photo; a dark-mode screenshot, an all-black picture, a dark photo as PNG or named "screenshot" stay screenshots.
//   AB3 the person's chip still wins: a dark photo shows "Photo" and switches to "Screenshot"; a dark-mode screenshot shows "Screenshot" and switches to "Photo".
// ZERO writer calls.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(5 * 60_000);
const DIR = process.env.REAL_PICTURES_DIR ?? 'out/test-pictures';
const EVENT = path.join(DIR, 'event');
const SWP = 'out/round-n/swp';

let writes = 0;
test.beforeEach(async ({ page }) => {
  writes = 0;
  page.on('request', (r) => { if (/\/(__carousel|api\/carousel)\/write/.test(r.url())) writes++; });
  await page.goto('/images/carousel');
});
test.afterEach(() => expect(writes, 'writer calls').toBe(0));

async function readFile(page: Page, p: string) {
  const name = path.basename(p);
  const b64 = fs.readFileSync(p).toString('base64');
  return page.evaluate(async ({ b64, name }) => {
    const PL: any = await import('/src/carousel/photoLibrary.ts');
    const type = /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
    const blob = await (await fetch(`data:${type};base64,${b64}`)).blob();
    return (await PL.prepare(new File([blob], name, { type }), 'photo')).reading;
  }, { b64, name });
}

/** In the page: canvases made at test time, as files. */
const MAKE = `window.__AB = (() => {
  const rnd = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  // a dark photo: a flat black arch over the top 45%, a lit scene with sensor noise below
  const darkPhoto = () => {
    const w = 1200, h = 1500, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const r = rnd(7);
    const gr = g.createLinearGradient(0, h * 0.45, 0, h); gr.addColorStop(0, '#4f86c6'); gr.addColorStop(0.5, '#c89a6a'); gr.addColorStop(1, '#2d3b22'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { const x = r() * w, y = h * 0.45 + r() * h * 0.55, rad = (0.08 + r() * 0.2) * w; const rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, 'rgba(' + Math.round(r() * 255) + ',' + Math.round(r() * 255) + ',' + Math.round(r() * 255) + ',0.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); }
    const id = g.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 16; for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, d[i + k] + n)); }
    g.putImageData(id, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h * 0.45); g.beginPath(); g.ellipse(w / 2, h * 0.45, w * 0.42, h * 0.12, 0, Math.PI, 0, true); g.fill();
    return c;
  };
  // a dark-mode screen: black background, grey rows of text, a purple button, a card
  const darkShot = () => {
    const w = 1170, h = 2532, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const r = rnd(3);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#1c1c1e'; g.fillRect(40, 300, w - 80, 700); g.fillStyle = '#7c4dff'; g.fillRect(60, 1100, 520, 130);
    g.fillStyle = '#d0d0d0'; g.font = '44px sans-serif'; for (let i = 0; i < 22; i++) g.fillText('Row ' + i + ' ' + 'lorem ipsum dolor sit amet consectetur'.slice(0, 12 + Math.floor(r() * 24)), 60, 1320 + i * 52);
    g.fillStyle = '#fff'; g.font = 'bold 72px sans-serif'; g.fillText('Library', 60, 200);
    return c;
  };
  const black = () => { const c = document.createElement('canvas'); c.width = 1200; c.height = 1500; const g = c.getContext('2d'); g.fillStyle = '#050505'; g.fillRect(0, 0, 1200, 1500); return c; };
  const blob = (c, type, q) => new Promise((res) => c.toBlob((b) => res(b), type, q));
  const b64 = async (b) => { const u = new Uint8Array(await b.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t); };
  return { darkPhoto, darkShot, black, blob, b64 };
})();`;

test('AB1 the real pictures: every ground-truth photo is a photo (the 4 dark ones by their lit grain), every true screenshot stays a screenshot, the unsure feed screenshot stays one', async ({ page }) => {
  test.skip(!fs.existsSync(EVENT), `${EVENT} is not on this computer (the real pictures are kept on the developer's computer, not in git)`);
  const labels: Record<string, string> = fs.existsSync(path.join(DIR, 'labels.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'labels.json'), 'utf8')) : {};
  const photos = [
    ...fs.readdirSync(EVENT).filter((f) => /unsplash|^event photo \d+\./i.test(f) || /11\.30\.43 AM\.jpe?g$/.test(f)).map((f) => path.join(EVENT, f)),
    ...Object.keys(labels).filter((f) => labels[f] === 'photo').map((f) => path.join(DIR, f)),
  ].filter((p) => fs.existsSync(p));
  const shots = [
    ...Object.keys(labels).filter((f) => labels[f] !== 'photo').map((f) => path.join(DIR, f)),
    ...['WhatsApp Image 2026-10-27 at 11.30.44 AM.jpeg', 'WhatsApp Image 2026-10-27 at 11.30.44 AM (1).jpeg'].map((f) => path.join(EVENT, f)),
    ...(fs.existsSync(SWP) ? fs.readdirSync(SWP).filter((f) => /\.(png|jpe?g)$/i.test(f)).map((f) => path.join(SWP, f)) : []),
  ].filter((p) => fs.existsSync(p));
  const bad: string[] = [];
  const dark: Record<string, string> = {};
  for (const p of photos) {
    const r = await readFile(page, p);
    if (r?.content !== 'photo') bad.push(`photo read as ${r?.content}: ${path.basename(p)} grain ${r?.grain} top16 ${r?.top16} lit ${r?.litGrain}/${r?.litTop16}`);
    if (/bruno-bd|emanuel-haas|hendrik-morkel|julien-pWG/.test(p)) dark[path.basename(p).split('-')[0]] = r?.why;
  }
  for (const p of shots) {
    const r = await readFile(page, p);
    if (r?.content !== 'screenshot') bad.push(`screenshot read as ${r?.content}: ${path.basename(p)} grain ${r?.grain} top16 ${r?.top16} lit ${r?.litGrain}/${r?.litTop16}`);
  }
  expect(photos.length).toBeGreaterThanOrEqual(30);
  expect(shots.length).toBeGreaterThanOrEqual(30);
  expect(bad).toEqual([]);
  for (const k of ['bruno', 'emanuel', 'hendrik', 'julien']) expect(dark[k], k).toBe('camera grain outside its dark parts');
  const feed = path.join(SWP, 'mock-feed-phone.jpg');
  if (fs.existsSync(feed)) {
    const r = await readFile(page, feed);
    expect(r.content).toBe('screenshot');
    expect(r.unsure).toBe(true);
  }
});

test('AB2 pictures made at test time: a dark photo is a photo; a dark-mode screenshot, an all-black picture, and a dark photo as a PNG or named "screenshot" stay screenshots', async ({ page }) => {
  await page.evaluate(MAKE);
  const r: any = await page.evaluate(async () => {
    const AB = (window as any).__AB; const PL: any = await import('/src/carousel/photoLibrary.ts'); const K: any = await import('/src/carousel/pictureKind.ts');
    const read = async (c: HTMLCanvasElement, name: string, type = 'image/jpeg', q = 0.9) => (await PL.prepare(new File([await AB.blob(c, type, q)], name, { type }), 'photo')).reading;
    const dp = AB.darkPhoto();
    return {
      photo: await read(dp, 'arch.jpg'),
      shot: await read(AB.darkShot(), 'library.jpg', 'image/jpeg', 0.8),
      black: await read(AB.black(), 'black.jpg'),
      png: await read(dp, 'arch.png', 'image/png'),
      named: await read(dp, 'arch screenshot.jpg'),
      rule: K.PHOTO_RULE,
    };
  });
  // the dark photo: the old reading alone says screenshot, the lit reading says photo
  expect(r.photo.content, JSON.stringify(r.photo)).toBe('photo');
  expect(r.photo.why).toBe('camera grain outside its dark parts');
  expect(r.photo.grain >= r.rule.grainPhoto && r.photo.top16 < r.rule.top16Max, JSON.stringify(r.photo)).toBe(false);
  for (const k of ['shot', 'black', 'png', 'named']) expect(r[k].content, `${k} ${JSON.stringify(r[k])}`).toBe('screenshot');
  // the dark-mode screen is far from the line, not near it
  expect(r.shot.litGrain, JSON.stringify(r.shot)).toBeLessThan(r.rule.litGrainPhoto - 0.1);
  expect(r.png.why).toBe('a PNG');
  expect(r.named.why).toBe('named a screenshot');
});

test('AB3 the person\'s Photo/Screenshot chip still wins over the reading, for a dark photo and a dark-mode screenshot', async ({ page }) => {
  await page.evaluate(MAKE);
  const mk = async (kind: string) => page.evaluate(async (kind) => { const AB = (window as any).__AB; return AB.b64(await AB.blob(kind === 'photo' ? AB.darkPhoto() : AB.darkShot(), 'image/jpeg', 0.9)); }, kind);
  const photo = Buffer.from(await mk('photo'), 'base64');
  const shot = Buffer.from(await mk('shot'), 'base64');
  await page.getByLabel('Choose images for the slides').setInputFiles([{ name: 'arch.jpg', mimeType: 'image/jpeg', buffer: photo }, { name: 'library.jpg', mimeType: 'image/jpeg', buffer: shot }]);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(2, { timeout: 60_000 });
  const chip0 = page.getByTestId('image-0-content');
  const chip1 = page.getByTestId('image-1-content');
  await expect(chip0).toHaveText('Photo');
  await expect(chip1).toHaveText('Screenshot');
  await chip0.click();
  await expect(chip0).toHaveText('Screenshot');
  await chip1.click();
  await expect(chip1).toHaveText('Photo');
});
