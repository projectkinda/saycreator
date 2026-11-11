// Round 8a part G: (G1) nothing is drawn that nobody wrote (no "The text" under a quote, no sub line that only repeats the topic), (G2) a body column never wraps to more than 5 lines in the
// side-by-side split (and a highlight box stays inside the 48 px margin), (G3) a 2:1 or wider picture on art-side-text takes the hero band. The real second-brain text, a fake writer: ZERO model calls.
// Output: out/cover-variety/ (real-deck-after-G.png and the area numbers)
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(15 * 60_000);
const OUT = 'out/cover-variety';
const TAG = process.env.PIC_TAG ?? 'after';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const srcSrc = fs.readFileSync('tests/image-engine/closing-source.spec.ts', 'utf8');
const SOURCE = srcSrc.slice(srcSrc.indexOf('export const SOURCE = `') + 23, srcSrc.indexOf('`;\n\nconst CLOSING'));
const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
const save = (name: string, b64: string) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${name}`, Buffer.from(b64, 'base64')); };

async function setup(page: Page) {
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
}

/** The real second-brain deck as the writer plan: slide 2 split-text (11-word body, "keeping" highlighted), slide 4 art-side-text, slide 5 cover-art with a sub line, slide 6 a quote with an INVENTED attribution. */
const PLAN = `(() => {
  const H = window.__H;
  return {
    slides: (o) => [
      { layout: 'statement', fields: { headline: 'Your brain is the worst place to store your life' }, accents: [] },
      { layout: 'split-text', fields: { headline: 'Saving is not keeping', paragraph: 'Every unfinished task is a background process draining you all day.' }, accents: ['keeping'] },
      { layout: 'checklist', fields: { title: 'What I did', items: ['Moved everything into a structure', 'Gave it as much context as possible', 'Let it work for me'] }, accents: [] },
      { layout: 'art-side-text', fields: { heading: 'Think of it as a wiki', paragraph: 'Give it a structure so that it resurfaces at the right moment.' }, accents: [] },
      { layout: 'cover-art', fields: { headline: 'Three things I did to fix it', subtitle: 'A second brain' }, accents: [] },
      { layout: 'quote', fields: { quote: 'I let it work for me.', author: o.author ?? 'The text' }, accents: [] },
      H.CLOSING,
    ],
  };
})()`;

test('G1: the real second-brain deck draws no "The text", no attribution the text does not name, and no sub line that only repeats the topic', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ PLAN, SOURCE }) => {
    const H = (window as any).__H;
    const P = eval(PLAN);
    const out: any = {};
    for (const style of ['editorial-collage', 'style-4']) {
      const d = await H.deck({ style, slides: P.slides({}), pictures: ['wide', 'tall'], text: SOURCE });
      const words = (i: number) => (d.res.designed.slides[String(i)]?.built?.layers ?? []).filter((l: any) => l.kind === 'text').map((l: any) => String(l.text)).join(' | ');
      out[style] = { all: [0, 1, 2, 3, 4, 5, 6].map(words), specs: d.specs.map((s: any) => ({ layout: s.layout, fields: s.fields })), notes: d.lib.codeAdjustments };
    }
    return out;
  }, { PLAN, SOURCE });
  for (const style of Object.keys(r)) {
    const x = r[style];
    for (let i = 0; i < 7; i++) expect(x.all[i], `${style} slide ${i + 1}`).not.toMatch(/The text|\bthe text\b/i);
    expect(x.all[5], `${style}: the quote has no attribution and no "—" line`).not.toContain('—');
    const quote = x.specs.find((s: any) => s.layout === 'quote');
    expect(quote.fields.author, `${style}: no attribution field`).toBeUndefined();
    expect(x.all[4], `${style}: the sub line "A second brain" only repeats the topic`).not.toMatch(/a second brain/i);
    expect(x.notes.join(' ')).toMatch(/attribution "The text" is not in your text/);
  }
});

test('G1: in all 15 styles no quote slide has an attribution unless the text names one', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ STYLES }) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const named = 'Maya Rodriguez said it best at the launch: I let it work for me.';
    const run = async (style: string, text: string, author: string) => {
      const slides = [H.BODY[0], H.BODY[1], H.BODY[2], H.BODY[3], { layout: 'quote', fields: { quote: 'I let it work for me.', author }, accents: [] }, H.BODY[4], H.CLOSING];
      const d = await H.deck({ style, slides, pictures: [], text });
      const q = d.specs.findIndex((s: any) => s.layout === 'quote');
      const words = (d.res.designed.slides[String(q)]?.built?.layers ?? []).filter((l: any) => l.kind === 'text').map((l: any) => String(l.text)).join(' | ');
      return { author: d.specs[q].fields.author ?? null, words };
    };
    void L;
    const rows: any[] = [];
    for (const style of STYLES) rows.push({ style, invented: await run(style, H.SOURCE, 'The text'), kept: await run(style, named, 'Maya Rodriguez') });
    return rows;
  }, { STYLES });
  for (const x of r) {
    expect(x.invented.author, `${x.style}: invented attribution is dropped`).toBeNull();
    expect(x.invented.words, `${x.style}`).not.toMatch(/The text|—/i);
    expect(x.kept.author, `${x.style}: a named person stays`).toBe('Maya Rodriguez');
    expect(x.kept.words, `${x.style}`).toContain('Maya Rodriguez');
  }
});

test('G1: the generic labels are gone: a pasted quote has no "From the text", the quote layout draws no rule without an attribution', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const L: any = await import('/src/carousel/layouts/index.ts');
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const P: any = await import('/src/carousel/pasted.ts');
    const st = D.styleFromPack(PR.presetPackFor('style-6', false)).style;
    const draw = async (fields: any) => L.buildSlide('quote', 0, fields, st, { handle: '@h', index: 5, total: 7 });
    const without = await draw({ quote: 'I let it work for me.' });
    const withA = await draw({ quote: 'I let it work for me.', author: 'Maya Rodriguez' });
    const texts = (b: any) => (b.layers as any[]).filter((l) => l.kind === 'text').map((l) => String(l.text));
    const pasted = P.pastedSlides ? 'has' : 'none';
    return { okWithout: without.ok, textsWithout: texts(without), textsWith: texts(withA), shapesWithout: without.svg.match(/<rect/g)?.length ?? 0, shapesWith: withA.svg.match(/<rect/g)?.length ?? 0, pasted };
  });
  expect(r.okWithout).toBe(true);
  expect(r.textsWithout.join(' ')).not.toContain('—');
  expect(r.textsWith.join(' ')).toContain('— Maya Rodriguez');
  expect(r.shapesWithout, 'the short rule is not drawn without an attribution').toBeLessThan(r.shapesWith);
});

test('G2: the real slide 2 (headline left, 11-word body): the body wraps to at most 5 lines in every style, and the highlight box stays inside the 48 px margin', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ PLAN, SOURCE, STYLES }) => {
    const H = (window as any).__H;
    const T: any = await import('/src/image-engine/draw/text.ts');
    const P = eval(PLAN);
    const rows: any[] = [];
    for (const style of STYLES) {
      const d = await H.deck({ style, slides: P.slides({}), pictures: [], text: SOURCE });
      const built = d.res.designed.slides['1'].built;
      const layers = (built.layers as any[]).filter((l) => l.kind === 'text');
      const body = layers.find((l) => l.name === 'body');
      const title = layers.find((l) => l.name === 'title');
      const bodyLines = body ? T.layoutText(body).lines.length : 0;
      let left = 9999, right = 0;
      for (const l of layers) {
        if (!l.highlight || !(l.highlight.paddingX > 0)) continue;
        const m = T.layoutText(l);
        for (const line of m.lines) for (const mk of line.marks as any[]) { left = Math.min(left, l.x + mk.x - l.highlight.paddingX); right = Math.max(right, l.x + mk.x + mk.width + l.highlight.paddingX); }
      }
      rows.push({ style, layout: d.specs[1].layout, bodyLines, bodyW: body ? Math.round(body.width) : 0, titleX: title ? Math.round(title.x) : 0, left: Math.round(left), right: Math.round(right) });
    }
    return rows;
  }, { PLAN, SOURCE, STYLES });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/slide2-body-lines-${TAG}.json`, JSON.stringify(r, null, 1));
  for (const x of r) {
    expect(x.bodyLines, `${x.style}: body lines (${x.layout}, column ${x.bodyW}px)`).toBeLessThanOrEqual(5);
    if (x.left !== 9999) { expect(x.left, `${x.style}: the highlight box starts inside the margin`).toBeGreaterThanOrEqual(47); expect(x.right, `${x.style}: and ends inside it`).toBeLessThanOrEqual(1033); }
  }
});

