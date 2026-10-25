// Runs inside real Chrome. Tests call these through window.__ie.
import {
  BgRemover,
  BgRemoverError,
  composeCutout,
  maskToPng,
  subjectStats,
  type BgRemoverOptions,
  type MaskOptions,
  FabricAdapter,
  FONT_WEIGHTS,
  History,
  checkOption,
  checkThumbnails,
  coverCrop,
  fitText,
  layoutText,
  loadFonts,
  measureWidth,
  type CarouselScript,
  type Patch,
  type Plan,
  THEMES,
  applyPatch,
  validatePlan,
  checkCarousel,
  checkSlidePlan,
  composeCarousel,
  composeStyled,
  loadStyles,
  validateStyle,
  parseSvg,
  listElements,
  listPacks,
  findElements,
  type RenderReport,
  type TextLayer,
  type ThumbnailOption,
  type ThumbnailRequest,
} from '../../../src/image-engine';

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function size(blob: Blob) {
  const bm = await createImageBitmap(blob);
  const d = { width: bm.width, height: bm.height };
  bm.close();
  return d;
}

/** Renders off screen (never attached to the page). */
async function renderPlan(plan: Plan, scale = 1) {
  const t0 = performance.now();
  const a = new FabricAdapter();
  await a.mount(null);
  const report = await a.render(plan);
  const blob = await a.export({ format: 'png', scale });
  const ms = Math.round(performance.now() - t0);
  const out = { b64: await toBase64(blob), ...(await size(blob)), report, ms };
  a.dispose();
  return out;
}

async function pixels(plan: Plan, points: [number, number][]) {
  const a = new FabricAdapter();
  await a.mount(null);
  await a.render(plan);
  const bm = await createImageBitmap(await a.export({ format: 'png', scale: 1 }));
  const c = document.createElement('canvas');
  c.width = bm.width;
  c.height = bm.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bm, 0, 0);
  const out = points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
  a.dispose();
  return out;
}

/** Render, apply a patch, render, undo, render, redo. Returns every PNG. */
async function patchCycle(plan: Plan, patch: Patch) {
  const a = new FabricAdapter();
  await a.mount(null);
  const h = new History(plan);
  const shots: Record<string, string> = {};
  const revs: Record<string, number> = {};
  const snap = async (name: string) => {
    await a.render(h.plan);
    shots[name] = await toBase64(await a.export({ format: 'png', scale: 1 }));
    revs[name] = h.plan.revision;
  };
  await snap('before');
  const applied = h.apply(patch);
  await snap('after');
  const undone = h.undo();
  const planAfterUndoEqualsBefore = JSON.stringify({ ...h.plan, revision: 0 }) === JSON.stringify({ ...plan, revision: 0 });
  await snap('undone');
  const redone = h.redo();
  await snap('redone');
  const out = {
    shots,
    revs,
    ok: [applied.ok, undone?.ok, redone?.ok],
    entries: h.entries(),
    planAfterUndoEqualsBefore,
  };
  a.dispose();
  return out;
}

/** Mounts an editable canvas in #stage and records every patch it proposes. */
async function mountInteractive(plan: Plan) {
  const w = window as unknown as { __adapter?: FabricAdapter; __patches: Patch[]; __selected: (string | null)[] };
  w.__patches = [];
  w.__selected = [];
  const a = new FabricAdapter();
  await a.mount(document.getElementById('stage'));
  a.onPatchRequest((p) => w.__patches.push(p));
  a.onSelect((id) => w.__selected.push(id));
  await a.render(plan);
  w.__adapter = a;
}

async function applyToInteractive(patch: Patch) {
  const w = window as unknown as { __adapter: FabricAdapter };
  const res = await w.__adapter.applyPatch(patch);
  const blob = await w.__adapter.export({ format: 'png', scale: 1 });
  return { ok: res.ok, reasons: res.ok ? [] : res.reasons, b64: await toBase64(blob) };
}

/** Does Fabric (and text measuring) work inside a Web Worker? */
function workerProbe(): Promise<unknown> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./probe.worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => resolve({ timedOut: true }), 15000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      resolve({ workerError: e.message });
    };
    worker.postMessage('go');
  });
}

async function fontStatus() {
  await loadFonts();
  const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')} ${f.weight}`);
  const expected = Object.entries(FONT_WEIGHTS).flatMap(([family, weights]) => weights.map((w) => `${family} ${w}`));
  const ours = measureWidth('Hamburgefonstiv', 'Schibsted Grotesk', 700, 100);
  const c = document.createElement('canvas').getContext('2d')!;
  c.font = '700 100px serif';
  return { loaded, expected, ours, serif: c.measureText('Hamburgefonstiv').width };
}

