// The closing call to action (ZERO model calls; fake writers). Round R: a button label may only use words from the person's text, and a text with no real action closes with NO button (a
// statement or a statement card with every word of the closing): the generic labels ("Save this for later", "Follow for more", "Send this to a friend") are never added and are taken away when
// the writer gives one. A text with a real action keeps its own closing, and nothing is ever invented.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);
const NO_ACTION = fs.readFileSync('tests/image-engine/fixtures/prose-critique.txt', 'utf8');
const HEAVY = fs.readFileSync('tests/image-engine/fixtures/prose-heavy.txt', 'utf8');

test('writer prompt: no action means no button, a label only of the text\'s words, and the never-invent rule', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const pack = PR.presetPackFor('style-6', false);
    const style = D.styleFromPack(pack).style;
    const req: any = { text: 'A long critique of a product idea. '.repeat(20), slides: 7, tone: 'clear', format: 'carousel' };
    const lines = (p: string) => p.split('\n').filter((l) => /closing|call to action|button label/i.test(l)).join('\n');
    return { withHandle: lines(D.buildLibraryPrompt(req, { pack } as any, style, 'a look', 7, '@maya.designs')), noHandle: lines(D.buildLibraryPrompt(req, { pack } as any, style, 'a look', 7, '')) };
  });
  for (const p of [r.withHandle, r.noHandle]) {
    expect(p, 'no action: no button').toMatch(/If the text has NO real action, the closing has NO button/);
    expect(p, 'never a generic call to action').toMatch(/Never invent a call to action \("Follow for more", "Save this for later", "Send this to a friend"/);
    expect(p, 'a label only of the text\'s words').toMatch(/made ONLY of words from the text/);
    expect(p, 'a takeaway headline, never filler').toMatch(/never "Thanks for reading"/);
    expect(p).not.toMatch(/Use only these labels|counts as a miss|always win over a generic/);
  }
  expect(r.noHandle, 'no handle set: never a handle').toMatch(/number or handle\./);
  expect(r.withHandle).not.toContain('Follow @maya.designs');
});

test('validator: the three generic labels pass the action-phrase check; an invented link, an invented handle and a label over 4 words fail', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ NO_ACTION }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const ctx = { handle: '@maya.designs', text: NO_ACTION };
    const p = (label: string, c: any = ctx) => D.buttonProblem(label, c);
    return {
      generic: ['Save this for later', 'Follow for more', 'Send this to a friend'].map((l) => p(l)),
      otherHandle: p('Follow @someone.else'),
      link: p('Visit example.com'),
      bio: p('Link in bio'),
      offer: p('Get 50% off'),
      long: p('Come and read all of this now'),
      plain: p('Book a call'),
      closing: D.closingProblems({ layout: 'cta-button', fields: { headline: 'x', button: 'Follow @someone.else' }, accents: [] } as any, NO_ACTION, '@maya.designs').length,
    };
  }, { NO_ACTION });
  // (the action-phrase check is the shape of a label; Round R's own-words rule is the code's check after the writer, below)
  expect(r.generic).toEqual([null, null, null]);
  expect(r.otherHandle, 'an invented handle fails').toMatch(/not in the text|action phrase|punctuation/);
  expect(r.link, 'an invented link fails').toMatch(/not in the text/);
  expect(r.bio, 'link in bio fails').toMatch(/not in the text/);
  expect(r.offer, 'an invented number or offer fails').toMatch(/not in the text/);
  expect(r.long, 'a label over 4 words fails').toMatch(/words/);
  expect(r.plain).toBeNull();
  expect(r.closing, 'a button on a closing of a text with no action is a miss').toBeGreaterThan(0);
});

test('closing rule: no real action means no button (a plain statement is right); an invented label goes, the person\'s own words stay; every word of the closing stays', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ NO_ACTION, HEAVY }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const st = (layout: string, fields: any) => ({ layout, fields, accents: [] }) as any;
    const h = '@maya.designs';
    const withAction = 'Here is my checklist. Book a free call at example.com/call and we will go through it together.';
    const withContact = 'Questions? Write to hello@quickflip.com or call +1 415 555 0134.';
    const drop = (s: any, text: string) => { const o = D.dropInventedButtons([st('statement', { headline: 'Hook' }), s], text); return { spec: o.specs[1], trims: o.trims.length }; };
    return {
      heavyAction: D.textHasAction(HEAVY), critiqueAction: D.textHasAction(NO_ACTION), bookAction: D.textHasAction(withAction), contactAction: D.textHasAction(withContact),
      statementOk: D.closingProblems(st('statement', { headline: 'Build the smallest version' }), NO_ACTION, h).length,
      buttonMiss: D.closingProblems(st('cta-button', { headline: 'Build the smallest version', button: 'Follow for more' }), NO_ACTION, h).length,
      withActionLeft: D.closingProblems(st('cta-button', { headline: 'x', button: 'Book a free call' }), withAction, h).length,
      filler: D.closingProblems(st('statement', { headline: 'Thanks for reading' }), NO_ACTION, h).join(' | '),
      generic: drop(st('cta-button', { headline: 'Build the smallest version that tests the core assumption.', button: 'Follow for more', sub: 'Twenty people, one week.' }), NO_ACTION),
      statementStays: drop(st('statement', { headline: 'Build the smallest version.' }), NO_ACTION),
      own: drop(st('cta-button', { headline: 'Book your call.', button: 'Book a free call' }), withAction),
      invented: drop(st('cta-button', { headline: 'Book your call.', button: 'Get the guide' }), withAction),
      pair: drop(st('cta-pair', { headline: 'Two ways in', button1: 'Follow for more', button2: 'Save this for later', line1: 'Twenty people.', line2: 'One week.' }), NO_ACTION),
    };
  }, { NO_ACTION, HEAVY });
  expect([r.heavyAction, r.critiqueAction], 'the two no-action fixtures have no real action').toEqual([false, false]);
  expect([r.bookAction, r.contactAction], 'a booking link, an email and a phone number are real').toEqual([true, true]);
  expect(r.statementOk, 'no action: a plain statement closing is right').toBe(0);
  expect(r.buttonMiss, 'no action: a button is a miss').toBeGreaterThan(0);
  expect(r.withActionLeft, 'with a real action nothing is enforced here').toBe(0);
  expect(r.filler).toMatch(/takeaway/);
  // the generic label goes: a statement card with the headline and the line under it, no button
  expect(r.generic.spec.layout).toBe('statement-card');
  expect(r.generic.spec.fields).toEqual({ headline: 'Build the smallest version that tests the core assumption.', caption: 'Twenty people, one week.' });
  expect(r.generic.trims).toBe(1);
  expect(r.statementStays.trims).toBe(0);
  // a label of the person's own words stays; an invented one is replaced by the action the text asks for, in its own words
  expect(r.own.spec.fields.button).toBe('Book a free call');
  expect(r.own.trims).toBe(0);
  expect(r.invented.spec.fields.button).toBe('Book a free call');
  expect(r.invented.spec.fields.headline).toBe('Book your call.');
  expect(r.invented.trims).toBe(1);
  // two invented buttons: the closing keeps every other word, no button
  expect(r.pair.spec.fields.button1).toBeUndefined();
  expect(JSON.stringify(r.pair.spec.fields)).toContain('Twenty people.');
  expect(JSON.stringify(r.pair.spec.fields)).toContain('One week.');
});

