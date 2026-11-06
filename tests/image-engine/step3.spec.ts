// Step 3 (no model): marker bars (no trailing punctuation, 12 px clear space), accent article strip, Title Case name, the writer prompt rules, the layout picker and
// Rewrite text (the code redraws; only Rewrite text calls the model), the usage log of the API providers and the cost script's totals.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readWithApi, readCall } from '../../server/reference-reader';
import { writeWithApi } from '../../server/carousel-writer';

test.setTimeout(300_000);

const PACKS = `
  const layer = (o) => ({ kind: 'shape', id: 'p', name: 'shape', role: 'decor', rotation: 0, opacity: 1, shape: 'rect', ...o });
  const base = { motifs: [], designs: {}, canvas: { w: 1080, h: 1350 }, notes: [] };
  const dark = { ...base, name: 'Quick Flip', palette: { bg: '#0A0A0A', text: '#FFFFFF', accent: '#CC0000', muted: '#8A8A8A', surface: '#161616' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, svgs: { cover: '<svg><radialGradient id="g"/></svg>' }, variants: { cover: [{ svg: '', layers: [layer({ x: -60, y: 950, width: 1200, height: 500, fill: '#CC0000' })], imageSlots: [], slotMeta: [], fromFile: 'a' }] }, devices: { marker: false, profileHeader: true, underline: false, slides: 1, counts: { marker: 0, profileHeader: 1, underline: 0 } } };
  const STYLE = { palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#D9F77A', surface: '#F0F0F0' }, fonts: { headline: 'Schibsted Grotesk', body: 'Schibsted Grotesk' }, background: 'flat', devices: { marker: true, profileHeader: true, underline: false, planes: false }, accentStyle: 'marker' };
`;
const ANSWER = `{ "title": "Quick Flip", "slides": [
  { "layout": "statement", "fields": { "kicker": "Now on Kickstarter", "headline": "Flip your hoodie", "caption": "One piece. Two jobs." }, "accents": ["the hoodie"] },
  { "layout": "lead-statement", "fields": { "lead": "It started in a taxi", "headline": "We ditched the bag" }, "accents": ["bag"] },
  { "layout": "stepper", "fields": { "title": "How it flips", "steps": ["Zip the hood in", "Fold the sleeves", "Pull the straps"] } },
  { "layout": "split-text", "fields": { "headline": "Slide and bite", "paragraph": "Slide the zip, bite the clasp, and it locks." } },
  { "layout": "checklist", "fields": { "title": "Why you will love it", "items": ["Waterproof shell", "Fits a laptop", "Machine washable"] } },
  { "layout": "stat-bar", "fields": { "number": "30%", "label": "off for early backers", "bar": "30" } },
  { "layout": "cta-button", "fields": { "headline": "Back Quick Flip today", "button": "Back it now" }, "accents": ["today"] } ] }`;
const REQ = { text: 'Quick Flip is a hoodie that flips into a backpack in 10 seconds. '.repeat(3), slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'auto', styles: [] };

