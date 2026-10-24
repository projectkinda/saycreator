// Bundled open-licence fonts (SIL OFL 1.1, see fonts/*/OFL.txt). Never loaded from the network.
import sg600 from './fonts/schibsted-grotesk/schibsted-grotesk-latin-600-normal.woff2?url';
import sg700 from './fonts/schibsted-grotesk/schibsted-grotesk-latin-700-normal.woff2?url';
import sg800 from './fonts/schibsted-grotesk/schibsted-grotesk-latin-800-normal.woff2?url';
import is400 from './fonts/instrument-sans/instrument-sans-latin-400-normal.woff2?url';
import is500 from './fonts/instrument-sans/instrument-sans-latin-500-normal.woff2?url';
import is600 from './fonts/instrument-sans/instrument-sans-latin-600-normal.woff2?url';
import type { FontFamily } from './types';

/** Weights that are actually bundled. Any other weight would be faked by the browser. */
export const FONT_WEIGHTS: Record<FontFamily, readonly number[]> = {
  'Schibsted Grotesk': [600, 700, 800],
  'Instrument Sans': [400, 500, 600],
};

const FACES: { family: FontFamily; weight: number; url: string }[] = [
  { family: 'Schibsted Grotesk', weight: 600, url: sg600 },
  { family: 'Schibsted Grotesk', weight: 700, url: sg700 },
  { family: 'Schibsted Grotesk', weight: 800, url: sg800 },
  { family: 'Instrument Sans', weight: 400, url: is400 },
  { family: 'Instrument Sans', weight: 500, url: is500 },
  { family: 'Instrument Sans', weight: 600, url: is600 },
];

let loading: Promise<void> | null = null;

/** Loads every bundled face once. Always await this before measuring or drawing text. */
export function loadFonts(): Promise<void> {
  loading ??= Promise.all(
    FACES.map(async (f) => {
      const face = new FontFace(f.family, `url(${f.url}) format("woff2")`, { weight: String(f.weight), style: 'normal', display: 'block' });
      await face.load();
      document.fonts.add(face);
    }),
  ).then(() => undefined);
  return loading;
}

/** The nearest bundled weight, so a request for 500 on Schibsted Grotesk is told it will look like 600. */
export function nearestWeight(font: FontFamily, weight: number): number {
  return FONT_WEIGHTS[font].reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
}
