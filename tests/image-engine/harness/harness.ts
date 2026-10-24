// Runs inside real Chrome. Tests call these through window.__ie.
import {
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
  type Patch,
  type Plan,
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

(window as unknown as { __ie: unknown }).__ie = {
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
