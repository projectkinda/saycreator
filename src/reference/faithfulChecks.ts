// Phone checks for a faithful pack slide, from the slot data (the text slots as laid out) and the flat colours behind them. The checks that need the drawn pixels
// cannot run on a faithful slide; UNCHECKED says so in plain words.
import { CAROUSEL_LIMITS, WORDS_CHECKED_TYPES, type CarouselLintResult } from '../image-engine/carousel/lint';
import { layoutText } from '../image-engine/draw/text';
import { contrastRgb, parseColor } from '../image-engine/lint/color';
import type { Layer, TextLayer } from '../image-engine/types';

export const UNCHECKED = [
  'Contrast over gradients, patterns or drawn art: only a flat colour behind a text slot is known, so text on anything else is not checked.',
  'Whether a drawn graphic crosses a text slot (only text boxes are compared with each other).',
  'The picture-overlap and orphan-word checks that read the finished pixels.',
] as const;

const flat = (l: Layer): string | null => {
  if (l.kind !== 'shape') return null;
  const f = (l as { fill?: unknown }).fill;
  return typeof f === 'string' && /^#[0-9a-fA-F]{6}$/.test(f) ? f : null;
};

/** `layers`: the filled layers in the design's own coordinates; `k`: output pixels per design pixel (a design fitted on a smaller card is below 1). */
export function faithfulChecks(layers: Layer[], o: { canvas: { w: number; h: number }; bg: string; k: number; slideType: string }): CarouselLintResult[] {
  const L = CAROUSEL_LIMITS;
  const texts = layers.filter((l): l is TextLayer => l.kind === 'text' && l.visible !== false && l.role !== 'decor' && !!l.text.trim());
  const out: CarouselLintResult[] = [];
  const res = (id: CarouselLintResult['id'], label: string, pass: boolean, reason: string, extra: Partial<CarouselLintResult> = {}) => out.push({ id, label, pass, reason, ...extra });
  const laid = texts.map((t) => ({ t, b: layoutText(t) }));

  const small = laid.filter((x) => x.b.size * o.k < L.minTextPx - 0.5);
  res('size', 'Text is big enough', small.length === 0, small.length ? `${small.length} text slot(s) are under ${L.minTextPx} px at the exported size (smallest ${Math.round(Math.min(...small.map((x) => x.b.size * o.k)))} px).` : `Every text slot is ${L.minTextPx} px or bigger.`, { measured: laid.length ? Math.round(Math.min(...laid.map((x) => x.b.size * o.k))) : undefined, limit: L.minTextPx });

  const edge = L.edgePx / o.k;
  const near = laid.filter(({ t, b }) => t.x < edge - 1 || t.x + t.width > o.canvas.w - edge + 1 || t.y + b.height > o.canvas.h - edge + 1 || t.y < edge - 1);
  res('edges', 'Margins and edges', near.length === 0, near.length ? `${near.length} text slot(s) come closer than ${L.edgePx} px to an edge.` : `Every text slot keeps ${L.edgePx} px from the edges.`);

  const words = texts.reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);
  if (WORDS_CHECKED_TYPES.includes(o.slideType)) res('words', 'Words on the slide', words <= L.wordsFail, `${words} words on the slide.${words > L.wordsWarn ? ' That is a lot for a phone.' : ''}`, { warn: words > L.wordsWarn && words <= L.wordsFail, measured: words, limit: L.wordsFail });

  const hits: string[] = [];
  for (let i = 0; i < laid.length; i++)
    for (let j = i + 1; j < laid.length; j++) {
      const a = laid[i];
      const b = laid[j];
      const w = Math.min(a.t.x + a.t.width, b.t.x + b.t.width) - Math.max(a.t.x, b.t.x);
      const h = Math.min(a.t.y + a.b.height, b.t.y + b.b.height) - Math.max(a.t.y, b.t.y);
      if (w > L.slackPx && h > L.slackPx) hits.push(`${a.t.name} and ${b.t.name}`);
    }
  res('overlap', 'Text slots do not overlap', hits.length === 0, hits.length ? `Text overlaps: ${hits.join('; ')}.` : 'No two text slots overlap.');

  // Contrast: the topmost flat block under the slot's centre, else the slide background; anything else is unknown and skipped.
  const bad: string[] = [];
  let known = 0;
  for (const { t, b } of laid) {
    const cx = t.x + t.width / 2;
    const cy = t.y + Math.min(b.height, t.height) / 2;
    const under = layers.filter((l) => l !== t && l.visible !== false && l.kind !== 'text' && cx >= l.x && cx <= l.x + l.width && cy >= l.y && cy <= l.y + l.height && l.width * l.height < o.canvas.w * o.canvas.h * 0.98);
    const top = under[under.length - 1];
    const bg = top ? flat(top) : o.bg;
    const fg = typeof t.style.color === 'string' && /^#/.test(t.style.color) ? t.style.color : null;
    if (!bg || !fg || (top && under.some((u) => u !== top && !flat(u) && u.kind === 'shape'))) continue;
    known++;
    const c = contrastRgb(parseColor(fg).rgb, parseColor(bg).rgb);
    if (c < L.minContrast) bad.push(`${t.name} (${c.toFixed(1)}:1)`);
  }
  res('contrast', 'Contrast', bad.length === 0, bad.length ? `Low contrast on a flat colour: ${bad.join(', ')}.` : `${known} text slot(s) with a known flat background have enough contrast.`, { limit: L.minContrast });
  return out;
}
