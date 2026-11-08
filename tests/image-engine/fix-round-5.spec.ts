// Fix round 5 (ZERO model calls): the picture post-pass (every supplied picture gets a slide, no text lost, no empty slot), stat-grid labels under their own figures on every preset, the art
// frequency cap (and rings only on accent slides), a long handle in a three-part footer, and a pill/caption/sub that repeats the headline.
import { expect, test } from '@playwright/test';

test.setTimeout(10 * 60_000);
const PRESETS = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];

const DECK = [
  { layout: 'statement', fields: { headline: 'Why do we ship hoodies?', caption: 'One piece, two jobs.' }, accents: ['hoodies'] },
  { layout: 'split-text', fields: { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' }, accents: ['built'] },
  { layout: 'checklist', fields: { title: 'Before you start', items: ['Pick a size', 'Charge the lights', 'Zip the pocket'] }, accents: [] },
  { layout: 'comparison', fields: { title: 'Pack it', leftLabel: 'Before', leftText: 'Two bags', rightLabel: 'After', rightText: 'One hoodie' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'Who it suits', paragraph: 'Commuters, hikers and anyone who hates carrying two things.' }, accents: [] },
  { layout: 'quote', fields: { quote: 'I stopped carrying a bag the day this arrived.', author: 'An early backer' }, accents: [] },
  { layout: 'prose', fields: { heading: 'Two years of rain', p1: 'It took two years of testing in the rain. Today it flips in ten seconds.' }, accents: [] },
  { layout: 'statement-card', fields: { headline: 'One hoodie. Two jobs.' }, accents: [] },
];

test('the picture post-pass: with 1, 2, 3 and 5 pictures and a writer that picks no picture layout, every picture gets a slide, no text is lost, no slot is empty', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (DECK) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const I = await import('/src/carousel/layouts/images.ts');
    const flat = (f: any) => Object.entries(f).filter(([k]) => k !== 'accent' && !I.IMAGE_KEYS.includes(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map(String);
    const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const pack = PR.presetPackFor('hot-flat', false);
    const req: any = { text: 'Quick Flip is a hoodie that flips into a backpack in ten seconds. '.repeat(3) + ' Back it on Kickstarter today.', slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'hot-flat', styles: [] };
    const SETS: Record<string, any[]> = {
      one: [{ id: 'a', width: 1600, height: 900 }],
      two: [{ id: 'a', width: 1600, height: 900 }, { id: 'b', width: 1000, height: 1500 }],
      three: [{ id: 'a', width: 1600, height: 900 }, { id: 'b', width: 1500, height: 1000 }, { id: 'c', width: 1200, height: 1200 }],
      five: [{ id: 'a', width: 1600, height: 900 }, { id: 'b', width: 1000, height: 1500 }, { id: 'c', width: 1500, height: 1000 }, { id: 'd', width: 1000, height: 1400 }, { id: 'e', width: 1200, height: 1200 }],
    };
    const out: any = {};
    for (const [name, images] of Object.entries(SETS)) {
      let prompt = '';
      const provider: any = { id: 'dev-cli', label: 'fake', async write(p: string) { prompt = p; return { text: JSON.stringify({ title: 'T', slides: DECK }), ms: 5 }; } };
      const res: any = await D.designLibraryDeck(req, { pack, hasPhoto: true, images }, '@quick.flip', provider, new AbortController().signal);
      const lib = res.designed.library;
      const specs = lib.plan.specs as { layout: string; fields: any }[];
      const usedIds = specs.flatMap((s) => I.IMAGE_KEYS.filter((k: string) => s.fields[k]).map((k: string) => I.parseRef(s.fields[k])?.id));
      const swaps = (lib.pictureSwaps ?? []) as { slide: number; from: string; to: string }[];
      const lost: string[] = [];
      for (const w of swaps) {
        const was = flat(DECK[w.slide - 1].fields).flatMap(words), now = new Set(flat(specs[w.slide - 1].fields).flatMap(words));
        for (const t of was) if (!now.has(t)) lost.push(`slide ${w.slide} ${w.from}->${w.to}: "${t}"`);
      }
      const empty: string[] = [];
      specs.forEach((s, i) => { if (I.IMAGE_LAYOUT_IDS.includes(s.layout)) { const n = I.IMAGE_KEYS.filter((k: string) => s.fields[k]).length; if (n && n < I.imagesNeeded(s.layout)) empty.push(`slide ${i + 1} ${s.layout}: ${n} of ${I.imagesNeeded(s.layout)}`); } });
      const drawn = Object.values<any>(res.designed.slides).map((s) => (s.built.svg.match(/<image /g) ?? []).length).reduce((a: number, b: number) => a + b, 0);
      out[name] = { ids: images.map((p) => p.id), used: usedIds, swaps, layouts: lib.layouts, lost, empty, drawn, prompt, calls: lib.calls };
    }
    return out;
  }, DECK);
  for (const [name, x] of Object.entries<any>(r)) {
    expect(x.calls, `${name}: the writer was asked once`).toBe(1);
    expect(x.prompt, `${name}: the writer is told to use the pictures`).toContain('Pictures were supplied: USE THEM');
    console.log('PP ' + name + ' ' + JSON.stringify({ swaps: x.swaps.map((w: any) => w.slide + ':' + w.from + '>' + w.to), layouts: x.layouts, used: x.used }));
    expect([...new Set(x.used)].sort(), `${name}: every picture is on a slide`).toEqual([...x.ids].sort());
    expect(x.used.length, `${name}: each picture once`).toBe(new Set(x.used).size);
    expect(x.swaps.length, `${name}: the post-pass did the work (the writer chose no picture layout)`).toBeGreaterThan(0);
    expect(x.lost, `${name}: no text lost`).toEqual([]);
    expect(x.empty, `${name}: no empty slot`).toEqual([]);
    expect(x.drawn, `${name}: a picture is drawn for every placed picture`).toBe(x.used.length);
    // meaning: only the allowed pairs
    for (const w of x.swaps) expect(['statement>photo-cover', 'statement>cover-art', 'split-text>headline-body-image', 'split-text>art-side-text', 'split-text>photo-cover', 'prose>headline-body-image', 'prose>art-side-text', 'prose>photo-cover', 'checklist>thumb-rows', 'checklist>image-row', 'comparison>do-dont'], `${name}: ${w.from} -> ${w.to}`).toContain(`${w.from}>${w.to}`);
  }
  expect(r.two.swaps.some((w: any) => w.to === 'do-dont') || r.two.swaps.length === 2, 'two pictures: a comparison as do-dont or two single swaps').toBe(true);
  console.log('PICTURE PASS ' + JSON.stringify(Object.fromEntries(Object.entries<any>(r).map(([k, x]) => [k, x.swaps.map((w: any) => `${w.slide}:${w.from}>${w.to}`)]))));
});

test('without pictures nothing changes; the pass leaves a slide whose text would not fit alone', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (DECK) => {
    const P = await import('/src/carousel/picturePass.ts');
    const none = P.picturePass(DECK as any, { pack: undefined } as any);
    const long = [{ layout: 'split-text', fields: { headline: 'A headline that is rather long indeed', paragraph: 'A paragraph of about thirteen words that fits the split text layout easily today.' }, accents: [] }];
    const p1 = P.picturePass(long as any, { images: [{ id: 'a', width: 1600, height: 900 }] } as any);
    // a quote, a stat and a closing are never turned into a picture slide
    const fixed = [{ layout: 'quote', fields: { quote: 'Words in the text.', author: 'Someone' }, accents: [] }, { layout: 'big-stat', fields: { number: '68%', label: 'would take a pay cut' }, accents: [] }, { layout: 'contact-closing', fields: { headline: 'Questions?', contacts: ['a@b.c', 'b.c'] }, accents: [] }];
    const p2 = P.picturePass(fixed as any, { images: [{ id: 'a', width: 1600, height: 900 }] } as any);
    return { none: none.swaps.length, same: JSON.stringify(none.specs) === JSON.stringify(DECK), p1: p1.swaps.map((w: any) => w.to), p2: p2.swaps.length };
  }, DECK);
  expect(r.none).toBe(0);
  expect(r.same).toBe(true);
  expect(r.p1, 'a text slide takes the picture').toEqual(['headline-body-image']);
  expect(r.p2, 'a quote, a figure and a contact closing keep their layout').toBe(0);
});

