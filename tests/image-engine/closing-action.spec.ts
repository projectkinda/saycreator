// Round 7: the closing slide keeps a real call to action that is in the SOURCE text ("Comment "brain" and I'll send you the document."), never invents an offer, and reports its trims correctly.
// A fake writer only: ZERO real model calls. Screenshots: out/closing-fix/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);
const OUT = 'out/closing-fix';

export const BRAIN_SOURCE = 'Most people save notes and never open them again. A second brain fixes that. Capture one idea a day in a single place. Review it every Friday and link it to something you already know. Keep only what helps you act. Over a month you build a small wiki, not a notes graveyard. Comment "brain" and I\'ll send you the document.';
export const NO_ACTION_SOURCE = 'Most people save notes and never open them again. A second brain fixes that. Capture one idea a day in a single place. Review it every Friday and link it to something you already know. Keep only what helps you act. Over a month you build a small wiki, not a notes graveyard.';

/** Runs the deck maker with a fake writer that returns the given closing; returns what the app ended up with. */
async function run(page: Page, o: { preset: string; text: string; closing: any; handle?: string; body?: any[]; second?: any }) {
  await page.goto('/images/carousel');
  return page.evaluate(async ({ preset, text, closing, handle, body: bodyIn, second }) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const F: any = await import('/src/reference/faithful.ts');
    const body = bodyIn ?? [
      { layout: 'statement', fields: { headline: 'Your notes are not a second brain' }, accents: [] },
      { layout: 'split-text', fields: { headline: 'Saving is not keeping', paragraph: 'Most people save notes and never open them again.' }, accents: [] },
      { layout: 'checklist', fields: { title: 'A habit that works', items: ['Capture one idea a day', 'Review it every Friday', 'Link it to what you know'] }, accents: [] },
      { layout: 'big-stat', fields: { number: '1', label: 'idea a day, one place' }, accents: [] },
      { layout: 'comparison', fields: { title: 'Two ways to keep notes', leftLabel: 'Graveyard', leftText: 'Save everything, open nothing.', rightLabel: 'Small wiki', rightText: 'Keep only what helps you act.' }, accents: [] },
      { layout: 'quote', fields: { quote: 'A second brain fixes that.', author: 'The text' }, accents: [] },
    ];
    let calls = 0;
    const provider: any = { id: 'dev-cli', label: 'fake', async write() { calls++; return { text: JSON.stringify({ title: 'Second brain', slides: calls === 1 ? [...body, closing] : { '7': second ?? closing } }), ms: 1 }; } };
    const res: any = await D.designLibraryDeck({ text, slides: 7, tone: 'clear', format: 'carousel', styleChoice: preset, styles: [] }, { pack: PR.presetPackFor(preset, false) as any }, handle, provider, new AbortController().signal);
    const lib = res.designed.library;
    const last = lib.plan.specs[lib.plan.specs.length - 1];
    const svg: string = res.designed.slides['6']?.built?.svg ?? '';
    let png = '';
    if (svg) {
      const blob: Blob = await F.svgToPng(svg, 540);
      const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); png = btoa(t);
    }
    return { calls, last: { layout: last.layout, fields: last.fields }, retries: lib.retries.map((q: any) => q.slide), trims: (lib.trims ?? []).map((t: any) => ({ ...t })), notes: res.designed.notes as string[], adjustments: lib.codeAdjustments as string[], slides: Object.keys(res.designed.slides).length, png };
  }, { preset: o.preset, text: o.text, closing: o.closing, handle: o.handle ?? '', body: o.body, second: o.second });
}
const save = (name: string, png: string) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(png, 'base64')); };

const GENERIC = ['Save this for later', 'Follow for more', 'Send this to a friend'];

