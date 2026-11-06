// Layout library (no model): every layout x variant x cut x two styles x normal / long / short text is built by the engine and checked for margins, overlaps, type sizes,
// contrast per pair (text on plane, text on field), accent readability and balance. Then invert, density and weight options; the picking helpers; and the renders in out/layouts/.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(480_000);
const OUT = path.resolve(process.cwd(), 'out/layouts');

/** Runs in the page: the two styles. dark has planes (colour blocks) in its look, light (flat white and lime) has none. */
const PAGE_LIB = `
  const STYLES = {
    dark: { palette: { bg: '#0A0A0A', text: '#FFFFFF', muted: '#A3A3A3', accent: '#F02A2A', surface: '#1C1C1C' }, fonts: { headline: 'Schibsted Grotesk', body: 'Schibsted Grotesk' }, background: 'glow', devices: { marker: false, profileHeader: true, underline: false, planes: true }, accentStyle: 'text' },
    light: { palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#D4F76A', surface: '#F1F1F1' }, fonts: { headline: 'Schibsted Grotesk', body: 'Schibsted Grotesk' }, background: 'flat', devices: { marker: true, profileHeader: true, underline: true, planes: false }, accentStyle: 'marker' },
  };
`;

test('every layout x variant x cut x style x text length (+ invert, density, weight): margins, overlaps, sizes, contrast, balance', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (lib) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const T = await import('/src/image-engine/draw/text.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const STYLES: any = new Function(lib + ' return STYLES;')();
    const lum = (a: string, b: string) => C.contrastRgb(C.parseColor(a).rgb, C.parseColor(b).rgb);
    type Box = { x0: number; y0: number; x1: number; y1: number; name: string; text: boolean; layer: any; plane?: boolean };
    const FILL = ['statement', 'lead-statement', 'big-question', 'split-text', 'big-stat', 'stat-bar', 'stepper', 'checklist', 'numbered-list', 'comparison', 'quote', 'feature-slider', 'cta-button', 'card-grid', 'stat-grid', 'timeline'];
    const out: string[] = [];
    const carry: Record<string, number> = {};
    let count = 0;
    const run = async (tag: string, id: string, variant: 0 | 1, fields: any, st: any, opts: any) => {
      const b = await L.buildSlide(id, variant, fields, st, { handle: '@quick.flip', index: 1, total: 7, ...opts });
      count++;
      if (!b.ok) { out.push(`${tag}: ${b.errors.join(' | ')}`); return; }
      const pal = b.palette;
      if (b.partitioned && opts.len === 'normal') carry[tag.split('/').slice(1, 3).join('/')] = 1;
      const boxes: Box[] = [];
      for (const l of b.layers as any[]) {
        if (l.visible === false) continue;
        if (l.kind === 'text') {
          if (!String(l.text ?? '').trim()) continue;
          const m = T.layoutText(l);
          if (!m.lines.length) continue;
          const x0 = l.x + Math.min(...m.lines.map((q: any) => q.x));
          const x1 = l.x + Math.max(...m.lines.map((q: any) => q.x + q.width));
          const y0 = l.y + m.lines[0].y;
          const y1 = l.y + m.lines[m.lines.length - 1].y + m.lineStep;
          boxes.push({ x0, y0, x1, y1, name: l.name, text: true, layer: { ...l, _size: m.size } });
          if (m.size < 31.9) out.push(`${tag}: ${l.name} text "${String(l.text).slice(0, 20)}" is ${m.size.toFixed(1)} px (< 32)`);
          if (l.name === 'body' && m.size < 39.9 && !(id === 'stepper' && opts.len === 'long')) out.push(`${tag}: body text "${String(l.text).slice(0, 20)}" is ${m.size.toFixed(1)} px (< 40)`);
          if (x0 < 47 || x1 > 1033 || y0 < 47 || y1 > 1303) out.push(`${tag}: ${l.name} "${String(l.text).slice(0, 20)}" leaves the margins (${Math.round(x0)}..${Math.round(x1)}, ${Math.round(y0)}..${Math.round(y1)})`);
        } else if (l.id !== 'bg' && l.name !== 'background') {
          const area = l.width * l.height;
          if (l.x <= 0 && l.y <= 0 && l.x + l.width >= 1080 && l.y + l.height >= 1350) continue;
          const plane = area > 0.2 * 1080 * 1350 && (l.x <= 0 || l.y <= 0 || l.x + l.width >= 1080 || l.y + l.height >= 1350);
          boxes.push({ x0: l.x, y0: l.y, x1: l.x + l.width, y1: l.y + l.height, name: String(l.name), text: false, layer: l, plane });
          if (!plane && !String(l.name).startsWith('recurring') && (l.x < 47 || l.x + l.width > 1033 || l.y < 47 || l.y + l.height > 1303)) out.push(`${tag}: shape ${l.name} leaves the margins`);
        }
      }
      const texts = boxes.filter((q) => q.text);
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const w = Math.min(texts[i].x1, texts[j].x1) - Math.max(texts[i].x0, texts[j].x0);
          const h = Math.min(texts[i].y1, texts[j].y1) - Math.max(texts[i].y0, texts[j].y0);
          if (w > 4 && h > 4) out.push(`${tag}: text overlap ${texts[i].name} / ${texts[j].name}`);
        }
        for (const s of boxes.filter((q) => !q.text && !q.plane)) {
          const w = Math.min(texts[i].x1, s.x1) - Math.max(texts[i].x0, s.x0);
          const h = Math.min(texts[i].y1, s.y1) - Math.max(texts[i].y0, s.y0);
          if (w > 4 && h > 4 && w * h < 0.9 * (texts[i].x1 - texts[i].x0) * (texts[i].y1 - texts[i].y0)) out.push(`${tag}: ${texts[i].name} text half-overlaps shape ${s.name}`);
        }
      }
      // contrast per pair: every text against what is behind it (the smallest shape that holds it, else the field)
      const ratio = lum(pal.accent, pal.bg);
      for (const q of texts) {
        const col = String(q.layer.style.color).toUpperCase();
        if (q.layer.highlight) {
          if (lum(q.layer.highlight.textColor, q.layer.highlight.color) < 4.5) out.push(`${tag}: marker ink is under 4.5:1`);
          continue;
        }
        const onPlane = (px: number, py: number) => !!b.geometry && b.geometry.cut !== 'plain' && b.geometry.on(px, py);
        const corners = [onPlane(q.x0, q.y0), onPlane(q.x1, q.y0), onPlane(q.x0, q.y1), onPlane(q.x1, q.y1)].filter(Boolean).length;
        if (corners > 0 && corners < 4 && q.name !== 'recurring') out.push(`${tag}: ${q.name} text straddles the plane edge`);
        if (corners > 0 && corners < 4 && (lum(String(q.layer.style.color), pal.plane) < 3 || lum(String(q.layer.style.color), b.fieldBg) < 3) && !q.layer.highlight) out.push(`${tag}: ${q.name} text straddles the plane edge and is under 3:1 on one side`);
        const cardOf: any = boxes.filter((s) => !s.text && !s.plane && typeof s.layer.fill === 'string' && s.layer.fill.startsWith('#') && s.x0 <= q.x0 + 1 && s.x1 >= q.x1 - 1 && s.y0 <= q.y0 + 1 && s.y1 >= q.y1 - 1).sort((a, c) => (a.x1 - a.x0) * (a.y1 - a.y0) - (c.x1 - c.x0) * (c.y1 - c.y0))[0];
        const backing = cardOf ?? (corners > 0 ? { plane: true, layer: { fill: pal.plane } } : undefined);
        const ground = backing ? String(backing.layer.fill).toUpperCase() : b.fieldBg;
        if (col.startsWith('#') && lum(col, ground) < 3) out.push(`${tag}: ${q.name} text ${col} on ${backing ? (backing.plane ? 'plane ' : 'card ') : 'field '}${ground} is ${lum(col, ground).toFixed(1)}:1 (< 3)`);
        for (const run of q.layer.runs ?? []) if (String(run.color).toUpperCase() === pal.accent && lum(pal.accent, ground) < 3) out.push(`${tag}: accent run ${lum(pal.accent, ground).toFixed(1)}:1 and no marker`);
      }
      void ratio;
      // a plane close in colour to the field has a drawn edge
      const pl = boxes.find((q) => q.plane);
      if (pl && lum(String(pl.layer.fill), b.fieldBg) < 1.5 && !pl.layer.stroke) out.push(`${tag}: low-contrast plane has no drawn edge`);
      // balance (within the free field) and the plane edge
      if (id !== 'photo-led') {
        const content = boxes.filter((q) => !q.name.startsWith('recurring') && !q.plane && q.y1 > 140 && q.y0 < (b.fieldBottom ?? 1210));
        const top = Math.min(...content.map((q) => q.y0));
        const bot = Math.max(...content.map((q) => q.y1));
        const ft = top - 140;
        const fb = (b.fieldBottom ?? 1210) - bot;
        if (Math.max(ft, fb) > 0.35 * 1350 && Math.abs(ft - fb) > 60) out.push(`${tag}: unbalanced empty space (${Math.round(ft)} above, ${Math.round(fb)} below)`);
        if (bot > (b.fieldBottom ?? 1210) + 2) out.push(`${tag}: content runs past the free field (${Math.round(bot)} > ${b.fieldBottom})`);
        if (b.cut === 'plain' && opts.len === 'normal' && !opts.invert && !opts.density && FILL.includes(id)) {
          const share = (bot - top) / 1000;
          if (share < 0.65) out.push(`${tag}: content fills only ${Math.round(share * 100)}% of the free height (< 65%)`);
        }
        if (b.cut === 'edge-v') for (const q of texts) if (!q.name.startsWith('recurring') && q.x1 > b.geometry.edge - 20) out.push(`${tag}: ${q.name} text runs onto the side plane`);
      }
    };
    for (const [sname, st] of Object.entries<any>(STYLES)) {
      for (const id of L.LAYOUT_IDS as string[]) {
        const def = L.layoutDef(id)!;
        for (const cut of L.cutsOf(id) as string[]) {
          for (const variant of [0, 1] as const) {
            for (const len of ['normal', 'long', 'short'] as const) {
              const fields = (def.samples as any)[len];
              const v = L.validateSlideContent(id, fields);
              if (!v.ok) { out.push(`${sname}/${id}/${len}: sample fails its own budgets: ${v.errors.join(' ')}`); continue; }
              await run(`${sname}/${id}/${cut}/v${variant + 1}/${len}`, id, variant, fields, st, { cut, len });
            }
            // invert (full swap, and the light tint), on the normal text
            for (const invert of ['full', 'tint']) await run(`${sname}/${id}/${cut}/v${variant + 1}/invert-${invert}`, id, variant, (def.samples as any).normal, st, { cut, invert });
          }
        }
        // density: statement
        if (['statement', 'big-question', 'cta-button'].includes(id))
          for (const cut of L.cutsOf(id) as string[]) for (const len of ['normal', 'short'] as const) await run(`${sname}/${id}/${cut}/density-statement/${len}`, id, 0, (def.samples as any)[len], st, { cut, density: 'statement', len });
        // weight: unequal comparison
        if (id === 'comparison') for (const cut of L.cutsOf(id) as string[]) for (const variant of [0, 1] as const) for (const len of ['normal', 'long'] as const) await run(`${sname}/${id}/${cut}/v${variant + 1}/unequal/${len}`, id, variant, (def.samples as any)[len], st, { cut, weight: 'unequal', len });
      }
    }
    return { out, count, carry };
  }, PAGE_LIB);
  fs.mkdirSync(OUT, { recursive: true });
  const groups: Record<string, number> = {};
  for (const f of r.out) { const k = f.split('/').slice(1, 3).join('/'); groups[k] = (groups[k] ?? 0) + 1; }
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify({ built: r.count, groups, failures: r.out }, null, 1));
  const kinds: Record<string, any> = {}; for (const f of r.out) { const k = f.split(': ').slice(1).join(': ').replace(/[0-9.]+/g, 'N').slice(0, 90); kinds[k] = kinds[k] ?? [0, f.slice(0, 150)]; kinds[k][0]++; } console.log('BUILT', r.count, 'FAILED', r.out.length, JSON.stringify(groups), JSON.stringify(Object.entries(kinds).sort((a, b) => b[1][0] - a[1][0]).slice(0, 22).map(([, v]) => v.join(' x ')), null, 0));
  expect(r.out.slice(0, 40)).toEqual([]);
  // the plane carries content: part B of these layouts sits on the edge-h plane
  const carried = Object.keys(r.carry);
  console.log('PLANE CARRIES CONTENT:', JSON.stringify(carried));
  for (const k of ['statement/edge-h', 'lead-statement/edge-h', 'big-question/edge-h', 'split-text/edge-h', 'quote/edge-h', 'big-stat/edge-h', 'stat-bar/edge-h', 'checklist/edge-h', 'numbered-list/edge-h', 'cta-button/edge-h', 'card-grid/edge-h', 'feature-slider/edge-h']) expect(carried).toContain(k);
});

