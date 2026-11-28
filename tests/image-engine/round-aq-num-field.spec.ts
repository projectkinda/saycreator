// Round AQ fix 2: a list number shown twice ("1. 1. leave room around your subject"). The writer put the item's number in the layout's own `num` field (headline-body-image draws
// "N. Headline" from it), and the list-number pass (Round AI) also put "1." in front of the headline. Now, on the layouts that draw "N." from `num` (headline-body-image, do-dont, prose),
// the number goes in that field and never also in front of the headline; a slide that has it in both keeps the person's "N." in front and loses the field; item 10 and up (one digit
// only) goes in front with the field empty. Code only: no model call.
import { expect, test } from '@playwright/test';

const TEXT = `5 ways to make someone stop scrolling

1. Leave room around your subject.
A small figure on a long path feels bigger than a close-up.

2. Make eye contact.
A face looking straight at the viewer stops a thumb faster than any trick.

3. Frame inside a frame.
Shoot through a doorway or a window.

Save this for your next shoot.`;

test('AQ5 the list-number pass on the layouts with a num field: the number in the field only; both present keeps the headline\'s; the numeral layouts and plain layouts as before', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (TEXT) => {
    const LN: any = await import('/src/carousel/listNumbers.ts');
    const cover = { layout: 'statement', fields: { headline: '5 ways to make someone stop scrolling' } };
    const close = { layout: 'statement', fields: { headline: 'Save this for your next shoot.' } };
    const run = (mid: any[]) => LN.keepListNumbers([cover, ...mid, close], TEXT);
    return {
      // the writer used the field (the real run): the headline stays as it is
      field: run([{ layout: 'headline-body-image', fields: { num: '1', headline: 'Leave room around your subject.', body: 'A small figure on a long path feels bigger than a close-up.' } }]),
      // no field: the number goes in the field, not in front
      noField: run([{ layout: 'headline-body-image', fields: { headline: 'Leave room around your subject.', body: 'A small figure on a long path feels bigger than a close-up.' } }]),
      // a wrong number in the field: corrected
      wrong: run([{ layout: 'headline-body-image', fields: { headline: 'Leave room around your subject.', body: 'x' } }, { layout: 'do-dont', fields: { num: '7', title: 'Make eye contact.', wrong: 'Looking away', right: 'Looking at the lens' } }]),
      // the writer wrote it twice: the field goes
      both: run([{ layout: 'headline-body-image', fields: { num: '1', headline: '1. Leave room around your subject.', body: 'x' } }]),
      prose: run([{ layout: 'prose', fields: { heading: 'Leave room around your subject.', p1: 'A small figure on a long path feels bigger than a close-up.' } }]),
      // the layouts of before: a plain layout gets the number in front, a numeral layout in its own field
      plain: run([{ layout: 'split-text', fields: { headline: 'Leave room around your subject.', paragraph: 'x' } }, { layout: 'step-numeral', fields: { step: '9', title: 'Make eye contact.', body: 'x' } }]),
    };
  }, TEXT);
  const mid = (x: any, k = 1) => x.specs[k].fields;
  expect(mid(r.field)).toEqual({ num: '1', headline: 'Leave room around your subject.', body: 'A small figure on a long path feels bigger than a close-up.' });
  expect(r.field.trims).toEqual([]);
  expect(mid(r.noField).num).toBe('1');
  expect(mid(r.noField).headline).toBe('Leave room around your subject.');
  expect(mid(r.wrong).num).toBe('1');
  expect(mid(r.wrong, 2).num).toBe('2');
  expect(mid(r.wrong, 2).title).toBe('Make eye contact.');
  expect(mid(r.both).num).toBeUndefined();
  expect(mid(r.both).headline).toBe('1. Leave room around your subject.');
  expect(r.both.trims[0].field).toBe('list number twice');
  expect(mid(r.prose).num).toBe('1');
  expect(mid(r.prose).heading).toBe('Leave room around your subject.');
  expect(mid(r.plain).headline).toBe('1. Leave room around your subject.');
  expect(mid(r.plain, 2).step).toBe('2');
});

test('AQ6 item 10 and up does not fit the one-digit field: it goes in front of the headline and the field is emptied', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const LN: any = await import('/src/carousel/listNumbers.ts');
    const text = ['Ten tips', ...Array.from({ length: 10 }, (_, k) => `${k + 1}. Tip number ${['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][k]} here.`), 'Save this.'].join('\n');
    const slide = { layout: 'headline-body-image', fields: { num: '1', headline: 'Tip number ten here.', body: 'x' } };
    return LN.keepListNumbers([{ layout: 'statement', fields: { headline: 'Ten tips' } }, slide, { layout: 'statement', fields: { headline: 'Save this.' } }], text);
  });
  expect(r.specs[1].fields.num).toBeUndefined();
  expect(r.specs[1].fields.headline).toBe('10. Tip number ten here.');
});

test('AQ7 the drawn slide: headline-body-image with its number in the field shows "1." once (the real run showed "1. 1.")', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (TEXT) => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const SC: any = await import('/src/carousel/sourceCheck.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const plan = { title: 'x', slides: [
      { layout: 'statement', fields: { headline: '5 ways to make someone stop scrolling' }, accents: [] },
      { layout: 'headline-body-image', fields: { num: '1', headline: 'Leave room around your subject.', body: 'A small figure on a long path feels bigger than a close-up.' }, accents: ['Leave room'] },
      { layout: 'split-text', fields: { headline: 'Make eye contact.', paragraph: 'A face looking straight at the viewer stops a thumb faster than any trick.' }, accents: [] },
      { layout: 'headline-card', fields: { headline: 'Frame inside a frame.', card: 'Shoot through a doorway or a window.' }, accents: [] },
      { layout: 'statement', fields: { headline: 'Save this for your next shoot.' }, accents: [] },
    ] };
    const p = { id: 'fake', write: async () => ({ text: JSON.stringify(plan), ms: 5 }) };
    const out = await DL.designLibraryDeck({ text: TEXT, slides: 5, tone: 'clear', format: 'carousel', keepEverySentence: true }, { pack: PR.presetPackFor('editorial-collage', false, null), hasPhoto: false, site: '' }, '', p, new AbortController().signal);
    const specs = out.designed.library.plan.specs;
    return { texts: specs.map((_: any, i: number) => SC.visibleTextOf(out.designed.slides[String(i)]?.built?.layers ?? [])), fields: specs[1].fields };
  }, TEXT);
  expect(r.fields.num).toBe('1');
  expect(r.texts[1]).toMatch(/^1\.\s+leave room around your subject/i);
  expect(r.texts[1]).not.toMatch(/1\.\s+1\./);
  expect(r.texts[2]).toMatch(/^2\.\s+make eye contact/i);
});