for (const [preset, tag] of [['film-paper', 'film-paper'], ['hot-flat', 'hot-flat']] as const) {
  test(`A1 (${tag}): the source says Comment "brain": the closing keeps "Comment brain" and its sub line, ONE writer call, no retry, no trim`, async ({ page }) => {
    const r = await run(page, { preset, text: BRAIN_SOURCE, closing: { layout: 'cta-button', fields: { headline: 'Build a second brain', button: 'Comment brain', sub: "I'll send you the document." }, accents: [] } });
    save(`a1-comment-brain-${tag}`, r.png);
    expect(r.calls, 'one writer call: ' + JSON.stringify(r.notes)).toBe(1);
    expect(r.retries, 'no retry').toEqual([]);
    expect(r.last.layout).toBe('cta-button');
    expect(r.last.fields.button).toBe('Comment brain');
    expect(r.last.fields.sub).toBe("I'll send you the document.");
    expect(r.trims, 'nothing trimmed: ' + JSON.stringify(r.trims)).toEqual([]);
    expect(r.slides).toBe(7);
  });

  test(`A2 (${tag}): no action in the source: the closing is a generic label and the invented offer in the sub line is dropped`, async ({ page }) => {
    const r = await run(page, { preset, text: NO_ACTION_SOURCE, closing: { layout: 'cta-button', fields: { headline: 'Build a second brain', button: 'Comment brain', sub: "I'll send you a document to get started." }, accents: [] } });
    save(`a2-generic-${tag}`, r.png);
    expect(GENERIC, 'a generic label').toContain(r.last.fields.button);
    expect(r.last.fields.sub, 'the offer is not in the source, so the sub line is dropped').toBeUndefined();
    expect(JSON.stringify(r.last.fields)).not.toMatch(/document|get started/i);
    expect(JSON.stringify(r.last.fields)).not.toContain('(cta-button)');
    expect(r.slides).toBe(7);
  });
}

// ----- B: real-action detection from the source text -----
test('B: the action is read from the source text: comment (quoted or capitalised keyword), DM me, reply, send me, link in bio, sign up, subscribe, follow, save, share, download, book a call, join, click, tap, visit, try it, get the guide', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const C: any = await import('/src/carousel/closingAction.ts');
    const D: any = await import('/src/carousel/designLibrary.ts');
    const t = (s: string) => C.sourceAction(s)?.label ?? null;
    return {
      max: C.ACTION_LABEL_MAX,
      quoted: t('Comment "brain" and I\'ll send you the document.'),
      curly: t('Comment “brain” below.'),
      plain: t('Then comment brain and I will send it.'),
      caps: t('Comment GUIDE below and I will reply.'),
      below: t('Comment below.'),
      dm: t('DM me GUIDE for the template.'),
      dmPlain: t('Want it? DM me.'),
      reply: t('Reply YES and I will send it.'),
      sendMe: t('Send me a message and I will help.'),
      bio: t('The link in bio has the full list.'),
      linkBelow: t('The link below has the full list.'),
      signUp: t('Sign up for the waitlist.'),
      subscribe: t('Please subscribe to the newsletter.'),
      follow: t('Follow @maya.designs for more.'),
      save: t('Save this for later.'),
      share: t('Share this with a friend.'),
      download: t('Download the checklist today.'),
      book: t('Book a free call with me.'),
      join: t('Join the waitlist today.'),
      click: t('Click the link to start.'),
      tap: t('Tap the link below.'),
      visit: t('Visit quickflip.com today.'),
      tryIt: t('Try it free for a week.'),
      getGuide: t('Get the guide and start today.'),
      // not actions
      noun: t('His comment on the post was kind. The comments section is quiet.'),
      follows: t('Follow the steps in order and you will finish.'),
      plainText: t('Most people save notes and never open them again.'),
      lastWins: t('Follow me. Then comment "brain" below.'),
      has: [D.textHasAction('Comment "brain" and I\'ll send you the document.'), D.textHasAction('Most people save notes and never open them again.'), D.textHasAction('DM me GUIDE')],
    };
  });
  expect(r.max).toBe(24);
  expect(r.quoted).toBe('Comment brain');
  expect(r.curly).toBe('Comment brain');
  expect(r.plain).toBe('Comment brain');
  expect(r.caps).toBe('Comment GUIDE');
  expect(r.below).toBe('Comment below');
  expect(r.dm).toBe('DM me GUIDE');
  expect(r.dmPlain).toBe('DM me');
  expect(r.reply).toBe('Reply YES');
  expect(r.sendMe).toBe('Message me');
  expect(r.bio).toBe('Tap link in bio');
  expect(r.linkBelow).toBe('Tap the link below');
  expect(r.signUp).toBe('Sign up now');
  expect(r.subscribe).toBe('Subscribe now');
  expect(r.follow).toBe('Follow @maya.designs');
  expect(r.save).toBe('Save this post');
  expect(r.share).toBe('Share this post');
  expect(r.download).toBe('Download the checklist');
  expect(r.book).toBe('Book a free call');
  expect(r.join).toBe('Join the waitlist');
  expect(r.click).toBe('Click the link');
  expect(r.tap).toBe('Tap the link below');
  expect(r.visit).toBe('Visit quickflip.com');
  expect(r.tryIt).toBe('Try it free');
  expect(r.getGuide).toBe('Get the guide');
  for (const k of ['noun', 'follows', 'plainText']) expect((r as any)[k], `${k} is not a call to action`).toBeNull();
  expect(r.lastWins, 'the last action of the text is the closing action').toBe('Comment brain');
  expect(r.has).toEqual([true, false, true]);
});

