// The closing call to action (ZERO model calls; fake writers): a text with no real action closes on a generic cta-button ("Save this for later", "Follow for more", "Send this to a friend"),
// a text with a real action keeps its own closing, a preset that closes on a statement card carries the label in the card's caption, and nothing is ever invented.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);
const NO_ACTION = fs.readFileSync('tests/image-engine/fixtures/prose-critique.txt', 'utf8');
const HEAVY = fs.readFileSync('tests/image-engine/fixtures/prose-heavy.txt', 'utf8');

test('writer prompt: the three generic labels, the handle rule and the never-invent rule', async ({ page }) => {
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
    expect(p).toContain('Save this for later');
    expect(p).toContain('Follow for more');
    expect(p).toContain('Send this to a friend');
    expect(p, 'never invent').toMatch(/Never invent a link, "link in bio", website, email, offer or number/);
    expect(p, 'a real action, two actions and contact details always win').toMatch(/always win over a generic call to action/);
    expect(p, 'a takeaway headline, never filler').toMatch(/never "Thanks for reading"/);
    expect(p, 'only these three').toMatch(/Use only these labels/);
    expect(p, 'a plain statement is a miss').toMatch(/counts as a miss/);
  }
  expect(r.withHandle, 'the handle that is set').toContain('Follow @maya.designs');
  expect(r.noHandle, 'no handle set: no @').toMatch(/no @, no handle/);
  expect(r.noHandle).not.toContain('Follow @');
});

test('validator: the three generic labels pass; an invented link, an invented handle and a label over 4 words fail', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ NO_ACTION }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const ctx = { handle: '@maya.designs', text: NO_ACTION };
    const p = (label: string, c: any = ctx) => D.buttonProblem(label, c);
    return {
      generic: ['Save this for later', 'Follow for more', 'Send this to a friend'].map((l) => p(l)),
      genericNoCtx: ['Save this for later', 'Follow for more', 'Send this to a friend'].map((l) => D.buttonProblem(l)),
      ownHandle: p('Follow @maya.designs'),
      otherHandle: p('Follow @someone.else'),
      noHandleSet: p('Follow @maya.designs', { handle: '', text: NO_ACTION }),
      link: p('Visit example.com'),
      bio: p('Link in bio'),
      offer: p('Get 50% off'),
      long: p('Come and read all of this now'),
      fiveWords: p('Please come and read this'),
      plain: p('Book a call'),
      closing: D.closingProblems({ layout: 'cta-button', fields: { headline: 'x', button: 'Follow @someone.else' }, accents: [] } as any, NO_ACTION, '@maya.designs').length,
    };
  }, { NO_ACTION });
  expect(r.generic, 'the three generic labels pass').toEqual([null, null, null]);
  expect(r.genericNoCtx, 'and pass with no context at all').toEqual([null, null, null]);
  expect(r.ownHandle, 'Follow @handle with the handle that is set').toBeNull();
  expect(r.otherHandle, 'an invented handle fails').toMatch(/not in the text|action phrase|punctuation/);
  expect(r.noHandleSet, 'no handle set: no @ label').not.toBeNull();
  expect(r.link, 'an invented link fails').toMatch(/not in the text/);
  expect(r.bio, 'link in bio fails').toMatch(/not in the text/);
  expect(r.offer, 'an invented number or offer fails').toMatch(/not in the text/);
  expect(r.long, 'a label over 4 words fails').toMatch(/words/);
  expect(r.fiveWords, 'five words fail').toMatch(/words/);
  expect(r.plain, 'an ordinary action phrase still passes').toBeNull();
  expect(r.closing, 'a closing button with an invented handle is a miss').toBeGreaterThan(0);
});

