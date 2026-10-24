// Colour maths for contrast checks. Pure.

export type RGB = [number, number, number];

export function parseColor(css: string): { rgb: RGB; alpha: number } {
  const hex = css.trim().match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { rgb: [n(0), n(2), n(4)], alpha: h.length === 8 ? n(6) / 255 : 1 };
  }
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: m[4] === undefined ? 1 : Number(m[4]) };
  throw new Error(`Not a colour: ${css}`);
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export const luminance = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG contrast ratio, 1 to 21. */
export function contrast(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export const contrastRgb = (a: RGB, b: RGB) => contrast(luminance(...a), luminance(...b));

/** The more readable of the candidate text colours on this background. */
export function bestTextColor(background: string, candidates: string[]): string {
  const bg = parseColor(background).rgb;
  return candidates.reduce((best, c) => (contrastRgb(parseColor(c).rgb, bg) > contrastRgb(parseColor(best).rgb, bg) ? c : best));
}