test('stat-grid: every drawn label is the one for its figure (the label is directly under its own figure), on every preset, both variants', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PRESETS) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const light: any = { palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#1B5E20', surface: '#F0F0F0', onAccent: '#FFFFFF' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: false, profileHeader: false, underline: false }, accentStyle: 'text' };
    const sets: [string, string[], string[]][] = [
      ['commute', ['54 min', '220 hours', '$11,000'], ['commuting each day', 'commuting each year', 'office, per employee']],
      ['four', ['10 sec', '1.2 kg', '16 in', '30%'], ['to flip', 'total weight', 'laptop fits', 'early discount']],
      ['short', ['10s', '1 kg', '16"'], ['to flip', 'light', 'laptop']],
    ];
    const bad: string[] = [];
    let checked = 0;
    for (const id of ['light', ...PRESETS]) {
      const st = id === 'light' ? light : D.styleFromPack(PR.presetPackFor(id, false)).style;
      for (const v of [0, 1] as const) for (const [name, ns, ls] of sets) for (const index of [2, 5]) {
        const b = await L.buildSlide('stat-grid', v, { title: 'In numbers', numbers: ns, labels: ls }, st, { handle: '@x', index, total: 8, cut: 'plain' });
        if (!b.ok) { bad.push(`${id}/v${v + 1}/${name}: not drawn`); continue; }
        const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring') && l.name !== 'title');
        // each figure and its label: the label is the NEAREST text below the figure within its column, and nothing else sits between them
        ns.forEach((n, i) => {
          const fig = texts.find((t) => String(t.text) === n), lab = texts.find((t) => String(t.text) === ls[i]);
          checked++;
          if (!fig || !lab) { bad.push(`${id}/v${v + 1}/${name}: "${n}" or "${ls[i]}" is not drawn`); return; }
          const below = texts.filter((t) => t !== fig && t.y > fig.y + 10 && Math.abs(t.x - fig.x) < 70).sort((a, c) => a.y - c.y)[0];
          if (below !== lab) bad.push(`${id}/v${v + 1}/${name}: under "${n}" is "${below?.text}", not "${ls[i]}"`);
        });
      }
    }
    return { bad, checked };
  }, PRESETS);
  expect(r.checked).toBeGreaterThan(600);
  expect(r.bad.slice(0, 12)).toEqual([]);
});

