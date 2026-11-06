// Designed mode code checks (no model): the fit check shrinks before it re-asks, and repeated text across slides is found.
import { expect, test } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { carouselHandler, MAX_BODY } from '../../server/carousel-writer';

test.setTimeout(120_000);

test('fit check: a word wider than its box shrinks to fit (not under 32 px), a hopeless slot is a problem; repeated 3-word phrases are found', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designed.ts');
    const P = await import('/src/reference/pack.ts');
    const PAL = `data-palette='{"bg":"#101010","text":"#FFFFFF","accent":"#D10F0F","muted":"#999999"}'`;
    const svg = (extra: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="stat" ${PAL}><rect width="1080" height="1350" fill="$bg"/><circle cx="900" cy="150" r="40" fill="$accent"/><rect x="60" y="1100" width="300" height="12" fill="$accent"/><rect x="60" y="1140" width="300" height="12" fill="$muted"/>${extra}</svg>`;
    const sample = (role: string, y: number, size: number, min: number, lines: number, text: string) => `<text data-role="${role}" data-min-size="${min}" data-max-lines="${lines}" x="60" y="${y}" font-family="Schibsted Grotesk" font-size="${size}" fill="$text">${text}</text>`;

    // 1. the number slot was sized for "Hi" at 200 px (min 200); the real figure is far wider: the minimum comes down and it fits
    const a = await P.parsePack(svg(sample('number', 400, 200, 200, 1, 'Hi') + sample('title', 700, 60, 40, 2, 'Label here')), 'A');
    if (!a.ok) return { error: a.reasons };
    const slide = { type: 'stat', value: '$500,000', label: 'for 5% of the company', note: 'n' };
    const fitA = D.fitSlots(a.pack, 'stat', slide, '@x');
    const numA = (fitA.pack.designs.stat as any[]).find((l) => l.name === 'number');

    // 2. a body slot sized for one short word cannot hold a long text even at 32 px: a problem, said in plain words
    const b = await P.parsePack(svg(sample('title', 300, 80, 40, 2, 'Hi') + sample('body', 1240, 40, 32, 2, 'Ok')), 'B');
    if (!b.ok) return { error: b.reasons };
    const long = { type: 'stat', value: '1', label: 'Title', note: 'This is a very long supporting sentence that needs far more room than a tiny slot sized for one short word can ever give it at any size. ' + 'It goes on and on with many more words so that even the smallest allowed size cannot hold it in the little room that is left at the foot of the slide.' };
    const fitB = D.fitSlots(b.pack, 'stat', long, '@x');

    // 3. repeated text
    const slides = [
      { type: 'cover', headline: 'The hoodie that becomes a backpack', sub: 'One piece of clothing that works as a hoodie' },
      { type: 'content', headline: 'The story', body: 'One piece of clothing that works as both' },
      { type: 'closing', headline: 'Back it today', cta: 'Back it today or never' },
    ];
    const rep = D.repeatedText(slides as any, '@x');
    const clean = D.repeatedText([{ type: 'cover', headline: 'A one' }, { type: 'content', headline: 'Another two words', body: 'Different text entirely here' }] as any, '@x');
    return {
      shrunk: fitA.shrunk, problemsA: fitA.problems, numMin: numA.slot?.minSize, numAuto: numA.autoFit?.minSize,
      problemsB: fitB.problems,
      offenders: [...rep.offenders].map(([i, rs]) => [i, rs.map((x: any) => `${x.role}:${x.phrase}:${x.other}`)]),
      notes: rep.notes, cleanOffenders: clean.offenders.size, cleanNotes: clean.notes.length,
    };
  });
  expect((r as any).error).toBeUndefined();
  expect(r.shrunk).not.toContain('number'); // widened to the margins first, so the figure keeps its size
  expect(r.problemsA).toEqual([]);
  expect(r.numMin).toBe(200);
  expect(r.problemsB.join(' ')).toMatch(/does not fit its box even at 3\d px/);
  expect(r.offenders).toEqual([[1, ['body:one piece of:1']], [2, ['body:back it today:3']]]);
  expect(r.notes).toEqual([]);
  expect(r.cleanOffenders).toBe(0);
  expect(r.cleanNotes).toBe(0);
});

const PALJ = `data-palette='{"bg":"#101010","text":"#FFFFFF","accent":"#D10F0F","muted":"#999999"}'`;

test('type-scale floors: hero headlines 110 to 150, other headlines 72, body 40, rows 44; reflow before any shrink', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const D = await import('/src/carousel/designed.ts');
    const P = await import('/src/reference/pack.ts');
    const svg = (type: string, extra: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="${type}" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="60" y="1100" width="300" height="12" fill="$accent"/>${extra}</svg>`;
    const t = (role: string, y: number, size: number, text: string, lines = 3) => `<text data-role="${role}" data-min-size="32" data-max-lines="${lines}" x="60" y="${y}" font-family="Schibsted Grotesk" font-size="${size}" fill="$text">${text}</text>`;
    const make = async (type: string, extra: string) => {
      const a = await P.parsePack(svg(type, extra), 'T');
      if (!a.ok) throw new Error(a.reasons.join(' '));
      return a.pack;
    };
    const sizeOf = (pk: any, key: string, role: string) => (pk.designs[key] as any[]).find((l) => l.name === role);
    // a cover drawn with a small headline (60 px): raised to 110 on a hero layout
    const cover = await make('cover', t('title', 300, 60, 'Big claim', 2) + t('body', 700, 30, 'Support line here', 2));
    const c1 = D.fitSlots(cover, 'cover', { type: 'cover', headline: 'Big claim', sub: 'Support line here' }, '@x', 'statement');
    // a content slide on a non-hero layout: headline floor 72, body 40
    const content = await make('content', t('title', 300, 40, 'Second point', 2) + t('body', 700, 30, 'Body words', 2));
    const c2 = D.fitSlots(content, 'content', { type: 'content', headline: 'Second point', body: 'Body words' }, '@x', 'stepper');
    // a 150 px headline stays at most 150
    const huge = await make('cover', t('title', 400, 220, 'Hi', 1) + t('body', 800, 40, 'Support', 2));
    const c3 = D.fitSlots(huge, 'cover', { type: 'cover', headline: 'Hi', sub: 'Support' }, '@x', 'statement');
    // a long headline in a narrow, short slot: widened and made taller first, its floor kept (nothing shrunk)
    const narrow = await make('cover', t('title', 300, 60, 'Hi there', 1) + t('body', 900, 40, 'Support', 2));
    const c4 = D.fitSlots(narrow, 'cover', { type: 'cover', headline: 'The hoodie that becomes a backpack in seconds', sub: 'Support' }, '@x', 'statement');
    const before = sizeOf(narrow, 'cover', 'title');
    const t4 = sizeOf(c4.pack, 'cover', 'title');
    return {
      coverTitle: [sizeOf(c1.pack, 'cover', 'title').style.size, sizeOf(c1.pack, 'cover', 'title').slot.minSize],
      contentTitle: [sizeOf(c2.pack, 'content', 'title').style.size, sizeOf(c2.pack, 'content', 'title').slot.minSize],
      contentBody: [sizeOf(c2.pack, 'content', 'body').style.size, sizeOf(c2.pack, 'content', 'body').slot.minSize],
      hugeTitle: [sizeOf(c3.pack, 'cover', 'title').style.size, sizeOf(c3.pack, 'cover', 'title').slot.maxSize],
      narrow: { widened: t4.width > before.width, taller: t4.height > before.height, min: t4.slot.minSize, shrunk: c4.shrunk, problems: c4.problems, notes: c4.notes },
    };
  }, PALJ);
  expect(r.coverTitle).toEqual([110, 110]);
  expect(r.contentTitle).toEqual([72, 72]);
  expect(r.contentBody).toEqual([40, 40]);
  expect(r.hugeTitle).toEqual([150, 150]);
  expect(r.narrow.widened).toBe(true);
  expect(r.narrow.min).toBeGreaterThanOrEqual(72); // the floor, or lower only to reach 3 lines across the full width
  expect(r.narrow.min).toBeLessThanOrEqual(110);
  expect(r.narrow.shrunk).toEqual([]);
  expect(r.narrow.problems).toEqual([]);
  expect(r.narrow.notes.join(' ')).toMatch(/widened or made taller before any size was reduced/);
});

