// Round 15 C: replay REAL reports. For each report*.json in out/reports/, the saved plan (designed.library.plan.specs), the style and the picture sizes (from the "#w=..&h=.." of the image ids) are
// run through the whole library pipeline with a fake writer that returns that plan (ZERO model calls) and synthetic SCREENSHOT-like pictures of the same sizes. Every slide must pass every slide
// check the app shows the person (size, edges, words, overlap, contrast) and the text-fits rule; a slide the drawing could not make pass is repaired by the code (and logged), never shown failing.
// Output: out/round-15/replay-<report>.png (the slides), out/round-15/replay-<report>.json (checks, before and after), out/round-15/replay-summary.md
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { REPLAY } from './replay-helper';

test.setTimeout(10 * 60_000);
const DIR = 'out/reports';
const OUT = 'out/round-15';
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^report.*\.json$/i.test(f)) : [];

test.skip(!files.length, 'no report*.json in out/reports/ (put real reports there to replay them)');

const summary: string[] = [];
for (const f of files) {
  test(`replay ${f}: every slide passes every check and the text-fits rule; the deck costs 1 fake writer call`, async ({ page }) => {
    const rep = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    test.skip(!rep.designed?.library?.plan?.specs, `${f} has no designed.library.plan.specs`);
    await page.goto('/images/carousel');
    await page.evaluate(REPLAY);
    const r: any = await page.evaluate(async (rep) => (window as any).__REPLAY(rep, {}), rep);
    fs.mkdirSync(OUT, { recursive: true });
    const base = f.replace(/\.json$/i, '');
    fs.writeFileSync(`${OUT}/replay-${base}.png`, Buffer.from(r.sheet, 'base64'));
    const before = (rep.slides ?? []).filter((s: any) => (s.checks ?? []).some((c: any) => !c.pass)).map((s: any) => s.number);
    const after = r.slides.filter((s: any) => s.failed.length || s.fit.length).map((s: any) => s.slide);
    fs.writeFileSync(`${OUT}/replay-${base}.json`, JSON.stringify({ report: f, style: rep.style, calls: r.calls, swaps: r.swaps, fallbacks: r.fallbacks, retries: r.retries, notes: r.notes, layouts: r.layouts, repairs: r.repairs, codeAdjustments: r.codeAdjustments, pictureUse: r.pictureUse, slides: r.slides, failingBefore: before, failingAfter: after }, null, 1));
    summary.push(`| ${f} | ${rep.slides?.length ?? r.slides.length} | ${before.length ? before.join(', ') : 'none'} (${before.length}) | ${after.length ? after.join(', ') : 'none'} (${after.length}) | ${r.repairs.length} |`);
    fs.writeFileSync(`${OUT}/replay-summary.md`, ['# Report replay: slides failing a check, before (the saved report) and after (this code)', '', '| report | slides | failing before | failing after | repairs logged |', '|---|---|---|---|---|', ...summary, ''].join('\n'));
    expect(r.calls, 'the fake writer is asked once').toBe(1);
    for (const s of r.slides) expect([...s.failed, ...s.fit], `${f} slide ${s.slide} (${s.layout}) fails`).toEqual([]);
  });
}

// The two real failures of the editorial-collage deck, reproduced as the PHOTO case (the pictures treated as photos, which is what the app did when a picture had no screenshot/photo label yet).
for (const f of files.filter((x) => /editorial/i.test(x))) {
  test(`replay ${f} with the pictures as PHOTOS: slide 1 (title-over-photo, 609x757) and slide 3 (photo-full-caption, 2400x1230) pass every check`, async ({ page }) => {
    const rep = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    await page.goto('/images/carousel');
    await page.evaluate(REPLAY);
    const r: any = await page.evaluate(async (rep) => (window as any).__REPLAY(rep, { content: 'photo' }), rep);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/replay-photos-${f.replace(/\.json$/i, '')}.png`, Buffer.from(r.sheet, 'base64'));
    fs.writeFileSync(`${OUT}/replay-photos-${f.replace(/\.json$/i, '')}.json`, JSON.stringify({ layouts: r.layouts, repairs: r.repairs, slides: r.slides }, null, 1));
    for (const s of r.slides) expect([...s.failed, ...s.fit], `${f} (photos) slide ${s.slide} (${s.layout}) fails`).toEqual([]);
  });
}
