// Button alignment (ZERO model calls), measured on the RENDERED pixels: for cta-button, cta-pair and contact-closing (every variant that has a button) in all 15 presets:
//   - the label's visual centre (the middle of the first letter's cap height, from its drawn glyph rows) sits on the button's vertical centre, within 2 px
//   - the arrow's vertical centre sits on it too
//   - the padding left of the label equals the padding right of the arrow, within 2 px (a variant that centres the pair has equal side padding around the pair)
//   - a long (two-line capable) label keeps the arrow clear of the text
// out/cta-fix/buttons.png is a sheet of the closings of style-4, style-6, style-7 and style-8.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(10 * 60_000);
const PRESETS = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
const LABELS = ['Follow for more', 'Book a free call', 'Write to us', 'Send this to a friend'];

export async function measureAll(page: any, presets: string[], labels: string[], idx = 3, tot = 8) {
  return page.evaluate(async ({ presets, labels, idx, tot }: any) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const num = (e: Element, a: string) => Number(e.getAttribute(a) ?? 0);
    const dyOf = (e: Element | null): number => (e && e.nodeType === 1 ? Number(/translate\(\s*[-\d.]+[ ,]+([-\d.]+)/.exec(e.getAttribute('transform') ?? '')?.[1] ?? 0) + dyOf(e.parentElement) : 0);
    const rows: any[] = [];
    const cases: { layout: string; v: 0 | 1; fields: (label: string) => any }[] = [
      { layout: 'cta-button', v: 0, fields: (b) => ({ headline: 'Build the smallest version', button: b }) },
      { layout: 'cta-button', v: 1, fields: (b) => ({ headline: 'Build the smallest version', button: b, sub: 'Twenty people, one week.' }) },
      { layout: 'cta-pair', v: 0, fields: (b) => ({ headline: 'Two ways to join', button1: b, button2: 'See how it works', line1: 'Early backers save.', line2: 'Watch the flip.' }) },
      { layout: 'cta-pair', v: 1, fields: (b) => ({ headline: 'Two ways to join', button1: b, button2: 'See how it works' }) },
      { layout: 'contact-closing', v: 0, fields: (b) => ({ headline: 'Back Quick Flip today', brand: 'Quick Flip', button: b, contacts: ['@quickflip', 'hello@quickflip.com'] }) },
    ];
    for (const p of presets as string[]) {
      const st: any = D.styleFromPack(PR.presetPackFor(p, false)).style;
      for (const c of cases) for (const label of labels as string[]) {
        const b: any = await L.buildSlide(c.layout, c.v, c.fields(label), st, { handle: '@maya.designs', index: idx, total: tot, cut: 'plain' });
        const tag = `${p}/${c.layout}/v${c.v + 1}/${label}`;
        if (!b.ok || !b.svg) { rows.push({ tag, skip: b.errors?.[0] ?? 'not drawn' }); continue; }
        const doc = new DOMParser().parseFromString(b.svg, 'image/svg+xml');
        const bm = await createImageBitmap(await F.svgToPng(b.svg, 1080));
        const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350;
        const g = cv.getContext('2d', { willReadFrequently: true })!; g.drawImage(bm, 0, 0, 1080, 1350);
        const pills = [...doc.querySelectorAll('rect')].filter((e) => { const h = num(e, 'height'), w = num(e, 'width'), rx = num(e, 'rx'); return h >= 100 && h <= 240 && w >= 300 && Math.abs(rx - h / 2) <= 2; });
        // the buttons themselves: a pill carrying the label (not a hard-shadow copy: the one drawn last of two equal boxes)
        const uniq = pills.filter((e, i) => !pills.some((o, j) => j > i && Math.abs(num(o, 'x') - num(e, 'x')) < 16 && Math.abs(num(o, 'y') - num(e, 'y')) < 16 && Math.abs(num(o, 'width') - num(e, 'width')) < 4));
        for (const pill of uniq) {
          const bx = num(pill, 'x'), bw = num(pill, 'width'), bh = num(pill, 'height'), by = num(pill, 'y') + dyOf(pill);
          const sw = num(pill, 'stroke-width');
          const bcy = by + bh / 2;
          const px = (x: number, y: number) => g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
          const bgc = px(bx + bh / 2, by + sw + 8);
          // the region lies wholly INSIDE the pill (its rounded ends curve away from the corners): 25% of the height in from each end, 35% of the height above and below the centre
          const halfH = Math.floor(bh * 0.35);
          const x0 = Math.floor(bx + bh * 0.25), x1 = Math.ceil(bx + bw - bh * 0.25), y0 = Math.floor(bcy - halfH), y1 = Math.ceil(bcy + halfH);
          const w = x1 - x0, h = y1 - y0;
          if (w < 50 || h < 40) continue;
          const d = g.getImageData(x0, y0, w, h).data;
          const ink = (x: number, y: number) => { const k = (y * w + x) * 4; return Math.abs(d[k] - bgc[0]) + Math.abs(d[k + 1] - bgc[1]) + Math.abs(d[k + 2] - bgc[2]) > 140; };
          const colInk = Array.from({ length: w }, (_, x) => { for (let y = 0; y < h; y++) if (ink(x, y)) return true; return false; });
          // clusters of ink columns separated by gaps of 28 px or more (a word space is about 14 px)
          const clusters: [number, number][] = [];
          let s = -1, last = -1;
          for (let x = 0; x < w; x++) if (colInk[x]) { if (s < 0) s = x; else if (x - last > 28) { clusters.push([s, last]); s = x; } last = x; }
          if (s >= 0) clusters.push([s, last]);
          if (!clusters.length) { rows.push({ tag, skip: 'no ink' }); continue; }
          const rowsOf = (a: number, z: number) => { let t = 1e9, bt = -1; for (let y = 0; y < h; y++) for (let x = a; x <= z; x++) if (ink(x, y)) { t = Math.min(t, y); bt = Math.max(bt, y); break; } return [t, bt]; };
          const lab = clusters[0];
          const hasArrow = clusters.length > 1 && clusters[clusters.length - 1][1] - clusters[clusters.length - 1][0] <= 80;
          const arrow = hasArrow ? clusters[clusters.length - 1] : null;
          // the first letter: the first run of ink columns of the label
          let fe = lab[0]; while (fe + 1 <= lab[1] && colInk[fe + 1]) fe++;
          const [ct, cb] = rowsOf(lab[0], fe);
          const [at, ab] = arrow ? rowsOf(arrow[0], arrow[1]) : [0, 0];
          const labelRight = hasArrow ? clusters[clusters.length - 2][1] : lab[1];
          rows.push({ tag, font: st.fonts.headline, bh, bcy, capDy: Number(((y0 + (ct + cb) / 2 + 0.5) - bcy).toFixed(1)), arrowDy: arrow ? Number(((y0 + (at + ab) / 2 + 0.5) - bcy).toFixed(1)) : null, padL: Math.round(x0 + lab[0] - bx), padR: arrow ? Math.round(bx + bw - (x0 + arrow[1] + 1)) : Math.round(bx + bw - (x0 + labelRight + 1)), hasArrow, gap: arrow ? arrow[0] - labelRight : null, filled: !pill.getAttribute('stroke') });
        }
      }
    }
    return rows;
  }, { presets, labels, idx, tot });
}

