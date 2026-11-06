// Presets check (ZERO model calls, no app code changed): do the built-in "Pick a style" presets work through the library route, and do they look different?
//
//   FINDING (see report.json "routing"): a preset is NOT routed through designLibrary.ts. chooseRoute() sends every style that is not the active reference to the template ("pack")
//   route. The only existing bridge from a preset to the library is packFromStyle() (a "Basic" pack from the FIRST palette + fonts) followed by styleFromPack().
//   So this spec renders each preset two ways from ONE fixed 8-slide sample:
//     library : packFromStyle(preset) -> styleFromPack() (+ the preset's marker/underline default as an override) -> the library's rotateVariants/rotateCuts/buildSlide.
//               This is what the library WOULD draw for the preset; the app does not do it today.
//     app     : composeDoc(doc with style = preset) + renderer: what the app really draws today when the preset is picked.
//   Output: out/presets/<id>/sheet.png (library), out/presets/<id>/app-sheet.png, out/presets/all-presets.png (library, 4 slides per row), out/presets/all-presets-app.png, report.json.
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(30 * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
const OUT = path.resolve(process.cwd(), 'out/presets');
const PRESETS = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];

// ONE fixed sample: the same text and the same 8 slides for every preset.
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
const FAMILY: Record<string, string> = { statement: 'hero', 'lead-statement': 'hero', 'big-question': 'hero', 'cta-button': 'hero', 'photo-led': 'hero', 'big-stat': 'stat', 'stat-bar': 'stat', 'stat-grid': 'stat', stepper: 'list', checklist: 'list', 'numbered-list': 'list', timeline: 'list', 'card-grid': 'list', spotlight: 'list', 'split-text': 'text', 'feature-slider': 'text', quote: 'text', comparison: 'text', 'step-numeral': 'numeral', 'listicle-numeral': 'numeral' };

