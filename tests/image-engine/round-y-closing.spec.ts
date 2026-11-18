// Round Y: the closing slide takes one of a few looks, picked by code from its own text and the style (closingLooks.ts): "split" (a button and a line under the headline), "quiet"
// (5 words or fewer), "line" (a caption, or two sentences or more), "big" (one sentence of 12 words or fewer), else the layout's own look. Not one word, mark or emoji changes, no button
// appears without one in the text, only the style's own devices are drawn, and a slide that is not the closing is drawn exactly as before. The switch closingLooksRule turns the looks off
// for the comparison (the app never does). ZERO model calls.
import { expect, test, type Page } from '@playwright/test';

const C = (key: string, layout: string, fields: Record<string, string>, want: string, accents: string[] = []) => ({ key, spec: { layout, fields, accents }, want });
const CASES = [
  C('deck O closing', 'cta-button', { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'Comment "slides" and I\'ll send you the link.' }, 'split', ['next post']),
  C('deck K-B closing', 'cta-button', { headline: 'One hour on the motorbike and the whole day feels lighter.', button: 'Try a morning ride', sub: 'Back home by eight.' }, 'split', ['lighter']),
  C('deck M-B closing', 'cta-button', { headline: 'Try a morning ride this week.', button: 'Try a morning ride' }, 'own', ['morning ride']),
  C('event closing', 'statement-card', { headline: 'Looking forward for some more of these going forward.' }, 'big'),
  C('4 words', 'statement-card', { headline: 'See you next week.' }, 'quiet'),
  C('emoji', 'statement', { headline: 'Back home by eight 😂' }, 'quiet'),
  C('two sentences', 'statement-card', { headline: 'Back home by eight. The whole day feels lighter.' }, 'line', ['eight']),
  C('caption', 'statement', { headline: 'The words were never the hard part.', caption: 'Making them belong together is.' }, 'line'),
  C('abbreviation', 'statement-card', { headline: 'We met Dr. Rao at the event. She showed us how.' }, 'line'),
  C('16 words', 'statement-card', { headline: 'We will be back with more of these soon so keep an eye on it' }, 'own'),
  C('highlight in the second sentence', 'statement-card', { headline: 'Back home by eight. The whole day feels lighter.' }, 'own', ['lighter']),
  C('kicker', 'statement-card', { kicker: 'One last thing', headline: 'Back home by eight.' }, 'own'),
];
/** The look in style-5 (its own closing card): a statement card keeps the card instead of quiet or big. */
const want5 = (c: { spec: { layout: string }; want: string }) => (c.spec.layout === 'statement-card' && (c.want === 'big' || c.want === 'quiet') ? 'own' : c.want);
const LOOKS: [string, unknown][] = [['editorial-collage', null], ['style-1', null], ['style-5', null], ['style-6', null], ['style-4', null], ['style-3', { colours: ['#E11D48', '#111827'] }]];

const DRAW = `(async ({ cases, styleId, brand, grounds }) => {
  const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts'); const FC = await import('/src/reference/faithfulChecks.ts');
  const CL = await import('/src/carousel/layouts/closingLooks.ts');
  const fonts = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
  let pack = structuredClone(PR.presetPackFor(styleId, false, null));
  if (brand) { const BP = await import('/src/carousel/brandPalette.ts'); pack = BP.applyBrand(pack, brand).pack; }
  const { style } = DL.styleFromPack(pack);
  const one = async (spec, v, index, ground, on) => {
    CL.closingLooksRule.on = on;
    let d; try { d = await DL.drawOne(spec, v, style, { handle: '@saycreator', index, total: 7, cut: 'plain', invert: false, density: 'normal', ground }); } finally { CL.closingLooksRule.on = true; }
    if (!d.built) return { failed: d.problems };
    const texts = d.built.layers.filter((l) => l.kind === 'text' && l.name !== 'recurring').sort((a, b) => a.y - b.y || a.x - b.x).map((l) => ({ role: l.role, name: l.name, text: l.text, size: l.style.size }));
    const fails = FC.faithfulChecks(d.built.layers, { canvas: { w: 1080, h: 1350 }, bg: d.built.fieldBg ?? style.palette.bg, k: 1, slideType: String(DL.scriptSlideOf(spec.layout, spec.fields).type ?? 'content'), prose: false, svg: d.built.svg, devices: d.built.devices }).filter((q) => !q.pass).map((q) => q.id + ': ' + q.reason);
    return { svg: d.built.svg, texts, fails, look: (/data-closing-look="([^"]+)"/.exec(d.built.svg) ?? [])[1] ?? 'own' };
  };
  const out = [];
  for (const c of cases) for (const v of [0, 1]) for (const g of grounds) {
    const rule = CL.closingLookOf(c.spec.layout, { ...c.spec.fields, ...(c.spec.accents.length ? { accent: c.spec.accents } : {}) }, style, { cut: 'plain', density: 'normal' });
    out.push({ key: c.key, v, g, rule, on: await one(c.spec, v, 6, g, true), off: await one(c.spec, v, 6, g, false), mid: await one(c.spec, v, 1, g, true), midOff: await one(c.spec, v, 1, g, false), underline: !!style.devices.underline });
  }
  return out;
})`;
const draw = (page: Page, cases: unknown[], styleId: string, brand: unknown, grounds: number[]) => page.evaluate(`${DRAW}(${JSON.stringify({ cases, styleId, brand, grounds })})`) as Promise<any[]>;
const tok = (t: string) => t.toLowerCase().split(/\s+/).filter(Boolean);

