// Round 12 D: the report's wordingCheck (measure only). After a deck is made, every visible word of every slide is compared with the source text: the words the slides show that the text does
// not have, the slides that show one, and the share of words that match. The slides are never changed by it. A fake writer only: ZERO real model calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);
const routeSrc = fs.readFileSync('tests/image-engine/script-route.spec.ts', 'utf8');
const POST = routeSrc.slice(routeSrc.indexOf('export const POST = `') + 21, routeSrc.indexOf('`;\n\nconst IDS'));

test('wordingCheckOf: words not in the source, the slides that have them, the match percentage', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const RP: any = await import('/src/reference/report.ts');
    return {
      same: RP.wordingCheckOf('Save notes. Open them again.', ['Save notes.', 'Open them again.']),
      changed: RP.wordingCheckOf('Save notes. Open them again.', ['Save notes.', 'Reopen them quickly.']),
      curly: RP.wordingCheckOf("I'll send you the link.", ['I’ll send you the link.']),
      empty: RP.wordingCheckOf('', ['Some words']),
    };
  });
  expect(r.same).toMatchObject({ totalWords: 5, matchPercent: 100, wordsNotInSource: [], slidesWithChangedWording: [] });
  expect(r.changed.wordsNotInSource).toEqual(['reopen', 'quickly']);
  expect(r.changed.slidesWithChangedWording).toEqual([2]);
  expect(r.changed.matchPercent).toBe(60);
  expect(r.curly.matchPercent, 'a curly apostrophe is the same word').toBe(100);
  expect(r.empty.matchPercent, 'no source text: no percentage').toBeNull();
});

test('report.json carries wordingCheck for a deck from the writer: the changed words are listed and the slides are not touched', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (post) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const RP: any = await import('/src/reference/report.ts');
    const DOC: any = await import('/src/carousel/doc.ts');
    const slides = [
      { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
      { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }, accents: [] },
      { layout: 'numbered-list', fields: { title: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: [] },
      { layout: 'headline-card', fields: { headline: 'Change a headline and nothing reruns.', card: 'Switch the style and your words stay put.' }, accents: [] },
      { layout: 'statement-card', fields: { headline: 'Add your own pictures too.' }, accents: [] },
      { layout: 'statement', fields: { headline: 'I want you saying something worth swiping for.' }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." }, accents: [] },
    ];
    const provider: any = { id: 'dev-cli', label: 'fake', async write() { return { text: JSON.stringify({ title: 'Say Creator', slides }), ms: 1 }; } };
    const res: any = await D.designLibraryDeck({ text: post, slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'style-6', styles: [] }, { pack: PR.presetPackFor('style-6', false) as any }, '', provider, new AbortController().signal);
    const doc: any = { ...DOC.emptyDoc('style-6'), version: 1, format: 'carousel', style: 'style-6', topic: post, options: { slides: 7, tone: 'clear', autoStyle: false, handle: '', platform: null }, script: res.script, choices: {}, designed: res.designed };
    const before = JSON.stringify(res.script);
    const rep = JSON.parse((await RP.buildReport({ doc, includeRefs: false, verdicts: {}, note: '' })).json);
    return { wc: rep.wordingCheck, untouched: before === JSON.stringify(doc.script) };
  }, POST);
  console.log('wordingCheck', JSON.stringify({ ...r.wc, perSlide: undefined }));
  expect(r.untouched).toBe(true);
  expect(r.wc.totalWords).toBeGreaterThan(40);
  // "Add" (slide 5 says "Add your own pictures too." where the text says "You can add your own pictures too.") is in the source; the writer's own words that are not are listed
  expect(Array.isArray(r.wc.wordsNotInSource)).toBe(true);
  expect(Array.isArray(r.wc.slidesWithChangedWording)).toBe(true);
  expect(r.wc.matchPercent).toBeGreaterThan(80);
  expect(r.wc.matchPercent).toBeLessThanOrEqual(100);
  // the invented word of the fake writer ("the evening goes to dragging" is the source's words rearranged: "goes" is not in the text)
  expect(r.wc.wordsNotInSource).toContain('goes');
  expect(r.wc.slidesWithChangedWording).toContain(2);
});
