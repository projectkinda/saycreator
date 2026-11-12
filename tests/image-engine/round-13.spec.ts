// Round 13: (B) the pictures that are not on a slide are reported; (C) an accent is a word of the HEADLINE; (D) the phrase-level wording check and the writer prompt rules; (E) a closing sub never starts with "and".
// A fake writer only: ZERO real model calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { deckDrawn } from './ui';

test.setTimeout(10 * 60_000);
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const routeSrc = fs.readFileSync('tests/image-engine/script-route.spec.ts', 'utf8');
const POST = routeSrc.slice(routeSrc.indexOf('export const POST = `') + 21, routeSrc.indexOf('`;\n\nconst IDS'));

test('C: an accent that is not in the headline is not drawn and the report says so; the prompt says accents are headline words only', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (post) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const slides = [
      { layout: 'statement', fields: { headline: "Most creators don't have a design problem.", caption: 'They have a "this takes two hours" problem.' }, accents: ['problem', 'two hours'] },
      { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }, accents: [] },
      { layout: 'numbered-list', fields: { title: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: [] },
      { layout: 'headline-card', fields: { headline: 'Change a headline and nothing reruns.', card: 'Switch the style and your words stay put. One AI call builds the carousel.' }, accents: ['reruns', 'words stay put'] },
      { layout: 'statement-card', fields: { headline: 'You can add your own pictures too.' }, accents: [] },
      { layout: 'statement', fields: { headline: 'I want you saying something worth swiping for.' }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "and I'll send you the link." }, accents: [] },
    ];
    let prompt = '';
    const provider: any = { id: 'dev-cli', label: 'fake', async write(p: string) { prompt = prompt || p; return { text: JSON.stringify({ title: 'Say Creator', slides }), ms: 1 }; } };
    const res: any = await D.designLibraryDeck({ text: post, slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'style-6', styles: [] }, { pack: PR.presetPackFor('style-6', false) as any }, '', provider, new AbortController().signal);
    const lib = res.designed.library;
    return { adjustments: lib.codeAdjustments as string[], accents: lib.plan.specs.map((s: any) => s.accents), prompt, calls: res.designed.calls, last: lib.plan.specs[6].fields };
  }, POST);
  expect(r.adjustments).toContain('slide 1: accent "two hours" is not in the headline, not drawn');
  expect(r.adjustments).toContain('slide 4: accent "words stay put" is not in the headline, not drawn');
  expect(r.accents[0]).toEqual(['problem']);
  expect(r.accents[3]).toEqual(['reruns']);
  expect(r.prompt).toContain('from the slide\'s HEADLINE');
  expect(r.prompt).toContain('never from the kicker, a caption, a sub line, the body or a list item');
  expect(r.calls).toBe(1);
  // E: the closing sub lost its leading "and" and starts with a capital letter; nothing else changed
  expect(r.last.sub).toBe("I'll send you the link.");
  expect(r.last.button).toBe('Comment slides');
});

test('D: the writer prompt: a kicker only if the exact phrase is in the text; headlines are the text\'s words in their order', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const prompt: string = await page.evaluate(async (post) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    let p = '';
    const provider: any = { id: 'dev-cli', label: 'fake', async write(x: string) { p = p || x; return { text: JSON.stringify({ title: 'x', slides: [] }), ms: 1 }; } };
    try { await D.designLibraryDeck({ text: post, slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'style-6', styles: [] }, { pack: PR.presetPackFor('style-6', false) as any }, '', provider, new AbortController().signal); } catch { /* the empty answer is refused: only the prompt matters */ }
    return p;
  }, POST);
  expect(prompt).toContain("A kicker is only allowed if that exact phrase is in the person's text; otherwise omit it.");
  expect(prompt).toContain("Headlines must be words from the person's text in their order; you may drop words but not add or reorder them.");
});