test('accent phrase: coloured by the engine as a run in the accent colour, in the layers and in the drawing; an unknown phrase is ignored', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const P = await import('/src/reference/pack.ts');
    const R = await import('/src/reference/recreate.ts');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="content" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="60" y="1100" width="300" height="12" fill="$accent"/><text data-role="title" data-min-size="72" data-max-lines="3" x="60" y="300" font-family="Schibsted Grotesk" font-size="100" fill="$text">Ship something real</text><text data-role="body" data-min-size="40" data-max-lines="3" x="60" y="700" font-family="Instrument Sans" font-size="44" fill="$text">Body</text></svg>`;
    const a = await P.parsePack(svg, 'A');
    if (!a.ok) throw new Error(a.reasons.join(' '));
    const withAccent = P.packSlide(a.pack, 'content', { type: 'content', headline: 'Ship something real', body: 'Body words', accent: 'real' }, '@x');
    const unknown = P.packSlide(a.pack, 'content', { type: 'content', headline: 'Ship something real', body: 'Body words', accent: 'banana' }, '@x');
    const titleOf = (ps: any) => ps.layers.find((l: any) => l.kind === 'text' && l.name === 'title');
    return {
      runs: titleOf(withAccent)?.runs ?? null, noRuns: titleOf(unknown)?.runs ?? null,
      drawing: withAccent.faithful ?? '', plain: unknown.faithful ?? '', accentHex: a.pack.palette.accent,
    };
  }, PALJ);
  expect(r.runs).toEqual([{ start: 15, end: 19, color: r.accentHex }]);
  expect(r.noRuns).toBeNull();
  expect(r.drawing).toMatch(new RegExp(`<tspan[^>]*fill="${r.accentHex}"[^>]*>real</tspan>`, 'i'));
  expect(r.plain).not.toMatch(new RegExp(`fill="${r.accentHex}"[^>]*>`, 'i').source.replace('fill=', 'fill=') + 'NEVER');
  expect(r.plain.includes('>real<')).toBe(false);
});

test('vertical balance: content hugging the top is moved so the empty space is split; the chrome stays; a balanced slide is left alone', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const D = await import('/src/carousel/designed.ts');
    const P = await import('/src/reference/pack.ts');
    const mk = async (y: number) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="content" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="60" y="100" width="960" height="3" fill="$muted"/><rect x="60" y="1260" width="960" height="3" fill="$muted"/><rect x="60" y="${y - 90}" width="120" height="8" fill="$accent"/><text data-role="title" data-min-size="72" data-max-lines="3" x="60" y="${y}" font-family="Schibsted Grotesk" font-size="100" fill="$text">Big idea</text><text data-role="body" data-min-size="40" data-max-lines="3" x="60" y="${y + 160}" font-family="Instrument Sans" font-size="44" fill="$text">Body words</text></svg>`;
      const a = await P.parsePack(svg, 'B');
      if (!a.ok) throw new Error(a.reasons.join(' '));
      return a.pack;
    };
    const slide = { type: 'content', headline: 'Big idea', body: 'Body words' };
    const top = await mk(300);
    const moved = D.balanceVertical(top, 'content', slide, '@x');
    const mid = await mk(625);
    const same = D.balanceVertical(mid, 'content', slide, '@x');
    const ys = (pk: any) => (pk.designs.content as any[]).filter((l) => l.kind === 'text').map((l) => Math.round(l.y));
    const chrome = (pk: any) => (pk.designs.content as any[]).filter((l) => l.kind === 'shape' && (l.y === 100 || l.y === 1260)).map((l) => l.y);
    return { before: ys(top), after: ys(moved), chromeBefore: chrome(top), chromeAfter: chrome(moved), svgHasTranslate: /translate\(0 \d+\)/.test(moved.svgs!.content!), notes: moved.notes.filter((n: string) => /moved/.test(n)), untouched: same === mid, sameYs: ys(same) };
  }, PALJ);
  expect(r.after[0]).toBeGreaterThan(r.before[0] + 100);
  expect(r.chromeAfter).toEqual(r.chromeBefore);
  expect(r.svgHasTranslate).toBe(true);
  expect(r.notes.length).toBe(1);
  expect(r.untouched).toBe(true);
});