test('B: a closing label that is a real action from the source is kept; a generic or invented one is replaced by the action\'s own words', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ BRAIN_SOURCE }) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const st = (fields: any) => [{ layout: 'statement', fields: { headline: 'Hook' }, accents: [] }, { layout: 'cta-button', fields: { headline: 'Build a second brain', ...fields }, accents: [] }] as any;
    const last = (specs: any) => D.settleClosing(specs, BRAIN_SOURCE);
    return {
      kept: last(st({ button: 'Comment brain' })),
      keptOwn: last(st({ button: 'Comment brain below' })),
      generic: last(st({ button: 'Follow for more' })),
      invented: last(st({ button: 'Get the checklist' })),
    };
  }, { BRAIN_SOURCE });
  expect(r.kept.trims, 'a real action label is left alone').toEqual([]);
  expect(r.kept.specs[1].fields.button).toBe('Comment brain');
  expect(r.keptOwn.specs[1].fields.button, 'a label whose words are all in the text is kept as it is').toBe('Comment brain below');
  expect(r.generic.specs[1].fields.button, 'a generic label where the text asks for something').toBe('Comment brain');
  expect(r.invented.specs[1].fields.button, 'a label with an action the text does not ask for').toBe('Comment brain');
  for (const k of ['generic', 'invented'] as const) {
    expect(r[k].trims).toHaveLength(1);
    expect(r[k].trims[0].max, 'no length limit is quoted for a replaced label').toBe(0);
  }
});

// ----- C: the sub line may only use words that are in the source -----
test('C: a sub line only keeps words that are in the source (small function words allowed); an offer, a link, a number or a promise is dropped, on every closing', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ BRAIN_SOURCE, NO_ACTION_SOURCE }) => {
    const C: any = await import('/src/carousel/closingAction.ts');
    const D: any = await import('/src/carousel/designLibrary.ts');
    const mk = (layout: string, fields: any) => [{ layout: 'statement', fields: { headline: 'Hook' }, accents: [] }, { layout, fields, accents: [] }] as any;
    return {
      yes: C.inSource("I'll send you the document.", BRAIN_SOURCE),
      yesSmall: C.inSource('Keep only what helps you act.', BRAIN_SOURCE),
      noOffer: C.inSource("I'll send you a document to get started.", NO_ACTION_SOURCE),
      noNumber: C.inSource('Early backers save 30%.', BRAIN_SOURCE),
      noLink: C.inSource('Read more at quickflip.com/guide', BRAIN_SOURCE),
      empty: C.inSource('', BRAIN_SOURCE),
      button: D.settleClosing(mk('cta-button', { headline: 'Build a second brain', button: 'Comment brain', sub: 'A free 30-page guide is on its way.' }), BRAIN_SOURCE),
      contact: D.settleClosing(mk('contact-closing', { headline: 'Say hello', contacts: ['@maya', 'maya.com'], line: 'We reply within one hour.' }), BRAIN_SOURCE),
      pair: D.settleClosing(mk('cta-pair', { headline: 'Two ways', button1: 'Comment brain', button2: 'Follow me', line1: 'I\'ll send you the document.', line2: 'A bonus video is included.' }), BRAIN_SOURCE),
      generic: D.ensureGenericClosing(mk('statement', { headline: 'A second brain fixes that.', caption: 'Twenty people, one week.' }), NO_ACTION_SOURCE, '', false),
    };
  }, { BRAIN_SOURCE, NO_ACTION_SOURCE });
  expect([r.yes, r.yesSmall, r.empty]).toEqual([true, true, true]);
  expect([r.noOffer, r.noNumber, r.noLink]).toEqual([false, false, false]);
  expect(r.button.specs[1].fields.sub, 'cta-button: the invented offer goes').toBeUndefined();
  expect(r.button.specs[1].fields.button).toBe('Comment brain');
  expect(r.contact.specs[1].fields.line, 'contact-closing: the invented promise goes').toBeUndefined();
  expect(r.pair.specs[1].fields.line1, 'cta-pair: a line from the text stays').toBe("I'll send you the document.");
  expect(r.pair.specs[1].fields.line2, 'cta-pair: an invented line goes').toBeUndefined();
  // the generic fallback keeps the caption as the sub line, and the closing rule then drops it (the words are not in the source)
  expect(r.generic.specs[1].fields.sub).toBe('Twenty people, one week.');
});

