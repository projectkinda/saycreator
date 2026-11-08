// Designed mode, library route (no model: a fake writer returns canned answers). Checks the style mapping, the prompt (the model only chooses, never draws), validation, the
// deck rotation, the one retry for failing slides only, the plain fallback of the SAME layout, the silent density fallback and the report.
import { expect, test } from '@playwright/test';

test.setTimeout(240_000);

const PACKS = `
  const layer = (o) => ({ kind: 'shape', id: 'p', name: 'shape', role: 'decor', rotation: 0, opacity: 1, shape: 'rect', ...o });
  const base = { motifs: [], designs: {}, canvas: { w: 1080, h: 1350 }, notes: [] };
  const dark = { ...base, name: 'Quick Flip', palette: { bg: '#0A0A0A', text: '#FFFFFF', accent: '#F02A2A', muted: '#A3A3A3', surface: '#1C1C1C' }, fonts: { headline: 'Schibsted Grotesk', body: 'Schibsted Grotesk' }, svgs: { cover: '<svg><radialGradient id="g"/></svg>' }, variants: { cover: [{ svg: '', layers: [layer({ x: -60, y: 950, width: 1200, height: 500, fill: '#F02A2A' })], imageSlots: [], slotMeta: [], fromFile: 'a' }] }, devices: { marker: false, profileHeader: true, underline: false, slides: 1, counts: { marker: 0, profileHeader: 1, underline: 0 } } };
  const light = { ...base, name: 'Harsh', palette: { bg: '#FFFFFF', text: '#0A0A0A', accent: '#D4F76A', muted: '#5C5C5C', surface: '#F1F1F1' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, svgs: { cover: '<svg></svg>' }, variants: { cover: [{ svg: '', layers: [layer({ x: 48, y: 400, width: 300, height: 100, fill: '#D4F76A' })], imageSlots: [], slotMeta: [], fromFile: 'a' }] }, devices: { marker: true, profileHeader: true, underline: true, slides: 1, counts: { marker: 1, profileHeader: 1, underline: 1 } } };
`;

test('style mapping and the choose-only prompt', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (packs) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const { dark, light } = new Function(packs + ' return { dark, light };')();
    const d = D.styleFromPack(dark);
    const l = D.styleFromPack(light);
    const odd = D.styleFromPack({ ...dark, fonts: { headline: 'Playfair Display Bold', body: 'Inter Tight' } });
    const prompt = D.buildLibraryPrompt({ text: 'A text about a hoodie that becomes a backpack. '.repeat(3), slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'auto', styles: [] }, { pack: dark }, d.style, 'brief', 7);
    return { dark: d.style, light: l.style, oddFonts: odd.style.fonts, prompt, legacy: D.legacySvgRoute() };
  }, PACKS);
  expect(r.dark.devices).toEqual({ marker: false, profileHeader: true, underline: false, planes: true });
  expect(r.dark.background).toBe('glow');
  expect(r.dark.accentStyle).toBe('text');
  expect(r.light.devices).toEqual({ marker: true, profileHeader: true, underline: true, planes: false });
  expect(r.light.accentStyle).toBe('marker');
  expect(r.light.background).toBe('flat');
  expect(r.oddFonts.headline).toBeTruthy();
  expect(r.legacy).toBe(false); // the old model-drawn route is off by default
  for (const id of ['statement', 'stat-bar', 'stepper', 'checklist', 'cta-button', 'timeline', 'spotlight', 'comparison']) expect(r.prompt).toContain('- ' + id + ':');
  expect(r.prompt).not.toContain('- photo-led:');
  expect(r.prompt).toMatch(/You never draw/);
  expect(r.prompt).toMatch(/4 words or fewer/);
  expect(r.prompt).not.toMatch(/data-role|viewBox|<svg/);
});

const ANSWERS = `
  const good = (extra = {}) => ({ title: 'Quick Flip', slides: [
    { layout: 'statement', fields: { kicker: 'Now on Kickstarter', headline: 'Flip your hoodie', caption: 'One piece. Two jobs.' }, accents: ['hoodie'], density: 'statement', cut: 'edge-h' },
    { layout: 'lead-statement', fields: { lead: 'It started in a rainy taxi', headline: 'We ditched the bag and kept the hoodie' }, accents: ['hoodie'] },
    { layout: 'stepper', fields: { title: 'How it flips', steps: ['Zip the hood into the pocket', 'Fold the sleeves behind you', 'Pull the straps and go'] } },
    { layout: 'feature-slider', fields: { title: 'Slide and bite', body: 'Slide the zip, bite the clasp, and it locks into a backpack.' } },
    { layout: 'checklist', fields: { title: 'Why you will love it', items: ['Waterproof shell', 'Fits a 16-inch laptop', 'Machine washable', 'Flips in 10 seconds'] }, accents: [] },
    { layout: 'stat-bar', fields: { number: '$500,000', label: 'for 5% of the company', bar: '5', note: 'Open to 20 backers' }, accents: [] },
    { layout: 'cta-button', fields: { headline: 'Back Quick Flip today', button: 'Back it now', sub: 'Early backers save 30%.' }, accents: ['today'] },
  ], ...extra });
  const broken = () => { const g = good(); g.slides[3] = { layout: 'stepper', fields: { title: 'Slide and bite', steps: ['Slide the zip', 'Bite the clasp'] } }; g.slides[4].fields.items[1] = 'This checklist item is far longer than the forty-eight character budget allows'; return g; };
  const fixed = { slides: { '4': good().slides[3], '5': good().slides[4] } };
`;