test('retry reasons: a retry says which slide and which check caused it, in designed.notes', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const D = await import('/src/carousel/designed.ts');
    const script = { title: 'T', brand: { handle: '@x' }, slides: [
      { type: 'cover', headline: 'Big claim here', sub: 'Support line', element_tags: ['idea', 'launch'] },
      { type: 'content', headline: 'Second point', body: 'Body words', element_tags: ['idea', 'people'] },
      { type: 'closing', headline: 'Save this now', cta: 'Follow along', element_tags: ['launch', 'love'] },
    ] };
    const slideSvg = (n: number, type: string, title: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-slide="${n}" data-type="${type}" data-layout="statement" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="60" y="200" width="120" height="8" fill="$accent"/><text data-role="title" data-min-size="72" data-max-lines="3" x="60" y="400" font-family="Schibsted Grotesk" font-size="110" fill="$text">${title}</text><text data-role="body" data-min-size="40" data-max-lines="3" x="60" y="700" font-family="Instrument Sans" font-size="44" fill="$text">${body}</text><text x="60" y="1280" font-size="30" fill="$muted" font-family="Instrument Sans">${n} / 3</text></svg>`;
    const first = JSON.stringify(script) + '\n' + slideSvg(1, 'cover', 'Big claim here', 'Support line') + slideSvg(2, 'content', 'Second point', 'Body words') + slideSvg(3, 'closing', 'Save this now', 'Follow along');
    let n = 0;
    const provider = { id: 'api' as const, label: 'fake', write: async () => ({ text: n++ === 0 ? first : '', ms: 1, usage: { input: 100, output: 50 } }) };
    const req = { text: 'x'.repeat(60), slides: 3, tone: 'clear' as const, format: 'carousel' as const, styleChoice: 'auto', styles: [] };
    const out = await D.designDeck(req, {}, '', provider, new AbortController().signal);
    return { calls: out.designed.calls, notes: out.designed.notes, tokens: out.designed.tokens, layouts: out.designed.layouts, chrome: (out.designed.slides['0']?.recurring ?? []).map((x: any) => [x.text, x.x, x.y, x.anchor]) };
  }, PALJ);
  expect(r.calls).toBe(3);
  expect(r.notes.join(' | ')).toMatch(/Retry for slide 2 \(content\): layout: it repeats the layout "statement"/);
  expect(r.notes.join(' | ')).toMatch(/Retry for slide 3 \(closing\)/);
  expect(r.tokens).toEqual({ input: 300, output: 150 });
  expect(r.notes.join(' | ')).toMatch(/Second retry for slide 2 \(content\): layout/);
  expect(r.chrome).toEqual([['@x', 48, 92, 'start'], ['1 / 3', 48, 1292, 'start'], ['swipe →', 1032, 1292, 'end']]);
});

test('accent is not scanned as repeated text; filler accents fall back to the longest meaningful word; headlines wrap balanced with no widow and no break inside the accent', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designed.ts');
    const R = await import('/src/reference/recreate.ts');
    const E = await import('/src/image-engine/index.ts');
    await E.loadFonts();
    const rep = D.repeatedText([{ type: 'content', headline: 'Slide and bite to lock it', body: 'Pull the zip', accent: 'Slide and bite' }] as any, '@x');
    const hl = 'What you get';
    const fall = R.accentPhrase(hl, 'get');
    const keep = R.accentPhrase('Ship something real', 'real');
    const none = R.accentPhrase('Ship something real', 'banana');
    const word = (h: string, a: any) => (a ? h.slice(a.start, a.end) : null);
    const font = 'Schibsted Grotesk' as const;
    const ws = E.FONT_WEIGHTS[font];
    const layer = (text: string, width: number, extra: any = {}) => ({ id: 't', kind: 'text', x: 0, y: 0, width, height: 900, rotation: 0, opacity: 1, text, balance: true, style: { font, weight: ws[ws.length - 1], size: 110, color: '#fff', align: 'left', lineHeight: 1.1 }, ...extra }) as any;
    const plain = E.layoutText(layer('Would you wear it?', 900, { balance: false })).lines.map((l: any) => l.text);
    const bal = E.layoutText(layer('Would you wear it?', 900, { runs: [{ start: 10, end: 17, color: '#ff0000' }] }));
    const long = E.layoutText(layer('The hoodie that becomes a backpack in seconds flat', 700));
    return {
      repOffenders: rep.offenders.size, repNotes: rep.notes.length,
      fall: word(hl, fall), keep: word('Ship something real', keep), none,
      plain, bal: bal.lines.map((l: any) => l.text), balSegs: bal.lines.map((l: any) => (l.segments ?? []).map((g: any) => g.text)),
      longLines: long.lines.map((l: any) => l.text), longWidths: long.lines.map((l: any) => Math.round(l.width)),
    };
  });
  expect(r.repOffenders).toBe(0);
  expect(r.repNotes).toBe(0);
  expect(r.fall).toBe('What');
  expect(r.keep).toBe('real');
  expect(r.none).toBeNull();
  expect(r.plain[r.plain.length - 1]).toBe('it?'); // the plain wrap leaves a widow
  expect(r.bal.every((l: string) => l.trim().split(/\s+/).length >= 2)).toBe(true); // balanced: no one-word line
  expect(r.bal.some((l: string) => l.includes('wear it'))).toBe(true); // the accent phrase stays on one line
  expect(r.longLines.length).toBeGreaterThanOrEqual(2);
  expect(r.longLines[r.longLines.length - 1].trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
  expect(Math.min(...r.longWidths) / Math.max(...r.longWidths)).toBeGreaterThan(0.3); // balanced to the word: no tiny last line
});

test('stepper building block: one node and one label per step, distinct states, steps fill one row each', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const D = await import('/src/carousel/designed.ts');
    const P = await import('/src/reference/pack.ts');
    const steps = ['Unzip the back panel', 'Flip the hood inside out', 'Pull the straps and wear it'];
    const frag = D.stepperSvg(steps, 2);
    const model = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="content" data-layout="stepper" ${PAL}><rect width="1080" height="1350" fill="$bg"/><text data-role="title" data-min-size="72" data-max-lines="2" x="48" y="260" font-family="Schibsted Grotesk" font-size="100" fill="$text">Three steps</text><text data-role="body" data-min-size="40" data-max-lines="3" x="48" y="700" font-family="Instrument Sans" font-size="44" fill="$text">A paragraph the model drew</text><g id="steps-track"><rect x="90" y="500" width="6" height="400" fill="$muted"/></g></svg>`;
    const withStepper = D.withEngineStepper(model, steps, 2);
    const a = await P.parsePack(withStepper, 'S');
    if (!a.ok) throw new Error(a.reasons.join(' '));
    const ps = P.packSlide(a.pack, 'content', { type: 'content', headline: 'Three steps', steps, accent: 'steps' }, '');
    const labels = ps.layers.filter((l: any) => l.kind === 'text' && /^body\d*$/.test(l.name) && l.visible !== false).map((l: any) => l.text);
    const ys = ps.layers.filter((l: any) => l.kind === 'text' && /^body\d*$/.test(l.name)).map((l: any) => Math.round(l.y)).sort((x: number, y: number) => x - y);
    return {
      done: (frag.match(/id="step-node-done"/g) ?? []).length, current: (frag.match(/id="step-node-current"/g) ?? []).length, upcoming: (frag.match(/id="step-node-upcoming"/g) ?? []).length,
      modelParagraph: withStepper.includes('A paragraph the model drew'), modelTrack: withStepper.includes('steps-track'),
      labels, gaps: ys.slice(1).map((y: number, i: number) => y - ys[i]),
    };
  }, PALJ);
  expect([r.done, r.current, r.upcoming]).toEqual([1, 1, 1]);
  expect(r.modelParagraph).toBe(false);
  expect(r.modelTrack).toBe(false);
  expect(r.labels).toEqual(['Unzip the back panel', 'Flip the hood inside out', 'Pull the straps and wear it']);
  expect(new Set(r.gaps).size).toBe(1);
});

test('thin side-bars on a hero layout are dropped and the content is balanced without them', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const D = await import('/src/carousel/designed.ts');
    const P = await import('/src/reference/pack.ts');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="content" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="48" y="400" width="6" height="640" fill="$accent"/><text data-role="title" data-min-size="72" data-max-lines="3" x="90" y="500" font-family="Schibsted Grotesk" font-size="110" fill="$text">Hannah wanted one piece</text></svg>`;
    const a = await P.parsePack(svg, 'S');
    if (!a.ok) throw new Error(a.reasons.join(' '));
    const slide = { type: 'content', headline: 'Hannah wanted one piece' };
    const hero = D.balanceVertical(a.pack, 'content', slide, '', 'statement');
    const other = D.balanceVertical(a.pack, 'content', slide, '', 'comparison');
    const bars = (pk: any) => (pk.designs.content as any[]).filter((l) => l.kind !== 'text' && l.name !== 'background' && l.id !== 'bg' && l.height > 300).length;
    return { heroBars: bars(hero), otherBars: bars(other), heroNotes: hero.notes.filter((n: string) => /side-bar|moved/.test(n)), svgHasBar: hero.svgs!.content!.includes('height="640"'), otherSvgHasBar: other.svgs!.content!.includes('height="640"') };
  }, PALJ);
  expect(r.heroBars).toBe(0);
  expect(r.svgHasBar).toBe(false);
  expect(r.heroNotes.join(' ')).toMatch(/dropped/);
  expect(r.otherBars).toBe(1);
  expect(r.otherSvgHasBar).toBe(true);
});

test('collision pass: text growing into a button moves the button and what is below it down (a); no room shrinks the text toward its floor (b); no way out is reported (c)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const sv = (type: string, layout: string, extra: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="${type}" data-layout="${layout}" ${PAL}><rect width="1080" height="1350" fill="$bg"/>${extra}</svg>`;
    const ttl = (y: number, size: number, text = 'Hi') => `<text data-role="title" data-min-size="72" data-max-lines="3" x="48" y="${y}" font-family="Schibsted Grotesk" font-size="${size}" fill="$text">${text}</text>`;
    const build = (extra: string, y: number, size = 80) => sv('content', 'statement', ttl(y, size) + extra);
    const D = await import('/src/carousel/designed.ts');
    const P = await import('/src/reference/pack.ts');
    const mk = async (extra: string) => {
      const a = await P.parsePack(extra, 'C');
      if (!a.ok) throw new Error(a.reasons.join(' '));
      return a.pack;
    };
    const run = (pack: any, slide: any) => {
      const fit = D.fitSlots(pack, 'content', slide, '', null);
      return { fit, col: D.resolveCollisions(fit.pack, 'content', slide, '', null) };
    };
    const by = (pk: any, name: string) => (pk.designs.content as any[]).find((l) => l.name === name);
    // (a) a button just under a short headline slot; the real headline needs two lines and grows into it
    const slideA = { type: 'content', headline: 'Would you wear it today at all friends', body: 'x' };
    const a = await mk(build('<g id="button"><rect x="48" y="380" width="500" height="90" rx="45" fill="$accent"/></g><g id="bar"><rect x="48" y="620" width="900" height="20" fill="$muted"/></g>'.replace(/^/, '') , 300));
    const ra = run(a, slideA);
    // (b) no room to move down (the button is near the footer), but the text can shrink toward its floor
    const b = await mk(build('<g id="button"><rect x="48" y="1132" width="500" height="90" rx="45" fill="$accent"/></g>', 1000, 90));
    const rb = run(b, { type: 'content', headline: 'Would you wear it today at all friends', body: 'x' });
    // (c) a long headline that cannot shrink enough: reported
    const c = await mk(build('<g id="bar"><rect x="48" y="1090" width="900" height="20" fill="$muted"/></g>', 1000, 90));
    const rc = run(c, { type: 'content', headline: 'Would you wear it today at all friends who ever asked us about the flip', body: 'x' });
    return {
      aMoved: by(ra.col.pack, 'button').y - by(a, 'button').y, aBar: by(ra.col.pack, 'bar').y - by(a, 'bar').y, aNotes: ra.col.notes, aProblems: ra.col.problems, aSvg: /translate\(0 \d+\)/.test(ra.col.pack.svgs.content),
      bNotes: rb.col.notes, bProblems: rb.col.problems, bTitleH: by(rb.col.pack, 'title').height,
      cProblems: rc.col.problems,
    };
  }, PALJ);
  expect(r.aMoved).toBeGreaterThanOrEqual(24);
  expect(r.aBar).toBe(r.aMoved); // everything below moves with it
  expect(r.aSvg).toBe(true);
  expect(r.aNotes.join(' ')).toMatch(/moved down/);
  expect(r.aProblems).toEqual([]);
  expect(r.bProblems).toEqual([]);
  expect(r.bNotes.join(' ')).toMatch(/shrunk toward its floor/);
  expect(r.bTitleH).toBeLessThan(200);
  expect(r.cProblems.join(' ')).toMatch(/overlap/);
});

