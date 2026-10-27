// Draws version-2 thumbnail options and checks each on a phone-size copy: the nine checks from version 1, plus the three that need to
// know where the subject is. Browser only (canvas). Drawing stays on the main thread, one option at a time.
import { FabricAdapter } from '../../fabric-adapter';
import { coverCrop } from '../../draw/geometry';
import { layoutText } from '../../draw/text';
import { loadFonts } from '../../fonts';
import { layerBox } from '../../carousel/lint';
import { lintThumbnail } from '../../lint/thumbnail-lint';
import type { Pixels } from '../../lint/metrics';
import type { ImageLayer, LintResult, Plan, RenderReport, TextLayer } from '../../types';
import type { ThumbOption } from './compose';

export const PHONE_WIDTH = 320;

export interface CheckedThumb {
  option: ThumbOption;
  png: Blob;
  phonePng: Blob;
  lint: LintResult[];
  failed: LintResult[];
  render: RenderReport;
  ms: number;
}

/** What the checker needs to know about the pictures: their natural size and a way to read their pixels. */
export interface Source {
  img: HTMLImageElement | ImageBitmap;
  width: number;
  height: number;
}

function pixelsOf(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, outW: number): Pixels {
  const w = Math.max(1, Math.round(outW));
  const h = Math.max(1, Math.round((outW * sh) / sw));
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

async function blobPixels(blob: Blob): Promise<Pixels> {
  const bm = await createImageBitmap(blob);
  const p = pixelsOf(bm, 0, 0, bm.width, bm.height, bm.width);
  bm.close();
  return p;
}

/** The pieces of a plan the checks need, in canvas px. Pure: used by the tests with plans built by hand too. */
export function geometryOf(option: ThumbOption, plan: Plan = option.plan) {
  const title = plan.layers.find((l) => l.id === option.titleLayerId) as TextLayer;
  const block = layoutText(title);
  const sw = title.style.stroke?.width ?? 0;
  const hl = title.highlight;
  const wordBoxes = block.lines.flatMap((line) =>
    line.words.map((w) => {
      const padX = w.highlighted && hl ? hl.paddingX : 0;
      return { x: title.x + w.x - sw / 2 - padX, y: title.y + line.y - sw / 2, width: w.width + sw + 2 * padX, height: block.lineStep + sw, highlighted: w.highlighted };
    }),
  );
  const extraBounds = plan.layers.filter((l) => l.id === 'plate' || /^chip-(before|after)$/.test(l.id) || l.id === 'badge').map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height }));
  const things = plan.layers
    .filter((l) => l.kind === 'element' || l.id === 'object')
    .map((l) => ({ id: l.id === 'object' ? 'object' : l.kind === 'element' ? l.element : l.id, kind: (l.id === 'object' ? 'object' : 'element') as 'object' | 'element', ...layerBox(l) }));
  const fixed = plan.layers.filter((l) => l.id === 'plate' || l.id === 'badge' || /^chip-/.test(l.id)).map((l) => ({ id: l.id, ...layerBox(l) }));
  return { title, wordBoxes, extraBounds, things, fixed };
}

/** Draws one option and runs every check. `sources` maps a photo layer id to its picture. */
export async function checkThumb(adapter: FabricAdapter, option: ThumbOption, sources: Record<string, Source>): Promise<CheckedThumb> {
  const t0 = performance.now();
  const p = option.plan;
  const { width: W, height: H } = p.canvas;
  const scale = PHONE_WIDTH / W;
  const render = await adapter.render(p);
  const png = await adapter.export({ format: 'png', scale: 1 });
  const phonePng = await adapter.export({ format: 'png', scale });
  const bgPlan: Plan = { ...p, layers: p.layers.map((l) => (l.id === option.titleLayerId ? { ...l, visible: false } : l)) };
  await adapter.render(bgPlan);
  const phoneBackground = await blobPixels(await adapter.export({ format: 'png', scale }));
  const g = geometryOf(option);

  const photoLayer = p.layers.find((l) => l.id === option.photoLayerId) as ImageLayer;
  const src = sources[option.photoLayerId];
  const crop = coverCrop(src.width, src.height, photoLayer.width, photoLayer.height, photoLayer.focal);
  const photoPixels = pixelsOf(src.img, crop.sx, crop.sy, crop.sw, crop.sh, Math.min(640, crop.sw));
  const photoBoxes = option.photoLayerIds.map((id) => {
    const l = p.layers.find((x) => x.id === id)!;
    return { id, x: l.x, y: l.y, width: l.width, height: l.height };
  });
  const lint = lintThumbnail({
    aspect: option.aspect,
    canvas: { width: W, height: H },
    title: g.title,
    wordBoxes: g.wordBoxes,
    extraBounds: g.extraBounds,
    phoneBackground,
    phoneScale: scale,
    photoBox: { width: photoLayer.width, height: photoLayer.height },
    photoCrop: { width: crop.sw, height: crop.sh },
    source: { width: src.width, height: src.height },
    photoPixels,
    subjects: option.subjects,
    photoBoxes,
    things: g.things,
    fixed: g.fixed,
  });
  return { option, png, phonePng, lint, failed: lint.filter((r) => !r.pass), render, ms: performance.now() - t0 };
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`The picture could not be loaded: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

/** Loads the fonts and the pictures, draws every option and checks it. Options are drawn one after the other. */
export async function checkThumbs(options: ThumbOption[], pictures: Record<string, string>): Promise<CheckedThumb[]> {
  await loadFonts();
  const sources: Record<string, Source> = {};
  for (const [layerId, url] of Object.entries(pictures)) {
    const img = await loadImage(url);
    sources[layerId] = { img, width: img.naturalWidth, height: img.naturalHeight };
  }
  const adapter = new FabricAdapter();
  await adapter.mount(null);
  try {
    const out: CheckedThumb[] = [];
    for (const o of options) out.push(await checkThumb(adapter, o, sources));
    return out;
  } finally {
    adapter.dispose();
  }
}