// ----- D: the trim report -----
test('D: the closing report says what happened in words: no "over its limit of 20", no "(cta-button)" in any label, and a label that fits is never changed', async ({ page }) => {
  const r = await run(page, { preset: 'film-paper', text: NO_ACTION_SOURCE, closing: { layout: 'statement', fields: { headline: 'Build a second brain' }, accents: [] } });
  const all = [...r.notes, ...r.adjustments].join('\n');
  expect(all).not.toMatch(/over its limit of 20/);
  expect(all).not.toContain('(cta-button)');
  expect(JSON.stringify(r.last.fields)).not.toContain('(cta-button)');
  expect(GENERIC).toContain(r.last.fields.button);
  expect(r.adjustments.join('\n'), 'the report names the generic label').toMatch(/the closing had no call to action, so the code made it "(Save this for later|Follow for more|Send this to a friend)"/);
  // a label of 13 characters that fits (the evidence deck) is reported with no limit and never trimmed
  const kept = await run(page, { preset: 'film-paper', text: BRAIN_SOURCE, closing: { layout: 'cta-button', fields: { headline: 'Build a second brain', button: 'Comment brain', sub: "I'll send you the document." }, accents: [] } });
  expect(kept.last.fields.button).toBe('Comment brain');
  expect(kept.adjustments.join('\n')).not.toMatch(/limit of/);
  // a closing the writer got wrong on a text with an action: the code uses the action's own words and says so
  const fixed = await run(page, { preset: 'film-paper', text: BRAIN_SOURCE, closing: { layout: 'cta-button', fields: { headline: 'Build a second brain', button: 'Follow for more' }, accents: [] } });
  expect(fixed.last.fields.button).toBe('Comment brain');
  expect(fixed.adjustments.join('\n')).toMatch(/was not the call to action the text asks for, so the code used "Comment brain"/);
  expect(fixed.adjustments.join('\n')).not.toContain('(cta-button)');
});

// ----- E: the call count -----
test('E: a source with a real action and a writer that follows the closing rule: exactly 1 writer call, in three styles; a writer that breaks the rule gets no second call either (the code settles the closing)', async ({ page }) => {
  for (const preset of ['film-paper', 'hot-flat', 'style-6']) {
    const r = await run(page, { preset, text: BRAIN_SOURCE, closing: { layout: 'cta-button', fields: { headline: 'Build a second brain', button: 'Comment brain', sub: "I'll send you the document." }, accents: [] } });
    expect(r.calls, `${preset}: one call`).toBe(1);
    expect(r.retries, `${preset}: no retry`).toEqual([]);
  }
  // no action in the source, the writer closes on a plain statement: asked once more (by design), the answer is used
  const retried = await run(page, { preset: 'film-paper', text: NO_ACTION_SOURCE, closing: { layout: 'statement', fields: { headline: 'Build a second brain' }, accents: [] }, second: { layout: 'cta-button', fields: { headline: 'Build a second brain', button: 'Save this for later' }, accents: [] } });
  expect(retried.calls).toBe(1);
  expect(retried.retries).toEqual([]);
  expect(GENERIC).toContain(retried.last.fields.button);
});

