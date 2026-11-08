// Connector lines (ZERO model calls): a rail / connector runs only BETWEEN markers (about 6 px clear of each), never through a marker, never above the first or below the last.
//   1. audit: across every layout x variant x sample x preset no line crosses a hollow / ringed marker
//   2. pixels: for the layouts that draw a connector with markers (stepper, timeline), 5 presets, both variants, 3 lengths: the inside of every marker is identical with and without the
//      connector (so no connector-coloured pixel is inside a marker), and the connector stays between the first and the last marker
//   3. the gallery thumbnail is drawn by the same code (drawOne -> buildSlide): its connector is the same
//   4. sheet: out/connector-fix/sheet.png
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(10 * 60_000);
const PRESETS = ['dark-quiet', 'hot-flat', 'style-1', 'style-4', 'style-7'];
const AFFECTED: [string, 0 | 1][] = [['stepper', 0], ['stepper', 1], ['timeline', 0], ['timeline', 1]];

test('audit: no line or rail crosses a hollow or ringed marker in any layout', async ({ page }) => {
  await page.goto('/images/carousel');
  const hits = await page.evaluate(async (PRESETS) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const out: string[] = [];
    let built = 0;
    for (const id of L.LAYOUT_IDS) {
      const def = L.layoutDef(id)!;
      for (const p of PRESETS) {
        const st = D.styleFromPack(PR.presetPackFor(p, false)).style;
        for (const v of [0, 1] as const) for (const len of ['short', 'normal', 'long']) {
          const b: any = await L.buildSlide(id, v, (def.samples as any)[len], st, { handle: '@x', index: 2, total: 8, cut: 'plain' });
          if (!b?.ok || !b.svg) continue;
          built++;
          const doc = new DOMParser().parseFromString(b.svg, 'image/svg+xml');
          const num = (e: Element, a: string) => Number(e.getAttribute(a) ?? 0);
          const lines: any[] = [];
          doc.querySelectorAll('line').forEach((e) => { const sw = num(e, 'stroke-width') || 1; lines.push({ x0: Math.min(num(e, 'x1'), num(e, 'x2')) - sw / 2, x1: Math.max(num(e, 'x1'), num(e, 'x2')) + sw / 2, y0: Math.min(num(e, 'y1'), num(e, 'y2')), y1: Math.max(num(e, 'y1'), num(e, 'y2')) }); });
          doc.querySelectorAll('rect').forEach((e) => { const w = num(e, 'width'), h = num(e, 'height'); if (!e.getAttribute('stroke') && ((w <= 8 && h >= 80) || (h <= 8 && w >= 80))) lines.push({ x0: num(e, 'x'), y0: num(e, 'y'), x1: num(e, 'x') + w, y1: num(e, 'y') + h }); });
          doc.querySelectorAll('circle').forEach((e) => {
            const rr = num(e, 'r'); const fill = e.getAttribute('fill') ?? '';
            if (rr < 10 || !(fill === 'none' || fill === 'transparent' || e.getAttribute('stroke'))) return;
            const cx = num(e, 'cx'), cy = num(e, 'cy');
            for (const l of lines) if (l.x0 <= cx + rr * 0.6 && l.x1 >= cx - rr * 0.6 && l.y0 < cy + rr * 0.7 && l.y1 > cy - rr * 0.7 && l.x1 - l.x0 < rr) out.push(`${id}/v${v + 1}/${p}/${len}: a line y ${Math.round(l.y0)}..${Math.round(l.y1)} crosses the marker at y ${Math.round(cy - rr)}..${Math.round(cy + rr)}`);
          });
        }
      }
    }
    return { out, built };
  }, PRESETS);
  expect(hits.built).toBeGreaterThan(400);
  expect(hits.out.slice(0, 10)).toEqual([]);
});