// ---- background removal ----
let remover: BgRemover | null = null;

function describe(e: unknown) {
  return e instanceof BgRemoverError ? { code: e.code, message: e.message } : { code: 'unknown', message: String(e) };
}

/** Loads a model. Never throws: the answer says what happened. */
async function cutoutLoad(options: BgRemoverOptions) {
  remover?.dispose();
  remover = new BgRemover(options);
  const progress: string[] = [];
  let lastPhase = '';
  try {
    const info = await remover.load((p) => {
      if (p.phase !== lastPhase) progress.push(p.phase);
      lastPhase = p.phase;
    });
    return { ok: true as const, info, phases: progress };
  } catch (e) {
    remover = null;
    return { ok: false as const, error: describe(e), phases: progress };
  }
}

/** Cuts one picture out and returns PNGs plus measurements. */
async function cutoutRemove(url: string, mask?: MaskOptions) {
  if (!remover) return { ok: false as const, error: { code: 'disposed', message: 'No model loaded.' } };
  try {
    const blob = await (await fetch(url)).blob();
    const r = await remover.remove(blob);
    const composed = mask ? await composeCutout(blob, r.mask, mask) : null;
    const finalAlpha = composed?.alpha ?? r.mask;
    let partial = 0;
    for (let i = 0; i < finalAlpha.data.length; i++) if (finalAlpha.data[i] > 8 && finalAlpha.data[i] < 247) partial++;
    return {
      ok: true as const,
      partialAlphaShare: partial / finalAlpha.data.length,
      cutout: await toBase64(composed?.png ?? r.cutout),
      maskPng: await toBase64(await maskToPng(composed?.alpha ?? r.mask)),
      width: r.width,
      height: r.height,
      scale: r.scale,
      timings: r.timings,
      backend: r.backend,
      warm: r.warm,
      stats: subjectStats(composed?.alpha ?? r.mask),
    };
  } catch (e) {
    return { ok: false as const, error: describe(e) };
  }
}

/** A known picture for geometry checks: left half white, right half black, as a PNG data URL. */
async function halfImage() {
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 400;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 800, 400);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 400, 400);
  return c.toDataURL('image/png');
}

/** RGBA at points of a PNG given as base64. */
async function pngPixels(b64: string, points: [number, number][]) {
  const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const c = new OffscreenCanvas(bm.width, bm.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bm, 0, 0);
  return points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
}

interface CutRow {
  label: string;
  lines: string[];
  cutout?: string;
  mask?: string;
}

/** Contact sheet for cutouts: source, then per row the cutout on checkerboard, dark, light and colour, plus the mask. */
async function makeCutoutSheet(args: { sourceUrl: string; sourceLines: string[]; rows: CutRow[] }) {
  const TILE = 220;
  const load = async (src: string) => {
    const i = new Image();
    i.src = src;
    await i.decode();
    return i;
  };
  const source = await load(args.sourceUrl);
  const rows = await Promise.all(args.rows.map(async (r) => ({ ...r, cut: r.cutout ? await load('data:image/png;base64,' + r.cutout) : null, m: r.mask ? await load('data:image/png;base64,' + r.mask) : null })));
  const aspect = source.naturalHeight / source.naturalWidth;
  const th = Math.round(TILE * aspect);
  const GAP = 12;
  const HEAD = 34;
  const canvas = document.createElement('canvas');
  canvas.width = GAP + 6 * (TILE + GAP);
  const rowH = th + 70;
  canvas.height = GAP + HEAD + th + 56 + rows.length * (rowH + GAP);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const text = (t: string, x: number, y: number, bold = false, color = '#222') => {
    ctx.font = (bold ? 'bold ' : '') + '12px sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(t, x, y);
  };
  const checker = (x: number, y: number, w: number, h: number) => {
    for (let yy = 0; yy < h; yy += 10) for (let xx = 0; xx < w; xx += 10) {
      ctx.fillStyle = ((xx + yy) / 10) % 2 ? '#cfcfcf' : '#fafafa';
      ctx.fillRect(x + xx, y + yy, Math.min(10, w - xx), Math.min(10, h - yy));
    }
  };
  let y = GAP;
  text('SOURCE', GAP, y + 12, true);
  ctx.drawImage(source, GAP, y + 18, TILE, th);
  args.sourceLines.forEach((l, i) => text(l, GAP + TILE + GAP, y + 30 + i * 16));
  y += HEAD + th + 24;
  for (const r of rows) {
    text(r.label, GAP, y + 12, true);
    text(r.lines.join('   |   '), GAP + 190, y + 12, false, '#555');
    const ty = y + 20;
    const bgs: [string, string][] = [['checker', ''], ['dark', '#14181a'], ['light', '#f3f5f6'], ['colour', '#0F7B78']];
    bgs.forEach(([, colour], i) => {
      const x = GAP + i * (TILE + GAP);
      if (!colour) checker(x, ty, TILE, th);
      else {
        ctx.fillStyle = colour;
        ctx.fillRect(x, ty, TILE, th);
      }
      if (r.cut) ctx.drawImage(r.cut, x, ty, TILE, th);
      else text('no cutout', x + 8, ty + 20, false, '#C62828');
    });
    const mx = GAP + 4 * (TILE + GAP);
    if (r.m) ctx.drawImage(r.m, mx, ty, TILE, th);
    y += rowH + GAP - 10;
  }
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  return toBase64(blob);
}