test('presets: mapping, library renders, app renders, checks', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/images/carousel');
  const res = await page.evaluate(async ({ presets, specs }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const R = await import('/src/carousel/render.ts');
    const P = await import('/src/reference/pack.ts');
    const DOC = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    const F = await import('/src/reference/faithful.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const rgbOf = (c: string) => C.parseColor(c).rgb;
    const ratio = (a: string, b: string) => C.contrastRgb(rgbOf(a), rgbOf(b));
    const solid = (v: any) => (typeof v === 'string' ? v : v?.stops?.[0]?.color ?? '#000000');
    let calls = 0; // nothing in this test can call a model: there is no provider
    const out: any = { calls: 0, presets: {} };
    const loaded = R.carouselStyles();

    // the library draw: the real redrawLibraryDeck on a plan of the fixed sample
    const drawLibrary = async (pack: any) => {
      const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style: null, styleNotes: [], plan: { title: 'Sample', specs: specs.map((s: any) => ({ ...s })) } };
      return D.redrawLibraryDeck(lib, { pack, hasPhoto: false }, '@quick.flip');
    };
    const toBitmaps = async (svgs: string[]) => Promise.all(svgs.map(async (s) => createImageBitmap(await F.svgToPng(s, 540))));
    const fingerprint = (bm: ImageBitmap) => {
      const c = document.createElement('canvas'); c.width = 12; c.height = 15;
      const g = c.getContext('2d')!; g.drawImage(bm, 0, 0, 12, 15);
      return Array.from(g.getImageData(0, 0, 12, 15).data).filter((_, i) => i % 4 !== 3);
    };
    const sheetOf = (bms: ImageBitmap[], n: number, w: number) => {
      const h = Math.round(w * 1.25);
      const c = document.createElement('canvas'); c.width = n * (w + 10) + 10; c.height = h + 20;
      const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
      bms.slice(0, n).forEach((b, i) => g.drawImage(b, 10 + i * (w + 10), 10, w, h));
      return c;
    };
    const b64 = (c: HTMLCanvasElement) => c.toDataURL('image/png').split(',')[1];

    const rowsLib: Record<string, ImageBitmap[]> = {};
    const rowsApp: Record<string, ImageBitmap[]> = {};
    for (const id of presets) {
      const ls = loaded.find((s: any) => s.spec.name === id)!;
      const spec: any = ls.spec;
      const info: any = { title: spec.title, spec: { fonts: spec.fonts, caseStyle: spec.caseStyle, chrome: spec.chrome, shape: spec.shape, margin: spec.spacing.margin, rhythm: spec.rhythm, palettes: Object.fromEntries(Object.entries<any>(spec.palettes).map(([k, v]) => [k, { bg: solid(v.bg), text: solid(v.text), accent: solid(v.accent), surface: solid(v.surface) }])), notReproduced: spec.notReproduced, coverLayouts: (spec.layouts.cover ?? []).map((x: any) => x.use) } };
      // ---- library mapping ----
      const base = P.packFromStyle(spec);
      const pack = { ...base, devices: { marker: spec.shape.marker === 'box', underline: spec.shape.marker === 'underline', profileHeader: false, slides: 1, counts: { marker: 0, profileHeader: 0, underline: 0 } } };
      const m = D.styleFromPack(pack);
      const rawFirst = Object.values<any>(spec.palettes)[0];
      info.library = { style: m.style, notes: m.notes, palette_used: Object.keys(spec.palettes)[0], bridgeDropped: { otherPalettes: Object.keys(spec.palettes).slice(1), backgroundGradient: typeof rawFirst.bg !== 'string' } };
      const lib = await drawLibrary(pack);
      const slides = Object.entries<any>(lib.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s);
      info.library.layouts = lib.library.layouts; info.library.cuts = lib.library.cuts; info.library.inverts = lib.library.inverts; info.library.variants = lib.library.variants; info.library.drawn = slides.length;
      // ---- checks on the library slides ----
      const checks: any[] = [];
      slides.forEach((s: any, i: number) => {
        const layers = (s.built.layers as any[]);
        const bgField = s.built.bg as string;
        const lowContrast: string[] = [];
        let minC = 99;
        const clipped: string[] = [];
        for (const l of layers) {
          if (l.kind !== 'text' || !l.text || String(l.name).startsWith('recurring')) {
            if (l.kind === 'text' && String(l.name).startsWith('recurring')) {
              if (l.x < 0 || l.x + l.width > 1080 + 1 || l.y < 0 || l.y + l.height > 1350 + 1) clipped.push('chrome ' + l.name);
            }
            continue;
          }
          // the ground under the text: the smallest filled shape (a button pill, a card) that holds the text's centre, else the slide's ground
          const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
          const under = layers.filter((q: any) => q.kind === 'shape' && typeof q.fill === 'string' && /^#[0-9a-f]{6}/i.test(q.fill) && (q.opacity ?? 1) >= 0.95 && q.x <= cx && q.x + q.width >= cx && q.y <= cy && q.y + q.height >= cy && q.width * q.height < 1080 * 1350 * 0.9).sort((a: any, b: any) => a.width * a.height - b.width * b.height)[0];
          const bg = under ? (under.fill as string) : bgField;
          const col = l.style.color as string;
          const c0 = ratio(col, bg);
          const runs = (l.runs ?? []).map((r: any) => r.color as string);
          const hl = l.highlight && l.highlight.color && !/^(transparent|none)$/i.test(l.highlight.color) && l.highlight.color.length >= 7 ? l.highlight : null;
          const pairs: [string, string][] = [[col, bg]];
          for (const rc of runs) pairs.push(hl ? [rc, hl.color] : [rc, bg]);
          for (const [a, b] of pairs) { const r = ratio(a, b); minC = Math.min(minC, r); if (r < 4.5) lowContrast.push(`${l.name} ${a} on ${b} = ${r.toFixed(2)}`); }
          void c0;
          if (l.x < -1 || l.x + l.width > 1080 + 1 || l.y < 0 || l.y + l.height > 1350 + 1) clipped.push(`${l.name} box (${Math.round(l.x)},${Math.round(l.y)},${Math.round(l.width)}x${Math.round(l.height)})`);
        }
        checks.push({ slide: i + 1, layout: lib.library.layouts[i], cut: lib.library.cuts[i], invert: lib.library.inverts[i], minContrast: Math.round(minC * 100) / 100, lowContrast, clipped });
      });
      info.library.checks = checks;
      info.library.fallbacks = lib.library.codeAdjustments;
      const bms = await toBitmaps(slides.map((s: any) => s.built.svg));
      rowsLib[id] = bms;
      info.library.fingerprint = bms.map(fingerprint);
      info.library.sheet = b64(sheetOf(bms, 8, 270));
      // ---- the app's real preset route ----
      const script = { title: 'Sample', brand: { handle: '@quick.flip' }, slides: specs.map((s: any) => D.scriptSlideOf(s.layout, s.fields)) };
      const v = S.validateScriptText(JSON.stringify(script), 'carousel');
      info.app = { scriptOk: !!v.script, errors: v.errors.slice(0, 3).map((e: any) => e.message) };
      if (v.script) {
        const doc: any = { ...DOC.emptyDoc(id), script: v.script };
        const composed = R.composeDoc(doc);
        const pngs: Blob[] = [];
        const lint: any[] = [];
        for (const sl of composed.slides) { const r = await R.renderer.render(sl as any, composed.margin); pngs.push(r.png); lint.push({ type: sl.type, layout: (sl as any).layout, lint: (r.lint ?? []).filter((x: any) => x.severity !== 'info').map((x: any) => x.message ?? x.rule ?? String(x)).slice(0, 3), notes: (sl as any).notes?.slice(0, 2) }); }
        const abm = await Promise.all(pngs.map((b) => createImageBitmap(b)));
        rowsApp[id] = abm;
        info.app.slides = lint;
        info.app.sheet = b64(sheetOf(abm, 8, 270));
        info.app.fingerprint = abm.map(fingerprint);
      }
      out.presets[id] = info;
    }
    // combined images: one row per preset, first 4 slides
    const combo = (rows: Record<string, ImageBitmap[]>) => {
      const w = 270, h = 338;
      const c = document.createElement('canvas'); c.width = 4 * (w + 10) + 10 + 190; c.height = presets.length * (h + 10) + 10;
      const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
      presets.forEach((id: string, r: number) => {
        g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText(id, 12, 10 + r * (h + 10) + 30);
        (rows[id] ?? []).slice(0, 4).forEach((b, i) => g.drawImage(b, 190 + 10 + i * (w + 10), 10 + r * (h + 10), w, h));
      });
      return b64(c);
    };
    out.comboLib = combo(rowsLib);
    out.comboApp = combo(rowsApp);
    return out;
  }, { presets: PRESETS, specs: SPECS });

  // ---------- write images ----------
  for (const id of PRESETS) {
    const d = path.join(OUT, id);
    fs.mkdirSync(d, { recursive: true });
    const p = res.presets[id];
    fs.writeFileSync(path.join(d, 'sheet.png'), Buffer.from(p.library.sheet, 'base64'));
    if (p.app.sheet) fs.writeFileSync(path.join(d, 'app-sheet.png'), Buffer.from(p.app.sheet, 'base64'));
  }
  fs.writeFileSync(path.join(OUT, 'all-presets.png'), Buffer.from(res.comboLib, 'base64'));
  fs.writeFileSync(path.join(OUT, 'all-presets-app.png'), Buffer.from(res.comboApp, 'base64'));

  // ---------- numbers ----------
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const cd = (a: string, b: string) => Math.sqrt(hex(a).reduce((s, v, i) => s + (v - hex(b)[i]) ** 2, 0)) / 441.7;
  const pairs: any[] = [];
  for (let i = 0; i < PRESETS.length; i++) for (let j = i + 1; j < PRESETS.length; j++) {
    const A = res.presets[PRESETS[i]], B = res.presets[PRESETS[j]];
    const la = A.library.style, lb = B.library.style;
    const palette = (cd(la.palette.bg, lb.palette.bg) + cd(la.palette.text, lb.palette.text) + cd(la.palette.accent, lb.palette.accent)) / 3;
    const font = ((la.fonts.headline !== lb.fonts.headline ? 1 : 0) + (la.fonts.body !== lb.fonts.body ? 1 : 0)) / 2;
    const chrome = A.spec.chrome !== B.spec.chrome ? 1 : 0; // the app's chrome token; the library draws the SAME chrome for every preset
    const pix = (fa: number[][], fb: number[][]) => { const n = Math.min(fa.length, fb.length); let t = 0; for (let k = 0; k < n; k++) t += fa[k].reduce((s, v, q) => s + Math.abs(v - fb[k][q]), 0) / fa[k].length / 255; return n ? t / n : 0; };
    const libVisual = pix(A.library.fingerprint, B.library.fingerprint);
    const appVisual = A.app.fingerprint && B.app.fingerprint ? pix(A.app.fingerprint, B.app.fingerprint) : null;
    const devices = (la.devices.marker !== lb.devices.marker ? 1 : 0) + (la.devices.underline !== lb.devices.underline ? 1 : 0);
    const libScore = Math.round((0.4 * palette + 0.2 * font + 0.1 * Math.min(1, devices) + 0.3 * libVisual * 3) * 1000) / 1000;
    const appScore = appVisual === null ? null : Math.round((0.35 * (A.spec.fonts.headline !== B.spec.fonts.headline || A.spec.fonts.body !== B.spec.fonts.body ? 1 : 0) + 0.15 * chrome + 0.1 * (A.spec.caseStyle !== B.spec.caseStyle ? 1 : 0) + 0.4 * appVisual * 3) * 1000) / 1000;
    pairs.push({ a: PRESETS[i], b: PRESETS[j], library: { palette: Math.round(palette * 1000) / 1000, font, devices, visual: Math.round(libVisual * 1000) / 1000, score: libScore, tooAlike: libScore < 0.25 }, app: { chrome, visual: appVisual === null ? null : Math.round(appVisual * 1000) / 1000, score: appScore, tooAlike: appScore !== null && appScore < 0.25 } });
  }
  const summary = Object.fromEntries(PRESETS.map((id) => {
    const p = res.presets[id];
    const ls = p.library.layouts as string[];
    const adj = ls.filter((l, i) => i > 0 && FAMILY[l] === FAMILY[ls[i - 1]]).length;
    const c = p.library.checks as any[];
    return [id, {
      distinctLayouts: new Set(ls).size, adjacentSameFamily: adj, layouts: ls, cuts: p.library.cuts, inverts: p.library.inverts,
      contrastFailures: c.filter((x) => x.lowContrast.length).map((x) => ({ slide: x.slide, layout: x.layout, why: x.lowContrast })),
      minContrast: Math.min(...c.map((x) => x.minContrast)),
      clipped: c.filter((x) => x.clipped.length).map((x) => ({ slide: x.slide, what: x.clipped })),
      drawn: p.library.drawn, codeAdjustments: p.library.fallbacks,
    }];
  }));
  const strip = (p: any) => { const q = JSON.parse(JSON.stringify(p)); delete q.library.fingerprint; delete q.library.sheet; if (q.app) { delete q.app.fingerprint; delete q.app.sheet; } return q; };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
    kind: 'say-creator-presets-check', modelCalls: res.calls,
    routing: 'A preset is not drawn by the library route: chooseRoute() sends any style that is not the active reference to the template route. The library renders below use the existing bridge packFromStyle() -> styleFromPack() (+ the preset marker/underline default), i.e. what the library WOULD draw. "app" renders are what the app draws today.',
    sample: SPECS, perPreset: summary, pairs, presets: Object.fromEntries(PRESETS.map((id) => [id, strip(res.presets[id])])),
  }, null, 1));
  console.log('PRESETS', JSON.stringify(summary), JSON.stringify(pairs.map((p) => [p.a, p.b, p.library.score, p.app.score])));
});