// ----- F1: a highlight box never covers the punctuation after the marked word -----
test('F1: the highlight bar keeps equal padding and the comma after the marked word sits clear of it', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    const FN: any = await import('/src/image-engine/fonts.ts');
    await FN.loadFonts();
    const font = D.styleFromPack(PR.presetPackFor('hot-flat', false)).style.fonts.headline;
    const text = 'Over a month you build a small wiki, not a notes graveyard.';
    const pad = 18;
    const lay = (phrase: string) => {
      const at = text.indexOf(phrase);
      return T.layoutText({ kind: 'text', id: 'm', name: 'm', role: 'content', x: 0, y: 0, width: 900, height: 6000, rotation: 0, opacity: 1, text, balance: true, runs: [{ start: at, end: at + phrase.length, color: '#000000' }], style: { font, weight: 800, size: 110, color: '#000000', align: 'left', valign: 'top', lineHeight: 1.05 }, highlight: { words: phrase.split(' '), color: '#000000', textColor: '#000000', paddingX: pad, paddingY: 0, radius: 4, hugLine: true, ranges: [{ start: at, end: at + phrase.length }] } });
    };
    const probe = (phrase: string) => {
      const b = lay(phrase);
      const line = b.lines.find((l: any) => l.marks.length);
      const mark = line.marks[0];
      const comma = line.segments.find((s: any) => s.text.startsWith(','));
      const wordSeg = line.segments.filter((s: any) => s.x < mark.x + mark.width + 1).at(-1);
      return { markRight: mark.x + mark.width + pad, markLeft: mark.x - pad, commaX: comma?.x ?? null, wordRight: wordSeg ? wordSeg.x + wordSeg.width : null, lineWidth: line.width, boxW: 900 };
    };
    return { wiki: probe('wiki'), small: probe('small wiki') };
  });
  for (const k of ['wiki', 'small'] as const) {
    const p = r[k];
    expect(p.commaX, `${k}: the comma is its own piece`).not.toBeNull();
    expect(p.commaX!, `${k}: the comma starts at or after the right edge of the bar (${p.commaX} vs ${p.markRight})`).toBeGreaterThanOrEqual(p.markRight - 0.5);
    expect(p.wordRight!, `${k}: the bar's right padding is the same as its left: the bar reaches ${p.markRight}, the word ends at ${p.wordRight}`).toBeLessThanOrEqual(p.markRight - 17.5);
    expect(p.lineWidth, `${k}: the line still fits its box`).toBeLessThanOrEqual(p.boxW);
  }
});

// ----- F2: step-numeral only for a sequence -----
test('F2: the writer prompt says step-numeral needs two or more steps; one lone step-numeral becomes split-text with the same words', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const style = D.styleFromPack(PR.presetPackFor('style-6', false)).style;
    const prompt = D.buildLibraryPrompt({ text: 'A text about habits. '.repeat(20), slides: 7, tone: 'clear', format: 'carousel' }, { pack: PR.presetPackFor('style-6', false) } as any, style, 'a look', 7, '');
    const step = (n: string, title: string, body: string) => ({ layout: 'step-numeral', fields: { step: n, title, body }, accents: [] }) as any;
    const st = (headline: string) => ({ layout: 'statement', fields: { headline }, accents: [] }) as any;
    return {
      line: prompt.split('\n').find((l: string) => l.includes('only when at least two slides')) ?? '',
      one: D.swapLoneStep([st('Hook'), step('1', 'Make it tiny', 'Do the smallest version first.'), st('End')]),
      two: D.swapLoneStep([st('Hook'), step('1', 'Make it tiny', 'Do the smallest version first.'), step('2', 'Set a time', 'Same time every day.')]),
      none: D.swapLoneStep([st('Hook'), st('End')]),
      tooLong: D.swapLoneStep([st('Hook'), step('1', 'Make it tiny', 'x '.repeat(200)), st('End')]),
    };
  });
  expect(r.line).toContain('Use "step-numeral" only when at least two slides in the deck are steps of one sequence');
  expect(r.line).toContain('"split-text" or "statement"');
  expect(r.one.specs[1].layout).toBe('split-text');
  expect(r.one.specs[1].fields).toEqual({ headline: 'Make it tiny', paragraph: 'Do the smallest version first.' });
  expect(r.one.trims).toHaveLength(1);
  expect(r.two.specs.map((s: any) => s.layout), 'two steps are a sequence: kept').toEqual(['statement', 'step-numeral', 'step-numeral']);
  expect(r.none.trims).toEqual([]);
  expect(r.tooLong.specs[1].layout, 'words that would not fit split-text: kept, nothing dropped').toBe('step-numeral');
});

