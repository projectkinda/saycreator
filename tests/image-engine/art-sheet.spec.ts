// The art library: every extracted item drawn in two palettes (proof that the recolour works) -> out/art-inventory/sheet.png; the files themselves are clean (no text, no picture, only tokens).
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(5 * 60_000);
const OUT = path.resolve(process.cwd(), 'out/art-inventory');
const ART = path.resolve(process.cwd(), 'src/image-engine/art');

test('the art files: clean vector only, tokens only, an index entry for each file and a file for each entry', async () => {
  const index = JSON.parse(fs.readFileSync(path.join(ART, 'index.json'), 'utf8')) as { name: string; pack: string; file: string; tokens: string[]; role: string; bbox: { w: number; h: number } }[];
  expect(index.length).toBeGreaterThanOrEqual(25);
  const onDisk = fs.readdirSync(ART, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => fs.readdirSync(path.join(ART, d.name)).filter((f) => f.endsWith('.svg')).map((f) => `${d.name}/${f}`));
  expect([...onDisk].sort()).toEqual(index.map((i) => i.file).sort());
  for (const it of index) {
    const svg = fs.readFileSync(path.join(ART, it.file), 'utf8');
    expect(svg, `${it.file}: no raster, text, script or filter`).not.toMatch(/<image|<text|<script|<foreignObject|<filter|data:image|href=/i);
    expect(svg.length, `${it.file}: small`).toBeLessThan(40_000);
    // colours are tokens (or none), never a literal colour
    const lits = [...svg.matchAll(/\b(?:fill|stroke|stop-color)="([^"$][^"]*)"/g)].map((m) => m[1]).filter((v) => !/^(none|currentColor)$/.test(v) && !/^url\(/.test(v));
    expect(lits, `${it.file}: colours are palette tokens`).toEqual([]);
    expect(['corner', 'divider', 'frame', 'sticker', 'badge', 'background']).toContain(it.role);
    expect(it.tokens.length, `${it.file}: lists the tokens it uses`).toBeGreaterThan(0);
    for (const t of it.tokens) expect(['primary', 'accent', 'ink', 'surface', 'bg']).toContain(t);
    expect(svg).toMatch(new RegExp(`viewBox="0 0 ${it.bbox.w} ${it.bbox.h}"`));
  }
});

test('sheet: out/art-inventory/sheet.png: every item in two palettes', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/images/carousel');
  const png = await page.evaluate(async () => {
    const A = await import('/src/image-engine/art/art.ts');
    const palettes = [
      { name: 'A: pack ground', bg: (p: string) => ({ 'style-1': '#FAFAFA', 'style-2': '#F76718', 'style-3': '#FFF9F1', 'style-4': '#2A06E0', 'style-5': '#FFFFFF', 'style-7': '#FFFFFF', 'style-8': '#000000' } as Record<string, string>)[p] ?? '#FFFFFF', pal: (p: string) => ({ 'style-1': { primary: '#C9A227', accent: '#F2FF35', ink: '#0A0A0A', surface: '#F1EEE3', bg: '#FAFAFA' }, 'style-2': { primary: '#FFFFFF', accent: '#FFFFFF', ink: '#FFFFFF', surface: '#FF8238', bg: '#F76718' }, 'style-3': { primary: '#0A0A0A', accent: '#0A0A0A', ink: '#0A0A0A', surface: '#F2E9DB', bg: '#FFF9F1' }, 'style-4': { primary: '#FFFFFF', accent: '#FFFFFF', ink: '#FFFFFF', surface: '#4626E4', bg: '#2A06E0' }, 'style-5': { primary: '#16694B', accent: '#16694B', ink: '#00225B', surface: '#E3F0EA', bg: '#FFFFFF' }, 'style-7': { primary: '#CC2B6E', accent: '#CC2B6E', ink: '#2A2A2A', surface: '#FBE9F1', bg: '#FFFFFF' }, 'style-8': { primary: '#DA88F4', accent: '#DA88F4', ink: '#FFFFFF', surface: '#161616', bg: '#000000' } } as Record<string, any>)[p] },
      { name: 'B: other palette', bg: () => '#10251C', pal: () => ({ primary: '#F5C842', accent: '#E8744F', ink: '#F4EFE2', surface: '#1E4033', bg: '#10251C' }) },
    ];
    const T = 150;
    const cell = (it: any, pi: number) => {
      const P = palettes[pi];
      const s = Math.min(T - 14, 1) * 0 + Math.min((T - 14) / it.bbox.w, (T - 28) / it.bbox.h);
      const w = Math.max(6, it.bbox.w * s);
      const mk = A.artMarkup(it, 4, 18, w, P.pal(it.pack), `s${it.pack}${it.name}${pi}`.replace(/\W/g, ''));
      return `<div style="width:${T}px;height:${T}px;float:left;margin:2px;background:${P.bg(it.pack)};position:relative;overflow:hidden"><svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" style="position:absolute;left:0;top:0">${mk}</svg><span style="position:absolute;left:3px;top:1px;font:10px sans-serif;color:${pi ? '#ddd' : '#fff'};background:rgba(0,0,0,.55);padding:0 2px">${it.pack.slice(6)}/${it.name} ${it.bbox.w}x${it.bbox.h}</span></div>`;
    };
    const items = A.ART_INDEX;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1560px;background:#666;z-index:99999;padding:4px';
    host.innerHTML = items.map((it: any) => cell(it, 0) + cell(it, 1)).join('');
    document.body.appendChild(host);
    return items.length;
  });
  expect(png).toBeGreaterThan(20);
  const el = page.locator('body > div').last();
  await el.screenshot({ path: path.join(OUT, 'sheet.png') });
});
