// Presets v3 (ZERO model calls; presets are NOT routed through the library in the app, only in this harness): the same fixed 8-slide sample for the 7 built-in presets, drawn by the
// layout library with the preset's palette rhythm, case, weights and gradient (packFromStyle -> styleFromPack). Output: out/presets-v5/.
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(30 * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
const OUT = path.resolve(process.cwd(), 'out/presets-v5');
const PRESETS = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
const SPECS = [
  { layout: 'statement', fields: { kicker: 'New on Kickstarter', headline: 'A hoodie that flips into a backpack', caption: 'One piece. Two jobs.' }, accents: ['backpack'] },
  { layout: 'big-stat', fields: { number: '10', label: 'seconds to flip it', source: 'Measured in our workshop' }, accents: [] },
  { layout: 'stepper', fields: { title: 'How to flip it', steps: ['Zip the hood into the pocket', 'Fold the sleeves behind you', 'Pull the straps and go'] }, accents: [] },
  { layout: 'quote', fields: { quote: 'I stopped carrying a bag the day this arrived.', author: 'An early backer' }, accents: ['stopped carrying'] },
  { layout: 'checklist', fields: { title: 'What you get', items: ['Waterproof shell', 'Fits a 16-inch laptop', 'Machine washable'] }, accents: [] },
  { layout: 'stat-bar', fields: { number: '$500,000', label: 'for 5% of the company', bar: '5', note: 'Open to 20 backers only.' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' }, accents: ['built it'] },
  { layout: 'cta-button', fields: { headline: 'Early backers save 30%', button: 'Back on Kickstarter', sub: 'Open to 20 backers only.' }, accents: ['save 30%'] },
];
const FAMILY: Record<string, string> = { statement: 'hero', 'lead-statement': 'hero', 'big-question': 'hero', 'cta-button': 'hero', 'big-stat': 'stat', 'stat-bar': 'stat', stepper: 'list', checklist: 'list', 'split-text': 'text', quote: 'text' };

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
        const under = layers.filter((q: any) => q.kind === 'shape' && typeof q.fill === 'string' && /^#[0-9a-f]{6}/i.test(q.fill) && (q.opacity ?? 1) >= 0.95 && q.x <= cx && q.x + q.width >= cx && q.y <= cy && q.y + q.height >= cy && q.width * q.height < 1080 * 1350 * 0.9).sort((a: any, b: any) => a.width * a.height - b.width * b.height)[0];
        const bg = under ? (under.fill as string) : bgField;
        const hl = l.highlight && l.highlight.color && l.highlight.color.length >= 7 && !/^(transparent|none)$/i.test(l.highlight.color) ? l.highlight : null;
        const pairs: [string, string][] = [[l.style.color, bg]];
        for (const r of l.runs ?? []) pairs.push(hl ? [r.color, hl.color] : [r.color, bg]);
        for (const [a, b] of pairs) { const r = ratio(a, b); const disp = l.style.size >= 96; if (disp) minD = Math.min(minD, r); else minC = Math.min(minC, r); if (r < (disp ? 3 : 4.5)) low.push(`${chrome ? 'chrome ' : ''}${l.name} ${a} on ${b} = ${r.toFixed(2)}`); }
      }
      return { layout, minContrast: Math.round(minC * 100) / 100, minDisplay: Math.round(minD * 100) / 100, low, sizes, clipped };
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
      const pack = { ...base, devices: { marker: spec.shape.marker === 'box', underline: spec.shape.marker === 'underline', profileHeader: false, slides: 1, counts: { marker: 0, profileHeader: 0, underline: 0 } } };
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
      g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText(id, 12, 10 + r * (h + 10) + 30);
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
      clipped: (p.checks as any[]).filter((c) => c.clipped.length).map((c) => c.clipped), minSizes: sizes, smallerThanBaseline: smaller,
      groundPairs: p.grounds, notes: p.notes,
    }];
  }));
  const strip = (p: any) => { const q = JSON.parse(JSON.stringify(p)); delete q.fingerprint; delete q.sheet; return q; };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ kind: 'say-creator-presets-v5', modelCalls: 0, baselineMinSizes: res.baseSizes, perPreset, pairs, presets: Object.fromEntries(PRESETS.map((id) => [id, strip(res.presets[id])])) }, null, 1));
  console.log('V2 ' + JSON.stringify(Object.fromEntries(Object.entries(perPreset).map(([k, v]: any) => [k, { rhythm: v.rhythm, fails: v.slideContrastFailures, groundFails: v.groundPairFailures, small: v.smallerThanBaseline, clipped: v.clipped.length, min: v.minSlideContrast, neigh: v.neighbourSameGround, reds: v.redGrounds, grad: v.gradient, sizes: v.minSizes, vars: v.variants }]))));
  console.log('PAIRS ' + JSON.stringify(pairs.map((p) => [p.a, p.b, p.sameFormula.score, p.extended.score])));
});
