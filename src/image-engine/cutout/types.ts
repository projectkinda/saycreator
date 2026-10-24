// Types for background removal. See LICENSES-MODELS.md for which models are approved.

export type ModelId = 'birefnet-lite' | 'isnet-general-use' | 'selftest';
export type Backend = 'webgpu' | 'wasm';
export type BackendChoice = Backend | 'auto';

/** One channel of 0 to 255 values: 255 is fully the subject, 0 is background. */
export interface Alpha {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type ErrorCode =
  | 'model-blocked' // licence not approved
  | 'model-missing' // file not downloaded
  | 'model-corrupt' // wrong size or checksum
  | 'no-webgpu' // WebGPU asked for (or required) but not available
  | 'webgpu-failed' // WebGPU is there but this model could not run on it
  | 'wasm-failed' // the WASM runtime could not run this model
  | 'out-of-memory'
  | 'inference-failed'
  | 'bad-image'
  | 'disposed';

export class BgRemoverError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'BgRemoverError';
    this.code = code;
  }
}

export interface ModelEntry {
  id: ModelId;
  label: string;
  status: 'approved' | 'blocked';
  blockedBecause?: string;
  /** True for the toy model that only tests the machinery. Never a candidate for real use. */
  testOnly?: boolean;
  file: string;
  bytes: number | null;
  sha256: string | null;
  licence: string;
  input: { size: number; mean: number[]; std: number[]; output: 'logits' | 'sigmoid-minmax' };
}

export interface BgRemoverOptions {
  model: ModelId;
  /** 'auto' picks WebGPU when the device has it, otherwise WASM. */
  backend?: BackendChoice;
  /**
   * What to do when WebGPU is not available and the backend is 'auto'. BiRefNet_lite defaults to 'refuse'
   * (too slow on WASM to be a good default); ISNet defaults to 'allow'.
   */
  wasmFallback?: 'allow' | 'refuse';
  /** ONNX Runtime graph optimisation. Default 'all'. Lower levels are for diagnosing models that fail on WebGPU. */
  graphOptimization?: 'disabled' | 'basic' | 'extended' | 'all';
  /** WASM threads. Default: all cores when the page is cross-origin isolated, else 1. */
  wasmThreads?: number;
  /** Print ONNX Runtime's detailed log to the console. For diagnosing only. */
  verbose?: boolean;
  /** Longest side the picture is worked at. Bigger pictures are scaled down first. Default 2048. */
  maxSide?: number;
}

export interface LoadProgress {
  phase: 'manifest' | 'download' | 'cache' | 'init';
  loaded: number;
  total: number;
}

export interface LoadInfo {
  model: ModelId;
  backend: Backend;
  /** Why WebGPU was not used, when it was not. */
  fallbackReason?: string;
  downloadBytes: number;
  fromCache: boolean;
  timings: { fetchMs: number; initMs: number; totalMs: number };
  inputNames: string[];
  outputNames: string[];
}

export interface RemoveTimings {
  preprocessMs: number;
  inferenceMs: number;
  postprocessMs: number;
  totalMs: number;
}

export interface RemoveResult {
  /** The picture with the background made transparent, at the working size. */
  cutout: Blob;
  mask: Alpha;
  width: number;
  height: number;
  /** Working size divided by the original size (1 unless the picture was scaled down). */
  scale: number;
  timings: RemoveTimings;
  backend: Backend;
  /** False for the first picture on a session: WebGPU compiles its shaders then, so it is slower. */
  warm: boolean;
}

export interface MaskOptions {
  /** Soften the edge by this many pixels. 0 = off. */
  featherPx?: number;
  /** Fill holes in the subject up to this share of the picture's area. 0 = off. */
  fillHolesMaxShare?: number;
  /** Replace background colour on semi-transparent edge pixels with colour from nearby solid pixels. 0 = off. */
  decontaminatePx?: number;
}

export interface SubjectStats {
  /** Share of the picture that is subject, 0 to 1. */
  areaFraction: number;
  /** Tight box around every subject pixel, px. null when there is no subject. */
  bbox: { x: number; y: number; width: number; height: number } | null;
  /** Same box ignoring the outermost 1% of subject pixels on each side, so specks do not stretch it. */
  bboxRobust: { x: number; y: number; width: number; height: number } | null;
  /** Centre of mass (weighted by how solid each pixel is), px. */
  centroid: { x: number; y: number } | null;
  /** Everything above as 0..1 of the picture. */
  centroidNorm: { x: number; y: number } | null;
  bboxNorm: { x: number; y: number; width: number; height: number } | null;
}
