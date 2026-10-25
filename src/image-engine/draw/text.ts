// Text layout that measures the real, loaded font. Call loadFonts() first.
import type { FontFamily, TextLayer } from '../types';

let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
function measureCtx() {
  ctx ??=
    typeof OffscreenCanvas !== 'undefined'
      ? (new OffscreenCanvas(8, 8).getContext('2d') as OffscreenCanvasRenderingContext2D)
      : document.createElement('canvas').getContext('2d')!;
  return ctx;
}

const clean = (w: string) => w.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();

export const fontString = (font: FontFamily, weight: number, size: number) => `${weight} ${size}px "${font}"`;

export function measureWidth(text: string, font: FontFamily, weight: number, size: number): number {
  const c = measureCtx();
  c.font = fontString(font, weight, size);
  return c.measureText(text).width;
}

/**
 * Keeps a highlighted phrase on one line, so its bar is one continuous block and never two blocks on two lines.
 * Consecutive marked words are joined with no-break spaces, if the whole phrase fits in 92% of the width. A phrase
 * that is wider than a line is left alone (it must wrap, and its bars then touch line to line).
 */
export function glueWords(text: string, words: string[], width: number, font: FontFamily, weight: number, size: number): string {
  const marked = new Set(words.map((w) => clean(w)).filter(Boolean));
  if (marked.size === 0 || !text.includes(' ')) return text;
  return text
    .split('\n')
    .map((para) => {
      const toks = para.split(/[^\S\u00A0]+/).filter(Boolean);
      const out: string[] = [];
      let run: string[] = [];
      const flush = () => {
        if (run.length >= 2 && measureWidth(run.join(' '), font, weight, size) <= width * 0.92) out.push(run.join('\u00A0'));
        else out.push(...run);
        run = [];
      };
      for (const t of toks) {
        if (marked.has(clean(t))) run.push(t);
        else {
          flush();
          out.push(t);
        }
      }
      flush();
      return out.join(' ');
    })
    .join('\n');
}

export interface Wrapped {
  lines: string[];
  /** True when a single word is wider than the box, so it cannot be wrapped to fit. */
  wordTooWide: boolean;
}

/** Greedy wrap using real glyph widths. Keeps explicit line breaks. A lone long word gets its own line. */
export function wrapText(text: string, maxWidth: number, font: FontFamily, weight: number, size: number): Wrapped {
  const lines: string[] = [];
  let wordTooWide = false;
  for (const para of text.split('\n')) {
    // Only ordinary white space breaks a line: a no-break space (U+00A0) keeps two words together.
    const words = para.split(/[^\S\u00A0]+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0];
    if (measureWidth(line, font, weight, size) > maxWidth) wordTooWide = true;
    for (const w of words.slice(1)) {
      const trial = `${line} ${w}`;
      if (measureWidth(trial, font, weight, size) <= maxWidth) line = trial;
      else {
        lines.push(line);
        line = w;
        if (measureWidth(w, font, weight, size) > maxWidth) wordTooWide = true;
      }
    }
    lines.push(line);
  }
  return { lines, wordTooWide };
}

export interface Fit {
  size: number;
  lines: string[];
  lineStep: number;
  height: number;
  fits: boolean;
  why?: 'too-tall' | 'word-too-wide';
}

/**
 * The biggest whole-number size from maxSize down to minSize at which the wrapped text fits the box.
 * If nothing fits, returns minSize with fits=false and says why.
 */
export function fitText(opts: {
  text: string;
  font: FontFamily;
  weight: number;
  maxSize: number;
  minSize: number;
  lineHeight: number;
  width: number;
  height: number;
}): Fit {
  let last: Fit | null = null;
  for (let size = Math.floor(opts.maxSize); size >= Math.ceil(opts.minSize); size--) {
    const w = wrapText(opts.text, opts.width, opts.font, opts.weight, size);
    const lineStep = size * opts.lineHeight;
    const height = w.lines.length * lineStep;
    const fits = height <= opts.height + 0.01 && !w.wordTooWide; // a hundredth of a pixel of slack: heights are rounded up when boxes are made
    last = { size, lines: w.lines, lineStep, height, fits, why: fits ? undefined : w.wordTooWide ? 'word-too-wide' : 'too-tall' };
    if (fits) return last;
  }
  return last as Fit;
}

export interface LaidWord {
  text: string;
  x: number;
  width: number;
  highlighted: boolean;
}
export interface LaidLine {
  text: string;
  /** Left edge of the line, relative to the box. */
  x: number;
  /** Top of the line's slot, relative to the box. */
  y: number;
  width: number;
  words: LaidWord[];
  /** Merged background runs for highlighted words: x and width relative to the box. */
  marks: { x: number; width: number }[];
}
export interface TextBlock {
  size: number;
  lineStep: number;
  lines: LaidLine[];
  height: number;
  fits: boolean;
  why?: Fit['why'];
}


/** Everything the renderer needs to draw a text layer: size, lines, word positions, highlight runs. */
export function layoutText(layer: TextLayer): TextBlock {
  const { style: s } = layer;
  const fit = layer.autoFit
    ? fitText({ text: layer.text, font: s.font, weight: s.weight, maxSize: s.size, minSize: layer.autoFit.minSize, lineHeight: s.lineHeight, width: layer.width, height: layer.height })
    : (() => {
        const w = wrapText(layer.text, layer.width, s.font, s.weight, s.size);
        const lineStep = s.size * s.lineHeight;
        const height = w.lines.length * lineStep;
        const fits = height <= layer.height + 0.01 && !w.wordTooWide;
        return { size: s.size, lines: w.lines, lineStep, height, fits, why: fits ? undefined : w.wordTooWide ? 'word-too-wide' : 'too-tall' } as Fit;
      })();

  const marked = new Set((layer.highlight?.words ?? []).map((w) => w.toLowerCase()));
  const wholeLines = new Set(layer.highlight?.lines ?? []);
  const firstOnly = !!layer.highlight?.onlyFirst;
  const used = new Set<string>();
  const top = s.valign === 'middle' ? (layer.height - fit.height) / 2 : s.valign === 'bottom' ? layer.height - fit.height : 0;

  const lines: LaidLine[] = fit.lines.map((text, i) => {
    const width = measureWidth(text, s.font, s.weight, fit.size);
    const x0 = s.align === 'center' ? (layer.width - width) / 2 : s.align === 'right' ? layer.width - width : 0;
    const words: LaidWord[] = [];
    let cursor = 0;
    for (const m of text.matchAll(/\S+/g)) {
      const start = m.index ?? cursor;
      const before = measureWidth(text.slice(0, start), s.font, s.weight, fit.size);
      words.push({
        text: m[0],
        x: x0 + before,
        width: measureWidth(m[0], s.font, s.weight, fit.size),
        highlighted: wholeLines.has(i) || (marked.has(clean(m[0])) && (!firstOnly || !used.has(clean(m[0])) ? (used.add(clean(m[0])), true) : false)),
      });
      cursor = start + m[0].length;
    }
    // Merge neighbouring highlighted words into one background run (covers the space between them).
    const marks: LaidLine['marks'] = [];
    for (const w of words) {
      if (!w.highlighted) continue;
      const prev = marks[marks.length - 1];
      const lastWord = words[words.indexOf(w) - 1];
      if (prev && lastWord?.highlighted) prev.width = w.x + w.width - prev.x;
      else marks.push({ x: w.x, width: w.width });
    }
    return { text, x: x0, y: top + i * fit.lineStep, width, words, marks };
  });

  return { size: fit.size, lineStep: fit.lineStep, lines, height: fit.height, fits: fit.fits, why: fit.why };
}
