// Round J: the visibility rule of a colour drawn as a shape on a ground, in one place so the brand code (brandPalette.ts) and the layout colours (layouts/cuts.ts) use the same one.
// Moved here from brandPalette.ts (which re-exports it): the numbers and their reasons are unchanged.
import { contrast } from './layouts/draw';

/**
 * Round G2: how visible an accent drawn as a SHAPE (a highlight bar, a pill, a card edge) has to be against its ground: 3.6:1 (the luminance contrast ratio of the accent colour against the ground colour).
 * It is the weakest accent the 15 built-in styles ship (object-neon: #45C9A0 on the lightest stop of its dark gradient, 3.67:1; the next are 4.81 and 4.97), rounded down. A brand is never less visible than
 * what we ship. Pale yellow on an off-white ground reads 1.1:1 and does not pass.
 */
export const ACCENT_FLOOR = 3.6;
/**
 * Round G3: brightness is not the only way a shape shows. A pale yellow bar on an off-white page is as bright as the page (1.2:1) and still reads as a clear yellow highlighter, because its COLOUR differs.
 * The colour difference is the distance in OKLab (the perceptual colour space of Ottosson, 2020: L, a, b; simple, one formula, equal steps look about equal). 0.12 is the floor. It is set from the
 * calibration cases, not from the built-ins (the weakest built-in, object-neon at 0.32, would reject the pale yellow, 0.142, which must show): every shape that has to show is at 0.142 or more
 * (pale yellow on off-white 0.142, neon on off-white 0.292, orange on navy 0.578) and every one that must not is at 0.105 or less (navy on near-black 0.105, near-black on near-black 0.023,
 * an accent a few percent from its ground 0.027), so 0.12 sits between them (0.022 above the weakest pass, 0.015 below the strongest fail).
 */
export const ACCENT_FLOOR_DE = 0.12;
const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const oklab = (hex: string): [number, number, number] => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sv = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * sv, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * sv, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * sv];
};
/** The colour difference of two #RRGGBB colours: the Euclidean distance in OKLab. */
export const colourDifference = (a: string, b: string): number => {
  const x = oklab(a), y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
/** A shape in `accent` shows on `ground` when it reaches the floor on brightness (luminance contrast) OR on colour difference. */
export const accentVisible = (accent: string, ground: string): boolean => contrast(accent, ground) >= ACCENT_FLOOR || colourDifference(accent, ground) >= ACCENT_FLOOR_DE;
