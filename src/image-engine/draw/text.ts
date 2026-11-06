// Text layout that measures the real, loaded font. Call loadFonts() first.
import type { FontFamily, TextLayer } from '../types';
import { wordKey } from './words';

let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
function measureCtx() {
  ctx ??=
    typeof OffscreenCanvas !== 'undefined'
      ? (new OffscreenCanvas(8, 8).getContext('2d') as OffscreenCanvasRenderingContext2D)
      : document.createElement('canvas').getContext('2d')!;
  return ctx;
}

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
  const marked = new Set(words.map(wordKey).filter(Boolean));
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
        if (marked.has(wordKey(t))) run.push(t);
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
  /** The index of the word's first character in the layer text (styled layouts). */
  start?: number;
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
  /** Present when the text has runs or letter spacing: the line as pieces with their own weight and colour (x relative to the box). */
  segments?: { text: string; x: number; width: number; weight: number; color?: string }[];
}
export interface TextBlock {
  size: number;
  lineStep: number;
  lines: LaidLine[];
  height: number;
  fits: boolean;
  why?: Fit['why'];
}


// ----- text with runs (own colour / weight inside one layer) and letter spacing -----

interface Piece {
  text: string;
  weight: number;
  color?: string;
}
interface Tok {
  text: string;
  start: number;
}

/** The characters of text[start, end) as pieces: consecutive characters with the same run style stay together. */
function piecesOf(layer: TextLayer, start: number, end: number): Piece[] {
  const base = layer.style.weight;
  const out: Piece[] = [];
  for (let i = start; i < end; i++) {
    const run = layer.runs?.find((r) => i >= r.start && i < r.end);
    const weight = run?.weight ?? base;
    const color = run?.color;
    const last = out[out.length - 1];
    if (last && last.weight === weight && last.color === color) last.text += layer.text[i];
    else out.push({ text: layer.text[i], weight, color });
  }
  return out;
}
const piecesWidth = (ps: Piece[], layer: TextLayer, size: number) => ps.reduce((a, p) => a + measureWidth(p.text, layer.style.font, p.weight, size) + (layer.style.letterSpacing ?? 0) * [...p.text].length, 0);

/** The clear space kept between a marker pill and the words beside it on the same line (the pill's own padding counts as part of the pill). */
export const MARKER_GAP = 12;
const TRAIL = /[.,;:!?…]+$/;

/** Whether a token is a marked word run (every word of it is marked); a pill is only drawn when the highlight has padding. */
function markedTok(layer: TextLayer, marked: Set<string>, t: Tok): boolean {
  if (!layer.highlight || !(layer.highlight.paddingX > 0)) return false;
  const keys = t.text.split(' ').map(wordKey).filter(Boolean);
  return keys.length > 0 && keys.every((q) => marked.has(q));
}
/** Extra space between two neighbouring tokens when exactly one of them sits on a pill: space + extra - padding is at least MARKER_GAP. */
function pillGap(layer: TextLayer, marked: Set<string>, a: Tok, b: Tok, spaceW: number): number {
  if (markedTok(layer, marked, a) === markedTok(layer, marked, b)) return 0;
  return Math.max(0, layer.highlight!.paddingX + MARKER_GAP - spaceW);
}

function wrapStyled(layer: TextLayer, maxWidth: number, size: number): { lines: Tok[][]; wordTooWide: boolean } {
  const lines: Tok[][] = [];
  let wordTooWide = false;
  const spaceW = measureWidth(' ', layer.style.font, layer.style.weight, size) + (layer.style.letterSpacing ?? 0);
  const tokW = (t: Tok) => piecesWidth(piecesOf(layer, t.start, t.start + t.text.length), layer, size);
  const marked = new Set((layer.highlight?.words ?? []).map(wordKey).filter(Boolean));
  let offset = 0;
  for (const para of layer.text.split('\n')) {
    // Only ordinary white space breaks a line: a no-break space keeps two words together.
    const toks: Tok[] = [...para.matchAll(/[\S ]+/g)].map((m) => ({ text: m[0], start: offset + (m.index ?? 0) }));
    offset += para.length + 1;
    if (!toks.length) {
      lines.push([]);
      continue;
    }
    let line: Tok[] = [toks[0]];
    let w = tokW(toks[0]);
    if (w > maxWidth) wordTooWide = true;
    for (const t of toks.slice(1)) {
      const tw = tokW(t);
      const add = spaceW + pillGap(layer, marked, line[line.length - 1], t, spaceW);
      if (w + add + tw <= maxWidth) {
        line.push(t);
        w += add + tw;
      } else {
        lines.push(line);
        line = [t];
        w = tw;
        if (tw > maxWidth) wordTooWide = true;
      }
    }
    lines.push(line);
  }
  return { lines, wordTooWide };
}

