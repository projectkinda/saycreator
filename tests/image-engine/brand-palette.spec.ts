// Round G part F: 5 brands x 15 styles. A fake writer only (ZERO real model calls). The deck is drawn from one plan; with a brand it must have: no failed contrast check (gradient headline and text over art
// included), no word cut, the SAME layout ids as the deck without the brand, a plain-words changes list, and a brand switch (a redraw from the stored plan) makes 0 writer calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(15 * 60_000);

const BRANDS = [
  { id: 'yellow', colours: ['#FFE97A', '#333333'] },
  { id: 'neon', colours: ['#39FF14', '#FFFFFF'] },
  { id: 'navy', colours: ['#14213D', '#FCA311'] },
  { id: 'black', colours: ['#111111', '#FFFFFF'] },
  { id: 'blues', colours: ['#2F6BFF', '#3C78FF'] },
];

test('brands: 5 brands x all 15 styles keep the layouts, cut no word, fail no contrast check and a brand switch makes 0 writer calls', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (brands) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const BP: any = await import('/src/carousel/brandPalette.ts');
    const FC: any = await import('/src/reference/faithfulChecks.ts');
    const DR: any = await import('/src/carousel/layouts/draw.ts');
    const names = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
    const plan = [
      { layout: 'statement', fields: { headline: 'Most creators do not have a design problem.' }, accents: ['design problem'] },
      { layout: 'split-text', fields: { headline: 'The idea took ten minutes', paragraph: 'The slides took the rest of the night.' }, accents: ['ten minutes'] },
      { layout: 'checklist', fields: { title: 'Three steps', items: ['Paste your text', 'Pick a look', 'Get slides'] }, accents: [] },
      { layout: 'big-stat', fields: { number: '15', label: 'styles to pick from', source: 'Switch the style and your words stay put.' }, accents: [] },
      { layout: 'quote', fields: { quote: 'Change a headline and nothing reruns.', author: 'Say Creator' }, accents: ['nothing reruns'] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'I will send you the link.' }, accents: ['next post'] },
    ];
    const text = 'Most creators do not have a design problem. The idea took ten minutes. The slides took the rest of the night. Three steps: paste your text, pick a look, get slides. 15 styles to pick from. Switch the style and your words stay put. Change a headline and nothing reruns. Try it on your next post. Comment slides and I will send you the link.';
    const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    const rows: any[] = [];
    for (const name of names) {
      const run = async (brand: any) => {
        let calls = 0;
        const provider: any = { id: 'dev-cli', label: 'fake', async write() { calls++; return { text: JSON.stringify({ title: 'T', slides: plan }), ms: 1 }; } };
        const base = PR.presetPackFor(name, false);
        const applied = BP.applyBrand(structuredClone(base), brand);
        // Round G2: every accent drawn as a shape reaches the floor on every ground of the style as the layouts see it (the palette, the rhythm and the closing ground)
        const st = D.styleFromPack(applied.pack).style;
        const gs = [st.palette, ...(st.rhythm ?? []), ...(st.closing ? [st.closing] : [])];
        const floorMiss = brand ? gs.filter((g: any) => !BP.accentVisible(g.accent, g.bg)).map((g: any) => `accent ${g.accent} on ${g.bg}: ${DR.contrast(g.accent, g.bg).toFixed(2)}:1, ${BP.colourDifference(g.accent, g.bg).toFixed(3)} apart in colour`) : [];
        // Round G3: the accents the style draws on this brand's light grounds
        const lightBgs = applied.grounds.filter((g: any) => g.kind === 'light').map((g: any) => g.bg.toUpperCase());
        const lightAccents = gs.filter((g: any) => lightBgs.includes(g.bg.toUpperCase())).map((g: any) => g.accent.toUpperCase());
        const darkBgs = applied.grounds.filter((g: any) => g.kind === 'dark').map((g: any) => g.bg.toUpperCase());
        const look = { pack: applied.pack, hasPhoto: false, images: [], brief: '', site: '' };
        const res = await D.designLibraryDeck({ text, slides: plan.length, tone: 'clear', format: 'carousel', styleChoice: name, styles: [] }, look, '@saycreator', provider, new AbortController().signal);
        const lib = res.designed.library;
        const missing: string[] = [];
        const contrast: string[] = [];
        plan.forEach((p, i) => {
          const b = res.designed.slides[String(i)].built;
          const have = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !/recurring/.test(l.id + l.name)).flatMap((l) => words(l.text));
          for (const w of Object.values(p.fields).flatMap((v: any) => (Array.isArray(v) ? v : [v])).flatMap((v: any) => words(String(v)))) if (!have.includes(w)) missing.push(`${i + 1}:${w}`);
          const type = String(D.scriptSlideOf(lib.layouts[i], lib.plan.specs[i].fields).type ?? 'content');
          const q = FC.faithfulChecks(b.layers, { canvas: { w: 1080, h: 1350 }, bg: b.bg ?? '#FFFFFF', k: 1, slideType: type, prose: /data-layout="prose"/.test(b.svg), svg: b.svg, devices: b.devices }).find((x: any) => x.id === 'contrast');
          if (q && !q.pass) contrast.push(`${i + 1}: ${q.reason}`);
        });
        // the brand switch: the deck is drawn again from its stored plan with another brand pack (no provider is called)
        let redrawCalls = 0;
        let switched: string[] = [];
        if (brand) {
          const other = BP.applyBrand(structuredClone(base), { colours: ['#E11D48', '#111827'] });
          const out = await D.redrawLibraryDeck(lib, { pack: other.pack, hasPhoto: false, images: [], brief: '', site: '' }, '@saycreator');
          redrawCalls = calls - 1;
          switched = Object.values(out.layouts) as string[];
        }
        return { floorMiss, lightAccents, darkBgs, calls, layouts: lib.layouts as string[], missing, contrast, repairs: (lib.repairs ?? []).map((x: any) => `${x.slide}:${x.how}:${x.from}->${x.to}`), changes: applied.changes.map((c: any) => c.text), redrawCalls, switched };
      };
      const control = await run(null);
      for (const b of brands) rows.push({ style: name, brand: b.id, control, got: await run({ colours: b.colours }) });
    }
    return rows;
  }, BRANDS);
  fs.mkdirSync('out/round-g', { recursive: true });
  fs.writeFileSync('out/round-g/brand-palette-results.json', JSON.stringify(r.map((x: any) => ({ style: x.style, brand: x.brand, layouts: x.got.layouts, same: JSON.stringify(x.got.layouts) === JSON.stringify(x.control.layouts), contrast: x.got.contrast, missing: x.got.missing, repairs: x.got.repairs, changes: x.got.changes, calls: x.got.calls, redrawCalls: x.got.redrawCalls })), null, 1));
  expect(r.length).toBe(75);
  const MAIN: Record<string, string> = { yellow: '#FFE97A', neon: '#39FF14', navy: '#14213D', black: '#111111', blues: '#2F6BFF' };
  for (const x of r) {
    const who = `${x.style} + ${x.brand}`;
    expect(x.got.layouts, `${who}: the layouts of the deck without the brand`).toEqual(x.control.layouts);
    expect(x.got.contrast, `${who}: contrast`).toEqual([]);
    expect(x.got.missing, `${who}: no word is cut (the deck without the brand loses the same ones)`).toEqual(x.control.missing);
    expect(x.got.calls, `${who}: one fake writer call to make the deck`).toBe(1);
    expect(x.got.redrawCalls, `${who}: a brand switch makes 0 writer calls`).toBe(0);
    expect(x.got.switched, `${who}: a brand switch keeps the layouts`).toEqual(x.control.layouts);
    // every accent drawn as a shape reaches the floor on at least one measure (3.6:1 brighter, or 0.12 apart in colour) on every ground
    // pale yellow and neon green keep their own colour on a light ground (style-7 has no highlight bar: its accent is shifted to read as text)
    if ((x.brand === 'yellow' || x.brand === 'neon') && x.style !== 'style-7') for (const a of x.got.lightAccents) expect(a, `${who}: the brand colour stays on light slides`).toBe(MAIN[x.brand]);
    expect(x.got.floorMiss, `${who}: accent visibility`).toEqual([]);
    // a dark primary (navy, near-black) is the dark ground itself; a light or mid one (pale yellow, neon, the blue) is not
    for (const bg of x.got.darkBgs) {
      if (x.brand === 'navy' || x.brand === 'black') expect(bg, `${who}: the dark ground is the primary`).toBe(MAIN[x.brand]);
      else expect(bg, `${who}: a light or mid primary is not the dark ground`).not.toBe(MAIN[x.brand]);
    }
    for (const c of x.got.changes) expect(c.length, `${who}: a change is written in words`).toBeGreaterThan(20);
    // a repair for a contrast failure is a colour repair, never a layout swap
    for (const rp of x.got.repairs) expect(rp, `${who}: repairs`).not.toMatch(/:layout:/);
  }
  // no brand: nothing changes (the pack is the same object, so the deck is the control)
  const same = await page.evaluate(async () => {
    const PR: any = await import('/src/carousel/presets.ts');
    const BP: any = await import('/src/carousel/brandPalette.ts');
    return ['style-1', 'style-5', 'style-8'].map((n) => { const p = PR.presetPackFor(n, false); return BP.applyBrand(p, null).pack === p && BP.applyBrand(p, { colours: [] }).pack === p; });
  });
  expect(same).toEqual([true, true, true]);
  // navy + orange: orange where navy cannot be seen (a navy dark ground), said in one line; pale yellow: no dark ground of its own colour
  const navy = r.filter((y: any) => y.brand === 'navy');
  expect(navy.filter((y: any) => y.got.changes.join(' ').includes('dark enough to be the background')).length, 'navy is the dark ground in every style that has a dark ground').toBe(navy.filter((y: any) => y.got.darkBgs.length > 0).length);
  expect(navy.filter((y: any) => y.got.darkBgs.length > 0).length, '9 of the 15 styles have a dark ground').toBe(9);
  expect(navy.filter((y: any) => y.got.changes.join(' ').includes('so highlights use your #FCA311')).length, 'orange takes over where navy does not show').toBeGreaterThan(8);
  // the close pair is said in words
  for (const x of r.filter((y: any) => y.brand === 'blues')) expect(x.got.changes.join(' '), x.style).toContain('very close');
  // a style with an accent ground tells the person about white on neon
  for (const n of ['style-4', 'style-7', 'style-2']) expect(r.find((y: any) => y.style === n && y.brand === 'neon').got.changes.join(' '), n).toContain('so text on slides with that background is black');
});

