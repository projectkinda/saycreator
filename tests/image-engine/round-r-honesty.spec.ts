// Round R part 4: two honesty fixes from the user's real run. (a) A button label may only use words from the person's text; a text with no call to action closes with NO button (the
// writer's "Follow for more" is taken away, every other word of the closing stays); a label of the person's own words stays. (b) The text ended with "😂": the writer left it out and the sentence
// check (letters only) never said so. Now the code puts an emoji back after the same words when the slide can draw it, and the sentences notice lists one that is on no slide. FAKE writers:
// ZERO real model calls.
import { expect, test, type Route } from '@playwright/test';
import { toStep } from './ui';

test.setTimeout(5 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const TEXT = "Had a wonderful blast at the Hyderabad event. Thank you Punit Chawla for the crazy day man. Met some wonderful people there. And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun. Looking forward for some more of these going forward. And also don't you forget man Punit Chawla 😂";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
// the stored plan of the user's run (style-1): the writer dropped the emoji and invented "Follow for more"
const PLAN = { title: 'Hyderabad event', slides: [
  S('photo-full-caption', { headline: 'Had a wonderful blast at the Hyderabad event.' }),
  S('lead-statement', { lead: 'Thank you Punit Chawla', headline: 'for the crazy day man.' }),
  S('title-over-photo', { headline: 'Met some wonderful people there.' }),
  S('prose', { p1: 'And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun.', pull: "And also don't you forget man Punit Chawla." }),
  S('cta-button', { headline: 'Looking forward for some more of these going forward.', button: 'Follow for more' }),
] };

test('R4a + R4b in the deck: the invented button goes (no button, every word of the closing kept), the emoji comes back after "Punit Chawla" and is drawn; a label of the person\'s own words stays', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async ({ TEXT, PLAN }) => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const SC: any = await import('/src/carousel/sourceCheck.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const run = async (text: string, plan: any, style = 'style-1') => {
      let calls = 0;
      const p = { id: 'fake', write: async () => { calls++; return { text: JSON.stringify(plan), ms: 5 }; } };
      const out = await DL.designLibraryDeck({ text, slides: 5, tone: 'clear', format: 'carousel', keepEverySentence: true }, { pack: PR.presetPackFor(style, false, null), hasPhoto: true, site: '' }, '@saycreator', p, new AbortController().signal);
      const lib = out.designed.library;
      const specs = lib.plan.specs;
      const texts = specs.map((_: any, i: number) => SC.visibleTextOf(out.designed.slides[String(i)]?.built.layers ?? []));
      return { calls, last: specs[specs.length - 1], texts, notes: lib.codeAdjustments, miss: SC.sourceNotOnSlidesOf(text, texts) };
    };
    const own = "Most creators don't have a design problem. They have a time problem. Comment brain and I'll send you the guide.";
    const ownPlan = { title: 'x', slides: [S0('statement', { headline: "Most creators don't have a design problem." }), S0('split-text', { headline: 'A time problem', paragraph: 'They have a time problem.' }), S0('cta-button', { headline: "I'll send you the guide.", button: 'Comment brain' })] };
    function S0(layout: string, fields: any) { return { layout, fields, accents: [] }; }
    return { user: await run(TEXT, PLAN), dark: await run(TEXT, PLAN, 'dark-quiet'), own: await run(own, ownPlan) };
  }, { TEXT, PLAN });
  for (const k of ['user', 'dark']) {
    const d = r[k];
    expect(d.calls, `${k}: one writer call`).toBe(1);
    // (a) no button, the closing headline kept, no "Follow for more" anywhere
    expect(d.last.fields.button, `${k}: no button`).toBeUndefined();
    expect(['statement-card', 'statement']).toContain(d.last.layout);
    expect(d.last.fields.headline).toBe('Looking forward for some more of these going forward.');
    expect(d.texts.join(' ')).not.toMatch(/Follow for more/);
    expect(d.notes.join('\n')).toMatch(/the button "Follow for more" is not your words \(the text asks for no action\)/);
    // (b) the emoji is back after "Punit Chawla", drawn on the slide, and nothing is missing
    expect(d.texts.join(' ')).toContain('Punit Chawla 😂');
    expect(d.miss.emojis).toEqual([]);
    expect(d.miss.count).toBe(0);
    expect(d.notes.join('\n')).toMatch(/the writer left out the 😂 of your text, so the code put it back after the same words/);
  }
  // a label made of the person's own words stays
  expect(r.own.last.fields.button).toBe('Comment brain');
  expect(r.own.calls).toBe(1);
});

test('R4b: the sentence check counts an emoji: one on no slide is listed (with the words it followed); the same emoji shown is not', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (TEXT) => {
    const SC: any = await import('/src/carousel/sourceCheck.ts');
    return {
      lost: SC.sourceNotOnSlidesOf(TEXT, ["And also don't you forget man Punit Chawla.", 'Had a wonderful blast at the Hyderabad event.']).emojis,
      shown: SC.sourceNotOnSlidesOf(TEXT, ["And also don't you forget man Punit Chawla 😂."]).emojis,
      two: SC.sourceNotOnSlidesOf('Great day 🎉 and a great night 🎉', ['Great day 🎉 and a great night']).emojis,
      places: SC.emojiPlaces('Thumbs 👍🏽 and family 👨‍👩‍👧 and flag ❤️'),
    };
  }, TEXT);
  expect(r.lost).toEqual([{ emoji: '😂', after: 'forget man Punit Chawla' }]);
  expect(r.shown).toEqual([]);
  expect(r.two, 'counted as often as the text has it').toEqual([{ emoji: '🎉', after: 'and a great night' }]);
  expect(r.places.map((p: any) => p.emoji)).toEqual(['👍🏽', '👨‍👩‍👧', '❤️']);
});

test('R4b in the page: when the emoji finds no place (its sentence is on no slide), the sentences notice lists it; no button is drawn on the closing', async ({ page }) => {
  // the writer leaves out the last sentence (and its emoji) and invents a button
  // (this deck has no pictures, so the writer's picture layouts are plain statements here)
  const plan = { title: 'Hyderabad event', slides: PLAN.slides.map((s) => (s.layout === 'prose' ? { ...s, fields: { p1: s.fields.p1 } } : s.layout === 'photo-full-caption' || s.layout === 'title-over-photo' ? { ...s, layout: 'statement' } : s)) };
  let calls = 0;
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => { calls++; return r.fulfill({ json: { text: JSON.stringify(plan), ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 2);
  await page.getByTestId('options').getByRole('combobox').first().selectOption('5');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(5, { timeout: 90_000 });
  await page.waitForTimeout(1500);
  const box = page.getByTestId('not-on-slides');
  await expect(box).toContainText('1 of 6 sentences from your text is not on any slide.');
  await expect(page.getByTestId('emoji-not-on-slides')).toHaveText('1 emoji from your text is not on any slide.');
  await box.locator('summary').click();
  await expect(page.getByTestId('not-on-slides-list')).toContainText('😂 (after “forget man Punit Chawla”)');
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
  const last = d.designed.library.plan.specs.at(-1);
  expect(last.fields.button).toBeUndefined();
  expect(JSON.stringify(d.designed.slides[String(d.designed.library.plan.specs.length - 1)].built.layers)).not.toContain('Follow for more');
  expect(calls).toBe(1);
});

