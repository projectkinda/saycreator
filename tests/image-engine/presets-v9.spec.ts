// Presets v9 (ZERO model calls): the fixed 8-slide sample for all 15 built-in presets (the 7 older ones and style-1..8), drawn by the layout library. Output: out/presets-v16/.
// layout library with the preset's palette rhythm, case, weights and gradient (packFromStyle -> styleFromPack). Output: out/presets-v16/.
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(30 * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
const OUT = path.resolve(process.cwd(), 'out/presets-v16');
const PRESETS = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
const SPECS = [
  { layout: 'statement-stacked', fields: { headline: 'Flip it, wear it', caption: 'One hoodie that turns into a backpack in ten seconds.' }, accents: ['wear it'] },
  { layout: 'prose', fields: { heading: 'Why we built it', p1: 'We sewed a waterproof bag into the hood and tested it for two years on trains, planes and rainy streets, so one layer does both jobs.', p2: 'Early backers told us the flip was the part they loved most, so we kept it to one zip and ten seconds.', pull: 'Built to be worn all day, flipped in ten seconds.' }, accents: [] },
  { layout: 'statement-pill', fields: { kicker: 'New on Kickstarter', headline: 'A hoodie that flips into a backpack', caption: 'Back it before Friday' }, accents: ['backpack'] },
  { layout: 'bullet-list', fields: { title: 'What is in the box', items: ['The Quick Flip hoodie', 'A waterproof pouch', 'A pocket guide', 'A thank-you card'] }, accents: [] },
  { layout: 'headline-card', fields: { headline: 'How it works', subline: 'Three things happen when you zip.', card: 'The hood folds into a waterproof pocket that holds a 16-inch laptop.', paragraph: 'The straps slide out of the sleeves in one pull.', closing: 'That is the whole trick.' }, accents: [] },
  { layout: 'pill-stagger', fields: { headline: 'Four ways to wear it', subline: 'Pick the one that fits your day.', items: ['As a hoodie', 'As a backpack', 'As a pillow', 'As a blanket'] }, accents: [] },
  { layout: 'statement-question', fields: { question: 'What if your hoodie was also your bag?', line: 'Keep reading to see how.' }, accents: [] },
  { layout: 'contact-closing', fields: { brand: 'Quick Flip', headline: 'Back Quick Flip today', line: 'Early backers save 30%.', button: 'Back it now', contacts: ['@quick.flip', 'quickflip.com', 'hello@quickflip.com'] }, accents: ['today'] },
];
const FAMILY: Record<string, string> = { 'statement-stacked': 'hero', 'statement-pill': 'hero', 'statement-question': 'hero', 'contact-closing': 'hero', prose: 'text', 'headline-card': 'text', 'bullet-list': 'list', 'pill-stagger': 'list' };

test('presets v3: neighbour grounds, one red, visible gradients, comfort contrast, bigger small text, layout flavour', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/images/carousel');
  const res = await page.evaluate(async ({ presets, specs }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const R = await import('/src/carousel/render.ts');
    const P = await import('/src/reference/pack.ts');
    const F = await import('/src/reference/faithful.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const K = await import('/src/carousel/layouts/index.ts');
    const rgbOf = (c: string) => C.parseColor(c).rgb;
    const ratio = (a: string, b: string) => C.contrastRgb(rgbOf(a), rgbOf(b));
    const loaded = R.carouselStyles();
    const drawLibrary = async (pack: any) => {
      const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style: null, styleNotes: [], plan: { title: 'Sample', specs: specs.map((s: any) => ({ ...s })) } };
      return D.redrawLibraryDeck(lib, { pack, hasPhoto: false }, '@quick.flip');
    };
    const bitmaps = async (svgs: string[]) => Promise.all(svgs.map(async (s) => createImageBitmap(await F.svgToPng(s, 540))));
    const fingerprint = (bm: ImageBitmap) => { const c = document.createElement('canvas'); c.width = 12; c.height = 15; const g = c.getContext('2d')!; g.drawImage(bm, 0, 0, 12, 15); return Array.from(g.getImageData(0, 0, 12, 15).data).filter((_, i) => i % 4 !== 3); };
    const sheetOf = (bms: ImageBitmap[], n: number, w: number) => { const h = Math.round(w * 1.25); const c = document.createElement('canvas'); c.width = n * (w + 10) + 10; c.height = h + 20; const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height); bms.slice(0, n).forEach((b, i) => g.drawImage(b, 10 + i * (w + 10), 10, w, h)); return c; };
    const b64 = (c: HTMLCanvasElement) => c.toDataURL('image/png').split(',')[1];

    // the checks on one drawn slide: every text and accent run against the ground that is really under it
    const check = (s: any, layout: string) => {
      const layers = s.built.layers as any[];
      const bgField = s.built.bg as string;
      const low: string[] = [];
      const sizes: Record<string, number> = {};
      const clipped: string[] = [];
      let minC = 99;
      let minD = 99; // display text (96 px and up) needs 3:1, smaller text 4.5:1
      for (const l of layers) {
        if (l.kind !== 'text' || !l.text) continue;
        const chrome = String(l.name).startsWith('recurring');
        if (l.x < -1 || l.x + l.width > 1081 || l.y < 0 || l.y + l.height > 1351) clipped.push(`${l.name} (${Math.round(l.x)},${Math.round(l.y)},${Math.round(l.width)}x${Math.round(l.height)})`);
        { const key = chrome ? 'chrome' : l.name; sizes[key] = Math.min(sizes[key] ?? 999, l.style.size); }
        const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
        const under = layers.filter((q: any) => q.kind === 'shape' && typeof q.fill === 'string' && /^#[0-9a-f]{6}/i.test(q.fill) && (q.opacity ?? 1) >= 0.95 && q.x <= cx && q.x + q.width >= cx && q.y <= cy && q.y + q.height >= cy && q.width * q.height < 1080 * 1350 * 0.9).reduce((best: any, q: any) => (!best || q.width * q.height <= best.width * best.height ? q : best), null as any); // the smallest shape under the text, the later one when equal (a card is drawn after its offset shadow)
        const bg = under ? (under.fill as string) : bgField;
        const hl = l.highlight && l.highlight.color && l.highlight.color.length >= 7 && !/^(transparent|none)$/i.test(l.highlight.color) ? l.highlight : null;
        const pairs: [string, string][] = [[l.style.color, bg]];
        for (const r of l.runs ?? []) pairs.push(hl ? [r.color, hl.color] : [r.color, bg]);
        for (const [a, b] of pairs) { const r = ratio(a, b); const disp = l.style.size >= 96; if (disp) minD = Math.min(minD, r); else minC = Math.min(minC, r); if (r < (disp ? 3 : 4.5)) low.push(`${chrome ? 'chrome ' : ''}${l.name} ${a} on ${b} = ${r.toFixed(2)}`); }
      }
      return { devices: ((s.built.devices ?? []) as any[]).map((d: any) => d.id), layout, minContrast: Math.round(minC * 100) / 100, minDisplay: Math.round(minD * 100) / 100, low, sizes, clipped };
    };

    const out: any = { presets: {} };
    const rowsLib: Record<string, ImageBitmap[]> = {};

    // baseline body sizes: the library's current look (the neutral default style) on the same sample
    const neutral = await drawLibrary(null);
    const baseSizes: Record<string, number> = {};
    Object.values<any>(neutral.slides).forEach((s: any) => { const c = check(s, ''); for (const [k, v] of Object.entries<number>(c.sizes)) baseSizes[k] = Math.min(baseSizes[k] ?? 999, v); });
    baseSizes.chrome = 32;
    out.baseSizes = baseSizes;

    for (const id of presets) {
      const spec: any = loaded.find((s: any) => s.spec.name === id)!.spec;
      const base = P.packFromStyle(spec);
      const pack = { ...base, devices: { marker: spec.shape.marker === 'box', underline: spec.shape.marker === 'underline', profileHeader: !!spec.library?.devices?.profileHeader, slides: 1, counts: { marker: 0, profileHeader: 0, underline: 0 } } };
      const m = D.styleFromPack(pack);
      const lib = await drawLibrary(pack);
      const slides = Object.entries<any>(lib.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s);
      const checks = slides.map((s: any, i: number) => check(s, lib.library.layouts[i]));
      // every ground of the rhythm, on its own: the roles for the plain ground, the full-bleed accent (closing) and the tint
      const grounds = (m.style.rhythm ?? [{ ...m.style.palette }]).map((g: any) => {
        const pal = K.paletteOf({ ...m.style, palette: g, rhythm: undefined });
        const stops: string[] = g.gradient ? g.gradient.stops.map((x: any) => x.color) : [g.bg];
        const rows: Record<string, number> = {};
        const plain = K.coloursFor(pal, {});
        const full = K.coloursFor(pal, { invert: 'full' });
        const minAll = (c: string) => Math.min(...stops.map((s) => ratio(c, s)));
        rows['text/ground'] = minAll(g.text);
        rows['muted/ground'] = minAll(g.muted);
        rows['muted/card'] = ratio(g.muted, g.surface);
        rows['text/card'] = ratio(g.text, g.surface);
        rows['card vs ground (bar track)'] = Math.min(...stops.map((s) => ratio(g.surface, s)));
        const accentRead = ratio(plain.F.accentInk ?? plain.F.accent, plain.F.bg);
        rows['accent as text/ground'] = accentRead;
        rows['accent display/ground'] = Math.min(...stops.map((x) => ratio(plain.F.accentDisplay ?? plain.F.accent, x)));
        // when the accent cannot be text the phrase sits on a marker bar: the pair is the ink on the bar
        const ink = rgbOf(g.onAccent ?? g.text);
        void ink;
        rows['ink on accent bar'] = ratio(plain.F.onAccent, g.accent);
        rows['closing: text/accent ground'] = ratio(full.F.text, full.F.bg);
        rows['closing: muted/accent ground'] = ratio(full.F.muted, full.F.bg);
        rows['closing: onAccent/accent'] = ratio(full.F.onAccent, full.F.accent);
        const accentMode = accentRead >= 4.5 ? 'text' : 'marker bar';
        return { ground: { bg: g.bg, text: g.text, accent: g.accent, gradient: !!g.gradient }, accentMode, pairs: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, Math.round(v * 100) / 100])) };
      });
      const bms = await bitmaps(slides.map((s: any) => s.built.svg));
      rowsLib[id] = bms;
      out.presets[id] = {
        style: m.style, notes: m.notes,
        layouts: lib.library.layouts, cuts: lib.library.cuts, inverts: lib.library.inverts,
        checks, grounds, fingerprint: bms.map(fingerprint), sheet: b64(sheetOf(bms, 8, 270)),
        fieldBg: slides.map((s: any) => s.built.bg as string), variants: lib.library.variants, groundIdx: lib.library.grounds,
        grounds_per_slide: slides.map((_: any, i: number) => { const g = (m.style.rhythm ?? [m.style.palette])[i % (m.style.rhythm?.length ?? 1)]; return { bg: g.bg, gradient: !!g.gradient }; }),
      };
    }
    // all-presets.png: first 4 slides per preset; hot-flat and mono-poster with all 8
    const w = 270, h = 338, labelW = 190;
    const wide = ['hot-flat', 'mono-poster'];
    const cols = 8;
    const c = document.createElement('canvas'); c.width = cols * (w + 10) + 10 + labelW; c.height = presets.length * (h + 10) + 10;
    const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
    presets.forEach((id: string, r: number) => {
      g.fillStyle = id.startsWith('style-') ? '#ffd54a' : '#fff'; g.font = 'bold 20px sans-serif'; g.fillText((id.startsWith('style-') ? 'NEW ' : '') + id, 12, 10 + r * (h + 10) + 30);
      rowsLib[id].slice(0, 8).forEach((b, i) => g.drawImage(b, labelW + 10 + i * (w + 10), 10 + r * (h + 10), w, h));
    });
    out.combo = b64(c);
    return out;
  }, { presets: PRESETS, specs: SPECS });

  for (const id of PRESETS) {
    const d = path.join(OUT, id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'sheet.png'), Buffer.from(res.presets[id].sheet, 'base64'));
  }
  fs.writeFileSync(path.join(OUT, 'all-presets.png'), Buffer.from(res.combo, 'base64'));

  // ---------- similarity (the SAME formula as the first check, plus an extended one that also counts rhythm, case and weights) ----------
  const lum = (h: string) => { const c = [1, 3, 5].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio2 = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const cd = (a: string, b: string) => Math.sqrt(hex(a).reduce((s, v, i) => s + (v - hex(b)[i]) ** 2, 0)) / 441.7;
  const pix = (fa: number[][], fb: number[][]) => { const n = Math.min(fa.length, fb.length); let t = 0; for (let k = 0; k < n; k++) t += fa[k].reduce((s, v, q) => s + Math.abs(v - fb[k][q]), 0) / fa[k].length / 255; return n ? t / n : 0; };
  const pairs: any[] = [];
  for (let i = 0; i < PRESETS.length; i++) for (let j = i + 1; j < PRESETS.length; j++) {
    const A = res.presets[PRESETS[i]], B = res.presets[PRESETS[j]];
    const la = A.style, lb = B.style;
    const palette = (cd(la.palette.bg, lb.palette.bg) + cd(la.palette.text, lb.palette.text) + cd(la.palette.accent, lb.palette.accent)) / 3;
    const font = ((la.fonts.headline !== lb.fonts.headline ? 1 : 0) + (la.fonts.body !== lb.fonts.body ? 1 : 0)) / 2;
    const devices = (la.devices.marker !== lb.devices.marker ? 1 : 0) + (la.devices.underline !== lb.devices.underline ? 1 : 0);
    const visual = pix(A.fingerprint, B.fingerprint);
    const same = Math.round((0.4 * palette + 0.2 * font + 0.1 * Math.min(1, devices) + 0.3 * visual * 3) * 1000) / 1000;
    // extended: the palette part over every slide's actual ground, and the case and weight differences
    const slidePal = (P: any) => P.grounds_per_slide.map((g: any, k: number) => ({ g, k }));
    void slidePal;
    const gp = (X: any) => (X.style.rhythm ?? [X.style.palette]);
    let rp = 0;
    for (let k = 0; k < 8; k++) { const ga = gp(A)[k % gp(A).length], gb = gp(B)[k % gp(B).length]; rp += (cd(ga.bg, gb.bg) + cd(ga.text, gb.text) + cd(ga.accent, gb.accent)) / 3; }
    rp /= 8;
    const caseD = (la.caseStyle ?? 'none') !== (lb.caseStyle ?? 'none') ? 1 : 0;
    const wD = Math.min(1, (Math.abs((la.weights?.headline ?? 800) - (lb.weights?.headline ?? 800)) + Math.abs((la.weights?.body ?? 500) - (lb.weights?.body ?? 500))) / 400);
    const ext = Math.round((0.3 * rp + 0.15 * font + 0.1 * Math.min(1, devices) + 0.1 * caseD + 0.05 * wD + 0.3 * visual * 3) * 1000) / 1000;
    pairs.push({ a: PRESETS[i], b: PRESETS[j], sameFormula: { palette: Math.round(palette * 1000) / 1000, font, devices, visual: Math.round(visual * 1000) / 1000, score: same, tooAlike: same < 0.25 }, extended: { rhythmPalette: Math.round(rp * 1000) / 1000, caseDiff: caseD, weightDiff: Math.round(wD * 100) / 100, score: ext, tooAlike: ext < 0.25 } });
  }
  const perPreset = Object.fromEntries(PRESETS.map((id) => {
    const p = res.presets[id];
    const ls = p.layouts as string[];
    const sizes: Record<string, number> = {};
    for (const c of p.checks) for (const [k, v] of Object.entries<number>(c.sizes)) sizes[k] = Math.min(sizes[k] ?? 999, v);
    const smaller = Object.entries(sizes).filter(([k, v]) => res.baseSizes[k] !== undefined && v < res.baseSizes[k]).map(([k, v]) => `${k} ${v} < ${res.baseSizes[k]}`);
    const fail = (p.checks as any[]).filter((c) => c.low.length).map((c, i) => ({ slide: p.checks.indexOf(c) + 1, layout: c.layout, why: c.low }));
    const groundFails = (p.grounds as any[]).flatMap((g) => Object.entries<number>(g.pairs).filter(([k, v]) => v < (k.startsWith('card vs ground') ? 1.4 : k.startsWith('accent display') ? 3 : 4.5) && !(k === 'accent as text/ground' && g.accentMode === 'marker bar')).map(([k, v]) => `${g.ground.bg}: ${k} ${v}`));
    const fb = p.fieldBg as string[];
    const near = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();
    const neighbourSame = fb.map((b, i) => (i > 0 && near(b, fb[i - 1]) ? [i, i + 1, b] : null)).filter(Boolean);
    const sat = (h: string) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return Math.max(...v) - Math.min(...v); };
    const reds = [...new Set(fb.filter((b) => sat(b) > 0.5).map((b) => b.toUpperCase()))];
    const gr = (p.style.rhythm ?? []).find((g: any) => g.gradient) ?? (p.style.closing?.gradient ? p.style.closing : null);
    const gradient = gr ? (() => { const st = gr.gradient.stops; const d = Math.sqrt([1, 3, 5].reduce((a: number, i: number) => a + (parseInt(st[0].color.slice(i, i + 2), 16) - parseInt(st[st.length - 1].color.slice(i, i + 2), 16)) ** 2, 0)); return { angle: gr.gradient.angle, stops: st.map((x: any) => x.color), stopContrast: Math.round(ratio2(st[0].color, st[st.length - 1].color) * 100) / 100, rgbDistance: Math.round(d), textOnWorstStop: Math.round(Math.min(...st.map((x: any) => ratio2(gr.text, x.color))) * 100) / 100, brandAccentOnWorstStop: Math.round(Math.min(...st.map((x: any) => ratio2(gr.accent, x.color))) * 100) / 100, accentTextOnWorstStop: (p.grounds.find((q: any) => q.ground.gradient) ?? { pairs: {} }).pairs['accent as text/ground'] }; })() : null;
    return [id, {
      neighbourSameGround: neighbourSame, fieldGrounds: fb, redGrounds: reds, gradient, variants: p.variants, groundIdx: p.groundIdx, closing: p.style.closing ? p.style.closing.bg : null, flavour: p.style.flavour ?? null,
      rhythm: (p.style.rhythm ?? []).map((g: any) => g.bg + (g.gradient ? ' (gradient)' : '')), caseStyle: p.style.caseStyle ?? 'none', weights: p.style.weights ?? null, background: p.style.background,
      distinctLayouts: new Set(ls).size, adjacentSameFamily: ls.filter((l, i) => i > 0 && FAMILY[l] === FAMILY[ls[i - 1]]).length,
      slideContrastFailures: fail, groundPairFailures: groundFails, minSlideContrast: Math.min(...p.checks.map((c: any) => c.minContrast)), minDisplayContrast: Math.min(...p.checks.map((c: any) => c.minDisplay)),
      clipped: (p.checks as any[]).filter((c) => c.clipped.length).map((c) => c.clipped), minSizes: sizes, smallerThanBaseline: smaller, deviceIds: [...new Set((p.checks as any[]).flatMap((c: any) => c.devices))],
      groundPairs: p.grounds, notes: p.notes,
    }];
  }));
  const strip = (p: any) => { const q = JSON.parse(JSON.stringify(p)); delete q.fingerprint; delete q.sheet; return q; };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ kind: 'say-creator-presets-v9', modelCalls: 0, baselineMinSizes: res.baseSizes, perPreset, pairs, presets: Object.fromEntries(PRESETS.map((id) => [id, strip(res.presets[id])])) }, null, 1));
  console.log('V2 ' + JSON.stringify(Object.fromEntries(Object.entries(perPreset).map(([k, v]: any) => [k, { rhythm: v.rhythm, fails: v.slideContrastFailures, groundFails: v.groundPairFailures, small: v.smallerThanBaseline, clipped: v.clipped.length, min: v.minSlideContrast, neigh: v.neighbourSameGround, reds: v.redGrounds, grad: v.gradient, sizes: v.minSizes, vars: v.variants }]))));
  console.log('PAIRS ' + JSON.stringify(pairs.map((p) => [p.a, p.b, p.sameFormula.score, p.extended.score])));
});