test('F2: a deck the writer made with ONE step-numeral is drawn with split-text, every word kept; with two steps nothing changes', async ({ page }) => {
  const body = (steps: number) => [
    { layout: 'statement', fields: { headline: 'Your notes are not a second brain' }, accents: [] },
    { layout: 'step-numeral', fields: { step: '1', title: 'Make it tiny', body: 'Do the smallest version first.' }, accents: [] },
    ...(steps > 1 ? [{ layout: 'step-numeral', fields: { step: '2', title: 'Set a time', body: 'Same time every day.' }, accents: [] }] : [{ layout: 'checklist', fields: { title: 'A habit that works', items: ['Capture one idea a day', 'Review it every Friday', 'Link it to what you know'] }, accents: [] }]),
    { layout: 'big-stat', fields: { number: '1', label: 'idea a day, one place' }, accents: [] },
    { layout: 'comparison', fields: { title: 'Two ways to keep notes', leftLabel: 'Graveyard', leftText: 'Save everything, open nothing.', rightLabel: 'Small wiki', rightText: 'Keep only what helps you act.' }, accents: [] },
    { layout: 'quote', fields: { quote: 'A second brain fixes that.', author: 'The text' }, accents: [] },
  ];
  const closing = { layout: 'cta-button', fields: { headline: 'Build a second brain', button: 'Comment brain' }, accents: [] };
  const one: any = await run(page, { preset: 'hot-flat', text: BRAIN_SOURCE, closing, body: body(1) });
  const two: any = await run(page, { preset: 'hot-flat', text: BRAIN_SOURCE, closing, body: body(2) });
  expect(one.slides).toBe(7);
  expect(one.notes.concat(one.adjustments).join('\n')).toMatch(/only one slide in the deck is a step/);
  expect(two.adjustments.join('\n')).not.toMatch(/only one slide in the deck is a step/);
  expect(one.trims.some((t: any) => t.field === 'step swap')).toBe(true);
  expect(two.trims.some((t: any) => t.field === 'step swap')).toBe(false);
});

// ----- F3: the downloadable report shows the library layouts, not the old route's rules -----
test('F3: report.json of a deck the library drew lists the library layout of each slide and leaves out the old rule, because and palette lines', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const script = JSON.stringify({ title: 'Habits', slides: [
    { type: 'cover', headline: 'A habit starts smaller than you think', sub: 'Three ways to make it stick.' },
    { type: 'step', number: 1, headline: 'Make it tiny', body: 'Do the smallest version first, so starting is never a fight.' },
    { type: 'step', number: 2, headline: 'Set a time', body: 'Same time every day.' },
    { type: 'checklist', headline: 'Before you start', items: ['Pick one habit', 'Set a time', 'Tell a friend'] },
    { type: 'stat', value: '66', label: 'days to a new habit', note: 'on average' },
    { type: 'quote', quote: 'We are what we repeatedly do.', by: 'A wise coach' },
    { type: 'closing', headline: 'Start with one small step', cta: 'Save this for later' },
  ] });
  const r = await page.evaluate(async (script) => {
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const Sc: any = await import('/src/carousel/script.ts');
    const RP: any = await import('/src/reference/report.ts');
    const DOC: any = await import('/src/carousel/doc.ts');
    const parsed = Sc.validateScriptText(script, 'carousel').script;
    const made: any = await FS.libraryDeckFromScript(parsed, { pack: PR.presetPackFor('style-6', false), brief: '', hasPhoto: false, images: [], site: '' }, '');
    const doc: any = { ...DOC.emptyDoc('style-6'), version: 1, format: 'carousel', style: 'style-6', topic: '', options: { slides: 7, tone: 'clear', autoStyle: false, handle: '', platform: null }, script: made.script, choices: {}, designed: made.designed };
    const rep = JSON.parse((await RP.buildReport({ doc, includeRefs: false, verdicts: {}, note: '' })).json);
    return { slides: rep.slides.map((s: any) => ({ layout: s.layout, keys: Object.keys(s), drawnBy: s.drawnBy })), libLayouts: made.designed.library.layouts, text: JSON.stringify(rep.slides) };
  }, script);
  expect(r.slides).toHaveLength(7);
  r.slides.forEach((s: any, i: number) => {
    expect(s.layout, `slide ${i + 1} shows the library layout`).toBe(r.libLayouts[i]);
    expect(s.drawnBy).toBe('layout library');
    for (const k of ['rule', 'because', 'palette']) expect(s.keys, `slide ${i + 1} has no "${k}"`).not.toContain(k);
  });
  expect(r.text).not.toMatch(/content-bar|step-badge|because|the headline has \d+ words/);
});