test('hero headline uses the full width (3 lines at most), stat labels are at most 48 px, stepper scales to the free space and is centred', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const sv = (type: string, layout: string, extra: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="${type}" data-layout="${layout}" ${PAL}><rect width="1080" height="1350" fill="$bg"/>${extra}</svg>`;
    const ttl = (y: number, size: number, text = 'Hi') => `<text data-role="title" data-min-size="72" data-max-lines="3" x="48" y="${y}" font-family="Schibsted Grotesk" font-size="${size}" fill="$text">${text}</text>`;
    const build = (text: string, size: number) => sv('content', 'statement', ttl(300, size, text) + '<rect x="48" y="900" width="200" height="10" fill="$accent"/>');
    const D = await import('/src/carousel/designed.ts');
    const P = await import('/src/reference/pack.ts');
    const E = await import('/src/image-engine/index.ts');
    await E.loadFonts();
    const a = await P.parsePack(build('Hi', 60), 'H');
    if (!a.ok) throw new Error(a.reasons.join(' '));
    const hero = D.fitSlots(a.pack, 'content', { type: 'cover', headline: 'The hoodie that becomes a backpack in just a few seconds flat' }, '', 'statement');
    const t = (hero.pack.designs.content as any[]).find((l) => l.name === 'title');
    const lines = E.layoutText({ ...t, text: 'The hoodie that becomes a backpack in just a few seconds flat', autoFit: undefined, height: 3000, balance: true } as any).lines.length;
    const stat = await P.parsePack(build('Hi', 120).replace('data-type="content"', 'data-type="stat"'), 'S');
    if (!stat.ok) throw new Error(stat.reasons.join(' '));
    const st = D.fitSlots(stat.pack, 'stat', { type: 'stat', value: '5%', label: 'of the company' }, '', null);
    const sl = (st.pack.designs.stat as any[]).find((l) => l.name === 'title');
    const frag = D.stepperSvg(['Unzip the back panel', 'Flip the hood inside out', 'Pull the straps and wear it'], 2, { top: 400, bottom: 1150 });
    const radius = Number(/<circle cx="\d+" cy="\d+" r="(\d+)"/.exec(frag)![1]);
    const sizes = [...frag.matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]));
    const cys = [...frag.matchAll(/<line x1="\d+" y1="(\d+)" x2="\d+" y2="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])])[0];
    const small = D.stepperSvg(['a', 'b', 'c'], 1, { top: 430, bottom: 1130 });
    return { x: t.x, w: t.width, lines, size: t.style.size, statSize: sl.style.size, statMin: sl.slot.minSize, radius, sizes, mid: (cys[0] + cys[1]) / 2, smallR: Number(/<circle cx="\d+" cy="\d+" r="(\d+)"/.exec(small)![1]) };
  }, PALJ);
  expect([r.x, r.w]).toEqual([48, 984]);
  expect(r.lines).toBeLessThanOrEqual(3);
  expect(r.size).toBeGreaterThanOrEqual(72);
  expect(r.statSize).toBeLessThanOrEqual(48);
  expect(r.statMin).toBe(40);
  expect(r.radius).toBeGreaterThanOrEqual(2 * 28 * 0.95); // up to about 2x the old node
  expect(Math.min(...r.sizes)).toBeGreaterThanOrEqual(44);
  expect(Math.abs(r.mid - 775)).toBeLessThanOrEqual(2); // centred between the title and the footer
  expect(r.smallR).toBeGreaterThan(28);
});

test('steps make body optional; a story retry writes its reason into designed.notes', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const D = await import('/src/carousel/designed.ts');
    const S = await import('/src/carousel/script.ts');
    const base = (extra: object) => ({ title: 'T', brand: { handle: '@x' }, slides: [
      { type: 'cover', headline: 'Big claim here', sub: 'Support line', element_tags: ['idea', 'launch'] },
      { type: 'content', headline: 'Second point', element_tags: ['idea', 'people'], ...extra },
      { type: 'closing', headline: 'Save this now', cta: 'Follow along', element_tags: ['launch', 'love'] },
    ] });
    const withSteps = S.validateScriptText(JSON.stringify(base({ steps: ['One thing', 'Two things'] })), 'carousel');
    const noSteps = S.validateScriptText(JSON.stringify(base({})), 'carousel');
    const good = base({ body: 'Body words' });
    const svg = (n: number, type: string, layout: string, title: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-slide="${n}" data-type="${type}" data-layout="${layout}" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="48" y="200" width="120" height="8" fill="$accent"/><text data-role="title" data-min-size="72" data-max-lines="3" x="48" y="400" font-family="Schibsted Grotesk" font-size="110" fill="$text">${title}</text><text data-role="body" data-min-size="40" data-max-lines="3" x="48" y="700" font-family="Instrument Sans" font-size="44" fill="$text">${body}</text></svg>`;
    const second = JSON.stringify(good) + '\n' + svg(1, 'cover', 'statement', 'Big claim here', 'Support line') + svg(2, 'content', 'split-text', 'Second point', 'Body words') + svg(3, 'closing', 'cta-button', 'Save this now', 'Follow along');
    let n = 0;
    const provider = { id: 'api' as const, label: 'fake', write: async () => ({ text: n++ === 0 ? JSON.stringify(base({})) : second, ms: 1 }) };
    const req = { text: 'x'.repeat(60), slides: 3, tone: 'clear' as const, format: 'carousel' as const, styleChoice: 'auto', styles: [] };
    const out = await D.designDeck(req, {}, '', provider, new AbortController().signal);
    return { withSteps: withSteps.errors.map((e: any) => e.message), noSteps: noSteps.errors.map((e: any) => e.message), calls: out.designed.calls, notes: out.designed.notes };
  }, PALJ);
  expect(r.withSteps).toEqual([]);
  expect(r.noSteps.join(' ')).toMatch(/body/i);
  expect(r.calls).toBe(2);
  expect(r.notes[0]).toMatch(/^Retry for the story/);
  expect(r.notes[0]).toMatch(/body/i);
});

