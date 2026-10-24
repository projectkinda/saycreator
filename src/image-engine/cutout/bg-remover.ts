// Background removal behind a small interface. The model runs in a Web Worker.
// Interface: load(onProgress), remove(image) -> { cutout, mask, timings }, dispose().
import type { FromWorker, ToWorker, WorkerModel } from './bg-worker';
import { BgRemoverError, type BackendChoice, type BgRemoverOptions, type LoadInfo, type LoadProgress, type ModelEntry, type RemoveResult } from './types';

export const MODELS_BASE = '/models/';

export async function loadManifest(): Promise<ModelEntry[]> {
  let res: Response;
  try {
    res = await fetch(`${MODELS_BASE}manifest.json`);
  } catch {
    throw new BgRemoverError('model-missing', 'The model list could not be read. Is the dev server running?');
  }
  if (!res.ok) throw new BgRemoverError('model-missing', 'No models are installed. Run "npm run fetch:models" and reload.');
  return (await res.json()).models as ModelEntry[];
}

type Source = Blob | ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

export class BgRemover {
  private worker: Worker | null = null;
  private next = 1;
  private pending = new Map<number, { resolve: (r: RemoveResult) => void; reject: (e: Error) => void }>();
  private loadWait: { resolve: (i: LoadInfo) => void; reject: (e: Error) => void } | null = null;
  private onProgress: ((p: LoadProgress) => void) | undefined;
  private info: LoadInfo | null = null;
  private disposed = false;

  constructor(readonly options: BgRemoverOptions) {}

  get loadInfo() {
    return this.info;
  }

  /**
   * Downloads (or reads from this browser's cache) the model and starts it on WebGPU or WASM.
   * Rejects with a BgRemoverError that says plainly what is wrong; it never leaves the page broken.
   */
  async load(onProgress?: (p: LoadProgress) => void): Promise<LoadInfo> {
    if (this.disposed) throw new BgRemoverError('disposed', 'This remover was already disposed.');
    if (this.info) return this.info;
    this.onProgress = onProgress;
    const t0 = performance.now();
    onProgress?.({ phase: 'manifest', loaded: 0, total: 1 });
    const entry = (await loadManifest()).find((m) => m.id === this.options.model);
    if (!entry) throw new BgRemoverError('model-missing', `Model "${this.options.model}" is not in the model list.`);
    if (entry.status !== 'approved') throw new BgRemoverError('model-blocked', `${entry.label} is blocked: ${entry.blockedBecause ?? 'its licence is not approved'}`);

    const model: WorkerModel = {
      id: entry.id,
      label: entry.label,
      url: `${MODELS_BASE}${entry.file}`,
      bytes: entry.bytes,
      sha256: entry.sha256,
      size: entry.input.size,
      mean: entry.input.mean,
      std: entry.input.std,
      output: entry.input.output,
    };
    const choice = this.options.backend ?? 'auto';
    const wasmFallback = this.options.wasmFallback ?? (entry.id.startsWith('birefnet') ? 'refuse' : 'allow');

    const start = (backend: BackendChoice) =>
      new Promise<LoadInfo>((resolve, reject) => {
        const worker = new Worker(new URL('./bg-worker.ts', import.meta.url), { type: 'module', name: `cutout-${entry.id}` });
        this.worker = worker;
        worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
        worker.onerror = (e) => this.failAll(new BgRemoverError('wasm-failed', `The cutout worker stopped: ${e.message || 'unknown reason'}`));
        this.loadWait = { resolve, reject };
        worker.postMessage({ type: 'load', model, backend, wasmFallback, graphOptimization: this.options.graphOptimization ?? 'all', verbose: this.options.verbose, threads: this.options.wasmThreads } satisfies ToWorker);
      });

    let info: LoadInfo;
    try {
      info = await start(choice);
    } catch (e) {
      this.teardown();
      const err = e as BgRemoverError;
      if (choice === 'auto' && wasmFallback === 'allow' && err.code === 'webgpu-failed') {
        try {
          info = await start('wasm');
          info = { ...info, fallbackReason: err.message };
        } catch (e2) {
          this.teardown();
          const second = e2 as BgRemoverError;
          throw new BgRemoverError(second.code, `${err.message} WASM was tried next: ${second.message}`);
        }
      } else throw err;
    }
    this.info = { ...info, timings: { ...info.timings, totalMs: performance.now() - t0 } };
    return this.info;
  }

  private onMessage(m: FromWorker) {
    if (m.type === 'progress') this.onProgress?.({ phase: m.phase, loaded: m.loaded, total: m.total });
    else if (m.type === 'loaded') {
      this.loadWait?.resolve({
        model: this.options.model,
        backend: m.info.backend,
        fallbackReason: m.info.fallbackReason,
        downloadBytes: m.info.downloadBytes,
        fromCache: m.info.fromCache,
        timings: { fetchMs: m.info.fetchMs, initMs: m.info.initMs, totalMs: m.info.fetchMs + m.info.initMs },
        inputNames: m.info.inputNames,
        outputNames: m.info.outputNames,
      });
      this.loadWait = null;
    } else if (m.type === 'result') {
      const p = this.pending.get(m.id);
      this.pending.delete(m.id);
      p?.resolve({
        cutout: m.cutout,
        mask: { data: m.mask, width: m.width, height: m.height },
        width: m.width,
        height: m.height,
        scale: m.scale,
        timings: m.timings,
        backend: m.backend,
        warm: m.warm,
      });
    } else if (m.type === 'error') {
      const err = new BgRemoverError(m.code, m.message);
      if (m.id !== undefined) {
        this.pending.get(m.id)?.reject(err);
        this.pending.delete(m.id);
      } else {
        this.loadWait?.reject(err);
        this.loadWait = null;
      }
    }
  }

  private failAll(err: Error) {
    this.loadWait?.reject(err);
    this.loadWait = null;
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  /** Cuts the subject out of one picture. Works at up to `maxSide` pixels on the long side (default 2048). */
  async remove(image: Source): Promise<RemoveResult> {
    if (this.disposed) throw new BgRemoverError('disposed', 'This remover was disposed.');
    if (!this.worker || !this.info) throw new BgRemoverError('disposed', 'Call load() first.');
    let bitmap: ImageBitmap;
    try {
      bitmap = image instanceof ImageBitmap ? await createImageBitmap(image) : await createImageBitmap(image as ImageBitmapSource);
    } catch {
      throw new BgRemoverError('bad-image', 'That picture could not be read. Use a JPG, PNG or WebP file.');
    }
    const id = this.next++;
    return new Promise<RemoveResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: 'remove', id, bitmap, maxSide: this.options.maxSide ?? 2048 } satisfies ToWorker, [bitmap]);
    });
  }

  private teardown() {
    this.worker?.terminate();
    this.worker = null;
  }

  dispose() {
    this.disposed = true;
    this.worker?.postMessage({ type: 'dispose' } satisfies ToWorker);
    this.failAll(new BgRemoverError('disposed', 'This remover was disposed.'));
    this.teardown();
    this.info = null;
  }
}