/** Spaces inside a run's text become no-break spaces, so a phrase set apart (the accent) is never broken across lines (when it fits in 92% of the width). */
function glueRuns(layer: TextLayer): string {
  if (!layer.runs?.length) return layer.text;
  const chars = [...layer.text];
  for (const r of layer.runs) {
    const sub = layer.text.slice(r.start, r.end);
    if (!sub.includes(' ') || measureWidth(sub, layer.style.font, layer.style.weight, layer.style.size) > layer.width * 0.92) continue;
    for (let i = r.start; i < r.end && i < chars.length; i++) if (chars[i] === ' ') chars[i] = '\u00A0';
  }
  return chars.join('');
}

/** Balanced lines for a headline: the narrowest width that keeps the same number of lines, then no single-word last line when the line before it can give a word. */
function balanceLines(layer: TextLayer, lines: Tok[][], size: number): Tok[][] {
  const n = lines.length;
  if (n < 2) return lines;
  let lo = Math.max(...lines.flat().map((t) => piecesWidth(piecesOf(layer, t.start, t.start + t.text.length), layer, size)));
  let hi = layer.width;
  for (let k = 0; k < 14 && hi - lo > 1; k++) {
    const mid = (lo + hi) / 2;
    if (wrapStyled(layer, mid, size).lines.length <= n) hi = mid;
    else lo = mid;
  }
  let out = wrapStyled(layer, hi, size).lines;
  if (out.length !== n) out = lines;
  const spaceW = measureWidth(' ', layer.style.font, layer.style.weight, size) + (layer.style.letterSpacing ?? 0);
  const markedSet = new Set((layer.highlight?.words ?? []).map(wordKey).filter(Boolean));
  const widthOf = (ts: Tok[]) => ts.reduce((a, t, i) => a + piecesWidth(piecesOf(layer, t.start, t.start + t.text.length), layer, size) + (i > 0 ? spaceW + pillGap(layer, markedSet, ts[i - 1], t, spaceW) : 0), 0);
  const last = out[out.length - 1];
  const prev = out[out.length - 2];
  const wordsIn = (ts: Tok[]) => ts.reduce((a, t) => a + t.text.split(/[\s ]+/).filter(Boolean).length, 0);
  if (wordsIn(last) === 1 && prev.length >= 2 && widthOf([prev[prev.length - 1], ...last]) <= layer.width) out = [...out.slice(0, -2), prev.slice(0, -1), [prev[prev.length - 1], ...last]];
  return out;
}

/** The width of the punctuation that ends a word (a comma, full stop, colon ...), so a marker bar can stop before it. Zero when the word is only punctuation. */
function trailWidth(w: { text: string; start?: number }, layer: TextLayer, size: number, weight?: number): number {
  const t = w.text.replace(/ /g, ' ');
  const m = TRAIL.exec(t);
  if (!m || m[0].length >= t.length) return 0;
  // punctuation inside a coloured run keeps that colour (the marker's ink): the bar must keep covering it
  if (w.start !== undefined && layer.runs?.some((r) => r.start < w.start! + t.length && r.end > w.start! + t.length - m[0].length)) return 0;
  return measureWidth(m[0], layer.style.font, weight ?? layer.style.weight, size) + (layer.style.letterSpacing ?? 0) * m[0].length;
}

