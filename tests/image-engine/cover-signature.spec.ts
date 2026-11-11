// Round 6b: signature covers (each style's most characteristic cover: the style cards, the previews and the Pick-for-me picture use it; real decks still pick from the allowed list by the stable hash),
// "01" only in mono-poster, no orphan line above the word cover, and the highlight visible on every cover in all 15 styles (a gradient headline gets a bar).
// The real second-brain text is the fixture; a fake writer only: ZERO model calls. Output: out/cover-variety-2/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(20 * 60_000);
const OUT = 'out/cover-variety-2';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const srcSrc = fs.readFileSync('tests/image-engine/closing-source.spec.ts', 'utf8');
const SOURCE = srcSrc.slice(srcSrc.indexOf('export const SOURCE = `') + 23, srcSrc.indexOf('`;\n\nconst CLOSING'));
const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
const save = (name: string, b64: string) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${name}`, Buffer.from(b64, 'base64')); };

async function setup(page: Page) {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  await page.evaluate(`window.__sheet = async (items, cols, w, h) => {
    const H = window.__H; const gap = 10, lab = 26;
    const rows = Math.ceil(items.length / cols);
    const c = document.createElement('canvas'); c.width = gap + cols * (w + gap); c.height = gap + rows * (h + lab + gap);
    const g = c.getContext('2d'); g.fillStyle = '#dddddd'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < items.length; i++) {
      const x = gap + (i % cols) * (w + gap), y = gap + Math.floor(i / cols) * (h + lab + gap);
      g.fillStyle = '#111'; g.font = 'bold 15px sans-serif'; g.fillText(items[i].label, x, y + 18);
      if (items[i].svg) { const bm = await createImageBitmap(await H.FA.svgToPng(items[i].svg, w * 2)); g.drawImage(bm, x, y + lab, w, h); }
    }
    return await new Promise((res) => c.toBlob(async (b) => { const u = new Uint8Array(await b.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); res(btoa(t)); }, 'image/png'));
  };`);
}
const PLAN = `(title, head, extra) => {
  const H = window.__H;
  return [{ layout: 'statement', fields: { headline: head, ...(extra ?? {}) }, accents: [] }, H.BODY[1], H.BODY[2], H.BODY[3], H.BODY[4], { layout: 'split-text', fields: { headline: 'Saving is not keeping', paragraph: 'Most people save notes and never open them again.' }, accents: [] }, H.CLOSING];
}`;
const HEADS = ['Your brain is the worst place to store your life', 'Nobody reads your email, here is why', 'Make it so small you cannot say no', 'The hoodie that becomes a backpack'];

test('1: the signature covers: every style allows 4 or more covers, "cover-index" only in mono-poster, the 15 signatures are at least 9 different forms and none is on more than 2 cards', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async (STYLES) => {
    const H = (window as any).__H;
    return STYLES.map((s: string) => { const c = H.PR.presetPackFor(s, false).look.coverLayouts; return { style: s, allowed: c?.layouts ?? [], signature: c?.signature ?? null }; });
  }, STYLES);
  const count: Record<string, number> = {};
  for (const x of r) {
    expect(x.allowed.length, `${x.style} allows 4 or more covers`).toBeGreaterThanOrEqual(4);
    expect(x.allowed, `${x.style}: the signature is one of the allowed covers`).toContain(x.signature);
    if (x.style !== 'mono-poster') expect(x.allowed, `${x.style}: no "01" cover`).not.toContain('cover-index');
    count[x.signature] = (count[x.signature] ?? 0) + 1;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/signature-table.md`, ['| style | signature | allowed |', '|---|---|---|', ...r.map((x: any) => `| ${x.style} | ${x.signature} | ${x.allowed.join(', ')} |`)].join('\n'));
  expect(Object.keys(count).length, 'at least 9 different signature forms: ' + JSON.stringify(count)).toBeGreaterThanOrEqual(9);
  expect(Math.max(...Object.values(count)), 'no form on more than 2 cards: ' + JSON.stringify(count)).toBeLessThanOrEqual(2);
});

