// Round 8a: picture layouts that fit the picture. The layouts read the picture's shape (a tall phone screenshot is never cut into a circle, it fills a half-and-half split and shows its top), a deck with
// pictures has a hero (a picture over half of the slide), the same picture layout never sits on two slides in a row, the flavour never swaps a picture layout out, the writer prompt asks for the
// picture slides, and a lower-case style keeps "I" and the brand names of the text. ZERO model calls (a fake writer). Output: out/picture-layouts/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(15 * 60_000);
const OUT = 'out/picture-layouts';
const save = (name: string, b64: string) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${name}`, Buffer.from(b64, 'base64')); };

/** Shared helpers, defined in the page: test pictures (vector stand-ins with a "TOP" mark), the picture resolver, a fake writer, deck runner and a PNG helper. */
const HELP = `(async () => {
  const FA = await import('/src/reference/faithful.ts');
  const IM = await import('/src/carousel/layouts/images.ts');
  const D = await import('/src/carousel/designLibrary.ts');
  const PR = await import('/src/carousel/presets.ts');
  const svgPic = (w, h, label, c1, c2) => {
    const lines = Array.from({ length: Math.max(3, Math.floor(h / 160)) }, (_, i) => '<rect x="' + w * 0.1 + '" y="' + (h * 0.14 + i * 150) + '" width="' + w * (i % 2 ? 0.55 : 0.8) + '" height="46" rx="12" fill="#ffffff" opacity="0.8"/>').join('');
    const fs = Math.round(Math.min(w, h) * 0.2);
    const s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs><rect width="' + w + '" height="' + h + '" fill="url(#g)"/><rect width="' + w + '" height="' + Math.round(h * 0.07) + '" fill="#111"/>' + lines + '<text x="' + w / 2 + '" y="' + (h * 0.5) + '" font-size="' + fs + '" font-family="sans-serif" font-weight="800" text-anchor="middle" fill="#ffffff">' + label + '</text></svg>';
    return 'data:image/svg+xml;base64,' + btoa(s);
  };
  const SHAPES = { landscape: [1600, 1067, 'LAND', '#1E88E5', '#0D47A1'], landscape2: [1500, 1000, 'LAND 2', '#43A047', '#1B5E20'], wide: [2400, 600, 'WIDE', '#F4511E', '#BF360C'], wideReal: [597, 335, 'WIDE', '#8E24AA', '#4A148C'], portrait: [1000, 1500, 'PORT', '#FB8C00', '#E65100'], portrait2: [1200, 1600, 'PORT 2', '#00ACC1', '#006064'], square: [1200, 1200, 'SQUARE', '#D81B60', '#880E4F'], tall: [547, 2400, 'TALL', '#3949AB', '#1A237E'], tiny: [300, 200, 'TINY', '#6D4C41', '#3E2723'], bright: [1600, 1067, 'BRIGHT', '#ffffff', '#f2f2f2'], busy: [1600, 1067, 'BUSY', '#000000', '#ffffff'] };
  const urls = {};
  for (const [id, [w, h, label, a, b]] of Object.entries(SHAPES)) urls[id] = svgPic(w, h, label, a, b);
  // a very bright picture (white) and a very busy one (a fine black and white check): the title-over-photo scrim has to cope with both
  urls.bright = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1067"><rect width="1600" height="1067" fill="#ffffff"/><rect x="0" y="700" width="1600" height="367" fill="#f4f4f4"/></svg>');
  urls.busy = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1067" preserveAspectRatio="xMidYMid slice"><defs><pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#000"/><rect x="24" y="24" width="24" height="24" fill="#000"/><rect x="24" width="24" height="24" fill="#fff"/><rect y="24" width="24" height="24" fill="#fff"/></pattern></defs><rect width="1600" height="1067" fill="url(#p)"/></svg>');
  FA.setPictureResolver(async (ref) => urls[ref.slice('picture:'.length).split('#')[0]] ?? null);
  const info = (id) => ({ id, width: SHAPES[id][0], height: SHAPES[id][1] });
  const png64 = async (svg, w) => { const blob = await FA.svgToPng(svg, w); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t); };
  const SOURCE = 'Most people save notes and never open them again. A second brain fixes that. Capture one idea a day in a single place. Review it every Friday and link it to something you already know. Over a month you build a small wiki, not a notes graveyard. I did three things. ChatGPT and AI help, a PDF too. Comment "brain" and I will send you the document.';
  const BODY = [
    { layout: 'statement', fields: { headline: 'Your notes are not a second brain' }, accents: [] },
    { layout: 'split-text', fields: { headline: 'Saving is not keeping', paragraph: 'Most people save notes and never open them again.' }, accents: [] },
    { layout: 'checklist', fields: { title: 'A habit that works', items: ['Capture one idea a day', 'Review it every Friday', 'Link it to what you know'] }, accents: [] },
    { layout: 'big-stat', fields: { number: '1', label: 'idea a day' }, accents: [] },
    { layout: 'quote', fields: { quote: 'A second brain fixes that.' }, accents: [] },
  ];
  const CLOSING = { layout: 'cta-button', fields: { headline: 'Build a second brain', button: 'Comment brain' }, accents: [] };
  /** A deck from a fake writer: slides = the writer's plan (7 slides), pictures = ids of SHAPES. */
  const deck = async (o) => {
    const provider = { id: 'dev-cli', label: 'fake', async write(prompt) { deck.prompt = deck.prompt ?? prompt; return { text: JSON.stringify({ title: o.title ?? 'Second brain', slides: o.slides }), ms: 1 }; } };
    deck.prompt = undefined;
    const look = { pack: PR.presetPackFor(o.style, false), brief: '', hasPhoto: o.pictures.length > 0, images: o.pictures.map(info), site: '' };
    const res = await D.designLibraryDeck({ text: o.text ?? SOURCE, slides: o.slides.length, tone: 'clear', format: 'carousel', styleChoice: o.style, styles: [] }, look, '', provider, new AbortController().signal);
    const lib = res.designed.library;
    return { res, lib, specs: lib.plan.specs, prompt: deck.prompt, slides: o.slides.length, imagesOf: (i) => (res.designed.slides[String(i)]?.built?.images ?? []) };
  };
  const SHARE = (im) => (im.w * im.h) / (1080 * 1350);
  window.__H = { FA, IM, D, PR, SHAPES, info, png64, deck, BODY, CLOSING, SOURCE, SHARE };
})()`;

async function setup(page: Page) {
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
}
const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
const IMAGE_IDS = ['headline-body-image', 'image-row', 'thumb-rows', 'cover-art', 'photo-cover', 'portrait-closing', 'art-side-text', 'do-dont'];

// ----- B: which picture layouts survive in which style (the pipeline: flavour, picture pass, drawing) -----
test('B: every picture layout survives in every style (a table: style x layout), and is drawn with its picture', async ({ page }) => {
  await setup(page);
  const table = await page.evaluate(async ({ STYLES, IMAGE_IDS }) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const out: Record<string, Record<string, string>> = {};
    for (const style of STYLES) {
      out[style] = {};
      for (const id of IMAGE_IDS) {
        const def = L.layoutDef(id);
        const f = Object.fromEntries(Object.entries(def.samples.normal)) as any;
        const target = { layout: id, fields: f, accents: [] as string[] };
        const slides = [H.BODY[0], H.BODY[1], H.BODY[2], target, H.BODY[3], H.BODY[4], H.CLOSING];
        const d = await H.deck({ style, slides, pictures: ['landscape', 'landscape2', 'wide', 'portrait', 'portrait2', 'square', 'tall'] });
        const sp = d.specs[3];
        const has = Object.keys(sp.fields).some((k) => /^image\d?$/.test(k));
        const drawn = d.imagesOf(3).length;
        out[style][id] = sp.layout === id ? (has && drawn ? 'kept' : 'text-only') : 'swapped to ' + sp.layout;
      }
    }
    return out;
  }, { STYLES, IMAGE_IDS });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/survival.json`, JSON.stringify(table, null, 1));
  const short = (v: string) => (v === 'kept' ? 'ok' : v === 'text-only' ? 'TEXT' : v.replace('swapped to ', '>'));
  fs.writeFileSync(`${OUT}/survival.md`, ['| style | ' + IMAGE_IDS.join(' | ') + ' |', '|---|' + IMAGE_IDS.map(() => '---').join('|') + '|', ...STYLES.map((s) => `| ${s} | ${IMAGE_IDS.map((i) => short(table[s][i])).join(' | ')} |`)].join('\n'));
  const bad = STYLES.flatMap((s) => IMAGE_IDS.filter((i) => table[s][i] !== 'kept').map((i) => `${s}/${i}: ${table[s][i]}`));
  expect(bad, 'a picture layout was swapped or dropped').toEqual([]);
});

