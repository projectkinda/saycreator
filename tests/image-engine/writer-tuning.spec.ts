// Writer tuning (ZERO real model calls: a fake writer answers): closing rules and the action-phrase validator, each preset's cover form, the "this style likes" menu line, the numbered-stagger
// zig-zag (even, symmetric, hanging numbers, long text falls back to numbered-list) and numbered lists that fill the page.
import { expect, test } from '@playwright/test';

test.setTimeout(8 * 60_000);

const BODY = [
  { layout: 'statement-card', fields: { kicker: 'New this week', headline: 'Your bag is now your hoodie', caption: 'Zip, flip, go.' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' }, accents: [] },
  { layout: 'checklist', fields: { title: 'Before you start', items: ['Pick a size', 'Charge the lights', 'Zip the pocket'] }, accents: [] },
  { layout: 'comparison', fields: { title: 'Before and after', leftLabel: 'Before', leftText: 'Two bags', rightLabel: 'After', rightText: 'One hoodie' }, accents: [] },
  { layout: 'quote', fields: { quote: 'I stopped carrying a bag the day this arrived.', author: 'An early backer' }, accents: [] },
  { layout: 'prose', fields: { p1: 'It took two years of testing in the rain.', p2: 'Today it flips in ten seconds.' }, accents: [] },
];

test('the prompt: the closing depends on the content, a button is an action phrase, each preset says what it likes and its cover form', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const req: any = { text: 'A hoodie that flips into a backpack. Back it on Kickstarter.', tone: 'clear', format: 'carousel', slides: 7, styleChoice: 'x', styles: [] };
    const out: any = {};
    for (const id of ['style-1', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'hot-flat']) {
      const pack = PR.presetPackFor(id, false);
      const { style } = D.styleFromPack(pack);
      out[id] = D.buildLibraryPrompt(req, { pack }, style, 'a look', 7);
    }
    return out;
  });
  for (const [id, p] of Object.entries<string>(r)) {
    expect(p, `${id}: closing rule`).toContain('The closing (last slide) depends on the TEXT, not on habit');
    expect(p).toContain('"cta-button" with that action');
    expect(p).toContain('"cta-pair" when it gives TWO different actions');
    expect(p).toContain('"contact-closing" when the text itself contains contact details');
    expect(p).toContain('never invent any');
    expect(p, `${id}: no real action: a generic cta`).toContain('If the text has NO real action, the closing is STILL a "cta-button"');
    expect(p, `${id}: button rule`).toContain('button label is an ACTION PHRASE: verb first, 2 to 4 words');
    expect(p).toContain('"Book a call"');
    expect(p).toContain('"Which fits you?"');
    expect(p).toContain('Save this for later');
    // the old habit is gone
    expect(p).not.toContain('The last slide is a closing: cta-button, cta-pair or contact-closing');
  }
  // what each preset likes, with when to use it
  expect(r['style-1']).toMatch(/This style likes: .*"numbered-stagger" \(2 or 3 numbered points, each ONE short sentence/);
  expect(r['style-4']).toMatch(/This style likes: .*"statement-stacked" \(a hook of 2 to 4 words.*"contact-closing" \(ONLY when the text gives contact details/);
  expect(r['style-6']).toMatch(/This style likes: .*"numbered-stagger"/);
  expect(r['style-7']).toMatch(/This style likes: .*"statement-pill" \(.*"pill-stagger" \(a short list of 3 to 5 options/);
  expect(r['style-8']).toMatch(/This style likes: .*"statement-question" \(a slide that asks the reader ONE question/);
  expect((r['hot-flat'].split(String.fromCharCode(10)).find((l: string) => l.includes('This style likes:')) ?? ''), 'an old preset has no pack layouts in its list: no likes line for them').not.toContain('pill-stagger');
  // the cover form of each preset
  expect(r['style-4']).toMatch(/- Cover: this style's cover \(slide 1\) is "statement-stacked": write slide 1 as "statement-stacked" with a headline of 2 to 4 words/);
  expect(r['style-5']).toMatch(/- Cover: this style's cover \(slide 1\) is "statement-card"/);
  expect(r['style-7']).toMatch(/- Cover: this style's cover \(slide 1\) is "statement-pill".*SHORT call-out of at most 40 characters/);
  expect(r['style-8']).toMatch(/- Cover: when the hook is a QUESTION \(it ends with "\?"\), slide 1 is "statement-question"/);
  expect(r['style-1'], 'a plain statement cover needs no cover line').not.toMatch(/- Cover:/);
  expect(r['style-4']).toContain('do not use plain "statement" for the cover');
});

test('buttonProblem: an action phrase (verb first, 2 to 4 words, at most 20 characters, no punctuation) passes; questions, slogans and topics do not', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const good = ['Book a call', 'Get the checklist', 'Join the list', 'Save this post', 'Share your view', 'Back it now', 'Tell us your view', 'Try it this week', 'Order now', 'Learn more', 'Click here', 'Download the guide'];
    const bad = ['Which fits you?', 'Sleep well', 'Print, pack, sleep', 'Subscribe', 'Learn more about our incredible product', 'A great book', 'Book a call with us today', 'Keep reading to see how.', '', 'Neither is better'];
    return { good: good.map((g) => [g, D.buttonProblem(g)]), bad: bad.map((b) => [b, D.buttonProblem(b)]) };
  });
  for (const [t, p] of r.good) expect(p, `"${t}" is a good button label`).toBeNull();
  for (const [t, p] of r.bad) expect(typeof p, `"${t}" is not a button label`).toBe('string');
});

test('a button that is not an action phrase: one retry asks for a new one; if it is still wrong the closing loses its button (a trim, never a failure); an honest closing is untouched', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (BODY) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const pack = PR.presetPackFor('hot-flat', false);
    const req: any = { text: 'Quick Flip is a hoodie that flips into a backpack in ten seconds. '.repeat(3) + ' Back it on Kickstarter today.', slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'hot-flat', styles: [] };
    const run = async (closing: any, answers: string[]) => {
      let n = 0;
      const prompts: string[] = [];
      const provider: any = { id: 'dev-cli', label: 'fake', async write(prompt: string) { prompts.push(prompt); const text = n < answers.length ? answers[n] : answers[answers.length - 1]; n++; return { text, ms: 5 }; } };
      const first = JSON.stringify({ title: 'Quick Flip', slides: [...BODY, closing] });
      const out: any = await D.designLibraryDeck(req, { pack }, '@quick.flip', provider, new AbortController().signal);
      const lib = out.designed.library;
      return { calls: n, layouts: lib.layouts, closing: lib.plan.specs[lib.plan.specs.length - 1], adjustments: lib.codeAdjustments, retries: lib.retries, trims: lib.trims ?? [], retryPrompt: prompts[1] ?? '', first };
    };
    const bad = { layout: 'cta-button', fields: { headline: 'Sleep on it, then back it', button: 'Sleep well' }, accents: [] };
    const fixed = JSON.stringify({ slides: { '7': { layout: 'cta-button', fields: { headline: 'Back Quick Flip today', button: 'Back it now' }, accents: [] } } });
    const first = (c: any) => JSON.stringify({ title: 'Quick Flip', slides: [...BODY, c] });
    const a = await run(bad, [first(bad), fixed]);
    const stillBad = JSON.stringify({ slides: { '7': { layout: 'cta-button', fields: { headline: 'Sleep on it', button: 'Which fits you?' }, accents: [] } } });
    const b = await run(bad, [first(bad), stillBad]);
    const good = { layout: 'cta-button', fields: { headline: 'Back Quick Flip today', button: 'Book a call' }, accents: [] };
    const c = await run(good, [first(good)]);
    const none = { layout: 'statement-card', fields: { headline: 'One hoodie. Two jobs.', caption: 'That is the whole idea.' }, accents: [] };
    const d = await run(none, [first(none)]);
    return { a, b, c, d };
  }, BODY);
  expect(r.a.calls, 'a bad button costs one retry').toBe(2);
  expect(r.a.retryPrompt, 'the retry says what is wrong with the button').toContain('does not start with an action verb');
  expect(r.a.closing.fields.button).toBe('Back it now');
  expect(r.a.layouts[6]).toBe('cta-button');
  expect(r.b.calls, 'no third call').toBe(2);
  expect(r.b.layouts[6], 'still wrong after the retry: the closing becomes a statement card with no button').toBe('statement-card');
  expect(r.b.closing.fields.button).toBeUndefined();
  expect(r.b.adjustments.join(' ')).toContain('is not an action phrase');
  expect(r.b.layouts.length, 'a trim, not a failure: all 7 slides are there').toBe(7);
  expect(r.c.calls).toBe(1);
  expect(r.c.closing.fields.button).toBe('Book a call');
  expect(r.d.calls).toBe(1);
  expect(r.d.layouts[6], 'a closing statement with no button is kept as it is').toBe('statement-card');
});

test('covers: each preset keeps its own cover form (statement-stacked, statement-pill, statement-card); a question hook takes statement-question where the preset has it; plain statement is never the result', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (BODY) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const req: any = { text: 'Quick Flip is a hoodie that flips into a backpack in ten seconds. '.repeat(3) + ' Back it on Kickstarter today.', slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'x', styles: [] };
    const run = async (preset: string, cover: any) => {
      const pack = PR.presetPackFor(preset, false);
      const answer = JSON.stringify({ title: 'T', slides: [cover, ...BODY.slice(1), { layout: 'statement-card', fields: { headline: 'One hoodie. Two jobs.' }, accents: [] }] });
      const provider: any = { id: 'dev-cli', label: 'fake', async write() { return { text: answer, ms: 5 }; } };
      const out: any = await D.designLibraryDeck(req, { pack }, '@quick.flip', provider, new AbortController().signal);
      return { first: out.designed.library.layouts[0], swaps: (out.designed.library.flavour?.swaps ?? []).filter((s: any) => s.slide === 1).map((s: any) => `${s.from}->${s.to}`) };
    };
    const plain = { layout: 'statement', fields: { headline: 'Flip it, wear it', caption: 'One hoodie, two jobs.' }, accents: [] };
    const q = { layout: 'statement', fields: { headline: 'What if your hoodie was also your bag?' }, accents: [] };
    return {
      s4: await run('style-4', plain),
      s4own: await run('style-4', { layout: 'statement-stacked', fields: { headline: 'Flip it, wear it', caption: 'One hoodie.' }, accents: [] }),
      s7: await run('style-7', plain),
      s7own: await run('style-7', { layout: 'statement-pill', fields: { headline: 'Flip it, wear it', caption: 'Ten seconds' }, accents: [] }),
      s5: await run('style-5', plain),
      s5own: await run('style-5', { layout: 'statement-card', fields: { headline: 'Flip it, wear it', caption: 'One hoodie.' }, accents: [] }),
      s8q: await run('style-8', q),
      s8plain: await run('style-8', plain),
      s1: await run('style-1', plain),
    };
  }, BODY);
  expect(r.s4.first, 'style-4 cover form').toBe('statement-stacked');
  expect(r.s4own.first, 'its own cover form is never swapped to plain statement').toBe('statement-stacked');
  expect(r.s7.first, 'style-7 cover form').toBe('statement-pill');
  expect(r.s7own.first).toBe('statement-pill');
  expect(r.s5.first, 'style-5 cover form').toBe('statement-card');
  expect(r.s5own.first).toBe('statement-card');
  expect(r.s8q.first, 'style-8: a question hook').toBe('statement-question');
  expect(r.s8plain.first, 'style-8: a hook that is not a question stays a statement').toBe('statement');
  expect(r.s1.first, 'a preset whose cover form is statement keeps it').toBe('statement');
});

