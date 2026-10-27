// Puts "Thumbnails (v2)" on the Results screen: for each style, every option for four test photos as its own card with the checker's result
// (the verdict boxes are the person's), then the new checks shown failing on purpose, the timings, and what is weak or not tested.
// Reads what thumbnails-v2.spec.ts, thumbnails-v2-checks.spec.ts and thumbnail-app.spec.ts saved. They sort before this file.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { outUrl, writeStepResults, type ResultsItem } from './results';
import { OUT, ROOT, STYLES, slug } from './thumbnails-v2-helpers';

interface Row {
  style: string;
  image: string;
  title: string;
  aspect: string;
  layout: string;
  rel: string;
  composeMs: number;
  checkMs: number;
  subject: { x: number; y: number; guessed?: boolean };
  lint: Record<string, boolean>;
  reasons: Record<string, string>;
  notes: string[];
  elementsUsed: string[];
}

const STYLE_TITLE: Record<string, string> = { 'hot-flat': 'Hot flat colour, heavy type', 'mono-poster': 'Mono photo poster', 'object-neon': 'Tech polish with a neon accent', 'glass-gradient': 'Soft gradient and glass', 'film-paper': 'Film photo and paper', 'editorial-collage': 'Warm editorial collage' };
const LAYOUT_TITLE: Record<string, string> = { 'face-left-title-right': 'Subject on one side, title on the other', 'title-over-photo': 'Big title over the photo', 'split-colour': 'Photo and colour block', 'object-title': 'Object and title', 'number-badge': 'Number badge', 'before-after': 'Before and after' };
/** Four cases keep the screen ratable: two photos wide, one tall, one anime still. */
const SHOWN = (r: Row) => (r.image === 'GCKR3575.JPG' && r.aspect === '16:9') || (r.image.startsWith('wp13065863') && r.aspect !== '') || r.image.startsWith('filters_quality(95)format(webp) (1)');
const WORDS = ['matches', 'close', 'off', 'wrong'];
const TAG = 'TEST IMAGE (your own test photo, not shippable; a still, not a video frame)';