test('marker bars stop before trailing punctuation and keep 12 px clear of the words beside them', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (packs) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const T = await import('/src/image-engine/draw/text.ts');
    const { STYLE } = new Function(packs + ' return { STYLE };')();
    const cases: [string, any, string[]][] = [
      ['statement', { headline: 'Early backers save 30%, so join today', caption: 'Open to 20 backers only.' }, ['save 30%,']],
      ['statement', { headline: 'Say it, then show it. Then repeat', kicker: 'A rule' }, ['show it.']],
      ['lead-statement', { lead: 'Here is the thing:', headline: 'Fix your headline first, then the rest' }, ['headline first,']],
      ['big-question', { question: 'Would you wear it, or carry it?', line: 'Pick one.' }, ['wear it,']],
      ['cta-button', { headline: 'Back it today: save 30%', button: 'Back it', sub: 'Open to 20 backers.' }, ['today:']],
      ['split-text', { headline: 'Why we built it, and why now', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' }, ['built it,']],
    ];
    const bad: string[] = [];
    let marks = 0;
    let checkedGaps = 0;
    for (const v of [0, 1] as const) for (const [id, f, acc] of cases) {
      const b = await L.buildSlide(id, v, { ...f, accent: acc }, STYLE, { handle: '@h', index: 2, total: 7 });
      if (!b.ok) { bad.push(`${id}/v${v}: not drawn: ${b.errors.join(' | ')}`); continue; }
      for (const l of b.layers as any[]) {
        if (l.kind !== 'text' || !l.highlight || !(l.highlight.paddingX > 0)) continue;
        const m = T.layoutText(l);
        const pad = l.highlight.paddingX;
        for (const line of m.lines) {
          const words = line.words as { text: string; x: number; width: number; highlighted: boolean }[];
          for (const mk of line.marks as { x: number; width: number }[]) {
            marks++;
            // the bar must end before any punctuation that ends the marked words
            const last = [...words].reverse().find((w) => w.highlighted && w.x <= mk.x + mk.width + 0.5);
            if (last && /[.,;:!?]$/.test(last.text) && last.x + last.width - (mk.x + mk.width) < 1) bad.push(`${id}/v${v}: the bar covers the punctuation of "${last.text}"`);
            const left = [...words].reverse().find((w) => !w.highlighted && w.x + w.width <= mk.x + 0.5);
            const right = words.find((w) => !w.highlighted && w.x >= mk.x + mk.width - 0.5);
            if (left) { checkedGaps++; if (mk.x - pad - (left.x + left.width) < 11.5) bad.push(`${id}/v${v}: ${Math.round(mk.x - pad - (left.x + left.width))} px between "${left.text}" and the bar`); }
            if (right) { checkedGaps++; if (right.x - (mk.x + mk.width + pad) < 11.5) bad.push(`${id}/v${v}: ${Math.round(right.x - (mk.x + mk.width + pad))} px between the bar and "${right.text}"`); }
          }
        }
      }
    }
    return { bad, marks, checkedGaps };
  }, PACKS);
  expect(r.marks).toBeGreaterThan(5);
  expect(r.checkedGaps).toBeGreaterThan(5);
  expect(r.bad).toEqual([]);
});

test('accent phrases lose a leading article; the name is Title Case', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (packs) => {
    const L = await import('/src/carousel/layouts/library.ts');
    const L2 = await import('/src/carousel/layouts/index.ts');
    const Dz = await import('/src/carousel/designed.ts');
    const { STYLE } = new Function(packs + ' return { STYLE };')();
    const b = await L2.buildSlide('statement', 0, { headline: 'Lead with a result', accent: ['a result'] }, STYLE, { handle: '@harsh.parekh', index: 1, total: 7 });
    const title = (b.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
    const names = (b.layers as any[]).filter((l) => l.kind === 'text').map((l) => l.text);
    return {
      strip: ['a result', 'the hoodie', 'An idea', 'the', 'the  big  idea', 'a the thing', 'save 30%,'].map(L.stripArticle),
      hl: title.highlight?.words ?? null,
      names,
      title: ['harsh.parekh', 'harsh parekh', 'Harsh parekh', 'McKenzie lee', 'mary-jane o\'neil', '@quick_flip'].map((h) => Dz.profileName(h)),
      given: Dz.titleCaseName('harsh   parekh'),
    };
  }, PACKS);
  expect(r.strip).toEqual(['result', 'hoodie', 'idea', 'the', 'big  idea', 'thing', 'save 30%']);
  expect(r.hl, 'only "result" is marked, not "a result"').toEqual(['result']);
  expect(r.names).toContain('Harsh Parekh');
  expect(r.names).not.toContain('Harsh parekh');
  expect(r.title).toEqual(['Harsh Parekh', 'Harsh Parekh', 'Harsh Parekh', 'McKenzie Lee', "Mary Jane O'Neil", 'Quick Flip']);
  expect(r.given).toBe('Harsh Parekh');
});