test('numbered-stagger: numerals in one column, sentences on one edge; three long items fall back to numbered-list; two items stay a stagger', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const st = D.styleFromPack(PR.presetPackFor('style-6', false)).style;
    const out: any = {};
    const draw = async (name: string, items: string[], v: 0 | 1) => {
      const b = await L.buildSlide('numbered-stagger', v, { title: 'Questions to ask', items }, st, { handle: '@x', index: 3, total: 8, cut: 'plain' });
      const bodies = (b.layers as any[]).filter((l) => l.kind === 'text' && /^body\d*$/.test(String(l.name)) && l.text);
      out[`${name}-v${v + 1}`] = { ok: b.ok, fitAs: b.plan?.fitAs, texts: bodies.map((l) => ({ t: String(l.text), x: Math.round(l.x), y: Math.round(l.y), w: Math.round(l.width), size: l.style.size })) };
    };
    for (const v of [0, 1] as const) {
      await draw('short3', ['How decisions get made', 'Who reviews your work', 'What success looks like'], v);
      await draw('long3', ['Use the product for an hour and write down three things that confuse you.', 'Write down three things that confuse you and one idea to fix each of them.', 'Practise the whiteboard task out loud with a friend before the interview.'], v);
      await draw('two', ['Zip the hood into the pocket and the hoodie becomes a bag.', 'Pull the straps out and wear it as a backpack on the train.'], v);
    }
    return out;
  });
  for (const v of ['v1', 'v2']) {
    const s = r[`short3-${v}`];
    expect(s.ok).toBe(true);
    expect(s.fitAs, `short items stay a stagger (${v})`).toBe('numbered-stagger');
    const items = s.texts.filter((q: any) => /^(How|Who|What)/.test(q.t));
    const nums = s.texts.filter((q: any) => /^[123]$/.test(q.t));
    expect(items.length).toBe(3);
    expect(nums.length, 'a number column for each item').toBe(3);
    // one column: every item starts at the same x and has the same width; every numeral is in front of its text, in one column
    expect(new Set(items.map((q: any) => q.x)).size, 'the sentences share one left edge').toBe(1);
    expect(new Set(items.map((q: any) => q.w)).size, 'the same width for every item').toBe(1);
    nums.forEach((n: any, i: number) => { expect(n.x, `number ${i + 1} is in front of its text`).toBeLessThan(items[i].x); expect(Math.abs(n.y - items[i].y), 'on its text row').toBeLessThan(40); });
    expect(new Set(nums.map((q: any) => q.x)).size, 'the numerals share one column').toBe(1);
    const l = r[`long3-${v}`];
    expect(l.fitAs, `three long items become a numbered list (${v})`).toBe('numbered-list');
    const t = r[`two-${v}`];
    expect(t.fitAs, `two items stay a stagger (${v})`).toBe('numbered-stagger');
  }
});