test('calibration: the two floors let every shape that must show in and keep every shape that must not out, on the grounds the brand code really produces', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const PR: any = await import('/src/carousel/presets.ts');
    const BP: any = await import('/src/carousel/brandPalette.ts');
    const grounds = (c: string) => { const g = BP.applyBrand(structuredClone(PR.presetPackFor('style-1', false)), { colours: [c] }).grounds; return { light: g.find((x: any) => x.kind === 'light').bg, dark: g.find((x: any) => x.kind === 'dark').bg }; };
    const cases: [boolean, string, string, string][] = [
      [true, 'pale yellow on its light ground', '#FFE97A', grounds('#FFE97A').light],
      [true, 'neon on its light ground', '#39FF14', grounds('#39FF14').light],
      [true, 'orange on the navy ground', '#FCA311', grounds('#14213D').dark],
      [true, 'navy on its light ground', '#14213D', grounds('#14213D').light],
      [true, 'white on the near-black ground', '#FFFFFF', grounds('#111111').dark],
      [false, 'navy on near-black', '#14213D', '#0D0D10'],
      [false, 'near-black on near-black', '#111111', '#0C0C0D'],
      [false, 'an accent a few percent from its ground', '#F5F5F0', '#FFFEF8'],
    ];
    return { floors: { lum: BP.ACCENT_FLOOR, de: BP.ACCENT_FLOOR_DE }, cases: cases.map(([want, name, a, g]) => ({ want, name, a, g, visible: BP.accentVisible(a, g), de: BP.colourDifference(a, g) })) };
  });
  expect(r.floors).toEqual({ lum: 3.6, de: 0.12 });
  for (const c of r.cases) expect(c.visible, `${c.name} (${c.a} on ${c.g}, ${c.de.toFixed(3)} apart in colour)`).toBe(c.want);
});