function layoutStyled(layer0: TextLayer): TextBlock {
  const layer: TextLayer = { ...layer0, text: glueRuns(layer0) };
  const s = layer.style;
  const ls = s.letterSpacing ?? 0;
  const tryAt = (size: number) => {
    let w = wrapStyled(layer, layer.width, size);
    if (layer.balance && !layer.text.includes('\n')) w = { ...w, lines: balanceLines(layer, w.lines, size) };
    const lineStep = size * s.lineHeight;
    const height = w.lines.length * lineStep;
    return { size, w, lineStep, height, fits: height <= layer.height + 0.01 && !w.wordTooWide };
  };
  let fit = tryAt(Math.floor(layer.autoFit ? s.size : s.size));
  if (layer.autoFit) for (let size = Math.floor(s.size); size >= Math.ceil(layer.autoFit.minSize); size--) {
    fit = tryAt(size);
    if (fit.fits) break;
  }
  const marked = new Set((layer.highlight?.words ?? []).map(wordKey).filter(Boolean));
  const wholeLines = new Set(layer.highlight?.lines ?? []);
  const firstOnly = !!layer.highlight?.onlyFirst;
  const used = new Set<string>();
  const top = s.valign === 'middle' ? (layer.height - fit.height) / 2 : s.valign === 'bottom' ? layer.height - fit.height : 0;
  const spaceW = measureWidth(' ', s.font, s.weight, fit.size) + ls;
  const lines: LaidLine[] = fit.w.lines.map((toks, i) => {
    const tw = toks.map((t) => piecesWidth(piecesOf(layer, t.start, t.start + t.text.length), layer, fit.size));
    const gapAt = (k: number) => (k > 0 ? spaceW + pillGap(layer, marked, toks[k - 1], toks[k], spaceW) : 0);
    const width = Math.max(0, tw.reduce((a, b) => a + b, 0) + toks.reduce((a, _t, k) => a + gapAt(k), 0) - (ls > 0 ? ls : 0));
    const x0 = s.align === 'center' ? (layer.width - width) / 2 : s.align === 'right' ? layer.width - width : 0;
    const words: LaidWord[] = [];
    const segments: NonNullable<LaidLine['segments']> = [];
    let cx = x0;
    toks.forEach((t, k) => {
      if (k > 0) cx += gapAt(k) - spaceW; // the extra clear space beside a marker pill (the plain space is added after each word)
      // A phrase glued with no-break spaces (so it never breaks across lines) is ONE token here: it is marked when every word of it is marked.
      const keys = t.text.split('\u00A0').map(wordKey).filter(Boolean);
      const hit = keys.length > 0 && keys.every((q) => marked.has(q)) && (!firstOnly || keys.every((q) => !used.has(q)));
      if (hit) keys.forEach((q) => used.add(q));
      words.push({ text: t.text, start: t.start, x: cx, width: tw[k], highlighted: wholeLines.has(i) || hit });
      let px = cx;
      let firstPiece = true;
      for (const p of piecesOf(layer, t.start, t.start + t.text.length)) {
        const pw = piecesWidth([p], layer, fit.size);
        const before = segments[segments.length - 1];
        // Neighbouring words with the same weight and colour are one piece (one text run per style change, not per word).
        if (firstPiece && k > 0 && before && before.weight === p.weight && before.color === p.color && gapAt(k) === spaceW) {
          before.text += ' ' + p.text;
          before.width = px + pw - before.x;
        } else segments.push({ text: p.text, x: px, width: pw, weight: p.weight, ...(p.color ? { color: p.color } : {}) });
        px += pw;
        firstPiece = false;
      }
      cx += tw[k] + spaceW;
    });
    const marks: LaidLine['marks'] = [];
    for (const w of words) {
      if (!w.highlighted) continue;
      const prev = marks[marks.length - 1];
      const lastWord = words[words.indexOf(w) - 1];
      // A bar never covers the punctuation that ends the marked words (, . ; : ! ?).
      const wEnd = w.x + w.width - trailWidth(w, layer, fit.size);
      if (prev && lastWord?.highlighted) prev.width = wEnd - prev.x;
      else marks.push({ x: w.x, width: wEnd - w.x });
    }
    return { text: toks.map((t) => t.text).join(' '), x: x0, y: top + i * fit.lineStep, width, words, marks, segments };
  });
  // The no-break spaces were only for wrapping: the lines hold ordinary spaces.
  for (const l of lines) {
    l.text = l.text.replace(/\u00A0/g, ' ');
    for (const w of l.words) w.text = w.text.replace(/\u00A0/g, ' ');
    for (const g of l.segments ?? []) g.text = g.text.replace(/\u00A0/g, ' ');
  }
  return { size: fit.size, lineStep: fit.lineStep, lines, height: fit.height, fits: fit.fits, why: fit.fits ? undefined : fit.w.wordTooWide ? 'word-too-wide' : 'too-tall' };
}

/** Everything the renderer needs to draw a text layer: size, lines, word positions, highlight runs. */
export function layoutText(layer: TextLayer): TextBlock {
  const { style: s } = layer;
  // Runs and letter spacing take the styled path; every older layer keeps the original one, unchanged.
  if (layer.runs?.length || s.letterSpacing || layer.balance) return layoutStyled(layer);
  const fit = layer.autoFit
    ? fitText({ text: layer.text, font: s.font, weight: s.weight, maxSize: s.size, minSize: layer.autoFit.minSize, lineHeight: s.lineHeight, width: layer.width, height: layer.height })
    : (() => {
        const w = wrapText(layer.text, layer.width, s.font, s.weight, s.size);
        const lineStep = s.size * s.lineHeight;
        const height = w.lines.length * lineStep;
        const fits = height <= layer.height + 0.01 && !w.wordTooWide;
        return { size: s.size, lines: w.lines, lineStep, height, fits, why: fits ? undefined : w.wordTooWide ? 'word-too-wide' : 'too-tall' } as Fit;
      })();

  const marked = new Set((layer.highlight?.words ?? []).map(wordKey).filter(Boolean));
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
        highlighted: wholeLines.has(i) || (marked.has(wordKey(m[0])) && (!firstOnly || !used.has(wordKey(m[0])) ? (used.add(wordKey(m[0])), true) : false)),
      });
      cursor = start + m[0].length;
    }
    // Merge neighbouring highlighted words into one background run (covers the space between them).
    const marks: LaidLine['marks'] = [];
    for (const w of words) {
      if (!w.highlighted) continue;
      const prev = marks[marks.length - 1];
      const lastWord = words[words.indexOf(w) - 1];
      const wEnd = w.x + w.width;
      if (prev && lastWord?.highlighted) prev.width = wEnd - prev.x;
      else marks.push({ x: w.x, width: wEnd - w.x });
    }
    return { text, x: x0, y: top + i * fit.lineStep, width, words, marks };
  });

  return { size: fit.size, lineStep: fit.lineStep, lines, height: fit.height, fits: fit.fits, why: fit.why };
}