test('the writer prompt: a stat label continues the number; split-text is one idea in 14 words', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (packs) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const P = await import('/src/carousel/layouts/index.ts');
    const { STYLE } = new Function(packs + ' return { STYLE };')();
    const prompt = D.buildLibraryPrompt({ text: 'x '.repeat(80), slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'auto', styles: [] } as any, {}, STYLE, 'a look', 7);
    const ok14 = P.validateSlideContent('split-text', { headline: 'Why', paragraph: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen' });
    const bad15 = P.validateSlideContent('split-text', { headline: 'Why', paragraph: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen' });
    return { prompt, ok14: ok14.ok, bad15: bad15.errors };
  }, PACKS);
  expect(r.prompt).toContain('"30%" + "off for early backers"');
  expect(r.prompt).toContain('never a label that starts a new sentence');
  expect(r.prompt).toMatch(/split-text: the paragraph is ONE idea in at most 14 words/);
  expect(r.prompt).toMatch(/paragraph[^\n]*at most 14 words/);
  expect(r.ok14).toBe(true);
  expect(r.bad15.join(' ')).toContain('15 words');
});

test('layout picker: options map the text without inventing any; a pick redraws one slide in code, keeps its pin and makes no model call', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ packs, answer, req }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const K = await import('/src/carousel/designLibraryPick.ts');
    const { dark } = new Function(packs + ' return { dark };')();
    let calls = 0;
    const provider: any = { id: 'dev-cli', label: 'fake', async write() { calls++; return { text: answer, ms: 5, usage: { input: 10, output: 5 } }; } };
    const first = await D.designLibraryDeck(req, { pack: dark }, '@quick.flip', provider, new AbortController().signal);
    const lib = first.designed.library!;
    const afterDeck = calls;
    const look = { pack: dark };
    const opts = (i: number) => K.layoutOptions(lib.plan!.specs[i], look).map((o: any) => [o.layout, o.dropped.length]);
    const out: any = { afterDeck, opts0: opts(0), opts4: opts(4), opts5: opts(5), opts6: opts(6) };
    // the pictures of the options
    const tiles: any[] = [];
    await K.previewOptions(lib, look, '@quick.flip', 0, (t: any) => tiles.push(t));
    out.tiles = tiles.map((t) => ({ kind: t.kind, id: t.id, current: t.current, svg: /^<svg/.test(t.svg) })).slice(0, 40);
    // pick a layout for slide 1
    const svgs = Object.fromEntries(Object.entries<any>(first.designed.slides).map(([k, s]) => [k, s.built.svg]));
    const pick = await K.redrawLibrarySlide(lib, look, '@quick.flip', 0, { layout: 'big-question' });
    out.pick = pick.ok ? { layout: pick.layout, pin: pick.spec.pin, redraws: pick.library.redraws, layouts: pick.library.layouts, fields: pick.spec.fields, scriptType: (pick.scriptSlide as any).type, changed: pick.slide.built.svg !== svgs['0'], accents: pick.spec.accents } : pick;
    // a cut for slide 3 (stepper)
    const cut = await K.redrawLibrarySlide(lib, look, '@quick.flip', 2, { cut: 'angle' });
    out.cut = cut.ok ? { cut: cut.library.cuts[2], pin: cut.spec.pin, changed: cut.slide.built.svg !== svgs['2'], layout: cut.layout } : cut;
    // a layout the text cannot move to
    out.refused = await K.redrawLibrarySlide(lib, look, '@quick.flip', 0, { layout: 'big-stat' });
    // the style toggles after a pick keep the pick
    if (pick.ok) {
      const again = await D.redrawLibraryDeck(pick.library, { pack: { ...dark, overrides: { shapes: 'bold' } } }, '@quick.flip');
      out.kept = { layout0: again.library.layouts[0], cut0: again.library.cuts[0], pin: again.library.plan!.specs[0].pin };
    }
    out.callsAfterPicks = calls;
    return out;
  }, { packs: PACKS, answer: ANSWER, req: REQ });
  // the statement (kicker, headline, caption) can be a lead-in statement, a question, a split text; never a stat or a button
  const ids0 = r.opts0.map((x: [string, number]) => x[0]);
  expect(ids0[0]).toBe('statement');
  expect(ids0).toEqual(expect.arrayContaining(['lead-statement', 'big-question', 'split-text']));
  for (const no of ['big-stat', 'stat-bar', 'cta-button', 'photo-led', 'comparison']) expect(ids0, `${no} needs text the slide does not have`).not.toContain(no);
  // the checklist (title + 3 items) can be a numbered list or a stepper; a bare statement would leave the items out, so it is never offered
  const ids4 = r.opts4.map((x: [string, number]) => x[0]);
  expect(ids4).toEqual(expect.arrayContaining(['numbered-list', 'stepper']));
  expect(ids4).not.toContain('statement');
  expect(r.opts6.map((x: [string, number]) => x[0])).not.toContain('stat-bar');
  // the pictures
  const kinds = new Set(r.tiles.map((t: any) => t.kind));
  expect([...kinds]).toEqual(expect.arrayContaining(['layout', 'cut', 'variant']));
  expect(r.tiles.every((t: any) => t.svg)).toBe(true);
  expect(r.tiles.filter((t: any) => t.current).length).toBe(1);
  // a pick
  expect(r.pick.layout).toBe('big-question');
  expect(r.pick.layouts[0]).toBe('big-question');
  expect(r.pick.changed).toBe(true);
  expect(r.pick.pin.variant).not.toBeUndefined();
  expect(r.pick.scriptType).toBe('cover');
  expect(r.pick.fields).toEqual({ question: 'Flip your hoodie', line: 'One piece. Two jobs.' });
  expect(r.pick.accents, 'an accent that still stands in the text is kept').toEqual(['the hoodie'].filter((a) => 'flip your hoodie'.includes(a)));
  expect(r.cut.cut).toBe('angle');
  expect(r.cut.changed).toBe(true);
  expect(r.cut.layout).toBe('stepper');
  expect(r.refused.ok).toBe(false);
  expect(r.kept.layout0).toBe('big-question');
  expect(r.kept.pin).toBeTruthy();
  expect(r.callsAfterPicks, 'picking and redrawing make no model call').toBe(r.afterDeck);
});

