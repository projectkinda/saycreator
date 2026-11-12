// Round 15: (A) the screenshot rule is safe by default and the real screenshots are screenshots; (B) the placement of screenshots by shape (code decides, not the writer), with the real picture sizes and the
// exact plan of the real editorial-collage report; (E) a lone stop-word accent moves to the last words of the headline; the box guard (tightenBox) that made the real "edges" failures.
// A fake writer only: ZERO real model calls. Output: out/round-15/real-classification.md (when the real files are there), out/round-15/placement-real-sizes.png
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { REPLAY } from './replay-helper';

test.setTimeout(10 * 60_000);
const OUT = 'out/round-15';
const REAL = process.env.REAL_PICTURES_DIR ?? 'out/test-pictures';
const helpSrc = fs.readFileSync('tests/image-engine/screenshots.spec.ts', 'utf8');
const MAKE = helpSrc.slice(helpSrc.indexOf('const MAKE = `') + 14, helpSrc.indexOf('`;\n\ntest(\'classification'));

test('A1: every real picture in out/test-pictures classifies as a screenshot (numbers in out/round-15/real-classification.md)', async ({ page }) => {
  const files = fs.existsSync(REAL) ? fs.readdirSync(REAL).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)) : [];
  test.skip(!files.length, `no pictures in ${REAL} (put the real screenshots there to classify them; set REAL_PICTURES_DIR to use another folder)`);
  await page.goto('/images/carousel');
  const rows: any[] = [];
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(REAL, f)).toString('base64');
    const mime = /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg';
    rows.push({ f, ...(await page.evaluate(async ([b64, mime]) => {
      const K: any = await import('/src/carousel/pictureKind.ts');
      const img = new Image(); img.src = `data:${mime};base64,${b64}`; await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight, ...K.readContentOf(img, img.naturalWidth, img.naturalHeight, mime === 'image/png') };
    }, [b64, mime])) });
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/real-classification.md`, ['# Real pictures: screenshot or photo (current rule)', '', '| file | size | result | top16 | flat | edges | grain | colours |', '|---|---|---|---|---|---|---|---|', ...rows.map((x) => `| ${x.f} | ${x.w}x${x.h} | ${x.content} | ${x.top16} | ${x.flat} | ${x.edges} | ${x.grain} | ${x.buckets} |`), ''].join('\n'));
  for (const x of rows) expect(x.content, `${x.f}: top16 ${x.top16}, flat ${x.flat}, edges ${x.edges}, grain ${x.grain}`).toBe('screenshot');
});

test('A2: safe by default: a photo only when clearly one; unknown or unreadable content is a screenshot; synthetic photos stay photos, synthetic screenshots stay screenshots', async ({ page }) => {
  await page.goto('/images/carousel');
  await page.evaluate(MAKE);
  const r: any = await page.evaluate(async () => {
    const K: any = await import('/src/carousel/pictureKind.ts');
    const MK = (window as any).__MK;
    const read = (c: HTMLCanvasElement, png = false) => K.readContentOf(c, c.width, c.height, png).content;
    // a text-box screenshot: a white page with dense, anti-aliased text drawn as the browser does (not flat bars)
    const c = document.createElement('canvas'); c.width = 609; c.height = 757;
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 609, 757); g.fillStyle = '#222'; g.font = '15px Arial';
    for (let i = 0; i < 40; i++) g.fillText('Most creators do not have a design problem, they have a time problem ' + i, 24, 40 + i * 17);
    const dense = K.readContentOf(c, 609, 757);
    return {
      photos: [read(MK.photo(1500, 1000, 11, 12)), read(MK.photo(1000, 1500, 12, 20)), read(MK.photo(2400, 1000, 14, 16))],
      shots: [read(MK.shot(1170, 2532, 1, '#ffffff', '#222222', '#2f6fed')), read(MK.shot(609, 757, 4, '#0b2a5a', '#ffffff', '#ffd23f'))],
      dense: dense.content, denseNumbers: dense,
      unknown: K.contentOr(undefined), photo: K.contentOr('photo'), nul: K.contentOr(null),
      empty: K.readContent(new Uint8ClampedArray(0), 0, 0).content,
      limits: [K.PHOTO_LIMITS, K.PHOTO_LIMITS_PNG],
    };
  });
  expect(r.photos).toEqual(['photo', 'photo', 'photo']);
  expect(r.shots).toEqual(['screenshot', 'screenshot']);
  expect(r.dense, JSON.stringify(r.denseNumbers)).toBe('screenshot');
  expect([r.unknown, r.photo, r.nul]).toEqual(['screenshot', 'photo', 'screenshot']);
  expect(r.empty).toBe('screenshot');
  expect(r.limits[1].top16).toBeLessThan(r.limits[0].top16); // a PNG must be clearer still
});

const REAL_PLAN = (() => {
  const f = 'out/reports/report-real-editorial.json';
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
})();

test('B: the real plan and the real picture sizes in a style that keeps title-over-photo: no text over any screenshot, all 4 pictures used, the tall one in the phone, every change logged', async ({ page }) => {
  test.skip(!REAL_PLAN, 'out/reports/report-real-editorial.json is not there (the real editorial-collage report)');
  await page.goto('/images/carousel');
  await page.evaluate(REPLAY);
  const out: any[] = [];
  for (const style of ['style-6', 'style-2']) {
    const rep = { ...REAL_PLAN, style };
    const r: any = await page.evaluate(async (rep) => (window as any).__REPLAY(rep, { content: 'screenshot' }), rep);
    out.push({ style, r });
    if (style === 'style-6') {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(`${OUT}/placement-real-sizes.png`, Buffer.from(r.sheet, 'base64'));
    }
    const names = r.layouts.join(', ');
    for (const s of r.slides) {
      expect(s.over, `${style} slide ${s.slide} (${s.layout}): text over a screenshot (${names})`).toEqual([]);
      expect([...s.failed, ...s.fit], `${style} slide ${s.slide} (${s.layout}) fails a check`).toEqual([]);
    }
    expect(r.pictureUse, `${style}: ${names}`).toMatchObject({ uploaded: 4, used: 4, unused: [] });
    const tall = 'p-jlcn0hfo2'; // the 1107x2400 iPhone screenshot
    const phone = r.plan.findIndex((sp: any) => sp.layout === 'phone-frame');
    expect(phone, `${style}: a phone-frame slide stays (${names})`).toBeGreaterThanOrEqual(0);
    expect(String(r.plan[phone].fields.image ?? ''), `${style}: the tall screenshot is in the phone`).toContain(tall);
    expect(r.plan.some((sp: any, i: number) => sp.layout === 'phone-frame' && !sp.fields.image), `${style}: no empty phone`).toBe(false);
    // the cover never takes a screenshot (unless pinned) and every swap says why
    expect(r.plan[0].fields.image ?? '', `${style}: the cover has no screenshot`).toBe('');
  }
  fs.writeFileSync(`${OUT}/placement-real-sizes.json`, JSON.stringify(out.map((o) => ({ style: o.style, layouts: o.r.layouts, codeAdjustments: o.r.codeAdjustments, swaps: o.r.swaps, pictureUse: o.r.pictureUse })), null, 1));
});

test('B1: screenshotPass on the real plan and the real sizes (no flavour in the way): slide 1 (cover) becomes a text cover, slide 4 leaves title-over-photo for a layout that shows its screenshot whole; the phone gets the tall one; every swap says why', async ({ page }) => {
  test.skip(!REAL_PLAN, 'out/reports/report-real-editorial.json is not there');
  await page.goto('/images/carousel');
  const specs = REAL_PLAN.designed.library.plan.specs.map((s: any) => ({ layout: s.layout, variant: s.variant, accents: s.accents, fields: Object.fromEntries(Object.entries(s.fields).filter(([k]) => k !== 'image')) }));
  const r: any = await page.evaluate(async (specs) => {
    const PP: any = await import('/src/carousel/picturePass.ts');
    const P: any = await import('/src/carousel/imagePlace.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const images = [['p-vnvxitfgr', 609, 757], ['p-won9eoflo', 1402, 1313], ['p-4dw1fvfje', 2400, 1230], ['p-jlcn0hfo2', 1107, 2400]].map(([id, width, height]) => ({ id, width, height, content: 'screenshot' }));
    // the writer gives title-over-photo to slides 1 and 4, but the plan's own pictures were never placed: the code places them
    const withPics = specs.map((s: any) => ({ ...s }));
    const before = P.placeImages(withPics, withPics.map(() => 0), images);
    const pass = PP.screenshotPass(withPics, { images, hasPhoto: true });
    const after = P.placeImages(pass.specs, pass.specs.map(() => 0), images);
    const overText = (specs2: any[]) => specs2.map((s: any, i: number) => (IM.TEXT_OVER_PICTURE.includes(s.layout) && P.usedIds(s.fields).length ? i + 1 : 0)).filter(Boolean);
    return { layoutsBefore: specs.map((s: any) => s.layout), layoutsAfter: pass.specs.map((s: any) => s.layout), swaps: pass.swaps, usedAfter: after.flatMap((s: any) => P.usedIds(s.fields)), overBefore: overText(before), overAfter: overText(after), phoneImg: after.find((s: any) => s.layout === 'phone-frame')?.fields.image ?? '', words: pass.specs.map((s: any) => Object.values(s.fields).flat().join(' ')), oldWords: specs.map((s: any) => Object.values(s.fields).flat().join(' ')) };
  }, specs);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/screenshot-pass.json`, JSON.stringify({ layoutsBefore: r.layoutsBefore, layoutsAfter: r.layoutsAfter, swaps: r.swaps, usedAfter: r.usedAfter }, null, 1));
  expect(r.layoutsBefore[0]).toBe('title-over-photo');
  expect(r.layoutsAfter[0], 'the cover is a text cover').not.toBe('title-over-photo');
  expect(r.layoutsAfter[3], 'slide 4 shows its screenshot whole').not.toBe('title-over-photo');
  expect(r.swaps.every((w: any) => /screenshot never goes under text|no picture left/.test(w.why)), JSON.stringify(r.swaps)).toBe(true);
  expect(r.swaps.some((w: any) => w.slide === 4 && w.from === 'title-over-photo'), JSON.stringify(r.swaps)).toBe(true);
  expect(r.overAfter).toEqual([]);
  expect(new Set(r.usedAfter).size, 'all four pictures are used: ' + r.layoutsAfter.join(', ')).toBe(4);
  expect(String(r.phoneImg)).toContain('p-jlcn0hfo2');
  // no word is lost: every word of every old slide is in the new one
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean);
  r.oldWords.forEach((o: string, i: number) => { const have = new Set(norm(r.words[i])); for (const w of norm(o)) expect(have.has(w), 'slide ' + (i + 1) + ' keeps "' + w + '"').toBe(true); });
});

