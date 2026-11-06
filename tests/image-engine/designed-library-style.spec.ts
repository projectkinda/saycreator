// Round 5 (no model): the detected devices as overrides (a re-draw from the stored plan with no model call; stored apart from the read cache), the reader's yes/no device checks
// (the prompt, the parsed answers and the decision), temperature 0 for the API reader, and the accent lightened for text on a dark ground (the brand colour is not changed).
import { expect, test } from '@playwright/test';
import { readWithApi, readCall } from '../../server/reference-reader';

test.setTimeout(240_000);

const PACKS = `
  const layer = (o) => ({ kind: 'shape', id: 'p', name: 'shape', role: 'decor', rotation: 0, opacity: 1, shape: 'rect', ...o });
  const base = { motifs: [], designs: {}, canvas: { w: 1080, h: 1350 }, notes: [] };
  const dark = { ...base, name: 'Quick Flip', palette: { bg: '#0A0A0A', text: '#FFFFFF', accent: '#CC0000', muted: '#8A8A8A', surface: '#161616' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, svgs: { cover: '<svg><radialGradient id="g"/></svg>' }, variants: { cover: [{ svg: '', layers: [layer({ x: -60, y: 950, width: 1200, height: 500, fill: '#CC0000' })], imageSlots: [], slotMeta: [], fromFile: 'a' }] }, devices: { marker: false, profileHeader: true, underline: false, slides: 1, counts: { marker: 0, profileHeader: 1, underline: 0 } } };
  const light = { ...base, name: 'Harsh', palette: { bg: '#FFFFFF', text: '#0A0A0A', accent: '#D9F76A', muted: '#6B6B6B', surface: '#F0F0F0' }, fonts: { headline: 'Schibsted Grotesk', body: 'Schibsted Grotesk' }, svgs: { cover: '<svg></svg>' }, variants: { cover: [{ svg: '', layers: [layer({ x: 48, y: 400, width: 300, height: 100, fill: '#D9F76A' })], imageSlots: [], slotMeta: [], fromFile: 'a' }] }, devices: { marker: true, profileHeader: true, underline: false, slides: 1, counts: { marker: 1, profileHeader: 1, underline: 0 } } };
`;
const ANSWER = `{ "title": "Quick Flip", "slides": [
  { "layout": "statement", "fields": { "kicker": "Now on Kickstarter", "headline": "Flip your hoodie", "caption": "One piece. Two jobs." }, "accents": ["hoodie"] },
  { "layout": "lead-statement", "fields": { "lead": "It started in a taxi", "headline": "We ditched the bag" }, "accents": ["bag"] },
  { "layout": "stepper", "fields": { "title": "How it flips", "steps": ["Zip the hood in", "Fold the sleeves", "Pull the straps"] } },
  { "layout": "feature-slider", "fields": { "title": "Slide and bite", "body": "Slide the zip, bite the clasp, and it locks." } },
  { "layout": "checklist", "fields": { "title": "Why you will love it", "items": ["Waterproof shell", "Fits a laptop", "Machine washable"] } },
  { "layout": "stat-bar", "fields": { "number": "$500,000", "label": "for 5% of the company", "bar": "5" } },
  { "layout": "cta-button", "fields": { "headline": "Back Quick Flip today", "button": "Back it now" }, "accents": ["today"] } ] }`;
const REQ = { text: 'Quick Flip is a hoodie that flips into a backpack in 10 seconds. '.repeat(3), slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'auto', styles: [] };