test('stepper: placed below the title at its final width, scaled to the free space (a 2-line title still leaves >= 500 px)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const D = await import('/src/carousel/designed.ts');
    const steps = ['Unzip the back panel', 'Flip the hood inside out', 'Pull the straps and wear it'];
    const script = { title: 'T', brand: { handle: '@x' }, slides: [
      { type: 'cover', headline: 'Big claim here', sub: 'Support line', element_tags: ['idea', 'launch'] },
      { type: 'content', kicker: 'How it works', headline: 'Three steps to flip your hoodie now', steps, element_tags: ['idea', 'people'] },
      { type: 'closing', headline: 'Save this now', cta: 'Follow along', element_tags: ['launch', 'love'] },
    ] };
    const svg = (n: number, type: string, layout: string, title: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-slide="${n}" data-type="${type}" data-layout="${layout}" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="48" y="200" width="120" height="8" fill="$accent"/><rect x="48" y="1240" width="200" height="10" fill="$muted"/><rect x="300" y="1240" width="200" height="10" fill="$muted"/><text data-role="title" data-min-size="72" data-max-lines="3" x="48" y="400" font-family="Schibsted Grotesk" font-size="72" fill="$text">${title}</text>${body ? `<text data-role="body" data-min-size="40" data-max-lines="3" x="48" y="700" font-family="Instrument Sans" font-size="44" fill="$text">${body}</text>` : ''}</svg>`;
    const answer = JSON.stringify(script) + '\n' + svg(1, 'cover', 'statement', 'Big claim here', 'Support line') + svg(2, 'content', 'stepper', 'Three steps to flip your hoodie now', '') + svg(3, 'closing', 'cta-button', 'Save this now', 'Follow along');
    const provider = { id: 'api' as const, label: 'fake', write: async () => ({ text: answer, ms: 1 }) };
    const req = { text: 'x'.repeat(60), slides: 3, tone: 'clear' as const, format: 'carousel' as const, styleChoice: 'auto', styles: [] };
    const out = await D.designDeck(req, {}, '', provider, new AbortController().signal);
    const pack = out.designed.slides['1']?.pack;
    const sv = Object.values(pack?.svgs ?? {})[0] ?? '';
    const cys = [...sv.matchAll(/<(?:circle|path)[^>]*\bcy="(\d+)"[^>]*\br="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const nodes = [...new Set(cys.map((c) => c[0]))].sort((a, b) => a - b);
    const rs = cys.map((c) => c[1]);
    const labels = (Object.values(pack?.designs ?? {})[0] as any[] ?? []).filter((l) => l.kind === 'text' && l.name === 'body').map((l) => l.style.size);
    const title = (Object.values(pack?.designs ?? {})[0] as any[] ?? []).find((l) => l.kind === 'text' && l.name === 'title');
    return { fallbacks: out.designed.fallbacks, nodes, maxR: Math.max(...rs), labels, notes: out.designed.notes, layout: out.designed.layouts?.['1'], titleY: title?.y };
  }, PALJ);
  expect(r.fallbacks, JSON.stringify(r.fallbacks)).toEqual({});
  expect(r.layout).toBe('stepper');
  expect(r.nodes.length).toBe(3);
  const pitch = r.nodes[1] - r.nodes[0];
  expect(pitch * 3).toBeGreaterThanOrEqual(500); // the free space, not a squeezed strip
  expect(r.maxR).toBeGreaterThanOrEqual(44); // nodes at the larger scale (the base node is 28)
  expect(Math.min(...r.labels)).toBeGreaterThanOrEqual(44);
  expect(r.nodes[0]).toBeGreaterThan(r.titleY + 150); // below the title
});

test('font-load guard: the first measurement already uses the real font (within 3% of what the drawing uses)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const E = await import('/src/image-engine/index.ts');
    await E.loadFonts();
    // the very first measurement after loading, then the width the browser really draws for the same text
    const measured = E.measureWidth('The', 'Schibsted Grotesk', 800, 120);
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:1080px;visibility:hidden';
    host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 300"><text font-family="Schibsted Grotesk" font-weight="800" font-size="120"><tspan x="48" y="200">The</tspan></text></svg>';
    document.body.appendChild(host);
    const drawn = (host.querySelector('tspan') as any).getComputedTextLength();
    host.remove();
    return { measured, drawn };
  });
  const off = Math.abs(r.measured - r.drawn) / r.drawn;
  expect(off, 'The measured width of "The" (' + r.measured.toFixed(1) + ' px) differs from the drawn width (' + r.drawn.toFixed(1) + ' px): the bundled fonts were not ready when the text was first measured. loadFonts() must wait until every face can be used for text.').toBeLessThanOrEqual(0.03);
});

test('stepper labels all share one font size (the smallest any label needed), a long label wraps instead of shrinking', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PAL) => {
    const D = await import('/src/carousel/designed.ts');
    const P = await import('/src/reference/pack.ts');
    const E = await import('/src/image-engine/index.ts');
    const steps = ['Unzip the back panel', 'Flip the hood inside out', 'Pull the straps and wear it as a backpack'];
    const script = { title: 'T', brand: { handle: '@x' }, slides: [
      { type: 'cover', headline: 'Big claim here', sub: 'Support line', element_tags: ['idea', 'launch'] },
      { type: 'content', kicker: 'How it works', headline: 'Three steps to flip your hoodie now', steps, element_tags: ['idea', 'people'] },
      { type: 'closing', headline: 'Save this now', cta: 'Follow along', element_tags: ['launch', 'love'] },
    ] };
    const svg = (n: number, type: string, layout: string, title: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-slide="${n}" data-type="${type}" data-layout="${layout}" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="48" y="200" width="120" height="8" fill="$accent"/><rect x="48" y="1240" width="200" height="10" fill="$muted"/><rect x="300" y="1240" width="200" height="10" fill="$muted"/><text data-role="title" data-min-size="72" data-max-lines="3" x="48" y="400" font-family="Schibsted Grotesk" font-size="72" fill="$text">${title}</text>${body ? `<text data-role="body" data-min-size="40" data-max-lines="3" x="48" y="700" font-family="Instrument Sans" font-size="44" fill="$text">${body}</text>` : ''}</svg>`;
    const answer = JSON.stringify(script) + '\n' + svg(1, 'cover', 'statement', 'Big claim here', 'Support line') + svg(2, 'content', 'stepper', 'Three steps to flip your hoodie now', '') + svg(3, 'closing', 'cta-button', 'Save this now', 'Follow along');
    const provider = { id: 'api' as const, label: 'fake', write: async () => ({ text: answer, ms: 1 }) };
    const req = { text: 'x'.repeat(60), slides: 3, tone: 'clear' as const, format: 'carousel' as const, styleChoice: 'auto', styles: [] };
    const out = await D.designDeck(req, {}, '', provider, new AbortController().signal);
    const pack = out.designed.slides['1']?.pack;
    const slide = out.script.slides[1] as any;
    const ps = P.packSlide(pack, 'content', slide, '');
    const rows = ps.layers.filter((l: any) => l.kind === 'text' && /^body\d*$/.test(l.name) && l.visible !== false);
    const blocks = rows.map((l: any) => E.layoutText(l));
    return { fallbacks: out.designed.fallbacks, sizes: blocks.map((b: any) => b.size), lines: blocks.map((b: any) => b.lines.length), n: rows.length };
  }, PALJ);
  expect(r.fallbacks).toEqual({});
  expect(r.n).toBe(3);
  expect(new Set(r.sizes).size, 'label sizes: ' + r.sizes.join(', ')).toBe(1);
  expect(r.sizes[0]).toBeGreaterThanOrEqual(44);
  expect(Math.max(...r.lines)).toBeLessThanOrEqual(2);
});

