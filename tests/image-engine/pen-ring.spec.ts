// Pen ring (ZERO model calls). On the rendered pixels:
//   - the ring (or the underline that stands in for it) keeps at least 10 px clear of the glyph pixels of its own accent word and never crosses them
//   - it keeps at least 14 px clear of ALL OTHER text on the slide (the other words of the headline, the body, the chrome)
// The ring alone = the slide without any text, minus the same slide without the ring. The other text = the ring-less slide's text pixels that are not the accent word's glyphs.
// A slide where a ring would touch other text falls back: a smaller ring, then an underline, then nothing (the accent colour alone); never a ring that touches other text.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(10 * 60_000);

const EXTRA = [
  { layout: 'statement', fields: { headline: 'Job or freelance? Both have a cost', caption: 'The honest comparison' }, accents: ['cost'] },
  { layout: 'statement-card', fields: { headline: 'One assumption must hold for this to work.' }, accents: ['must hold'] },
  { layout: 'statement', fields: { headline: 'Decide which habits fit you' }, accents: ['habits'] },
];
// 8 headlines, the accent word in different places
const STRESS = [
  { why: 'start of a line', layout: 'statement', fields: { headline: 'Not enough users will pay for it', caption: 'Check before you build' }, accents: ['Not enough'] },
  { why: 'end of a line', layout: 'statement', fields: { headline: 'Most apps fail because of the habit loop', caption: 'Look closer' }, accents: ['habit loop'] },
  { why: 'wrapped over two lines', layout: 'statement', fields: { headline: 'Build the smallest version that tests the idea' }, accents: ['smallest version that tests'] },
  { why: 'directly under another line', layout: 'split-text', fields: { headline: 'The one assumption that must hold', paragraph: 'Everything else can change.' }, accents: ['must hold'] },
  { why: 'after descenders of the line above', layout: 'statement', fields: { headline: 'Knowing why you procrastinate is not enough', caption: 'Three flaws, one test' }, accents: ['not enough'] },
  { why: 'middle of a line', layout: 'statement', fields: { headline: 'Decide which habits fit you', caption: 'Then test one' }, accents: ['habits'] },
  { why: 'long phrase at the end', layout: 'statement', fields: { headline: 'Pay for the tools that pay you back' }, accents: ['pay you back'] },
  { why: 'directly above another line', layout: 'statement', fields: { headline: 'Quick wins beat big plans every single time', caption: 'Start small' }, accents: ['Quick wins'] },
];

