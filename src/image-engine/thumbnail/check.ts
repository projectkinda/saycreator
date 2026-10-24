// Composes thumbnail options for one picture, draws each, and checks it on a phone-size copy.
// Browser only (needs canvas). Drawing uses the main thread; see IMAGE_STATUS.md.
import { FabricAdapter } from '../fabric-adapter';
import { coverCrop } from '../draw/geometry';
import { layoutText } from '../draw/text';
import { loadFonts } from '../fonts';
import { lintThumbnail } from '../lint/thumbnail-lint';
import type { Pixels } from '../lint/metrics';
import type { ImageLayer, LintResult, Plan, RenderReport, TextLayer, ThumbnailOption, ThumbnailRequest } from '../types';
import { composeThumbnails } from './compose';
import { suggestFocal } from './focal';

/** The width of the "phone" copy used for every check. */
export const PHONE_WIDTH = 320;

export interface CheckedOption {
  option: ThumbnailOption;
  png: Blob;
  phonePng: Blob;
  lint: LintResult[];
  failed: LintResult[];
  render: RenderReport;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`The picture could not be loaded: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

/** Draws a part of the image into a small bitmap and reads its pixels. */
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

async function checkOne(adapter: FabricAdapter, img: HTMLImageElement, req: ThumbnailRequest, opt: ThumbnailOption): Promise<CheckedOption> {
  const p = opt.plan;
  const { width: W, height: H } = p.canvas;
  const scale = PHONE_WIDTH / W;
  const render = await adapter.render(p);
  const png = await adapter.export({ format: 'png', scale: 1 });
  const phonePng = await adapter.export({ format: 'png', scale });

  // Same plan with the title hidden: what the title actually sits on, at phone size.
  const bgPlan: Plan = { ...p, layers: p.layers.map((l) => (l.id === opt.titleLayerId ? { ...l, visible: false } : l)) };
  await adapter.render(bgPlan);
  const phoneBackground = await blobPixels(await adapter.export({ format: 'png', scale }));

  const title = p.layers.find((l) => l.id === opt.titleLayerId) as TextLayer;
  const block = layoutText(title);
  const sw = title.style.stroke?.width ?? 0;
  const hl = title.highlight;
  const wordBoxes = block.lines.flatMap((line) =>
    line.words.map((w) => {
      const padX = w.highlighted && hl ? hl.paddingX : 0;
      return { x: title.x + w.x - sw / 2 - padX, y: title.y + line.y - sw / 2, width: w.width + sw + 2 * padX, height: block.lineStep + sw, highlighted: w.highlighted };
    }),
  );
  const extraBounds = p.layers.filter((l) => l.id === 'plate').map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height }));

  const photoLayer = p.layers.find((l) => l.id === opt.photoLayerId) as ImageLayer;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const crop = coverCrop(nw, nh, photoLayer.width, photoLayer.height, photoLayer.focal);
  const photoPixels = pixelsOf(img, crop.sx, crop.sy, crop.sw, crop.sh, Math.min(640, crop.sw));

  const lint = lintThumbnail({
    aspect: req.aspect,
    canvas: { width: W, height: H },
    title,
    wordBoxes,
    extraBounds,
    phoneBackground,
    phoneScale: scale,
    photoBox: { width: photoLayer.width, height: photoLayer.height },
    photoCrop: { width: crop.sw, height: crop.sh },
    source: { width: nw, height: nh },
    photoPixels,
  });
  return { option: opt, png, phonePng, lint, failed: lint.filter((r) => !r.pass), render };
}

/** Composes every layout for this picture and title, draws and checks each one. */
export async function checkThumbnails(req: ThumbnailRequest): Promise<CheckedOption[]> {
  await loadFonts();
  const img = await loadImage(req.source.url);
  const small = pixelsOf(img, 0, 0, img.naturalWidth, img.naturalHeight, 96);
  const options = composeThumbnails(
    { ...req, source: { ...req.source, width: img.naturalWidth, height: img.naturalHeight } },
    (w, h) => suggestFocal(small, w, h),
  );
  const adapter = new FabricAdapter();
  await adapter.mount(null);
  try {
    const out: CheckedOption[] = [];
    for (const opt of options) out.push(await checkOne(adapter, img, req, opt));
    return out;
  } finally {
    adapter.dispose();
  }
}

/**
 * Checks an option someone built or edited by hand (for example after a patch).
 * The plan must keep the ids "title" and "photo".
 */
export async function checkOption(req: ThumbnailRequest, option: ThumbnailOption): Promise<CheckedOption> {
  await loadFonts();
  const img = await loadImage(req.source.url);
  const adapter = new FabricAdapter();
  await adapter.mount(null);
  try {
    return await checkOne(adapter, img, req, option);
  } finally {
    adapter.dispose();
  }
}
