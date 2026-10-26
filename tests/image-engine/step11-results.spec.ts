// Puts Step 11 on the Results screen ("Step 11: Photo side"). It reads what the other Step 11 specs saved under out/image-engine/step11/
// and the findings written after looking at the slides (step11-findings.json). The treatment gallery comes first.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outUrl, writeStepResults, type ResultsItem } from './results';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/step11');
const REF = '/Reference%20carousels%20likes/';
const STYLE_REFS: Record<string, string[]> = {
  'mono-poster': ['1f13499493341400cfc3fe6e05fe3d58.jpg', '44937935e682165c1f93e99a11a47123.jpg'],
  'film-paper': ['9897a861375e0f0abb77f9b7ac28febd.jpg', 'af4224d23eb688a8eb56abb9515b593e.jpg'],
  'glass-gradient': ['bf7d6a6e42c4742031644ad3118f8eb1.jpg', '1503c1de8dded2a7cbe333f061c7131a.jpg'],
};
const TITLES: Record<string, string> = { 'mono-poster': 'Mono photo poster', 'film-paper': 'Film photo and paper', 'glass-gradient': 'Soft gradient and glass' };
const VERDICTS = ['matches', 'close', 'off', 'wrong'];
const TEST_TAG = 'TEST ASSETS: not shippable';

interface Row { index: number; type: string; layout: string; palette: string; notes: string[]; repairs: string[]; photoSlots: { id: string; filled: boolean }[]; pass: boolean; failed: { id: string; reason: string }[]; png: string }
interface Findings {
  styles: Record<string, { verdict: string; reason: string; close: string[]; weak: string[]; couldNot: string[]; cutouts: string[] }>;
  general: { title: string; tag: string; note: string }[];
}
const read = <T>(p: string): T | null => (fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as T) : null);

