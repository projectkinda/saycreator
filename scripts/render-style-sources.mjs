// Renders REFS/Styles/Style N/n.svg (1080x1350 Figma exports, some 13-49 MB) with headless Chromium at scale 0.5 to out/styles-src/style-N/n.png,
// plus a contact sheet per style. Source images are for LOOKING at (palette, mood, rhythm); nothing from them is copied into the app.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = path.resolve('REFS/Styles');
const OUT = path.resolve('out/styles-src');
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 0.5 });
const page = await ctx.newPage();
page.setDefaultTimeout(180_000);
for (let n = 1; n <= 8; n++) {
  const dir = path.join(SRC, `Style ${n}`);
  const out = path.join(OUT, `style-${n}`);
  fs.mkdirSync(out, { recursive: true });
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort((a, b) => parseInt(a) - parseInt(b));
  for (const f of files) {
    const html = path.join(out, '_t.html');
    fs.writeFileSync(html, `<!doctype html><body style="margin:0;background:#888"><img id=i src="${pathToFileURL(path.join(dir, f)).href}" width=1080 height=1350 style="display:block">`);
    await page.goto(pathToFileURL(html).href);
    await page.waitForFunction(() => { const i = document.getElementById('i'); return i.complete && i.naturalWidth > 0; });
    await page.screenshot({ path: path.join(out, f.replace('.svg', '.png')), clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    fs.unlinkSync(html);
  }
  // contact sheet
  const pngs = files.map((f) => f.replace('.svg', '.png'));
  const w = 270;
  const sheet = path.join(out, '_c.html');
  fs.writeFileSync(sheet, `<!doctype html><body style="margin:0;background:#777;padding:8px;display:flex;gap:8px;width:${pngs.length * (w + 8) + 8}px">${pngs.map((p) => `<img src="${pathToFileURL(path.join(out, p)).href}" width=${w} height=${Math.round(w * 1.25)}>`).join('')}`);
  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: pngs.length * (w + 8) + 8, height: Math.ceil(w * 1.25 + 16) });
  await p2.goto(pathToFileURL(sheet).href);
  await p2.waitForLoadState('load');
  await p2.screenshot({ path: path.join(out, 'contact.png') });
  await p2.close();
  fs.unlinkSync(sheet);
  console.log('style', n, pngs.length, 'slides');
}
await browser.close();
