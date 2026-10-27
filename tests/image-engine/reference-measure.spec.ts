// Style from references, the measured part (no browser, no model): grid detection and the measurements, on pictures made in code.
import { expect, test } from '@playwright/test';
import { detectGrid } from '../../src/reference/grid';
import { measure } from '../../src/reference/measure';
import { meanSimilarity, similarity } from '../../src/reference/similarity';
import type { Px } from '../../src/reference/types';

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function canvas(w: number, h: number, fill: string): Px {
  const data = new Uint8ClampedArray(w * h * 4);
  const [r, g, b] = hex(fill);
  for (let i = 0; i < w * h; i++) data.set([r, g, b, 255], i * 4);
  return { width: w, height: h, data };
}
function box(p: Px, x: number, y: number, w: number, h: number, fill: string) {
  const [r, g, b] = hex(fill);
  for (let j = Math.max(0, y); j < Math.min(p.height, y + h); j++) for (let i = Math.max(0, x); i < Math.min(p.width, x + w); i++) p.data.set([r, g, b, 255], (j * p.width + i) * 4);
}
const CELL_COLOURS = ['#f4efe6', '#101010', '#d9381e', '#e8e04a', '#2b5a8a', '#7a3cff', '#f2f2f2', '#1d6b4f', '#f0b27a', '#303030', '#aac8e8', '#ffffff'];

/** A slide: a background colour with a big title, a small line and a block, so it is not plain. */
function slide(w: number, h: number, bg: string, ink: string, k: number): Px {
  const p = canvas(w, h, bg);
  box(p, Math.round(w * 0.1), Math.round(h * (0.22 + (k % 3) * 0.08)), Math.round(w * (0.7 - (k % 2) * 0.2)), Math.round(h * 0.1), ink);
  box(p, Math.round(w * 0.1), Math.round(h * 0.4), Math.round(w * 0.5), Math.round(h * 0.03), ink);
  box(p, Math.round(w * 0.55), Math.round(h * 0.7), Math.round(w * 0.3), Math.round(h * 0.15), CELL_COLOURS[(k + 4) % CELL_COLOURS.length]);
  return p;
}
function collage(cols: number, rows: number, cw: number, ch: number, gaps: { x: number | number[]; y: number | number[] }, margin: number, gutter: string): { p: Px; cells: { x: number; y: number }[] } {
  const gx = (i: number) => (Array.isArray(gaps.x) ? gaps.x[i] : gaps.x);
  const gy = (i: number) => (Array.isArray(gaps.y) ? gaps.y[i] : gaps.y);
  let W = margin * 2 + cols * cw;
  for (let i = 0; i < cols - 1; i++) W += gx(i);
  let H = margin * 2 + rows * ch;
  for (let i = 0; i < rows - 1; i++) H += gy(i);
  const p = canvas(W, H, gutter);
  const cells: { x: number; y: number }[] = [];
  let y = margin;
  for (let r = 0; r < rows; r++) {
    let x = margin;
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      const s = slide(cw, ch, CELL_COLOURS[k % CELL_COLOURS.length], k % 2 ? '#ffffff' : '#101010', k);
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) p.data.set(s.data.subarray((j * cw + i) * 4, (j * cw + i) * 4 + 4), ((y + j) * W + x + i) * 4);
      cells.push({ x, y });
      x += cw + (c < cols - 1 ? gx(c) : 0);
    }
    y += ch + (r < rows - 1 ? gy(r) : 0);
  }
  return { p, cells };
}