test('Thumbnails (v2): Results items', async () => {
  const summaryFile = path.join(OUT, 'summary.json');
  test.skip(!fs.existsSync(summaryFile), 'Run thumbnails-v2.spec.ts first.');
  const rows = (JSON.parse(fs.readFileSync(summaryFile, 'utf8')) as Row[]).filter(SHOWN);
  const failedOf = (r: Row) => Object.keys(r.reasons).map((k) => r.reasons[k]);

  const groups = STYLES.map((style) => ({
    title: `Style: ${STYLE_TITLE[style]}`,
    note: 'Every option the app makes in this style, full size. The checker’s result is in plain words under each. Your verdict: does a creator post this (matches), nearly (close), not really (off) or is it wrong?',
    items: rows
      .filter((r) => r.style === style)
      .map<ResultsItem>((r) => ({
        id: `${slug(r.image)}-${r.aspect.replace(':', 'x')}-${r.layout}`,
        title: `“${r.title}” · ${r.aspect} · ${LAYOUT_TITLE[r.layout]}`,
        tag: TAG,
        images: [{ url: outUrl(path.join(OUT, `${r.rel}.png`)), label: LAYOUT_TITLE[r.layout] }],
        checker: { pass: failedOf(r).length === 0, reasons: failedOf(r) },
        facts: [`Subject pointer: ${r.subject.guessed ? 'the guess' : 'placed by hand on the face'}. ${r.elementsUsed.length ? `Elements: ${r.elementsUsed.join(', ')}.` : 'No stickers.'}`, ...r.notes.filter((n) => /bigger|left out/i.test(n))],
        verdictWords: WORDS,
      })),
  }));

  // The new checks, each shown failing on a deliberately bad variant.
  const bad = path.join(OUT, 'bad-variants');
  const badItems: ResultsItem[] = [];
  const BAD_TITLES: Record<string, [string, string, string]> = {
    good: ['The good variant', 'All twelve checks pass.', ''],
    'title-on-subject': ['Bad: title on the subject', 'The title moved onto the subject pointer.', 'subject'],
    'object-covers-title': ['Bad: object on the title', 'A picture the person added dropped on the title.', 'overlap'],
    'subject-at-edge': ['Bad: subject at the very edge of the crop', 'The crop puts the subject pointer at the picture’s edge.', 'focal'],
  };
  for (const [name, [title, what, id]] of Object.entries(BAD_TITLES)) {
    const j = path.join(bad, `${name}.json`);
    if (!fs.existsSync(j)) continue;
    const lint = (JSON.parse(fs.readFileSync(j, 'utf8')) as { lint: { id: string; pass: boolean; reason: string }[] }).lint;
    const failed = lint.filter((l) => !l.pass);
    badItems.push({ id: name, title, tag: 'DELIBERATELY BAD (checks the check)', images: [{ url: outUrl(path.join(bad, `${name}.png`)), label: title }], checker: { pass: failed.length === 0, reasons: failed.map((f) => f.reason) }, facts: [what, id ? `Expected to fail: “${id}”. ${failed.some((f) => f.id === id) ? 'It does.' : 'IT DID NOT.'}` : 'Expected to pass.'] });
  }
  for (const side of ['left', 'right']) {
    const p = path.join(OUT, 'subject', `${side}.png`);
    if (fs.existsSync(p)) badItems.push({ id: `pointer-${side}`, title: `The pointer on the ${side}: the title goes to the other side`, tag: TAG, images: [{ url: outUrl(p), label: side }], facts: [`Same photo, same style; only the subject pointer moved (${side === 'left' ? '20' : '85'}% across).`] });
  }

  // Timings: the engine over every option, and the app on a real test photo.
  const all = JSON.parse(fs.readFileSync(summaryFile, 'utf8')) as Row[];
  const check = all.map((r) => r.checkMs);
  const compose = all.map((r) => r.composeMs);
  const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length));
  const notes: ResultsItem[] = [{ id: 'timings-engine', title: 'Timings: the engine', images: [], facts: [`${all.length} options across six styles: each drawn and checked in ${avg(check)} ms on average (slowest ${Math.max(...check)} ms). Composing all the options of one photo and title: ${avg(compose)} ms on average. One run in Chrome on this computer, not a benchmark.`] }];
  const t = path.join(ROOT, 'out/image-engine/thumb-app/timings.json');
  if (fs.existsSync(t)) {
    const x = JSON.parse(fs.readFileSync(t, 'utf8')) as { addPhotoToPointerMs: number; firstOptionsDrawnMs: number; changeStyleToAllDrawnMs: Record<string, number>; zipOfAllOptionsMs: number };
    notes.push({ id: 'timings-app', title: 'Timings: the app', images: [], facts: [`A test photo added to the pointer showing: ${x.addPhotoToPointerMs} ms. A title typed to every option drawn and checked: ${(x.firstOptionsDrawnMs / 1000).toFixed(1)} s. Changing the style to every option drawn again: ${Object.entries(x.changeStyleToAllDrawnMs).map(([k, v]) => `${k.split(',')[0]} ${(v / 1000).toFixed(1)} s`).join(', ')}. A zip of all options: ${x.zipOfAllOptionsMs} ms. One run in Chrome on this computer, not a benchmark.`] });
  }
  notes.push(
    { id: 'no-references', title: 'No reference thumbnails', images: [], tag: 'NOT TESTED', facts: ['The folder “Reference thumbnails/” does not exist, so the six looks were derived from the stored carousel styles, not read from real thumbnails. Whether they match what creators actually post is not known: your verdicts above are the first evidence.'] },
    { id: 'pointer', title: 'The subject is your pointer, not detection', images: [], facts: ['The app does not find faces or understand a picture. With no pointer placed it guesses where the most detail and colour is, and says so. On a photo with several people or a busy background the guess can be wrong; the pointer fixes it, and the title, stickers and object stay off it.'] },
    { id: 'weak-photo', title: 'Weak: a photo of the wrong shape or size', images: [], tag: 'WEAK', facts: ['A tall photo cut to a wide thumbnail, or a small photo stretched, still fails the older “crop keeps enough of the photo”, “resolution” and “sharpness” checks. These options are shown with that failure; the app does not repair them. The photo may be drawn up to 50% bigger so the subject sits where a layout wants it, which also lowers its resolution.'] },
    { id: 'weak-layouts', title: 'Weak: the layouts are my own invention', images: [], tag: 'WEAK', facts: ['The six layouts and the six style blocks come from the carousel readings and general thumbnail habits, not from measured thumbnails. A title is always at the same few places; an option may look generic. Before and after, number badge and object and title appear only when the photos, a number in the title or an object are given.'] },
    { id: 'untested', title: 'Not tested', images: [], tag: 'NOT TESTED', facts: ['Video frames (only still photos were used), Safari and Firefox, touch screens, a real writer for titles (the tests use a stand-in that answers with fixed text), photos over a few thousand pixels, and more than two photos.'] },
  );

  expect(groups.every((g) => g.items.length >= 3)).toBe(true);
  writeStepResults({
    id: 'thumbs-v2',
    title: 'Thumbnails (v2)',
    order: 13,
    intro: 'Images > Make a thumbnail: a photo, a title and a style give several thumbnails, each checked at phone size. Everything here was made by tests that use your own test photos (still pictures, not video frames). No reference thumbnails exist yet.',
    groups: [...groups, { title: 'The new checks, shown failing on purpose', note: 'Three checks need to know where the subject is: the title stays off it, the crop keeps it, and elements and objects stay clear. Each is shown on a variant made to fail it.', items: badItems }, { title: 'Timings and findings', items: notes }],
  });
});