test('numbered-list with short items scales up to fill the page; five long items stay compact and still fit', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const out: any = {};
    for (const id of ['style-1', 'style-6']) {
      const st = D.styleFromPack(PR.presetPackFor(id, false)).style;
      for (const v of [0, 1] as const) for (const [name, items] of [['short3', ['Pick two projects', 'Write each story', 'Research the company']], ['short5', ['Pick two', 'Write the story', 'Research them', 'Practise aloud', 'Ask questions']], ['long5', ['As a hoodie on the street in the morning', 'As a backpack on the train every day', 'As a pillow on the plane for a nap', 'As a blanket at the park in summer', 'As a rain cover for the dog in the park']]] as [string, string[]][]) {
        const b = await L.buildSlide('numbered-list', v, { title: 'Five steps before the day', items }, st, { handle: '@x', index: 2, total: 8, cut: 'plain' });
        const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring'));
        const shapes = (b.layers as any[]).filter((l) => l.kind === 'shape' && l.y > 100 && l.y < 1260 && l.height < 900 && !/background/.test(String(l.name)));
        const ys = [...texts.map((l) => [l.y, l.y + l.height]), ...shapes.map((l) => [l.y, l.y + l.height])];
        const body = texts.filter((l) => /^body\d*$/.test(String(l.name)) && !/^\d$/.test(String(l.text))).map((l) => l.style.size);
        out[`${id}-${name}-v${v + 1}`] = { ok: b.ok, errors: b.errors, fill: (Math.max(...ys.map((q) => q[1])) - Math.min(...ys.map((q) => q[0]))) / 1000, body: Math.max(...body), minBody: Math.min(...body), bottom: Math.max(...ys.map((q) => q[1])) };
      }
    }
    return out;
  });
  for (const [k, x] of Object.entries<any>(r)) {
    expect(x.ok, `${k}: ${JSON.stringify(x.errors)}`).toBe(true);
    expect(x.bottom, `${k}: inside the page`).toBeLessThanOrEqual(1260);
    expect(x.minBody, `${k}: body at least 44`).toBeGreaterThanOrEqual(44);
    if (/short/.test(k)) expect(x.fill, `${k}: fills the page`).toBeGreaterThanOrEqual(0.7);
    if (/short3/.test(k)) expect(x.body, `${k}: three short items are big`).toBeGreaterThanOrEqual(56);
  }
  console.log('NL FILL ' + JSON.stringify(Object.fromEntries(Object.entries<any>(r).map(([k, x]) => [k, [Math.round(x.fill * 100), x.body]]))));
});
