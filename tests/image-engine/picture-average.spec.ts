// Round 8a, experiment: with 3 pictures and 7 slides, how many picture slides does the code give a writer plan that has NO picture layout (the worst case), and are all 3 pictures used?
// The plans: the two stored real writer answers (out/designed-library-real) and four typical decks. Writes out/picture-layouts/average-<TAG>.json. ZERO model calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(10 * 60_000);
const TAG = process.env.PIC_TAG ?? 'after';
const src = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = src.slice(src.indexOf('const HELP = `') + 14, src.indexOf('`;\n\nasync function setup'));
const stored = ['harsh-light', 'quickflip-dark'].map((n) => JSON.parse(fs.readFileSync(`out/designed-library-real/${n}/report.json`, 'utf8')).library.plan.specs);
const TYPICAL = [
  ['statement', 'split-text', 'checklist', 'step-numeral', 'quote', 'big-stat', 'cta-button'],
  ['statement', 'prose', 'split-text', 'comparison', 'quote', 'checklist', 'cta-button'],
  ['statement', 'big-stat', 'stat-bar', 'stepper', 'split-text', 'checklist', 'cta-button'],
  ['statement', 'split-text', 'split-text', 'quote', 'comparison', 'bullet-list', 'cta-button'],
];

test(`3 pictures, 7 slides: picture slides and pictures used (${TAG})`, async ({ page }) => {
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  const r = await page.evaluate(async ({ stored, TYPICAL }) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const plans = [...stored.map((s: any) => s.map((x: any) => ({ layout: x.layout, fields: x.fields, accents: [] }))), ...TYPICAL.map((ids: string[]) => ids.map((id) => ({ layout: id, fields: { ...L.layoutDef(id).samples.normal }, accents: [] })))];
    const rows: any[] = [];
    for (const style of ['editorial-collage', 'style-4', 'dark-quiet']) {
      for (let p = 0; p < plans.length; p++) {
        const d = await H.deck({ style, slides: plans[p], pictures: ['landscape', 'portrait', 'square'] });
        const ids = new Set<string>();
        let pictureSlides = 0;
        d.specs.forEach((s: any) => { const k = Object.values(s.fields).filter((v: any) => typeof v === 'string' && v.startsWith('picture:')).map((v: any) => v.slice(8).split('#')[0]); if (k.length) pictureSlides++; k.forEach((x: string) => ids.add(x)); });
        rows.push({ style, plan: p, pictureSlides, used: ids.size, layouts: d.specs.map((s: any) => s.layout) });
      }
    }
    return rows;
  }, { stored, TYPICAL });
  const avg = r.reduce((a: number, x: any) => a + x.pictureSlides, 0) / r.length;
  const allUsed = r.filter((x: any) => x.used === 3).length;
  fs.mkdirSync('out/picture-layouts', { recursive: true });
  fs.writeFileSync(`out/picture-layouts/average-${TAG}.json`, JSON.stringify({ runs: r.length, averagePictureSlides: Math.round(avg * 100) / 100, allThreeUsed: `${allUsed} of ${r.length}`, rows: r }, null, 1));
  if (TAG === 'after') {
    // the code alone, for a writer plan with no picture layout and only the same-words upgrades: more picture slides than before (1.33), no run uses fewer pictures than before (8 of 18 used all three)
    expect(avg).toBeGreaterThan(1.5);
    expect(allUsed).toBeGreaterThanOrEqual(10);
  }
});