test('art frequency: at most one art item per three slides, never on two slides in a row, a ring only on a slide with an accent word', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const mk = (accent: boolean, n: number) => Array.from({ length: n }, (_, i) => ({ layout: 'statement', fields: { headline: `Slide ${i + 1} is a calm headline here` }, accents: accent ? ['calm'] : [] }));
    const out: any = {};
    for (const id of ['style-1', 'style-2', 'style-4', 'style-5', 'style-7', 'style-8']) {
      const pack = PR.presetPackFor(id, false);
      for (const [name, accent, n] of [['accent9', true, 9], ['plain9', false, 9], ['accent10', true, 10]] as [string, boolean, number][]) {
        const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style: null, styleNotes: [], plan: { title: 'T', specs: mk(accent, n) } };
        const res = await D.redrawLibraryDeck(lib, { pack, hasPhoto: false }, '@quick.flip');
        const slides = Object.entries<any>(res.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s.built);
        out[`${id}/${name}`] = { n, art: slides.map((b) => ((b.devices ?? []) as any[]).filter((d) => String(d.id).startsWith('art:')).map((d) => d.id.slice(4))) };
      }
    }
    return out;
  });
  for (const [k, x] of Object.entries<any>(r)) {
    const withArt = x.art.map((a: string[], i: number) => (a.length ? i : -1)).filter((i: number) => i >= 0);
    expect(x.art.every((a: string[]) => a.length <= 1), `${k}: one item per slide at most`).toBe(true);
    expect(withArt.length, `${k}: at most a third of the slides (${withArt.length} of ${x.n})`).toBeLessThanOrEqual(Math.ceil(x.n / 3));
    for (let i = 1; i < withArt.length; i++) expect(withArt[i] - withArt[i - 1], `${k}: never two slides in a row`).toBeGreaterThan(1);
    if (k.startsWith('style-7/plain')) expect(withArt, 'style-7 art is rings: none on a deck with no accent word').toEqual([]);
  }
  expect(Object.entries<any>(r).filter(([k]) => /accent/.test(k)).some(([, x]) => x.art.some((a: string[]) => a.length)), 'art still appears').toBe(true);
});

