// Round 7b: the real "second brain" text. The closing the writer gave ("Comment brain" + the sub line) is faithful to the source and must be kept: ONE writer call, no retry.
// Also: action detection in any phrasing (last sentences first), no false positives mid-text, the highlight length clamp, the report's source text and raw writer closing.
// A fake writer only: ZERO real model calls. Screenshots: out/closing-fix2/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);
const OUT = 'out/closing-fix2';

/** The real text the person typed, line breaks included. */
export const SOURCE = `Your brain is the worst place to store your life. Here are the three things I did to fix it, and the third is one that almost nobody does. Your brain doesn't just hold things. It keeps things running.

Every unfinished task, every open loop is a background process that's draining you all day. That's why you're tired even on days that you barely did anything. Firstly, I moved everything from health, business, admin, habits, and my whole personal life into a structured second brain.

Give it a structure so that it resurfaces at the right moment. Think of it as a wiki, not just as a notes graveyard that you will never, ever open. Next, I give it as much context of me as possible. The more context it has, the more personalized the answer,

and this is what makes it better than just using ChatGPT or Claude. Give the following prompt for your second brain to continuously learn about you. And lastly, the one that almost nobody does is I don't just ask it for things. I let it work for me.

It proactively nudges me when it loop needs me, reminds me before every meeting, tracks what's waiting on who, and I think that's the main jump from a notes app into an actual second brain. So if you want to build your own, comment brain,

and I'll send you a document to get started.`;

const CLOSING = { layout: 'cta-button', fields: { headline: 'Build your own second brain', button: 'Comment brain', sub: "I'll send you a document to get started." }, accents: [] as string[] };
const BODY = [
  { layout: 'split-text', fields: { headline: 'Your brain is the worst place to store your life', paragraph: 'Here are the three things I did to fix it.' }, accents: [] as string[] },
  { layout: 'statement', fields: { headline: 'Your brain keeps things running' }, accents: ['keeps things running'] },
  { layout: 'checklist', fields: { title: 'What I did', items: ['Moved everything into a structure', 'Gave it as much context as possible', 'Let it work for me'] }, accents: [] as string[] },
  { layout: 'big-stat', fields: { number: '3', label: 'things I did' }, accents: [] as string[] },
  { layout: 'comparison', fields: { title: 'Notes app or second brain', leftLabel: 'Notes app', leftText: 'A graveyard you never open.', rightLabel: 'Second brain', rightText: 'A wiki that resurfaces.' }, accents: [] as string[] },
  { layout: 'quote', fields: { quote: 'I let it work for me.' }, accents: [] as string[] },
];

/** Runs the deck maker with a fake writer; returns what the app ended up with. `shots` are slide indexes (0-based) drawn to PNG. */
async function run(page: Page, o: { preset: string; text: string; closing: any; body?: any[]; handle?: string; shots?: number[] }) {
  await page.goto('/images/carousel');
  return page.evaluate(async ({ preset, text, closing, body, handle, shots }) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const F: any = await import('/src/reference/faithful.ts');
    let calls = 0;
    let firstPrompt = '';
    const provider: any = { id: 'dev-cli', label: 'fake', async write(prompt: string) { calls++; if (calls === 1) firstPrompt = prompt; return { text: JSON.stringify({ title: 'Second brain', slides: calls === 1 ? [...body, closing] : { '7': closing } }), ms: 1 }; } };
    const res: any = await D.designLibraryDeck({ text, slides: 7, tone: 'clear', format: 'carousel', styleChoice: preset, styles: [] }, { pack: PR.presetPackFor(preset, false) as any }, handle, provider, new AbortController().signal);
    const lib = res.designed.library;
    const last = lib.plan.specs[lib.plan.specs.length - 1];
    const pngs: Record<string, string> = {};
    for (const i of shots) {
      const svg: string = res.designed.slides[String(i)]?.built?.svg ?? '';
      if (!svg) continue;
      const blob: Blob = await F.svgToPng(svg, 540);
      const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); pngs[String(i)] = btoa(t);
    }
    return { calls, last: { layout: last.layout, fields: last.fields }, specs: lib.plan.specs.map((s: any) => ({ layout: s.layout, accents: s.accents })), retries: lib.retries.map((q: any) => q.slide), trims: (lib.trims ?? []).map((t: any) => ({ ...t })), notes: res.designed.notes as string[], adjustments: lib.codeAdjustments as string[], writerClosing: lib.writerClosing, slides: Object.keys(res.designed.slides).length, promptHasText: firstPrompt.includes("comment brain,") && firstPrompt.includes('and I\'ll send you a document to get started.') && firstPrompt.includes('Your brain is the worst place'), promptHasHighlightLine: firstPrompt.includes('Highlight 1 or 2 words, the ones that carry the point'), pngs };
  }, { preset: o.preset, text: o.text, closing: o.closing, body: o.body ?? BODY, handle: o.handle ?? '', shots: o.shots ?? [] });
}
const save = (name: string, png?: string) => { if (!png) return; fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(png, 'base64')); };