test('style-7 pen ring: 10 px from its own word, 14 px from all other text, never touching', async ({ page }) => {
  const rep = fs.existsSync('reports/style-7.json') ? JSON.parse(fs.readFileSync('reports/style-7.json', 'utf8')) : null;
  const fromReport = rep ? rep.designed.library.plan.specs.filter((s: any) => s.accents?.length).map((s: any) => ({ why: 'report', layout: s.layout, fields: s.fields, accents: s.accents })) : [];
  await page.goto('/images/carousel');
  const rows = await page.evaluate(async (SPECS: any[]) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const st: any = D.styleFromPack(PR.presetPackFor('style-7', false)).style;
    const st0: any = { ...st, deco: { ...st.deco, penCircle: false } };
    const W = 1080, H = 1350;
    const px = async (svg: string) => { const bm = await createImageBitmap(await F.svgToPng(svg, W)); const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(bm, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
    const noText = (svg: string) => svg.replace(/<text\b[\s\S]*?<\/text>/g, '');
    const diff = (p: Uint8ClampedArray, q: Uint8ClampedArray, k: number) => Math.abs(p[k] - q[k]) + Math.abs(p[k + 1] - q[k + 1]) + Math.abs(p[k + 2] - q[k + 2]);
    const out: any[] = [];
    for (const [i, spec] of SPECS.entries()) {
      const o = { handle: '@x', index: 1, total: 8, cut: 'plain' as const, invert: false as const, density: 'normal' as const };
      const sp = { layout: spec.layout, fields: spec.fields, accents: spec.accents } as any;
      const a: any = (await D.drawOne(sp, 0, st, o)).built;
      const b: any = (await D.drawOne(sp, 0, st0, o)).built;
      const tag = `${i + 1}:${spec.why ?? ''} ${spec.layout} "${spec.accents.join(' / ')}"`;
      if (!a || !b) { out.push({ tag, kind: 'not drawn' }); continue; }
      const dev = (a.devices ?? []).find((d: any) => d.id === 'pen-circle' || d.id === 'pen-underline');
      if (!dev) { out.push({ tag, kind: 'none', notes: (a.notes as string[]).filter((n) => n.startsWith('Pen ring')) }); continue; }
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-9999px;top:0;width:1080px;height:1350px;visibility:hidden';
      host.appendChild(document.importNode(new DOMParser().parseFromString(b.svg, 'image/svg+xml').documentElement, true));
      document.body.appendChild(host);
      const words: { x: number; y: number; w: number; h: number; rgb: number[] }[] = [];
      host.querySelectorAll('text[data-role="title"] tspan[fill]').forEach((t: any) => { try { const bb = t.getBBox(); const hx = String(t.getAttribute('fill')); words.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height, rgb: /^#[0-9a-f]{6}$/i.test(hx) ? [1, 3, 5].map((k) => parseInt(hx.slice(k, k + 2), 16)) : [-1, -1, -1] }); } catch { /* not measurable */ } });
      host.remove();
      const empty = await px(noText(b.svg)), ringOnly = await px(noText(a.svg)), allText = await px(b.svg);
      // accent glyph pixels (accent colour inside the accent word boxes) and all the other text pixels
      const glyph = new Uint8Array(W * H), other = new Uint8Array(W * H);
      let glyphN = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 4; if (diff(allText, empty, k) > 90) other[y * W + x] = 1; }
      for (const w of words) for (let y = Math.max(0, Math.floor(w.y) - 2); y < Math.min(H, Math.ceil(w.y + w.h) + 2); y++) for (let x = Math.max(0, Math.floor(w.x) - 2); x < Math.min(W, Math.ceil(w.x + w.w) + 2); x++) {
        const k = (y * W + x) * 4;
        if (other[y * W + x] && Math.abs(allText[k] - w.rgb[0]) + Math.abs(allText[k + 1] - w.rgb[1]) + Math.abs(allText[k + 2] - w.rgb[2]) < 120) { glyph[y * W + x] = 1; other[y * W + x] = 0; glyphN++; }
      }
      // the anti-aliased fringe of the accent glyphs is not "other text": pixels within 2 px of a glyph pixel are skipped
      const fringe = (x: number, y: number) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W && glyph[yy * W + xx]) return true; } return false; };
      const R = { x0: Math.max(0, Math.floor(dev.box.x) - 40), x1: Math.min(W, Math.ceil(dev.box.x + dev.box.w) + 40), y0: Math.max(0, Math.floor(dev.box.y) - 40), y1: Math.min(H, Math.ceil(dev.box.y + dev.box.h) + 40) };
      let ringN = 0, minGlyph = 99, minOther = 99;
      const search = (mask: Uint8Array, x: number, y: number, cap: number, skipFringe: boolean) => {
        for (let r = 0; r < cap; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= H || xx < 0 || xx >= W || !mask[yy * W + xx]) continue;
          if (skipFringe && fringe(xx, yy)) continue;
          return r;
        }
        return cap;
      };
      for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {
        if (diff(ringOnly, empty, (y * W + x) * 4) <= 90) continue;
        ringN++;
        minGlyph = Math.min(minGlyph, search(glyph, x, y, Math.min(minGlyph, 16), false));
        minOther = Math.min(minOther, search(other, x, y, Math.min(minOther, 16), true));
      }
      out.push({ tag, kind: dev.id === 'pen-circle' ? 'ring' : 'underline', ringN, glyphN, words: words.length, minGlyph, minOther, notes: (a.notes as string[]).filter((n) => n.startsWith('Pen ring')) });
    }
    return out;
  }, [...STRESS, ...EXTRA.map((e) => ({ why: 'extra', ...e })), ...fromReport]);
  console.log('RING ' + JSON.stringify(rows.map((r: any) => (r.ringN === undefined ? `${r.tag}: ${r.kind}${r.notes?.length ? ' [' + r.notes.join(' ') + ']' : ''}` : `${r.tag}: ${r.kind}, own word ${r.minGlyph >= 16 ? '16+' : r.minGlyph} px, other text ${r.minOther >= 16 ? '16+' : r.minOther} px${r.notes.length ? ' [' + r.notes.join(' ') + ']' : ''}`))));
  fs.mkdirSync('out/ring-fix', { recursive: true });
  fs.writeFileSync('out/ring-fix/ring-clearance.json', JSON.stringify(rows, null, 1));
  const drawn = rows.filter((r: any) => r.ringN !== undefined);
  expect(rows.slice(0, STRESS.length).filter((r: any) => r.kind !== 'not drawn').length, 'the 8 stress headlines were drawn').toBe(STRESS.length);
  expect(drawn.length, 'slides with a ring or an underline were measured').toBeGreaterThanOrEqual(4);
  for (const r of drawn) {
    expect(r.glyphN, `${r.tag}: the word's glyphs were found`).toBeGreaterThan(100);
    expect(r.ringN, `${r.tag}: the ${r.kind} was found`).toBeGreaterThan(100);
    expect.soft(r.minGlyph, `${r.tag}: ${r.kind} keeps 10 px clear of its own word`).toBeGreaterThanOrEqual(r.kind === 'ring' ? 10 : 9);
    expect.soft(r.minOther, `${r.tag}: ${r.kind} keeps 14 px clear of every other text`).toBeGreaterThanOrEqual(14);
  }
});

test('sheet: the 8 stress headlines with their rings (out/ring-fix/ring-stress.png)', async ({ page }) => {
  await page.goto('/images/carousel');
  const png = await page.evaluate(async (STRESS: any[]) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const st: any = D.styleFromPack(PR.presetPackFor('style-7', false)).style;
    const o = { handle: '@x', index: 1, total: 8, cut: 'plain' as const, invert: false as const, density: 'normal' as const };
    const bms: ImageBitmap[] = [];
    for (const s of STRESS) { const a: any = (await D.drawOne({ layout: s.layout, fields: s.fields, accents: s.accents } as any, 0, st, o)).built; if (a) bms.push(await createImageBitmap(await F.svgToPng(a.svg, 1080))); }
    const w = 450, h = 563, cols = 4;
    const c = document.createElement('canvas'); c.width = cols * (w + 10) + 10; c.height = Math.ceil(bms.length / cols) * (h + 10) + 10;
    const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
    bms.forEach((u, i) => g.drawImage(u, 10 + (i % cols) * (w + 10), 10 + Math.floor(i / cols) * (h + 10), w, h));
    return { png: c.toDataURL('image/png').split(',')[1], n: bms.length };
  }, STRESS);
  fs.mkdirSync('out/ring-fix', { recursive: true });
  fs.writeFileSync('out/ring-fix/ring-stress.png', Buffer.from(png.png, 'base64'));
  expect(png.n).toBe(STRESS.length);
});