test('a long handle in a three-part footer or header: the handle is cut, the middle item is dropped or moved, nothing overlaps', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const C = await import('/src/carousel/layouts/chrome.ts');
    const T = await import('/src/image-engine/draw/text.ts');
    const out: any = {};
    const font = 'Instrument Sans';
    const widthOf = (t: any) => T.measureWidth(t.text, font, t.weight ?? 500, t.size);
    const box = (t: any) => { const w = widthOf(t); const x0 = t.anchor === 'end' ? t.x - w : t.anchor === 'middle' ? t.x - w / 2 : t.x; return { x0, x1: x0 + w, y: t.y, text: t.text }; };
    for (const [name, deco] of [['footer', { footerRow: true }], ['header', { headerRow: true }]] as [string, any][]) for (const handle of ['@abcdefghijklmnopqrs', '@maya.designs', '@buildinpublic.dan']) {
      const brandT = (C.chromeFor({ handle, index: 2, total: 8, profile: false, font, deco, site: 'quickflip.studio' }) as any[]).find((t) => t.x === 1032 && t.anchor === 'end' && t.y > 1200);
      const list = (C.chromeFor({ handle, index: 2, total: 8, profile: false, font, deco, site: 'quickflip.studio' }) as any[]).filter((t) => t.text && !t.shape && (name === 'header' ? t.y < 200 : t.y > 1200)).map(box);
      // the footer logo star sits left of the brand (devices.ts: 24 px gap, 32 px wide)
      if (name === 'footer' && brandT) { const sx = 1032 - Math.max(widthOf(brandT), brandT.text.length * 36 * 0.58) - 24 - 32; list.push({ x0: sx, x1: sx + 32, y: 1288, text: 'logo star' }); }
      const bad: string[] = [];
      list.forEach((a, i) => list.forEach((b, j) => { if (j > i && Math.abs(a.y - b.y) < 20 && a.x0 < b.x1 + 24 && a.x1 > b.x0 - 24) bad.push(`"${a.text}" crowds "${b.text}"`); }));
      list.forEach((a) => { if (a.x0 < 47 || a.x1 > 1033) bad.push(`"${a.text}" leaves the margins (${Math.round(a.x0)}..${Math.round(a.x1)})`); });
      out[`${name} ${handle}`] = { bad, texts: list.filter((t) => t.text !== 'logo star').map((t) => t.text) };
    }
    return out;
  });
  for (const [k, x] of Object.entries<any>(r)) expect(x.bad, `${k}: ${JSON.stringify(x.texts)}`).toEqual([]);
  // the short handles keep all three parts
  expect(r['footer @maya.designs'].texts.length).toBe(3);
  expect(r['header @maya.designs'].texts.length).toBe(3);
  // a 20-character handle: still the handle (maybe cut) and the brand; the site may be left out
  expect(r['footer @abcdefghijklmnopqrs'].texts.length).toBeGreaterThanOrEqual(2);
});