test('1: a sample deck (card, preview, Pick-for-me picture) draws the signature cover; a real deck picks from the allowed list; the same deck twice gives the same cover', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ STYLES, PLAN, SOURCE }) => {
    const H = (window as any).__H;
    const SP: any = await import('/src/carousel/stylePreview.ts');
    const PS: any = await import('/src/carousel/presets.ts');
    const mkPlan = eval(PLAN);
    const rows: any[] = [];
    for (const style of STYLES) {
      const sig = H.PR.presetPackFor(style, false).look.coverLayouts.signature;
      const prev = await SP.previewDeck(style);
      const thumb = await PS.presetThumbSvg(style);
      const a = await H.deck({ style, slides: mkPlan('Second brain', 'Your brain is the worst place to store your life'), pictures: [], text: SOURCE });
      const b = await H.deck({ style, slides: mkPlan('Second brain', 'Your brain is the worst place to store your life'), pictures: [], text: SOURCE });
      rows.push({ style, sig, previewCover: prev[0]?.layout, thumb: !!thumb, real: a.specs[0].layout, again: b.specs[0].layout, allowed: H.PR.presetPackFor(style, false).look.coverLayouts.layouts });
    }
    return rows;
  }, { STYLES, PLAN, SOURCE });
  for (const x of r) {
    expect(x.previewCover, `${x.style}: the Preview deck's cover is the signature`).toBe(x.sig);
    expect(x.thumb).toBe(true);
    expect(x.allowed, `${x.style}: a real deck's cover is allowed`).toContain(x.real);
    expect(x.again, `${x.style}: the same deck, the same cover`).toBe(x.real);
  }
});

test('1: 6 decks in one style still give at least 2 different covers, in 4 styles', async ({ page }) => {
  await setup(page);
  const DECKS: [string, string][] = [['Second brain', 'Your brain is the worst place to store your life'], ['Quick Flip', 'The hoodie that becomes a backpack'], ['Habits that stick', 'Make it so small you cannot say no'], ['Cold emails', 'Nobody reads your email, here is why'], ['Pricing page', 'Raise your price before you raise your voice'], ['Morning routine', 'Win the first hour and the day follows']];
  const r = await page.evaluate(async ({ PLAN, DECKS }) => {
    const H = (window as any).__H;
    const mkPlan = eval(PLAN);
    const out: Record<string, string[]> = {};
    for (const style of ['editorial-collage', 'style-4', 'dark-quiet', 'object-neon']) {
      out[style] = [];
      for (const [title, head] of DECKS) { const d = await H.deck({ style, slides: mkPlan(title, head), pictures: [], title, text: head }); out[style].push(d.specs[0].layout); }
    }
    return out;
  }, { PLAN, DECKS });
  for (const [style, covers] of Object.entries(r)) expect(new Set(covers).size, `${style}: ${covers.join(', ')}`).toBeGreaterThanOrEqual(2);
});

test('1: no number is drawn that the person did not write: the only digits on a cover are the page counter and the page number "01" of cover-index (mono-poster only)', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async (STYLES) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const covers = ['statement', 'statement-stacked', 'statement-card', 'statement-pill', 'lead-statement', 'cover-centred', 'cover-index', 'cover-block', 'cover-sticker', 'cover-word', 'cover-ruled'];
    const bad: string[] = [];
    for (const style of STYLES) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const id of covers) {
        const fields: any = id === 'statement-pill' ? { kicker: 'A second brain', headline: 'Your brain is the worst place to store your life', caption: 'Three things I did.' } : id === 'lead-statement' ? { lead: 'It started small', headline: 'Your brain is the worst place to store your life' } : { headline: 'Your brain is the worst place to store your life', ...(id === 'cover-word' ? {} : { kicker: 'A second brain', caption: 'Three things I did.' }) };
        const b = await L.buildSlide(id, 0, fields, st, { handle: '@h', index: 0, total: 7 });
        if (!b.ok) continue;
        for (const l of (b.layers as any[]).filter((x) => x.kind === 'text' && !String(x.name).startsWith('recurring'))) if (/\d/.test(String(l.text)) && !(id === 'cover-index' && style === 'mono-poster' && l.text === '01')) bad.push(`${style}/${id}: "${l.text}"`);
      }
    }
    return bad;
  }, STYLES);
  // (cover-index is drawn here in every style to check the digit rule; the style lists decide where it is ever chosen)
  expect(r.filter((x: string) => !/\/cover-index: "01"$/.test(x))).toEqual([]);
});