// ----- A: the real deck -----
for (const preset of ['style-4', 'film-paper']) {
  test(`A (${preset}): the real second-brain text: the writer's "Comment brain" closing and its sub line are kept, ONE writer call, no retry`, async ({ page }) => {
    const r = await run(page, { preset, text: SOURCE, closing: CLOSING, shots: [1, 6] });
    save(`closing-${preset}`, r.pngs['6']);
    expect(r.promptHasText, 'the writer receives the whole text, including the last sentence').toBe(true);
    expect(r.last.layout).toBe('cta-button');
    expect(r.last.fields.button, JSON.stringify(r.notes)).toBe('Comment brain');
    expect(r.last.fields.sub).toBe("I'll send you a document to get started.");
    expect(r.calls, 'one writer call: ' + JSON.stringify(r.notes)).toBe(1);
    expect(r.retries, 'no retry').toEqual([]);
    expect(r.trims.filter((t: any) => /closing/.test(t.field)), 'the closing is not trimmed').toEqual([]);
    expect(r.slides).toBe(7);
  });
}

test('A: what the detector returns for the last sentence, and for the whole text, in the lines of the real text', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (src) => {
    const C: any = await import('/src/carousel/closingAction.ts');
    const D: any = await import('/src/carousel/designLibrary.ts');
    const last = 'So if you want to build your own, comment brain,\n\nand I\'ll send you a document to get started.';
    return { last: C.sourceAction(last)?.label ?? null, whole: C.sourceAction(src)?.label ?? null, has: D.textHasAction(src), phrase: C.labelIsSourcePhrase('Comment brain', src), notPhrase: C.labelIsSourcePhrase('Comment genius', src) };
  }, SOURCE);
  expect(r.last).toBe('Comment brain');
  expect(r.whole).toBe('Comment brain');
  expect(r.has).toBe(true);
  expect(r.phrase).toBe(true);
  expect(r.notPhrase).toBe(false);
});

// ----- B: any phrasing, last sentences first -----
test('B: an action in any phrasing is found, the label is built from its words (24 characters at most)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const C: any = await import('/src/carousel/closingAction.ts');
    const pre = 'Most people save notes and never open them again. A second brain fixes that. ';
    const t = (s: string) => C.sourceAction(pre + s)?.label ?? null;
    return {
      a: t('Comment brain and I will send it.'),
      b: t('So if you want it, comment brain,\n\nand I will send it.'),
      c: t('Comment the word brain and I will send it.'),
      d: t('Comment BRAIN below.'),
      e: t('Drop brain in the comments and I will send it.'),
      f: t('Type brain and I will send it.'),
      g: t('DM me guide and I will send it.'),
      h: t('Reply with PLAN and I will send it.'),
      i: t('The link in bio has it.'),
      j: t('Sign up for the waitlist.'),
      k: t('Please subscribe to the newsletter.'),
      l: t('Follow me for more.'),
      m: t('Download the guide today.'),
      n: t('Book a call with me.'),
      quoted: t('Comment "brain" and I will send it.'),
      // strong forms count anywhere, not only at the end
      strongEarly: C.sourceAction('DM me GUIDE for the template. ' + pre + pre + pre)?.label ?? null,
      // the unclear forms in the middle of a long text are not a call to action
      weakEarly: C.sourceAction('Follow me for more. ' + pre + pre + pre + 'Keep going.')?.label ?? null,
      max: Math.max(...['Comment BRAIN below.', 'Book a call with me.'].map((s) => (C.sourceAction(pre + s)?.label ?? '').length)),
    };
  });
  expect(r).toMatchObject({ a: 'Comment brain', b: 'Comment brain', c: 'Comment brain', d: 'Comment BRAIN', e: 'Drop brain', f: 'Type brain', g: 'DM me guide', h: 'Reply PLAN', i: 'Tap link in bio', j: 'Sign up now', k: 'Subscribe now', l: 'Follow me', m: 'Download the guide', n: 'Book a call', quoted: 'Comment brain', strongEarly: 'DM me GUIDE' });
  expect(r.weakEarly).toBeNull();
  expect(r.max).toBeLessThanOrEqual(24);
});

