// Runs inside real Chrome. Tests call these through window.__ie.
import {
  FabricAdapter,
  FONT_WEIGHTS,
  History,
  coverCrop,
  fitText,
  layoutText,
  loadFonts,
  measureWidth,
  type Patch,
  type Plan,
  type RenderReport,
  type TextLayer,
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

(window as unknown as { __ie: unknown }).__ie = {
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