// ----- C1: the flavour never swaps a picture layout out -----
test('C1: the flavour never swaps out a picture layout the pictures fill, even one the style avoids', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const F: any = await import('/src/carousel/flavour.ts');
    const style0 = H.D.styleFromPack(H.PR.presetPackFor('style-4', false)).style;
    const style = { ...style0, flavour: { ...(style0.flavour ?? {}), avoid: ['headline-body-image', 'art-side-text', 'photo-cover'], prefer: ['split-text', 'checklist', 'statement', 'prose'] } };
    const specs = [
      { layout: 'statement', fields: { headline: 'Hello there' }, accents: [] },
      { layout: 'headline-body-image', fields: { headline: 'The flip', body: 'One zip, ten seconds.' }, accents: [] },
      { layout: 'checklist', fields: { title: 'Why', items: ['One', 'Two', 'Three'] }, accents: [] },
      { layout: 'art-side-text', fields: { heading: 'Follow us', paragraph: 'A new way to wear it every Friday.' }, accents: [] },
      { layout: 'big-stat', fields: { number: '30%', label: 'off for early backers' }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Back it', button: 'Back it now' }, accents: [] },
    ];
    const look = { pack: null, brief: '', hasPhoto: false, images: [H.info('landscape'), H.info('portrait')], site: '' };
    const res = F.flavourPass(specs, style, look, 'test');
    return { layouts: res.specs.map((s: any) => s.layout), swaps: res.swaps.map((s: any) => `${s.slide}:${s.from}>${s.to}`) };
  });
  expect(r.layouts[1]).toBe('headline-body-image');
  expect(r.layouts[3]).toBe('art-side-text');
  expect(r.swaps.filter((s: string) => /headline-body-image|art-side-text/.test(s.split('>')[0]))).toEqual([]);
});