test('the deck maker: a generic button the writer gives is taken away by the code (one writer call), on style-5 too; a plain statement closing stays; a real action keeps its closing', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ NO_ACTION }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const body = [
      { layout: 'statement', fields: { headline: 'Test the core assumption first' }, accents: [] },
      { layout: 'split-text', fields: { headline: 'The idea in one sentence', paragraph: 'A quiz finds your procrastination type.' }, accents: [] },
      { layout: 'comparison', fields: { title: 'Two different jobs', leftLabel: 'Todo app', leftText: 'A task in 3 taps', rightLabel: 'Coaching', rightText: 'Time invested for change' }, accents: [] },
      { layout: 'big-stat', fields: { number: '10-15', label: 'minutes before the aha moment' }, accents: [] },
      { layout: 'stepper', fields: { title: 'A cheap test', steps: ['Take 20 people', 'Assign by hand', 'Send nudges'] }, accents: [] },
      { layout: 'numbered-list', fields: { title: 'Three flaws', items: ['Retention fades', 'Aha comes late', 'Positioning is confused'] }, accents: [] },
    ];
    const run = async (preset: string, closings: any[], text: string) => {
      let calls = 0;
      const provider: any = { id: 'dev-cli', label: 'fake', async write() { const c = closings[Math.min(calls, closings.length - 1)]; calls++; return { text: JSON.stringify({ title: 'T', slides: calls === 1 ? [...body, c] : { '7': c } }), ms: 1 }; } };
      const res: any = await D.designLibraryDeck({ text, slides: 7, tone: 'clear', format: 'carousel', styleChoice: preset, styles: [] }, { pack: PR.presetPackFor(preset, false) as any }, '@maya.designs', provider, new AbortController().signal);
      const lib = res.designed.library;
      const last = lib.plan.specs[lib.plan.specs.length - 1];
      return { calls, last: { layout: last.layout, fields: last.fields }, retries: lib.retries.map((q: any) => q.slide), trims: (lib.trims ?? []).filter((t: any) => t.field === 'invented button').map((t: any) => `${t.from} -> ${t.to}`), slides: Object.keys(res.designed.slides).length };
    };
    const stmt = { layout: 'statement', fields: { headline: 'Build the smallest version that tests it.' }, accents: [] };
    const btn = { layout: 'cta-button', fields: { headline: 'Build the smallest version that tests it.', button: 'Follow for more' }, accents: [] };
    const action = { layout: 'cta-button', fields: { headline: 'Book your free call today', button: 'Book a free call' }, accents: [] };
    const withAction = NO_ACTION + ' Book a free call at example.com/call.';
    return {
      generic: await run('style-6', [btn], NO_ACTION),
      plain: await run('style-6', [stmt], NO_ACTION),
      style5: await run('style-5', [btn], NO_ACTION),
      realAction: await run('style-4', [action], withAction),
    };
  }, { NO_ACTION });
  expect(r.generic.calls).toBe(1);
  expect(r.generic.retries).toEqual([]);
  expect(['statement-card', 'statement']).toContain(r.generic.last.layout);
  expect(r.generic.last.fields.headline).toBe('Build the smallest version that tests it.');
  expect(r.generic.last.fields.button).toBeUndefined();
  expect(JSON.stringify(r.generic.last.fields)).not.toMatch(/Follow for more/);
  expect(r.generic.trims.length).toBe(1);
  expect(r.plain.calls).toBe(1);
  expect(r.plain.last.fields.button).toBeUndefined();
  expect(r.plain.trims).toEqual([]);
  // style-5 closes on a statement card: no caption label is added either
  expect(r.style5.last.layout).toBe('statement-card');
  expect(JSON.stringify(r.style5.last.fields)).not.toMatch(/Follow for more/);
  // a text with a real action: its own closing, untouched
  expect(r.realAction.calls).toBe(1);
  expect(r.realAction.last.fields.button).toBe('Book a free call');
  expect(r.realAction.trims).toEqual([]);
  for (const k of ['generic', 'plain', 'style5', 'realAction'] as const) expect((r as any)[k].slides, `${k}: 7 slides drawn`).toBe(7);
});
