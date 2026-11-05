// Bundled open-licence fonts (SIL OFL 1.1, see fonts/*/OFL.txt). Never loaded from the network.
import sg600 from './fonts/schibsted-grotesk/schibsted-grotesk-latin-600-normal.woff2?url';
import sg700 from './fonts/schibsted-grotesk/schibsted-grotesk-latin-700-normal.woff2?url';
import sg800 from './fonts/schibsted-grotesk/schibsted-grotesk-latin-800-normal.woff2?url';
import is400 from './fonts/instrument-sans/instrument-sans-latin-400-normal.woff2?url';
import is500 from './fonts/instrument-sans/instrument-sans-latin-500-normal.woff2?url';
import is600 from './fonts/instrument-sans/instrument-sans-latin-600-normal.woff2?url';
import hg300 from './fonts/hanken-grotesk/hanken-grotesk-latin-300-normal.woff2?url';
import hg500 from './fonts/hanken-grotesk/hanken-grotesk-latin-500-normal.woff2?url';
import hg700 from './fonts/hanken-grotesk/hanken-grotesk-latin-700-normal.woff2?url';
import sm400 from './fonts/space-mono/space-mono-latin-400-normal.woff2?url';
import sm700 from './fonts/space-mono/space-mono-latin-700-normal.woff2?url';
import isi400 from './fonts/instrument-serif/instrument-serif-latin-400-italic.woff2?url';
import bn400 from './fonts/bebas-neue/bebas-neue-latin-400-normal.woff2?url';
import cb400 from './fonts/caveat-brush/caveat-brush-latin-400-normal.woff2?url';
import type { FontFamily } from './types';

/** Weights that are actually bundled. Any other weight would be faked by the browser. */
export const FONT_WEIGHTS: Record<FontFamily, readonly number[]> = {
  'Schibsted Grotesk': [600, 700, 800],
  'Instrument Sans': [400, 500, 600],
  'Hanken Grotesk': [300, 500, 700],
  'Space Mono': [400, 700],
  'Instrument Serif Italic': [400],
  'Bebas Neue': [400],
  'Caveat Brush': [400],
};

const FACES: { family: FontFamily; weight: number; url: string }[] = [
  { family: 'Schibsted Grotesk', weight: 600, url: sg600 },
  { family: 'Schibsted Grotesk', weight: 700, url: sg700 },
  { family: 'Schibsted Grotesk', weight: 800, url: sg800 },
  { family: 'Instrument Sans', weight: 400, url: is400 },
  { family: 'Instrument Sans', weight: 500, url: is500 },
  { family: 'Instrument Sans', weight: 600, url: is600 },
  { family: 'Hanken Grotesk', weight: 300, url: hg300 },
  { family: 'Hanken Grotesk', weight: 500, url: hg500 },
  { family: 'Hanken Grotesk', weight: 700, url: hg700 },
  { family: 'Space Mono', weight: 400, url: sm400 },
  { family: 'Space Mono', weight: 700, url: sm700 },
  { family: 'Instrument Serif Italic', weight: 400, url: isi400 },
  { family: 'Bebas Neue', weight: 400, url: bn400 },
  { family: 'Caveat Brush', weight: 400, url: cb400 },
];

let loading: Promise<void> | null = null;

/** Loads every bundled face once. Always await this before measuring or drawing text. */
/** @font-face rules with the bundled fonts inside (base64), so a picture saved as an SVG draws with the right fonts anywhere. */
const faceCache = new Map<string, string>();
export async function fontFaceCss(families: string[]): Promise<string> {
  const out: string[] = [];
  for (const f of FACES.filter((x) => families.includes(x.family))) {
    let css = faceCache.get(f.url);
    if (!css) {
      const buf = new Uint8Array(await (await fetch(f.url)).arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      css = `@font-face{font-family:"${f.family}";font-weight:${f.weight};src:url(data:font/woff2;base64,${btoa(bin)}) format("woff2");}`;
      faceCache.set(f.url, css);
    }
    out.push(css);
  }
  return out.join('');
}

export function loadFonts(): Promise<void> {
  loading ??= Promise.all(
    FACES.map(async (f) => {
      const face = new FontFace(f.family, `url(${f.url}) format("woff2")`, { weight: String(f.weight), style: 'normal', display: 'block' });
      await face.load();
      document.fonts.add(face);
    }),
  ).then(async () => {
    // Warm-up: make the browser resolve every bundled face for text now, so the first measurement (and the first drawing) already uses the real font and not a stand-in.
    await Promise.all(FACES.map((f) => document.fonts.load(`${f.weight} 32px "${f.family}"`, 'The benefits 0123 ?$%')));
  });
  return loading;
}

/** The nearest bundled weight, so a request for 500 on Schibsted Grotesk is told it will look like 600. */
export function nearestWeight(font: FontFamily, weight: number): number {
  return FONT_WEIGHTS[font].reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
}