test('overrides: the toggles draw the deck again from its plan with no model call, and are stored apart from the read cache', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ packs, answer, req }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const O = await import('/src/reference/overrides.ts');
    const C = await import('/src/reference/cache.ts');
    const { dark, light } = new Function(packs + ' return { dark, light };')();
    let calls = 0;
    const provider: any = { id: 'dev-cli', label: 'fake', async write() { calls++; return { text: answer, ms: 5 }; } };
    const first = await D.designLibraryDeck(req, { pack: dark }, '@quick.flip', provider, new AbortController().signal);
    const lib0 = first.designed.library!;
    const callsAfterFirst = calls;
    const out: any = { callsAfterFirst, hasPlan: !!lib0.plan, planSlides: lib0.plan?.specs.length, firstCuts: lib0.cuts };
    const redraw = async (pack: any, ov: any) => {
      const lib = lib0;
      const res = await D.redrawLibraryDeck(lib, { pack: { ...pack, overrides: ov } }, '@quick.flip');
      const layers = (i: number) => Object.values<any>(res.slides)[i].built.layers as any[];
      const svg = (i: number) => Object.values<any>(res.slides)[i].built.svg as string;
      return { cuts: res.library.cuts, n: Object.keys(res.slides).length, redraws: res.library.redraws, avatar: layers(0).some((l) => l.name === 'recurring-avatar'), hl: layers(0).some((l: any) => l.kind === 'text' && l.name === 'title' && !!l.highlight), underline: /height="10"[^>]*rx="5"/.test(svg(0)), planeFills: res.library.cuts.filter((c: string) => c !== 'plain').length, style: res.library.style.devices, strength: (res.library.style as any).planeStrength ?? null };
    };
    out.dark = {
      base: await redraw(dark, undefined),
      off: await redraw(dark, { shapes: 'off' }),
      bold: await redraw(dark, { shapes: 'bold' }),
      subtle: await redraw(dark, { shapes: 'subtle' }),
      markerOn: await redraw(dark, { marker: true }),
      underlineOn: await redraw(dark, { underline: true }),
      profileOff: await redraw(dark, { profileHeader: false }),
    };
    out.light = { markerOff: await redraw(light, { marker: false }), base: await redraw(light, undefined) };
    out.callsAfterRedraws = calls;
    // stored apart from the read cache
    const key = 'test-key-' + Math.random().toString(16).slice(2);
    await C.cachePut(key, { pack: { name: 'read', palette: { bg: '#000000', text: '#FFFFFF' } }, report: {} } as any);
    O.saveOverrides(key, { marker: true, shapes: 'bold' });
    const again = O.withOverrides({ name: 'read', palette: { bg: '#000000', text: '#FFFFFF' } } as any, key);
    const cached: any = await C.cacheGet(key);
    out.persist = { withOv: again.overrides, readKey: again.readKey === key, cachedHasOverrides: JSON.stringify(cached).includes('overrides'), loaded: O.loadOverrides(key) };
    O.saveOverrides(key, null);
    out.persist.cleared = O.loadOverrides(key);
    out.apply = D.applyOverrides(D.styleFromPack(dark).style, { marker: true, underline: true, profileHeader: false, shapes: 'subtle' }).style;
    return out;
  }, { packs: PACKS, answer: ANSWER, req: REQ });
  expect(r.hasPlan).toBe(true);
  expect(r.planSlides).toBe(7);
  expect(r.callsAfterRedraws, 'no model call for any re-draw').toBe(r.callsAfterFirst);
  // shapes
  expect(r.dark.off.cuts.every((c: string) => c === 'plain')).toBe(true);
  expect(r.dark.off.style.planes).toBe(false);
  expect(r.dark.bold.planeFills).toBeGreaterThan(0);
  expect(r.dark.bold.strength).toBe('bold');
  expect(r.dark.subtle.planeFills).toBeGreaterThan(0);
  expect(r.dark.subtle.strength).toBe('subtle');
  expect(r.dark.base.redraws).toBe(1);
  // marker, underline, profile header
  expect(r.dark.base.hl).toBe(false);
  expect(r.dark.markerOn.hl).toBe(true);
  expect(r.light.base.hl).toBe(true);
  expect(r.light.markerOff.hl).toBe(true); // marker off on a lime accent: the contrast guard still sets the phrase on a bar (lime text on white is 1.2:1)
  expect(r.dark.base.underline).toBe(false);
  expect(r.dark.underlineOn.underline).toBe(true);
  expect(r.dark.base.avatar).toBe(true);
  expect(r.dark.profileOff.avatar).toBe(false);
  for (const v of Object.values<any>(r.dark)) expect(v.n).toBe(7);
  // stored with the style, never in the cache
  expect(r.persist.withOv).toEqual({ marker: true, shapes: 'bold' });
  expect(r.persist.readKey).toBe(true);
  expect(r.persist.cachedHasOverrides).toBe(false);
  expect(r.persist.loaded).toEqual({ marker: true, shapes: 'bold' });
  expect(r.persist.cleared).toBeNull();
  expect(r.apply.devices).toEqual({ marker: true, profileHeader: false, underline: true, planes: true });
  expect(r.apply.accentStyle).toBe('marker');
});