test('B2: a writer that gives a tall screenshot to title-over-photo and leaves the phone-frame empty: the phone gets it; a wide screenshot on title-over-photo moves to a hero band; the words are all kept', async ({ page }) => {
  await page.goto('/images/carousel');
  await page.evaluate(REPLAY);
  const rep = {
    style: 'style-6', sourceText: 'Most creators do not have a design problem. They have a time problem. The idea took ten minutes. The slides took the rest of the night. Change a headline and nothing reruns. Switch the style and your words stay put.',
    designed: { library: { plan: { title: 'T', specs: [
      { layout: 'statement', fields: { headline: 'Most creators do not have a design problem.' }, accents: [] },
      { layout: 'title-over-photo', fields: { headline: 'The idea took ten minutes.', line: 'The slides took the rest of the night.', image: 'picture:wide1#w=2400&h=1230&fx=0.5&fy=0.5&z=1' }, accents: [] },
      { layout: 'phone-frame', variant: 1, fields: { headline: 'Change a headline and nothing reruns.', body: 'Switch the style and your words stay put.' }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'I will send you the link.' }, accents: [] },
    ] } } },
  };
  const r: any = await page.evaluate(async (rep) => (window as any).__REPLAY(rep, { content: 'screenshot', extra: [{ id: 'tall1', w: 1107, h: 2400 }] }), rep);
  const names = r.layouts.join(', ');
  expect(r.plan.findIndex((s: any) => s.layout === 'phone-frame') >= 0, names).toBe(true);
  const ph = r.plan.find((s: any) => s.layout === 'phone-frame');
  expect(String(ph.fields.image), `the phone has the tall screenshot (${names})`).toContain('tall1');
  for (const s of r.slides) expect(s.over, `slide ${s.slide} ${s.layout}`).toEqual([]);
  expect(r.pictureUse).toMatchObject({ used: 2, unused: [] });
  expect(r.layouts[1], 'the wide screenshot is not under text').not.toBe('title-over-photo');
});