test('Rewrite text: one small model call for one slide, same layout; a bad answer is retried once and then changes nothing', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ packs, answer, req }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const K = await import('/src/carousel/designLibraryPick.ts');
    const { dark } = new Function(packs + ' return { dark };')();
    const deckProvider: any = { id: 'dev-cli', label: 'fake', async write() { return { text: answer, ms: 5, usage: { input: 100, output: 50 } }; } };
    const first = await D.designLibraryDeck(req, { pack: dark }, '@quick.flip', deckProvider, new AbortController().signal);
    const lib = first.designed.library!;
    const look = { pack: dark };
    const svgs = Object.fromEntries(Object.entries<any>(first.designed.slides).map(([k, s]) => [k, s.built.svg]));
    const prompts: string[] = [];
    const scripted = (answers: string[]): any => ({ id: 'dev-cli', label: 'fake', async write(p: string) { prompts.push(p); return { text: answers.shift() ?? '{}', ms: 3, usage: { input: 40, output: 20 } }; } });
    const good = await K.rewriteSlideText(lib, look, '@quick.flip', 5, 'Early backers save 30%.', 'punchier', scripted(['{"fields": {"number": "30%", "label": "off for early backers", "bar": "30"}, "accents": []}']), new AbortController().signal);
    const retried = await K.rewriteSlideText(lib, look, '@quick.flip', 3, 'text', '', scripted(['{"fields": {"headline": "Slide and bite", "paragraph": "' + 'word '.repeat(20) + '"}}', '{"fields": {"headline": "Slide, bite, lock", "paragraph": "The clasp bites and the hoodie locks into place."}, "accents": ["bite"]}']), new AbortController().signal);
    const failed = await K.rewriteSlideText(lib, look, '@quick.flip', 3, 'text', '', scripted(['not json', '{"fields": {"headline": "x"}}']), new AbortController().signal);
    return {
      prompt: prompts[0],
      good: good.ok ? { calls: good.calls, layout: good.slide.layout, fields: good.slide.spec.fields, changed: good.slide.slide.built.svg !== svgs['5'], others: Object.keys(first.designed.slides).length, libCalls: good.slide.library.calls, tokens: good.slide.library.tokens } : good,
      retried: retried.ok ? { calls: retried.calls, fields: retried.slide.spec.fields, accents: retried.slide.spec.accents } : retried,
      failed: failed.ok ? 'ok?' : { calls: failed.calls, reasons: failed.reasons },
      deckCalls: lib.calls,
    };
  }, { packs: PACKS, answer: ANSWER, req: REQ });
  expect(r.prompt).toContain('Rewrite the text of ONE slide');
  expect(r.prompt).toContain('"stat-bar"'.replace(/"/g, '')); // the layout id is named
  expect(r.prompt).toContain('finishes the number');
  expect((r.good as any).calls).toBe(1);
  expect((r.good as any).layout).toBe('stat-bar');
  expect((r.good as any).fields).toEqual({ number: '30%', label: 'off for early backers', bar: '30' });
  expect((r.good as any).libCalls).toBe(r.deckCalls + 1);
  expect((r.retried as any).calls, 'a bad answer gets one more call').toBe(2);
  expect((r.retried as any).fields.paragraph).toBe('The clasp bites and the hoodie locks into place.');
  expect((r.failed as any).calls).toBe(2);
  expect((r.failed as any).reasons.length).toBeGreaterThan(0);
});