test('2: the word cover never leaves an orphan line above the big word (4 headlines); a headline it cannot show gets another allowed cover; the sheet word-cover-orphans.png', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ HEADS }) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    const C: any = await import('/src/carousel/layouts/covers.ts');
    const items: any[] = [];
    const rows: any[] = [];
    const st = H.D.styleFromPack(H.PR.presetPackFor('hot-flat', false)).style;
    for (const head of HEADS) {
      const fits = C.wordCoverFits(st, head);
      const b = fits ? await L.buildSlide('cover-word', 0, { headline: head }, st, { handle: '@h', index: 0, total: 7 }) : null;
      let orphan = false, lines: string[] = [];
      if (b) {
        const body = (b.layers as any[]).find((l) => l.kind === 'text' && l.name === 'body');
        if (body) {
          lines = T.layoutText(body).lines.map((x: any) => x.text);
          const w = lines.map((t) => T.measureWidth(t, body.style.font, body.style.weight, body.style.size));
          const last = lines[lines.length - 1];
          orphan = lines.length > 1 && (last.trim().split(/\s+/).length < 2 || w[w.length - 1] < 0.4 * Math.max(...w));
        }
        items.push({ label: 'word: ' + head.slice(0, 30), svg: b.svg });
      } else {
        // the fallback: the style's other allowed cover for this headline (a deck takes it)
        const slides = [{ layout: 'statement', fields: { headline: head }, accents: [] }, H.BODY[1], H.BODY[2], H.BODY[3], H.BODY[4], H.BODY[1], H.CLOSING];
        const d = await H.deck({ style: 'hot-flat', slides, pictures: [], title: 'x', text: head });
        rows.push({ head, fallback: d.specs[0].layout });
        items.push({ label: 'fallback ' + d.specs[0].layout + ': ' + head.slice(0, 20), svg: d.res.designed.slides['0'].built.svg });
      }
      rows.push({ head, fits, orphan, lines });
    }
    return { rows, png: await (window as any).__sheet(items, 4, 300, 375) };
  }, { HEADS });
  save('word-cover-orphans.png', r.png);
  for (const x of r.rows) if ('orphan' in x) expect(x.orphan, `${x.head}: ${JSON.stringify(x.lines)}`).toBe(false);
  for (const x of r.rows) if ('fallback' in x) expect(x.fallback, `${x.head}: not the word cover`).not.toBe('cover-word');
});

test('2: no cover of any style ends its headline on a single short word (3 letters or fewer) on a line of its own, for the 4 headlines', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ STYLES, HEADS }) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    const bad: string[] = [];
    for (const style of STYLES) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      const allowed = H.PR.presetPackFor(style, false).look.coverLayouts.layouts;
      for (const id of allowed) for (const head of HEADS) {
        const fields: any = id === 'lead-statement' ? { lead: 'A second brain', headline: head } : { headline: head };
        const b = await L.buildSlide(id, 0, fields, st, { handle: '@h', index: 0, total: 7 });
        if (!b.ok) continue;
        for (const l of (b.layers as any[]).filter((x) => x.kind === 'text' && x.name === 'title')) {
          const lines = T.layoutText(l).lines.map((q: any) => q.text.trim());
          if (id === 'cover-word') continue; // the title of the word cover is the one word
          const last = lines[lines.length - 1] ?? '';
          if (lines.length > 1 && !/\s/.test(last) && last.replace(/[^\p{L}\p{N}]/gu, '').length <= 3) bad.push(`${style}/${id}/"${head}": last line "${last}"`);
        }
      }
    }
    return bad;
  }, { STYLES, HEADS });
  expect(r).toEqual([]);
});

test('3: the highlight is visible on every cover in all 15 styles: a bar, or a solid accent colour, italic or underline that sets it apart; a gradient headline gets a bar; the phone check still passes', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ STYLES }) => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const bad: string[] = [];
    let n = 0;
    const head = 'Your brain is the worst place to store your life';
    for (const style of STYLES) {
      const pack = H.PR.presetPackFor(style, false);
      const st = H.D.styleFromPack(pack).style;
      for (const id of pack.look.coverLayouts.layouts) {
        const hh = id === 'statement-stacked' ? 'Your brain, your life' : head; // (the stacked cover takes 2 to 4 words)
        const fields: any = id === 'lead-statement' ? { lead: 'A second brain', headline: hh, accent: ['life'] } : id === 'cover-word' ? { headline: hh, accent: ['life'] } : { headline: hh, ...(id === 'statement-pill' || id === 'statement-stacked' ? {} : { kicker: 'A second brain' }), caption: 'Three things I did.', accent: ['life'] };
        const b = await L.buildSlide(id, 0, fields, st, { handle: '@h', index: 0, total: 7 });
        if (!b.ok) { bad.push(`${style}/${id}: not drawn ${b.errors[0]}`); continue; }
        n++;
        const titles = (b.layers as any[]).filter((l) => l.kind === 'text' && l.name === 'title');
        const bar = titles.some((l) => l.highlight);
        const base = (l: any) => String(l.style?.color ?? '').toLowerCase();
        const coloured = titles.some((l) => (l.runs ?? []).some((q: any) => String(q.color ?? '').toLowerCase() !== base(l)));
        // the svg: a bar (a rect right before the headline), an italic or an underline drawn by a device
        const svgMark = /<rect [^>]*rx="[\d.]+"[^>]*\/><text data-role="title"/.test(b.svg) || /font-family="(?:Instrument Serif Italic|EB Garamond Italic)"/.test(b.svg) || /data-ring-art|data-underline|pen-underline|pen-circle/.test(b.svg);
        const gradient = /id="htext"/.test(b.svg);
        if (gradient && !(bar || /<rect [^>]*rx="[\d.]+"[^>]*\/><text data-role="title"/.test(b.svg))) bad.push(`${style}/${id}: a gradient headline with no bar behind the highlight`);
        else if (!(bar || coloured || svgMark)) bad.push(`${style}/${id}: the highlight "life" is not set apart`);
      }
    }
    return { bad, n };
  }, { STYLES });
  expect(r.n).toBeGreaterThanOrEqual(55);
  expect(r.bad).toEqual([]);
});