// ----- C2: the writer prompt -----
test('C2: with pictures the writer prompt asks for min(pictures, half the slides) picture slides, a different layout each time, the picture shape, every picture once', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const rules = (n: number, slides: number) => H.D.imageRules(Array.from({ length: n }, (_, i) => H.info(['landscape', 'portrait', 'square', 'tall', 'wide'][i % 5])), slides).join('\n');
    const d = await H.deck({ style: 'style-4', slides: [...H.BODY, H.BODY[0], H.CLOSING].slice(0, 7), pictures: ['landscape', 'portrait', 'square'] });
    return { three7: rules(3, 7), two7: rules(2, 7), five7: rules(5, 7), one7: rules(1, 7), prompt: d.prompt as string, none: H.D.imageRules([], 7).length };
  });
  expect(r.three7).toContain('use at least 3 picture slides');
  expect(r.two7).toContain('use at least 2 picture slides');
  expect(r.five7).toContain('use at least 3 picture slides');
  expect(r.one7).toContain('use at least 1 picture slide ');
  expect(r.three7).toMatch(/DIFFERENT picture layout each time/);
  expect(r.three7).toMatch(/portrait or tall picture .* split layout/);
  expect(r.three7).toMatch(/landscape or wide picture takes a full-width layout/);
  expect(r.three7).toMatch(/square picture takes "cover-art"/);
  expect(r.three7).toMatch(/use every picture exactly once/);
  expect(r.prompt).toContain('PICTURE SLIDES: use at least 3 picture slides');
});