test('B: false positives: "Follow the process", "Save time by writing it down", "share the load" in the middle of a text are not the closing button', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const C: any = await import('/src/carousel/closingAction.ts');
    const D: any = await import('/src/carousel/designLibrary.ts');
    const tail = ' A second brain is a habit. It is not a tool. It pays off over a month. That is the whole idea.';
    const texts = [
      'Follow the process step by step. Do not skip a step.' + tail,
      'Save time by writing it down first. Then close the tab.' + tail,
      'You can share the load with your team. Nobody does it alone.' + tail,
      'Follow the process step by step. Save time by writing it down first. Share the load with your team.',
    ];
    return texts.map((x) => ({ action: C.sourceAction(x)?.label ?? null, has: D.textHasAction(x) }));
  });
  for (const x of r) { expect(x.action).toBeNull(); expect(x.has).toBe(false); }
});

test('B: a text with no action: a generic label, and a sub line that is not in the text is always dropped (one writer call)', async ({ page }) => {
  const noAction = SOURCE.replace(/So if you want to build your own, comment brain,\s+and I'll send you a document to get started\./, 'That is the whole idea.');
  expect(noAction).not.toMatch(/comment brain/);
  const r = await run(page, { preset: 'style-4', text: noAction, closing: { layout: 'cta-button', fields: { headline: 'Build your own second brain', button: 'Comment brain', sub: 'Grab my free ebook today.' }, accents: [] } });
  expect(['Save this for later', 'Follow for more', 'Send this to a friend']).toContain(r.last.fields.button);
  expect(r.last.fields.sub, 'not in the text: dropped').toBeUndefined();
  expect(r.calls, 'one writer call, whatever the closing was: ' + JSON.stringify(r.notes)).toBe(1);
  expect(r.retries).toEqual([]);
  expect(r.writerClosing, 'the report keeps what the writer gave').toMatchObject({ button: 'Comment brain', sub: 'Grab my free ebook today.' });
});

test('D: a closing that breaks the rule never costs a second writer call: the code settles it', async ({ page }) => {
  const noAction = SOURCE.replace(/So if you want to build your own, comment brain,\s+and I'll send you a document to get started\./, 'That is the whole idea.');
  const r = await run(page, { preset: 'film-paper', text: noAction, closing: { layout: 'statement', fields: { headline: 'Build your own second brain' }, accents: [] } });
  expect(r.calls).toBe(1);
  expect(r.last.layout).toBe('cta-button');
  expect(['Save this for later', 'Follow for more', 'Send this to a friend']).toContain(r.last.fields.button);
  expect(r.slides).toBe(7);
});

// ----- C: the highlight length -----
test('C: a highlight is 1 or 2 words (3 on a headline of 8 or more), never half of the headline; the LAST words are kept; the writer prompt says so', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const mk = (headline: string, accents: string[]) => ({ layout: 'statement', fields: { headline }, accents });
    const c = (headline: string, accents: string[]) => D.clampAccents([mk(headline, accents)]).specs[0].accents;
    return {
      brain: c('Your brain keeps things running', ['keeps things running']),
      two: c('Your brain keeps things running', ['things running']),
      long8: c('Your brain is the worst place to store your life', ['worst place to store']),
      long8ok: c('Your brain is the worst place to store your life', ['worst place']),
      three: c('Stop treating your notes like a graveyard', ['treating your notes']),
      short4: c('Build your own brain', ['own brain']),
      half: c('Build your brain', ['your brain']),
      one: c('Brain', ['Brain']),
      many: c('Your brain keeps things running', ['Your brain keeps', 'running']),
    };
  });
  expect(r.brain).toEqual(['things running']);
  expect(r.two).toEqual(['things running']);
  expect(r.long8).toEqual(['place to store']);
  expect(r.long8ok).toEqual(['worst place']);
  expect(r.three).toEqual(['your notes']);
  expect(r.short4).toEqual(['own brain']);
  expect(r.half).toEqual(['brain']);
  expect(r.one).toEqual(['Brain']);
  expect(r.many).toEqual(['brain keeps', 'running']);
});