test('buttons: label centre and arrow centre on the button centre, equal side padding, in all 15 presets', async ({ page }) => {
  await page.goto('/images/carousel');
  const rows: any[] = await measureAll(page, PRESETS, LABELS);
  const ok = rows.filter((r) => !r.skip);
  const byFont: Record<string, number[]> = {};
  for (const r of ok) (byFont[r.font] ??= []).push(r.capDy);
  console.log('BUTTONS ' + ok.length + ' buttons; capDy range per font ' + JSON.stringify(Object.fromEntries(Object.entries(byFont).map(([f, v]) => [f, [Math.min(...v), Math.max(...v)]]))));
  fs.mkdirSync('out/cta-fix', { recursive: true });
  fs.writeFileSync('out/cta-fix/button-measure.json', JSON.stringify(ok, null, 1));
  expect(ok.length).toBeGreaterThan(300);
  const bad: string[] = [];
  for (const r of ok) {
    if (Math.abs(r.capDy) > 2) bad.push(`${r.tag}: the label's cap centre is ${r.capDy} px from the button centre`);
    if (r.hasArrow && Math.abs(r.arrowDy) > 2) bad.push(`${r.tag}: the arrow centre is ${r.arrowDy} px from the button centre`);
    if (r.hasArrow && Math.abs(r.padL - r.padR) > 2) bad.push(`${r.tag}: left padding ${r.padL} px, right padding ${r.padR} px`);
    if (r.hasArrow && r.gap < 12) bad.push(`${r.tag}: the arrow is only ${r.gap} px from the label`);
  }
  expect(bad.slice(0, 15)).toEqual([]);
});

test('sheet: the closings of style-4, style-6, style-7 and style-8 (out/cta-fix/buttons.png)', async ({ page }) => {
  await page.goto('/images/carousel');
  const png = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const cells: [string, string, number, any][] = [];
    for (const [p, label] of [['style-4', 'Book a free call'], ['style-6', 'Follow for more'], ['style-7', 'Write to us'], ['style-8', 'Save this for later']] as [string, string][]) {
      cells.push([p, 'cta-button', 0, { headline: 'Build the smallest version', button: label }]);
      cells.push([p, 'cta-button', 1, { headline: 'Build the smallest version', button: label, sub: 'Twenty people, one week.' }]);
      cells.push([p, 'cta-pair', 0, { headline: 'Two ways to join', button1: label, button2: 'See how it works', line1: 'Early backers save.', line2: 'Watch the flip.' }]);
      cells.push([p, 'contact-closing', 0, { headline: 'Back Quick Flip today', brand: 'Quick Flip', button: label, contacts: ['@quickflip', 'hello@quickflip.com'] }]);
    }
    const bms: ImageBitmap[] = [];
    for (const [p, layout, v, f] of cells) { const st: any = D.styleFromPack(PR.presetPackFor(p, false)).style; const b: any = await L.buildSlide(layout, v as 0 | 1, f, st, { handle: '@maya.designs', index: 7, total: 8, cut: 'plain' }); if (b.ok) bms.push(await createImageBitmap(await F.svgToPng(b.svg, 1080))); }
    const w = 400, h = 500, cols = 4;
    const c = document.createElement('canvas'); c.width = cols * (w + 10) + 10; c.height = Math.ceil(bms.length / cols) * (h + 10) + 10;
    const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
    bms.forEach((u, i) => g.drawImage(u, 10 + (i % cols) * (w + 10), 10 + Math.floor(i / cols) * (h + 10), w, h));
    return { png: c.toDataURL('image/png').split(',')[1], n: bms.length };
  });
  fs.mkdirSync('out/cta-fix', { recursive: true });
  fs.writeFileSync('out/cta-fix/buttons.png', Buffer.from(png.png, 'base64'));
  expect(png.n).toBe(16);
});