function cutoutDispose() {
  remover?.dispose();
  remover = null;
}

async function imageSize(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/** Every option for one picture: PNGs, phone copies, lint. */
async function checkThumb(req: ThumbnailRequest) {
  const t0 = performance.now();
  const res = await checkThumbnails(req);
  const ms = Math.round(performance.now() - t0);
  const options = await Promise.all(
    res.map(async (r) => ({
      id: r.option.id,
      layout: r.option.layout,
      plan: r.option.plan,
      notes: r.option.notes,
      lint: r.lint,
      renderWarnings: r.render.warnings,
      png: await toBase64(r.png),
      phone: await toBase64(r.phonePng),
    })),
  );
  return { ms, options };
}

/** Checks one hand-built or hand-edited option. */
async function checkCustom(req: ThumbnailRequest, option: ThumbnailOption) {
  const r = await checkOption(req, option);
  return { lint: r.lint, phone: await toBase64(r.phonePng) };
}

interface SheetTile {
  title: string;
  pass: boolean;
  lines: string[];
  b64: string;
}

/** A contact sheet for people to look at: the source picture, then every option at phone size with its failed checks. Test tooling, not part of the engine. */
async function makeSheet(args: { sourceUrl: string; sourceLines: string[]; tiles: SheetTile[] }) {
  const TILE = 320;
  const GAP = 18;
  const imgOf = async (src: string) => {
    const i = new Image();
    i.src = src;
    await i.decode();
    return i;
  };
  const source = await imgOf(args.sourceUrl);
  const tiles = await Promise.all(args.tiles.map(async (t) => ({ ...t, img: await imgOf('data:image/png;base64,' + t.b64) })));
  const font = '12px sans-serif';
  const wrap = (ctx: CanvasRenderingContext2D, text: string) => {
    const out: string[] = [];
    let line = '';
    for (const w of text.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > TILE) {
        out.push(line);
        line = w;
      } else line = t;
    }
    if (line) out.push(line);
    return out;
  };
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const columns = [{ kind: 'src' as const }, ...tiles.map((t) => ({ kind: 'tile' as const, t }))];
  const heights = columns.map((c) => {
    if (c.kind === 'src') return Math.round((TILE * source.naturalHeight) / source.naturalWidth) + 26 + args.sourceLines.flatMap((l) => wrap(measure, l)).length * 16;
    return Math.round((TILE * c.t.img.height) / c.t.img.width) + 26 + c.t.lines.flatMap((l) => wrap(measure, l)).length * 16;
  });
  const canvas = document.createElement('canvas');
  canvas.width = GAP + columns.length * (TILE + GAP);
  canvas.height = GAP + Math.max(...heights) + GAP;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  columns.forEach((c, i) => {
    const x = GAP + i * (TILE + GAP);
    const img = c.kind === 'src' ? source : c.t.img;
    const iw = c.kind === 'src' ? source.naturalWidth : img.width;
    const ih = c.kind === 'src' ? source.naturalHeight : img.height;
    const h = Math.round((TILE * ih) / iw);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = c.kind === 'src' ? '#222222' : c.t.pass ? '#17632F' : '#C62828';
    ctx.fillText(c.kind === 'src' ? 'SOURCE' : (c.t.pass ? 'PASS  ' : 'FAIL  ') + c.t.title, x, GAP + 4);
    ctx.drawImage(img, x, GAP + 12, TILE, h);
    ctx.strokeStyle = '#cccccc';
    ctx.strokeRect(x - 0.5, GAP + 11.5, TILE + 1, h + 1);
    ctx.font = font;
    ctx.fillStyle = '#333333';
    let y = GAP + 12 + h + 18;
    for (const l of c.kind === 'src' ? args.sourceLines : c.t.lines) for (const part of wrap(ctx, l)) {
      ctx.fillText(part, x, y);
      y += 16;
    }
  });
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  return toBase64(blob);
}

