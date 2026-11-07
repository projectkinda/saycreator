// Samples colours from the rendered style sources (out/styles-src): per slide, background (median of the four edge strips) and the 5 most common colours (quantised to 16 levels, counted by area).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('about:blank');
const res = {};
for (let n = 1; n <= 8; n++) {
  const dir = path.resolve(`out/styles-src/style-${n}`);
  res[n] = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.png$/.test(x)).sort((a, b) => parseInt(a) - parseInt(b))) {
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    res[n].push(await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const hex = (r, gg, b) => '#' + [r, gg, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      const counts = new Map();
      for (let i = 0; i < d.length; i += 4) { const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4); const e = counts.get(k) ?? [0, 0, 0, 0]; e[0]++; e[1] += d[i]; e[2] += d[i + 1]; e[3] += d[i + 2]; counts.set(k, e); }
      const top = [...counts.values()].sort((a, b) => b[0] - a[0]).slice(0, 6).map((e) => ({ hex: hex(Math.round(e[1] / e[0]), Math.round(e[2] / e[0]), Math.round(e[3] / e[0])), pct: Math.round((e[0] / (d.length / 4)) * 1000) / 10 }));
      const px = (x, y) => { const i = (y * c.width + x) * 4; return hex(d[i], d[i + 1], d[i + 2]); };
      return { corners: [px(3, 3), px(c.width - 4, 3), px(3, c.height - 4), px(c.width - 4, c.height - 4), px(c.width >> 1, 3)], top };
    }, b64));
  }
}
fs.writeFileSync('out/styles-src/palettes.json', JSON.stringify(res, null, 1));
for (const n in res) { console.log('STYLE', n); res[n].forEach((s, i) => console.log(' ', i + 1, 'edge', s.corners.join(' '), '|', s.top.map((t) => `${t.hex} ${t.pct}%`).join(' '))); }
await browser.close();