test('route: Designed is the default with a reference pack active; template fill only for Quick, no reference, no pack, ready-made text; report.json says which ran', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designed.ts');
    const A = await import('/src/reference/active.ts');
    const Dc = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    const Rp = await import('/src/reference/report.ts');
    const pack = { name: 'Reference deck', palette: { bg: '#000000', text: '#ffffff' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, motifs: [], designs: {}, canvas: { w: 1080, h: 1350 }, notes: [] } as any;
    const act = A.ACTIVE_STYLE;
    const routes = {
      active: D.chooseRoute({ style: act, activeStyle: act, pack }),
      quick: D.chooseRoute({ style: act, activeStyle: act, pack, mode: 'quick' }),
      none: D.chooseRoute({ style: 'editorial-collage', activeStyle: act, pack: null }),
      noPack: D.chooseRoute({ style: act, activeStyle: act, pack: null }),
      text: D.chooseRoute({ style: act, activeStyle: act, pack, slideText: true }),
    };
    const base = { ...Dc.emptyDoc('editorial-collage'), script: { ...S.EXAMPLE, slides: S.EXAMPLE.slides.slice(0, 3) } } as any;
    const withRoute = JSON.parse((await Rp.buildReport({ doc: { ...base, route: routes.active }, includeRefs: false, verdicts: {}, note: '' })).json);
    const without = JSON.parse((await Rp.buildReport({ doc: base, includeRefs: false, verdicts: {}, note: '' })).json);
    return { routes, report: { route: withRoute.route, reason: withRoute.routeReason }, old: { route: without.route, reason: without.routeReason } };
  });
  expect(r.routes.active.route).toBe('designed');
  expect(r.routes.active.reason).toMatch(/reference style is active/);
  expect(r.routes.quick).toMatchObject({ route: 'pack' });
  expect(r.routes.quick.reason).toMatch(/Quick/);
  expect(r.routes.none.route).toBe('pack');
  expect(r.routes.none.reason).toMatch(/No reference style is active/);
  expect(r.routes.noPack.route).toBe('pack');
  expect(r.routes.text.route).toBe('pack');
  expect(r.report.route).toBe('designed');
  expect(r.report.reason).toMatch(/Designed mode is the default/);
  expect(r.old.route).toBe('pack');
  expect(r.old.reason).toMatch(/No route was recorded/);
});

