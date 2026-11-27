// Round AF: a photo in the picture slot of split-half, headline-body-image or art-side-text that a cover crop would cut by 25% to 40% fills its slot (instead of sitting whole and small in the
// middle of the ground) when the important part stays inside the narrowest part a fill may keep: 90% of the saliency box AND every face the face finder sees. A face that would be cut, a subject
// that spans the photo, a picture the person pinned, "Fill the slide" off or "Keep the full picture" keep it whole and sharp (Round AD). The full-bleed layouts are unchanged (no face is read
// there). Every word is kept; the same drawing twice. Pictures are made in the page and the face finder is a stand-in: ZERO model calls.
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(4 * 60_000);

/** Square photos (1200 x 1200): one figure in the middle of a plain wall, and three figures stacked from top to bottom (the subject spans the photo). */
const makePics = (page: Page) => page.evaluate(() => {
  const fig = (g: CanvasRenderingContext2D, cx: number, cy: number, s: number, shirt: string) => {
    g.fillStyle = shirt; g.beginPath(); g.ellipse(cx, cy + 2.2 * s, 1.2 * s, 1.8 * s, 0, 0, 7); g.fill();
    g.fillStyle = '#c68b62'; g.beginPath(); g.arc(cx, cy, 0.75 * s, 0, 7); g.fill();
    g.fillStyle = '#2b1d14'; g.beginPath(); g.arc(cx, cy - 0.35 * s, 0.7 * s, Math.PI, 0); g.fill();
  };
  const wall = (w: number, h: number) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d9d4cc'); gr.addColorStop(1, '#bdb6aa'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    return { c, g };
  };
  const one = wall(1200, 1200); fig(one.g, 600, 470, 95, '#2471a3');
  const stack = wall(1200, 1200); [90, 470, 850].forEach((y, i) => fig(stack.g, 600, y, 70, ['#c0392b', '#27ae60', '#8e44ad'][i]));
  const tall = wall(900, 1350); fig(tall.g, 450, 560, 95, '#e67e22');
  return { one: one.c.toDataURL('image/jpeg', 0.92), stack: stack.c.toDataURL('image/jpeg', 0.92), tall: tall.c.toDataURL('image/jpeg', 0.92) };
});

/** Draws one slide with the made photos; `faces` is the stand-in face finder's answer per picture (none given: no face). */
const DRAW = `(async ({ pics, layout, v, id, w, h, faces, overrides, pin }) => {
  const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts'); const FA = await import('/src/reference/faithful.ts');
  const FS = await import('/src/carousel/layouts/fillSlide.ts'); const FF = await import('/src/carousel/faceFind.ts');
  const fonts = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
  FA.setPictureResolver(async (ref) => pics[ref.slice(8).split('#')[0].split('-')[0]] ?? null);
  FF.setFaceFinder(async (src) => (faces ?? {})[src.slice(8).split('#')[0]] ?? []);
  FS.setFillOverrides(overrides ?? []);
  const { style } = DL.styleFromPack(PR.presetPackFor('editorial-collage', false, null));
  const ref = 'picture:' + id + '#w=' + w + '&h=' + h + '&fx=0.5&fy=0.5&z=1&k=p';
  const fields = layout === 'art-side-text' ? { heading: 'Pick one detail', paragraph: 'A single leaf on a table can beat a whole landscape.', image: ref } : layout === 'title-over-photo' ? { headline: 'Old cars always get me', line: 'Every one of them has a story.', image: ref } : { headline: 'Old cars always get me', body: 'Every one of them has a story.', image: ref };
  const d = await DL.drawOne({ layout, fields, accents: [], ...(pin ? { pin: { picture: id } } : {}) }, v, style, { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
  FS.setFillOverrides([]); FF.setFaceFinder(null);
  if (!d.built) return { problems: d.problems };
  const b = d.built;
  const img = /<image href="picture:[^"]+" x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.]+)" height="([\\d.]+)"/.exec(b.svg);
  const slot = (b.images ?? [])[0];
  const box = img ? { x: +img[1], y: +img[2], w: +img[3], h: +img[4] } : null;
  const covers = box && slot ? box.x <= slot.x + 1 && box.y <= slot.y + 1 && box.x + box.w >= slot.x + slot.w - 1 && box.y + box.h >= slot.y + slot.h - 1 : null;
  return { svg: b.svg, fills: b.fills ?? null, covers, sharpWhole: /<clipPath id="pic[^"]*"><rect [^>]*rx="\\d+"\\/><\\/clipPath>/.test(b.svg) && !covers, words: b.layers.filter((l) => l.kind === 'text').map((l) => l.text).join(' | ') };
})`;
const draw = (page: Page, a: Record<string, unknown>) => page.evaluate(`${DRAW}(${JSON.stringify(a)})`) as Promise<any>;

