// Elements drawn in code: shapes, doodles, textures, tape, stickers and simple objects. Each makes SVG text with colour
// tokens (accent, accent-dark, accent-light, marker, text, muted, surface, line) instead of colours, so the same
// element takes any style's palette. A seed gives a different but repeatable variant. No images, no network.

export interface CodeElementDef {
  name: string;
  tags: string[];
  /** How many seeded variants to list in the library. */
  seeds: number;
  width: number;
  height: number;
  /** The colour tokens the element uses. */
  slots: string[];
  /** Texture elements are meant to fill a large area quietly. */
  texture?: boolean;
  make: (seed: number) => string;
}

const f = (n: number) => Math.round(n * 10) / 10;

/** Small repeatable random numbers (mulberry32). */
function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const svg = (w: number, h: number, inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;

/** A smooth closed curve through points (Catmull-Rom turned into cubic curves). */
function closedCurve(pts: [number, number][]): string {
  const n = pts.length;
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + ' Z';
}

const blob = (seed: number) => {
  const r = rng(seed);
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const rad = 34 + r() * 14;
    return [50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad] as [number, number];
  });
  return svg(100, 100, `<path d="${closedCurve(pts)}" fill="accent"/>`);
};

const squiggle = (seed: number) => {
  const r = rng(seed);
  const waves = 4 + Math.floor(r() * 3);
  const step = 190 / waves;
  let d = `M 5 30`;
  for (let i = 0; i < waves; i++) {
    const x = 5 + i * step;
    const up = i % 2 === 0 ? 8 : 52;
    d += ` C ${f(x + step * 0.25)} ${up + (r() - 0.5) * 6} ${f(x + step * 0.75)} ${(i % 2 === 0 ? 52 : 8) + (r() - 0.5) * 6} ${f(x + step)} 30`;
  }
  return svg(200, 60, `<path d="${d}" fill="none" stroke="accent" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`);
};