// ----- C3: the code upgrades a text slide to a picture layout when a picture is unused (same words) -----
test('C3: an unused picture gives a text slide a picture layout with the same words; the table of upgrades', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const PP: any = await import('/src/carousel/picturePass.ts');
    const slides = [
      { layout: 'statement', fields: { headline: 'Your notes are not a second brain' }, accents: [] },
      { layout: 'split-text', fields: { headline: 'Saving is not keeping', paragraph: 'Most people save notes and never open them again.' }, accents: [] },
      { layout: 'big-stat', fields: { number: '1', label: 'idea a day' }, accents: [] },
      { layout: 'statement', fields: { headline: 'Keep only what helps you act' }, accents: [] },
      { layout: 'checklist', fields: { title: 'A habit that works', items: ['Capture one idea', 'Review it Friday', 'Link it'] }, accents: [] },
      { layout: 'quote', fields: { quote: 'A second brain fixes that.' }, accents: [] },
      H.CLOSING,
    ];
    const d = await H.deck({ style: 'style-6', slides, pictures: ['landscape', 'portrait'] });
    const used = d.specs.map((s: any) => Object.keys(s.fields).filter((k) => /^image\d?$/.test(k)).length);
    const words = (s: any) => JSON.stringify(Object.entries(s.fields).filter(([k]) => !/^image\d?$/.test(k)).map(([, v]) => v)).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const lost: string[] = [];
    d.specs.forEach((s: any, i: number) => { if (s.layout !== slides[i].layout) { const have = new Set(words(s)); words(slides[i]).forEach((w: string) => { if (!have.has(w)) lost.push(`${i + 1}:${w}`); }); } });
    const targets: Record<string, string[]> = {};
    for (const [l, idx] of [['statement', 0], ['statement', 3], ['split-text', 1], ['prose', 1], ['headline-card', 1], ['checklist', 4], ['bullet-list', 4], ['pill-stagger', 4], ['comparison', 4]] as const) targets[`${l}${idx === 0 ? ' (cover)' : ''}`] = PP.targetsFor(l, idx);
    return { layouts: d.specs.map((s: any) => s.layout), used, lost, usedTotal: used.reduce((a: number, b: number) => a + b, 0), swaps: d.lib.pictureSwaps?.map((s: any) => `${s.slide}:${s.from}>${s.to}`), targets };
  });
  expect(r.usedTotal, 'both pictures are used: ' + JSON.stringify(r)).toBe(2);
  expect(r.lost, 'no word lost').toEqual([]);
  // (Round 9: title-over-photo and photo-full-caption join the targets of a statement, newer layouts first)
  expect(r.targets['statement (cover)']).toEqual(['title-over-photo', 'photo-cover', 'cover-art', 'photo-full-caption']);
  expect(r.targets['statement']).toEqual(['title-over-photo', 'photo-full-caption', 'cover-art', 'photo-cover']);
});

// ----- C4: never the same picture layout twice in a row -----
test('C4: two neighbouring slides never have the same picture layout when another fits', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const hbi = (headline: string, body: string) => ({ layout: 'headline-body-image', fields: { headline, body }, accents: [] });
    const slides = [H.BODY[0], hbi('Saving is not keeping', 'Most people save notes and never open them again.'), hbi('Keep only what helps', 'A wiki you open beats a graveyard you never do.'), H.BODY[2], H.BODY[3], H.BODY[4], H.CLOSING];
    const d = await H.deck({ style: 'style-6', slides, pictures: ['landscape', 'landscape2', 'portrait'] });
    return d.specs.map((s: any) => s.layout);
  });
  for (let i = 1; i < r.length; i++) if (IMAGE_IDS.includes(r[i])) expect(r[i], `slide ${i + 1} next to slide ${i}: ${r.join(', ')}`).not.toBe(r[i - 1]);
});

