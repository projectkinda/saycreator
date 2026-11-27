// Round AI: a numbered list in the person's text keeps its numbers on the slides (listNumbers.ts). The writer may drop "2." from an item's headline; the code puts it back from the text:
// a numeral layout gets its number field, any other layout "N." and a no-break space in front of the headline (when the layout still takes it). No list, no change. A FAKE writer: ZERO model calls.
import { expect, test } from '@playwright/test';

test.setTimeout(3 * 60_000);
const TEXT = "5 small habits that make your photos look less like everyone else's.\n\n1. Shoot at golden hour. Sunrise and the hour before sunset do more than any filter.\n2. Look for reflections. Puddles, windows and wet streets give you a second picture for free.\n3. Get low or get high. Eye level is what everyone else does.\n4. Leave empty space. A small subject in a big scene feels like a story.\n5. Pick one detail. A single leaf on a table can beat a whole landscape.\n\nSave this for your next shoot, and tell me which one you'll try first.";

test('AI1 the list in the text: items found in order; each item slide shows its number (numeral field or "N." with a no-break space); cover, closing and a text without a list are left alone', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (TEXT) => {
    const LN: any = await import('/src/carousel/listNumbers.ts');
    const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
    const specs = [
      S('statement-card', { headline: "5 small habits that make your photos look less like everyone else's." }),
      S('listicle-numeral', { numeral: '7', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' }),
      S('split-half', { headline: 'Look for reflections', body: 'Puddles, windows and wet streets give you a second picture for free.' }),
      S('statement', { headline: '3. Get low or get high' }),
      S('split-text', { headline: 'Leave empty space.', paragraph: 'A small subject in a big scene feels like a story.' }),
      S('statement', { headline: 'Pick one detail.' }),
      S('cta-button', { headline: "Tell me which one you'll try first", button: 'Tell me' }),
    ];
    const items = LN.numberedItems(TEXT).map((x: any) => [x.n, x.title]);
    const done = LN.keepListNumbers(specs, TEXT);
    const none = LN.keepListNumbers(specs, TEXT.replace(/^\d\. /gm, ''));
    return { items, out: done.specs.map((s: any) => s.fields), trims: done.trims, unchanged: JSON.stringify(none.specs) === JSON.stringify(specs), noneTrims: none.trims.length };
  }, TEXT);
  expect(r.items).toEqual([[1, 'Shoot at golden hour.'], [2, 'Look for reflections.'], [3, 'Get low or get high.'], [4, 'Leave empty space.'], [5, 'Pick one detail.']]);
  expect(r.out[0].headline, 'the cover is not an item').toBe("5 small habits that make your photos look less like everyone else's.");
  expect(r.out[1].numeral, 'a numeral layout shows the item number').toBe('1');
  expect(r.out[2].headline).toBe('2. Look for reflections');
  expect(r.out[3].headline, 'already numbered: left alone').toBe('3. Get low or get high');
  expect(r.out[4].headline).toBe('4. Leave empty space.');
  expect(r.out[5].headline).toBe('5. Pick one detail.');
  expect(r.out[6].button, 'the closing is left alone').toBe('Tell me');
  expect(r.trims.map((t: any) => t.slide)).toEqual([2, 3, 5, 6]);
  expect(r.unchanged, 'a text without a numbered list changes nothing').toBe(true);
  expect(r.noneTrims).toBe(0);
});

test('AI2 a deck from the writer: the numbers reach the drawn slides, one writer call, every word kept, the report says so', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (TEXT) => {
    const DL: any = await import('/src/carousel/designLibrary.ts'); const PR: any = await import('/src/carousel/presets.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
    const slides = [
      S('statement-card', { headline: "5 small habits that make your photos look less like everyone else's." }),
      S('split-text', { headline: 'Shoot at golden hour.', paragraph: 'Sunrise and the hour before sunset do more than any filter.' }),
      S('statement-card', { headline: 'Look for reflections.', caption: 'Puddles, windows and wet streets give you a second picture for free.' }),
      S('statement', { headline: 'Get low or get high.', caption: 'Eye level is what everyone else does.' }),
      S('split-text', { headline: 'Leave empty space.', paragraph: 'A small subject in a big scene feels like a story.' }),
      S('statement', { headline: 'Pick one detail.', caption: 'A single leaf on a table can beat a whole landscape.' }),
      S('cta-button', { headline: "Tell me which one you'll try first", button: 'Tell me', sub: 'Save this for your next shoot' }),
    ];
    let calls = 0;
    const provider = { id: 'dev-cli', label: 'fake', async write() { calls++; return { text: JSON.stringify({ title: '5 small habits', slides }), ms: 1 }; } };
    const pack = PR.presetPackFor('editorial-collage', false, null);
    const res = await DL.designLibraryDeck({ text: TEXT, slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'editorial-collage', styles: [] }, { pack, hasPhoto: false, images: [], brief: '', site: '' }, '', provider, new AbortController().signal);
    const lib = res.designed.library;
    const titles = Object.keys(res.designed.slides).sort((a, b) => +a - +b).map((k) => res.designed.slides[k].built.layers.filter((l: any) => l.kind === 'text' && l.name === 'title').map((l: any) => l.text).join(' '));
    return { calls, retry: lib.retries, titles, notes: (lib.trims ?? []).filter((t: any) => t.field === 'list number').map((t: any) => DL.trimNote(t)) };
  }, TEXT);
  expect(r.calls, JSON.stringify(r.retry)).toBe(1);
  for (let n = 1; n <= 5; n++) expect(r.titles.some((t: string) => new RegExp(`^${n}\\.\\u00A0`).test(t)), `item ${n} shows its number: ${JSON.stringify(r.titles)}`).toBe(true);
  expect(r.notes.length).toBe(5);
  expect(r.notes[0]).toMatch(/is an item of the numbered list in your text, so the code put its number in front/);
});
