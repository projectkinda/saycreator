/// <reference lib="webworker" />
// Runs the segmentation model off the main thread. Talks to BgRemover (bg-remover.ts) by messages.
// Everything it fetches comes from this site (/models, /ort). No third-party servers.
import * as ort from 'onnxruntime-web/webgpu';
import type { Backend, BackendChoice, ErrorCode } from './types';

export interface WorkerModel {
  id: string;
  label: string;
  url: string;
  bytes: number | null;
  sha256: string | null;
  size: number;
  mean: number[];
  std: number[];
  output: 'logits' | 'sigmoid-minmax';
}

export type ToWorker =
  | { type: 'load'; model: WorkerModel; backend: BackendChoice; wasmFallback: 'allow' | 'refuse'; graphOptimization: 'disabled' | 'basic' | 'extended' | 'all'; verbose?: boolean; threads?: number }
  | { type: 'remove'; id: number; bitmap: ImageBitmap; maxSide: number }
  | { type: 'dispose' };

export type FromWorker =
  | { type: 'progress'; phase: 'download' | 'cache' | 'init'; loaded: number; total: number }
  | { type: 'loaded'; info: { backend: Backend; fallbackReason?: string; downloadBytes: number; fromCache: boolean; fetchMs: number; initMs: number; inputNames: string[]; outputNames: string[] } }
  | { type: 'result'; id: number; cutout: Blob; mask: Uint8ClampedArray; width: number; height: number; scale: number; timings: { preprocessMs: number; inferenceMs: number; postprocessMs: number; totalMs: number }; backend: Backend; warm: boolean }
  | { type: 'error'; id?: number; code: ErrorCode; message: string };

class WorkerError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

const CACHE_NAME = 'creator-hub-models-v1';
const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

let session: ort.InferenceSession | null = null;
let model: WorkerModel | null = null;
let backend: Backend = 'wasm';
let inputName = '';
let outputNames: string[] = [];
let warm = false;

// A full URL (not a bare /path) so the dev server does not try to transform the runtime's dynamic import.
ort.env.wasm.wasmPaths = `${self.location.origin}/ort/`;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1;
ort.env.wasm.proxy = false;

/**
 * Browsers hand a WebGPU program only 8 storage buffers per shader unless more are asked for, even when the GPU
 * offers more (this one offers 16). Some model operators need more than 8. This asks the adapter for the number it
 * already advertises, and nothing else. Devices that really only have 8 still fail, and report it.
 */
function widenStorageBufferLimit() {
  type Adapter = { limits: Record<string, number>; requestDevice: (d?: { requiredLimits?: Record<string, number> }) => Promise<unknown> };
  const proto = (self as unknown as { GPUAdapter?: { prototype: Adapter & { __widened?: boolean } } }).GPUAdapter?.prototype;
  if (!proto || proto.__widened) return;
  const original = proto.requestDevice;
  proto.requestDevice = function (this: Adapter, desc) {
    return original.call(this, { ...desc, requiredLimits: { ...desc?.requiredLimits, maxStorageBuffersPerShaderStage: this.limits.maxStorageBuffersPerShaderStage } });
  };
  proto.__widened = true;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Reads the model from this browser's cache, or downloads it from this site (with progress) and caches it. */
async function getModel(m: WorkerModel): Promise<{ buffer: ArrayBuffer; fromCache: boolean }> {
  const key = new Request(`${m.url}?v=${m.sha256?.slice(0, 12) ?? 'unpinned'}`);
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null;
  const hit = await cache?.match(key);
  if (hit) {
    const buffer = await hit.arrayBuffer();
    if (m.bytes === null || buffer.byteLength === m.bytes) {
      post({ type: 'progress', phase: 'cache', loaded: buffer.byteLength, total: buffer.byteLength });
      return { buffer, fromCache: true };
    }
    await cache!.delete(key); // wrong size: drop it and download again
  }
  const res = await fetch(m.url);
  if (res.status === 404) throw new WorkerError('model-missing', `${m.label} has not been downloaded yet. Run "npm run fetch:models" and reload.`);
  if (!res.ok || !res.body) throw new WorkerError('model-missing', `${m.label} could not be fetched (${res.status}).`);
  const total = Number(res.headers.get('content-length') ?? m.bytes ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    post({ type: 'progress', phase: 'download', loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }
  if (m.bytes !== null && loaded !== m.bytes) throw new WorkerError('model-corrupt', `${m.label} is ${loaded} bytes but should be ${m.bytes}. Run "npm run fetch:models -- --force".`);
  if (m.sha256) {
    const sum = hex(await crypto.subtle.digest('SHA-256', bytes));
    if (sum !== m.sha256) throw new WorkerError('model-corrupt', `${m.label} does not match its checksum. Run "npm run fetch:models -- --force".`);
  }
  try {
    await cache?.put(key, new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(loaded) } }));
  } catch {
    // Cache full or blocked: the model still works, it just downloads again next time.
  }
  return { buffer: bytes.buffer, fromCache: false };
}

