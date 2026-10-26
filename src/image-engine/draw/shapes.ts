// The cut-out shapes a layer can be masked to, as SVG path data in a 0 to 100 box. Pure: no DOM, no Fabric.

const f = (n: number) => Math.round(n * 100) / 100;

/** Normalises a polar curve so it touches all four sides of the 0 to 100 box (so the layer's box is filled). */
function fill100(radius: (a: number) => number, points = 200): string {
  const pts = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const r = radius(a);
    return [Math.cos(a) * r, Math.sin(a) * r] as const;
  });
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${f(((x - x0) / (x1 - x0)) * 100)} ${f(((y - y0) / (y1 - y0)) * 100)}`).join(' ') + ' Z';
}

export const SHAPE_PATHS = {
  /** A rectangle with a semicircle on top. */
  arch: 'M 0 100 L 0 50 C 0 22 22 0 50 0 C 78 0 100 22 100 50 L 100 100 Z',
  diamond: 'M 50 0 L 100 50 L 50 100 L 0 50 Z',
  /** Six round petals, like the flower-shaped photo crop in the references. */
  flower: fill100((a) => 40 + 8.5 * Math.cos(6 * a)),
  /** An organic blob. */
  blob: fill100((a) => 40 + 6 * Math.cos(2 * a + 1) + 5 * Math.cos(3 * a + 2) + 3 * Math.cos(5 * a)),
  /** A starburst sticker with 16 points. */
  starburst: Array.from({ length: 32 }, (_, i) => {
    const ang = (i / 32) * Math.PI * 2;
    const r = i % 2 === 0 ? 50 : 41;
    return `${i === 0 ? 'M' : 'L'} ${f(50 + Math.cos(ang) * r)} ${f(50 + Math.sin(ang) * r)}`;
  }).join(' ') + ' Z',
} as const;

export type PathShape = keyof typeof SHAPE_PATHS;
export const isPathShape = (s: string): s is PathShape => s in SHAPE_PATHS;