// ----- C5: shape-aware: circle only for near-square, tall = a panel showing the top, wide = a wide band -----
test('C5: a circle only for a near-square picture; the tall 547x2400 screenshot fills a split panel and shows its top; the wide 597x335 picture takes a wide band', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const st = H.D.styleFromPack(H.PR.presetPackFor('editorial-collage', false)).style;
    const draw = async (layout: string, v: 0 | 1, pic: string, fields: any) => {
      const s = H.SHAPES[pic];
      const image = H.IM.makeRef({ id: pic, w: s[0], h: s[1], ...(s[0] / s[1] <= 0.5 ? { fy: 0.1 } : {}) });
      const b = await L.buildSlide(layout, v, { ...fields, image }, st, { handle: '@h', index: 4, total: 7 });
      return { ok: b.ok, images: (b.images ?? []).map((x: any) => ({ x: x.x, y: x.y, w: x.w, h: x.h, circle: !!x.circle, src: x.src })) };
    };
    const cover = { headline: 'Why it works', subtitle: 'A second brain' };
    const longCover = { headline: 'Three things I did to fix it with my second brain', subtitle: 'A second brain' };
    const side = { heading: 'Follow the flip', paragraph: 'We post a new way to wear it every Friday, from the train to the trail.' };
    return {
      coverTall: await draw('cover-art', 0, 'tall', cover),
      coverTallLong: await draw('cover-art', 0, 'tall', longCover),
      coverSquare: await draw('cover-art', 0, 'square', cover),
      coverLand: await draw('cover-art', 0, 'landscape', cover),
      coverWideReal: await draw('cover-art', 0, 'wideReal', cover),
      sideTall: await draw('art-side-text', 0, 'tall', side),
      sideWide: await draw('art-side-text', 0, 'wideReal', side),
      ref: H.IM.parseRef(H.IM.makeRef({ id: 'tall', w: 547, h: 2400, fy: 0.1 })),
    };
  });
  expect(r.coverTall.ok && r.coverTall.images[0].circle, 'tall: never a circle').toBe(false);
  expect(r.coverTall.images[0].w / 1080, 'tall: the panel takes at most 45% of the width (the headline gets the room)').toBeLessThanOrEqual(0.45);
  expect(r.coverTall.images[0].h).toBe(1114);
  expect(r.coverTall.images[0].src, 'the top of the picture is shown').toMatch(/fy=0\.1/);
  // a headline that does not fit the text column at 85% of the usual size (4 lines at most) is the stacked version: the picture below the text, no circle, the top of the picture
  expect(r.coverTallLong.images[0].circle).toBe(false);
  expect(r.coverTallLong.images[0].w, 'stacked: the picture runs the width of the page').toBeGreaterThan(900);
  expect(r.coverTallLong.images[0].src).toMatch(/fy=0.1/);
  expect(r.coverSquare.images[0].circle, 'near-square: a circle is fine').toBe(true);
  expect(r.coverLand.images[0].circle, 'landscape: not a circle').toBe(false);
  expect(r.coverWideReal.images[0].circle, 'wide: not a circle').toBe(false);
  expect(r.coverWideReal.images[0].w, 'wide: a wide band').toBeGreaterThan(900);
  expect(r.sideTall.images[0].w / 1080).toBeLessThanOrEqual(0.45);
  expect(r.sideWide.images[0].w).toBeGreaterThan(900);
  expect(r.ref.fy).toBeLessThanOrEqual(0.2);
});