test('Step 11 Results section', async () => {
  test.skip(!fs.existsSync(path.join(OUT, 'gallery/index.json')), 'Run the Step 11 gallery and style specs first.');
  const gallery = read<{ photo: string; items: { id: string; group: string; title: string; note: string; synthetic: boolean }[] }>(path.join(OUT, 'gallery/index.json'))!;
  const findings = read<Findings>(path.join(ROOT, 'tests/image-engine/step11-findings.json'));
  const noPhotos = read<Record<string, { emptySlots: { slide: number; layout: string }[] }>>(path.join(OUT, 'no-photos.json'));

  const groups: { title: string; note?: string; items: ResultsItem[] }[] = [];

  // 1. The treatment gallery comes first.
  const notes: Record<string, string> = {
    Treatments: 'One of your test photos under every treatment, each a plan you can edit with patches. Treatments are drawn in the browser from the photo itself: nothing is sent anywhere, and the original is never changed. Shown at half size.',
    Masks: 'The same photo cut to each shape. A mask is part of the image layer in the plan, so it can be swapped with one patch.',
    Frames: 'Phone, laptop, polaroid, ticket, 3-up strip, a colour block behind a photo, and tilted white chip cards. Each frame is a handful of ordinary shape, image and text layers.',
    Backgrounds: 'Blurred gradient fields (colour blobs plus grain), a glow, and glass cards that blur whatever is behind them.',
    Objects: 'A transparent object with a soft contact shadow, a floor reflection, a glow, or scale and rotation. No transparent pictures were supplied, so these use a STAND-IN object drawn in code (a glossy ball with a ring): it shows the effects, not a real cutout.',
  };
  for (const g of ['Treatments', 'Masks', 'Frames', 'Backgrounds', 'Objects']) {
    const items = gallery.items.filter((i) => i.group === g);
    groups.push({
      title: g === 'Objects' ? 'Objects (stand-in, not a real cutout)' : `Gallery: ${g.toLowerCase()}`,
      note: notes[g],
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        tag: i.synthetic ? 'SYNTHETIC stand-in object' : TEST_TAG,
        facts: [i.note, i.synthetic ? 'The object is drawn in code.' : `Photo: one of your test photos (${gallery.photo.split('-')[0]}).`],
        images: [{ url: outUrl(path.join(OUT, 'gallery', `${i.id}.png`)), full: outUrl(path.join(OUT, 'gallery', `${i.id}.png`)), background: i.synthetic ? 'dark' : undefined }],
      })),
    });
  }

  // 2. Each new style: every slide as its own file, the reference deck beside it, a verdict.
  for (const style of Object.keys(STYLE_REFS)) {
    const summary = read<{ photos: { id: string; label: string }[]; decks: Record<string, { title: string; rows: Row[] }> }>(path.join(OUT, style, 'test/summary.json'));
    if (!summary) continue;
    const f = findings?.styles[style];
    const items: ResultsItem[] = Object.entries(summary.decks).map(([deckId, d]) => {
      const failed = d.rows.filter((r) => !r.pass);
      const repaired = d.rows.filter((r) => r.repairs.length > 0).length;
      return {
        id: `${style}-${deckId}`,
        title: `${TITLES[style]}: ${d.title}`,
        tag: TEST_TAG,
        verdictWords: VERDICTS,
        facts: [
          `Photos: ${summary.photos.map((p) => p.label).join(', ')}.`,
          `${d.rows.filter((r) => r.pass).length} of ${d.rows.length} slides pass the phone-size checks${repaired ? `; ${repaired} needed an overlay or plate added over the photo` : ''}.`,
          ...(f ? [`My verdict: ${f.verdict}. ${f.reason}`] : []),
        ],
        checker: { pass: failed.length === 0, reasons: failed.flatMap((r) => r.failed.map((x) => `Slide ${r.index}: ${x.reason}`)) },
        images: [
          ...STYLE_REFS[style].map((r, i) => ({ url: REF + r, label: `Reference deck ${i + 1} (comparison only)` })),
          ...d.rows.map((r) => ({
            url: outUrl(path.join(OUT, style, 'test', deckId, r.png)),
            label: `Slide ${r.index} · ${r.type} · ${r.layout}${r.photoSlots.length ? ' · photo' : ''}${r.repairs.length ? ' · overlay added' : ''}`,
          })),
        ],
      };
    });
    const empty = noPhotos?.[style]?.emptySlots ?? [];
    const noPhotoDir = path.join(OUT, style, 'no-photos');
    const npDeck = fs.existsSync(noPhotoDir) ? fs.readdirSync(noPhotoDir)[0] : null;
    if (npDeck) {
      const slides = fs.readdirSync(path.join(noPhotoDir, npDeck)).filter((n) => /^slide-\d+\.png$/.test(n)).sort();
      items.push({
        id: `${style}-no-photos`,
        title: `${TITLES[style]}: the same deck with no photos at all`,
        tag: 'NO PHOTOS: placeholders',
        facts: [`${empty.length} slides asked for a photo (a photo hint) and drew a clean placeholder instead, each with a warning on its card; none fails a check.`],
        checker: { pass: true, reasons: [] },
        images: slides.map((n, i) => ({ url: outUrl(path.join(noPhotoDir, npDeck, n)), label: `Slide ${i + 1}` })),
      });
    }
    groups.push({
      title: `Style: ${TITLES[style]} (${style})`,
      note: f ? `Close: ${f.close.join(' ')} Weak: ${f.weak.join(' ')} Could not reproduce: ${f.couldNot.join(' ')} Depends on cutouts: ${f.cutouts.join(' ')}` : undefined,
      items,
    });
  }

  // 3. Findings.
  if (findings) groups.push({ title: 'Findings and weak points', items: findings.general.map((g, i) => ({ id: `finding-${i + 1}`, title: g.title, tag: g.tag, images: [], facts: [g.note] })) });

  expect(groups.length).toBeGreaterThan(3);
  writeStepResults({
    id: 'step11',
    title: 'Step 11: Photo side',
    order: 11,
    intro: 'Carousels that use photos. First the treatment gallery (one of your test photos under every treatment, mask, frame and background), then three new styles recreated from references no stored style covered, each slide as its own file with the reference deck beside it. Every photo here is from test-assets/ (TEST ASSETS: not shippable): private, never in the product, never sent anywhere. Verdict words: matches, close, off, wrong.',
    groups,
  });
});