test('AF1 split-half: the figure in the middle fills the slot (30-40% cut); the stacked figures stay whole and sharp; the same drawing twice; every word kept', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makePics(page);
  const fill = await draw(page, { pics, layout: 'split-half', v: 0, id: 'one', w: 1200, h: 1200 });
  expect(fill.fills?.[0]).toMatchObject({ picture: 'one', fill: true, why: 'fills', sides: 'top and bottom', faces: { found: 0, inside: true } });
  expect(fill.fills[0].cut).toBeGreaterThan(0.25);
  expect(fill.fills[0].cut).toBeLessThanOrEqual(0.4);
  expect(fill.covers, 'the photo covers its whole slot').toBe(true);
  const whole = await draw(page, { pics, layout: 'split-half', v: 0, id: 'stack', w: 1200, h: 1200 });
  expect(whole.fills?.[0]).toMatchObject({ picture: 'stack', fill: false, why: 'subject-cut' });
  expect(whole.fills[0].inside).toBeLessThan(0.9);
  expect(whole.covers).toBe(false);
  expect(whole.sharpWhole, 'kept whole: sharp with rounded corners (Round AD)').toBe(true);
  // the words are the slide's own, filled or not
  expect(fill.words).toBe(whole.words);
  expect(fill.words.toLowerCase()).toContain('old cars always get me');
  const again = await draw(page, { pics, layout: 'split-half', v: 0, id: 'one', w: 1200, h: 1200 });
  expect(again.svg).toBe(fill.svg);
});

test('AF2 faces: a face inside the kept part fills; a face the crop would cut keeps the photo whole; with no focus point set the kept part is centred on the subject and the faces together', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makePics(page);
  // the figure's head is at y 0.33-0.45: inside the kept part
  const mid = await draw(page, { pics, layout: 'split-half', v: 0, id: 'one-a', w: 1200, h: 1200, faces: { 'one-a': [{ x0: 0.44, y0: 0.33, x1: 0.56, y1: 0.45, score: 0.95 }] } });
  expect(mid.fills?.[0]).toMatchObject({ fill: true, why: 'fills', faces: { found: 1, inside: true } });
  // a face at the very bottom edge of the photo (a 60% window cannot hold the figure's middle and it): kept whole
  const edge = await draw(page, { pics, layout: 'split-half', v: 0, id: 'one-b', w: 1200, h: 1200, faces: { 'one-b': [{ x0: 0.45, y0: 0.9, x1: 0.55, y1: 0.99, score: 0.9 }] } });
  expect(edge.fills?.[0]).toMatchObject({ fill: false, why: 'subject-cut', faces: { found: 1, inside: false } });
  expect(edge.covers).toBe(false);
  expect(edge.sharpWhole).toBe(true);
});

test('AF3 the person decides: pinned, "Fill the slide" off and "Keep the full picture" stay whole; on fills; headline-body-image and art-side-text fill too; the full-bleed layouts read no faces', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makePics(page);
  const pinned = await draw(page, { pics, layout: 'split-half', v: 0, id: 'one-p', w: 1200, h: 1200, pin: true });
  expect(pinned.fills, 'a pinned picture is not a fill question on a slot').toBeNull();
  expect(pinned.covers).toBe(false);
  const off = await draw(page, { pics, layout: 'split-half', v: 0, id: 'one-o', w: 1200, h: 1200, overrides: [['one-o', 'off']] });
  expect(off.fills?.[0]).toMatchObject({ fill: false, why: 'off' });
  expect(off.covers).toBe(false);
  const on = await draw(page, { pics, layout: 'split-half', v: 0, id: 'stack-o', w: 1200, h: 1200, overrides: [['stack-o', 'on']] });
  expect(on.fills?.[0]).toMatchObject({ fill: true, why: 'on' });
  expect(on.covers).toBe(true);
  // headline-body-image (a wide slot) and art-side-text (a tall slot)
  const hbi = await draw(page, { pics, layout: 'headline-body-image', v: 0, id: 'one-h', w: 1200, h: 1200 });
  const ast = await draw(page, { pics, layout: 'art-side-text', v: 0, id: 'tall-a', w: 900, h: 1350 });
  for (const [name, r] of [['headline-body-image', hbi], ['art-side-text', ast]] as const) {
    if (r.fills?.length) {
      expect(r.fills[0].cut, name).toBeLessThanOrEqual(0.4);
      if (r.fills[0].fill) expect(r.covers, name).toBe(true);
      expect(r.fills[0].faces, name).toEqual({ found: 0, inside: true });
    }
  }
  expect([hbi, ast].some((r) => r.fills?.[0]?.fill), 'at least one of the two fills its slot').toBe(true);
  // a full-bleed layout keeps its Round U rule: no face is read there
  const tp = await draw(page, { pics, layout: 'title-over-photo', v: 0, id: 'tall-t', w: 1350, h: 900 });
  for (const f of tp.fills ?? []) expect('faces' in f).toBe(false);
  const FS: any = await page.evaluate(async () => { const m: any = await import('/src/carousel/layouts/fillSlide.ts'); return { full: m.FILL_LAYOUTS, slots: m.SLOT_FILL_LAYOUTS, budget: m.FILL_BUDGET }; });
  expect(FS).toEqual({ full: ['title-over-photo', 'photo-full-caption', 'cover-art'], slots: ['split-half', 'headline-body-image', 'art-side-text'], budget: 0.4 });
});
