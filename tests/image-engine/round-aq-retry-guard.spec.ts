// Round AQ fix 1: the retry merge. A real deck lost two tips: the retry asked for "slide 3" and "slide 5" (the cover counted) and the answer held the words of list items 3 and 5, so tips
// 2 and 4 were on no slide and tips 3 and 5 showed twice. Now a redone slide is used only when its words are the words of the slide it replaces (retryGuard.ts); otherwise the slide keeps its
// own words, in a layout that shows them all and that the rotation keeps, and the notes say so. Redone and kept slides get the list numbers and the picture rescue again. The retry message
// names each slide with its headline. The report's keepEverySentence says what happened (keepEverySentenceAsked is the switch). FAKE writers: ZERO real model calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import { toStep } from './ui';

test.setTimeout(4 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });

const TEXT = `5 ways to make someone stop scrolling

1. Leave room around your subject.
A small figure on a long path feels bigger than a close-up. Space makes people look for the story.

2. Make eye contact.
A face looking straight at the viewer stops a thumb faster than any trick.

3. Frame inside a frame.
Shoot through a doorway or a window. The dark edges push the eye to the bright middle.

4. Go close on one small thing.
One leaf on dark wood beats a whole forest when the light is right.

5. Add motion and glow.
Neon at dusk and a blurred tram say "city at night" in one frame.

Save this for your next shoot, then tell me which one you'll try first.`;
const TIP: Record<number, [string, string]> = {
  1: ['Leave room around your subject.', 'A small figure on a long path feels bigger than a close-up. Space makes people look for the story.'],
  2: ['Make eye contact.', 'A face looking straight at the viewer stops a thumb faster than any trick.'],
  3: ['Frame inside a frame.', 'Shoot through a doorway or a window. The dark edges push the eye to the bright middle.'],
  4: ['Go close on one small thing.', 'One leaf on dark wood beats a whole forest when the light is right.'],
  5: ['Add motion and glow.', 'Neon at dusk and a blurred tram say "city at night" in one frame.'],
};
const N = (layout: string, key: string, n: number) => ({ layout, fields: { [key]: String(n), title: TIP[n][0], body: TIP[n][1] }, accents: [] as string[] });
// the first answer of the bad run's shape: numeral layouts side by side, so the rotation asks a retry for slides 3 and 5
const FIRST = { title: 'Stop scrolling', slides: [
  { layout: 'statement', fields: { headline: '5 ways to make someone stop scrolling' }, accents: ['stop scrolling'] },
  N('listicle-numeral', 'numeral', 1), N('step-numeral', 'step', 2), N('listicle-numeral', 'numeral', 3), N('step-numeral', 'step', 4),
  { layout: 'headline-card', fields: { headline: TIP[5][0], card: TIP[5][1] }, accents: ['glow'] },
  { layout: 'cta-pair', fields: { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me which one', line2: "Then tell me which one you'll try first." }, accents: [] },
] };
/** The second answer, built from the retry message: `tip`, slide N gets list item N (the bad run); `own`, slide N keeps its own words in split-text. */
const second = (prompt: string, mode: 'tip' | 'own' | 'statement'): string => {
  const asked = [...(prompt.match(/for slide number ([\d, ]+)/)?.[1] ?? '').matchAll(/\d+/g)].map((m) => Number(m[0]));
  const so = JSON.parse(prompt.split('The slides so far (JSON):\n')[1].split('\n')[0]);
  const slides: Record<string, unknown> = {};
  for (const n of asked) {
    const [h, p] = mode === 'tip' ? TIP[n] : [so[n - 1].fields.title, so[n - 1].fields.body];
    // 'statement': the real writer's answer of one real retry (its own words, the sentence as a caption)
    slides[String(n)] = mode === 'statement' ? { layout: 'statement', fields: { headline: h, caption: p }, accents: [] } : { layout: 'split-text', fields: { headline: h, paragraph: p }, accents: [] };
  }
  return JSON.stringify({ slides });
};

async function deck(page: Page, mode: 'tip' | 'own' | 'statement', pictures = false) {
  await page.goto('/images/carousel');
  return page.evaluate(async ({ TEXT, FIRST, TIP, mode, secondSrc, pictures }) => {
    const second = new Function('TIP', 'return ' + secondSrc)(TIP);
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const SC: any = await import('/src/carousel/sourceCheck.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const prompts: string[] = [];
    const p = { id: 'fake', write: async (prompt: string) => { prompts.push(prompt); return { text: prompts.length === 1 ? JSON.stringify(FIRST) : second(prompt, mode), ms: 5 }; } };
    const out = await DL.designLibraryDeck({ text: TEXT, slides: 7, tone: 'clear', format: 'carousel', keepEverySentence: true }, { pack: PR.presetPackFor('editorial-collage', false, null), hasPhoto: pictures, ...(pictures ? { images: [['p1', 1600, 2400, 'people in dark archway'], ['p2', 1600, 2400, 'orange maple leaf on dark wood'], ['p3', 1600, 2400, 'brick building with neon signs'], ['p4', 2400, 1600, 'person walking rocky path through forest'], ['p5', 750, 422, 'animated boy smiling']].map(([id, width, height, label]) => ({ id, width, height, label, content: 'photo' })) } : {}), site: '' }, '', p, new AbortController().signal);
    const lib = out.designed.library;
    const specs = lib.plan.specs;
    const texts = specs.map((_: any, i: number) => SC.visibleTextOf(out.designed.slides[String(i)]?.built?.layers ?? []));
    const heads = specs.map((s: any) => String(s.fields.headline ?? s.fields.title ?? s.fields.heading ?? ''));
    return { calls: prompts.length, retry: prompts[1] ?? '', heads, texts, layouts: specs.map((s: any) => s.layout), nums: specs.map((s: any) => s.fields.numeral ?? s.fields.step ?? ''), retries: lib.retries, notes: out.designed.notes, miss: SC.sourceNotOnSlidesOf(TEXT, texts) };
  }, { TEXT, FIRST, TIP, mode, secondSrc: second.toString(), pictures });
}

test('AQ1 a redone slide with the words of another slide is refused: every tip stays on its own slide, none twice; the notes say why; the retry message names each slide by its headline', async ({ page }) => {
  const r: any = await deck(page, 'tip');
  expect(r.calls).toBe(2);
  // the retry message: the slide and its headline, and the rule to keep its own words
  expect(r.retry).toContain('- slide 3 ("Make eye contact."):');
  expect(r.retry).toContain('- slide 5 ("Go close on one small thing."):');
  expect(r.retry).toContain('Each corrected slide keeps its OWN words from that list');
  // nothing lost, nothing twice
  expect(r.miss.count, r.miss.sentences.join(' | ')).toBe(0);
  for (const n of [1, 2, 3, 4, 5]) expect(r.heads.filter((h: string) => h.includes(TIP[n][0].replace(/\.$/, ''))), `tip ${n} on exactly one slide`).toHaveLength(1);
  // slides 3 and 5 kept their words, moved to a layout the rotation keeps, with their numbers in front
  expect(r.heads[2]).toMatch(/^2\.\s+Make eye contact/);
  expect(r.heads[4]).toMatch(/^4\.\s+Go close on one small thing/);
  expect(r.layouts[2]).not.toMatch(/numeral/);
  expect(r.layouts[4]).not.toMatch(/numeral/);
  const refused = r.retries.filter((x: any) => x.refused);
  expect(refused.map((x: any) => x.slide)).toEqual([3, 5]);
  expect(refused[0].refused).toMatch(/words the slide did not have/);
  expect(refused[0].refused).toContain('"Frame inside a frame."');
  const note = r.notes.find((n: string) => n.startsWith('Retry for slide 3'));
  expect(note).toMatch(/The second answer was not used for it: .*so the slide kept its own words \(drawn as "[a-z-]+"\)$/);
  expect(note).not.toContain('..');
});

test('AQ2 a redone slide with its own words is used, and gets its list number back', async ({ page }) => {
  const r: any = await deck(page, 'own');
  expect(r.calls).toBe(2);
  expect(r.retries.filter((x: any) => x.refused)).toEqual([]);
  expect(r.layouts[2]).toBe('split-text');
  expect(r.layouts[4]).toBe('split-text');
  expect(r.heads[2]).toMatch(/^2\.\s+Make eye contact/);
  expect(r.heads[4]).toMatch(/^4\.\s+Go close on one small thing/);
  expect(r.miss.count).toBe(0);
});

test('AQ2b with pictures: a redone slide the picture rescue moves to a picture layout still shows its list number (a real retry answered with statements whose caption left no room for it)', async ({ page }) => {
  const r: any = await deck(page, 'statement', true);
  expect(r.calls).toBe(2);
  expect(r.retries.filter((x: any) => x.refused)).toEqual([]);
  expect(r.texts[2]).toMatch(/^2\.\s+make eye contact/i);
  expect(r.texts[4]).toMatch(/^4\.\s+go close on one small thing/i);
  expect(r.miss.count).toBe(0);
});

test('AQ3 the word rule: a cut is accepted, a new word or another slide is refused, an empty slide is refused; with keep on, a lost sentence is refused', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (TEXT) => {
    const G: any = await import('/src/carousel/retryGuard.ts');
    const old = { step: '2', title: 'Make eye contact.', body: 'A face looking straight at the viewer stops a thumb faster than any trick.', image: 'picture:p1#w=1&h=1' };
    return {
      same: G.retryKeepsWords(old, { headline: 'Make eye contact.', paragraph: 'A face looking straight at the viewer stops a thumb faster than any trick.' }, TEXT, true),
      cutOff: G.retryKeepsWords(old, { headline: 'Make eye contact.', paragraph: 'A face stops a thumb.' }, TEXT, false),
      cutOn: G.retryKeepsWords(old, { headline: 'Make eye contact.', paragraph: 'A face stops a thumb.' }, TEXT, true),
      invented: G.retryKeepsWords(old, { headline: 'Make real eye contact.', paragraph: 'A face looking straight at the viewer stops a thumb faster than any trick.' }, TEXT, false),
      other: G.retryKeepsWords(old, { headline: 'Frame inside a frame.' }, TEXT, false),
      twice: G.retryKeepsWords(old, { headline: 'Make eye contact eye contact.' }, TEXT, false),
      empty: G.retryKeepsWords(old, { headline: '' }, TEXT, false),
    };
  }, TEXT);
  expect(r.same.ok).toBe(true);
  expect(r.cutOff.ok).toBe(true);
  expect(r.cutOn.ok).toBe(false);
  expect(r.cutOn.why).toMatch(/left out a sentence of your text \("A face looking straight/);
  expect(r.invented.ok).toBe(false);
  expect(r.invented.why).toContain('"real"');
  expect(r.other.ok).toBe(false);
  expect(r.twice.ok, 'a word used more often than the slide had it').toBe(false);
  expect(r.empty.ok).toBe(false);
});

// the report: keepEverySentence is what happened; keepEverySentenceAsked is the switch
const T2 = "Most creators don't have a design problem. They have a time problem. You write a good post. Then the evening goes to dragging text boxes. The idea took ten minutes. The slides took the rest of the night. Paste your text and pick a look. Nothing reruns when you edit. Try it on your next post.";
const S = (layout: string, fields: Record<string, unknown>) => ({ layout, fields, accents: [] });
const FIVE_DROP = { title: 'Design problem', slides: [
  S('statement', { headline: "Most creators don't have a design problem.", caption: 'They have a time problem.' }),
  S('split-text', { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }),
  S('prose', { p1: 'The slides took the rest of the night.' }),
  S('statement', { headline: 'Paste your text and pick a look.' }),
  S('cta-button', { headline: 'Try it on your next post.', button: 'Follow for more' }),
] };
test('AQ4 the report: with "Keep every sentence" on and two sentences missing, keepEverySentence is false and keepEverySentenceAsked is true', async ({ page }) => {
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => r.fulfill({ json: { text: JSON.stringify(FIVE_DROP), ms: 5 } });
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(T2);
  await toStep(page, 2);
  await page.getByTestId('options').getByRole('combobox').first().selectOption('5');
  await expect(page.getByTestId('keep-sentences-switch')).toBeChecked();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(5, { timeout: 90_000 });
  await page.waitForTimeout(1500);
  const rp: any = await page.evaluate(async () => {
    const RP: any = await import('/src/reference/report.ts');
    const d = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc;
    return JSON.parse((await RP.buildReport({ doc: d, includeRefs: false, verdicts: {}, note: '' })).json);
  });
  expect(rp.sourceNotOnSlides.count).toBe(2);
  expect(rp.keepEverySentence).toBe(false);
  expect(rp.keepEverySentenceAsked).toBe(true);
});