test('accent on a dark ground: lightened just enough for 4.5:1 text (same hue), noted, and the brand colour is unchanged', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (packs) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const L = await import('/src/carousel/layouts/index.ts');
    const K = await import('/src/carousel/layouts/cuts.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const { dark, light } = new Function(packs + ' return { dark, light };')();
    const lum = (a: string, b: string) => C.contrastRgb(C.parseColor(a).rgb, C.parseColor(b).rgb);
    const m = D.styleFromPack(dark);
    // the deck's ONE lightened accent reads on the ground and on the card colour (#161616 is the lighter of the two)
    const lk = K.lightenForText('#CC0000', '#161616');
    const big = await L.buildSlide('big-stat', 0, { number: '10 sec', label: 'to flip it', source: 'Measured' }, m.style, { handle: '@q', index: 1, total: 7 });
    const num = (big.layers as any[]).find((l) => l.kind === 'text' && l.name === 'number');
    const bar = await L.buildSlide('stat-bar', 0, { number: '$500,000', label: 'for 5% of it', bar: '5' }, m.style, { handle: '@q', index: 5, total: 7 });
    const st = await L.buildSlide('statement', 0, { headline: 'Flip your hoodie today', accent: ['hoodie'] }, m.style, { handle: '@q', index: 0, total: 7 });
    const title = (st.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
    const lime = D.styleFromPack(light);
    return {
      notes: m.notes, brand: m.style.palette.accent, lightened: lk.color, changed: lk.changed, ratio: lum(lk.color, '#161616'), before: lum('#CC0000', '#161616'),
      hueShift: Math.abs(K.hueOf(lk.color) - K.hueOf('#CC0000')),
      numberColor: num.style.color, numberRatio: lum(num.style.color, '#0A0A0A'),
      barUsesBrand: /fill="#CC0000"/i.test(bar.svg),
      runs: (title.runs ?? []).map((x: any) => [x.color, lum(x.color, '#0A0A0A')]),
      limeNotes: lime.notes.filter((n: string) => /Accent text/.test(n)),
      limeBrand: lime.style.palette.accent,
    };
  }, PACKS);
  expect(r.changed).toBe(true);
  expect(r.before).toBeLessThan(4.5);
  expect(r.ratio).toBeGreaterThanOrEqual(4.5);
  expect(r.ratio).toBeLessThan(4.9); // just enough, not much more
  expect(r.hueShift).toBeLessThan(3);
  expect(r.brand).toBe('#CC0000');
  expect(r.notes.join(' ')).toMatch(/Accent text: #CC0000 is 3\.4:1 on #0A0A0A.*uses #[0-9A-F]{6}.*brand accent #CC0000 is unchanged/);
  expect(r.numberColor.toUpperCase()).toBe(r.lightened);
  expect(r.numberRatio).toBeGreaterThanOrEqual(4.5);
  expect(r.barUsesBrand).toBe(true);
  expect(r.runs.length).toBeGreaterThan(0);
  for (const [c, ratio] of r.runs) {
    expect(String(c).toUpperCase()).toBe(r.lightened);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
  expect(r.limeNotes).toEqual([]); // a light ground is left to the marker guard
  expect(r.limeBrand).toBe('#D9F76A');
});

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="cover" data-palette='{"bg":"#FFFFFF","text":"#111111","accent":"#D62828","muted":"#888888"}'><rect width="1080" height="1350" fill="$bg"/><rect x="60" y="1100" width="300" height="12" fill="$accent"/><text data-role="title" data-min-size="72" data-max-lines="3" x="60" y="300" font-family="Schibsted Grotesk" font-size="100" fill="$text">Title words here</text></svg>`;

test('reader: explicit yes/no device checks with a one-line definition each; the answers decide before the drawn geometry', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (svg) => {
    const W = await import('/src/reference/wholeRead.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const prompt = W.buildWholeSlidePrompt();
    const run = async (answers: string[]) => {
      let n = 0;
      const reader: any = { id: 'api', label: 'm', async read() { const a = answers[n++ % answers.length]; return { text: a + '\n<inventory>title</inventory>\n' + svg, ms: 1 }; } };
      const slides = answers.map((_, i) => ({ name: `s${i + 1}.jpg`, image: { name: `ref${i + 1}.jpg`, mime: 'image/jpeg', base64: 'AA' } }));
      const out = await W.readWholeSlides({ reader, slides, signal: new AbortController().signal });
      return out;
    };
    const yes = '<devices>marker=yes underline=no profile=yes shapes=no</devices>';
    const no = '<devices>marker=no underline=no profile=yes shapes=no</devices>';
    // 4 of 10 say marker (40%: counts), 3 of 10 (30%: does not)
    const four = await run([...Array(4).fill(yes), ...Array(6).fill(no)]);
    const three = await run([...Array(3).fill(yes), ...Array(7).fill(no)]);
    const none = await run(Array(5).fill('no answer block here'));
    const rep = D.deviceReport(four.pack!);
    return {
      prompt,
      four: { devices: four.pack!.devices, answered: four.report.slides.filter((s: any) => s.devices).length, perSlide: rep.perSlide.slice(0, 5).map((s: any) => [s.answered, s.marker, s.profileHeader]), seen: rep.seen, decided: rep.decided },
      three: { marker: three.pack!.devices!.marker, count: three.pack!.devices!.counts.marker },
      none: { answered: none.report.slides.filter((s: any) => s.devices).length, marker: none.pack!.devices!.marker },
    };
  }, SVG);
  expect(r.prompt).toContain('DEVICE CHECKS');
  expect(r.prompt).toContain('<devices>marker=yes|no underline=yes|no profile=yes|no shapes=yes|no</devices>');
  expect(r.prompt).toContain('marker = a filled colour box behind part of a text line');
  expect(r.prompt).toContain('underline = a thin accent-coloured line directly under the last block of text');
  expect(r.prompt).toContain('profile = a small round picture or avatar with a name or handle beside it');
  expect(r.prompt).toContain('shapes = a filled colour block that touches a slide edge');
  expect(r.four.answered).toBe(10);
  expect(r.four.devices!.marker).toBe(true);
  expect(r.four.devices!.profileHeader).toBe(true); // the answers say yes although the drawing has no avatar
  expect(r.four.perSlide[0]).toEqual([true, true, true]);
  expect(r.four.seen.marker).toBe(4);
  expect(r.three.marker).toBe(false);
  expect(r.three.count).toBe(3);
  expect(r.none.answered).toBe(0);
  expect(r.none.marker).toBe(false); // no answer: the drawn geometry decides (there is no marker in it)
});

test('temperature 0 is sent to the Messages API reader', async () => {
  let body: any = null;
  const fetchImpl = (async (_u: unknown, init: { body: string }) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const call = readCall({ role: 'draw', prompt: 'p', images: [{ name: 'a', mime: 'image/jpeg', base64: 'AAAA' }] });
  await readWithApi(call, new AbortController().signal, { ANTHROPIC_API_KEY: 'k' } as NodeJS.ProcessEnv, fetchImpl);
  expect(body.temperature).toBe(0);
});
