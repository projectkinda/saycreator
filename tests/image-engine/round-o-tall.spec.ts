// Round O part 3: the final placement step measures a tall screenshot (0.62 wide or narrower) on the slide as drawn: no slide the code placed keeps one under 22% of the slide's width.
// A 4-slide deck (a cover, photo-cover with a long text, list-under-band, a closing) and two tall screenshots, made through designLibraryDeck with a FAKE writer (one fake call, no real call).
// With the Round N shape pass off, the final step alone must hold the line; with it on too. Before (the check off) a screenshot is drawn at 17% of the width.
import { expect, test } from '@playwright/test';

test('O3: after placement no tall screenshot is under 22% of the slide width (the check off: one is)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const LIB: any = await import('/src/carousel/layouts/library.ts');
    const PS: any = await import('/src/carousel/photoShape.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    // small phone screenshots (0.46 wide, as a 1170 x 2532 one): under 400 px, so the hero rule leaves the deck's own variants (the drawn size is the same as for a big one)
    const images = [{ id: 's0', width: 180, height: 390, content: 'screenshot' }, { id: 's1', width: 180, height: 390, content: 'screenshot' }];
    const pc = LIB.layoutDef('photo-cover').samples.long;
    const lub = LIB.layoutDef('list-under-band').samples.normal;
    const plan = { title: 'Three screens', slides: [
      { layout: 'statement', fields: { headline: 'Three screens from the app' }, accents: [] },
      { layout: 'photo-cover', fields: { headline: pc.headline, intro: pc.intro }, accents: [] },
      { layout: 'list-under-band', fields: { ...lub }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post', button: 'Follow for more' }, accents: [] },
    ] };
    const text = ['Three screens from the app.', pc.headline + '.', pc.intro, JSON.stringify(lub), 'Try it on your next post.'].join(' ');
    const p = { id: 'dev-cli', label: 'fake', async write() { return { text: JSON.stringify(plan), ms: 5, usage: { input: 10, output: 10 } }; } };
    const look = { pack: PR.presetPackFor('style-3', false, null), hasPhoto: true, images, site: '' };
    const run = async (shape: boolean, check: boolean) => {
      DL.photoShapeRule.on = shape; DL.placementCheck.on = check;
      try {
        const out = await DL.designLibraryDeck({ text, slides: 4, tone: 'clear', format: 'carousel', styleChoice: 'style-3', styles: [] }, look, '@x', p, new AbortController().signal);
        const widths = Object.entries(out.designed.slides).flatMap(([i, s]: [string, any]) => (s.built.images ?? []).map((im: any) => ({ slide: Number(i) + 1, layout: out.designed.library.layouts[Number(i)], id: im.src.slice(8).split('#')[0], w: PS.photoFitOf([im], im.src.slice(8).split('#')[0], '', 0)?.widthShare })));
        return { widths, calls: out.designed.library.calls, layouts: out.designed.library.layouts };
      } finally { DL.photoShapeRule.on = true; DL.placementCheck.on = true; }
    };
    return { before: await run(false, false), finalOnly: await run(false, true), both: await run(true, true) };
  });
  // before: the code puts a tall screenshot where it is drawn under 22% wide
  expect(r.before.widths.some((x: any) => x.w < 0.22), 'before: ' + JSON.stringify(r.before.widths)).toBe(true);
  // after: the final step alone, and with the shape pass, leave none under the limit
  for (const k of ['finalOnly', 'both']) {
    for (const x of r[k].widths) expect(x.w, `${k}: slide ${x.slide} ${x.layout}`).toBeGreaterThanOrEqual(0.22);
    expect(r[k].calls, 'one (fake) writer call, no retry').toBe(1);
  }
});
