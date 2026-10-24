// Step 4. Background removal in real Chrome.
// The real models are tested for what they do on this machine (which may be: cannot run). The toy self-test model
// proves the machinery (worker, both backends, cache, mask geometry, helpers). Outputs go to out/image-engine/step4/.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/step4');
const IMAGES = fs.readdirSync(path.join(ROOT, 'test-images')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const url = (f: string) => '/test-images/' + encodeURIComponent(f);
const slug = (f: string) => f.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const save = (rel: string, b64: string) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), Buffer.from(b64, 'base64'));
};

interface LoadResult {
  ok: boolean;
  info?: { model: string; backend: string; fromCache: boolean; downloadBytes: number; fallbackReason?: string; timings: { fetchMs: number; initMs: number; totalMs: number } };
  error?: { code: string; message: string };
  phases: string[];
}
interface RemoveResult {
  ok: boolean;
  error?: { code: string; message: string };
  cutout: string;
  maskPng: string;
  width: number;
  height: number;
  scale: number;
  backend: string;
  warm: boolean;
  partialAlphaShare: number;
  timings: { preprocessMs: number; inferenceMs: number; postprocessMs: number; totalMs: number };
  stats: { areaFraction: number; bboxNorm: { x: number; y: number; width: number; height: number } | null; centroidNorm: { x: number; y: number } | null };
}
const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

const report: Record<string, unknown> = {};
test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  expect(IMAGES.length, 'no pictures in test-images/').toBeGreaterThan(0);
  fs.mkdirSync(OUT, { recursive: true });
});
test.afterAll(() => fs.writeFileSync(path.join(OUT, 'step4-report.json'), JSON.stringify(report, null, 2)));
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

test('machine facts', async ({ page }) => {
  const f = await page.evaluate(async () => {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ info?: Record<string, string>; features: Set<string> } | null> } }).gpu;
    const a = gpu ? await gpu.requestAdapter() : null;
    return { webgpu: !!a, vendor: a?.info?.vendor, architecture: a?.info?.architecture, shaderF16: !!a?.features.has('shader-f16'), crossOriginIsolated, cores: navigator.hardwareConcurrency, ua: navigator.userAgent };
  });
  report.machine = f;
  expect(f.crossOriginIsolated).toBe(true); // needed for threaded WASM
});

test('self-test model: a known left-white / right-black picture gives a mask on the left, on both backends', async ({ page }) => {
  const data = await call<string>(page, 'halfImage');
  for (const backend of ['webgpu', 'wasm'] as const) {
    const load = await call<LoadResult>(page, 'cutoutLoad', { model: 'selftest', backend });
    expect(load.ok, JSON.stringify(load.error)).toBe(true);
    expect(load.info!.backend).toBe(backend);
    const r = await call<RemoveResult>(page, 'cutoutRemove', data);
    expect(r.ok).toBe(true);
    expect([r.width, r.height]).toEqual([800, 400]);
    expect(r.stats.areaFraction).toBeGreaterThan(0.47);
    expect(r.stats.areaFraction).toBeLessThan(0.53);
    expect(r.stats.centroidNorm!.x).toBeGreaterThan(0.22);
    expect(r.stats.centroidNorm!.x).toBeLessThan(0.28);
    expect(r.stats.centroidNorm!.y).toBeGreaterThan(0.47);
    expect(r.stats.centroidNorm!.y).toBeLessThan(0.53);
    const px = await call<number[][]>(page, 'pngPixels', r.cutout, [[100, 200], [700, 200]]);
    expect(px[0][3]).toBeGreaterThanOrEqual(250); // left: (almost) fully opaque; the toy's sigmoid tops out near 253
    expect(px[0][0]).toBeGreaterThan(240); // and still white
    expect(px[1][3]).toBeLessThanOrEqual(2); // right: transparent
    save(`geometry-${backend}-cutout.png`, r.cutout);
    save(`geometry-${backend}-mask.png`, r.maskPng);
  }
});