test('E: a lone stop-word or contraction accent moves to the last words of the headline ("Here\'s how it works" -> "how it works", then the usual clamp)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const mk = (headline: string, accents: string[], key = 'headline') => ({ layout: 'statement', fields: { [key]: headline }, accents });
    const specs = [
      mk('Here\'s how it works', ["Here's"], 'title'), mk('Take the time', ['the']), mk('Ask and I\'ll send it', ["I'll"]), mk('Build slides faster', ['faster']), mk('And', ['And']),
      mk('Say Creator is built for the idea', ['and']),
    ];
    const f = D.fixStopAccents(specs);
    const c = D.clampAccents(f.specs);
    return { fixed: f.specs.map((s: any) => s.accents), clamped: c.specs.map((s: any) => s.accents), notes: f.notes };
  });
  expect(r.fixed[0]).toEqual(['how it works']);
  expect(r.clamped[0]).toEqual(['it works']);
  expect(r.fixed[1]).toEqual(['Take the time']); // the last two non-stop words, as the span of the headline between them
  expect(r.fixed[2]).toEqual(["Ask and I'll send"]);
  expect(r.fixed[3]).toEqual(['faster']); // a real word stays
  expect(r.fixed[4]).toEqual([]); // nothing else in the headline: no accent
  expect(r.fixed[5]).toEqual(['built for the idea']);
  expect(r.notes.length).toBe(5);
});

