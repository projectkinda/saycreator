// Round AA: where the faces are in a project photo, so a headline drawn over the photo can be placed off them (designLibrary.drawOne, title-over-photo).
// The finder is UltraFace version-RFB-320 (MIT, scripts/models.manifest.json "ultraface-rfb-320", fetched by npm run fetch:models into public/models, never in git), run with
// onnxruntime-web on WASM in the page: one 320 x 240 pass per photo, cached per picture. The model file is checked against its pinned size and sha256 before it is used.
// No model, a failed check or an unreadable picture: no faces are known (null) and the slide is drawn exactly as before. Nothing leaves the browser; the pixels are never sent anywhere.
import { resolvePictureRef } from '../reference/faithful';

/** A face, in the photo's own coordinates (0..1 on each axis), with the model's score. */
export interface FaceBox { x0: number; y0: number; x1: number; y1: number; score: number }

/** Switch for before/after comparisons and tests: off, no face is ever looked for. */
export const faceRule = { on: true };
/** A face counts when the model scores it at least this (UltraFace's own default). */
export const FACE_SCORE = 0.7;
/** Two boxes overlapping more than this (intersection over union) are one face. */
const NMS_IOU = 0.3;
const IN_W = 320, IN_H = 240;
const MODEL_ID = 'ultraface-rfb-320';

type Finder = (src: string) => Promise<FaceBox[] | null>;
let override: Finder | null = null;
/** Tests: replace the model with a known answer per picture (null restores the model). */
export function setFaceFinder(f: Finder | null): void {
  override = f;
  cache.clear();
}

interface OrtLike {
  env: { wasm: { wasmPaths?: string; numThreads?: number; proxy?: boolean }; logLevel?: string };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(bytes: Uint8Array, o: object): Promise<Session> };
}
interface Session { inputNames: readonly string[]; outputNames: readonly string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { dims: readonly number[]; data: Float32Array }>> }

let sessionWait: Promise<{ ort: OrtLike; s: Session } | null> | null = null;
/** Why the finder is not available (shown to developers only; the app stays as before). */
export let faceFinderProblem: string | null = null;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function session(): Promise<{ ort: OrtLike; s: Session } | null> {
  if (!sessionWait) sessionWait = (async () => {
    try {
      const res = await fetch('/models/manifest.json');
      if (!res.ok) throw new Error('no model list (run npm run fetch:models)');
      const m = ((await res.json()).models as { id: string; status: string; file: string; bytes: number | null; sha256: string | null }[]).find((x) => x.id === MODEL_ID);
      if (!m || m.status !== 'approved') throw new Error('the face model is not in the model list');
      const r = await fetch('/models/' + m.file);
      if (!r.ok) throw new Error('the face model file is missing (run npm run fetch:models)');
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (m.bytes !== null && bytes.length !== m.bytes) throw new Error(`the face model is ${bytes.length} bytes, not ${m.bytes}`);
      if (m.sha256 && hex(await crypto.subtle.digest('SHA-256', bytes)) !== m.sha256) throw new Error('the face model does not match its checksum');
      const ort = (await import('onnxruntime-web/wasm')) as unknown as OrtLike;
      // a full URL so the dev server does not transform the runtime's own import (as the cut-out worker does)
      ort.env.wasm.wasmPaths = `${location.origin}/ort/`;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      // the model file lists its weights as graph inputs too; onnxruntime warns about each one on the console. Only errors are shown.
      ort.env.logLevel = 'error';
      const s = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
      faceFinderProblem = null;
      return { ort, s };
    } catch (e) {
      faceFinderProblem = e instanceof Error ? e.message : String(e);
      return null;
    }
  })();
  return sessionWait;
}