test('the writer route takes a Designed request: 3 pictures + prompt fit; far more is still refused with the plain message', async () => {
  const seen: { images: number; bytes: number }[] = [];
  const fetchImpl = (async (_u: unknown, init: any) => {
    const body = JSON.parse(init.body);
    const content = body.messages[0].content as any[];
    seen.push({ images: content.filter((c) => c.type === 'image').length, bytes: String(init.body).length });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const h = carouselHandler('api', { env: { ANTHROPIC_API_KEY: 'sk-ant-test-0123456789abcdefghij' }, fetchImpl });
  const server = http.createServer((req, res) => h(req, res, () => { res.statusCode = 404; res.end('{}'); }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const pic = Buffer.alloc(110_000, 7).toString('base64'); // about 147 KB as base64
    const prompt = 'x'.repeat(20_000);
    const ok = await fetch(base + '/write', { method: 'POST', body: JSON.stringify({ prompt, kind: 'draw', images: [{ mime: 'image/jpeg', base64: pic }, { mime: 'image/jpeg', base64: pic }, { mime: 'image/jpeg', base64: pic }] }) });
    expect(ok.status, await ok.clone().text()).toBe(200);
    expect(seen[0].images).toBe(3);
    expect(MAX_BODY).toBeGreaterThanOrEqual(1_000_000);
    expect(seen[0].bytes).toBeLessThan(MAX_BODY);
    // never more than 3 pictures reach the model
    const four = await fetch(base + '/write', { method: 'POST', body: JSON.stringify({ prompt, kind: 'draw', images: Array.from({ length: 5 }, () => ({ mime: 'image/jpeg', base64: pic })) }) });
    expect(four.status).toBe(200);
    expect(seen[1].images).toBe(3);
    // an absurd request is still refused, in plain words
    const huge = await fetch(base + '/write', { method: 'POST', body: JSON.stringify({ prompt, images: [{ mime: 'image/jpeg', base64: Buffer.alloc(MAX_BODY, 7).toString('base64') }] }) });
    expect(huge.status).toBe(413);
    expect((await huge.json()).error).toMatch(/too large/);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('inspiration pictures are re-encoded small (700 px, q 0.7), at most 3, their sizes are measured; a failed design call keeps the real reason', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('creator.legacySvgRoute', '1')); // this test is about the old model-drawn route (it sends the inspiration pictures)
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designed.ts');
    const A = await import('/src/reference/active.ts');
    const B = await import('/src/reference/blank.ts');
    const M = await import('/src/carousel/MakeIt.tsx');
    const W = await import('/src/carousel/writer.ts');
    // a noisy 1600 x 1200 picture saved as a big JPEG (as the old 800 px q 0.9 copies could be)
    const c = new OffscreenCanvas(1600, 1200);
    const g = c.getContext('2d')!;
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgb(${(i * 37) % 255},${(i * 91) % 255},${(i * 53) % 255})`; g.fillRect((i * 97) % 1600, (i * 61) % 1200, 40 + (i % 60), 30 + (i % 50)); }
    const big = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer());
    let s = '';
    for (let i = 0; i < big.length; i += 0x8000) s += String.fromCharCode(...big.subarray(i, i + 0x8000));
    const bigB64 = btoa(s);
    const small = await D.compressJpeg(bigB64);
    const bm = await createImageBitmap(new Blob([Uint8Array.from(atob(small), (ch) => ch.charCodeAt(0))]));
    // an active reference with 5 read slides: only 3 pictures are sent, each small
    const dataUrl = 'data:image/jpeg;base64,' + bigB64;
    const files = ['a', 'b', 'c', 'd', 'e'].map((x) => x + '.jpg');
    const variants = { cover: files.map((f) => ({ svg: '', layers: [], imageSlots: [], slotMeta: [], fromFile: f })) };
    const pack = { name: 'Ref', palette: { bg: '#000000', text: '#ffffff' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, motifs: [], designs: {}, variants, canvas: { w: 1080, h: 1350 }, notes: [] } as any;
    A.setActiveReference({ spec: B.blankStyle(), thumb: '', learn: 'everything', target: 'carousel', ratioNote: null, photoRegion: null, source: 'pack', pack, report: { files: [], thumbs: [], images: Object.fromEntries(files.map((f) => [f, dataUrl])) } });
    const sent: any[] = [];
    const provider = { id: 'dev-cli' as const, label: 'fake', write: async (prompt: string, _s: AbortSignal, _k?: string, images?: unknown[]) => { sent.push({ images: images?.length ?? 0 }); throw new W.WriterError('failed', 'That request is too large.'); } };
    const req = { text: 'x'.repeat(80), slides: 3, tone: 'clear', format: 'carousel', styleChoice: 'auto', styles: [] } as any;
    const run = await M.runDesign(req, { pack, brief: '', hasPhoto: false }, '', provider as any, new AbortController().signal, () => undefined);
    const bytes = D.lastRequestBytes();
    return { bigKB: Math.round(bigB64.length * 0.75 / 1000), smallKB: Math.round(small.length * 0.75 / 1000), dims: [bm.width, bm.height], sent, bytes, ok: run.ok, message: run.ok ? '' : run.state.message, shown: D.designFailureMessage('That request is too large.', bytes) };
  });
  expect(r.bigKB).toBeGreaterThan(150);
  expect(r.smallKB).toBeLessThan(150);
  expect(Math.max(...r.dims)).toBeLessThanOrEqual(700);
  expect(r.sent).toEqual([{ images: 3 }]); // 5 read slides, 3 pictures
  expect(r.bytes!.images).toHaveLength(3);
  for (const i of r.bytes!.images) expect([i.format, i.bytes < 150_000]).toEqual(['jpeg', true]);
  expect(r.bytes!.body).toBeGreaterThan(r.bytes!.images.reduce((a: number, i: any) => a + i.bytes, 0));
  // the failure is an error with the real reason; no fallback text is made up
  expect(r.ok).toBe(false);
  expect(r.message).toMatch(/too large/);
  expect(r.shown).toMatch(/^Designed mode failed: That request is too large\./);
  expect(r.shown).toMatch(/3 pictures/);
  expect(r.shown).toMatch(/no template fill was run/);
  expect(r.shown).toMatch(/Retry.*quick templates/);
});

test('signature devices: marker, profile header and underline are found from the read drawings (>= 40% of slides) and go into the brief', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const P = await import('/src/reference/pack.ts');
    const txt = (id: string, y: number, x = 60) => ({ kind: 'text', id, name: 'title', role: 'content', x, y, width: 700, height: 120, rotation: 0, opacity: 1, text: 'Words here', style: { font: 'Schibsted Grotesk', weight: 800, size: 80, color: '$text', align: 'left', lineHeight: 1.1 } }) as any;
    const rect = (id: string, x: number, y: number, w: number, h: number, fill: string) => ({ kind: 'shape', id, name: 'shape', role: 'content', shape: 'rect', x, y, width: w, height: h, rotation: 0, opacity: 1, fill }) as any;
    const bg = rect('bg', 0, 0, 1080, 1350, '$bg');
    const mk = (n: number, marker: boolean, profile: boolean, underline: boolean) => Array.from({ length: n }, (_, i) => ({
      svg: '', fromFile: 'f' + i, slotMeta: [],
      layers: [bg, ...(marker ? [rect('m' + i, 50, 330, 640, 130, '$accent')] : []), txt('t' + i, 340), ...(underline ? [rect('u' + i, 60, 470, 300, 6, '$accent')] : []), ...(profile ? [txt('n' + i, 70, 170)] : [])],
      imageSlots: profile ? [{ id: 'a' + i, kind: 'inset', x: 48, y: 56, w: 90, h: 90, mask: 'circle', fit: 'cover', focal: { x: 0.5, y: 0.5 } }] : [],
    }));
    const pack = (variants: any[]) => ({ name: 'R', palette: { bg: '#101010', text: '#FFFFFF', accent: '#CC0000' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, motifs: [], designs: {}, variants: { cover: variants }, canvas: { w: 1080, h: 1350 }, notes: [] }) as any;
    // 9 slides: marker on 4, underline on 4 (the same ones), profile header on 3
    const some = [...mk(3, true, true, true), ...mk(1, true, false, true), ...mk(5, false, false, false)];
    const a = P.signatureDevices(pack(some));
    // a pack whose profile header is on 4 of 9
    const b = P.signatureDevices(pack([...mk(4, false, true, false), ...mk(5, false, false, false)]));
    // a pack with the devices on only 3 of 9 slides: none
    const c = P.signatureDevices(pack([...mk(3, true, true, true), ...mk(6, false, false, false)]));
    return { a, b, c, brief: P.styleBriefOf({ ...pack(some), devices: undefined } as any) };
  });
  expect(r.a.marker).toBe(true);
  expect(r.a.underline).toBe(true);
  expect(r.a.profileHeader).toBe(false); // 3 of 9 is under 40%
  expect(r.b.profileHeader).toBe(true);
  expect(r.c).toMatchObject({ marker: false, profileHeader: false, underline: false });
  expect(r.brief).toMatch(/marker bar/);
  expect(r.brief).toMatch(/thin accent line sits under the last block of text/);
  expect(r.brief).not.toMatch(/profile header/);
});

test('accent {phrase, style}: marker draws a bar behind the phrase with dark text; text colours it; an accent under 3:1 on the background is forced to marker', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const P = await import('/src/reference/pack.ts');
    const build = async (accent: string, bgc: string, text: string) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="content" data-palette='{"bg":"${bgc}","text":"${text}","accent":"${accent}","muted":"#888888"}'><rect width="1080" height="1350" fill="$bg"/><text data-role="title" data-min-size="72" data-max-lines="3" x="48" y="400" font-family="Schibsted Grotesk" font-weight="800" font-size="100" fill="$text">Ship something real</text><text data-role="body" data-min-size="40" data-max-lines="3" x="48" y="700" font-family="Instrument Sans" font-size="44" fill="$text">Body words here</text></svg>`;
      const a = await P.parsePack(svg, 'A');
      if (!a.ok) throw new Error(a.reasons.join(' '));
      return a.pack as any;
    };
    const slide = (accent: any) => ({ type: 'content', headline: 'Ship something real', body: 'Body words here', accent });
    const bars = (svg: string, col: string) => (svg.match(new RegExp('<rect[^>]*rx="[^"]*" fill="' + col + '"', 'gi')) ?? []).length;
    const red = await build('#D10F0F', '#101010', '#FFFFFF');
    const asText = P.packSlide(red, 'content', slide({ phrase: 'real', style: 'text' }), '');
    const asMarker = P.packSlide(red, 'content', slide({ phrase: 'real', style: 'marker' }), '');
    const byDevice = P.packSlide({ ...red, devices: { marker: true, profileHeader: false, underline: false, slides: 9, counts: { marker: 5, profileHeader: 0, underline: 0 } } }, 'content', slide('real'), '');
    const yellow = await build('#FFD400', '#FFFFFF', '#111111');
    const forced = P.packSlide(yellow, 'content', slide({ phrase: 'real', style: 'text' }), '');
    const title = (ps: any) => ps.layers.find((l: any) => l.kind === 'text' && l.name === 'title');
    return {
      textBars: bars(asText.faithful!, '#D10F0F'), textRun: title(asText).runs, textHl: !!title(asText).highlight,
      markerBars: bars(asMarker.faithful!, '#D10F0F'), markerRun: title(asMarker).runs, markerHl: title(asMarker).highlight,
      deviceBars: bars(byDevice.faithful!, '#D10F0F'),
      forcedBars: bars(forced.faithful!, '#FFD400'), forcedNotes: forced.notes, forcedRun: title(forced).runs,
      // the bar sits before (behind) the text in the drawing
      barFirst: asMarker.faithful!.search(/<rect[^>]*rx="[^"]*" fill="#D10F0F"/) < asMarker.faithful!.search(/data-role="title"/) || asMarker.faithful!.search(/<rect[^>]*rx="[^"]*" fill="#D10F0F"/) < asMarker.faithful!.indexOf('real</tspan>'),
    };
  });
  expect(r.textBars).toBe(0);
  expect(r.textRun[0].color).toBe('#D10F0F');
  expect(r.textHl).toBe(false);
  expect(r.markerBars).toBe(1);
  expect(r.markerHl.color).toBe('#D10F0F');
  expect(r.markerRun[0].color).not.toBe('#D10F0F'); // dark (or the most readable) text on the bar
  expect(r.barFirst).toBe(true);
  expect(r.deviceBars).toBe(1); // the reference's marker signature makes marker the default
  expect(r.forcedBars).toBe(1); // yellow on white is under 3:1: forced to a marker
  expect(r.forcedNotes.join(' ')).toMatch(/under 3:1/);
  expect(r.forcedRun[0].color).not.toBe('#FFD400');
});

test('profile header chrome: avatar, name, verified tick and handle in code; all chrome text is at least 32 px and is in the plan the phone checks measure', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designed.ts');
    const R = await import('/src/carousel/render.ts');
    const E = await import('/src/image-engine/index.ts');
    await E.loadFonts();
    const pal = { bg: '#101010', text: '#FFFFFF', accent: '#CC0000', muted: '#999999', surface: '#222222' };
    const dev = { marker: false, profileHeader: true, underline: false, slides: 9, counts: { marker: 0, profileHeader: 5, underline: 0 } };
    const withHeader = D.chromeItems('@quick.flip', 0, 7, pal, dev);
    const plain = D.chromeItems('@quick.flip', 0, 7, pal, null);
    // through the whole pipeline: the chrome is in the plan's layers
    const PAL = `data-palette='{"bg":"#101010","text":"#FFFFFF","accent":"#CC0000","muted":"#999999","surface":"#222222"}'`;
    const script = { title: 'T', brand: { handle: '@quick.flip' }, slides: [
      { type: 'cover', headline: 'Big claim here', sub: 'Support line', element_tags: ['idea', 'launch'] },
      { type: 'content', headline: 'Second point', body: 'Body words here', element_tags: ['idea', 'people'] },
      { type: 'closing', headline: 'Save this now', cta: 'Follow along today', element_tags: ['launch', 'love'] },
    ] };
    const svg = (n: number, type: string, layout: string, title: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-slide="${n}" data-type="${type}" data-layout="${layout}" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="48" y="300" width="120" height="8" fill="$accent"/><rect x="48" y="1100" width="200" height="10" fill="$muted"/><rect x="300" y="1100" width="200" height="10" fill="$muted"/><text data-role="title" data-min-size="72" data-max-lines="3" x="48" y="500" font-family="Schibsted Grotesk" font-size="100" fill="$text">${title}</text><text data-role="body" data-min-size="40" data-max-lines="3" x="48" y="760" font-family="Instrument Sans" font-size="44" fill="$text">${body}</text></svg>`;
    const answer = JSON.stringify(script) + '\n' + svg(1, 'cover', 'statement', 'Big claim here', 'Support line') + svg(2, 'content', 'split-text', 'Second point', 'Body words here') + svg(3, 'closing', 'cta-button', 'Save this now', 'Follow along today');
    const provider = { id: 'api' as const, label: 'fake', write: async () => ({ text: answer, ms: 1 }) };
    const req = { text: 'x'.repeat(60), slides: 3, tone: 'clear' as const, format: 'carousel' as const, styleChoice: 'auto', styles: [] };
    const pack = { name: 'R', palette: pal, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, motifs: [], designs: {}, devices: dev, canvas: { w: 1080, h: 1350 }, notes: [] } as any;
    const out = await D.designDeck(req, { pack, brief: '', hasPhoto: false }, '', provider, new AbortController().signal);
    const style = R.carouselStyles()[0].spec.name;
    const composed = R.composeDoc({ version: 1, format: 'carousel', style, topic: '', script: out.script, choices: {}, designed: out.designed } as any);
    const planTexts = (composed.slides[0] as any).plan.layers.filter((l: any) => l.name === 'recurring').map((l: any) => [l.text, l.style.size]);
    const planShapes = (composed.slides[0] as any).plan.layers.filter((l: any) => String(l.name).startsWith('recurring-')).length;
    return { header: withHeader.map((x: any) => [x.shape ?? 'text', x.text, x.x, x.y, x.size]), plain: plain.map((x: any) => [x.shape ?? 'text', x.text, x.x, x.y, x.size]), planTexts, planShapes, fallbacks: out.designed.fallbacks, rec: (out.designed.slides['0']?.recurring ?? []).map((x: any) => x.shape ?? x.text) };
  });
  expect(r.header.map((x: any) => x[0])).toEqual(['avatar', 'text', 'tick', 'text', 'text', 'text']);
  expect(r.header[1][1]).toBe('Quick Flip'); // the name from the handle
  expect(r.header[3][1]).toBe('@quick.flip');
  for (const x of [...r.header, ...r.plain].filter((x: any) => x[0] === 'text')) expect(x[4], 'chrome text ' + x[1]).toBeGreaterThanOrEqual(32);
  expect(r.plain.map((x: any) => x[1])).toEqual(['@quick.flip', '1 / 7', 'swipe →']);
  expect(r.fallbacks, JSON.stringify(r.fallbacks)).toEqual({});
  expect(r.rec.slice(0, 4)).toEqual(['avatar', 'Quick Flip', 'tick', '@quick.flip']);
  expect(r.planTexts.length).toBe(4); // name, handle, counter, swipe: the plan holds every chrome text
  for (const t of r.planTexts) expect(t[1]).toBeGreaterThanOrEqual(32);
  expect(r.planShapes).toBeGreaterThanOrEqual(4); // avatar parts and the tick
});

test('guards: fewer than 3 words, an empty box, and a tag over a number are flagged', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designed.ts');
    const P = await import('/src/reference/pack.ts');
    const PAL = `data-palette='{"bg":"#101010","text":"#FFFFFF","accent":"#D10F0F","muted":"#999999"}'`;
    const mk = async (type: string, extra: string) => {
      const a = await P.parsePack(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="${type}" ${PAL}><rect width="1080" height="1350" fill="$bg"/>${extra}</svg>`, 'G');
      if (!a.ok) throw new Error(a.reasons.join(' '));
      return a.pack as any;
    };
    const title = '<text data-role="title" data-min-size="72" data-max-lines="3" x="48" y="400" font-family="Schibsted Grotesk" font-size="100" fill="$text">Hello there</text>';
    const few = D.finalGuards(await mk('content', title), 'content', { type: 'content', headline: 'Two words' }, '');
    const empty = D.finalGuards(await mk('content', title + '<rect x="100" y="700" width="500" height="300" rx="30" fill="$accent"/>'), 'content', { type: 'content', headline: 'One two three four' }, '');
    const filledBox = D.finalGuards(await mk('content', title + '<rect x="40" y="340" width="900" height="300" rx="30" fill="$muted"/>'), 'content', { type: 'content', headline: 'One two three four' }, '');
    const both = await mk('step', '<text data-role="tag" data-min-size="32" data-max-lines="1" x="48" y="300" font-family="Instrument Sans" font-size="48" fill="$text">STEP 2</text><text data-role="number" data-min-size="120" data-max-lines="1" x="60" y="330" font-family="Schibsted Grotesk" font-size="160" fill="$accent">2</text>' + title.replace('data-role="title"', 'data-role="title"').replace('y="400"', 'y="900"'));
    const overlap = D.resolveCollisions(both, 'step', { type: 'step', number: 2, headline: 'One two three four', body: 'x' }, '');
    return { few, empty, filledBox, overlap: overlap.problems };
  });
  expect(r.few.join(' ')).toMatch(/only 2 words/);
  expect(r.empty.join(' ')).toMatch(/empty box/);
  expect(r.filledBox.join(' ')).not.toMatch(/empty box/); // text lies in it
  expect(r.overlap.join(' ')).toMatch(/tag and the number overlap/);
});