test('3: the phone check on the highlighted covers of a pasted deck in every style (and a typed highlight stays whole)', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ STYLES }) => {
    const H = (window as any).__H;
    const R: any = await import('/src/carousel/render.ts');
    const D: any = await import('/src/carousel/doc.ts');
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const Sc: any = await import('/src/carousel/script.ts');
    const fails: string[] = [];
    const typed: string[] = [];
    for (const style of STYLES) {
      const script0 = { title: 'Brain', slides: [{ type: 'cover', headline: 'Your brain is the worst place to store your life', highlight: 'worst place to store', sub: 'Three things I did.' }, { type: 'content', headline: 'Give it a structure', body: 'So that it resurfaces at the right moment.' }, { type: 'closing', headline: 'Build your own second brain', cta: 'Comment brain' }] };
      const script = { ...Sc.validateScriptText(JSON.stringify(script0), 'carousel').script, id: 'sig-' + style };
      const made: any = await FS.libraryDeckFromScript(script, { pack: H.PR.presetPackFor(style, false), brief: '', hasPhoto: false, images: [], site: '' }, '');
      if (!made.ok) { fails.push(`${style}: ${made.reason}`); continue; }
      typed.push(made.designed.library.plan.specs[0].accents.join('|'));
      const doc: any = { ...D.emptyDoc(style), script: made.script, designed: { ...made.designed, library: { ...made.designed.library, source: style } } };
      const { slides, margin } = R.composeDoc(doc);
      const rr: any = await R.renderer.render(slides[0], margin);
      for (const l of rr.lint.filter((x: any) => !x.pass)) fails.push(`${style}/${slides[0].layout}: ${l.label}: ${String(l.reason).slice(0, 110)}`);
    }
    return { fails, typed };
  }, { STYLES });
  expect(r.fails).toEqual([]);
  for (const t of r.typed) expect(t).toBe('worst place to store');
});

test('outputs: the 15-style cover sheet (second-brain headline) and the real deck (cover-sheet-15-styles.png, real-deck-after-6b.png)', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ STYLES, PLAN, SOURCE }) => {
    const H = (window as any).__H;
    const mkPlan = eval(PLAN);
    const items: any[] = [];
    for (const style of STYLES) {
      const d = await H.deck({ style, slides: mkPlan('Second brain', 'Your brain is the worst place to store your life', undefined), pictures: [], text: SOURCE });
      items.push({ label: style + ': ' + d.specs[0].layout, svg: d.res.designed.slides['0'].built.svg });
    }
    const sheet = await (window as any).__sheet(items, 5, 270, 338);
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
    const svgs = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ label: '', svg: d.res.designed.slides[String(i)].built.svg }));
    return { sheet, deck: await (window as any).__sheet(svgs, 4, 360, 450), layouts: d.specs.map((s: any) => s.layout) };
  }, { STYLES, PLAN, SOURCE });
  save('cover-sheet-15-styles.png', r.sheet);
  save('real-deck-after-6b.png', r.deck);
  expect(r.layouts).toHaveLength(7);
});

test('outputs: the Style step with the 15 cards on a desktop (style-cards.png); the 15 cards draw 15 different pictures', async ({ page }) => {
  const { toStep } = await import('./ui');
  await page.setViewportSize({ width: 1280, height: 1100 });
  for (const url of ['**/__carousel/write', '**/api/carousel/write']) await page.route(url, (r) => r.fulfill({ json: { text: '{}', ms: 1 } }));
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await toStep(page, 3);
  const list = page.getByRole('list', { name: 'Styles' });
  await list.scrollIntoViewIfNeeded();
  for (let y = 0; y < 10; y++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(250); }
  await expect(list.getByText('Drawing…')).toHaveCount(0, { timeout: 60_000 });
  await expect(list.locator('.cr-style-small img')).toHaveCount(30, { timeout: 60_000 });
  fs.mkdirSync(OUT, { recursive: true });
  await list.screenshot({ path: `${OUT}/style-cards.png` });
  const covers = await list.locator('li:has(.cr-style-smalls)').evaluateAll((els) => els.map((e) => (e.querySelector('img') as HTMLImageElement | null)?.src ?? ''));
  expect(new Set(covers).size).toBe(15);
});
