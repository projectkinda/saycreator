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

/** The smallest a footer item (page number, handle, swipe cue) may be on the 1080 x 1350 slide. */
export const FOOTER_MIN = 28;
const flat = (l: Layer): string | null => {
  if (l.kind !== 'shape') return null;
  const f = (l as { fill?: unknown }).fill;
  return typeof f === 'string' && /^#[0-9a-fA-F]{6}$/.test(f) ? f : null;
};

/** `layers`: the filled layers in the design's own coordinates; `k`: output pixels per design pixel (a design fitted on a smaller card is below 1). */
export function faithfulChecks(layers: Layer[], o: { canvas: { w: number; h: number }; bg: string; k: number; slideType: string; /** A prose slide: its own, higher word limit, counted without the handle and the page number. */ prose?: boolean }): CarouselLintResult[] {
  const L = CAROUSEL_LIMITS;
  const texts = layers.filter((l): l is TextLayer => l.kind === 'text' && l.visible !== false && l.role !== 'decor' && !!l.text.trim());
  const out: CarouselLintResult[] = [];
  const res = (id: CarouselLintResult['id'], label: string, pass: boolean, reason: string, extra: Partial<CarouselLintResult> = {}) => out.push({ id, label, pass, reason, ...extra });
  const laidAll = texts.map((t) => ({ t, b: layoutText(t) }));
  // The footer items (page number, handle, swipe cue) take part in the size check only: they must be 28 px or bigger.
  const laid = laidAll.filter((x) => x.t.name !== 'recurring');
  const floorOf = (t: TextLayer) => (t.name === 'recurring' ? FOOTER_MIN : L.minTextPx);

  const small = laidAll.filter((x) => x.b.size * o.k < floorOf(x.t) - 0.5);
  res('size', 'Text is big enough', small.length === 0, small.length ? `${small.length} text slot(s) are under ${floorOf(small[0].t)} px at the exported size (smallest ${Math.round(Math.min(...small.map((x) => x.b.size * o.k)))} px).` : `Every text slot is ${L.minTextPx} px or bigger.`, { measured: laidAll.length ? Math.round(Math.min(...laidAll.map((x) => x.b.size * o.k))) : undefined, limit: L.minTextPx });

  const edge = L.edgePx / o.k;
  const near = laid.filter(({ t, b }) => t.x < edge - 1 || t.x + t.width > o.canvas.w - edge + 1 || t.y + b.height > o.canvas.h - edge + 1 || t.y < edge - 1);
  res('edges', 'Margins and edges', near.length === 0, near.length ? `${near.length} text slot(s) come closer than ${L.edgePx} px to an edge.` : `Every text slot keeps ${L.edgePx} px from the edges.`);

  const words = texts.filter((t) => !o.prose || t.name !== 'recurring').reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);
  const wordsLimit = o.prose ? L.proseWordsFail : L.wordsFail;
  const warnAt = o.prose ? wordsLimit : L.wordsWarn; // a prose slide is made for words: no "a lot" warning below its own limit
  if (WORDS_CHECKED_TYPES.includes(o.slideType)) res('words', 'Words on the slide', words <= wordsLimit, `${words} words on the slide.${words > warnAt ? " That is a lot for a phone." : ""}`, { warn: words > warnAt && words <= wordsLimit, measured: words, limit: wordsLimit });

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
    const hexOf = (c: unknown) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null);
    const fg = hexOf(t.style.color);
    if (!bg || !fg || (top && under.some((u) => u !== top && !flat(u) && u.kind === 'shape'))) continue;
    known++;
    // The slot's own colour, and every word that has a colour of its own: an accent run (set in the accent or on a marker) and a word on a marker bar. Each is measured against what is
    // directly behind it: the bar's colour for a word on a bar, else the flat colour under the slot.
    const read = (name: string, ink: string, back: string) => {
      const c = contrastRgb(parseColor(ink).rgb, parseColor(back).rgb);
      // Round B: display text (96 px and up) has to reach 3:1 only, the rule the layout library already follows for a big headline's accent (4.5:1 for anything smaller). Asking 4.5:1 of a 140 px word
      // made the Round 15 repair stage move good slides to other layouts, and drop their highlight, for a colour the library had chosen on purpose.
      const need = Number(t.style.size) >= 96 ? Math.min(3, L.minContrast) : L.minContrast;
      if (c < need) bad.push(name + ' (' + c.toFixed(1) + ':1)');
    };
    const hl = t.highlight;
    const hlBg = hexOf(hl?.color);
    const words = b.lines.flatMap((ln) => ln.words);
    const own = words.filter((w) => w.start !== undefined);
    if (!own.length || (!t.runs?.length && !(hl && hlBg))) read(t.name ?? 'text', fg as string, bg as string);
    else {
      const seen = new Set<string>();
      for (const w of own) {
        const run = t.runs?.find((r) => r.start < w.start! + w.text.length && r.end > w.start!);
        const ink = hexOf(run?.color) ?? (w.highlighted ? hexOf(hl?.textColor) : null) ?? fg;
        const back = w.highlighted && hlBg ? hlBg : bg;
        const key = ink + back;
        if (seen.has(key)) continue;
        seen.add(key);
        read((t.name ?? 'text') + (run || w.highlighted ? ' "' + w.text + '"' : ''), ink, back);
      }
    }
  }
  res('contrast', 'Contrast', bad.length === 0, bad.length ? `Low contrast on a flat colour: ${bad.join(', ')}.` : `${known} text slot(s) with a known flat background have enough contrast.`, { limit: L.minContrast });
  return out;
}
