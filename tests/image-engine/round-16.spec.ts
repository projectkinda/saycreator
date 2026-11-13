// Round 16. A: the evidence of every writer call is in the report; C: the repair path; E: photos shown whole on a blurred copy (photo-fill.png); G: headline and caption sizes beside pictures
// (caption-sizes.png); H: a style switch rebuilds the notes, the flavour and the route reason from the current style. (D is in screenshots.spec, F in picker.spec.)
// A fake writer only: ZERO real model calls. Output: out/round-16/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { deckDrawn, toStep } from './ui';
import { REPLAY } from './replay-helper';

test.setTimeout(10 * 60_000);
const OUT = 'out/round-16';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const shotSrc = fs.readFileSync('tests/image-engine/screenshots.spec.ts', 'utf8');
const MAKE = shotSrc.slice(shotSrc.indexOf('const MAKE = `') + 14, shotSrc.indexOf('`;\n\ntest(\'classification'));
const newest = (): string | null => {
  const d = 'out/reports';
  if (!fs.existsSync(d)) return null;
  const f = fs.readdirSync(d).filter((x) => /^report.*\.json$/i.test(x)).map((x) => ({ x, t: fs.statSync(path.join(d, x)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  return f ? path.join(d, f.x) : null;
};
const REAL = (() => { const f = newest(); return f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; })();

test('A: every writer call is recorded with the exact prompt (characters and bytes), the request bytes, num_turns, duration_api_ms, the effort setting and the tokens', async ({ page }) => {
  await page.goto('/images/carousel');
  const sent: string[] = [];
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.route('**/__carousel/write', (r) => {
    sent.push(r.request().postData() ?? '');
    return r.fulfill({ json: { text: JSON.stringify({ title: 'T', slides: [
      { layout: 'statement', fields: { headline: 'Stop storing your life in your head.' }, accents: [] },
      { layout: 'split-text', fields: { headline: 'Hold things in a system', paragraph: 'You can trust it.' }, accents: [] },
      { layout: 'checklist', fields: { title: 'Three steps', items: ['Capture', 'Sort', 'Review'] }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Build your own', button: 'Join the waitlist', sub: 'Today.' }, accents: [] },
    ] }), ms: 4321, usage: { input: 6486, output: 531 }, meta: { numTurns: 1, durationApiMs: 3861, effort: 'low' } } });
  });
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const W: any = await import('/src/carousel/writer.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const p = (await W.detectProviders()).find((x: any) => x.id === 'dev-cli');
    W.setWriterEffort('low');
    let prompt = '';
    const wrapped = { ...p, async write(pr: string, ...a: any[]) { prompt = pr; return p.write(pr, ...a); } };
    const res = await D.designLibraryDeck({ text: 'Stop storing your life in your head. Hold things in a system you trust. Three steps: capture, sort, review. Build your own. Join the waitlist today.', slides: 4, tone: 'clear', format: 'carousel', styleChoice: 'dark-quiet', styles: [] }, { pack: PR.presetPackFor('dark-quiet', false), hasPhoto: false, images: [] }, '@maya.designs', wrapped, new AbortController().signal);
    W.setWriterEffort(null);
    return { prompt: { chars: prompt.length, bytes: new TextEncoder().encode(prompt).length }, writes: res.designed.library.writes, requestBytes: res.designed.requestBytes };
  });
  expect(sent.length).toBe(1);
  expect(JSON.parse(sent[0]).effort, 'the effort setting is sent').toBe('low');
  const w = r.writes[0];
  expect(w).toMatchObject({ call: 1, promptChars: r.prompt.chars, promptBytes: r.prompt.bytes, requestBytes: new TextEncoder().encode(sent[0]).length, numTurns: 1, durationApiMs: 3861, effort: 'low', inputTokens: 6486, outputTokens: 531 });
  // the seconds of the call are recorded as a number of the fake call's own size (>= 0 was true for any number)
  expect(typeof w.seconds === 'number' && Number.isFinite(w.seconds) && w.seconds < 60).toBe(true);
  expect(r.requestBytes).toMatchObject({ prompt: r.prompt.chars, body: w.requestBytes });
});

test('C: a slide that fails a check is redrawn by the code in a layout that fits: every word kept, no model call, the repair is in the report', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const T: any = await import('/src/image-engine/draw/text.ts');
    let calls = 0;
    const plan = [
      { layout: 'statement', fields: { headline: 'Most creators do not have a design problem.' }, accents: [] },
      { layout: 'split-text', fields: { headline: 'The idea took ten minutes', paragraph: 'The slides took the rest of the night.' }, accents: [] },
      { layout: 'checklist', fields: { title: 'Three steps', items: ['Paste your text', 'Pick a look', 'Get slides'] }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'I will send you the link.' }, accents: [] },
    ];
    const provider: any = { id: 'dev-cli', label: 'fake', async write() { calls++; return { text: JSON.stringify({ title: 'T', slides: plan }), ms: 1 }; } };
    // the deliberately failing check: a text box wider than the slide's content width on a split-text slide (a too-wide box)
    D.setSlideCheckHook((layers: any[], spec: any) => (spec.layout === 'split-text' && layers.some((l: any) => l.kind === 'text' && l.name === 'title') ? ['edges: a text box is too wide (forced by the test)'] : []));
    let res: any;
    try {
      res = await D.designLibraryDeck({ text: 'Most creators do not have a design problem. The idea took ten minutes. The slides took the rest of the night. Three steps: paste your text, pick a look, get slides. Try it on your next post. Comment slides and I will send you the link.', slides: 4, tone: 'clear', format: 'carousel', styleChoice: 'dark-quiet', styles: [] }, { pack: PR.presetPackFor('dark-quiet', false), hasPhoto: false, images: [] }, '@maya.designs', provider, new AbortController().signal);
    } finally { D.setSlideCheckHook(null); }
    const lib = res.designed.library;
    const words = (f: any) => Object.entries(f).filter(([k]) => k !== 'accent').flatMap(([, v]) => (Array.isArray(v) ? v : [v])).join(' ').toLowerCase().match(/[a-z0-9']+/g) ?? [];
    const slideText = (i: number) => (res.designed.slides[String(i)].built.layers as any[]).filter((l) => l.kind === 'text' && l.text && !/recurring/.test(l.id + l.name)).map((l) => l.text).join(' ').toLowerCase().match(/[a-z0-9']+/g) ?? [];
    return { calls, repairs: lib.repairs, layouts: lib.layouts, adjustments: lib.codeAdjustments, oldWords: words(plan[1].fields), newWords: slideText(1), unused: T ? 1 : 0 };
  });
  expect(r.calls, 'no model call besides the one writer call').toBe(1);
  expect(r.repairs, JSON.stringify(r)).toHaveLength(1);
  expect(r.repairs[0]).toMatchObject({ slide: 2, from: 'split-text', result: 'repaired' });
  expect(r.repairs[0].to).not.toBe('split-text');
  expect(r.layouts[1]).toBe(r.repairs[0].to);
  expect(r.adjustments.join('\n')).toContain('slide 2: split-text -> ' + r.repairs[0].to);
  for (const w of r.oldWords) expect(r.newWords, `the repaired slide keeps "${w}"`).toContain(w);
});

test('E: a photo that a cover-crop would cut by more than 25% is shown whole on a blurred, darkened copy of itself; a screenshot keeps 10% and a flat panel; the sheet is saved', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  await page.evaluate(MAKE);
  const r: any = await page.evaluate(async () => {
    const H = (window as any).__H;
    const MK = (window as any).__MK;
    const urls: Record<string, string> = {};
    const shapes: [string, number, number][] = [['p43', 1600, 1200], ['p34', 1200, 1600], ['p21', 2000, 1000]];
    shapes.forEach(([id, w, h], k) => { urls[id] = MK.photo(w, h, 21 + k, 14).toDataURL('image/jpeg', 0.7); urls['s' + id] = MK.shot(w, h, 31 + k, '#ffffff', '#222222', '#2f6fed').toDataURL('image/png'); });
    H.FA.setPictureResolver(async (ref: string) => urls[ref.slice('picture:'.length).split('#')[0]] ?? null);
    const styles = ['style-6', 'editorial-collage', 'dark-quiet'];
    const tiles: { style: string; layout: string; shape: string; svg: string; notes: string[] }[] = [];
    const flags: { style: string; layout: string; shape: string; blur: boolean; panel: boolean; notes: string }[] = [];
    const draw = async (style: string, layout: string, id: string, photo: boolean, index: number) => {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      const [, w, h] = shapes.find((q) => q[0] === id.replace(/^s/, ''))!;
      const ref = H.IM.makeRef({ id, w, h, ...(photo ? { photo: true } : {}) });
      const f: any = layout === 'title-over-photo' ? { headline: 'Most creators do not have a design problem.', line: 'They have a time problem.', image: ref } : { headline: 'The idea took ten minutes.', line: 'The slides took the rest of the night.', image: ref };
      const d = await H.D.drawOne({ layout, fields: f, accents: [] }, 0, st, { handle: '@maya.designs', index, total: 7, cut: 'plain', invert: false, density: 'normal' });
      return d.built ? { svg: d.built.svg as string, notes: (d.built.notes ?? []) as string[] } : null;
    };
    for (const style of styles) for (const [layout, index] of [['title-over-photo', 0], ['photo-full-caption', 2]] as [string, number][]) for (const [id] of shapes) {
      const b = await draw(style, layout, id, true, index);
      if (!b) continue;
      tiles.push({ style, layout, shape: id, svg: b.svg, notes: b.notes });
      flags.push({ style, layout, shape: id, blur: /feGaussianBlur/.test(b.svg), panel: false, notes: b.notes.join(' | ') });
    }
    // the same picture shapes as screenshots: a flat panel, never a blur
    const shotFlags: any[] = [];
    for (const [layout, index] of [['title-over-photo', 0]] as [string, number][]) for (const [id] of shapes) {
      const b = await draw('style-6', layout, 's' + id, false, index);
      if (b) shotFlags.push({ layout, shape: id, blur: /feGaussianBlur/.test(b.svg), notes: b.notes.join(' | ') });
    }
    // the sheet
    const cols = 6, w = 220, h = 275;
    const c = document.createElement('canvas'); c.width = cols * (w + 8) + 8; c.height = Math.ceil(tiles.length / cols) * (h + 8) + 8;
    const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
    for (const [i, t] of tiles.entries()) { const bm = await createImageBitmap(await H.FA.svgToPng(t.svg, 440)); g.drawImage(bm, 8 + (i % cols) * (w + 8), 8 + Math.floor(i / cols) * (h + 8), w, h); }
    return { flags, shotFlags, sheet: c.toDataURL('image/png').split(',')[1] };
  });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/photo-fill.png`, Buffer.from(r.sheet, 'base64'));
  const pick = (layout: string, shape: string) => r.flags.filter((x: any) => x.layout === layout && x.shape === shape);
  // title-over-photo slot 1080x1134 (0.95): 4:3 loses 28.6% (> 25%: blur), 3:4 loses 21% (<= 25%: cropped), 2:1 loses 52% (blur)
  for (const x of pick('title-over-photo', 'p43')) expect(x.blur, `${x.style} 4:3 in title-over-photo`).toBe(true);
  for (const x of pick('title-over-photo', 'p21')) expect(x.blur, `${x.style} 2:1 in title-over-photo`).toBe(true);
  for (const x of pick('title-over-photo', 'p34')) expect(x.blur, `${x.style} 3:4 in title-over-photo is cropped (21% is inside the 25% budget)`).toBe(false);
  for (const x of r.shotFlags) expect(x.blur, `a screenshot (${x.shape}) never gets a blurred backdrop`).toBe(false);
  expect(r.shotFlags.find((x: any) => x.shape === 'p43').notes, 'a screenshot keeps the 10% budget and its flat panel').toMatch(/10%/);
  expect(r.flags.filter((x: any) => x.blur).every((x: any) => /25%.*blurred/.test(x.notes))).toBe(true);
});

test('G: beside a picture the headline fits in 4 lines (shrunk down to 70% before a fifth), avoids a one-word "and" line; photo-full-caption with 12 words or fewer has a 64 px headline and a 40 px body, the panel grows', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  const r: any = await page.evaluate(async () => {
    const H = (window as any).__H;
    const T: any = await import('/src/image-engine/draw/text.ts');
    const out: any = { phone: [], split: [], caption: [] };
    const sizes = (built: any, name: string) => { const l = built.layers.find((q: any) => q.kind === 'text' && q.name === name); if (!l) return null; const b = T.layoutText(l); return { size: Math.round(b.size), lines: b.lines.map((q: any) => (q.words ? q.words.map((x: any) => x.text).join(' ') : '')), n: b.lines.length }; };
    const heads = ['Change a headline and nothing reruns.', 'Open the app and tap start to begin', 'You write a good post.', 'Switch the style and your words stay put every time'];
    for (const style of ['style-6', 'editorial-collage', 'dark-quiet']) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const head of heads) {
        const tall = H.IM.makeRef({ id: 'tall', w: 1107, h: 2400 });
        const dp = await H.D.drawOne({ layout: 'phone-frame', fields: { headline: head, body: 'Switch the style and your words stay put.', image: tall }, accents: [] }, 0, st, { handle: '@h', index: 5, total: 7, cut: 'plain', invert: false, density: 'normal' });
        if (dp.built) out.phone.push({ style, head, title: sizes(dp.built, 'title') });
        const port = H.IM.makeRef({ id: 'port', w: 1000, h: 1500 });
        const ds = await H.D.drawOne({ layout: 'split-half', fields: { headline: head, body: 'Then you spend the evening dragging text boxes around a template.', image: port }, accents: [] }, 0, st, { handle: '@h', index: 1, total: 7, cut: 'plain', invert: false, density: 'normal' });
        if (ds.built) out.split.push({ style, head, layout: ds.built.svg.match(/data-layout="([^"]+)"/)?.[1], title: sizes(ds.built, 'title') });
      }
      for (const [head, line] of [['The idea took ten minutes.', 'The slides took the rest of the night.'], ['Ten minutes for the idea, a night for the slides', 'Really.'], ['Most creators do not have a design problem', 'They have a time problem that costs hours.']]) {
        const wide = H.IM.makeRef({ id: 'wide', w: 2400, h: 1230 });
        const dc = await H.D.drawOne({ layout: 'photo-full-caption', fields: { headline: head, line, image: wide }, accents: [] }, 0, st, { handle: '@h', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
        if (dc.built) out.caption.push({ style, head, words: `${head} ${line}`.split(/\s+/).length, title: sizes(dc.built, 'title'), body: sizes(dc.built, 'body'), pic: dc.built.images?.[0] ? Math.round(dc.built.images[0].h) : null });
      }
    }
    return out;
  });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/sizes.json`, JSON.stringify(r, null, 1));
  // a line of one small stop-word ("and", "a", "of") is avoided where possible; a short content word like "You" can be forced alone by a narrow column
  const weak = (lines: string[]) => lines.length > 1 && lines.some((l) => /^(and|a|an|the|of|to|in|on|or|but|for|at|by)$/i.test(l.trim()));
  // beside a picture: at most 4 lines; a fifth line only when 4 lines are impossible down to 70% of the normal size (112 px in the phone slide, 120 px in the half), and then the size is under that 70%
  for (const x of [...r.phone.map((p: any) => ({ ...p, normal: 112 })), ...r.split.filter((s: any) => s.layout !== 'split-text').map((p: any) => ({ ...p, normal: 120 }))]) {
    if (!x.title) continue;
    if (x.title.n > 4) expect(x.title.size, `${x.style} "${x.head}": a fifth line only below 70% of ${x.normal}`).toBeLessThan(x.normal * 0.7);
    else expect(weak(x.title.lines), `${x.style} "${x.head}": no one-word "and" line (${JSON.stringify(x.title.lines)})`).toBe(false);
    expect(x.title.size, `${x.style} "${x.head}": never under 72 px`).toBeGreaterThanOrEqual(72);
  }
  for (const x of r.caption) {
    expect(x.title.size, `${x.style} "${x.head}": the caption headline is not under 32 px`).toBeGreaterThanOrEqual(32);
    if (x.words <= 12) {
      expect(x.title.size, `${x.style} "${x.head}" (${x.words} words): headline at least 64 px`).toBeGreaterThanOrEqual(64);
      if (x.body) expect(x.body.size, `${x.style} "${x.head}": body at least 40 px`).toBeGreaterThanOrEqual(40);
    }
  }
  // a headline that needs two lines makes the panel grow, so the picture is shorter than the 880 px of a one-line caption
  const grown = r.caption.find((x: any) => /Ten minutes for the idea/.test(x.head));
  expect(grown.pic, 'the picture shrinks to make room').toBeLessThan(880);
});

test('G3: the real plan\'s phone-frame, photo-full-caption and split-half slides re-rendered (out/round-16/caption-sizes.png)', async ({ page }) => {
  test.skip(!REAL, 'no report in out/reports/');
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  await page.evaluate(MAKE);
  const sp = REAL.designed.library.plan.specs;
  const pick = (layout: string) => sp.find((s: any) => s.layout === layout);
  const r: any = await page.evaluate(async ({ phone, caption, split }) => {
    const H = (window as any).__H;
    const MK = (window as any).__MK;
    const sizes: Record<string, [number, number]> = { tall: [1107, 2400], wide: [2400, 1230], sq: [1402, 1313] };
    const urls: Record<string, string> = {};
    Object.entries(sizes).forEach(([id, [w, h]], k) => { urls[id] = MK.shot(w, h, 5 + k, '#ffffff', '#222222', '#2f6fed').toDataURL('image/png'); });
    H.FA.setPictureResolver(async (ref: string) => urls[ref.slice('picture:'.length).split('#')[0]] ?? null);
    const T: any = await import('/src/image-engine/draw/text.ts');
    const rows: any[] = [];
    const bms: ImageBitmap[] = [];
    for (const style of ['dark-quiet', 'editorial-collage']) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      for (const [layout, f, pic, idx] of [['phone-frame', phone, 'tall', 5], ['photo-full-caption', caption, 'wide', 2], ['split-half', split, 'sq', 1]] as [string, any, string, number][]) {
        if (!f) continue;
        const fields = { ...f.fields, image: H.IM.makeRef({ id: pic, w: sizes[pic][0], h: sizes[pic][1] }) };
        const d = await H.D.drawOne({ layout, fields, accents: f.accents ?? [] }, f.variant ?? 0, st, { handle: '@maya.designs', index: idx, total: 7, cut: 'plain', invert: false, density: 'normal' });
        if (!d.built) { rows.push({ style, layout, error: d.problems }); continue; }
        const sz = (name: string) => { const l = d.built.layers.find((q: any) => q.kind === 'text' && q.name === name); return l ? { size: Math.round(T.layoutText(l).size), lines: T.layoutText(l).lines.length } : null; };
        rows.push({ style, layout, title: sz('title'), body: sz('body') });
        bms.push(await createImageBitmap(await H.FA.svgToPng(d.built.svg, 540)));
      }
    }
    const cols = 3, w = 360, h = 450;
    const c = document.createElement('canvas'); c.width = cols * (w + 10) + 10; c.height = Math.ceil(bms.length / cols) * (h + 10) + 10;
    const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
    bms.forEach((u, i) => g.drawImage(u, 10 + (i % cols) * (w + 10), 10 + Math.floor(i / cols) * (h + 10), w, h));
    return { rows, sheet: c.toDataURL('image/png').split(',')[1] };
  }, { phone: pick('phone-frame'), caption: pick('photo-full-caption'), split: pick('split-half') });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/caption-sizes.png`, Buffer.from(r.sheet, 'base64'));
  fs.writeFileSync(`${OUT}/caption-sizes.json`, JSON.stringify(r.rows, null, 1));
  for (const x of r.rows) expect(x.error, JSON.stringify(x)).toBeUndefined();
});

// ----- H: stale notes after a style switch -----
const fixture = JSON.parse(fs.readFileSync('tests/image-engine/fixtures/hot-flat-app-library.json', 'utf8')).library;
const SPECS = fixture.plan.specs.map((s: any) => ({ layout: s.layout, fields: s.fields, accents: s.accents }));
const doc = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);

test('H: generate in editorial-collage, switch to dark-quiet: no note, flavour or route reason names the old style or its cover; 1 writer call in all', async ({ page }) => {
  let calls = 0;
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'x' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'x' } }));
  await page.route('**/__carousel/write', (r) => { calls++; return r.fulfill({ json: { text: JSON.stringify({ title: 'Habits', slides: SPECS }), ms: 5, usage: { input: 10, output: 5 } } }); });
  await page.route('**/api/carousel/write', (r) => r.fulfill({ status: 503, json: { error: 'off' } }));
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill('Stop storing your life in your head. Hold things in a system you trust. Three steps: capture, sort, review. Build your own. Join the waitlist today.');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, SPECS.length);
  const before = await doc(page);
  const mention = (d: any) => JSON.stringify({ notes: d.designed?.notes, flavour: d.designed?.library?.flavour, route: d.route?.reason });
  expect(mention(before), 'before the switch the report names the first style').toMatch(/editorial/i);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Quiet dark minimal/ }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Style changed. Slides redrawn, no model call.' }).first()).toBeVisible({ timeout: 60_000 });
  const after = await doc(page);
  const text = mention(after);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/restyle-notes.json`, JSON.stringify({ before: JSON.parse(mention(before)), after: JSON.parse(text), style: after.style }, null, 1));
  expect(text).not.toMatch(/editorial|Warm editorial collage/i);
  expect(text, 'the route reason names the current style').toMatch(/dark-quiet/);
  expect(after.style).toBe('dark-quiet');
  expect(calls, 'the switch costs no model call').toBe(1);
});
