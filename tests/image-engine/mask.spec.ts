// Mask clean-ups and subject measurements: pure logic, run in Node on small synthetic masks.
import { expect, test } from '@playwright/test';
import { applyMaskOptions, decontaminateEdges, featherAlpha, fillSmallHoles, subjectStats } from '../../src/image-engine/cutout/mask';
import type { Alpha } from '../../src/image-engine/cutout/types';

const make = (w: number, h: number, f: (x: number, y: number) => number): Alpha => {
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y);
  return { data, width: w, height: h };
};
const at = (a: Alpha, x: number, y: number) => a.data[y * a.width + x];

test.describe('subject helpers', () => {
  const square = make(100, 80, (x, y) => (x >= 20 && x < 60 && y >= 10 && y < 50 ? 255 : 0));

  test('bounding box, centre of mass and area share of a square', () => {
    const s = subjectStats(square);
    expect(s.bbox).toEqual({ x: 20, y: 10, width: 40, height: 40 });
    expect(s.areaFraction).toBeCloseTo(1600 / 8000, 6);
    expect(s.centroid!.x).toBeCloseTo(39.5, 1);
    expect(s.centroid!.y).toBeCloseTo(29.5, 1);
    expect(s.bboxNorm).toEqual({ x: 0.2, y: 0.125, width: 0.4, height: 0.5 });
  });

  test('no subject gives nulls, not a crash', () => {
    const s = subjectStats(make(10, 10, () => 0));
    expect(s).toMatchObject({ areaFraction: 0, bbox: null, centroid: null });
  });

  test('the robust box ignores a distant speck, the plain box does not', () => {
    const withSpeck = make(200, 100, (x, y) => ((x >= 40 && x < 100 && y >= 20 && y < 80) || (x === 190 && y === 5) ? 255 : 0));
    const s = subjectStats(withSpeck);
    expect(s.bbox!.x + s.bbox!.width).toBe(191); // stretched to the speck
    expect(s.bboxRobust!.x + s.bboxRobust!.width).toBeLessThanOrEqual(100);
  });

  test('the centre of mass follows how solid pixels are', () => {
    const soft = make(100, 10, (x) => (x < 50 ? 255 : 130));
    expect(subjectStats(soft).centroid!.x).toBeLessThan(49.5);
  });
});

test.describe('mask clean-ups', () => {
  test('feathering softens the edge, keeps the inside solid and the far outside empty', () => {
    const hard = make(60, 60, (x, y) => (x >= 20 && x < 40 && y >= 20 && y < 40 ? 255 : 0));
    const soft = featherAlpha(hard, 6);
    expect(at(soft, 30, 30)).toBe(255);
    expect(at(soft, 2, 2)).toBe(0);
    const edge = at(soft, 20, 30);
    expect(edge).toBeGreaterThan(40);
    expect(edge).toBeLessThan(215);
    expect(at(soft, 17, 30)).toBeGreaterThan(0); // the ramp leaks outwards a little
  });

  test('feathering by 0 changes nothing', () => {
    const a = make(10, 10, (x) => (x < 5 ? 255 : 0));
    expect(featherAlpha(a, 0)).toBe(a);
  });

  test('a solid subject touching the picture border stays solid at the border', () => {
    const a = make(40, 40, () => 255);
    expect(at(featherAlpha(a, 8), 0, 0)).toBe(255);
  });

  test('small holes are filled, big ones and open gaps are not', () => {
    const ring = make(100, 100, (x, y) => {
      const inBlock = x >= 10 && x < 90 && y >= 10 && y < 90;
      const tinyHole = x >= 30 && x < 33 && y >= 30 && y < 33; // 9 px, enclosed
      const bigHole = x >= 50 && x < 80 && y >= 50 && y < 80; // 900 px, enclosed
      return inBlock && !tinyHole && !bigHole ? 255 : 0;
    });
    const out = fillSmallHoles(ring, 0.005); // up to 50 px
    expect(at(out, 31, 31)).toBe(255); // tiny hole filled
    expect(at(out, 60, 60)).toBe(0); // big hole kept
    expect(at(out, 2, 2)).toBe(0); // outside is not a hole
  });

  test('a gap open to the outside is background, not a hole', () => {
    const c = make(60, 60, (x, y) => (x >= 10 && x < 50 && y >= 10 && y < 50 && !(x >= 25 && x < 28 && y >= 10 && y < 30) ? 255 : 0));
    expect(at(fillSmallHoles(c, 0.5), 26, 15)).toBe(0);
  });

  test('decontamination replaces a white fringe on semi-transparent edge pixels with the subject colour', () => {
    const w = 40, h = 10;
    const rgba = new Uint8ClampedArray(w * h * 4);
    const alpha = make(w, h, (x) => (x < 20 ? 255 : x < 24 ? 120 : 0));
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const solid = x < 20;
      rgba.set(solid ? [200, 30, 30, 255] : [250, 250, 250, 255], i * 4); // red subject, white old background
    }
    const out = decontaminateEdges({ data: rgba, width: w, height: h }, alpha, 6);
    const p = (x: number) => Array.from(out.data.slice((5 * w + x) * 4, (5 * w + x) * 4 + 3));
    expect(p(21)).toEqual([200, 30, 30]); // fringe now red
    expect(p(5)).toEqual([200, 30, 30]); // solid pixels untouched
    expect(p(30)).toEqual([250, 250, 250]); // fully transparent pixels are left alone
  });

  test('applyMaskOptions with nothing turned on returns the inputs', () => {
    const a = make(8, 8, () => 255);
    const img = { data: new Uint8ClampedArray(8 * 8 * 4), width: 8, height: 8 };
    const r = applyMaskOptions(img, a, {});
    expect(r.alpha).toBe(a);
    expect(r.image).toBe(img);
  });
});