test('picking helpers: layoutFor, rotateVariants, rotateCuts and validateSlideContent', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (lib) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const STYLES: any = new Function(lib + ' return STYLES;')();
    const claim = Array.from({ length: 12 }, () => ({ shape: 'claim' as const }));
    const picked = L.rotateVariants(claim);
    const same = L.rotateVariants([{ layout: 'statement' }, { layout: 'statement' }, { layout: 'statement' }, { layout: 'statement' }]);
    const counts: Record<string, number> = {};
    picked.forEach((p) => (counts[p.layout] = (counts[p.layout] ?? 0) + 1));
    const deck = L.rotateVariants([{ shape: 'claim' }, { shape: 'story' }, { shape: 'process' }, { shape: 'feature' }, { shape: 'benefits' }, { shape: 'metric' }, { shape: 'ask' }, { shape: 'list' }, { shape: 'contrast' }, { shape: 'quote' }, { shape: 'history' }, { shape: 'product' }]);
    const cutsDark = L.rotateCuts(deck, STYLES.dark);
    const cutsLight = L.rotateCuts(deck, STYLES.light);
    const bad = L.validateSlideContent('stat-bar', { number: '$1,234,567,890', label: 'one two three four five six', bar: '140', extra: 'x' } as any);
    return {
      consecutive: picked.some((p, i) => i > 0 && p.layout === picked[i - 1].layout), max: Math.max(...Object.values(counts)),
      alternate: same.map((p) => p.layout + ':' + p.variant), noPhotoPicked: picked.some((p) => p.layout === 'photo-led'),
      cutsDark, cutsLight, deckLayouts: deck.map((d) => d.layout),
      bad: bad.errors, missing: L.validateSlideContent('checklist', { title: 'T', items: ['a', 'b'] }).errors, nope: L.validateSlideContent('nope', {}).errors,
      cutsOfStatement: L.cutsOf('statement'), cutsOfChecklist: L.cutsOf('checklist'),
    };
  }, PAGE_LIB);
  expect(r.consecutive).toBe(false);
  expect(r.max).toBeLessThanOrEqual(2);
  expect(r.noPhotoPicked).toBe(false);
  expect(r.alternate[0]).toBe('statement:0');
  expect(r.bad.join(' ')).toMatch(/number.*characters/);
  expect(r.missing.join(' ')).toMatch(/items.*3 to 5/);
  expect(r.nope.join(' ')).toMatch(/not a layout/);
  // rotateCuts, planes style: no two adjacent slides share a cut, at most 2 plain in a row, invert at most once in any 4 slides, every cut is supported by its layout
  const cuts = r.cutsDark;
  cuts.forEach((c, i) => {
    if (i > 0) expect(c.cut).not.toBe(cuts[i - 1].cut);
    if (i > 1 && c.cut === 'plain') expect(cuts[i - 1].cut === 'plain' && cuts[i - 2].cut === 'plain').toBe(false);
  });
  for (let i = 0; i + 4 <= cuts.length; i++) expect(cuts.slice(i, i + 4).filter((c) => c.invert).length).toBeLessThanOrEqual(1);
  expect(cuts.some((c) => c.cut !== 'plain')).toBe(true);
  expect(cuts.some((c) => c.invert === 'full')).toBe(true);
  // a style without a plane device stays plain and only tints
  expect(r.cutsLight.every((c) => c.cut === 'plain')).toBe(true);
  expect(r.cutsLight.filter((c) => c.invert === 'tint').length).toBeGreaterThanOrEqual(2);
  expect(r.cutsLight.filter((c) => c.invert === 'full').length).toBe(1);
  expect(r.cutsLight.filter((c) => c.density === 'statement').length).toBeGreaterThanOrEqual(1);
  expect(r.cutsLight.every((c) => c.invert === 'tint' || c.invert === 'full' || c.invert === false)).toBe(true);
  expect(r.cutsOfStatement).toContain('edge-h');
  expect(r.cutsOfChecklist.length).toBeGreaterThanOrEqual(3);
});