let writes = 0;
test.beforeEach(async ({ page }) => {
  writes = 0;
  page.on('request', (r) => { if (/\/(__carousel|api\/carousel)\/write/.test(r.url())) writes++; });
  await page.goto('/images/carousel');
});
test.afterEach(() => expect(writes, 'writer calls').toBe(0));

test('Y1 the rule picks the documented look from the text and the style', async ({ page }) => {
  const r = await page.evaluate(async (cases) => {
    const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts');
    const CL = await import('/src/carousel/layouts/closingLooks.ts');
    const styleOf = (id: string) => DL.styleFromPack(structuredClone(PR.presetPackFor(id, false, null))).style;
    const look = (id: string, c: any, cx?: any) => CL.closingLookOf(c.spec.layout, { ...c.spec.fields, ...(c.spec.accents.length ? { accent: c.spec.accents } : {}) }, styleOf(id), cx).look;
    return {
      plain: cases.map((c: any) => [c.key, look('editorial-collage', c)]),
      style5: cases.map((c: any) => [c.key, look('style-5', c)]),
      plane: cases.map((c: any) => look('editorial-collage', c, { cut: 'edge-h', density: 'normal' })),
      dense: cases.map((c: any) => look('editorial-collage', c, { cut: 'plain', density: 'statement' })),
      other: ['cta-pair', 'contact-closing', 'quote'].map((l) => CL.closingLookOf(l, { headline: 'See you.' }, styleOf('style-1')).look),
    };
  }, CASES);
  for (const [i, [k, l]] of r.plain.entries()) expect(l, k).toBe(CASES[i].want);
  // a style that declares its own closing card (style-5) keeps the card where the rule would draw a quiet or a big statement on a statement card (the line look is drawn inside the card)
  for (const [i, [k, l]] of r.style5.entries()) expect(l, k).toBe(want5(CASES[i]));
  // a plane, a statement density or another closing layout keeps the layout's own look
  expect(r.plane.every((l: string) => l === 'own')).toBe(true);
  expect(r.dense.every((l: string) => l === 'own')).toBe(true);
  expect(r.other).toEqual(['own', 'own', 'own']);
});

for (const [styleId, brand] of LOOKS) {
  test(`Y2 ${styleId}${brand ? ' + brand' : ''}: the closing look as the rule says, every word and mark in order, no button without one, phone check, sizes; slide 2 unchanged`, async ({ page }) => {
    test.setTimeout(180_000);
    const rows = await draw(page, CASES, styleId, brand, [0, -1]);
    for (const r of rows) {
      const c = CASES.find((x) => x.key === r.key)!;
      const tag = `${styleId} ${r.key} v${r.v} g${r.g}`;
      expect(r.on.failed, tag).toBeUndefined();
      expect(r.on.look, tag).toBe(r.rule.look);
      expect(r.on.look, tag).toBe(styleId === 'style-5' ? want5(c) : c.want);
      expect(r.on.fails, tag).toEqual([]);
      const f = c.spec.fields;
      if (r.on.look === 'own') expect(r.on.svg === r.off.svg, `${tag}: the own look is drawn exactly as before`).toBe(true);
      else {
        const order = c.spec.layout === 'cta-button' ? ['headline', 'sub', 'button'] : ['kicker', 'headline', 'caption'];
        expect(r.on.texts.flatMap((t: any) => tok(t.text)), tag).toEqual(order.flatMap((k) => tok(f[k] ?? '')));
        const head = r.on.texts.find((t: any) => t.role === 'title' || t.name === 'title') ?? r.on.texts[0];
        expect(head.size, tag).toBeGreaterThanOrEqual(48);
        for (const t of r.on.texts) expect(t.size, `${tag}: ${t.text}`).toBeGreaterThanOrEqual(t.text.toLowerCase() === String(f.button ?? '').toLowerCase() ? 40 : 44);
        // the style's rule only where the style declares one (180 x 10, the accent's second colour)
        expect(/<rect[^>]*width="180" height="10"/.test(r.on.svg), tag).toBe(r.underline && r.on.look !== 'split' && !(styleId === 'style-5' && c.spec.layout === 'statement-card'));
      }
      // a button only when the fields have one
      expect(r.on.texts.some((t: any) => !!f.button && t.text.toLowerCase() === f.button.toLowerCase()), tag).toBe(!!f.button);
      if (!f.button) expect(/<path[^>]*marker|data-arrow/.test(r.on.svg) && r.on.look !== 'own', tag).toBe(false);
      // the same text on slide 2 of 7 is not a closing: the same drawing with the looks on and off, and no look
      expect(r.mid.svg === r.midOff.svg, tag).toBe(true);
      expect(r.mid.look, tag).toBe('own');
    }
  });
}

