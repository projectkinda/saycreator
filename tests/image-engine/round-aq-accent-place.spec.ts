// Round AQ fix 3: the highlight "a frame" on "3. Frame inside a frame" lit the FIRST "Frame". An accent never starts with an article (stripArticle: "a frame" is drawn as "frame") and
// the search found the first "frame". Now the phrase as written travels with the accent (withAccent: `within`), and the engine (accentPhrase), the stack measure and the line-break check
// put the highlight on "frame" inside the first place where "a frame" stands. Without an article nothing changes: "frame" alone still goes to the first one. Code only: no model call.
import { expect, test } from '@playwright/test';

test('AQ8 the place of a phrase that lost its article: inside the phrase as written; without one, as before', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const W: any = await import('/src/reference/accentWithin.ts');
    const RC: any = await import('/src/reference/recreate.ts');
    const L: any = await import('/src/carousel/layouts/library.ts');
    const head = '3. Frame inside a frame';
    const st = { accentStyle: 'marker' };
    return {
      at: W.accentWithinAt(head, 'frame', 'a frame'),
      atNone: W.accentWithinAt(head, 'frame', undefined),
      atMissing: W.accentWithinAt(head, 'frame', 'the frame'),
      atSame: W.accentWithinAt(head, 'frame', 'frame'),
      phrase: RC.accentPhrase(head, 'frame', 'a frame'),
      phraseOld: RC.accentPhrase(head, 'frame'),
      hoodie: RC.accentPhrase('Flip the hoodie, the hoodie wins', 'hoodie', 'the hoodie'),
      upper: RC.accentPhrase('3. FRAME INSIDE A FRAME', 'FRAME', 'A FRAME'),
      withA: L.withAccent({ headline: head }, head, { accent: 'a frame' }, st).accent,
      withPlain: L.withAccent({ headline: head }, head, { accent: 'frame' }, st).accent,
      withTwo: L.withAccent({ headline: head }, head, { accent: ['a frame', 'inside'] }, st).accent,
    };
  });
  expect(r.at).toBe(18);
  expect(r.atNone).toBe(-1);
  expect(r.atMissing).toBe(-1);
  expect(r.atSame).toBe(-1);
  expect(r.phrase).toEqual({ start: 18, end: 23 });
  expect(r.phraseOld, 'no phrase as written: the first one, as before').toEqual({ start: 3, end: 8 });
  expect(r.hoodie).toEqual({ start: 9, end: 15 });
  expect(r.upper).toEqual({ start: 18, end: 23 });
  expect(r.withA).toEqual({ phrase: 'frame', within: 'a frame', style: 'marker' });
  expect(r.withPlain, 'no article: the accent as before').toEqual({ phrase: 'frame', style: 'marker' });
  expect(r.withTwo).toEqual([{ phrase: 'frame', within: 'a frame', style: 'marker' }, { phrase: 'inside', style: 'marker' }]);
});

test('AQ9 the drawn slides: "a frame" is highlighted on the last "frame" in a lower-case and a regular style, on split-text and headline-body-image; "frame" alone stays on the first', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const text = 'Three tips. Frame inside a frame. Shoot through a doorway. Go close on one leaf. Save this.';
    const plan = (accent: string) => ({ title: 'x', slides: [
      { layout: 'statement', fields: { headline: 'Three tips.' }, accents: [] },
      { layout: 'split-text', fields: { headline: 'Frame inside a frame.', paragraph: 'Shoot through a doorway.' }, accents: [accent] },
      { layout: 'headline-body-image', fields: { headline: 'Frame inside a frame.', body: 'Shoot through a doorway.' }, accents: [accent] },
      { layout: 'statement', fields: { headline: 'Go close on one leaf.' }, accents: [] },
      { layout: 'statement', fields: { headline: 'Save this.' }, accents: [] },
    ] });
    const out: any = {};
    for (const style of ['editorial-collage', 'dark-quiet']) for (const accent of ['a frame', 'frame']) {
      const p = { id: 'fake', write: async () => ({ text: JSON.stringify(plan(accent)), ms: 5 }) };
      const d = await DL.designLibraryDeck({ text, slides: 5, tone: 'clear', format: 'carousel', keepEverySentence: true }, { pack: PR.presetPackFor(style, false, null), hasPhoto: false, site: '' }, '', p, new AbortController().signal);
      out[`${style} ${accent}`] = [1, 2].map((i) => {
        const l = (d.designed.slides[String(i)]?.built?.layers ?? []).find((x: any) => x.kind === 'text' && /frame inside a frame/i.test(x.text ?? ''));
        const runs = (l?.highlight?.ranges ?? l?.runs ?? []).map((g: any) => ({ start: g.start, end: g.end }));
        return { text: l?.text, runs, last: l ? l.text.toLowerCase().lastIndexOf('frame') : -1, first: l ? l.text.toLowerCase().indexOf('frame') : -1 };
      });
    }
    return out;
  });
  for (const [k, slides] of Object.entries(r) as [string, any[]][]) {
    for (const s of slides) {
      expect(s.text, k).toBeTruthy();
      expect(s.runs.length, `${k}: one highlight`).toBe(1);
      const want = k.endsWith(' a frame') ? s.last : s.first;
      expect(s.runs[0], `${k}: ${s.text}`).toEqual({ start: want, end: want + 5 });
    }
  }
});