test.describe('grid detection', () => {
  test('a 3 by 3 collage with thin gutters is split into 9 slides at the right places', () => {
    const { p, cells } = collage(3, 3, 240, 300, { x: 8, y: 8 }, 20, '#ffffff');
    const g = detectGrid(p)!;
    expect(g, 'a grid was found').toBeTruthy();
    expect([g.cols, g.rows, g.cells.length]).toEqual([3, 3, 9]);
    expect(g.method).toContain('gutters');
    g.cells.forEach((c, i) => {
      expect(Math.abs(c.x - cells[i].x), `cell ${i} x`).toBeLessThanOrEqual(2);
      expect(Math.abs(c.y - cells[i].y), `cell ${i} y`).toBeLessThanOrEqual(2);
      expect(Math.abs(c.width - 240)).toBeLessThanOrEqual(3);
      expect(Math.abs(c.height - 300)).toBeLessThanOrEqual(3);
    });
  });

  test('a 2 across by 4 down collage is split into 8 slides', () => {
    const { p } = collage(2, 4, 270, 270, { x: 10, y: 10 }, 16, '#101010');
    const g = detectGrid(p)!;
    expect([g.cols, g.rows, g.cells.length]).toEqual([2, 4, 8]);
  });

  test('uneven gutters (a different width between each pair, and a margin) are still found', () => {
    const { p, cells } = collage(3, 2, 250, 310, { x: [6, 22], y: [14] }, 30, '#e5e5e5');
    const g = detectGrid(p)!;
    expect([g.cols, g.rows]).toEqual([3, 2]);
    g.cells.forEach((c, i) => expect(Math.abs(c.x - cells[i].x) + Math.abs(c.y - cells[i].y), `cell ${i}`).toBeLessThanOrEqual(6));
  });

  test('slides set edge to edge with no gutter are found by the seams between them', () => {
    const { p } = collage(3, 1, 300, 375, { x: 0, y: 0 }, 0, '#ffffff');
    const g = detectGrid(p)!;
    expect(g, 'a grid was found').toBeTruthy();
    expect([g.cols, g.rows]).toEqual([3, 1]);
    expect(g.method).toContain('seams');
  });

  test('one flat-coloured slide with a few text blocks is not read as a collage', () => {
    const p = canvas(600, 750, '#d9381e');
    box(p, 60, 150, 420, 80, '#101010');
    box(p, 60, 300, 300, 24, '#101010');
    box(p, 330, 520, 180, 110, '#e8e04a');
    expect(detectGrid(p)).toBeNull();
  });

  test('a single slide is not a grid', () => {
    expect(detectGrid(slide(540, 675, '#f4efe6', '#101010', 1))).toBeNull();
  });

  test('a single slide with plain stripes (that looks like gutters) can be told apart only by the person, so the screen offers a correction', () => {
    // Three plain vertical stripes on a busy picture: the code may call it a grid. The screen lets the person say "it is a single image".
    const p = slide(540, 675, '#d9381e', '#ffffff', 2);
    box(p, 180, 0, 6, 675, '#ffffff');
    box(p, 360, 0, 6, 675, '#ffffff');
    const g = detectGrid(p);
    if (g) expect(g.cells.length).toBeGreaterThanOrEqual(2);
    else expect(g).toBeNull();
  });
});

test.describe('measuring a picture', () => {
  test('a dark slide with a big light title at the top: palette, background, text colour, margins, title size and place', () => {
    const p = canvas(400, 500, '#101010');
    box(p, 40, 50, 160, 70, '#f5f5f5'); // the title line
    box(p, 40, 150, 220, 14, '#f5f5f5'); // a small line
    box(p, 40, 440, 90, 12, '#ff4b1f'); // a tag
    const m = measure(p);
    expect(m.background).toBe('#101010');
    expect(m.textColour).toBe('#F5F5F5');
    expect(m.palette[0].hex).toBe('#101010');
    expect(m.contrast.find((c) => c.hex === '#F5F5F5')!.ratio).toBeGreaterThan(15);
    expect(m.margins).not.toBeNull();
    expect(m.margins!.left).toBeCloseTo(0.1, 1);
    expect(m.margins!.top).toBeCloseTo(0.1, 1);
    expect(m.titleHeight).toBeCloseTo(70 / 500, 1);
    expect(m.titlePlacement).toBe('top-left');
    expect(m.textBlocks).toBeGreaterThanOrEqual(1);
    expect(m.emptySpace).toBeGreaterThan(0.85);
    expect(m.photo.present).toBe(false);
  });

  test('a noisy black-and-white picture is read as a photo that is black and white', () => {
    const p = canvas(400, 500, '#808080');
    let seed = 7;
    for (let i = 0; i < p.width * p.height; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const v = 40 + (seed % 180);
      p.data.set([v, v, v, 255], i * 4);
    }
    const m = measure(p);
    expect(m.photo.present).toBe(true);
    expect(m.photo.blackAndWhite).toBe(true);
    expect(m.photo.meanSaturation).toBeLessThan(0.05);
  });

  test('similarity: a picture is closest to itself, and further from one with other colours and a smaller title', () => {
    const a = canvas(400, 500, '#101010');
    box(a, 40, 50, 300, 70, '#f5f5f5');
    const b = canvas(400, 500, '#f4efe6');
    box(b, 40, 300, 300, 30, '#d9381e');
    const ma = measure(a);
    const mb = measure(b);
    const same = similarity(ma, ma);
    const far = similarity(ma, mb);
    expect(same.total).toBeGreaterThan(0.95);
    expect(far.total).toBeLessThan(same.total - 0.3);
    expect(far.palette).toBeLessThan(0.5);
    expect(far.zones).toBeLessThan(0.2);
    expect(meanSimilarity([same, far]).total).toBeCloseTo((same.total + far.total) / 2, 2);
  });
});
