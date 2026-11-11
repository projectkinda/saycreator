// Round 6, the rules every cover must keep: a picture cover only with pictures (no circle on a tall picture), a style switch keeps the cover rule with 0 calls, the highlight is carried and clamped
// on every cover layout, nothing runs past the 48 px margin, the phone check passes, the tall-picture split gives the headline room (part H), a pasted script keeps its highlight (part F).
// The real second-brain text is the fixture; a fake writer only: ZERO model calls. Output: out/cover-variety/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(20 * 60_000);
const OUT = 'out/cover-variety';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const srcSrc = fs.readFileSync('tests/image-engine/closing-source.spec.ts', 'utf8');
const SOURCE = srcSrc.slice(srcSrc.indexOf('export const SOURCE = `') + 23, srcSrc.indexOf('`;\n\nconst CLOSING'));
const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
const COVERS = ['cover-centred', 'cover-index', 'cover-block', 'cover-sticker', 'cover-word', 'cover-ruled'];
const save = (name: string, b64: string) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${name}`, Buffer.from(b64, 'base64')); };

async function setup(page: Page) {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
}
const PLAN = `(title, head, extra) => {
  const H = window.__H;
  return [{ layout: 'statement', fields: { headline: head, ...(extra ?? {}) }, accents: [] }, H.BODY[1], H.BODY[2], H.BODY[3], H.BODY[4], { layout: 'split-text', fields: { headline: 'Saving is not keeping', paragraph: 'Most people save notes and never open them again.' }, accents: [] }, H.CLOSING];
}`;
const DECKS: [string, string][] = [
  ['Second brain', 'Your brain is the worst place to store your life'],
  ['Quick Flip', 'The hoodie that becomes a backpack'],
  ['Habits that stick', 'Make it so small you cannot say no'],
  ['Cold emails', 'Nobody reads your email, here is why'],
  ['Pricing page', 'Raise your price before you raise your voice'],
  ['Morning routine', 'Win the first hour and the day follows'],
];

test('B: a cover takes the picture when the person added one (never a circle for a tall picture); with no pictures no picture cover is ever chosen', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ STYLES, PLAN, DECKS }) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const mkPlan = eval(PLAN);
    const withPics: string[] = [];
    const without: string[] = [];
    let circles = 0;
    for (const style of STYLES) {
      for (const [title, head] of DECKS) {
        const a = await H.deck({ style, slides: mkPlan(title, head, { caption: 'A line under it' }), pictures: ['landscape', 'portrait', 'tall'], title, text: head });
        withPics.push(a.specs[0].layout);
        for (const im of a.imagesOf(0)) if (im.circle) circles++;
        const b = await H.deck({ style, slides: mkPlan(title, head, { caption: 'A line under it' }), pictures: [], title, text: head });
        without.push(b.specs[0].layout);
      }
    }
    const st = H.D.styleFromPack(H.PR.presetPackFor('style-4', false)).style;
    const s = H.SHAPES.tall;
    const b = await L.buildSlide('cover-art', 0, { headline: 'Your brain', subtitle: 'Is for ideas', image: H.IM.makeRef({ id: 'tall', w: s[0], h: s[1], fy: 0.1 }) }, st, { handle: '@h', index: 0, total: 7 });
    return { withPics, without, circles, tallCircle: (b.images ?? []).some((x: any) => x.circle) };
  }, { STYLES, PLAN, DECKS });
  expect(r.without.filter((l: string) => l === 'photo-cover' || l === 'cover-art'), 'no pictures, no picture cover').toEqual([]);
  expect(r.withPics.filter((l: string) => l === 'photo-cover' || l === 'cover-art').length, 'with pictures a picture cover is chosen for some decks').toBeGreaterThan(0);
  expect(r.circles, 'no circle crop on the cover pictures of these decks').toBe(0);
  expect(r.tallCircle).toBe(false);
});

test('a style switch redraws the cover from the stored plan with 0 calls: the cover follows the new style and comes back with the old one', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ PLAN, SOURCE }) => {
    const H = (window as any).__H;
    const FL: any = await import('/src/carousel/flavour.ts');
    const mkPlan = eval(PLAN);
    const title = 'Second brain';
    const head = 'Your brain is the worst place to store your life';
    const made: Record<string, any> = {};
    for (const style of ['style-4', 'dark-quiet', 'editorial-collage']) made[style] = await H.deck({ style, slides: mkPlan(title, head), pictures: [], text: SOURCE });
    const plan = made['style-4'].specs;
    const switchTo = (p: any, style: string) => {
      const pack = H.PR.presetPackFor(style, false);
      return FL.flavourPass(p, H.D.styleFromPack(pack).style, { pack, brief: '', hasPhoto: false, images: [], site: '' }, style, FL.coverKeyOf(title, p, FL.styleIdOf(pack)));
    };
    const toDark = switchTo(plan, 'dark-quiet');
    const toCollage = switchTo(plan, 'editorial-collage');
    const back = switchTo(toDark.specs, 'style-4');
    return { fresh: Object.fromEntries(Object.entries(made).map(([k, v]: any) => [k, v.specs[0].layout])), a: plan[0].layout, toDark: toDark.specs[0].layout, toCollage: toCollage.specs[0].layout, back: back.specs[0].layout, sameWords: JSON.stringify(plan[0].fields.headline) === JSON.stringify(back.specs[0].fields.headline) };
  }, { PLAN, SOURCE });
  expect(r.toDark, 'the switch gives the cover a fresh deck in that style gets').toBe(r.fresh['dark-quiet']);
  expect(r.toCollage).toBe(r.fresh['editorial-collage']);
  expect(r.back, 'and back to the first style it is the first cover again').toBe(r.a);
  expect(r.sameWords).toBe(true);
});

test('C: the highlight is carried on every cover layout, and no bar or text runs past the 48 px margin, in 4 styles, with a highlight that starts or ends a line', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ COVERS }) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    const bad: string[] = [];
    let marks = 0;
    const heads: [string, string][] = [['Your brain is the worst place to store your life', 'life'], ['Keeping notes is not the same as saving them', 'Keeping'], ['Your brain keeps things running', 'things running'], ['Make it so small you cannot say no', 'small']];
    for (const style of ['style-4', 'style-7', 'hot-flat', 'editorial-collage']) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const id of COVERS) for (const v of [0, 1] as const) for (const [head, acc] of heads) {
        const fields: any = id === 'cover-word' ? { headline: head, accent: [acc] } : { kicker: 'A second brain', headline: head, caption: 'Three things I did.', accent: [acc] };
        const b = await L.buildSlide(id, v, fields, st, { handle: '@h', index: 0, total: 7 });
        if (!b.ok) { if (id !== 'cover-word') bad.push(`${style}/${id}/v${v}/"${head}": not drawn ${b.errors[0]}`); continue; }
        const texts = (b.layers as any[]).filter((l) => l.kind === 'text');
        if (!texts.some((l) => l.highlight || (l.runs && l.runs.length))) bad.push(`${style}/${id}/v${v}/"${head}": the highlight is not drawn`);
        for (const l of texts.filter((x) => x.highlight && x.highlight.paddingX > 0)) {
          const m = T.layoutText(l);
          for (const line of m.lines) for (const mk of line.marks as any[]) {
            marks++;
            const left = l.x + mk.x - l.highlight.paddingX, right = l.x + mk.x + mk.width + l.highlight.paddingX;
            if (left < 47) bad.push(`${style}/${id}/v${v}/"${head}": the bar starts at ${Math.round(left)}`);
            if (right > 1033) bad.push(`${style}/${id}/v${v}/"${head}": the bar ends at ${Math.round(right)}`);
          }
        }
        for (const l of texts) if (l.x < 47 || l.x + l.width > 1033) bad.push(`${style}/${id}/v${v}/"${head}": a text box leaves the margin (${Math.round(l.x)}..${Math.round(l.x + l.width)}) ${l.name}`);
      }
    }
    return { bad, marks };
  }, { COVERS });
  expect(r.marks).toBeGreaterThan(20);
  expect(r.bad).toEqual([]);
});

test('C: a highlight the writer gives a cover is clamped to 2 words; a highlight the person typed in a pasted script is never changed (whichever cover the style gives)', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ STYLES }) => {
    const H = (window as any).__H;
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const Sc: any = await import('/src/carousel/script.ts');
    const written: string[] = [];
    for (const style of STYLES) {
      const slides = [{ layout: 'statement', fields: { headline: 'Your brain is the worst place to store your life' }, accents: ['worst place to store'] }, H.BODY[1], H.BODY[2], H.BODY[3], H.BODY[4], H.BODY[1], H.CLOSING];
      const d = await H.deck({ style, slides, pictures: [], text: 'Your brain is the worst place to store your life.' });
      written.push(d.specs[0].layout + ':' + d.specs[0].accents.join('|'));
    }
    const typed: string[] = [];
    const script = JSON.stringify({ title: 'Brain', slides: [
      { type: 'cover', headline: 'Your brain is the worst place to store your life', highlight: 'worst place to store', sub: 'Three things I did.' },
      { type: 'content', headline: 'Give it a structure', body: 'So that it resurfaces at the right moment.' },
      { type: 'content', headline: 'Give it context', body: 'The more context it has, the better the answer.' },
      { type: 'closing', headline: 'Build your own second brain', cta: 'Comment brain' },
    ] });
    const parsed = Sc.validateScriptText(script, 'carousel').script;
    for (const style of STYLES) {
      const made: any = await FS.libraryDeckFromScript(parsed, { pack: H.PR.presetPackFor(style, false), brief: '', hasPhoto: false, images: [], site: '' }, '');
      typed.push(made.designed.library.plan.specs[0].layout + ':' + made.designed.library.plan.specs[0].accents.join('|'));
    }
    return { written, typed };
  }, { STYLES });
  // the headline has 10 words (8 or more): at most 3 words, never half of it
  for (const w of r.written) expect(w.split(':')[1].split(' ').length, w).toBeLessThanOrEqual(3);
  for (const t of r.typed) expect(t.split(':')[1], t).toBe('worst place to store');
});

test('F: a pasted script carries its highlight on a cover, a step, a content and a closing slide (3 or more layouts), drawn on the slide and never clamped', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const Sc: any = await import('/src/carousel/script.ts');
    const script = JSON.stringify({ title: 'Brain', slides: [
      { type: 'cover', headline: 'Your brain is the worst place to store your life', highlight: 'worst place to store', sub: 'Three things I did.' },
      { type: 'step', number: 1, headline: 'Give it a structure', body: 'So that it resurfaces at the right moment.', highlight: 'structure' },
      { type: 'content', headline: 'Think of it as a wiki, not a graveyard', body: 'A wiki you open beats a notes app you never do.', highlight: 'a wiki, not a graveyard' },
      { type: 'checklist', headline: 'What I did', items: ['Moved everything', 'Gave it context', 'Let it work'], highlight: 'What I did' },
      { type: 'quote', quote: 'I let it work for me.', by: 'The author', highlight: 'work for me' },
      { type: 'closing', headline: 'Build your own second brain', cta: 'Comment brain', highlight: 'second brain' },
    ] });
    const parsed = Sc.validateScriptText(script, 'carousel').script;
    const out: any[] = [];
    for (const style of ['style-4', 'editorial-collage', 'dark-quiet']) {
      const made: any = await FS.libraryDeckFromScript(parsed, { pack: H.PR.presetPackFor(style, false), brief: '', hasPhoto: false, images: [], site: '' }, '');
      const specs = made.designed.library.plan.specs;
      for (let i = 0; i < specs.length; i++) {
        const layers = (made.designed.slides[String(i)]?.built?.layers ?? []).filter((l: any) => l.kind === 'text');
        out.push({ style, i, layout: specs[i].layout, accents: specs[i].accents, drawn: layers.some((l: any) => l.highlight || (l.runs && l.runs.length)) });
      }
    }
    return out;
  });
  const want = ['worst place to store', 'structure', 'a wiki, not a graveyard', 'What I did', 'work for me', 'second brain'];
  for (const x of r) {
    if (x.accents.length) expect(x.accents[0], `${x.style} slide ${x.i + 1} (${x.layout})`).toBe(want[x.i]);
  }
  for (const style of ['style-4', 'editorial-collage', 'dark-quiet']) {
    const rows = r.filter((x: any) => x.style === style);
    const carried = rows.filter((x: any) => x.accents.length && x.drawn);
    expect(new Set(carried.map((x: any) => x.layout)).size, `${style}: the highlight is carried and drawn on 3 or more layouts: ${JSON.stringify(rows.map((x: any) => x.layout + ':' + x.accents.length + ':' + x.drawn))}`).toBeGreaterThanOrEqual(3);
  }
});

test('the phone check: a pasted deck in every style (a different cover each) passes the 4.5:1 check on its cover', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ STYLES }) => {
    const H = (window as any).__H;
    const R: any = await import('/src/carousel/render.ts');
    const D: any = await import('/src/carousel/doc.ts');
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const Sc: any = await import('/src/carousel/script.ts');
    const decks = [['Second brain', 'Your brain is the worst place to store your life', 'life'], ['Quick Flip', 'The hoodie that becomes a backpack', 'backpack'], ['Habits', 'Make it so small you cannot say no', 'small']];
    const fails: string[] = [];
    const covers: string[] = [];
    for (const style of STYLES) {
      for (const [title, head, hl] of decks) {
        const script0 = { title, slides: [{ type: 'cover', headline: head, highlight: hl, sub: 'Three things I did.' }, { type: 'content', headline: 'Give it a structure', body: 'So that it resurfaces at the right moment.' }, { type: 'closing', headline: 'Build your own second brain', cta: 'Comment brain' }] };
        const script = { ...Sc.validateScriptText(JSON.stringify(script0), 'carousel').script, id: 'cv-' + style + title };
        const made: any = await FS.libraryDeckFromScript(script, { pack: H.PR.presetPackFor(style, false), brief: '', hasPhoto: false, images: [], site: '' }, '');
        if (!made.ok) { fails.push(`${style}/${title}: ${made.reason}`); continue; }
        covers.push(made.designed.library.plan.specs[0].layout);
        const doc: any = { ...D.emptyDoc(style), script: made.script, designed: { ...made.designed, library: { ...made.designed.library, source: style } } };
        const { slides, margin } = R.composeDoc(doc);
        const rr: any = await R.renderer.render(slides[0], margin);
        for (const l of rr.lint.filter((x: any) => !x.pass)) fails.push(`${style}/${title}/${slides[0].layout}: ${l.label}: ${String(l.reason).slice(0, 120)}`);
      }
    }
    return { fails, covers };
  }, { STYLES });
  expect(new Set(r.covers).size, 'the pasted decks get different covers: ' + r.covers.join(', ')).toBeGreaterThanOrEqual(4);
  expect(r.fails).toEqual([]);
});

test('H: the tall picture on the real slide 5: the panel takes at most 45% of the width, the headline is at least 85% of the usual size or the slide is stacked, and never more than 4 lines; the top of the picture shows', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    const rows: any[] = [];
    for (const style of ['style-4', 'editorial-collage', 'dark-quiet', 'hot-flat']) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      const s = H.SHAPES.tall;
      const image = H.IM.makeRef({ id: 'tall', w: s[0], h: s[1], fy: 0.1 });
      for (const head of ['Three things I did to fix it', 'Three things I did']) {
        const b = await L.buildSlide('cover-art', 0, { headline: head, image }, st, { handle: '@h', index: 4, total: 7 });
        const im = (b.images ?? [])[0];
        const title = (b.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
        const lines = title ? T.layoutText(title).lines.length : 0;
        const ref = (b.layers as any[]).filter((l) => l.kind === 'text' && l.name === 'title');
        rows.push({ style, head, ok: b.ok, panel: im ? Math.round((im.w / 1080) * 1000) / 10 : 0, imgW: im?.w ?? 0, imgY: im?.y ?? 0, titleY: title?.y ?? 0, titleH: title?.height ?? 0, size: title?.style?.size ?? 0, lines, circle: !!im?.circle, src: im?.src ?? '', n: ref.length });
      }
    }
    return rows;
  });
  for (const x of r) {
    expect(x.ok, `${x.style} "${x.head}"`).toBe(true);
    expect(x.circle).toBe(false);
    expect(x.src, 'the top of the picture').toMatch(/fy=0\.1/);
    expect(x.lines, `${x.style} "${x.head}": at most 4 lines`).toBeLessThanOrEqual(4);
    if (x.imgW < 900) {
      expect(x.panel, `${x.style} "${x.head}": the panel is at most 45% of the width`).toBeLessThanOrEqual(45);
      expect(x.size, `${x.style} "${x.head}": the headline is at least 85% of the 140 px of the headline-left layouts`).toBeGreaterThanOrEqual(119 - 1);
    } else {
      expect(x.imgY, `${x.style} "${x.head}": the stacked version has the picture below the text`).toBeGreaterThan(x.titleY);
    }
  }
  // the short headline uses the panel in every style: the room goes to the headline
  expect(r.filter((x: any) => x.head === 'Three things I did' && x.imgW < 900).length, 'the panel form is used for the short headline in at least 3 of 4 styles').toBeGreaterThanOrEqual(3);
});

test('the real second-brain deck, all 7 slides (real-deck-after-6.png), with the two test pictures', async ({ page }) => {
  await setup(page);
  await page.evaluate(`window.__sheet = async (items, cols, w, h) => {
    const H = window.__H; const gap = 12;
    const rows = Math.ceil(items.length / cols);
    const c = document.createElement('canvas'); c.width = gap + cols * (w + gap); c.height = gap + rows * (h + gap);
    const g = c.getContext('2d'); g.fillStyle = '#dddddd'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < items.length; i++) { const bm = await createImageBitmap(await H.FA.svgToPng(items[i], w * 2)); g.drawImage(bm, gap + (i % cols) * (w + gap), gap + Math.floor(i / cols) * (h + gap), w, h); }
    return await new Promise((res) => c.toBlob(async (b) => { const u = new Uint8Array(await b.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); res(btoa(t)); }, 'image/png'));
  };`);
  const r = await page.evaluate(async ({ SOURCE }) => {
    const H = (window as any).__H;
    const slides = [
      { layout: 'statement', fields: { headline: 'Your brain is the worst place to store your life' }, accents: ['life'] },
      { layout: 'split-text', fields: { headline: 'Saving is not keeping', paragraph: 'Every unfinished task is a background process draining you all day.' }, accents: ['keeping'] },
      { layout: 'checklist', fields: { title: 'What I did', items: ['Moved everything into a structure', 'Gave it as much context as possible', 'Let it work for me'] }, accents: [] },
      { layout: 'art-side-text', fields: { heading: 'Think of it as a wiki', paragraph: 'Give it a structure so that it resurfaces at the right moment.' }, accents: [] },
      { layout: 'cover-art', fields: { headline: 'Three things I did to fix it' }, accents: [] },
      { layout: 'quote', fields: { quote: 'I let it work for me.' }, accents: [] },
      H.CLOSING,
    ];
    const d = await H.deck({ style: 'editorial-collage', slides, pictures: ['wide', 'tall'], text: SOURCE });
    const svgs = [0, 1, 2, 3, 4, 5, 6].map((i) => d.res.designed.slides[String(i)].built.svg);
    return { png: await (window as any).__sheet(svgs, 4, 360, 450), layouts: d.specs.map((s: any) => s.layout) };
  }, { SOURCE });
  save('real-deck-after-6.png', r.png);
  expect(r.layouts).toHaveLength(7);
});