test('Y3 a style switch, a brand colour change and a text edit: the closing look follows the text and the style; a variant the person picks keeps the layout\'s own look', async ({ page }) => {
  test.setTimeout(180_000);
  const r = await page.evaluate(async () => {
    const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts'); const PK = await import('/src/carousel/designLibraryPick.ts');
    const BP = await import('/src/carousel/brandPalette.ts');
    const fonts = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
    const lib0 = { plan: { title: 'Event', specs: [S('statement', { headline: 'Had a wonderful blast at the Hyderabad event.' }), S('lead-statement', { lead: 'Thank you Punit Chawla', headline: 'for the crazy day man.' }), S('statement', { headline: 'Met some wonderful people there.' }), S('statement-card', { headline: 'Looking forward for some more of these going forward.' })] }, style: null } as any;
    const lookOf = (svg: string) => (/data-closing-look="([^"]+)"/.exec(svg) ?? [])[1] ?? 'own';
    const out: any = { styles: [] };
    let last: any = null;
    for (const [id, brand] of [['editorial-collage', null], ['style-6', null], ['style-6', { colours: ['#2563EB', '#111827'] }], ['style-4', null]] as [string, any][]) {
      let pack = structuredClone(PR.presetPackFor(id, false, null));
      if (brand) pack = BP.applyBrand(pack, brand).pack;
      const o = await DL.redrawLibraryDeck(lib0, { pack, hasPhoto: false, images: [], site: '' } as any, '@saycreator');
      const svg = o.slides['3'].built.svg;
      out.styles.push({ id, brand: !!brand, look: lookOf(svg), others: [0, 1, 2].map((k) => lookOf(o.slides[String(k)].built.svg)), svg: svg.length });
      last = { lib: { ...o.library, style: DL.styleFromPack(pack).style }, pack };
    }
    // a text edit of the closing (two sentences now): the code picks the look again
    const look = { pack: last.pack, hasPhoto: false, images: [], site: '' } as any;
    const e = await PK.redrawLibrarySlide(last.lib, look, '@saycreator', 3, { fields: { headline: 'Back home by eight. The whole day feels lighter.' } });
    out.edit = e.ok ? lookOf(e.slide.built.svg) : e.reasons;
    // the person picks a variant in the picker: the layout's own look, kept by the pin through a later text edit
    const p = await PK.redrawLibrarySlide(last.lib, look, '@saycreator', 3, { variant: 0 });
    out.picked = p.ok ? { look: lookOf(p.slide.built.svg), pin: p.spec.pin } : p.reasons;
    if (p.ok) { const p2 = await PK.redrawLibrarySlide(p.library, look, '@saycreator', 3, { fields: { headline: 'See you next week.' } }); out.pickedEdit = p2.ok ? lookOf(p2.slide.built.svg) : p2.reasons; }
    return out;
  });
  for (const s of r.styles) {
    expect(s.look, `${s.id}${s.brand ? ' brand' : ''}`).toBe('big');
    expect(s.others).toEqual(['own', 'own', 'own']);
  }
  expect(r.edit).toBe('line');
  expect(r.picked.look).toBe('own');
  expect(r.picked.pin.look).toBe(true);
  expect(r.pickedEdit).toBe('own');
});