test('render: contact sheets, the layout x cut sheet (dark) and the Quick Flip deck with rotateVariants + rotateCuts', async ({ page }) => {
  await page.goto('/images/carousel');
  fs.mkdirSync(OUT, { recursive: true });
  const r = await page.evaluate(async (lib) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const F = await import('/src/reference/faithful.ts');
    const STYLES: any = new Function(lib + ' return STYLES;')();
    const bmp = async (svg: string, w: number) => createImageBitmap(await F.svgToPng(svg, w));
    const png = (c: HTMLCanvasElement) => c.toDataURL('image/png').split(',')[1];
    const ids = (L.LAYOUT_IDS as string[]).filter((i) => i !== 'photo-led');
    const files: Record<string, string> = {};
    const errs: string[] = [];
    const sheet = (dark: boolean, tw: number, th: number, cols: number, rows: number, cap: number) => {
      const c = document.createElement('canvas');
      c.width = cols * (tw + 24) + 24;
      c.height = rows * (th + cap + 24) + 24;
      const g = c.getContext('2d')!;
      g.fillStyle = dark ? '#303030' : '#CFCFCF';
      g.fillRect(0, 0, c.width, c.height);
      return { c, g };
    };
    for (const [sname, st] of Object.entries<any>(STYLES)) {
      for (const variant of [0, 1] as const) {
        const tw = 360, th = 450, cols = 5;
        const { c, g } = sheet(sname === 'dark', tw, th, cols, Math.ceil(ids.length / cols), 40);
        for (let i = 0; i < ids.length; i++) {
          const def = L.layoutDef(ids[i])!;
          const b = await L.buildSlide(ids[i], variant, def.samples.normal, st, { handle: '@quick.flip', index: i, total: ids.length });
          const x = 24 + (i % cols) * (tw + 24);
          const y = 24 + Math.floor(i / cols) * (th + 64);
          if (!b.ok) { errs.push(`${sname} ${ids[i]} v${variant + 1}: ${b.errors.join(' | ')}`); continue; }
          g.drawImage(await bmp(b.svg, 720), x, y, tw, th);
          g.fillStyle = sname === 'dark' ? '#FFFFFF' : '#111111';
          g.font = '600 20px sans-serif';
          g.fillText(ids[i], x, y + th + 26, tw);
          g.font = '500 16px sans-serif';
          g.fillText(`variant ${variant + 1}: ${def.variants[variant]}`, x, y + th + 48, tw);
        }
        files[`contact-sheet-${sname}${variant ? '-v2' : ''}.png`] = png(c);
      }
    }
    // every layout x cut, dark style (rows: layouts, columns: cuts)
    {
      const cutNames = ['plain', 'edge-h', 'edge-v', 'angle', 'curve'];
      const tw = 300, th = 375;
      const { c, g } = sheet(true, tw, th, cutNames.length, ids.length, 36);
      for (let i = 0; i < ids.length; i++) {
        const def = L.layoutDef(ids[i])!;
        for (let j = 0; j < cutNames.length; j++) {
          const x = 24 + j * (tw + 24);
          const y = 24 + i * (th + 60);
          g.fillStyle = '#FFFFFF';
          g.font = '600 20px sans-serif';
          if (!L.cutsOf(ids[i]).includes(cutNames[j])) { g.fillStyle = '#777777'; g.fillText(`${ids[i]} · ${cutNames[j]} · not supported`, x, y + 28); continue; }
          const b = await L.buildSlide(ids[i], 0, def.samples.normal, STYLES.dark, { handle: '@quick.flip', index: i, total: ids.length, cut: cutNames[j] });
          if (!b.ok) { errs.push(`cuts ${ids[i]} ${cutNames[j]}: ${b.errors.join(' | ')}`); continue; }
          g.drawImage(await bmp(b.svg, 600), x, y, tw, th);
          g.fillText(`${ids[i]} · ${cutNames[j]}`, x, y + th + 26, tw);
        }
      }
      files['contact-sheet-cuts-dark.png'] = png(c);
    }
    // the five hero layouts side by side in plain (dark above, light below)
    {
      const five = ['statement', 'lead-statement', 'big-question', 'split-text', 'quote'];
      const tw = 360, th = 450;
      const { c, g } = sheet(false, tw, th, 5, 2, 40);
      let row = 0;
      for (const [sname, st] of Object.entries<any>(STYLES)) {
        for (let i = 0; i < five.length; i++) {
          const def = L.layoutDef(five[i])!;
          const b = await L.buildSlide(five[i], 0, def.samples.normal, st, { handle: '@quick.flip', index: i, total: 5 });
          if (!b.ok) { errs.push('hero ' + sname + ' ' + five[i] + ': ' + b.errors.join(' | ')); continue; }
          const x = 24 + i * (tw + 24);
          const y = 24 + row * (th + 64);
          g.drawImage(await bmp(b.svg, 720), x, y, tw, th);
          g.fillStyle = '#111111';
          g.font = '600 20px sans-serif';
          g.fillText(five[i] + ' · ' + sname, x, y + th + 28, tw);
        }
        row++;
      }
      files['hero-five.png'] = png(c);
    }
    // the Quick Flip deck
    for (const [sname, st] of Object.entries<any>(STYLES)) {
      const picks = L.rotateVariants([{ layout: 'statement' }, { layout: 'lead-statement' }, { layout: 'stepper' }, { layout: 'feature-slider' }, { layout: 'checklist' }, { layout: 'stat-bar' }, { layout: 'cta-button' }]);
      const cuts = L.rotateCuts(picks, st);
      const content: any[] = [
        { headline: 'Flip your hoodie', kicker: 'Now on Kickstarter', caption: 'One piece. Two jobs. Zero bags.' },
        { lead: 'It started in a rainy taxi', headline: 'We ditched the bag and kept the hoodie' },
        { title: 'How it flips', steps: ['Zip the hood into the pocket', 'Fold the sleeves behind you', 'Pull the straps and go'] },
        { title: 'Slide and bite', body: 'Slide the zip, bite the clasp, and the hoodie locks into a backpack.' },
        { title: 'Why you will love it', items: ['Waterproof shell', 'Fits a 16-inch laptop', 'Machine washable', 'Flips in 10 seconds'] },
        { number: '$500,000', label: 'for 5% of the company', bar: '5', note: 'Open to 20 backers only' },
        { headline: 'Back Quick Flip today', button: 'Back it now', sub: 'Early backers save 30%.' },
      ];
      const dw = 540, dh = 675;
      const dc = document.createElement('canvas');
      dc.width = content.length * dw;
      dc.height = dh;
      const dg = dc.getContext('2d')!;
      for (let i = 0; i < content.length; i++) {
        const b = await L.buildSlide(picks[i].layout, picks[i].variant, content[i], st, { handle: '@quick.flip', index: i, total: content.length, cut: cuts[i].cut, invert: cuts[i].invert, density: cuts[i].density });
        if (!b.ok) { errs.push(`deck ${sname} ${picks[i].layout} ${cuts[i].cut}: ${b.errors.join(' | ')}`); continue; }
        dg.drawImage(await bmp(b.svg, 1080), i * dw, 0, dw, dh);
      }
      files[`quickflip-${sname}.png`] = png(dc);
      files[`quickflip-${sname}.txt`] = Buffer_free(picks.map((p: any, i: number) => `${i + 1} ${p.layout} v${p.variant + 1} ${cuts[i].cut}${cuts[i].invert ? ' invert-' + cuts[i].invert : ''}`).join('\n'));
    }
    function Buffer_free(s: string) { return btoa(s); }
    return { files, errs };
  }, PAGE_LIB);
  for (const [name, b64] of Object.entries(r.files)) fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'));
  expect(r.errs).toEqual([]);
});