test('per-layout gallery sheet: every new layout, both variants, normal and long text, in one preset style', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/images/carousel');
  const NEW = ['prose', 'statement-stacked', 'statement-card', 'statement-pill', 'statement-question', 'contact-closing', 'cta-pair', 'numbered-stagger', 'bullet-list', 'pill-stagger', 'headline-card'];
  const b64 = await page.evaluate(async (NEW) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const style = D.styleFromPack(PR.presetPackFor('hot-flat', false)).style;
    const cols: [number, 'normal' | 'long'][] = [[0, 'normal'], [1, 'normal'], [0, 'long'], [1, 'long']];
    const w = 270, h = 338, labelW = 200;
    const c = document.createElement('canvas'); c.width = labelW + cols.length * (w + 10) + 10; c.height = NEW.length * (h + 10) + 40;
    const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif';
    cols.forEach(([v, len], i) => g.fillText(`variant ${v + 1}, ${len} text`, labelW + 10 + i * (w + 10), 24));
    for (let r = 0; r < NEW.length; r++) {
      const id = NEW[r];
      const def = L.layoutDef(id)!;
      g.fillStyle = '#ffd54a'; g.font = 'bold 18px sans-serif'; g.fillText(id, 12, 40 + r * (h + 10) + 30);
      g.fillStyle = '#fff'; g.font = '13px sans-serif'; def.variants.forEach((vn: string, k: number) => g.fillText('v' + (k + 1) + ': ' + vn, 12, 40 + r * (h + 10) + 54 + k * 18));
      for (let i = 0; i < cols.length; i++) {
        const [v, len] = cols[i];
        const out = await D.drawOne({ layout: id, fields: (def.samples as any)[len], accents: [] }, v, style, { handle: '@quick.flip', index: 2, total: 8, cut: 'plain', invert: false, density: 'normal' });
        if (!out.built) continue;
        const bm = await createImageBitmap(await F.svgToPng(out.built.svg, 540));
        g.drawImage(bm, labelW + 10 + i * (w + 10), 40 + r * (h + 10), w, h);
      }
    }
    return c.toDataURL('image/png').split(',')[1];
  }, NEW);
  fs.writeFileSync(path.join(OUT, 'layouts.png'), Buffer.from(b64, 'base64'));
});