const REQ = { text: 'Quick Flip is a hoodie that flips into a backpack in 10 seconds. '.repeat(3) + ' Back it on Kickstarter today.', slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'auto', styles: [] };

test('library route: choose-only deck, one retry for the failing slides, plain fallback of the same layout, silent density fallback, report', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ packs, answers, req }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const { dark, light } = new Function(packs + ' return { dark, light };')();
    const A = new Function(answers + ' return { good, broken, fixed };')();
    const fake = (replies: any[]) => {
      const log: string[] = [];
      let n = 0;
      return { log, p: { id: 'dev-cli', label: 'fake', async write(prompt: string) { log.push(prompt); const t = replies[Math.min(n++, replies.length - 1)]; return { text: typeof t === 'string' ? t : JSON.stringify(t), ms: 10, usage: { input: 1000, output: 200 } }; } } };
    };
    const sum = (x: any) => ({ calls: x.designed.library.calls, layouts: x.designed.library.layouts, cuts: x.designed.library.cuts, densities: x.designed.library.densities, retries: x.designed.library.retries, fallbacks: x.designed.library.fallbacks, adj: x.designed.library.codeAdjustments, tokens: x.designed.library.tokens, note: x.designed.library.tokenNote, slides: Object.keys(x.designed.slides).length, svg: Object.values<any>(x.designed.slides).every((s) => /<svg/.test(s.built.svg)), types: x.script.slides.map((s: any) => s.type), variants: x.designed.library.variants, fallbacksLegacy: Object.keys(x.designed.fallbacks).length });
    // 1. a clean answer: one call, no retries; a 2-word headline keeps statement density; the model's cut is a suggestion
    const f1 = fake([A.good()]);
    const one = sum(await D.designLibraryDeck(req, { pack: dark }, '@quick.flip', f1.p, new AbortController().signal));
    // 2. a broken slide (over budget) and a repeated layout: ONE retry call, for those slides only
    const f2 = fake([A.broken(), A.fixed]);
    const two = sum(await D.designLibraryDeck(req, { pack: dark }, '@quick.flip', f2.p, new AbortController().signal));
    // 3. the retry does not help: the same layout is drawn plain from trimmed fields (never the old template look)
    const f3 = fake([A.broken()]);
    const three = sum(await D.designLibraryDeck(req, { pack: light }, '@quick.flip', f3.p, new AbortController().signal));
    // 4. statement density for a long headline is dropped silently (no retry)
    const g4 = A.good();
    g4.slides[0].fields.headline = 'Flip your hoodie into a backpack today';
    const f4 = fake([g4]);
    const four = sum(await D.designLibraryDeck(req, { pack: dark }, '@quick.flip', f4.p, new AbortController().signal));
    return { one, two, three, four, retryPrompt: f2.log[1], onePrompt: f1.log[0] };
  }, { packs: PACKS, answers: ANSWERS, req: REQ });
  // 1
  expect(r.one.calls).toBe(1);
  expect(r.one.retries).toEqual([]);
  expect(r.one.fallbacks).toEqual([]);
  expect(r.one.slides).toBe(7);
  expect(r.one.svg).toBe(true);
  expect(r.one.layouts).toEqual(['statement', 'lead-statement', 'stepper', 'feature-slider', 'checklist', 'stat-bar', 'cta-button']);
  expect(r.one.densities[0]).toBe('statement');
  // the model suggested edge-h, but the dense statement has no second part for the plane: an empty plane is never drawn, so the slide is plain
  expect(r.one.cuts[0]).toBe('plain');
  expect(r.one.tokens).toEqual({ input: 1000, output: 200 });
  expect(r.one.note).toMatch(/dev-cli.*inflated/);
  expect(r.one.fallbacksLegacy).toBe(0);
  expect(r.one.types).toEqual(['cover', 'cover', 'content', 'content', 'checklist', 'stat', 'closing']);
  // 2
  expect(r.two.calls).toBe(2);
  expect(r.two.retries.map((x: any) => x.slide)).toEqual([4, 5]);
  expect(r.two.fallbacks).toEqual([]);
  expect(r.two.layouts[3]).toBe('feature-slider');
  expect(r.retryPrompt).toMatch(/slide 4/);
  expect(r.retryPrompt).toMatch(/slide number 4, 5/);
  expect(r.retryPrompt).not.toMatch(/slide 1:/); // only the failing slides are asked for again
  // 3
  expect(r.three.calls).toBe(2);
  expect(r.three.fallbacks.length).toBeGreaterThanOrEqual(1);
  expect(r.three.fallbacks.every((f: any) => /same layout/.test(f.level))).toBe(true);
  expect(r.three.slides).toBe(7);
  expect(r.three.cuts.every((c: string) => c === 'plain')).toBe(true); // a flat style stays plain
  // 4
  expect(r.four.calls).toBe(1);
  expect(r.four.densities[0]).toBe('normal');
  expect(r.four.adj.join(' ')).toMatch(/statement density dropped/);
});