test('chrome profile header in both styles, an optional avatar, up to 3 accent phrases (contrast-guarded)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (lib) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const STYLES: any = new Function(lib + ' return STYLES;')();
    const out: any = {};
    for (const [sname, st] of Object.entries<any>(STYLES)) {
      const b = await L.buildSlide('statement', 0, { headline: 'The hoodie that becomes a backpack', accent: ['hoodie', 'becomes', 'backpack'] }, st, { handle: '@quick.flip', index: 0, total: 5, avatarUrl: 'data:image/png;base64,iVBORw0KGgo=' });
      const title = (b.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
      const avatar = (b.layers as any[]).find((l) => l.name === 'recurring-avatar');
      const texts = (b.layers as any[]).filter((l) => l.name === 'recurring').map((l) => [l.text, l.style.size]);
      out[sname] = { ok: b.ok, errors: b.errors, runs: title?.runs?.length ?? 0, words: title?.highlight?.words ?? [], avatarW: avatar?.width, texts, hasImage: b.svg.includes('<image') };
    }
    const many = L.validateSlideContent('statement', { headline: 'Four phrases here now', accent: ['a', 'b', 'c', 'd'] });
    return { out, many: many.errors };
  }, PAGE_LIB);
  for (const s of ['dark', 'light'] as const) {
    expect(r.out[s].errors).toEqual([]);
    expect(r.out[s].avatarW).toBeGreaterThanOrEqual(70);
    expect(r.out[s].hasImage).toBe(true);
    expect(r.out[s].texts.some((x: any) => x[1] >= 36)).toBe(true);
    expect(r.out[s].texts.every((x: any) => x[1] >= 32)).toBe(true);
  }
  expect(r.out.dark.runs).toBe(3); // text accents: three runs in the accent colour
  expect(r.out.light.runs).toBe(3); // marker accents on the lime (the contrast guard): three marked phrases
  expect(r.out.light.words.length).toBeGreaterThanOrEqual(3);
  expect(r.many.join(' ')).toMatch(/at most 3 phrases/);
});
