// Phone-size checks for a thumbnail. Every check is pass or fail with a plain sentence.
// All thresholds are working guesses, not measured facts about what performs well. Change them here.
import type { LintResult, TextLayer, ThumbnailAspect } from '../types';
import { contrast, contrastRgb, luminance, parseColor } from './color';
import { laplacianVariance, luminancesIn, meanLuma, median, type Pixels, type PxRect } from './metrics';

export const THRESHOLDS = {
  maxWords: 4,
  /** Title text must be at least this tall (font size, px) on a ~320px-wide copy. */
  minPhoneFontPx: 18,
  minContrast: 4.5,
  /** Share of the picture behind the title that must reach minContrast. */
  minContrastShare: 0.9,
  /** Text and plates stay this far from every edge, as a share of the shorter side. */
  marginShare: 0.04,
  /** The photo may be stretched at most this many times to fill its box. */
  maxUpscale: 1.5,
  /** The crop must keep at least this share of the photo's area, or the subject is likely cut off. */
  minCropKeep: 0.5,
  /** Gamma luma of the cropped photo, 0 to 1. */
  minMeanLuma: 0.16,
  /** Laplacian variance of the cropped photo at up to 640px wide. */
  minSharpness: 100,
};

export interface Zone {
  id: string;
  label: string;
  /** Fractions of the canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where platforms draw their own controls. Approximate and deliberately generous: platforms do not publish exact sizes. */
export const OVERLAY_ZONES: Record<ThumbnailAspect, Zone[]> = {
  '16:9': [{ id: 'yt-duration', label: 'the video length badge YouTube shows in the bottom-right corner', x: 0.8, y: 0.86, w: 0.2, h: 0.14 }],
  '9:16': [
    { id: 'shorts-bottom', label: 'the caption and channel area at the bottom of a vertical video', x: 0, y: 0.78, w: 1, h: 0.22 },
    { id: 'shorts-actions', label: 'the like and share buttons down the right side of a vertical video', x: 0.8, y: 0.42, w: 0.2, h: 0.4 },
  ],
};

export interface LintInput {
  aspect: ThumbnailAspect;
  canvas: { width: number; height: number };
  title: TextLayer;
  /** Word boxes of the title in canvas px (already includes stroke growth). */
  wordBoxes: { x: number; y: number; width: number; height: number; highlighted: boolean }[];
  /** Plates or panels that must also keep their margins, in canvas px. */
  extraBounds: PxRect[];
  /** Phone-size copy of the plan with the title hidden. */
  phoneBackground: Pixels;
  /** Size of the phone copy divided by the plan's size. */
  phoneScale: number;
  /** Size in px of the image layer's box, and of the crop taken from the source. */
  photoBox: { width: number; height: number };
  photoCrop: { width: number; height: number };
  /** Full size of the source photo. */
  source: { width: number; height: number };
  /** The cropped photo, at up to 640px wide. */
  photoPixels: Pixels;
  /** Version 2 only. Where the subject is on the canvas (the person's pointer), with the radius the title and elements keep clear of. `of` is the photo layer it belongs to. */
  subjects?: { x: number; y: number; r: number; of: string }[];
  /** Version 2 only. The photo layers' boxes in canvas px, so the crop can be checked against the subject. */
  photoBoxes?: { id: string; x: number; y: number; width: number; height: number }[];
  /** Version 2 only. Elements and objects (stickers, arrows, a product picture) in canvas px. */
  things?: { id: string; kind: 'element' | 'object'; x: number; y: number; width: number; height: number }[];
  /** Version 2 only. Chips, badges and plates the things must also stay off. */
  fixed?: { id: string; x: number; y: number; width: number; height: number }[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function lintThumbnail(i: LintInput): LintResult[] {
  const T = THRESHOLDS;
  const out: LintResult[] = [];
  const { width: W, height: H } = i.canvas;
  const style = i.title.style;

  // 1. Title length
  const words = i.title.text.trim().split(/\s+/).filter(Boolean).length;
  out.push({
    id: 'words',
    label: 'Title length',
    pass: words <= T.maxWords,
    measured: words,
    limit: T.maxWords,
    reason: words <= T.maxWords ? `The title has ${words} word${words === 1 ? '' : 's'}.` : `The title has ${words} words. Keep it to ${T.maxWords} or fewer so it reads at a glance.`,
  });

  // 2. Readable at phone size
  const phonePx = style.size * i.phoneScale;
  out.push({
    id: 'readable',
    label: 'Readable at phone size',
    pass: phonePx >= T.minPhoneFontPx,
    measured: Math.round(phonePx * 10) / 10,
    limit: T.minPhoneFontPx,
    reason:
      phonePx >= T.minPhoneFontPx
        ? `On a ${Math.round(W * i.phoneScale)}px-wide copy the title letters are ${phonePx.toFixed(0)}px tall (needs ${T.minPhoneFontPx}px).`
        : `On a ${Math.round(W * i.phoneScale)}px-wide copy the title letters are only ${phonePx.toFixed(0)}px tall (needs ${T.minPhoneFontPx}px). Use fewer or shorter words so it can be bigger.`,
  });

  // 3. Contrast, measured on the rendered picture behind each word
  const fill = parseColor(style.color).rgb;
  const outlined = !!style.stroke && style.stroke.width >= style.size * 0.05;
  const problems: string[] = [];
  let worst = Infinity;
  let share = 1;
  let med = Infinity;
  if (outlined) {
    const c = contrastRgb(fill, parseColor(style.stroke!.color).rgb);
    worst = c;
    if (c < T.minContrast) problems.push(`the letters and their outline only reach ${c.toFixed(1)}:1`);
    med = c;
  } else {
    const rects = i.wordBoxes
      .filter((w) => !w.highlighted)
      .map((w) => ({ x: w.x * i.phoneScale, y: (w.y + w.height * 0.1) * i.phoneScale, width: w.width * i.phoneScale, height: w.height * 0.8 * i.phoneScale }));
    const lums = luminancesIn(i.phoneBackground, rects);
    if (lums.length) {
      const own = luminance(...fill);
      const ratios = lums.map((l) => contrast(own, l));
      share = ratios.filter((r) => r >= T.minContrast).length / ratios.length;
      med = median(ratios);
      worst = Math.min(...ratios);
      if (share < T.minContrastShare) problems.push(`only ${pct(share)} of the picture behind the words reaches ${T.minContrast}:1 (needs ${pct(T.minContrastShare)}); the typical contrast is ${med.toFixed(1)}:1`);
    }
  }
  if (i.title.highlight?.textColor && parseColor(i.title.highlight.color).alpha > 0.05) {
    const h = contrastRgb(parseColor(i.title.highlight.textColor).rgb, parseColor(i.title.highlight.color).rgb);
    if (h < T.minContrast) problems.push(`the highlighted word only reaches ${h.toFixed(1)}:1`);
    worst = Math.min(worst, h);
  }
  out.push({
    id: 'contrast',
    label: 'Contrast',
    pass: problems.length === 0,
    measured: Math.round((outlined ? worst : med) * 10) / 10,
    limit: T.minContrast,
    reason: problems.length === 0 ? `Title contrast is fine (${outlined ? 'letters against their outline' : `typical ${med.toFixed(1)}:1, ${pct(share)} of the background clears ${T.minContrast}:1`}).` : `Contrast is too low: ${problems.join('; ')}.`,
  });

  // 4. Platform overlay zones
  const hits: string[] = [];
  for (const z of OVERLAY_ZONES[i.aspect]) {
    const zr = { x: z.x * W, y: z.y * H, w: z.w * W, h: z.h * H };
    if (i.wordBoxes.some((b) => b.x < zr.x + zr.w && b.x + b.width > zr.x && b.y < zr.y + zr.h && b.y + b.height > zr.y)) hits.push(z.label);
  }
  out.push({
    id: 'overlay',
    label: 'Clear of platform overlays',
    pass: hits.length === 0,
    reason: hits.length === 0 ? 'The title stays clear of the areas where the platform draws its own buttons and badges (approximate zones).' : `The title runs into ${hits.join(' and ')}, which would cover it.`,
  });

  // 5. Margins
  const all = [...i.wordBoxes, ...i.extraBounds.map((r) => ({ ...r, highlighted: false }))];
  const left = Math.min(...all.map((b) => b.x));
  const top = Math.min(...all.map((b) => b.y));
  const right = W - Math.max(...all.map((b) => b.x + b.width));
  const bottom = H - Math.max(...all.map((b) => b.y + b.height));
  const need = Math.round(Math.min(W, H) * T.marginShare);
  const tight = [
    left < need && `${Math.round(left)}px from the left edge`,
    right < need && `${Math.round(right)}px from the right edge`,
    top < need && `${Math.round(top)}px from the top edge`,
    bottom < need && `${Math.round(bottom)}px from the bottom edge`,
  ].filter(Boolean) as string[];
  out.push({
    id: 'margins',
    label: 'Edge margins',
    pass: tight.length === 0,
    measured: Math.round(Math.min(left, right, top, bottom)),
    limit: need,
    reason: tight.length === 0 ? `Text and plates keep at least ${need}px from every edge.` : `The title block is ${tight.join(' and ')}; it needs at least ${need}px so it is not cut off or crowded.`,
  });

  // 6. Photo resolution for this crop
  const upscale = i.photoBox.width / i.photoCrop.width;
  out.push({
    id: 'resolution',
    label: 'Photo resolution for this crop',
    pass: upscale <= T.maxUpscale,
    measured: Math.round(upscale * 100) / 100,
    limit: T.maxUpscale,
    reason:
      upscale <= T.maxUpscale
        ? upscale <= 1
          ? `The cropped photo has ${Math.round(i.photoCrop.width)}px across for a ${Math.round(i.photoBox.width)}px box, so no stretching is needed.`
          : `The cropped photo is stretched ${upscale.toFixed(2)}x (limit ${T.maxUpscale}x).`
        : `After cropping, the photo is only ${Math.round(i.photoCrop.width)}px wide and is stretched ${upscale.toFixed(2)}x to fill ${Math.round(i.photoBox.width)}px, so it will look soft. Use a bigger photo.`,
  });

  // 7. How much of the photo the crop throws away (we cannot find faces, so this is the honest proxy)
  const keep = (i.photoCrop.width * i.photoCrop.height) / (i.source.width * i.source.height);
  out.push({
    id: 'crop',
    label: 'Crop keeps enough of the photo',
    pass: keep >= T.minCropKeep,
    measured: Math.round(keep * 100) / 100,
    limit: T.minCropKeep,
    reason:
      keep >= T.minCropKeep
        ? `The crop keeps ${pct(keep)} of the photo.`
        : `This crop keeps only ${pct(keep)} of the photo (needs ${pct(T.minCropKeep)}), so the main subject, such as a face, may be cut off. Use a photo closer to this shape, or pick the crop by hand.`,
  });

  // 8. Brightness
  const luma = meanLuma(i.photoPixels);
  out.push({
    id: 'brightness',
    label: 'Photo not too dark',
    pass: luma >= T.minMeanLuma,
    measured: Math.round(luma * 1000) / 1000,
    limit: T.minMeanLuma,
    reason: luma >= T.minMeanLuma ? `The cropped photo has average brightness ${luma.toFixed(2)} (needs ${T.minMeanLuma}).` : `The cropped photo is very dark (average brightness ${luma.toFixed(2)}, needs ${T.minMeanLuma}), so it will disappear on a dark phone feed. Pick a brighter moment or brighten it.`,
  });

  // 9. Sharpness
  const sharp = laplacianVariance(i.photoPixels);
  out.push({
    id: 'sharpness',
    label: 'Photo not blurry',
    pass: sharp >= T.minSharpness,
    measured: Math.round(sharp),
    limit: T.minSharpness,
    reason: sharp >= T.minSharpness ? `The cropped photo has enough fine detail (score ${Math.round(sharp)}, needs ${T.minSharpness}).` : `The cropped photo has little fine detail (score ${Math.round(sharp)}, needs ${T.minSharpness}). It may be blurry, or flat-coloured artwork, which this check cannot tell apart.`,
  });

  if (i.subjects && i.subjects.length) subjectChecks(i, out);
  return out;
}

const hitsBox = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const hitsCircle = (c: { x: number; y: number; r: number }, b: { x: number; y: number; width: number; height: number }) => Math.hypot(c.x - Math.min(Math.max(c.x, b.x), b.x + b.width), c.y - Math.min(Math.max(c.y, b.y), b.y + b.height)) < c.r;

/** The checks that need to know where the subject is: the title off it, the crop keeping it, and the extra pictures off the words and off each other. */
function subjectChecks(i: LintInput, out: LintResult[]) {
  const subjects = i.subjects!;
  const { width: W, height: H } = i.canvas;
  // 10. the title stays off the subject
  const covered = subjects.filter((s) => i.wordBoxes.some((b) => hitsCircle(s, b)));
  out.push({
    id: 'subject',
    label: 'Title stays off the subject',
    pass: covered.length === 0,
    measured: covered.length,
    limit: 0,
    reason: covered.length === 0 ? 'The title stays clear of the point marked as the subject (your pointer, not a detected face).' : `The title runs over the point marked as the subject${covered[0].of === 'object' ? ' (the object)' : ''}. Move the title, or move the subject pointer so the crop puts the subject on the other side.`,
  });
  // 11. the crop keeps the subject, with room round it
  const edge = 0.08;
  const lost = subjects.filter((s) => s.of !== 'object').flatMap((s) => {
    const box = i.photoBoxes?.find((p) => p.id === s.of);
    if (!box) return [];
    // Only the part of the picture that is on the canvas counts (a photo drawn bigger than the canvas bleeds off it).
    const vis = { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(W, box.x + box.width) - Math.max(0, box.x), height: Math.min(H, box.y + box.height) - Math.max(0, box.y) };
    const rx = (s.x - vis.x) / vis.width;
    const ry = (s.y - vis.y) / vis.height;
    return rx < edge || rx > 1 - edge || ry < edge || ry > 1 - edge ? [{ s, rx, ry }] : [];
  });
  out.push({
    id: 'focal',
    label: 'Crop keeps the subject',
    pass: lost.length === 0,
    measured: lost.length,
    limit: 0,
    reason: lost.length === 0 ? 'The crop keeps the marked subject with room round it.' : `After cropping, the marked subject sits at the very edge of its picture (${Math.round(lost[0].rx * 100)}% across, ${Math.round(lost[0].ry * 100)}% down), so it is half cut off. Use a photo with more room round the subject, or pick another layout.`,
  });
  // 12. elements and objects do not overlap words, the subject, chips or each other
  const things = i.things ?? [];
  const problems: string[] = [];
  for (let a = 0; a < things.length; a++) {
    const t = things[a];
    if (i.wordBoxes.some((w) => hitsBox(t, w))) problems.push(`${t.kind === 'object' ? 'the object' : t.id} covers part of the title`);
    else if (t.kind === 'element' && subjects.some((s) => s.of !== 'object' && hitsCircle(s, t))) problems.push(`${t.id} covers the subject`);
    else if ((i.fixed ?? []).some((f) => hitsBox(t, f))) problems.push(`${t.kind === 'object' ? 'the object' : t.id} sits on a badge, chip or plate`);
    else if (t.x < 0 || t.y < 0 || t.x + t.width > W || t.y + t.height > H) {
      if (t.kind === 'object') problems.push('the object is cut off by the edge');
    }
    // The two pieces of one element (code:tape:1 and code:tape:2) are drawn to overlap on purpose.
    const family = (id: string) => id.replace(/:\d+$/, '');
    for (let b = a + 1; b < things.length; b++) if (hitsBox(things[a], things[b]) && family(things[a].id) !== family(things[b].id)) problems.push(`${things[a].id} and ${things[b].id} overlap`);
  }
  out.push({
    id: 'overlap',
    label: 'Elements and objects stay clear',
    pass: problems.length === 0,
    measured: problems.length,
    limit: 0,
    reason: problems.length === 0 ? 'Elements and the object stay off the title, the subject and each other.' : `${problems[0].charAt(0).toUpperCase()}${problems[0].slice(1)}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}. Move or remove it.`,
  });
}
