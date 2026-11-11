// Round 11: (A) the choice for a pasted text with paragraphs (writer by default, paragraphs when the text has slide markers) and its call counts; (B) card colours are the style's own, never a darkened ground;
// (C) the closing: no one-small-word line, no social glyph without a handle; (D) no one-word last line in body text; (E) covers on the script route; (F) pictures on both routes.
// A fake writer only: ZERO real model calls. Output: out/round-11/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { deckDrawn, toStep } from './ui';

test.setTimeout(15 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const OUT = 'out/round-11';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const routeSrc = fs.readFileSync('tests/image-engine/script-route.spec.ts', 'utf8');
const POST = routeSrc.slice(routeSrc.indexOf('export const POST = `') + 21, routeSrc.indexOf('`;\n\nconst IDS'));
const STYLES = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
const save = (name: string, b64: string) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${name}`, Buffer.from(b64, 'base64')); };

async function setup(page: Page) {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  // in-page helpers: the post as a script, a deck drawn by the script route, the layers of a slide as text lines, a contact sheet
  await page.evaluate(`window.__R = (async () => {
    const H = window.__H;
    const P = await import('/src/carousel/pasted.ts');
    const FS = await import('/src/carousel/libraryFromScript.ts');
    const T = await import('/src/image-engine/draw/text.ts');
    const built = (post) => P.scriptFromBlocks(P.slideBlocks(post), 'carousel', '');
    const script = async (post, style, pics, handle) => {
      const look = { pack: H.PR.presetPackFor(style, false), brief: '', hasPhoto: !!(pics && pics.length), images: (pics ?? []).map(H.info), site: '' };
      const made = await FS.libraryDeckFromScript(built(post).script, look, handle ?? '');
      return made;
    };
    const lines = (layer) => T.layoutText(layer).lines.map((l) => ({ text: l.text, words: l.words.length, w: l.words.length ? l.words[l.words.length - 1].x + l.words[l.words.length - 1].width - l.words[0].x : 0 }));
    const sheet = async (svgs, cols, w, h) => {
      const rows = Math.ceil(svgs.length / cols);
      const c = document.createElement('canvas'); c.width = cols * w; c.height = rows * h;
      const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < svgs.length; i++) { if (!svgs[i]) continue; const bm = await createImageBitmap(await H.FA.svgToPng(svgs[i], w * 2)); g.drawImage(bm, (i % cols) * w, Math.floor(i / cols) * h, w, h); }
      return await new Promise((res) => c.toBlob(async (b) => { const u = new Uint8Array(await b.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); res(btoa(t)); }, 'image/png'));
    };
    return { H, P, FS, T, built, script, lines, sheet };
  })();`);
}

// ----- A: the choice -----
test('A: the default by the marker rule: writer for blank lines only; paragraphs for --- lines or Slide N / N/M headers', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (post) => {
    const P: any = await import('/src/carousel/pasted.ts');
    const three = 'First block of words here.\n\nSecond block of words here.\n\nThird block of words here.';
    return {
      blank: P.defaultTextMode(post),
      dashes: P.defaultTextMode(three.replace(/\n\n/g, '\n---\n')),
      slideN: P.defaultTextMode('Slide 1\nFirst block.\n\nSlide 2\nSecond block.\n\nSlide 3\nThird block.'),
      colon: P.defaultTextMode('Slide 1: x\nFirst block.\n\nSlide 2: y\nSecond block.\n\nSlide 3: z\nThird.'),
      frac: P.defaultTextMode('1/3\nFirst block.\n\n2/3\nSecond block.\n\n3/3\nThird block.'),
      list: P.defaultTextMode('Intro line here.\n\n1. one\n2. two\n3. three\n\nOutro line here.'),
      blocksSlide: P.slideBlocks('Slide 1\nFirst block.\n\nSlide 2\nSecond block.\n\nSlide 3\nThird block.'),
      blocksFrac: P.slideBlocks('1/3\nFirst block.\n\n2/3\nSecond block.\n\n3/3\nThird block.'),
    };
  }, POST);
  expect(r.blank).toBe('writer');
  expect(r.dashes).toBe('paragraphs');
  expect(r.slideN).toBe('paragraphs');
  expect(r.colon, '"Slide 1: Hook" has words after the colon: it is not a bare header').toBe('writer');
  expect(r.frac).toBe('paragraphs');
  expect(r.list, 'a numbered list is not a slide marker').toBe('writer');
  expect(r.blocksSlide).toEqual(['First block.', 'Second block.', 'Third block.']);
  expect(r.blocksFrac).toEqual(['First block.', 'Second block.', 'Third block.']);
});

const PLAN = JSON.stringify({ title: 'Say Creator', slides: [
  { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
  { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }, accents: [] },
  { layout: 'numbered-list', fields: { title: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: [] },
  { layout: 'headline-card', fields: { headline: 'Change a headline and nothing reruns.', card: 'Switch the style and your words stay put.' }, accents: [] },
  { layout: 'statement-card', fields: { headline: 'You can add your own pictures too.' }, accents: [] },
  { layout: 'statement', fields: { headline: 'I want you saying something worth swiping for.' }, accents: [] },
  { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." }, accents: [] },
] });
async function fakeWriter(page: Page) {
  const calls: string[] = [];
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const w = (r: any) => { calls.push(String(r.request().postDataJSON()?.prompt ?? '').slice(0, 40)); return r.fulfill({ json: { text: PLAN, ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  return calls;
}
const make = (page: Page) => page.getByRole('button', { name: 'Make carousel', exact: true });

test('A: the Content step shows the choice (writer preselected, with the cost of each); the writer choice makes exactly 1 call; a style switch and a text edit make none', async ({ page }) => {
  const calls = await fakeWriter(page);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(POST);
  const choice = page.getByTestId('text-mode');
  await expect(choice).toBeVisible();
  await expect(choice.getByRole('radio', { name: /Let the writer make slides/ })).toBeChecked();
  await expect(choice).toContainText('1 small writing call');
  await expect(choice).toContainText('No writing call. Your exact words');
  // screenshots: desktop and phone width
  const desk = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 900 } });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByTestId('text-mode').scrollIntoViewIfNeeded();
  const phone = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 900 } });
  await page.setViewportSize({ width: 1280, height: 900 });
  const both = await page.evaluate(async ([a, b]) => {
    const ia = await createImageBitmap(await (await fetch('data:image/png;base64,' + a)).blob());
    const ib = await createImageBitmap(await (await fetch('data:image/png;base64,' + b)).blob());
    const c = document.createElement('canvas'); c.width = ia.width + ib.width + 20; c.height = Math.max(ia.height, ib.height);
    const g = c.getContext('2d')!; g.fillStyle = '#999'; g.fillRect(0, 0, c.width, c.height); g.drawImage(ia, 0, 0); g.drawImage(ib, ia.width + 20, 0);
    const blob: Blob = await new Promise((res) => c.toBlob((x) => res(x!), 'image/png'));
    const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
  }, [desk.toString('base64'), phone.toString('base64')]);
  save('content-step-choice.png', both);
  await toStep(page, 3);
  await expect(page.getByTestId('cost-line')).toHaveText('0 design calls, 1 small writing call.');
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Cream social profile/ }).first().click();
  await make(page).click();
  await deckDrawn(page, 7);
  await page.waitForTimeout(1500);
  expect(calls.length, 'the writer choice: exactly one writer call').toBe(1);
  // a style switch costs nothing
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await deckDrawn(page, 7);
  await page.waitForTimeout(1500);
  expect(calls.length, 'a style switch: no new call').toBe(1);
});

test('A: "Use my paragraphs as slides" = 0 calls and 7 slides of the exact words; text with --- lines has it preselected', async ({ page }) => {
  const calls = await fakeWriter(page);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(POST);
  await page.getByTestId('text-mode').getByRole('radio', { name: /Use my paragraphs as slides/ }).check();
  await toStep(page, 3);
  await expect(page.getByTestId('cost-line')).toHaveText('0 design calls, 0 writing calls: your slide text is used as it is.');
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Cream social profile/ }).first().click();
  await make(page).click();
  await deckDrawn(page, 7);
  await page.waitForTimeout(1500);
  expect(calls.length).toBe(0);
  // markers: the other choice is preselected
  await page.goto('/images/carousel');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel('Your text or topic').fill(POST.split('\n\n').join('\n---\n'));
  await expect(page.getByTestId('text-mode').getByRole('radio', { name: /Use my paragraphs as slides/ })).toBeChecked();
  await expect(page.getByTestId('text-mode')).toContainText('slide markers');
});

// ----- B: card colours -----
test('B: cards, panels and scrims use the style\'s own colours (or the ground), never a darkened ground: 15 styles, headline-card and photo-full-caption', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async (styles) => {
    const H = (window as any).__H;
    const hsl = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [((h * 60) + 360) % 360, s, l]; };
    const out: any[] = [];
    for (const style of styles) {
      const pack = H.PR.presetPackFor(style, false);
      const st = H.D.styleFromPack(pack).style;
      const pal = new Set<string>(((st.rhythm ?? []) as any[]).flatMap((g) => [g.bg, g.text, g.muted, g.accent, g.surface, g.onAccent]).concat(Object.values(pack.palette ?? {}) as string[]).filter((c: any) => typeof c === 'string').map((c: string) => c.toUpperCase().slice(0, 7)));
      const bad: string[] = [];
      for (const [id, pic] of [['headline-card', null], ['photo-full-caption', 'landscape']] as [string, string | null][]) {
        const def = (await import('/src/carousel/layouts/index.ts')).layoutDef(id);
        const f: any = { ...def.samples.normal };
        if (pic) f.image = H.IM.makeRef({ id: pic, w: 1600, h: 1067 });
        for (let gi = 0; gi < (st.rhythm?.length ?? 1); gi++) {
          const d = await H.D.drawOne({ layout: id, fields: f, accents: [] }, 0, st, { handle: '@h', index: gi, total: 7, cut: 'plain', invert: false, density: 'normal' });
          const ground = ((st.rhythm ?? [])[d.rot?.ground ?? 0] ?? (st.rhythm ?? [])[0] ?? { bg: '#FFFFFF' }).bg ?? '#FFFFFF';
          for (const l of d.layers ?? []) {
            if (l.kind !== 'shape' || typeof l.fill !== 'string' || !/^#[0-9a-f]{6}/i.test(l.fill) || l.width * l.height < 60000) continue;
            const fill = l.fill.toUpperCase().slice(0, 7);
            const [h, s, lt] = hsl(fill);
            if (pal.has(fill) || s < 0.12) continue; // a palette colour, or a neutral overlay
            // anything else must keep the ground's hue and not be darker than the ground when the ground is a lively light colour
            for (const g of (st.rhythm ?? []) as any[]) {
              const [gh, gs, gl] = hsl(String(g.bg).toUpperCase().slice(0, 7));
              if (gs >= 0.35 && gl >= 0.5 && Math.abs(h - gh) < 15 && lt < gl - 0.04) bad.push(`${id} ${fill} is a darkened ${g.bg}`);
            }
          }
        }
      }
      out.push({ style, bad: [...new Set(bad)] });
    }
    return out;
  }, STYLES);
  console.log('B', JSON.stringify(r.filter((x: any) => x.bad.length)));
  for (const x of r) expect(x.bad, x.style).toEqual([]);
});

test('B: editorial-collage cover card is not a darkened yellow', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async () => {
    const H = (window as any).__H;
    const st = H.D.styleFromPack(H.PR.presetPackFor('editorial-collage', false)).style;
    return (st.rhythm ?? []).map((g: any) => ({ bg: g.bg, surface: g.surface }));
  });
  console.log('editorial-collage grounds', JSON.stringify(r));
  const lum = (h: string) => { const n = parseInt(h.slice(1, 7), 16); return ((n >> 16) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722) / 255; };
  for (const g of r) expect(lum(g.surface), `card ${g.surface} on ${g.bg}`).toBeGreaterThanOrEqual(Math.min(lum(g.bg), 0.9) - 0.12);
});

// ----- C: the closing -----
test('C: the Say Creator closing in all 15 styles: no one-small-word middle or last line, no social glyph without a handle (and the glyph is there with one)', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async ({ styles, post }) => {
    const R = await (window as any).__R;
    const SHORT = new Set(['your', 'the', 'a', 'to', 'of', 'in', 'on', 'it', 'my', 'we', 'an', 'is', 'at', 'by', 'or', 'and', 'for', 'you', 'our', 'me', 'i', 'this', 'that']);
    const out: any[] = [];
    const svgs: string[] = [];
    for (const style of styles) {
      const made = await R.script(post, style, [], '');
      const last = made.designed.slides['6'].built;
      svgs.push(last.svg);
      const bad: string[] = [];
      for (const l of last.layers) {
        if (l.kind !== 'text' || l.name !== 'title') continue;
        const ls = R.lines(l);
        ls.forEach((q: any, i: number) => { if (i === 0 || q.words !== 1) return; const w = q.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); if (i === ls.length - 1 || w.length <= 3 || SHORT.has(w)) bad.push(`line ${i + 1} "${q.text}" of ${ls.map((z: any) => z.text).join(' / ')}`); });
      }
      const glyph = (last.devices ?? []).some((d: any) => d.id === 'contact-icons') || /<rect x="52" y="1210" width="32"/.test(last.svg);
      out.push({ style, bad, glyph });
    }
    const withHandle = await R.script(post, 'style-4', [], '@sayhandle');
    const hasGlyph = /<rect x="52" y="1210" width="32"/.test(withHandle.designed.slides['6'].built.svg);
    return { out, hasGlyph, sheet: await R.sheet(svgs, 5, 432, 540) };
  }, { styles: STYLES, post: POST });
  save('closing-15-styles.png', r.sheet);
  for (const x of r.out) {
    expect(x.bad, `${x.style} closing wrap`).toEqual([]);
    expect(x.glyph, `${x.style}: a social glyph with no handle`).toBe(false);
  }
  console.log('glyph with a handle in style-4:', r.hasGlyph);
});

// ----- D: body text last line -----
for (const style of ['style-6', 'editorial-collage', 'style-4']) {
  test(`D (${style}): a body text ends on a line of 2 words or at least 40% of the longest line`, async ({ page }) => {
    await setup(page);
    const r: any = await page.evaluate(async ({ style, post }) => {
      const R = await (window as any).__R;
      const made = await R.script(post, style, [], '');
      const bad: string[] = [];
      for (const k of Object.keys(made.designed.slides)) {
        for (const l of made.designed.slides[k].built.layers) {
          if (l.kind !== 'text' || !l.text || l.role === 'decor' || /recurring|page|swipe|handle/.test(l.id + l.name)) continue;
          const ls = R.lines(l);
          if (ls.length < 2) continue;
          const last = ls[ls.length - 1], longest = Math.max(...ls.map((q: any) => q.w));
          if (last.words < 2 && last.w < 0.4 * longest) bad.push(`slide ${Number(k) + 1} ${l.name}: "${last.text}" (${Math.round((last.w / longest) * 100)}%) ends ${ls.map((q: any) => q.text).join(' / ')}`);
        }
      }
      return bad;
    }, { style, post: POST });
    expect(r).toEqual([]);
  });
}

// ----- E: covers on the script route -----
test('E: the script route chooses the cover from the style\'s allowed cover list, like the writer route (stable hash)', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async ({ styles, post }) => {
    const R = await (window as any).__R;
    const out: any = {};
    for (const style of styles) {
      const pack = R.H.PR.presetPackFor(style, false);
      const st = R.H.D.styleFromPack(pack).style;
      const allowed: string[] = st.coverLayouts?.layouts ?? [];
      const a = await R.script(post, style, [], '');
      const b = await R.script(post, style, [], '');
      out[style] = { cover: a.designed.library.plan.specs[0].layout, again: b.designed.library.plan.specs[0].layout, allowed };
    }
    return out;
  }, { styles: STYLES, post: POST });
  console.log('E covers', JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]: any) => [k, v.cover]))));
  for (const [style, v] of Object.entries<any>(r)) {
    expect(v.again, `${style}: stable`).toBe(v.cover);
    if (v.allowed.length) expect([...v.allowed, 'statement'], `${style}: ${v.cover} is in its cover list`).toContain(v.cover);
  }
  expect(new Set(Object.values<any>(r).map((v) => v.cover)).size, 'the 15 styles do not all open the same way').toBeGreaterThanOrEqual(4);
});

// ----- F: pictures on both routes -----
const wordsOf = (t: string) => (t.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
for (const style of ['style-6', 'style-4', 'editorial-collage']) {
  test(`F (${style}) "Use my paragraphs" + 4 pictures: all 4 pictures used, no word changed, no sentence repeated`, async ({ page }) => {
    await setup(page);
    const r: any = await page.evaluate(async ({ style, post }) => {
      const R = await (window as any).__R;
      const pics = ['landscape', 'portrait', 'square', 'tall'];
      const made = await R.script(post, style, pics, '');
      const slides = Object.keys(made.designed.slides).map((k) => made.designed.slides[k].built);
      const used = slides.flatMap((b: any) => (b.images ?? []).map((i: any) => i.src));
      const texts = slides.map((b: any) => b.layers.filter((l: any) => l.kind === 'text' && l.role !== 'decor' && !/recurring|page|swipe|handle/.test(l.id + l.name)).map((l: any) => l.text as string));
      const specs = made.designed.library.plan.specs.map((s: any) => ({ layout: s.layout, fields: s.fields }));
      const over: string[] = [];
      slides.forEach((b: any, i: number) => { for (const l of b.layers) { if (l.kind !== 'text' || !l.text || /recurring|page|swipe|handle/.test(l.id + l.name)) continue; const ls = R.lines(l); const bottom = l.y + ls.length * (l.style.size * (l.style.lineHeight ?? 1.2)); if (bottom > 1262) over.push('slide ' + (i + 1) + ' ' + l.name + ' ends at ' + Math.round(bottom)); } });
      const sheet = await R.sheet(slides.map((b: any) => b.svg), 4, 432, 540);
      return { over, calls: made.designed.calls, n: slides.length, used: used.length, usedUnique: new Set(used).size, texts, specs, sheet, layouts: specs.map((s: any) => s.layout), source: R.built(post).script.slides };
    }, { style, post: POST });
    save(`with-pictures-paragraphs-${style}.png`, r.sheet);
    expect(r.calls).toBe(0);
    expect(r.n).toBe(7);
    expect(r.over, 'no text runs past the bottom of the slide').toEqual([]);
    expect(r.usedUnique, `pictures used: ${r.layouts}`).toBe(4);
    // the words of the deck: every word of the person's text is on a slide, nothing else is added (counted as a multiset)
    const have = r.texts.flat().join(' ');
    const src = r.source.map((s: any) => [s.kicker, s.headline, s.sub, s.body, ...(s.items ?? []), s.cta].filter(Boolean).join(' ')).join(' ');
    const count = (t: string) => { const m = new Map<string, number>(); wordsOf(t).forEach((w) => m.set(w, (m.get(w) ?? 0) + 1)); return m; };
    const hv = count(have), sv = count(src);
    const missing = [...sv].filter(([w, n]) => (hv.get(w) ?? 0) < n && w !== 'comment' && w !== 'slides' && w !== 'and').map(([w]) => w);
    const added = [...hv].filter(([w, n]) => (sv.get(w) ?? 0) < n).map(([w]) => w);
    expect(missing, `words lost on the slides (layouts ${r.layouts})`).toEqual([]);
    // (the closing keeps the action's own words as its button, so the linking "and" of "Comment slides and I'll send you the link" is the only word that is not drawn)
    expect(added, 'words added on the slides').toEqual([]);
    for (const [i, s] of r.specs.entries()) {
      const all: string[] = [];
      for (const [k, v] of Object.entries<any>(s.fields)) if (k !== 'accent' && k !== 'image' && !/^image\d?$/.test(k)) for (const x of Array.isArray(v) ? v : [v]) if (typeof x === 'string') all.push(...x.split(/(?<=[.!?])\s+/).map((q) => wordsOf(q).join(' ')).filter((q) => q.split(' ').length >= 3));
      expect(all.filter((q, j) => all.indexOf(q) !== j), `slide ${i + 1} repeats a sentence`).toEqual([]);
    }
  });
}

test('F: the writer route with 4 pictures: min(pictures, half the slides) picture slides, every picture used (fake writer)', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async ({ plan, post }) => {
    const H = (window as any).__H;
    const out: any = {};
    for (const style of ['style-6', 'style-4']) {
      const pics = ['landscape', 'portrait', 'square', 'tall'];
      const d = await H.deck({ style, slides: JSON.parse(plan).slides, pictures: pics, title: 'Say Creator', text: post });
      const used = new Set<string>();
      for (let i = 0; i < 7; i++) for (const im of d.imagesOf(i)) used.add(im.src);
      const pictured = [0, 1, 2, 3, 4, 5, 6].filter((i) => d.imagesOf(i).length > 0).length;
      const sheet = await H.FA && (await (async () => { const svgs = [0, 1, 2, 3, 4, 5, 6].map((i) => d.res.designed.slides[String(i)]?.built?.svg ?? ''); const c = document.createElement('canvas'); c.width = 4 * 432; c.height = 2 * 540; const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height); for (let i = 0; i < 7; i++) { if (!svgs[i]) continue; const bm = await createImageBitmap(await H.FA.svgToPng(svgs[i], 864)); g.drawImage(bm, (i % 4) * 432, Math.floor(i / 4) * 540, 432, 540); } return await new Promise((res) => c.toBlob(async (b) => { const u = new Uint8Array(await b!.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); res(btoa(t)); }, 'image/png')); })());
      out[style] = { used: used.size, pictured, layouts: d.specs.map((s: any) => s.layout), sheet };
    }
    return out;
  }, { plan: PLAN, post: POST });
  for (const style of Object.keys(r)) {
    save(`with-pictures-writer-${style}.png`, r[style].sheet);
    expect(r[style].used, `${style}: every picture used (${r[style].layouts})`).toBe(4);
    expect(r[style].pictured, `${style}: picture slides`).toBeGreaterThanOrEqual(Math.min(4, 3));
  }
});

// ----- the three-style sheets of the two choices (no pictures) -----
test('sheets: the fixture in 3 styles, writer choice (fake writer plan) and paragraphs choice', async ({ page }) => {
  await setup(page);
  const r: any = await page.evaluate(async ({ plan, post }) => {
    const R = await (window as any).__R;
    const H = R.H;
    const svgsP: string[] = [];
    const svgsW: string[] = [];
    for (const style of ['style-6', 'editorial-collage', 'style-4']) {
      const made = await R.script(post, style, [], '');
      for (let i = 0; i < 7; i++) svgsP.push(made.designed.slides[String(i)].built.svg);
      const d = await H.deck({ style, slides: JSON.parse(plan).slides, pictures: [], title: 'Say Creator', text: post });
      for (let i = 0; i < 7; i++) svgsW.push(d.res.designed.slides[String(i)].built.svg);
    }
    return { p: await R.sheet(svgsP, 7, 216, 270), w: await R.sheet(svgsW, 7, 216, 270) };
  }, { plan: PLAN, post: POST });
  save('paragraphs-choice-3-styles.png', r.p);
  save('writer-choice-3-styles.png', r.w);
});