test('C5: placement: a very tall picture is focused near its top and is not cut into a multi-picture layout', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const P: any = await import('/src/carousel/imagePlace.ts');
    const one = P.placeOne('cover-art', 0, [H.info('tall')]);
    const row = P.placeOne('image-row', 0, [H.info('tall'), H.info('portrait'), H.info('portrait2')]);
    const rowOk = P.placeOne('image-row', 0, [H.info('tall'), H.info('portrait'), H.info('portrait2'), H.info('square')]);
    return { one: H.IM.parseRef(one.image), row, rowTall: rowOk ? Object.values(rowOk).map((v: any) => H.IM.parseRef(v)?.id) : null };
  });
  expect(r.one.fy).toBeLessThanOrEqual(0.2);
  expect(r.row, 'only 2 non-tall pictures: no row').toBeNull();
  expect(r.rowTall).not.toContain('tall');
});

// ----- C6: the hero -----
test('C6: a deck with pictures has a hero slide: a picture over at least 50% of the slide (the real deck: tall 547x2400 + wide 597x335)', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const real = async (style: string, pictures: string[], slides: any[]) => {
      const d = await H.deck({ style, slides, pictures });
      const shares = d.specs.map((_: any, i: number) => Math.max(0, ...d.imagesOf(i).map((im: any) => H.SHARE(im))));
      return { layouts: d.specs.map((s: any) => s.layout), shares: shares.map((x: number) => Math.round(x * 100)), hero: Math.max(...shares) };
    };
    const asr = { layout: 'art-side-text', fields: { heading: 'Follow the flip', paragraph: 'We post a new way to wear it every Friday.' }, accents: [] };
    const cov = { layout: 'cover-art', fields: { headline: 'Three things I did', subtitle: 'A second brain' }, accents: [] };
    const slides = [H.BODY[0], H.BODY[1], H.BODY[2], asr, cov, H.BODY[4], H.CLOSING];
    return {
      realDeck: await real('editorial-collage', ['wideReal', 'tall'], slides),
      landscapeOnly: await real('style-6', ['landscape', 'landscape2'], [H.BODY[0], H.BODY[1], { layout: 'headline-body-image', fields: { headline: 'The flip', body: 'One zip, ten seconds, no bag to pack.' }, accents: [] }, H.BODY[2], H.BODY[3], H.BODY[4], H.CLOSING]),
      tinyOnly: await real('style-6', ['tiny'], [H.BODY[0], H.BODY[1], { layout: 'headline-body-image', fields: { headline: 'The flip', body: 'One zip, ten seconds, no bag to pack.' }, accents: [] }, H.BODY[2], H.BODY[3], H.BODY[4], H.CLOSING]),
    };
  });
  expect(r.realDeck.hero, JSON.stringify(r.realDeck)).toBeGreaterThanOrEqual(0.5);
  expect(r.landscapeOnly.hero, JSON.stringify(r.landscapeOnly)).toBeGreaterThanOrEqual(0.5);
  // every picture tiny (under 400 px): no hero is forced
  expect(r.tinyOnly.hero, JSON.stringify(r.tinyOnly)).toBeLessThan(0.5);
});

// ----- D: casing -----
test('D: a lower-case style keeps "I", its contractions, and the brand names and acronyms of the text; an upper-case style is unchanged', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const B: any = await import('/src/carousel/layouts/build.ts');
    const L: any = await import('/src/carousel/layouts/index.ts');
    const text = 'Your brain is the worst place to store your life. Here are the three things I did to fix it. I can do it, and I\'ll show you. ChatGPT and Claude are fine, but AI needs a PDF. As I can see, SEO and ROI matter.';
    const brands = B.sourceBrands(text);
    const low = (m: 'lower' | 'upper', s: string, canon: string[]) => B.caseFields({ headline: s }, m, { canon, written: [] }).headline;
    const head = 'Three things I did, as I can, I\'m sure I\'ll say I\'d use ChatGPT and Claude with AI and a PDF';
    const st = H.D.styleFromPack(H.PR.presetPackFor('editorial-collage', false)).style;
    const b = await L.buildSlide('statement', 0, { headline: 'Three things I did to fix it' }, { ...st, caseExceptions: brands }, { handle: '@h', index: 1, total: 7 });
    const drawn = (b.layers as any[]).filter((l) => l.kind === 'text').map((l) => l.text as string).join(' | ');
    return { brands, lower: low('lower', head, brands), upper: low('upper', 'Three things I did with ChatGPT and AI', brands), drawn, caseStyle: st.caseStyle };
  });
  expect(r.caseStyle).toBe('lower');
  for (const w of ['ChatGPT', 'Claude', 'AI', 'PDF', 'SEO', 'ROI']) expect(r.brands).toContain(w);
  expect(r.brands).not.toContain('Your');
  expect(r.lower).toBe("three things I did, as I can, I'm sure I'll say I'd use ChatGPT and Claude with AI and a PDF");
  expect(r.upper, 'upper case: only the mixed-case brands keep their spelling (as before)').toBe('THREE THINGS I DID WITH ChatGPT AND AI');
  expect(r.drawn, 'drawn "three things I did", not "i did"').toMatch(/three things I did to fix it/);
});