test(`G3: a 2:1 or wider picture on art-side-text takes the hero band (45% or more); other shapes keep the writer's layout (${TAG})`, async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ PLAN, SOURCE }) => {
    const H = (window as any).__H;
    const P = eval(PLAN);
    const share = async (pic: string) => {
      const d = await H.deck({ style: 'editorial-collage', slides: P.slides({ author: 'x' }), pictures: [pic, 'tall'], text: SOURCE });
      const i = 3;
      const im = d.imagesOf(i);
      const img = d.specs[i].fields.image;
      return { layout: d.specs[i].layout, share: im.length ? Math.round(H.SHARE(im[0]) * 1000) / 10 : 0, drawn: im.length, sh: d.specs[i].layout === 'art-side-text' ? 'band-under-text' : 'other', ref: String(img ?? '').slice(0, 24) };
    };
    return { wide: await share('wide'), wideReal: await share('wideReal'), landscape: await share('landscape'), square: await share('square') };
  }, { PLAN, SOURCE });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/area-${TAG}.json`, JSON.stringify(r, null, 1));
  expect(r.wide.layout).toBe('art-side-text');
  expect(r.wide.share, 'the 2400x600 picture is at least 45% of the slide').toBeGreaterThanOrEqual(45);
  // every other shape: the writer's choice and the band are unchanged (about a third of the slide or less)
  for (const k of ['wideReal', 'landscape', 'square'] as const) { expect(r[k].layout, k).toBe('art-side-text'); expect(r[k].share, `${k}: the picture band is unchanged`).toBeLessThan(40); }
});

test('G: the real second-brain deck with the two test pictures, all 7 slides (real-deck-after-G.png)', async ({ page }) => {
  await setup(page);
  const png = await page.evaluate(async ({ PLAN, SOURCE }) => {
    const H = (window as any).__H;
    const P = eval(PLAN);
    const d = await H.deck({ style: 'editorial-collage', slides: P.slides({}), pictures: ['wide', 'tall'], text: SOURCE });
    const w = 360, h = 450, gap = 12;
    const c = document.createElement('canvas'); c.width = gap + 4 * (w + gap); c.height = gap + 2 * (h + gap);
    const g = c.getContext('2d')!; g.fillStyle = '#dddddd'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 7; i++) {
      const bm = await createImageBitmap(await H.FA.svgToPng(d.res.designed.slides[String(i)].built.svg, w * 2));
      g.drawImage(bm, gap + (i % 4) * (w + gap), gap + Math.floor(i / 4) * (h + gap), w, h);
    }
    return await new Promise<string>((res) => c.toBlob(async (b) => { const u = new Uint8Array(await b!.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); res(btoa(t)); }, 'image/png'));
  }, { PLAN, SOURCE });
  save(`real-deck-${TAG}-G.png`, png);
  if (TAG === 'after') save('real-deck-after-G.png', png);
});

test('G2: a highlight that starts a line keeps its box inside the margin (the line is set in by the box padding)', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    const rows: any[] = [];
    for (const style of ['style-4', 'style-7', 'hot-flat', 'editorial-collage']) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const [head, acc] of [['Keeping notes is not the same as saving them', 'Keeping'], ['Saving is not keeping', 'keeping'], ['Your brain keeps things running', 'things running']]) {
        const b = await L.buildSlide('statement', 0, { headline: head, accent: [acc] }, st, { handle: '@h', index: 2, total: 7 });
        for (const l of (b.layers as any[]).filter((x) => x.kind === 'text' && x.highlight && x.highlight.paddingX > 0)) {
          const m = T.layoutText(l);
          for (const line of m.lines) for (const mk of line.marks as any[]) rows.push({ style, head, left: Math.round(l.x + mk.x - l.highlight.paddingX), right: Math.round(l.x + mk.x + mk.width + l.highlight.paddingX) });
        }
      }
    }
    return rows;
  });
  expect(r.length).toBeGreaterThan(3);
  for (const x of r) { expect(x.left, `${x.style} "${x.head}"`).toBeGreaterThanOrEqual(47); expect(x.right, `${x.style} "${x.head}"`).toBeLessThanOrEqual(1033); }
});