test('box guard: a text box that runs past the 48 px margin although its words do not is cut back to the margin; the words never gain a line', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const T: any = await import('/src/carousel/layouts/textFits.ts');
    const mk = (text: string, x: number, width: number, size: number, align = 'left') => ({ kind: 'text', id: 't', name: 'body', role: 'content', x, y: 100, width, height: 100, rotation: 0, opacity: 1, text, style: { font: 'Inter', weight: 500, size, color: '#000000', align, valign: 'top', lineHeight: 1.25 } });
    const a = T.tightenBox(mk('The slides took the rest of the night.', 48, 988.8, 44));
    const L: any = await import('/src/image-engine/draw/text.ts');
    const long = mk('The slides took the rest of the night and then some more words that cannot stay on one line at all.', 48, 988.8, 44);
    const b = T.tightenBox(long);
    const linesSame = L.layoutText(long).lines.length === L.layoutText(b).lines.length;
    const c = T.tightenBox(mk('Short', 48, 978, 44));
    return { a: [a.x, a.width], b: [b.x, b.width], c: [c.x, c.width], linesSame };
  });
  expect(r.a[0] + r.a[1]).toBeLessThanOrEqual(1032.5);
  expect(r.c).toEqual([48, 978]);
  expect(r.linesSame, 'the narrower box never adds a line').toBe(true);
});