test('the API providers log token counts (and never the key); the cost script totals reader and writer apart', async () => {
  const log = path.join(os.tmpdir(), 'usage-' + Math.random().toString(16).slice(2) + '.jsonl');
  const env = { ANTHROPIC_API_KEY: 'TESTKEY-not-real-123', USAGE_LOG: log } as unknown as NodeJS.ProcessEnv;
  const fetchImpl = (async (_u: unknown, init: { body: string }) => {
    const b = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: b.model.includes('haiku') ? 1000 : 2000, output_tokens: 300 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const w = await writeWithApi('hello', new AbortController().signal, env, fetchImpl);
  const rd = await readWithApi(readCall({ role: 'read', prompt: 'p', images: [{ name: 'a', mime: 'image/jpeg', base64: 'AAAA' }] }), new AbortController().signal, env, fetchImpl);
  expect(w.usage).toEqual({ input: 1000, output: 300 });
  expect(rd.usage).toEqual({ input: 2000, output: 300 });
  const text = fs.readFileSync(log, 'utf8');
  expect(text).not.toContain('TESTKEY');
  expect(text).not.toContain('hello');
  const rows = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  expect(rows.map((x) => [x.route, x.model, x.input, x.output])).toEqual([['writer', 'claude-haiku-5-5', 1000, 300], ['reader', 'claude-sonnet-5-5', 2000, 300]]);
  // the totals: markers say what the API rows after them belong to
  const C = (await import(pathToFileURL(path.resolve('scripts/cost-real.mjs')).href)) as { summarise: (r: unknown[], p: unknown) => any; parseUsage: (t: string) => unknown[]; renderMarkdown: (s: unknown) => string };
  const mk = (ref: string, phase: string, n?: number) => ({ marker: { ref, phase, ...(n ? { n } : {}) } });
  const row = (route: string, model: string, input: number, output: number) => ({ route, model, input, output, ms: 1 });
  const all = [mk('dark', 'read'), row('reader', 'claude-sonnet-5-5', 9000, 800), mk('dark', 'carousel', 1), row('writer', 'claude-haiku-5-5', 1500, 700), mk('dark', 'carousel', 2), row('writer', 'claude-haiku-5-5', 1500, 650), row('writer', 'claude-haiku-5-5', 200, 100), mk('light', 'read'), row('reader', 'claude-sonnet-5-5', 8000, 900), mk('light', 'carousel', 1), row('writer', 'claude-haiku-5-5', 1400, 600)];
  const blank = C.summarise(all, { models: { 'claude-haiku-5-5': { inputPerMTok: null, outputPerMTok: null }, 'claude-sonnet-5-5': {} } });
  expect(blank.totals.reader).toMatchObject({ calls: 2, input: 17000, output: 1700 });
  expect(blank.totals.writer).toMatchObject({ calls: 4, input: 4600, output: 2050 });
  expect(blank.references.dark.carousels.map((c: any) => [c.n, c.writer.calls, c.writer.input, c.writer.output])).toEqual([[1, 1, 1500, 700], [2, 2, 1700, 750]]);
  expect(blank.references.dark.carousels.every((c: any) => c.reader.calls === 0)).toBe(true);
  expect(blank.totals.usd, 'blank prices: no USD').toBeNull();
  expect(blank.pricesMissing.join(' ')).toContain('claude-haiku-5-5');
  expect(blank.pricesMissing.join(' ')).toContain('claude-sonnet-5-5');
  const priced = C.summarise(all, { models: { 'claude-haiku-5-5': { inputPerMTok: 1, outputPerMTok: 5 }, 'claude-sonnet-5-5': { inputPerMTok: 3, outputPerMTok: 15 } } });
  // reader: (17000 x 3 + 1700 x 15) / 1e6 = 0.0765; writer: (4600 x 1 + 2050 x 5) / 1e6 = 0.01485
  expect(priced.totals.reader.usd).toBeCloseTo(0.0765, 6);
  expect(priced.totals.writer.usd).toBeCloseTo(0.01485, 6);
  expect(priced.totals.usd).toBeCloseTo(0.09135, 6);
  expect(C.renderMarkdown(blank)).toContain('not computed');
  const shipped = JSON.parse(fs.readFileSync('config/prices.json', 'utf8'));
  for (const m of Object.values<any>(shipped.models)) for (const v of Object.values(m)) expect(v, 'the shipped prices are blank for you to fill in').toBeNull();
  fs.rmSync(log, { force: true });
});