async function renderAffected(page: any) {
  return page.evaluate(async ({ PRESETS, AFFECTED }: any) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const num = (e: Element, a: string) => Number(e.getAttribute(a) ?? 0);
    const dy = (e: Element | null): number => (e && e.nodeType === 1 ? Number(/translate\(\s*[-\d.]+[ ,]+([-\d.]+)/.exec(e.getAttribute('transform') ?? '')?.[1] ?? 0) + dy(e.parentElement) : 0); // the engine shifts a shape (or its group) with translate(0 n)
    const isRail = (e: Element) => e.tagName === 'line' || (e.tagName === 'rect' && !e.getAttribute('stroke') && ((num(e, 'width') <= 8 && num(e, 'height') >= 12) || (num(e, 'height') <= 8 && num(e, 'width') >= 40)));
    const px = async (svg: string) => { const bm = await createImageBitmap(await F.svgToPng(svg, 1080)); const c = document.createElement('canvas'); c.width = 1080; c.height = Math.round(1080 * bm.height / bm.width); const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(bm, 0, 0); return { g, c }; };
    const rows: any[] = [];
    for (const [id, v] of AFFECTED as [string, 0 | 1][]) {
      const def = L.layoutDef(id)!;
      for (const p of PRESETS as string[]) {
        const st = D.styleFromPack(PR.presetPackFor(p, false)).style;
        for (const len of ['short', 'normal', 'long']) {
          const b: any = await L.buildSlide(id, v, (def.samples as any)[len], st, { handle: '@x', index: 2, total: 8, cut: 'plain' });
          const tag = `${id}/v${v + 1}/${p}/${len}`;
          if (!b?.ok) { rows.push({ tag, err: b?.errors?.[0] ?? 'not drawn' }); continue; }
          const doc = new DOMParser().parseFromString(b.svg, 'image/svg+xml');
          const rails: { y0: number; y1: number }[] = [];
          const markers: { cx: number; cy: number; r: number; out: number }[] = [];
          doc.querySelectorAll('line,rect').forEach((e) => { if (isRail(e)) { rails.push(e.tagName === 'line' ? { y0: Math.min(num(e, 'y1'), num(e, 'y2')) + dy(e), y1: Math.max(num(e, 'y1'), num(e, 'y2')) + dy(e) } : { y0: num(e, 'y') + dy(e), y1: num(e, 'y') + num(e, 'height') + dy(e) }); } });
          doc.querySelectorAll('circle').forEach((e) => { const r = num(e, 'r'); if (r >= (id === 'stepper' ? 20 : 10) && r < 90) { const m = { cx: num(e, 'cx'), cy: num(e, 'cy') + dy(e), r, out: r + (num(e, 'stroke-width') || 0) / 2 }; const k = markers.findIndex((q) => Math.abs(q.cx - m.cx) < 1 && Math.abs(q.cy - m.cy) < 1); if (k < 0) markers.push(m); else if (m.out > markers[k].out) markers[k] = m; } }); // a ringed node has a dot inside: one marker
          // the picture with the connectors taken out
          const doc2 = new DOMParser().parseFromString(b.svg, 'image/svg+xml');
          doc2.querySelectorAll('line,rect').forEach((e) => { if (isRail(e)) e.remove(); });
          const a = await px(b.svg), c = await px(new XMLSerializer().serializeToString(doc2));
          let bad = 0, sampled = 0;
          for (const m of markers) {
            const rr = Math.max(2, m.r - (m.out - m.r) * 2 - 1);
            const x0 = Math.floor(m.cx - rr), y0 = Math.floor(m.cy - rr), w = Math.ceil(2 * rr) + 1;
            const da = a.g.getImageData(x0, y0, w, w).data, dc = c.g.getImageData(x0, y0, w, w).data;
            for (let yy = 0; yy < w; yy++) for (let xx = 0; xx < w; xx++) {
              if ((xx + x0 - m.cx) ** 2 + (yy + y0 - m.cy) ** 2 > rr * rr) continue;
              sampled++;
              const o = (yy * w + xx) * 4;
              if (Math.abs(da[o] - dc[o]) + Math.abs(da[o + 1] - dc[o + 1]) + Math.abs(da[o + 2] - dc[o + 2]) > 6) bad++;
            }
          }
          const top = Math.min(...markers.map((m) => m.cy - m.out)), bot = Math.max(...markers.map((m) => m.cy + m.out));
          // gap of every rail end to the nearest marker edge
          const gaps: number[] = [];
          for (const r of rails) for (const y of [r.y0, r.y1]) gaps.push(Math.round(Math.min(...markers.map((m) => Math.abs(y - (y < m.cy ? m.cy - m.out : m.cy + m.out))))));
          const cys = markers.map((m) => m.cy).sort((p2, q) => p2 - q);
          rows.push({ tag, markers: markers.length, rails: rails.length, sampled, bad, aboveFirst: rails.length ? Math.round(Math.min(...rails.map((r) => r.y0)) - top) : 0, belowLast: rails.length ? Math.round(Math.max(...rails.map((r) => r.y1)) - bot) : 0, minGap: gaps.length ? Math.min(...gaps) : 99, maxGap: gaps.length ? Math.max(...gaps) : 0, pitches: cys.slice(1).map((y, i) => Math.round(y - cys[i])) });
        }
      }
    }
    return rows;
  }, { PRESETS, AFFECTED });
}