// ---- Step 3: carousels ----

const themeById = (id: string) => THEMES.find((t) => t.id === id)!;

/** Composes, draws and checks one script in one theme. */
async function carouselRun(script: CarouselScript, themeId: string) {
  const t0 = performance.now();
  const checked = await checkCarousel(script, themeById(themeId));
  const ms = Math.round(performance.now() - t0);
  const slides = [];
  for (const c of checked)
    slides.push({ id: c.slide.id, type: c.slide.type, notes: c.slide.notes, plan: c.slide.plan, lint: c.lint, warnings: c.render.warnings, png: await toBase64(c.png), phone: await toBase64(c.phonePng) });
  return { ms, slides };
}

/** Draws a plan and checks it, so tests can edit a plan with patches and look again. */
async function carouselCheckPlan(plan: Plan, themeId: string) {
  const a = new FabricAdapter();
  await a.mount(null);
  try {
    const c = await checkSlidePlan(a, { id: 'x', type: 'content', plan, notes: [] }, themeById(themeId).spacing.margin);
    return { lint: c.lint, warnings: c.render.warnings, png: await toBase64(c.png), phone: await toBase64(c.phonePng) };
  } finally {
    a.dispose();
  }
}

/** Composes only (no drawing), for tests that look at the plan itself. */
function carouselCompose(script: CarouselScript, themeId: string) {
  return composeCarousel(script, themeById(themeId));
}

const patchPlan = (plan: Plan, patch: Patch) => applyPatch(plan, patch);

/** The widest box (stepping down by 2 px) at which this text ends with one word alone on its last line. */
function orphanWidth(layer: TextLayer): number | null {
  for (let w = layer.width; w >= 300; w -= 2) {
    const block = layoutText({ ...layer, width: w });
    const last = block.lines[block.lines.length - 1];
    if (block.lines.length >= 2 && last.words.length === 1) return w;
  }
  return null;
}

/** Seven slides side by side for each row (one row per theme), with a label on top of each row. */
async function makeCarouselSheet(rows: { label: string; lines?: string[]; slides: { b64: string; pass: boolean }[] }[], tileW = 270) {
  const loaded = await Promise.all(rows.map((r) => Promise.all(r.slides.map(async (s) => ({ ...s, bm: await createImageBitmap(await (await fetch('data:image/png;base64,' + s.b64)).blob()) })))));
  const gap = 12;
  const tileH = Math.round((tileW * 1350) / 1080);
  const head = 54;
  const cols = Math.max(...rows.map((r) => r.slides.length));
  const W = gap + cols * (tileW + gap);
  const H = rows.length * (head + tileH + gap) + gap;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  rows.forEach((r, ri) => {
    const y0 = gap + ri * (head + tileH + gap);
    ctx.fillStyle = '#111';
    ctx.font = '600 20px sans-serif';
    ctx.fillText(r.label, gap, y0 + 22);
    ctx.fillStyle = '#555';
    ctx.font = '14px sans-serif';
    ctx.fillText((r.lines ?? []).join('   '), gap, y0 + 44);
    loaded[ri].forEach((s, i) => {
      const x = gap + i * (tileW + gap);
      ctx.drawImage(s.bm, x, y0 + head, tileW, tileH);
      ctx.lineWidth = 4;
      ctx.strokeStyle = s.pass ? '#1b8a4b' : '#c62828';
      ctx.strokeRect(x - 2, y0 + head - 2, tileW + 4, tileH + 4);
      ctx.fillStyle = s.pass ? '#1b8a4b' : '#c62828';
      ctx.fillRect(x, y0 + head, 64, 22);
      ctx.fillStyle = '#fff';
      ctx.font = '600 14px sans-serif';
      ctx.fillText(s.pass ? 'PASS' : 'FAIL', x + 10, y0 + head + 16);
    });
  });
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  return toBase64(blob);
}

// ---- Step 5 Phase 2: learned styles ----

interface StyleRunOpts {
  width?: number;
  height?: number;
  chrome?: 'none' | 'dots-swipe' | 'page-number' | 'strip';
  anyCount?: boolean;
  elements?: 'shippable' | 'test';
  testAssets?: { name: string; url: string; width: number; height: number; tags: string[] }[];
  elementMatching?: 'tags' | 'ignore';
  /** "before-starbursts": hot-flat as it was before the starburst colour fix, to show before and after. */
  variant?: 'before-starbursts';
}

