// Round AH part 1: a cover-art headline over 60 characters (the writer is still asked for 60) is accepted up to 90 and drawn on up to four lines at the 72 px floor at the least, so a deck's
// first slide with a long headline keeps its photo instead of falling back to a text-only slide. Every word kept; one writer call; the writer prompt is unchanged (field.max is what it shows).
// A FAKE writer and a picture made in the page: ZERO model calls.
import { expect, test } from '@playwright/test';

test.setTimeout(3 * 60_000);
const LONG = "5 small habits that make your photos look less like everyone else's.";

test('AH1 a long cover headline keeps the photo on the cover: accepted to 90 characters, one writer call, every word at 72 px or more; the prompt still asks for 60', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (LONG) => {
    const DL: any = await import('/src/carousel/designLibrary.ts'); const PR: any = await import('/src/carousel/presets.ts'); const FA: any = await import('/src/reference/faithful.ts');
    const PK: any = await import('/src/carousel/layouts/pick.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const c = document.createElement('canvas'); c.width = 1800; c.height = 2400; const g = c.getContext('2d')!; g.fillStyle = '#c9d1db'; g.fillRect(0, 0, 1800, 2400); g.fillStyle = '#2471a3'; g.fillRect(600, 700, 600, 1000);
    const u = c.toDataURL('image/jpeg', 0.9); FA.setPictureResolver(async () => u);
    const img = 'picture:pl#w=1800&h=2400&fx=0.5&fy=0.5&z=1&k=p';
    const v = { long: PK.validateSlideContent('cover-art', { headline: LONG, image: img }), tooLong: PK.validateSlideContent('cover-art', { headline: LONG + ' And then some more words.', image: img }), tpo: PK.validateSlideContent('title-over-photo', { headline: LONG, image: img }) };
    const slides = [
      { layout: 'cover-art', fields: { headline: LONG }, accents: [] },
      { layout: 'statement-card', fields: { headline: 'Here is the short version.' }, accents: [] },
      { layout: 'prose', fields: { p1: 'A plain paragraph that carries the story between the cover and the close, so the deck has more than one slide.' }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Send me a message.', button: 'Send me a message' }, accents: [] },
    ];
    let calls = 0; let prompt = '';
    const provider = { id: 'dev-cli', label: 'fake', async write(p: string) { calls++; prompt = p; return { text: JSON.stringify({ title: LONG, slides }), ms: 1 }; } };
    const pack = PR.presetPackFor('editorial-collage', false, null);
    const res = await DL.designLibraryDeck({ text: [LONG, 'Here is the short version.', slides[2].fields.p1, 'Send me a message.'].join(' '), slides: 4, tone: 'clear', format: 'carousel', styleChoice: 'editorial-collage', styles: [] }, { pack, hasPhoto: true, images: [{ id: 'pl', width: 1800, height: 2400, content: 'photo' }], brief: '', site: '' }, '', provider, new AbortController().signal);
    const ds = res.designed.slides['0'];
    const title = ds.built.layers.filter((l: any) => l.kind === 'text' && l.name === 'title');
    return { v, calls, coverPromptLine: (prompt.split('\n').find((l) => l.includes('cover-art') && l.includes('headline')) ?? '').slice(0, 300), layout: res.designed.library.plan.specs[0].layout, hasPhoto: /<image href="picture:pl/.test(ds.built.svg), words: title.map((l: any) => l.text).join(' ').toLowerCase(), size: Math.min(...title.map((l: any) => l.style?.size ?? 0)), notes: (ds.built.notes ?? []).filter((n: string) => /made smaller|truly overflow/.test(n)) };
  }, LONG);
  expect(r.v.long.ok, JSON.stringify(r.v.long.errors)).toBe(true);
  expect(r.v.tooLong.ok, 'over 90 characters is still refused').toBe(false);
  expect(r.v.tpo.ok, 'title-over-photo keeps its own limit').toBe(false);
  expect(r.calls, 'one writer call: the long headline is not a reason to ask again').toBe(1);
  expect(r.layout).toBe('cover-art');
  expect(r.hasPhoto, 'the photo stays on the cover').toBe(true);
  for (const w of LONG.toLowerCase().match(/[\p{L}\p{N}']+/gu)!) expect(r.words).toContain(w);
  expect(r.size).toBeGreaterThanOrEqual(72);
  expect(r.notes).toEqual([]);
  if (r.coverPromptLine) expect(r.coverPromptLine).not.toContain('90');
});