test('D: in a deck, "three things I did" and the brand names keep their capitals in a lower-case style', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const slides = [{ layout: 'statement', fields: { headline: 'Three things I did with ChatGPT and AI' }, accents: [] }, H.BODY[1], H.BODY[2], H.BODY[3], H.BODY[4], H.CLOSING];
    const d = await H.deck({ style: 'editorial-collage', slides, pictures: [], text: H.SOURCE });
    const slide0 = d.res.designed.slides['0'].built;
    return (slide0.layers as any[]).filter((l) => l.kind === 'text').map((l) => l.text as string).join(' | ');
  });
  expect(r).toContain('three things I did with ChatGPT and AI');
  expect(r).not.toMatch(/things i did|chatgpt/);
});

// ----- E: route reason -----
test('E: the route reason names the style id the deck was drawn with', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const DS: any = await import('/src/carousel/designed.ts');
    const reason = DS.chooseRoute({ style: 'style-7', activeStyle: '__active__', pack: null, presetPack: {} as any, format: 'carousel' }).reason as string;
    return { reason, fixed: DS.withStyleId(reason, 'editorial-collage'), none: DS.withStyleId(reason, null) };
  });
  expect(r.reason).toContain('("style-7")');
  expect(r.fixed).toContain('("editorial-collage")');
  expect(r.fixed).not.toContain('style-7');
  expect(r.none).toBe(r.reason);
});

// ----- F: the contact sheet of the current picture layouts and the before/after of the real deck's two bad slides -----
const SHEET_STYLES = ['editorial-collage', 'style-4', 'dark-quiet'];
for (const style of SHEET_STYLES) {
  test(`F: contact sheet of the eight picture layouts with five picture shapes (${style})`, async ({ page }) => {
    await setup(page);
    const png = await page.evaluate(async ({ style, IMAGE_IDS }) => {
      const H = (window as any).__H;
      const L: any = await import('/src/carousel/layouts/index.ts');
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      const shapes = [['landscape', 'landscape 3:2'], ['portrait', 'portrait 2:3'], ['square', 'square'], ['tall', 'tall 547x2400'], ['wide', 'wide 2400x600']] as const;
      const cw = 216, ch = 270, lab = 28, gap = 10, left = 190;
      const W = left + shapes.length * (cw + gap) + gap, Hh = 40 + IMAGE_IDS.length * (ch + lab + gap) + gap;
      const c = document.createElement('canvas'); c.width = W; c.height = Hh;
      const g = c.getContext('2d')!;
      g.fillStyle = '#eeeeee'; g.fillRect(0, 0, W, Hh);
      g.fillStyle = '#111'; g.font = 'bold 22px sans-serif'; g.fillText(style, 10, 28);
      shapes.forEach(([, name], k) => { g.font = '16px sans-serif'; g.fillText(name, left + k * (cw + gap), 36); });
      let row = 0;
      for (const id of IMAGE_IDS) {
        const def = L.layoutDef(id);
        g.fillStyle = '#111'; g.font = 'bold 16px sans-serif'; g.fillText(id, 8, 40 + row * (ch + lab + gap) + ch / 2);
        for (let k = 0; k < shapes.length; k++) {
          const [pid] = shapes[k];
          const s = H.SHAPES[pid];
          const ref = H.IM.makeRef({ id: pid, w: s[0], h: s[1], ...(s[0] / s[1] <= 0.5 ? { fy: 0.1 } : {}) });
          const f: any = { ...def.samples.normal };
          const keys = def.fields.filter((q: any) => q.image).map((q: any) => q.name as string);
          keys.forEach((kk: string) => { f[kk] = ref; });
          const b = await L.buildSlide(id, 0, f, st, { handle: '@h', index: 3, total: 7 });
          const x = left + k * (cw + gap), y = 40 + row * (ch + lab + gap);
          if (!b.ok) { g.fillStyle = '#c00'; g.fillText('not drawn', x + 10, y + 40); continue; }
          const blob: Blob = await H.FA.svgToPng(b.svg, cw * 2);
          const bm = await createImageBitmap(blob);
          g.drawImage(bm, x, y, cw, ch);
        }
        row++;
      }
      return await new Promise<string>((res) => c.toBlob(async (b) => { const u = new Uint8Array(await b!.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); res(btoa(t)); }, 'image/png'));
    }, { style, IMAGE_IDS });
    save(`contact-sheet-${style}.png`, png);
  });
}