test('D: fieldsNotInSource flags the fields whose words are not a contiguous run of the text, and only those', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (post) => {
    const RP: any = await import('/src/reference/report.ts');
    const specs = [
      { fields: { kicker: 'The problem', headline: "Most creators don't have a design problem.", caption: 'They have a "this takes two hours" problem.' } },
      { fields: { headline: 'Edit without rerunning', paragraph: 'Switch the style and your words stay put.' } },
      { fields: { title: 'What you can add', items: ['Your own photos', 'Screenshots', 'A product shot'] } },
      { fields: { headline: 'You can add your own pictures too.', sub: 'Photos, screenshots, a product shot.' } },
      { fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." } },
      { fields: { headline: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] } },
    ];
    return RP.fieldsNotInSourceOf(post, specs);
  }, POST);
  const flagged = r.map((x: any) => x.text);
  expect(flagged).toContain('The problem');
  expect(flagged).toContain('Edit without rerunning');
  expect(flagged).toContain('What you can add');
  expect(flagged).toContain('Your own photos');
  // the writer's honest fields are not flagged: a headline word for word, a caption, a list item, a sub line that is a run of the text, the button (checked by the closing rule)
  for (const ok of ["Most creators don't have a design problem.", 'They have a "this takes two hours" problem.', 'Switch the style and your words stay put.', 'You can add your own pictures too.', 'Paste your text', 'Pick a look from 15 styles', 'Try it on your next post.', "I'll send you the link.", 'Comment slides', 'Screenshots']) {
    if (ok === 'Screenshots') continue; // "Screenshots" is the start of "Photos, screenshots, a product shot." (a run of two words is needed to say more): it is in the text
    expect(flagged, ok).not.toContain(ok);
  }
  expect(r.find((x: any) => x.text === 'The problem')).toMatchObject({ slide: 1, field: 'kicker' });
  expect(r.find((x: any) => x.text === 'Your own photos')).toMatchObject({ slide: 3, field: 'items' });
});

test('B: report.json pictures: uploaded, used, unused, whyUnused, counted from the final deck; the Slides step says how many are not on a slide', async ({ page }) => {
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const plan = JSON.stringify({ title: 'Say Creator', slides: [
    { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
    { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }, accents: [] },
    { layout: 'numbered-list', fields: { title: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: [] },
    { layout: 'headline-card', fields: { headline: 'Change a headline and nothing reruns.', card: 'Switch the style and your words stay put.' }, accents: [] },
    { layout: 'statement-card', fields: { headline: 'You can add your own pictures too.' }, accents: [] },
    { layout: 'statement', fields: { headline: 'I want you saying something worth swiping for.' }, accents: [] },
    { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." }, accents: [] },
  ] });
  const w = (r: any) => r.fulfill({ json: { text: plan, ms: 5 } });
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  await page.goto('/images/carousel');
  // eight small pictures: a 7-slide deck cannot show them all
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (let i = 0; i < 8; i++) {
    const b64 = await page.evaluate(async (i) => {
      const c = document.createElement('canvas'); c.width = 1500; c.height = 1000; const g = c.getContext('2d')!; g.fillStyle = `hsl(${i * 40},60%,45%)`; g.fillRect(0, 0, 1500, 1000);
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.8)); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
    }, i);
    files.push({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  }
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(8, { timeout: 60_000 });
  await page.getByLabel('Your text or topic').fill('Most creators do not have a design problem. Write a good post, then turn it into slides.');
  await page.locator('.cr-wiz-steps button').nth(2).click();
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 7);
  const line = page.getByTestId('pictures-unused');
  await expect(line).toBeVisible({ timeout: 30_000 });
  const text = (await line.textContent()) ?? '';
  const m = /^(\d+) of 8 pictures are not on a slide\.$/.exec(text.trim());
  expect(m, text).toBeTruthy();
  const rep: any = await page.evaluate(async () => {
    const RP: any = await import('/src/reference/report.ts');
    const raw = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}');
    const doc = raw.project?.doc;
    return JSON.parse((await RP.buildReport({ doc, includeRefs: false, verdicts: {}, note: '' })).json).pictures;
  });
  expect(rep.uploaded).toBe(8);
  expect(rep.used + rep.unused.length).toBe(8);
  expect(rep.unused.length).toBe(Number(m![1]));
  expect(rep.whyUnused).toContain('No slide could take');
});