test('self-test model on every picture, both backends: outputs, contact sheets, same answer on both', async ({ page }) => {
  test.setTimeout(300_000);
  const results: Record<string, Record<string, RemoveResult>> = {};
  const loads: Record<string, LoadResult> = {};
  for (const backend of ['webgpu', 'wasm'] as const) {
    loads[backend] = await call<LoadResult>(page, 'cutoutLoad', { model: 'selftest', backend, maxSide: 2048 });
    expect(loads[backend].ok).toBe(true);
    for (const f of IMAGES) {
      const r = await call<RemoveResult>(page, 'cutoutRemove', url(f));
      expect(r.ok, `${f} on ${backend}: ${JSON.stringify(r.error)}`).toBe(true);
      expect(r.backend).toBe(backend);
      (results[f] ??= {})[backend] = r;
      save(`selftest-${backend}/${slug(f)}-cutout.png`, r.cutout);
      save(`selftest-${backend}/${slug(f)}-mask.png`, r.maskPng);
    }
  }
  const summary: unknown[] = [];
  for (const f of IMAGES) {
    const g = results[f].webgpu;
    const w = results[f].wasm;
    expect(Math.abs(g.stats.areaFraction - w.stats.areaFraction), `${f}: backends agree on subject size`).toBeLessThan(0.01);
    summary.push({ image: f, width: g.width, height: g.height, scale: g.scale, areaFraction: g.stats.areaFraction, webgpuMs: g.timings.totalMs, wasmMs: w.timings.totalMs });
    const sheet = await call<string>(page, 'makeCutoutSheet', {
      sourceUrl: url(f),
      sourceLines: [f, `${g.width}x${g.height} px (worked at ${Math.round(g.scale * 100)}% of the original)`, 'PIPELINE SELF-TEST: brightness becomes the mask.', 'This is NOT a real background remover.'],
      rows: (['webgpu', 'wasm'] as const).map((b) => ({ label: `self-test on ${b}`, lines: [`inference ${Math.round(results[f][b].timings.inferenceMs)} ms, total ${Math.round(results[f][b].timings.totalMs)} ms`, `subject ${(results[f][b].stats.areaFraction * 100).toFixed(1)}% of the picture`], cutout: results[f][b].cutout, mask: results[f][b].maskPng })),
    });
    save(`selftest-sheets/${slug(f)}-sheet.png`, sheet);
  }
  report.selftest = { loads: Object.fromEntries(Object.entries(loads).map(([k, v]) => [k, v.info])), images: summary };
});

test('mask options: feathering adds soft edge pixels, hole filling and decontamination run without error', async ({ page }) => {
  await call(page, 'cutoutLoad', { model: 'selftest', backend: 'wasm' });
  const f = IMAGES[0];
  const plain = await call<RemoveResult>(page, 'cutoutRemove', url(f));
  const soft = await call<RemoveResult>(page, 'cutoutRemove', url(f), { featherPx: 8 });
  const all = await call<RemoveResult>(page, 'cutoutRemove', url(f), { featherPx: 4, fillHolesMaxShare: 0.01, decontaminatePx: 4 });
  expect(plain.ok && soft.ok && all.ok).toBe(true);
  expect(soft.partialAlphaShare).toBeGreaterThan(plain.partialAlphaShare);
  expect(all.stats.areaFraction).toBeGreaterThanOrEqual(plain.stats.areaFraction - 0.02);
  save(`options-${slug(f)}-plain.png`, plain.cutout);
  save(`options-${slug(f)}-feather8.png`, soft.cutout);
  save(`options-${slug(f)}-all.png`, all.cutout);
  report.maskOptions = { image: f, partialAlphaShare: { plain: plain.partialAlphaShare, feather8: soft.partialAlphaShare, all: all.partialAlphaShare } };
});

test('model files are read from the browser cache the second time, with no second download', async ({ page }) => {
  const modelRequests: string[] = [];
  page.on('request', (r) => r.url().includes('/models/selftest.onnx') && modelRequests.push(r.url()));
  const first = await call<LoadResult>(page, 'cutoutLoad', { model: 'selftest', backend: 'wasm' });
  const second = await call<LoadResult>(page, 'cutoutLoad', { model: 'selftest', backend: 'wasm' });
  expect(first.ok && second.ok).toBe(true);
  expect(second.info!.fromCache).toBe(true);
  expect(modelRequests.length).toBe(1);
  report.cache = { firstFromCache: first.info!.fromCache, secondFromCache: second.info!.fromCache, downloads: modelRequests.length };
});

test('a blocked model is refused with its reason, and nothing was downloaded for it', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => r.url().includes('isnet') && !r.url().includes('manifest') && asked.push(r.url()));
  const r = await call<LoadResult>(page, 'cutoutLoad', { model: 'isnet-general-use', backend: 'auto' });
  expect(r.ok).toBe(false);
  expect(r.error!.code).toBe('model-blocked');
  expect(r.error!.message).toMatch(/unclear/i);
  expect(asked).toEqual([]);
  report.isnet = r.error;
});

test('BiRefNet_lite: either it works, or it says plainly why not, and the page stays healthy', async ({ page }) => {
  test.setTimeout(600_000);
  const t0 = Date.now();
  const r = await call<LoadResult>(page, 'cutoutLoad', { model: 'birefnet-lite', backend: 'auto', wasmFallback: 'allow', maxSide: 2048 });
  report.birefnet = { ok: r.ok, ms: Date.now() - t0, info: r.info, error: r.error };
  if (!r.ok) {
    expect(['webgpu-failed', 'wasm-failed', 'out-of-memory', 'no-webgpu', 'inference-failed']).toContain(r.error!.code);
    expect(r.error!.message.length).toBeGreaterThan(30);
    // the page must still be usable afterwards
    const again = await call<LoadResult>(page, 'cutoutLoad', { model: 'selftest', backend: 'wasm' });
    expect(again.ok).toBe(true);
    return;
  }
  // If a future setup makes it run, record real cutouts for every picture.
  for (const f of IMAGES) {
    const c = await call<RemoveResult>(page, 'cutoutRemove', url(f));
    expect(c.ok, JSON.stringify(c.error)).toBe(true);
    save(`birefnet-lite/${slug(f)}-cutout.png`, c.cutout);
    save(`birefnet-lite/${slug(f)}-mask.png`, c.maskPng);
  }
});