test('a pill, caption or sub that repeats the headline is taken out (a trim, never a failure)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const rh = (a: string, b: string) => D.repeatsHeadline(a, b);
    const table = {
      repeat1: rh('Opening this month', 'First 200 spots open this month'),
      repeat2: rh('First 200 spots open this month', 'first 200 spots open this month!'),
      repeat3: rh('Neither is better', 'Neither is better. They reward different habits.'),
      other1: rh('No data analyst needed', 'See where every dollar goes'),
      other2: rh('One piece. Two jobs.', 'A hoodie that flips into a backpack'),
      other3: rh('Eleven started. Three finished.', 'Why do side projects die at month three?'),
    };
    const specs = [
      { layout: 'statement-pill', fields: { headline: 'First 200 spots open this month', caption: 'Opening this month' }, accents: [] },
      { layout: 'statement', fields: { headline: 'See where every dollar goes', caption: 'No data analyst needed' }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Back it today', button: 'Back it now', sub: 'Back it today, early backers save' }, accents: [] },
    ];
    const dr = D.dropRepeats(specs as any);
    // the pipeline: the writer returns the repeat, the deck is made with no retry and no failure
    const body = [{ layout: 'statement-card', fields: { headline: 'Your bag is now your hoodie' }, accents: [] }, { layout: 'split-text', fields: { headline: 'Why we built it', paragraph: 'One layer does both jobs.' }, accents: [] }, { layout: 'checklist', fields: { title: 'Before you start', items: ['Pick a size', 'Charge the lights', 'Zip the pocket'] }, accents: [] }, { layout: 'quote', fields: { quote: 'I stopped carrying a bag.', author: 'A backer' }, accents: [] }];
    const answer = JSON.stringify({ title: 'T', slides: [specs[0], ...body, { layout: 'statement-card', fields: { headline: 'Done', caption: 'Done for today' }, accents: [] }] });
    let n = 0;
    const provider: any = { id: 'dev-cli', label: 'fake', async write() { n++; return { text: answer, ms: 5 }; } };
    const res: any = await D.designLibraryDeck({ text: 'Northbeam 2.0. '.repeat(10) + ' Join the waitlist today.', slides: 6, tone: 'clear', format: 'carousel', styleChoice: 'style-7', styles: [] }, { pack: PR.presetPackFor('style-7', false) }, '@northbeam', provider, new AbortController().signal);
    const lib = res.designed.library;
    return { table, dr: { layouts: dr.specs.map((s: any) => s.layout), fields: dr.specs.map((s: any) => Object.keys(s.fields)), trims: dr.trims.length }, calls: n, first: lib.layouts[0], firstFields: lib.plan.specs[0].fields, notes: lib.codeAdjustments, layouts: lib.layouts };
  });
  expect(r.table.repeat1).toBe(true);
  expect(r.table.repeat2).toBe(true);
  expect(r.table.repeat3).toBe(true);
  expect(r.table.other1).toBe(false);
  expect(r.table.other2).toBe(false);
  expect(r.table.other3).toBe(false);
  expect(r.dr.layouts, 'a pill that repeats the headline becomes a plain statement (a statement card when the next slide is already a statement)').toEqual(['statement-card', 'statement', 'cta-button']);
  expect(r.dr.fields[0]).toEqual(['headline']);
  expect(r.dr.fields[1], 'a caption that adds something stays').toEqual(['headline', 'caption']);
  expect(r.dr.fields[2], 'the repeating sub goes, the button stays').toEqual(['headline', 'button']);
  expect(r.dr.trims).toBe(2);
  expect(r.calls, 'no retry call').toBe(1);
  expect(r.first).toBe('statement');
  expect(r.firstFields.caption).toBeUndefined();
  expect(r.notes.join(' ')).toContain('repeats the headline');
});