const TAG = process.env.PIC_TAG ?? 'after';
test(`F: the real deck's two bad slides drawn again (${TAG}): the wide picture under tiny text and the tall screenshot in a circle`, async ({ page }) => {
  await setup(page);
  const shots = await page.evaluate(async () => {
    const H = (window as any).__H;
    const asr = { layout: 'art-side-text', fields: { heading: 'Follow the flip every week', paragraph: 'We post a new way to wear it every Friday, from the train to the trail.' }, accents: [] };
    const cov = { layout: 'cover-art', fields: { headline: 'Three things I did to fix it', subtitle: 'A second brain' }, accents: [] };
    const slides = [H.BODY[0], H.BODY[1], H.BODY[2], asr, cov, H.BODY[4], H.CLOSING];
    const d = await H.deck({ style: 'editorial-collage', slides, pictures: ['wideReal', 'tall'] });
    const out: Record<string, string> = {};
    for (let i = 0; i < 7; i++) { const svg = d.res.designed.slides[String(i)]?.built?.svg; if (svg) out[String(i)] = await H.png64(svg, 540); }
    return { out, layouts: d.specs.map((s: any) => s.layout) };
  });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [i, b64] of Object.entries(shots.out)) if (['3', '4'].includes(i) || TAG === 'after') save(`real-deck-${TAG}-slide${Number(i) + 1}.png`, b64);
  fs.writeFileSync(`${OUT}/real-deck-${TAG}-layouts.txt`, shots.layouts.join(', '));
});

test('F: the hero slides drawn: a landscape picture in the hero band, a portrait picture in a split', async ({ page }) => {
  await setup(page);
  const shots = await page.evaluate(async () => {
    const H = (window as any).__H;
    const hbi = { layout: 'headline-body-image', fields: { headline: 'The flip', body: 'One zip, ten seconds, no bag to pack.' }, accents: [] };
    const out: Record<string, string> = {};
    const a = await H.deck({ style: 'style-4', slides: [H.BODY[0], H.BODY[1], hbi, H.BODY[2], H.BODY[3], H.BODY[4], H.CLOSING], pictures: ['landscape'] });
    out['hero-band-landscape.png'] = await H.png64(a.res.designed.slides['2'].built.svg, 540);
    const b = await H.deck({ style: 'dark-quiet', slides: [H.BODY[0], H.BODY[1], hbi, H.BODY[2], H.BODY[3], H.BODY[4], H.CLOSING], pictures: ['portrait'] });
    out['split-portrait.png'] = await H.png64(b.res.designed.slides['2'].built.svg, 540);
    return out;
  });
  for (const [n, b64] of Object.entries(shots)) save(n, b64);
});