async function webgpuAvailable(): Promise<{ ok: boolean; reason: string }> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return { ok: false, reason: 'This browser has no WebGPU.' };
  try {
    return (await gpu.requestAdapter()) ? { ok: true, reason: '' } : { ok: false, reason: 'WebGPU is there but no graphics adapter was offered.' };
  } catch (e) {
    return { ok: false, reason: `WebGPU could not start: ${String(e)}` };
  }
}

/** A readable one-liner. ONNX Runtime sometimes reports only a bare number when its engine aborts; say so. */
const short = (e: unknown) => {
  const text = String(e instanceof Error ? e.message : e).slice(0, 300);
  return /^d+$/.test(text) ? `the runtime stopped without saying why (internal code ${text})` : text;
};

async function load(msg: Extract<ToWorker, { type: 'load' }>) {
  const t0 = performance.now();
  model = msg.model;
  if (msg.threads !== undefined) ort.env.wasm.numThreads = msg.threads;
  if (msg.verbose) {
    ort.env.logLevel = 'verbose';
    ort.env.debug = true;
  }
  const { buffer, fromCache } = await getModel(model);
  const fetchMs = performance.now() - t0;
  post({ type: 'progress', phase: 'init', loaded: 0, total: 1 });

  const gpu = msg.backend === 'wasm' ? { ok: false, reason: 'WASM was asked for.' } : await webgpuAvailable();
  if (msg.backend === 'webgpu' && !gpu.ok) throw new WorkerError('no-webgpu', gpu.reason);
  if (msg.backend === 'auto' && !gpu.ok && msg.wasmFallback === 'refuse')
    throw new WorkerError('no-webgpu', `${model.label} needs WebGPU to be fast enough, and this device has none. ${gpu.reason}`);

  const t1 = performance.now();
  if (gpu.ok) widenStorageBufferLimit();
  const bytes = new Uint8Array(buffer);
  let fallbackReason: string | undefined = msg.backend === 'wasm' ? undefined : gpu.ok ? undefined : gpu.reason;
  session = null;

  /** Starts a session on one backend and runs it once on a blank picture, so a model that cannot run is found now. */
  const attempt = async (ep: Backend): Promise<ort.InferenceSession> => {
    const opts: ort.InferenceSession.SessionOptions =
      ep === 'webgpu'
        ? { executionProviders: ['webgpu'], graphOptimizationLevel: msg.graphOptimization }
        : // Without memory planning the peak is lower, which helps a big model fit in WASM's 4 GB.
          { executionProviders: ['wasm'], graphOptimizationLevel: msg.graphOptimization, enableCpuMemArena: false, enableMemPattern: false };
    const s = await ort.InferenceSession.create(bytes, opts);
    const S = model!.size;
    const blank = new ort.Tensor('float32', new Float32Array(3 * S * S), [1, 3, S, S]);
    try {
      await s.run({ [s.inputNames[0]]: blank });
    } catch (e) {
      await s.release().catch(() => undefined);
      throw new WorkerError('inference-failed', `It started, but stopped when it was first run: ${short(e)}.`);
    }
    return s;
  };

  if (gpu.ok) {
    try {
      session = await attempt('webgpu');
      backend = 'webgpu';
    } catch (e) {
      // A failed WebGPU run can leave the runtime unusable, so the caller starts a fresh worker for any fallback.
      throw new WorkerError('webgpu-failed', `${model.label} could not run on WebGPU on this device. ${short(e)}`);
    }
  }
  if (!session) {
    try {
      session = await attempt('wasm');
      backend = 'wasm';
    } catch (e) {
      const text = short(e);
      throw new WorkerError(/memory|alloc/i.test(text) ? 'out-of-memory' : 'wasm-failed', `${model.label} could not run on this device (WASM): ${text}`);
    }
  }
  inputName = session.inputNames[0];
  outputNames = [...session.outputNames];
  warm = false;
  post({
    type: 'loaded',
    info: { backend, fallbackReason, downloadBytes: buffer.byteLength, fromCache, fetchMs, initMs: performance.now() - t1, inputNames: [...session.inputNames], outputNames },
  });
}