test('closing rule: no real action means a generic cta (a plain statement is a miss); a real action or contact details are left alone', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ NO_ACTION, HEAVY }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const st = (layout: string, fields: any) => ({ layout, fields, accents: [] }) as any;
    const h = '@maya.designs';
    const withAction = 'Here is my checklist. Book a free call at example.com/call and we will go through it together.';
    const withContact = 'Questions? Write to hello@quickflip.com or call +1 415 555 0134.';
    return {
      heavyAction: D.textHasAction(HEAVY), critiqueAction: D.textHasAction(NO_ACTION), bookAction: D.textHasAction(withAction), contactAction: D.textHasAction(withContact),
      statementMiss: D.closingProblems(st('statement', { headline: 'Build the smallest version' }), NO_ACTION, h).length,
      statementOkWithAction: D.closingProblems(st('statement', { headline: 'Build the smallest version' }), withAction, h).length,
      buttonOk: D.closingProblems(st('cta-button', { headline: 'Build the smallest version', button: 'Follow for more' }), NO_ACTION, h).length,
      buttonOther: D.closingProblems(st('cta-button', { headline: 'Build the smallest version', button: 'Get the checklist' }), NO_ACTION, h).length,
      cardNoLabel: D.closingProblems(st('statement-card', { headline: 'Build the smallest version' }), NO_ACTION, h).length,
      cardLabel: D.closingProblems(st('statement-card', { headline: 'Build the smallest version', caption: 'Save this for later' }), NO_ACTION, h).length,
      filler: D.closingProblems(st('statement', { headline: 'Thanks for reading' }), NO_ACTION, h).join(' | '),
      kinds: [D.genericKindOf('Three tips and a checklist: how to plan your week'), D.genericKindOf(NO_ACTION), D.genericKindOf("We've all been there, that moment when the alarm rings")],
      fixStatement: D.ensureGenericClosing([st('statement', { headline: 'Hook' }), st('statement', { headline: 'Build the smallest version that tests the core assumption.', caption: 'Twenty people, one week.' })], NO_ACTION, h, false).specs[1],
      fixCard: D.ensureGenericClosing([st('statement', { headline: 'Hook' }), st('statement-card', { headline: 'Build the smallest version.' })], NO_ACTION, h, true).specs[1],
      fixCardNoKeep: D.ensureGenericClosing([st('statement', { headline: 'Hook' }), st('statement-card', { headline: 'Build the smallest version.' })], NO_ACTION, '', false).specs[1],
      fixLeaves: D.ensureGenericClosing([st('statement', { headline: 'Hook' }), st('statement', { headline: 'Book your call.' })], withAction, h, false).trims.length,
    };
  }, { NO_ACTION, HEAVY });
  expect([r.heavyAction, r.critiqueAction], 'the two no-action fixtures have no real action').toEqual([false, false]);
  expect([r.bookAction, r.contactAction], 'a booking link, an email and a phone number are real').toEqual([true, true]);
  expect(r.statementMiss, 'a plain statement closing, no action in the text: a miss').toBeGreaterThan(0);
  expect(r.statementOkWithAction, 'with a real action in the text nothing is enforced').toBe(0);
  expect(r.buttonOk).toBe(0);
  expect(r.buttonOther, 'a button with an invented action is a miss').toBeGreaterThan(0);
  expect(r.cardNoLabel).toBeGreaterThan(0);
  expect(r.cardLabel, 'a card with the label in its caption is fine').toBe(0);
  expect(r.filler, 'filler headline').toMatch(/takeaway/);
  expect(r.kinds).toEqual(['save', 'follow', 'friend']);
  expect(r.fixStatement.layout).toBe('cta-button');
  expect(r.fixStatement.fields.button).toBe('Follow @maya.designs');
  expect(r.fixStatement.fields.headline, 'the headline stays the takeaway').toMatch(/^Build the smallest version/);
  expect(r.fixStatement.fields.sub, 'the caption line becomes the sub line').toBe('Twenty people, one week.');
  expect(r.fixCard.layout, 'a preset that closes on a card keeps it').toBe('statement-card');
  expect(r.fixCard.fields.caption).toBe('Follow @maya.designs');
  expect(r.fixCardNoKeep.layout).toBe('cta-button');
  expect(r.fixCardNoKeep.fields.button, 'no handle set: no @').toBe('Follow for more');
  expect(r.fixLeaves, 'a text with a real action is not touched').toBe(0);
});

test('the deck maker: a plain statement closing is settled by the code (no second writer call); style-5 puts the label in the card caption; a real action keeps its closing', async ({ page }) => {
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
      return { calls, last: { layout: last.layout, fields: last.fields }, retries: lib.retries.map((q: any) => q.slide), trims: (lib.trims ?? []).filter((t: any) => t.field === 'closing cta').map((t: any) => `${t.from} -> ${t.to}`), slides: Object.keys(res.designed.slides).length };
    };
    const stmt = { layout: 'statement', fields: { headline: 'Build the smallest version that tests it.' }, accents: [] };
    const btn = { layout: 'cta-button', fields: { headline: 'Build the smallest version that tests it.', button: 'Follow for more' }, accents: [] };
    const action = { layout: 'cta-button', fields: { headline: 'Book your free call today', button: 'Book a free call' }, accents: [] };
    const withAction = NO_ACTION + ' Book a free call at example.com/call.';
    return {
      fixedByRetry: await run('style-6', [stmt, btn], NO_ACTION),
      neverFixed: await run('style-6', [stmt, stmt], NO_ACTION),
      goodFirst: await run('style-6', [btn], NO_ACTION),
      style5: await run('style-5', [btn], NO_ACTION),
      style5Stmt: await run('style-5', [stmt, stmt], NO_ACTION),
      realAction: await run('style-4', [action], withAction),
    };
  }, { NO_ACTION });
  // a plain statement: never a reason for a second writer call; the code makes the closing the generic cta (a trim)
  expect(r.fixedByRetry.retries).toEqual([]);
  expect(r.fixedByRetry.calls).toBe(1);
  expect(r.fixedByRetry.last.layout).toBe('cta-button');
  expect(r.fixedByRetry.last.fields.button).toBe('Follow @maya.designs');
  expect(r.neverFixed.calls).toBe(1);
  expect(r.neverFixed.last.layout).toBe('cta-button');
  expect(r.neverFixed.last.fields.button).toBe('Follow @maya.designs');
  expect(r.neverFixed.trims.length).toBe(1);
  // a good closing the first time: no retry, no trim
  expect(r.goodFirst.calls).toBe(1);
  expect(r.goodFirst.retries).toEqual([]);
  expect(r.goodFirst.trims).toEqual([]);
  // style-5 closes on a statement card: the label is in the caption, not a button
  expect(r.style5.last.layout).toBe('statement-card');
  expect(r.style5.last.fields.caption).toBe('Follow for more');
  expect(r.style5.last.fields.button).toBeUndefined();
  expect(r.style5Stmt.last.layout).toBe('statement-card');
  expect(r.style5Stmt.last.fields.caption).toBe('Follow @maya.designs');
  // a text with a real action: its own closing, untouched
  expect(r.realAction.calls).toBe(1);
  expect(r.realAction.last.fields.button).toBe('Book a free call');
  expect(r.realAction.trims).toEqual([]);
  for (const k of ['fixedByRetry', 'neverFixed', 'goodFirst', 'style5', 'style5Stmt', 'realAction'] as const) expect((r as any)[k].slides, `${k}: 7 slides drawn`).toBe(7);
});