test('pixels: nothing connector-coloured inside any marker, and the connector stays between the first and the last marker, 5 presets', async ({ page }) => {
  await page.goto('/images/carousel');
  const rows: any[] = await renderAffected(page);
  expect(rows.length).toBe(4 * 5 * 3);
  const bad: string[] = [];
  for (const r of rows) {
    if (r.err) { bad.push(`${r.tag}: ${r.err}`); continue; }
    if (r.markers < 2) bad.push(`${r.tag}: only ${r.markers} markers found`);
    if (r.rails < r.markers - 1) bad.push(`${r.tag}: ${r.rails} rails for ${r.markers} markers (one between each pair)`);
    if (r.sampled < 200) bad.push(`${r.tag}: only ${r.sampled} pixels sampled inside the markers`);
    if (r.bad) bad.push(`${r.tag}: ${r.bad} pixels inside a marker are changed by the connector`);
    if (r.aboveFirst < 0) bad.push(`${r.tag}: the connector starts ${-r.aboveFirst} px above the first marker`);
    if (r.belowLast > 0) bad.push(`${r.tag}: the connector ends ${r.belowLast} px below the last marker`);
    if (r.minGap < 5) bad.push(`${r.tag}: the connector comes within ${r.minGap} px of a marker (needs about 6)`);
  }
  console.log('CONNECTOR rows ' + rows.length + ' minGap ' + Math.min(...rows.map((r) => r.minGap)) + ' maxGap ' + Math.max(...rows.map((r) => r.maxGap)) + ' pitches ' + JSON.stringify([...new Set(rows.map((r) => r.pitches.join(',')))].slice(0, 6)));
  expect(bad.slice(0, 12)).toEqual([]);
});

test('the gallery thumbnail is drawn by the same code: the same connector, and the same markers, as the slide', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const st = D.styleFromPack(PR.presetPackFor('dark-quiet', false)).style;
    const def = L.layoutDef('stepper')!;
    const f = (def.samples as any).long;
    const o = { handle: '@x', index: 2, total: 8, cut: 'plain' as const, invert: false as const, density: 'normal' as const };
    const slide: any = await L.buildSlide('stepper', 0, f, st, o);
    const tile: any = await D.drawOne({ layout: 'stepper', fields: f, accents: [] } as any, 0, st, o);
    const pick = (svg: string) => (svg.match(/<(line|circle)\b[^>]*>/g) ?? []).join('');
    return { same: pick(slide.svg) === pick(tile.built.svg), n: (slide.svg.match(/<line\b/g) ?? []).length + (slide.svg.match(/<circle\b/g) ?? []).length };
  });
  expect(r.n).toBeGreaterThan(8);
  expect(r.same).toBe(true);
});

test('sheet: all affected layouts x 3 presets (out/connector-fix/sheet.png)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ AFFECTED }: any) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const P3 = ['dark-quiet', 'style-1', 'style-7'];
    const w = 360, h = 450;
    const cells: [string, string, 0 | 1, string][] = [];
    for (const [id, v] of AFFECTED as [string, 0 | 1][]) for (const len of id === 'stepper' ? ['long', 'normal'] : ['long']) for (const p of P3) cells.push([id, p, v, len]);
    const c = document.createElement('canvas'); const cols = 3; c.width = cols * (w + 10) + 10; c.height = Math.ceil(cells.length / cols) * (h + 10) + 10;
    const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
    const meta: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      const [id, p, v, len] = cells[i];
      const st = D.styleFromPack(PR.presetPackFor(p, false)).style;
      const b: any = await L.buildSlide(id, v, (L.layoutDef(id)!.samples as any)[len], st, { handle: '@x', index: 2, total: 8, cut: 'plain' });
      const bm = await createImageBitmap(await F.svgToPng(b.svg, 1080));
      g.drawImage(bm, 10 + (i % cols) * (w + 10), 10 + Math.floor(i / cols) * (h + 10), w, h);
      meta.push(`${id}/v${v + 1}/${p}/${len}`);
    }
    return { png: c.toDataURL('image/png').split(',')[1], meta };
  }, { AFFECTED });
  fs.mkdirSync('out/connector-fix', { recursive: true });
  fs.writeFileSync('out/connector-fix/sheet.png', Buffer.from(r.png, 'base64'));
  console.log('SHEET ' + JSON.stringify(r.meta));
  expect(r.meta.length).toBe(18);
});