/** Size of each picture (test assets are only given as URLs). */
async function probeImages(urls: string[]) {
  return Promise.all(urls.map((url) => new Promise<{ url: string; width: number; height: number }>((res, rej) => { const i = new Image(); i.onload = () => res({ url, width: i.naturalWidth, height: i.naturalHeight }); i.onerror = () => rej(new Error(`Could not load ${url}`)); i.src = url; })));
}

/** The styles found in src/image-engine/styles/, with anything that was rejected and why. */
function styleList() {
  const { styles, problems } = loadStyles();
  return { styles: styles.map((s) => ({ spec: s.spec, warnings: s.warnings, assets: Object.keys(s.assets) })), problems };
}

const styleByName = (name: string, variant?: StyleRunOpts['variant']) => {
  const s = loadStyles().styles.find((x) => x.spec.name === name);
  if (!s) throw new Error(`No style called "${name}" was loaded.`);
  if (variant === 'before-starbursts' && s.spec.elements) {
    const spec = structuredClone(s.spec);
    for (const r of spec.elements!.rules) if (r.tags.includes('burst')) { delete r.recolourBy; r.tags = ['burst', 'sparkle', 'star']; }
    return { ...s, spec };
  }
  return s;
};

/** Composes, draws and checks every slide of a script in a style. Each slide comes back on its own. */
async function styleRun(script: CarouselScript, styleName: string, opts: StyleRunOpts = {}) {
  await loadFonts();
  const style = styleByName(styleName, opts.variant);
  const slides = composeStyled(script, style, opts, !!opts.anyCount);
  const a = new FabricAdapter();
  await a.mount(null);
  const out = [];
  try {
    for (const s of slides) {
      const c = await checkSlidePlan(a, s, style.spec.spacing.margin);
      out.push({ id: s.id, type: s.type, layout: s.layout, rule: s.rule, palette: s.palette, because: s.because, elementsUsed: s.elementsUsed, elementTags: s.elementTags ?? null, elementLinks: s.elementLinks ?? [], notes: s.notes, plan: s.plan, lint: c.lint, warnings: c.render.warnings, png: await toBase64(c.png), phone: await toBase64(c.phonePng) });
    }
  } finally {
    a.dispose();
  }
  return out;
}

/** Plans only, no drawing. */
function styleCompose(script: CarouselScript, styleName: string, opts: StyleRunOpts = {}) {
  const style = styleByName(styleName);
  return composeStyled(script, style, opts, !!opts.anyCount);
}

/** Checks a plan that was edited by hand or by patches, with the margin of the named style. */
async function styleCheckPlan(plan: Plan, styleName: string) {
  await loadFonts();
  const style = styleByName(styleName);
  const a = new FabricAdapter();
  await a.mount(null);
  try {
    const c = await checkSlidePlan(a, { id: 'x', type: 'content', plan, notes: [] }, style.spec.spacing.margin);
    return { lint: c.lint, png: await toBase64(c.png), phone: await toBase64(c.phonePng) };
  } finally {
    a.dispose();
  }
}

const svgCheck = (name: string, text: string) => parseSvg(name, text);
const styleValidate = (raw: unknown, folder: string) => validateStyle(raw, folder, new Set(listElements().flatMap((e) => e.tags.map((t) => t.toLowerCase()))));

(window as unknown as { __ie: unknown }).__ie = {
  probeImages,
  elementList: () => ({ packs: listPacks(), elements: listElements() }),
  elementFind: findElements,
  styleList,
  styleRun,
  styleCompose,
  styleCheckPlan,
  svgCheck,
  styleValidate,
  themes: () => THEMES,
  validate: validatePlan,
  orphanWidth,
  carouselRun,
  carouselCheckPlan,
  carouselCompose,
  patchPlan,
  makeCarouselSheet,
  cutoutLoad,
  cutoutRemove,
  cutoutDispose,
  halfImage,
  pngPixels,
  makeCutoutSheet,
  checkThumb,
  checkCustom,
  makeSheet,
  imageSize,
  renderPlan,
  pixels,
  patchCycle,
  mountInteractive,
  applyToInteractive,
  workerProbe,
  fontStatus,
  loadFonts,
  layout: (layer: TextLayer) => layoutText(layer),
  fit: fitText,
  measure: measureWidth,
  cover: coverCrop,
  Adapter: FabricAdapter,
  ready: true,
};

export type { RenderReport };
