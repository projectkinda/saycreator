// Draws version-2 thumbnail options and checks each on a phone-size copy: the nine checks from version 1, plus the three that need to
// know where the subject is. Browser only (canvas). Drawing stays on the main thread, one option at a time.
import { FabricAdapter } from '../../fabric-adapter';
import { coverCrop } from '../../draw/geometry';
import { layoutText } from '../../draw/text';
import { loadFonts } from '../../fonts';
import { layerBox } from '../../carousel/lint';
import { lintThumbnail } from '../../lint/thumbnail-lint';
import { parseColor } from '../../lint/color';
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

/**
 * Do the letters keep their shape? Each line of the title is drawn alone (same size and place, but no outline, shadow or box, and nothing else) to find
 * the pixels that are solidly the letters, one letter at a time. In the finished picture two things must hold:
 *  - those pixels are still the letters' colour (or the stressed word's colour): nothing is drawn over a letter;
 *  - a thin ring just outside each letter is not that same colour: no letter runs into something of its own colour, as the tail of a Q
 *    does when it sinks into a box of the same colour.
 */
async function letterShapes(adapter: FabricAdapter, option: ThumbOption, finished: Pixels): Promise<{ covered: number; merged: number; where: string }> {
  const p = option.plan;
  const { width: W, height: H } = p.canvas;
  const title = p.layers.find((l) => l.id === option.titleLayerId) as TextLayer;
  const block = layoutText(title);
  const fill = parseColor(title.style.color).rgb;
  const mark = title.highlight?.textColor ? parseColor(title.highlight.textColor).rgb : null;
  // A plain ground the letters (and the stressed word's colour) both stand out from.
  const apart = (g: string) => Math.min(dist(parseColor(g).rgb, fill), mark ? dist(parseColor(g).rgb, mark) : 255);
  const ground = ['#000000', '#808080', '#ffffff'].reduce((best, g) => (apart(g) > apart(best) ? g : best));
  // The ring is 2 to 4 px outside a letter: the 1 px of edge pixels blended with what is behind is left out.
  const RING = 4;
  // The letters' own outline is meant to be next to them, even when it is the same colour as a stressed word.
  const outline = title.style.stroke ? parseColor(title.style.stroke.color).rgb : null;
  let total = 0;
  let coveredPx = 0;
  let worst = 0;
  let where = '';
  const at = (img: Pixels, x: number, y: number): [number, number, number] => {
    const k = (y * img.width + x) * 4;
    return [img.data[k], img.data[k + 1], img.data[k + 2]];
  };
  for (const line of block.lines) {
    if (!line.text.trim()) continue;
    const probe: TextLayer = { ...title, id: 'probe', text: line.text, x: title.x + line.x, y: title.y + line.y, width: Math.ceil(line.width) + 12, height: Math.ceil(block.lineStep * 1.3), highlight: title.highlight && line.words.some((w) => w.highlighted) ? { ...title.highlight, color: 'rgba(0,0,0,0)' } : undefined, style: { ...title.style, align: 'left', ...(title.style.stroke ? { stroke: { ...title.style.stroke, color: 'rgba(0,0,0,0)' } } : {}), shadow: undefined } };
    await adapter.render({ schema: 1, revision: 1, canvas: { width: W, height: H, background: ground }, layers: [probe] });
    const alone = await blobPixels(await adapter.export({ format: 'png', scale: 1 }));
    const x0 = Math.max(RING + 1, Math.floor(probe.x - 4));
    const x1 = Math.min(W - RING - 1, Math.ceil(probe.x + probe.width + 4));
    const y0 = Math.max(RING + 1, Math.floor(probe.y - block.size * 0.2));
    const y1 = Math.min(H - RING - 1, Math.ceil(probe.y + block.lineStep * 1.3));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) continue;
    // The letters' solid pixels, then each letter as a connected shape.
    const solid = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = at(alone, x0 + x, y0 + y); if (dist(a, fill) <= 12 || (mark && dist(a, mark) <= 12)) solid[y * w + x] = 1; }
    const label = new Int32Array(w * h);
    let letters = 0;
    for (let s = 0; s < w * h; s++) {
      if (!solid[s] || label[s]) continue;
      letters++;
      const stack = [s];
      label[s] = letters;
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % w;
        const cy = (c - cx) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (solid[n] && !label[n]) {
            label[n] = letters;
            stack.push(n);
          }
        }
      }
    }
    const area = new Int32Array(letters + 1);
    for (let i = 0; i < w * h; i++) if (label[i]) area[label[i]]++;
    const ringTotal = new Int32Array(letters + 1);
    const ringSame = new Int32Array(letters + 1);
    const seen = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i]) {
          total++;
          const f = at(finished, x0 + x, y0 + y);
          if (dist(f, at(alone, x0 + x, y0 + y)) > 48) coveredPx++;
          continue;
        }
        // A pixel just outside a letter: find which letter, and what colour that letter really is in the finished picture.
        let edge = false;
        for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h && solid[(y + dy) * w + x + dx]) edge = true;
        if (edge) continue;
        let owner = 0;
        for (let dy = -RING; dy <= RING && !owner; dy++) for (let dx = -RING; dx <= RING; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const o = label[ny * w + nx];
          if (o && Math.abs(dx) + Math.abs(dy) <= RING) {
            owner = o;
            break;
          }
        }
        if (!owner || seen[i]) continue;
        seen[i] = 1;
        // The letter's own colour in the finished picture: its fill, or the stressed word's colour.
        const here = at(finished, x0 + x, y0 + y);
        ringTotal[owner]++;
        let g: [number, number, number] = fill as [number, number, number];
        for (let dy = -RING; dy <= RING; dy++) for (let dx = -RING; dx <= RING; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && label[ny * w + nx] === owner) g = at(alone, x0 + nx, y0 + ny);
        }
        if (dist(here, g) <= 40 && !(outline && dist(here, outline) <= 40)) ringSame[owner]++;
      }
    for (let l = 1; l <= letters; l++) {
      if (area[l] < 600 || ringTotal[l] < 100) continue; // specks of anti-aliasing, not letters
      const share = ringSame[l] / ringTotal[l];
      if (share > worst) {
        worst = share;
        where = line.text;
      }
    }
  }
  return { covered: total ? coveredPx / total : 0, merged: worst, where };
}
const dist = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

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
  const letters = await letterShapes(adapter, option, await blobPixels(png));
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
    letters,
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
