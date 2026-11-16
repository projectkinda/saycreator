// Round T part 1: text over a picture is measured on the slide as drawn (photoContrast.ts): the slide is drawn without its text, the pixels under each laid-out line that crosses a picture are read,
// light text against the 90th percentile of their luminance, dark text against the 10th, and the WCAG ratio must reach 3:1 from 48 px (every headline) and 4.5:1 under it. The deck stores one row per
// slide with text over a picture (report.json photoContrast), recomputed on every redraw; the export renderer says the measured result instead of "not checked". No drawing changes.
// A FAKE writer: ZERO real model calls. sky-tower and sunrays-palms are real photos (out/test-pictures, never in git; skipped when absent); the near-white and busy pictures are made here.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { toStep } from './ui';

test.setTimeout(6 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const DIR = process.env.REAL_PICTURES_DIR ?? 'out/test-pictures';
const REAL = ['sky-tower.jpg', 'sunrays-palms.jpg'];
const hasReal = REAL.every((f) => fs.existsSync(path.join(DIR, f)));
const b64 = (f: string) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64');

/** The two hard pictures (1280 x 960), made in the page: a near-white wall and a fine high-contrast checkerboard. */
const makeHard = (page: Page) => page.evaluate(() => {
  const mk = (kind: 'snow' | 'busy') => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 960; const g = c.getContext('2d')!;
    const im = g.createImageData(1280, 960); let seed = kind === 'snow' ? 11 : 29;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let y = 0; y < 960; y++) for (let x = 0; x < 1280; x++) {
      const k = (y * 1280 + x) * 4; let r: number, gg: number, bb: number;
      if (kind === 'snow') { const v = 238 + 12 * (1 - y / 960) + (rnd() - 0.5) * 10 - Math.sin(x / 90) * 4; r = v - 2; gg = v; bb = Math.min(255, v + 4); }
      else { const cell = ((x >> 4) + (y >> 4)) & 1; const n = (rnd() - 0.5) * 70; const v = cell ? 225 + n * 0.4 : 25 + n * 0.4; r = v * 0.8; gg = v; bb = v * 0.6; }
      im.data[k] = Math.max(0, Math.min(255, r)); im.data[k + 1] = Math.max(0, Math.min(255, gg)); im.data[k + 2] = Math.max(0, Math.min(255, bb)); im.data[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
  };
  return { 'near-white': mk('snow'), 'busy-check': mk('busy') };
});

test('T1 the check reads the photo: light text with no scrim fails on every picture; as the app draws title-over-photo (its own scrim) every headline passes 3:1', async ({ page }) => {
  test.skip(!hasReal, 'the real test photos are not on this computer');
  await page.goto('/images/carousel');
  const pics: Record<string, string> = { ...(await makeHard(page)), 'sky-tower': b64('sky-tower.jpg'), 'sunrays-palms': b64('sunrays-palms.jpg') };
  const r = await page.evaluate(async (pics) => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const FA: any = await import('/src/reference/faithful.ts');
    const LY: any = await import('/src/carousel/layouts/index.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const PC: any = await import('/src/carousel/photoContrast.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    FA.setPictureResolver(async (ref: string) => pics[ref.slice('picture:'.length).split('#')[0]] ?? null);
    const { style } = DL.styleFromPack(PR.presetPackFor('style-1', false, null));
    const out: Record<string, unknown> = {};
    for (const [n, src] of Object.entries(pics)) {
      const im = new Image(); im.src = src; await im.decode();
      const f = { headline: 'Met some wonderful people there', image: IM.makeRef({ id: n, w: im.naturalWidth, h: im.naturalHeight, photo: true }) };
      const o = { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal', ground: 0 };
      // the photo with the text and no scrim at all (the scrim rectangle taken out of the drawing)
      const raw = await LY.buildSlide('title-over-photo', 0, f, style, { ...o, scrim: 0 });
      const bare = await PC.measurePhotoContrast({ ...raw, svg: raw.svg.replace(/<rect[^>]*fill="url\(#scrim[LH]\)"[^>]*\/>/g, '') });
      // as the app draws it
      const d = await DL.drawOne({ layout: 'title-over-photo', fields: f, accents: [] }, 0, style, o);
      const app = await PC.measurePhotoContrast(d.built);
      const rows = await DL.photoContrastOf([d], ['title-over-photo']);
      const title = (m: any) => m.roles.find((q: any) => q.role === 'title');
      out[n] = { bare: title(bare), app: title(app), side: app.roles.find((q: any) => q.role === 'side-label') ?? null, ms: app.ms, rows, boxes: PC.pictureBoxesOfSvg(d.built.svg), images: d.built.images.map((p: any) => ({ x: p.x, y: p.y, w: p.w, h: p.h })) };
    }
    return out;
  }, pics);
  for (const [n, x] of Object.entries(r) as [string, any][]) {
    expect(x.bare.tone, n).toBe('light');
    expect(x.bare.threshold, `${n}: a headline is large text`).toBe(3);
    expect(x.bare.pass, `${n} with no scrim: ${x.bare.ratio}`).toBe(false);
    expect(x.app.tone, n).toBe('light');
    expect(x.app.pass, `${n} as drawn: ${x.app.ratio}`).toBe(true);
    // style-1 sets the handle upright along the right edge (a 36 px side label, page chrome): over the photo it is measured too, at 4.5:1
    expect(x.side, `${n}: the side label crosses the photo`).not.toBeNull();
    expect(x.side.threshold, n).toBe(4.5);
    // the repair pass: a side label that does not read is repaired (a plate, the other ink), the headline is left as it is
    expect(x.rows[0].pass, `${n}: after the repair pass`).toBe(true);
    const sideRow = x.rows[0].roles.find((q: any) => q.role === 'side-label');
    if (!x.side.pass) expect(sideRow.repair, n).toMatch(/plate behind the side label|side label in the other ink/);
    else expect(sideRow.repair, n).toBeUndefined();
    expect(x.app.ratio, n).toBeGreaterThanOrEqual(3);
    expect(x.rows, n).toHaveLength(1);
    expect(x.rows[0].roles.find((q: any) => q.role === 'title').ratio, n).toBe(x.app.ratio);
    // the picture boxes read from the drawing cover the plan's own (a photo drawn whole adds its inner rectangle)
    for (const b of x.images) expect(x.boxes, n).toContainEqual(b);
  }
  // the hard cases are the worst with no scrim
  expect(r['near-white'].bare.ratio).toBeLessThan(1.5);
  expect(r['busy-check'].bare.ratio).toBeLessThan(2);
  expect(r['sky-tower'].bare.ratio).toBeLessThan(3);
  // the side label (muted ink, 36 px) does not reach 4.5:1 on the near-white and busy pictures: measured and reported, the drawing is not changed (Round T part 1)
  expect(r['near-white'].side.pass).toBe(false);
  expect(r['busy-check'].side.pass).toBe(false);
});

test('T2 only text that crosses a picture is measured: a caption on its panel, a slide with no picture and a deck with no pictures draw nothing extra', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makeHard(page);
  const r = await page.evaluate(async (pics) => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const FA: any = await import('/src/reference/faithful.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const PC: any = await import('/src/carousel/photoContrast.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    FA.setPictureResolver(async (ref: string) => (pics as any)[ref.slice('picture:'.length).split('#')[0]] ?? null);
    const { style } = DL.styleFromPack(PR.presetPackFor('style-3', false, null));
    const o = { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' };
    const img = IM.makeRef({ id: 'near-white', w: 1280, h: 960, photo: true });
    const cap = await DL.drawOne({ layout: 'photo-full-caption', fields: { headline: 'Had a wonderful blast at the event.', image: img }, accents: [] }, 0, style, o);
    const plain = await DL.drawOne({ layout: 'statement', fields: { headline: 'Looking forward to more of these.' }, accents: [] }, 0, style, o);
    return {
      capOver: PC.hasTextOverPicture(cap.built), cap: await PC.measurePhotoContrast(cap.built),
      plainOver: PC.hasTextOverPicture(plain.built), plain: await PC.measurePhotoContrast(plain.built),
      rows: await DL.photoContrastOf([cap, plain], ['photo-full-caption', 'statement']),
    };
  }, pics);
  expect(r.capOver, 'the caption sits on its own panel, not on the photo').toBe(false);
  expect(r.cap).toEqual({ roles: [], pass: true, ms: 0 });
  expect(r.plainOver).toBe(false);
  expect(r.plain).toEqual({ roles: [], pass: true, ms: 0 });
  expect(r.rows).toEqual([]);
});

test('T3 the sentence that replaces "not checked" on a slide with text over a picture', async ({ page }) => {
  await page.goto('/images/carousel');
  const s = await page.evaluate(async () => {
    const PC: any = await import('/src/carousel/photoContrast.ts');
    const FC: any = await import('/src/reference/faithfulChecks.ts');
    return {
      ok: PC.photoContrastSentence({ roles: [{ role: 'title', ratio: 8.66, threshold: 3, pass: true }, { role: 'body', ratio: 5.1, threshold: 4.5, pass: true }], pass: true, ms: 40 }),
      low: PC.photoContrastSentence({ roles: [{ role: 'title', ratio: 2.39, threshold: 3, pass: false }, { role: 'recurring', ratio: 4, threshold: 4.5, pass: false }, { role: 'side-label', ratio: 1.23, threshold: 4.5, pass: false }], pass: false, ms: 40 }),
      side: PC.sideLabelsOfSvg('<svg><text transform="translate(1054 690) rotate(-90)" text-anchor="middle" font-family="Inter" font-size="36" font-weight="500" fill="#B5B2A6">@saycreator</text></svg>'),
      unchecked: FC.UNCHECKED[0],
      gradSvg: '<svg><defs><linearGradient id="htext" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient></defs></svg>',
    };
  });
  expect(s.ok).toBe('Text over the picture, measured on the slide as drawn (90th percentile of the pixels behind light text, 10th behind dark text): title 8.66:1 (needs 3:1); body 5.10:1 (needs 4.5:1).');
  expect(s.low).toBe('Text over the picture, measured on the slide as drawn (90th percentile of the pixels behind light text, 10th behind dark text): title 2.39:1 (needs 3:1, too low); page chrome 4.00:1 (needs 4.5:1, too low); side label (page chrome) 1.23:1 (needs 4.5:1, too low).');
  expect(s.side).toHaveLength(1);
  expect(s.side[0]).toMatchObject({ text: '@saycreator', ink: '#B5B2A6', size: 36 });
  expect(s.side[0].box.h).toBeCloseTo(11 * 36 * 0.58, 1);
  expect(s.unchecked).toMatch(/^Contrast over gradients/);
  // a gradient headline: each line is read only at the colours the gradient takes over that line's box
  const g = await page.evaluate(async (svg) => { const PC: any = await import('/src/carousel/photoContrast.ts'); return { left: PC.gradientInksOver(svg, { x: 0, y: 0, w: 500, h: 50 }), right: PC.gradientInksOver(svg, { x: 500, y: 0, w: 500, h: 50 }), none: PC.gradientInksOver('<svg/>', { x: 0, y: 0, w: 10, h: 10 }) }; }, s.gradSvg);
  expect(g.left).toHaveLength(11);
  expect(g.left[0]).toBe('#000000');
  expect(g.left[10]).toBe('#808080');
  expect(g.right[0]).toBe('#808080');
  expect(g.right[10]).toBe('#ffffff');
  expect(g.none).toBeNull();
});

// ---- the app: the deck stores the rows, report.json lists them, a style switch measures again; 0 writer calls after the build
const TEXT = "Had a wonderful blast at the Hyderabad event. Thank you Punit Chawla for the crazy day man. Met some wonderful people there. And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun. Looking forward for some more of these going forward. And also don't you forget man Punit Chawla";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const SLIDES5 = [
  S('photo-full-caption', { headline: 'Had a wonderful blast at the Hyderabad event.' }),
  S('lead-statement', { lead: 'Thank you Punit Chawla', headline: 'for the crazy day man.' }),
  S('title-over-photo', { headline: 'Met some wonderful people there.' }),
  S('prose', { p1: 'And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun.', pull: "And also don't you forget man Punit Chawla." }),
  S('statement-card', { headline: 'Looking forward for some more of these going forward.' }),
];
async function fake(page: Page) {
  const f = { calls: 0 };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = (r: Route) => { f.calls++; return r.fulfill({ json: { text: JSON.stringify({ title: 'Hyderabad event', slides: SLIDES5 }), ms: 5 } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
const report = (page: Page) => page.evaluate(async () => {
  const RP: any = await import('/src/reference/report.ts');
  const doc = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project.doc;
  return JSON.parse((await RP.buildReport({ doc, includeRefs: false, verdicts: {}, note: '' })).json);
});

test('T4 the app: the deck stores one row per slide with text over a picture, report.json lists it (and per slide), a style switch measures again; no writer call after the build', async ({ page }) => {
  const f = await fake(page);
  await page.goto('/images/carousel');
  const hard = await makeHard(page);
  const files = Object.entries(hard).map(([n, url], i) => ({ name: `event photo ${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(url.split(',')[1], 'base64') }));
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(2, { timeout: 60_000 });
  for (let i = 0; i < 2; i++) { const chip = page.getByTestId(`image-${i}-content`); if ((await chip.getAttribute('data-content')) === 'screenshot') await chip.click(); }
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 2);
  await page.getByTestId('options').getByRole('combobox').first().selectOption('5');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Cream ink/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film li').nth(4)).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(2000);
  const made = f.calls;
  const d = await stored(page);
  const specs = d.designed.library.plan.specs;
  const over = specs.map((s: any, i: number) => (s.layout === 'title-over-photo' && Object.values(s.fields).some((v: any) => typeof v === 'string' && v.startsWith('picture:')) ? i + 1 : 0)).filter(Boolean);
  expect(over.length, 'the deck has a headline over a photo').toBeGreaterThan(0);
  const rows = d.designed.library.photoContrast;
  expect(rows.map((r: any) => r.slide)).toEqual(over);
  for (const r of rows) {
    expect(r.layout).toBe('title-over-photo');
    expect(r.pass).toBe(r.roles.every((q: any) => q.pass));
    expect(r.roles.find((q: any) => q.role === 'title').pass).toBe(true);
    expect(r.roles.find((q: any) => q.role === 'title').threshold).toBe(3);
  }
  const rep = await report(page);
  expect(rep.photoContrast.map((r: any) => r.slide)).toEqual(over);
  expect(rep.photoContrast[0].roles[0]).toMatchObject({ role: 'title', threshold: 3, pass: true });
  expect(rep.photoContrast[0].roles[0].ratio).toBe(rows[0].roles.find((q: any) => q.role === 'title').ratio);
  expect(rep.slides[over[0] - 1].photoContrast[0]).toMatchObject({ role: 'title', threshold: 3, pass: true });
  expect(rep.slides.filter((s: any) => s.photoContrast).length).toBe(over.length);
  // the export renderer: on the slide with text over a photo the measured result takes the place of "contrast over gradients ... is not checked"; on a slide with no photo the sentence stays
  const warn = await page.evaluate(async (ks) => {
    const R: any = await import('/src/carousel/render.ts');
    const doc = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project.doc;
    const out: string[][] = [];
    for (const k of ks) {
      const b = doc.designed.slides[String(k)].built;
      const slide = { id: 'w' + k, type: 'content', notes: [], plan: { canvas: { width: 1080, height: 1350 }, k }, faithful: { svg: b.svg, layers: b.layers, canvas: { w: 1080, h: 1350 }, bg: b.bg } };
      out.push((await R.renderer.render(slide, 0)).warnings);
    }
    return out;
  }, [over[0] - 1, specs.findIndex((s: any) => s.layout === 'prose')]);
  expect(warn[0].join(' ')).toContain('Text over the picture, measured on the slide as drawn');
  expect(warn[0].join(' ')).not.toContain('Contrast over gradients');
  expect(warn[1].join(' ')).toContain('Contrast over gradients');
  expect(warn[1].join(' ')).not.toContain('Text over the picture');
  // another style: the rows are measured again on the new drawing
  await page.locator('.cr-wiz-steps button').nth(2).click();
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Mono editorial glow/ }).first().click();
  await expect.poll(async () => (await stored(page)).designed.library.source, { timeout: 60_000 }).toBe('style-1');
  await page.waitForTimeout(1500);
  const d2 = await stored(page);
  expect(d2.designed.library.photoContrast.map((r: any) => r.slide)).toEqual(over);
  // Mono editorial glow (style-1): the headline still reads, and its side label over the photo is repaired, so every row passes; the layouts and words are those of the plan
  const rows2 = d2.designed.library.photoContrast;
  expect(rows2.every((r: any) => r.pass), JSON.stringify(rows2)).toBe(true);
  const sideFixed = rows2.filter((r: any) => r.roles.some((q: any) => q.role === 'side-label' && q.repair));
  expect(d2.designed.library.plan.specs.map((s: any) => s.layout)).toEqual(specs.map((s: any) => s.layout));
  expect(d2.designed.library.plan.specs.map((s: any) => JSON.stringify(s.fields))).toEqual(specs.map((s: any) => JSON.stringify(s.fields)));
  const svgOf = (dd: any, k: number) => dd.designed.slides[String(k - 1)].built.svg as string;
  const fixedSvgs = sideFixed.map((r: any) => svgOf(d2, r.slide));
  // the same switch again draws and repairs the same way (deterministic): a colour combination and back would redraw too; a reload keeps the drawing
  await page.reload();
  await expect(page.locator('.cr-film li').nth(4)).toBeVisible({ timeout: 60_000 });
  const d3 = await stored(page);
  expect(sideFixed.map((r: any) => svgOf(d3, r.slide))).toEqual(fixedSvgs);
  // a move: the slide is drawn again at its new place and still reads (repaired again where needed)
  const k = over[0];
  if (!(await page.getByTestId('arrange-box').isVisible().catch(() => false))) await page.getByTestId('edit-slides').click();
  await page.getByRole('button', { name: `Show slide ${k}`, exact: true }).click();
  await page.getByRole('button', { name: `Move slide ${k} up`, exact: true }).click();
  await expect(page.getByTestId('arrange-status')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const d4 = await stored(page);
  expect(d4.designed.library.photoContrast.map((r: any) => r.slide)).toContain(k - 1);
  expect(d4.designed.library.photoContrast.every((r: any) => r.pass)).toBe(true);
  expect(f.calls, 'no writer call after the build').toBe(made);
});

test('T5 each repair is reached on its own fixture: a gradient headline gets a stronger scrim; a side label gets a plate, or the other ink on a plate; words, layout and picture never change', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makeHard(page);
  const r = await page.evaluate(async (pics) => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const FA: any = await import('/src/reference/faithful.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const PC: any = await import('/src/carousel/photoContrast.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    FA.setPictureResolver(async (ref: string) => (pics as any)[ref.slice('picture:'.length).split('#')[0]] ?? null);
    const words = (b: any) => b.layers.filter((l: any) => l.kind === 'text').map((l: any) => l.text).join(' | ');
    const href = (svg: string) => [...svg.matchAll(/<image href="([^"]+)"/g)].map((m) => m[1]).join(' ');
    const one = async (styleId: string, pic: string, ground: number, v: 0 | 1) => {
      const { style } = DL.styleFromPack(PR.presetPackFor(styleId, false, null));
      const f = { headline: 'The hoodie that becomes a backpack', line: 'Ten seconds, one zip.', image: IM.makeRef({ id: pic, w: 1280, h: 960, photo: true }) };
      const d = await DL.drawOne({ layout: 'title-over-photo', fields: f, accents: [] }, v, style, { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal', ground });
      const before = await PC.measurePhotoContrast(d.built);
      const st = await DL.settlePhotoContrast([d], ['title-over-photo']);
      const after = st.drawn[0];
      const again = await DL.settlePhotoContrast([await DL.drawOne({ layout: 'title-over-photo', fields: f, accents: [] }, v, style, { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal', ground })], ['title-over-photo']);
      return {
        before: before.roles.map((q: any) => ({ role: q.role, pass: q.pass, ratio: q.ratio })), row: st.rows[0], notes: st.notes,
        sameWords: words(after.built) === words(d.built), samePicture: href(after.built.svg) === href(d.built.svg),
        plates: [...after.built.svg.matchAll(/data-role="side-label-plate"[^>]*fill-opacity="([\d.]+)"/g)].map((m) => Number(m[1])),
        deterministic: again.drawn[0].built.svg === after.built.svg,
        untouched: before.pass ? after.built.svg === d.built.svg : null,
      };
    };
    return {
      gradient: await one('style-8', 'busy-check', 0, 0),
      plate: await one('style-1', 'near-white', 0, 0),
      otherInk: await one('style-1', 'busy-check', 1, 0),
      reads: await one('style-3', 'busy-check', 0, 0),
    };
  }, pics);
  // the gradient headline (style-8): fails as the layout draws it, reads after its own scrim is raised
  expect(r.gradient.before.find((q: any) => q.role === 'title').pass).toBe(false);
  expect(r.gradient.row.pass).toBe(true);
  expect(r.gradient.row.roles.find((q: any) => q.role === 'title').repair).toMatch(/^the title-over-photo scrim raised from level \d to \d of 3$/);
  // the side label on a plate (its own ink), the side label in the other ink on a plate
  for (const k of ['plate', 'otherInk'] as const) {
    expect(r[k].before.find((q: any) => q.role === 'side-label').pass, k).toBe(false);
    expect(r[k].row.pass, k).toBe(true);
    expect(r[k].plates.length, k).toBe(1);
    expect(r[k].plates[0], `${k}: never more than 0.6`).toBeLessThanOrEqual(0.6);
  }
  expect(r.plate.row.roles.find((q: any) => q.role === 'side-label').repair).toMatch(/^a 0\.\d+ plate behind the side label$/);
  expect(r.otherInk.row.roles.find((q: any) => q.role === 'side-label').repair).toMatch(/^the side label in the other ink \(#[0-9A-F]{6}\) on a 0\.\d+ plate$/);
  for (const k of ['gradient', 'plate', 'otherInk', 'reads'] as const) {
    expect(r[k].sameWords, `${k}: every word kept`).toBe(true);
    expect(r[k].samePicture, `${k}: the same picture`).toBe(true);
    expect(r[k].deterministic, `${k}: the same drawing every time`).toBe(true);
  }
  // a slide that reads is left exactly as it is
  expect(r.reads.before.every((q: any) => q.pass)).toBe(true);
  expect(r.reads.untouched).toBe(true);
  expect(r.reads.notes).toEqual([]);
});