function canvas(w: number, h: number) {
  const c = new OffscreenCanvas(w, h);
  return { c, ctx: c.getContext('2d', { willReadFrequently: true })! };
}

async function remove(msg: Extract<ToWorker, { type: 'remove' }>) {
  if (!session || !model) throw new WorkerError('disposed', 'The model is not loaded.');
  const t0 = performance.now();
  const { bitmap } = msg;
  const s = Math.min(1, msg.maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * s));
  const h = Math.max(1, Math.round(bitmap.height * s));
  const work = canvas(w, h);
  work.ctx.imageSmoothingQuality = 'high';
  work.ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const rgba = work.ctx.getImageData(0, 0, w, h);

  // Model input: the picture squeezed to size x size, normalised, channels first.
  const S = model.size;
  const small = canvas(S, S);
  small.ctx.imageSmoothingQuality = 'high';
  small.ctx.drawImage(work.c, 0, 0, S, S);
  const px = small.ctx.getImageData(0, 0, S, S).data;
  const plane = S * S;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++)
    for (let c = 0; c < 3; c++) input[c * plane + i] = (px[i * 4 + c] / 255 - model.mean[c]) / model.std[c];
  const t1 = performance.now();

  const out = await session.run({ [inputName]: new ort.Tensor('float32', input, [1, 3, S, S]) });
  const tensor = outputNames.map((n) => out[n]).find((t) => t && t.size === plane);
  if (!tensor) throw new WorkerError('inference-failed', `The model returned no ${S}x${S} map (outputs: ${outputNames.join(', ')}).`);
  const raw = (tensor.data ?? (await tensor.getData())) as Float32Array;
  const t2 = performance.now();

  // To 0..255 probabilities.
  const prob = new Uint8ClampedArray(plane * 4);
  let lo = Infinity;
  let hi = -Infinity;
  if (model.output === 'sigmoid-minmax') for (let i = 0; i < plane; i++) { if (raw[i] < lo) lo = raw[i]; if (raw[i] > hi) hi = raw[i]; }
  for (let i = 0; i < plane; i++) {
    const p = model.output === 'logits' ? 1 / (1 + Math.exp(-raw[i])) : (raw[i] - lo) / Math.max(1e-6, hi - lo);
    const v = p * 255;
    prob[i * 4] = prob[i * 4 + 1] = prob[i * 4 + 2] = v;
    prob[i * 4 + 3] = 255;
  }
  const mSmall = canvas(S, S);
  mSmall.ctx.putImageData(new ImageData(prob, S, S), 0, 0);
  const mBig = canvas(w, h);
  mBig.ctx.imageSmoothingQuality = 'high';
  mBig.ctx.drawImage(mSmall.c, 0, 0, w, h);
  const mdata = mBig.ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    alpha[i] = mdata[i * 4];
    rgba.data[i * 4 + 3] = alpha[i];
  }
  work.ctx.putImageData(rgba, 0, 0);
  const cutout = await work.c.convertToBlob({ type: 'image/png' });
  const t3 = performance.now();

  const wasWarm = warm;
  warm = true;
  post(
    {
      type: 'result', id: msg.id, cutout, mask: alpha, width: w, height: h, scale: s,
      timings: { preprocessMs: t1 - t0, inferenceMs: t2 - t1, postprocessMs: t3 - t2, totalMs: t3 - t0 },
      backend, warm: wasWarm,
    },
    [alpha.buffer],
  );
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') await load(msg);
    else if (msg.type === 'remove') await remove(msg);
    else if (msg.type === 'dispose') {
      await session?.release();
      session = null;
    }
  } catch (err) {
    const known = err instanceof WorkerError;
    const text = short(err);
    const code: ErrorCode = known ? err.code : /memory|alloc/i.test(text) ? 'out-of-memory' : 'inference-failed';
    post({ type: 'error', id: msg.type === 'remove' ? msg.id : undefined, code, message: known ? err.message : `Something went wrong while ${msg.type === 'load' ? 'loading the model' : 'cutting out the subject'}: ${text}` });
  }
};