test('C: in the deck the writer\'s long highlight is clamped; slide 2 is drawn with the short one; the prompt carries the line', async ({ page }) => {
  const r = await run(page, { preset: 'style-4', text: SOURCE, closing: CLOSING, shots: [1] });
  save('slide2-style-4-clamped', r.pngs['1']);
  expect(r.promptHasHighlightLine).toBe(true);
  const s2 = r.specs[1];
  expect(s2.accents).toEqual(['things running']);
  expect(r.trims.some((t: any) => t.field === 'highlight')).toBe(true);
  expect(r.adjustments.join(' ')).toMatch(/highlight "keeps things running" was longer than 2 words/);
});

test('C: a highlight the person typed (a pasted script) is never changed', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const Sc: any = await import('/src/carousel/script.ts');
    const script = JSON.stringify({ title: 'Brain', slides: [
      { type: 'cover', headline: 'Your brain keeps things running', highlight: 'keeps things running', sub: 'Three things I did.' },
      { type: 'content', headline: 'Give it a structure', body: 'So that it resurfaces at the right moment.' },
      { type: 'content', headline: 'Give it context', body: 'The more context it has, the better the answer.' },
      { type: 'closing', headline: 'Build your own second brain', cta: 'Comment brain' },
    ] });
    const parsed = Sc.validateScriptText(script, 'carousel').script;
    const made: any = await FS.libraryDeckFromScript(parsed, { pack: PR.presetPackFor('style-4', false), brief: '', hasPhoto: false, images: [], site: '' }, '');
    return made.designed.library.plan.specs[0].accents;
  });
  expect(r).toEqual(['keeps things running']);
});

// ----- E: the report file -----
test('E: report.json carries the text the person typed and the writer\'s raw closing', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ src, closing, body }) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const RP: any = await import('/src/reference/report.ts');
    const DOC: any = await import('/src/carousel/doc.ts');
    const provider: any = { id: 'dev-cli', label: 'fake', async write() { return { text: JSON.stringify({ title: 'Second brain', slides: [...body, { ...closing, fields: { ...closing.fields, button: 'Follow for more' } }] }), ms: 1 }; } };
    const res: any = await D.designLibraryDeck({ text: src, slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'style-4', styles: [] }, { pack: PR.presetPackFor('style-4', false) as any }, '', provider, new AbortController().signal);
    const doc: any = { ...DOC.emptyDoc('style-4'), version: 1, format: 'carousel', style: 'style-4', topic: src, options: { slides: 7, tone: 'clear', autoStyle: false, handle: '', platform: null }, script: res.script, choices: {}, designed: res.designed };
    const rep = JSON.parse((await RP.buildReport({ doc, includeRefs: false, verdicts: {}, note: '' })).json);
    return { sourceText: rep.sourceText, writerClosing: rep.designed.library.writerClosing, button: res.designed.library.plan.specs[6].fields.button };
  }, { src: SOURCE, closing: CLOSING, body: BODY });
  expect(r.sourceText).toBe(SOURCE);
  expect(r.writerClosing).toMatchObject({ layout: 'cta-button', headline: 'Build your own second brain', button: 'Follow for more', sub: "I'll send you a document to get started." });
  expect(r.button, 'the drawn closing is the action the text asks for').toBe('Comment brain');
});
