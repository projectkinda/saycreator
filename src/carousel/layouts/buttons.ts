// Button labels and arrows, set by the glyphs and not by the text box: for every pill button (cta-button, cta-pair, contact-closing, and any pill that carries an arrow)
//   - the label's cap-height centre sits on the button's vertical centre, whatever the font (the text box is centred on its line box, which sits a font-dependent few px off the capitals)
//   - the arrow's vertical centre sits on it too
//   - the first letter's drawn left edge and the arrow's drawn right edge are the SAME distance from the button's ends (a third of its height), the font's own side bearing taken out
// It works on the finished SVG, so every layout and every font gets it right; the metrics come from the loaded font (canvas measureText).

const NS = 'http://www.w3.org/2000/svg';
let g2d: CanvasRenderingContext2D | null = null;
const ctx = () => (g2d ??= document.createElement('canvas').getContext('2d')!);
const metrics = (family: string, weight: string, size: number, ch: string) => {
  const g = ctx();
  g.font = `${weight} ${size}px "${family}"`;
  const m = g.measureText(ch);
  return { asc: m.actualBoundingBoxAscent, left: m.actualBoundingBoxLeft };
};
const num = (e: Element, a: string) => Number(e.getAttribute(a) ?? 0);
/** The translate(x y) offsets of an element and its ancestors (the engine shifts shapes with a transform). */
const shift = (e: Element | null): { x: number; y: number } => {
  if (!e || e.nodeType !== 1) return { x: 0, y: 0 };
  const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(e.getAttribute('transform') ?? '');
  const up = shift(e.parentElement);
  return { x: up.x + (m ? Number(m[1]) : 0), y: up.y + (m ? Number(m[2]) : 0) };
};
const BUTTON_LAYOUTS = new Set(['cta-button', 'cta-pair', 'contact-closing']);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The finished slide SVG with its pill buttons' labels and arrows centred and padded evenly. The SVG is returned untouched when it has no such pill. */
export function centreButtons(svg: string, layoutId: string): string {
  if (!/<rect [^>]*rx="/.test(svg) || !/<text/.test(svg)) return svg;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const all = [...doc.querySelectorAll('rect')].filter((e) => { const h = num(e, 'height'), w = num(e, 'width'), rx = num(e, 'rx'); return h >= 100 && h <= 240 && w >= 300 && Math.abs(rx - h / 2) <= 2; });
  // a hard shadow is a copy of the pill drawn just before it: the pill is the one drawn last
  const pills = all.filter((e, i) => !all.some((o, j) => j > i && Math.abs(num(o, 'x') - num(e, 'x')) < 16 && Math.abs(num(o, 'y') - num(e, 'y')) < 16 && Math.abs(num(o, 'width') - num(e, 'width')) < 4));
  const paths = [...doc.querySelectorAll('path')].filter((p) => /stroke-linecap="round"/.test(p.outerHTML) && /^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+ M/.test(p.getAttribute('d') ?? ''));
  const texts = [...doc.querySelectorAll('text')].filter((t) => t.getAttribute('data-role') !== 'recurring' && t.querySelector('tspan'));
  let changed = false;
  for (const pill of pills) {
    const sh = shift(pill);
    const bx = num(pill, 'x') + sh.x, by = num(pill, 'y') + sh.y, bw = num(pill, 'width'), bh = num(pill, 'height');
    const cy = by + bh / 2;
    const arrows = paths.filter((p) => {
      const nums = (p.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const ps = shift(p);
      const xs = nums.filter((_, i) => i % 2 === 0).map((v) => v + ps.x), ys = nums.filter((_, i) => i % 2 === 1).map((v) => v + ps.y);
      return Math.min(...xs) >= bx && Math.max(...xs) <= bx + bw && Math.min(...ys) >= by && Math.max(...ys) <= by + bh;
    });
    if (!arrows.length && !BUTTON_LAYOUTS.has(layoutId)) continue;
    const P = Math.round(bh / 3);
    // the label(s) of this pill: text whose first line starts inside it
    const inside = texts.filter((t) => {
      const ts = t.querySelector('tspan')!;
      const ts0 = shift(t);
      const x = num(ts, 'x') + ts0.x, y = num(ts, 'y') + ts0.y;
      return x >= bx && x <= bx + bw && y >= by && y <= by + bh + 10 && num(t, 'font-size') <= 64;
    });
    const arrow = arrows[0];
    for (const t of inside) {
      const family = t.getAttribute('font-family') ?? 'sans-serif', weight = t.getAttribute('font-weight') ?? '400', size = num(t, 'font-size');
      const lines = [...t.querySelectorAll('tspan')];
      const ts0 = shift(t);
      const cap = metrics(family, weight, size, 'H').asc;
      const y1 = num(lines[0], 'y') + ts0.y, yn = num(lines[lines.length - 1], 'y') + ts0.y;
      const centre = (y1 - cap + yn) / 2;
      const dy = cy - centre;
      lines.forEach((l) => l.setAttribute('y', String(r1(num(l, 'y') + dy))));
      const anchor = t.getAttribute('text-anchor') ?? lines[0].getAttribute('text-anchor') ?? 'start';
      if (arrow && anchor === 'start') {
        const first = (lines[0].textContent ?? '').trim()[0] ?? 'H';
        const bearing = -metrics(family, weight, size, first).left; // from the text origin to the first letter's drawn left edge
        lines.forEach((l) => l.setAttribute('x', String(r1(bx + P - bearing - ts0.x))));
      }
      changed = true;
    }
    if (arrow) {
      const nums = (arrow.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const sw = num(arrow, 'stroke-width') || 8;
      const ps = shift(arrow);
      const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
      const inkRight = Math.max(...xs) + ps.x + sw / 2;
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2 + ps.y;
      const dx = bx + bw - P - inkRight, dyA = cy - midY;
      // the arrow's own translate (if any) is kept and moved; the ancestors' shift stays theirs
      const own = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(arrow.getAttribute('transform') ?? '');
      arrow.setAttribute('transform', `translate(${r1((own ? Number(own[1]) : 0) + dx)} ${r1((own ? Number(own[2]) : 0) + dyA)})`);
      changed = true;
    }
  }
  if (!changed) return svg;
  void NS;
  return new XMLSerializer().serializeToString(doc.documentElement);
}
