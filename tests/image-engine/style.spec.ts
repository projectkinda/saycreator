// Step 5, Phase 1: the style reading. Checks that the cut, the measurements and clusters.json are sound, that the
// measurements are repeatable, and that nothing from the reference pictures' text or brands was copied into our notes.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REFS = path.join(ROOT, 'Reference carousels likes');
const MEAS = path.join(ROOT, 'out/image-engine/style/measurements.json');
const clusters = () => JSON.parse(fs.readFileSync(path.join(REFS, 'clusters.json'), 'utf8'));
const files = fs.readdirSync(REFS).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();

test('every reference picture is placed exactly once, in at most 5 clusters, and each cluster is fully written up', () => {
  const c = clusters();
  expect(c.clusters.length).toBeLessThanOrEqual(5);
  expect(c.clusters.length).toBeGreaterThanOrEqual(1);
  const placed = [...c.clusters.flatMap((x: { images: string[] }) => x.images), ...c.unplaced.map((u: { file: string }) => u.file)].sort();
  expect(placed).toEqual(files);
  expect(Object.keys(c.images).sort()).toEqual(files);
  for (const f of files) {
    expect(c.images[f].format.length).toBeGreaterThan(5);
    expect(c.images[f].description.length).toBeGreaterThan(20);
  }
  for (const cl of c.clusters) {
    expect(cl.why, `${cl.id} why`).toHaveLength(2);
    expect(cl.summary.length).toBeGreaterThan(80);
    expect(cl.confidence.length).toBeGreaterThan(10);
    expect(cl.spec.missingTools.length).toBeGreaterThan(0);
    const tagged = [...cl.spec.palette, ...cl.spec.type, ...cl.spec.graphics, ...cl.spec.rhythm, ...Object.values(cl.spec.layouts as Record<string, unknown[]>).flat()] as { t: string; text: string }[];
    expect(tagged.length).toBeGreaterThan(8);
    for (const x of tagged) expect(['MEASURED', 'GUESS'], `${cl.id}: "${x.text.slice(0, 40)}"`).toContain(x.t);
    // every cluster says which palette numbers are measured
    expect(cl.spec.palette.some((x: { t: string }) => x.t === 'MEASURED')).toBe(true);
  }
  for (const u of c.unplaced) expect(u.reason.length).toBeGreaterThan(30);
});

test('nothing from the reference pictures (brand names, handles, their wording) is copied into our notes', () => {
  const text = fs.readFileSync(path.join(REFS, 'clusters.json'), 'utf8').toLowerCase();
  const seen = ['axorweb', 'nexora', 'aviara', 'mritech', 'herground', 'nova studio', 'astra studio', 'estudiomona', 'estudio mona', 'brandhouse', 'the startup', 'wild studio', 'x designs', 'kunsllu', 'afzal', 'hollywood', 'los angeles', 'sarah lee', 'lara d', 'black friday', 'cyber monday', 'rolaram', 'multidão'];
  for (const w of seen) expect(text.includes(w), `"${w}" must not appear in clusters.json`).toBe(false);
});

test('every mosaic was cut into slides that sit inside the picture, with sane measurements', () => {
  const m = JSON.parse(fs.readFileSync(MEAS, 'utf8'));
  expect(Object.keys(m.files).sort()).toEqual(files);
  let total = 0;
  for (const f of files) {
    const e = m.files[f];
    expect(e.slides.length, `${f} slides`).toBeGreaterThanOrEqual(6);
    total += e.slides.length;
    for (const s of e.slides) {
      expect(s.rect.x).toBeGreaterThanOrEqual(0);
      expect(s.rect.y).toBeGreaterThanOrEqual(0);
      expect(s.rect.x + s.rect.w).toBeLessThanOrEqual(e.width);
      expect(s.rect.y + s.rect.h).toBeLessThanOrEqual(e.height);
      expect(s.aspect, `${f} slide ${s.index} shape`).toBeGreaterThan(0.45);
      expect(s.aspect).toBeLessThan(1.3);
      expect(s.background).toMatch(/^#[0-9A-F]{6}$/);
      expect(s.palette.length).toBeGreaterThan(0);
      const sum = s.palette.reduce((a: number, p: { share: number }) => a + p.share, 0);
      expect(sum).toBeGreaterThan(0.5);
      expect(sum).toBeLessThanOrEqual(1.01);
      if (s.textContrast !== null) expect(s.textContrast).toBeGreaterThanOrEqual(1);
      if (s.inkBox) for (const v of Object.values(s.inkBox) as number[]) expect(v).toBeGreaterThanOrEqual(0);
    }
  }
  expect(total).toBeGreaterThanOrEqual(120);
});

test('the reading is repeatable: running the measurement again gives identical numbers', () => {
  test.setTimeout(240_000);
  const strip = (s: string) => JSON.stringify(JSON.parse(s), (k, v) => (k === 'generatedAt' ? undefined : v));
  const before = strip(fs.readFileSync(MEAS, 'utf8'));
  execFileSync('node', ['scripts/style-read.mjs'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('node', ['scripts/style-aggregate.mjs'], { cwd: ROOT, stdio: 'pipe' });
  expect(strip(fs.readFileSync(MEAS, 'utf8'))).toBe(before);
});

test('cluster numbers quoted in the notes agree with the measurements', () => {
  const agg = JSON.parse(fs.readFileSync(path.join(ROOT, 'out/image-engine/style/cluster-measurements.json'), 'utf8')).clusters;
  const c = clusters();
  const med = (id: string) => agg[id].contrast.textVsOwnBackgroundMedian;
  const note = (id: string) => c.clusters.find((x: { id: string }) => x.id === id).spec.palette.map((x: { text: string }) => x.text).join(' ');
  for (const id of Object.keys(agg)) expect(note(id), `${id} quotes its median text contrast`).toContain(`${Math.round(med(id) * 10) / 10}:1`);
  for (const id of Object.keys(agg)) expect(agg[id].slides).toBeGreaterThan(10);
});