const iou = (a: FaceBox, b: FaceBox) => {
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const i = w * h;
  return i / Math.max(1e-9, (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i);
};

/**
 * Reads the model's two outputs (scores 1 x N x 2, boxes 1 x N x 4 as corners x0, y0, x1, y1 on the 320 x 240 input, 0..1) into faces on the photo: the photo sat letterboxed in the
 * input at (ox, oy) with size (sw, sh), both 0..1 of the input. Pure, so a test can feed it numbers.
 */
export function decodeFaces(scores: ArrayLike<number>, boxes: ArrayLike<number>, place: { ox: number; oy: number; sw: number; sh: number }, minScore = FACE_SCORE): FaceBox[] {
  const n = Math.floor(scores.length / 2);
  const cand: FaceBox[] = [];
  const c01 = (v: number) => Math.max(0, Math.min(1, v));
  for (let i = 0; i < n; i++) {
    const sc = scores[i * 2 + 1];
    if (!(sc >= minScore)) continue;
    const x0 = c01((boxes[i * 4] - place.ox) / place.sw), y0 = c01((boxes[i * 4 + 1] - place.oy) / place.sh);
    const x1 = c01((boxes[i * 4 + 2] - place.ox) / place.sw), y1 = c01((boxes[i * 4 + 3] - place.oy) / place.sh);
    if (x1 - x0 <= 0.002 || y1 - y0 <= 0.002) continue;
    cand.push({ x0, y0, x1, y1, score: sc });
  }
  cand.sort((a, b) => b.score - a.score);
  const out: FaceBox[] = [];
  for (const c of cand) if (!out.some((k) => iou(k, c) > NMS_IOU)) out.push(c);
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  return out.map((f) => ({ x0: r4(f.x0), y0: r4(f.y0), x1: r4(f.x1), y1: r4(f.y1), score: r4(f.score) }));
}

async function find(src: string): Promise<FaceBox[] | null> {
  const ses = await session();
  if (!ses) return null;
  const data = await resolvePictureRef(src);
  if (!data) return null;
  const im = new Image();
  im.src = data;
  await im.decode();
  const bw = im.naturalWidth || 1, bh = im.naturalHeight || 1;
  // the whole photo, letterboxed into the 320 x 240 input (the grey 127 border is 0 after the model's normalisation), so faces keep their shape
  const k = Math.min(IN_W / bw, IN_H / bh);
  const w = Math.max(1, Math.round(bw * k)), h = Math.max(1, Math.round(bh * k));
  const ox = Math.floor((IN_W - w) / 2), oy = Math.floor((IN_H - h) / 2);
  const c = new OffscreenCanvas(IN_W, IN_H);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = 'rgb(127,127,127)';
  g.fillRect(0, 0, IN_W, IN_H);
  g.drawImage(im, ox, oy, w, h);
  const px = g.getImageData(0, 0, IN_W, IN_H).data;
  const plane = IN_W * IN_H;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = (px[i * 4] - 127) / 128;
    input[plane + i] = (px[i * 4 + 1] - 127) / 128;
    input[2 * plane + i] = (px[i * 4 + 2] - 127) / 128;
  }
  const out = await ses.s.run({ [ses.s.inputNames[0]]: new ses.ort.Tensor('float32', input, [1, 3, IN_H, IN_W]) });
  const all = Object.values(out);
  const scores = all.find((t) => t.dims[t.dims.length - 1] === 2);
  const boxes = all.find((t) => t.dims[t.dims.length - 1] === 4);
  if (!scores || !boxes) return null;
  return decodeFaces(scores.data, boxes.data, { ox: ox / IN_W, oy: oy / IN_H, sw: w / IN_W, sh: h / IN_H });
}

/** A face counts as covered when at least this share of its visible part lies under the slide's words. */
export const FACE_COVER = 0.1;
type Box = { x: number; y: number; width: number; height: number };
/**
 * How much of each face the words of a drawn slide cover: per face (as drawn on the slide, the part inside the slide), the share under any text box (sampled on a 20 x 20 grid,
 * so overlapping text boxes are not counted twice). The page chrome (handle, page number, footer) is not counted: it is small and sits at the edges.
 */
export function faceCoverOf(built: { layers: ({ kind: string; name?: string } & Box)[]; drawnPictures?: { id: string; x: number; y: number; w: number; h: number }[] }, pictureId: string, faces: FaceBox[]): { worst: number; total: number; covered: number } {
  const pic = built.drawnPictures?.find((p) => p.id === pictureId);
  if (!pic || !faces.length) return { worst: 0, total: 0, covered: 0 };
  const texts = built.layers.filter((l) => l.kind === 'text' && l.name !== 'recurring');
  let worst = 0, total = 0, covered = 0;
  const N = 20;
  for (const f of faces) {
    const x0 = Math.max(0, pic.x + f.x0 * pic.w), x1 = Math.min(1080, pic.x + f.x1 * pic.w);
    const y0 = Math.max(0, pic.y + f.y0 * pic.h), y1 = Math.min(1350, pic.y + f.y1 * pic.h);
    if (x1 - x0 < 1 || y1 - y0 < 1) continue; // cut off the slide: nothing of it to cover
    let hit = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const px = x0 + ((i + 0.5) / N) * (x1 - x0), py = y0 + ((j + 0.5) / N) * (y1 - y0);
      if (texts.some((t) => px >= t.x && px <= t.x + t.width && py >= t.y && py <= t.y + t.height)) hit++;
    }
    const share = hit / (N * N);
    worst = Math.max(worst, share);
    total += share;
    if (share >= FACE_COVER) covered++;
  }
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { worst: r3(worst), total: r3(total), covered };
}

const cache = new Map<string, Promise<FaceBox[] | null>>();
/** The faces in a project picture (cached per picture), or null when they cannot be known (no model, the rule off, or the picture cannot be read). */
export function facesOf(src: string): Promise<FaceBox[] | null> {
  if (!faceRule.on) return Promise.resolve(null);
  const key = src.split('#')[0];
  let p = cache.get(key);
  if (!p) {
    p = (override ? override(src) : find(src)).catch(() => null);
    cache.set(key, p);
  }
  return p;
}