// Round H part D: the eight ready-made colour combinations (src/image-engine/styles/colourCombinations.ts) go through the same checks as the stress brands, on all 15 styles. Add a combination that fails and this fails.
test('colour combinations: every one on all 15 styles keeps the layouts, cuts no word, fails no contrast check (also after a switch from the stored plan) and shows every accent shape', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const BP: any = await import('/src/carousel/brandPalette.ts');
    const FC: any = await import('/src/reference/faithfulChecks.ts');
    const CC: any = await import('/src/image-engine/styles/colourCombinations.ts');
    const names = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
    const plan = [
      { layout: 'statement', fields: { headline: 'Most creators do not have a design problem.' }, accents: ['design problem'] },
      { layout: 'split-text', fields: { headline: 'The idea took ten minutes', paragraph: 'The slides took the rest of the night.' }, accents: ['ten minutes'] },
      { layout: 'checklist', fields: { title: 'Three steps', items: ['Paste your text', 'Pick a look', 'Get slides'] }, accents: [] },
      { layout: 'big-stat', fields: { number: '15', label: 'styles to pick from', source: 'Switch the style and your words stay put.' }, accents: [] },
      { layout: 'quote', fields: { quote: 'Change a headline and nothing reruns.', author: 'Say Creator' }, accents: ['nothing reruns'] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'I will send you the link.' }, accents: ['next post'] },
    ];
    const text = 'Most creators do not have a design problem. The idea took ten minutes. The slides took the rest of the night. Three steps: paste your text, pick a look, get slides. 15 styles to pick from. Switch the style and your words stay put. Change a headline and nothing reruns. Try it on your next post. Comment slides and I will send you the link.';
    const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    const contrastOf = (slidesOf: (i: number) => any, lib: any) => {
      const bad: string[] = [];
      plan.forEach((p, i) => {
        const b = slidesOf(i);
        const type = String(D.scriptSlideOf(lib.layouts[i], lib.plan.specs[i].fields).type ?? 'content');
        const q = FC.faithfulChecks(b.layers, { canvas: { w: 1080, h: 1350 }, bg: b.bg ?? '#FFFFFF', k: 1, slideType: type, prose: /data-layout="prose"/.test(b.svg), svg: b.svg, devices: b.devices }).find((x: any) => x.id === 'contrast');
        if (q && !q.pass) bad.push(`${i + 1}: ${q.reason}`);
      });
      return bad;
    };
    const rows: any[] = [];
    for (const name of names) {
      const run = async (colours: string[] | null) => {
        const provider: any = { id: 'dev-cli', label: 'fake', async write() { return { text: JSON.stringify({ title: 'T', slides: plan }), ms: 1 }; } };
        const base = PR.presetPackFor(name, false, null);
        const applied = colours ? BP.applyBrand(structuredClone(base), { colours }) : { pack: base, changes: [], grounds: [] };
        const st = D.styleFromPack(applied.pack).style;
        const gs = [st.palette, ...(st.rhythm ?? []), ...(st.closing ? [st.closing] : [])];
        const floorMiss = colours ? gs.filter((g: any) => !BP.accentVisible(g.accent, g.bg)).map((g: any) => `accent ${g.accent} on ${g.bg}`) : [];
        const res = await D.designLibraryDeck({ text, slides: plan.length, tone: 'clear', format: 'carousel', styleChoice: name, styles: [] }, { pack: applied.pack, hasPhoto: false, images: [], brief: '', site: '' }, '@saycreator', provider, new AbortController().signal);
        const lib = res.designed.library;
        const missing: string[] = [];
        plan.forEach((p, i) => {
          const b = res.designed.slides[String(i)].built;
          const have = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !/recurring/.test(l.id + l.name)).flatMap((l) => words(l.text));
          for (const w of Object.values(p.fields).flatMap((v: any) => (Array.isArray(v) ? v : [v])).flatMap((v: any) => words(String(v)))) if (!have.includes(w)) missing.push(`${i + 1}:${w}`);
        });
        const contrast = contrastOf((i) => res.designed.slides[String(i)].built, lib);
        let again: string[] = [];
        let againLayouts: string[] = [];
        if (colours) {
          const other = await D.redrawLibraryDeck(lib, { pack: applied.pack, hasPhoto: false, images: [], brief: '', site: '' }, '@saycreator');
          again = contrastOf((i) => other.slides[String(i)].built, other.library);
          againLayouts = Object.values(other.layouts) as string[];
        }
        return { layouts: lib.layouts as string[], missing, contrast, floorMiss, again, againLayouts, repairs: (lib.repairs ?? []).map((x: any) => `${x.slide}:${x.how}`) };
      };
      const control = await run(null);
      for (const c of CC.COLOUR_COMBINATIONS) rows.push({ style: name, combo: c.id, control, got: await run(c.colours) });
    }
    return { rows, combos: CC.COLOUR_COMBINATIONS };
  });
  expect(r.combos.length, 'eight combinations').toBe(8);
  expect(new Set(r.combos.map((c: any) => c.id)).size, 'each has its own id').toBe(8);
  for (const c of r.combos) {
    expect(c.colours.length, `${c.name}: 1 to 3 colours`).toBeGreaterThanOrEqual(1);
    expect(c.colours.length).toBeLessThanOrEqual(3);
    for (const h of c.colours) expect(h, `${c.name}: a #rrggbb colour`).toMatch(/^#[0-9a-f]{6}$/);
    expect(c.name, 'a plain name').toMatch(/^[A-Z][A-Za-z ]+$/);
  }
  expect(r.rows.length).toBe(15 * r.combos.length);
  for (const x of r.rows) {
    const who = `${x.style} + ${x.combo}`;
    expect.soft(x.got.layouts, `${who}: the layouts of the deck without the colours`).toEqual(x.control.layouts);
    expect.soft(x.got.contrast, `${who}: contrast`).toEqual([]);
    expect.soft(x.got.again, `${who}: contrast after a switch from the stored plan`).toEqual([]);
    expect.soft(x.got.againLayouts, `${who}: a switch keeps the layouts`).toEqual(x.control.layouts);
    expect.soft(x.got.missing, `${who}: no word is cut`).toEqual(x.control.missing);
    expect.soft(x.got.floorMiss, `${who}: every accent shape shows`).toEqual([]);
    for (const rp of x.got.repairs) expect.soft(rp, `${who}: repairs`).not.toMatch(/:layout$/);
  }
});