const loopArrow = (seed: number) => {
  const r = rng(seed);
  const j = () => (r() - 0.5) * 10;
  return svg(200, 140, `<path d="M 12 118 C ${f(10 + j())} ${f(40 + j())} ${f(95 + j())} ${f(8 + j())} ${f(112 + j())} ${f(48 + j())} C ${f(124 + j())} ${f(86 + j())} ${f(66 + j())} ${f(86 + j())} ${f(80 + j())} ${f(50 + j())} C ${f(92 + j())} ${f(22 + j())} ${f(150 + j())} ${f(30 + j())} 184 18" fill="none" stroke="text" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M 164 6 L 186 18 L 168 36" fill="none" stroke="text" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
};

const curveArrow = (seed: number) => {
  const r = rng(seed);
  const bend = 20 + r() * 30;
  return svg(200, 100, `<path d="M 10 80 Q ${f(60 + r() * 20)} ${f(80 - bend * 2)} 176 ${f(34 + r() * 8)}" fill="none" stroke="text" stroke-width="6" stroke-linecap="round"/><path d="M 150 14 L 180 34 L 154 58" fill="none" stroke="text" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
};

const underline = (seed: number) => {
  const r = rng(seed);
  return svg(200, 30, `<path d="M 4 ${f(18 + r() * 4)} C ${f(40 + r() * 10)} ${f(6 + r() * 4)} ${f(70 + r() * 10)} ${f(26 + r() * 3)} ${f(110 + r() * 10)} ${f(14 + r() * 3)} C ${f(150 + r() * 10)} ${f(4 + r() * 4)} ${f(180 + r() * 5)} ${f(20 + r() * 4)} 196 ${f(10 + r() * 4)}" fill="none" stroke="accent" stroke-width="8" stroke-linecap="round"/>`);
};

const scribbleCircle = (seed: number) => {
  const r = rng(seed);
  const j = () => (r() - 0.5) * 8;
  return svg(200, 120, `<path d="M ${f(18 + j())} 64 C ${f(10 + j())} 24 ${f(70 + j())} 8 ${f(124 + j())} 12 C ${f(180 + j())} 16 ${f(196 + j())} 56 ${f(176 + j())} 86 C ${f(150 + j())} 118 ${f(70 + j())} 114 ${f(34 + j())} 92 C ${f(14 + j())} 78 ${f(14 + j())} 52 ${f(34 + j())} 34" fill="none" stroke="text" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
};

const starburst = (seed: number) => {
  const r = rng(seed);
  const n = 12 + Math.floor(r() * 4);
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? 48 : 36 + r() * 4;
    d += `${i === 0 ? 'M' : 'L'} ${f(50 + Math.cos(a) * rad)} ${f(50 + Math.sin(a) * rad)} `;
  }
  return svg(100, 100, `<path d="${d}Z" fill="accent" stroke="line" stroke-width="3" stroke-linejoin="round"/>`);
};

const sparkle = () => svg(100, 100, `<path d="M 50 4 C 54 34 66 46 96 50 C 66 54 54 66 50 96 C 46 66 34 54 4 50 C 34 46 46 34 50 4 Z" fill="marker"/>`);

const halftone = (seed: number) => {
  const r = rng(seed);
  const n = 11;
  const step = 200 / n;
  const dir = r() * Math.PI * 2;
  let d = '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const t = ((x / (n - 1)) * Math.cos(dir) + (y / (n - 1)) * Math.sin(dir) + 1) / 2;
      const rad = 1.2 + Math.max(0, Math.min(1, t)) * (step / 2 - 1.4);
      const cx = step / 2 + x * step;
      const cy = step / 2 + y * step;
      const k = 0.5523 * rad;
      d += `M ${f(cx + rad)} ${f(cy)} C ${f(cx + rad)} ${f(cy + k)} ${f(cx + k)} ${f(cy + rad)} ${f(cx)} ${f(cy + rad)} C ${f(cx - k)} ${f(cy + rad)} ${f(cx - rad)} ${f(cy + k)} ${f(cx - rad)} ${f(cy)} C ${f(cx - rad)} ${f(cy - k)} ${f(cx - k)} ${f(cy - rad)} ${f(cx)} ${f(cy - rad)} C ${f(cx + k)} ${f(cy - rad)} ${f(cx + rad)} ${f(cy - k)} ${f(cx + rad)} ${f(cy)} Z `;
    }
  return svg(200, 200, `<path d="${d}" fill="accent"/>`);
};

const grain = (seed: number) => {
  const r = rng(seed);
  let d = '';
  for (let i = 0; i < 900; i++) d += `M ${f(r() * 198)} ${f(r() * 198)} h ${f(0.8 + r() * 1.4)} v ${f(0.8 + r() * 1.4)} h -1.4 Z `;
  return svg(200, 200, `<path d="${d}" fill="text" fill-opacity="0.35"/>`);
};

const brush = (seed: number) => {
  const r = rng(seed);
  const top = Array.from({ length: 6 }, (_, i) => `${i === 0 ? 'M' : 'L'} ${f(6 + i * 37)} ${f(8 + r() * 10)}`).join(' ');
  const bottom = Array.from({ length: 6 }, (_, i) => `L ${f(194 - i * 37)} ${f(52 + r() * 10)}`).join(' ');
  return svg(200, 70, `<path d="${top} L 198 ${f(30 + r() * 8)} ${bottom} L 2 ${f(34 + r() * 8)} Z" fill="marker"/>`);
};

const tape = (seed: number) => {
  const r = rng(seed);
  const zig = (x: number, dir: number): [number, number][] => [1, 2, 3, 4].map((i) => [x + (i % 2 ? dir * (4 + r() * 3) : 0), 8 + i * 8.8]);
  const pts: [number, number][] = [[10, 8], [150, 8], ...zig(150, 1), [150, 52], [10, 52], ...zig(10, -1).reverse()];
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"} ${f(x)} ${f(y)}`).join(" ") + " Z";
  return svg(160, 60, `<path d="${d}" fill="marker" fill-opacity="0.85" stroke="line" stroke-opacity="0.25" stroke-width="1"/>`);
};

const tornPaper = (seed: number) => {
  const r = rng(seed);
  const edge = (y0: number, rev: boolean) => {
    const xs = Array.from({ length: 19 }, (_, i) => 4 + i * 10.5);
    return (rev ? [...xs].reverse() : xs).map((x) => `L ${f(x)} ${f(y0 + (r() - 0.5) * 7)}`).join(' ');
  };
  return svg(200, 80, `<path d="M 4 10 ${edge(10, false)} L 196 10 L 196 70 ${edge(70, true)} L 4 70 Z" fill="surface" stroke="line" stroke-width="1.5" stroke-linejoin="round"/>`);
};

const labelSticker = (seed: number) => {
  const r = rng(seed);
  return svg(160, 70, `<rect x="12" y="14" width="140" height="46" rx="${f(8 + r() * 14)}" fill="line"/><rect x="6" y="8" width="140" height="46" rx="${f(8 + r() * 14)}" fill="accent" stroke="line" stroke-width="4"/>`);
};

const sphere = () => svg(100, 100, `<ellipse cx="52" cy="90" rx="32" ry="6" fill="text" fill-opacity="0.18"/><circle cx="50" cy="48" r="40" fill="accent-dark"/><circle cx="46" cy="44" r="36" fill="accent"/><ellipse cx="36" cy="30" rx="13" ry="8" fill="accent-light" fill-opacity="0.75" transform="rotate(-30 36 30)"/>`);

const cube = () => svg(100, 100, `<path d="M 50 8 L 90 28 L 50 48 L 10 28 Z" fill="accent-light"/><path d="M 10 28 L 50 48 L 50 92 L 10 72 Z" fill="accent"/><path d="M 90 28 L 50 48 L 50 92 L 90 72 Z" fill="accent-dark"/>`);

const coin = () => svg(100, 100, `<ellipse cx="50" cy="90" rx="34" ry="6" fill="text" fill-opacity="0.18"/><ellipse cx="50" cy="58" rx="38" ry="38" fill="accent-dark"/><ellipse cx="50" cy="50" rx="38" ry="38" fill="accent"/><ellipse cx="50" cy="50" rx="27" ry="27" fill="none" stroke="accent-light" stroke-width="5"/><path d="M 50 36 L 50 64 M 42 44 C 42 36 58 36 58 44 C 58 52 42 48 42 56 C 42 64 58 64 58 56" fill="none" stroke="accent-light" stroke-width="4" stroke-linecap="round"/>`);

const cardStack = () => svg(120, 100, `<rect x="22" y="20" width="76" height="56" rx="8" fill="surface" stroke="line" stroke-width="3" transform="rotate(-12 60 48)"/><rect x="22" y="20" width="76" height="56" rx="8" fill="marker" stroke="line" stroke-width="3" transform="rotate(-2 60 48)"/><rect x="22" y="20" width="76" height="56" rx="8" fill="accent" stroke="line" stroke-width="3" transform="rotate(9 60 48)"/><rect x="34" y="32" width="26" height="6" rx="3" fill="accent-light" transform="rotate(9 60 48)"/>`);

const phone = () => svg(80, 140, `<rect x="6" y="4" width="68" height="132" rx="12" fill="text"/><rect x="12" y="12" width="56" height="116" rx="7" fill="surface"/><rect x="34" y="14" width="12" height="4" rx="2" fill="text"/><rect x="18" y="30" width="30" height="6" rx="3" fill="muted"/><rect x="18" y="46" width="44" height="26" rx="5" fill="accent"/><rect x="18" y="82" width="44" height="6" rx="3" fill="muted"/><rect x="18" y="96" width="30" height="6" rx="3" fill="muted"/>`);

const pillButton = () => svg(160, 56, `<rect x="4" y="4" width="152" height="48" rx="24" fill="accent" stroke="line" stroke-width="3"/><path d="M 104 28 L 134 28 M 124 18 L 134 28 L 124 38" fill="none" stroke="text" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`);

const speechBubble = () => svg(120, 100, `<path d="M 14 10 L 106 10 Q 114 10 114 18 L 114 60 Q 114 68 106 68 L 52 68 L 28 90 L 32 68 L 14 68 Q 6 68 6 60 L 6 18 Q 6 10 14 10 Z" fill="accent" stroke="line" stroke-width="4" stroke-linejoin="round"/>`);

const plus = () => svg(100, 100, `<path d="M 50 8 L 50 92 M 8 50 L 92 50" fill="none" stroke="accent" stroke-width="14"/>`);

const asterisk = () => svg(100, 100, `<path d="M 50 6 L 50 94 M 12 28 L 88 72 M 12 72 L 88 28" fill="none" stroke="accent" stroke-width="14"/>`);

const zigzag = (seed: number) => {
  const r = rng(seed);
  const pts = Array.from({ length: 9 }, (_, i) => `${i === 0 ? 'M' : 'L'} ${f(6 + i * 23)} ${f(i % 2 ? 14 + r() * 4 : 38 - r() * 4)}`).join(' ');
  return svg(200, 52, `<path d="${pts}" fill="none" stroke="accent" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`);
};

export const CODE_ELEMENTS: CodeElementDef[] = [
  { name: 'blob', tags: ['blob', 'shape', 'organic'], seeds: 4, width: 100, height: 100, slots: ['accent'], make: blob },
  { name: 'squiggle', tags: ['squiggle', 'doodle', 'line'], seeds: 3, width: 200, height: 60, slots: ['accent'], make: squiggle },
  { name: 'loop-arrow', tags: ['arrow', 'doodle', 'loop', 'hand-drawn'], seeds: 3, width: 200, height: 140, slots: ['text'], make: loopArrow },
  { name: 'curve-arrow', tags: ['arrow', 'doodle', 'curve', 'hand-drawn'], seeds: 3, width: 200, height: 100, slots: ['text'], make: curveArrow },
  { name: 'underline', tags: ['underline', 'doodle', 'line', 'hand-drawn'], seeds: 3, width: 200, height: 30, slots: ['accent'], make: underline },
  { name: 'scribble-circle', tags: ['circle', 'doodle', 'hand-drawn'], seeds: 3, width: 200, height: 120, slots: ['text'], make: scribbleCircle },
  { name: 'starburst', tags: ['burst', 'star', 'sticker'], seeds: 3, width: 100, height: 100, slots: ['accent', 'line'], make: starburst },
  { name: 'sparkle', tags: ['sparkle', 'star'], seeds: 1, width: 100, height: 100, slots: ['marker'], make: sparkle },
  { name: 'halftone', tags: ['halftone', 'texture', 'dots'], seeds: 3, width: 200, height: 200, slots: ['accent'], texture: true, make: halftone },
  { name: 'grain', tags: ['grain', 'texture', 'noise'], seeds: 2, width: 200, height: 200, slots: ['text'], texture: true, make: grain },
  { name: 'brush', tags: ['brush', 'stroke', 'highlight'], seeds: 3, width: 200, height: 70, slots: ['marker'], make: brush },
  { name: 'tape', tags: ['tape', 'sticker', 'paper'], seeds: 3, width: 160, height: 60, slots: ['marker', 'line'], make: tape },
  { name: 'torn-paper', tags: ['torn-paper', 'paper', 'label'], seeds: 3, width: 200, height: 80, slots: ['surface', 'line'], make: tornPaper },
  { name: 'label-sticker', tags: ['label', 'sticker', 'tag'], seeds: 3, width: 160, height: 70, slots: ['accent', 'line'], make: labelSticker },
  { name: 'sphere', tags: ['sphere', 'ball', 'object', '3d'], seeds: 1, width: 100, height: 100, slots: ['accent', 'accent-dark', 'accent-light', 'text'], make: sphere },
  { name: 'cube', tags: ['cube', 'box', 'object', '3d'], seeds: 1, width: 100, height: 100, slots: ['accent', 'accent-dark', 'accent-light'], make: cube },
  { name: 'coin', tags: ['coin', 'money', 'object', '3d'], seeds: 1, width: 100, height: 100, slots: ['accent', 'accent-dark', 'accent-light', 'text'], make: coin },
  { name: 'card-stack', tags: ['cards', 'object'], seeds: 1, width: 120, height: 100, slots: ['accent', 'accent-light', 'marker', 'surface', 'line'], make: cardStack },
  { name: 'phone', tags: ['phone', 'ui', 'object'], seeds: 1, width: 80, height: 140, slots: ['text', 'surface', 'muted', 'accent'], make: phone },
  { name: 'pill-button', tags: ['button', 'ui', 'arrow'], seeds: 1, width: 160, height: 56, slots: ['accent', 'line', 'text'], make: pillButton },
  { name: 'speech-bubble', tags: ['speech-bubble', 'chat', 'ui'], seeds: 1, width: 120, height: 100, slots: ['accent', 'line'], make: speechBubble },
  { name: 'plus', tags: ['plus', 'mark'], seeds: 1, width: 100, height: 100, slots: ['accent'], make: plus },
  { name: 'asterisk', tags: ['asterisk', 'mark', 'star'], seeds: 1, width: 100, height: 100, slots: ['accent'], make: asterisk },
  { name: 'zigzag', tags: ['zigzag', 'doodle', 'line'], seeds: 3, width: 200, height: 52, slots: ['accent'], make: zigzag },
];

/** SVG text for "code:<name>:<seed>" (the seed part may be missing). Null if there is no such generator. */
export function codeElementSvg(id: string): string | null {
  const [, name, seed] = id.split(':');
  const def = CODE_ELEMENTS.find((d) => d.name === name);
  return def ? def.make(Number(seed ?? 1) || 1) : null;
}
