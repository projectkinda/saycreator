// Round V part 2: a smarter fill default. When the person has not set a focus point, the narrowest part a fill may keep (60% of the cut axis) is centred on the photo's saliency box (held
// inside the photo) instead of on the photo's middle, and a photo that fills is drawn at that centre. A focus point the person set (fs=1, or any non-default value in an older reference) is kept
// exactly as before. The "Fill the slide" switch overrides either way. The choice depends on the photo alone: the same in every style. ZERO model calls; pictures made in the page.
import { expect, test, type Page } from '@playwright/test';

const makePeople = (page: Page) => page.evaluate(() => {
  const fig = (g: CanvasRenderingContext2D, cx: number, cy: number, s: number, shirt: string) => {
    g.fillStyle = shirt; g.beginPath(); g.ellipse(cx, cy + 2.2 * s, 1.2 * s, 1.8 * s, 0, 0, 7); g.fill();
    g.fillStyle = '#c68b62'; g.beginPath(); g.arc(cx, cy, 0.75 * s, 0, 7); g.fill();
    g.fillStyle = '#2b1d14'; g.beginPath(); g.arc(cx, cy - 0.35 * s, 0.7 * s, Math.PI, 0); g.fill();
  };
  const wall = () => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 960; const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 960); gr.addColorStop(0, '#d9d4cc'); gr.addColorStop(1, '#bdb6aa'); g.fillStyle = gr; g.fillRect(0, 0, 1280, 960);
    return { c, g };
  };
  const group = wall(); ['#c0392b', '#2471a3', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22'].forEach((col, i) => fig(group.g, 110 + i * 212, 380, 70, col));
  const off = wall(); fig(off.g, 1000, 360, 110, '#c0392b');
  return { group: group.c.toDataURL('image/jpeg', 0.92), offcentre: off.c.toDataURL('image/jpeg', 0.92) };
});

const DRAW = `(async ({ pics, id, q, styleId, overrides }) => {
  const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts'); const FA = await import('/src/reference/faithful.ts');
  const FS = await import('/src/carousel/layouts/fillSlide.ts');
  const fonts = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
  FA.setPictureResolver(async (ref) => pics[ref.slice(8).split('#')[0]] ?? null);
  FS.setFillOverrides(overrides ?? []);
  const { style } = DL.styleFromPack(PR.presetPackFor(styleId, false, null));
  const ref = 'picture:' + id + '#w=1280&h=960&' + q + '&z=1&k=p';
  const d = await DL.drawOne({ layout: 'title-over-photo', fields: { headline: 'Met some wonderful people there.', image: ref }, accents: [] }, 0, style, { handle: '@saycreator', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal', ground: 0 });
  FS.setFillOverrides([]);
  const svg = d.built.svg;
  // the photo's own image (clipped to its slot, not the dissolve's mirrors): its x tells where the crop is centred
  const m = /<image href="picture:[^"]*" x="(-?[\\d.]+)" y="(-?[\\d.]+)" width="([\\d.]+)" height="([\\d.]+)" preserveAspectRatio="none" (clip-path|mask)=/.exec(svg);
  return { fills: d.built.fills ?? null, img: m ? { x: +m[1], w: +m[3], how: m[5] } : null, mirrored: svg.includes('matrix(1 0 0 -1') };
})`;
const draw = (page: Page, a: Record<string, unknown>) => page.evaluate(`${DRAW}(${JSON.stringify(a)})`) as Promise<any>;

test('V2a a subject off-centre now fills, with the kept part centred on it; the same photo with a focus point set at the middle stays whole (as in part 1)', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makePeople(page);
  const before = await draw(page, { pics, id: 'offcentre', q: 'fx=0.5&fy=0.5&fs=1', styleId: 'style-1' });
  expect(before.fills[0]).toMatchObject({ fill: false, why: 'subject-cut' });
  expect(before.mirrored).toBe(true);
  const after = await draw(page, { pics, id: 'offcentre', q: 'fx=0.5&fy=0.5', styleId: 'style-1' });
  expect(after.fills[0]).toMatchObject({ fill: true, why: 'fills', auto: true });
  expect(after.fills[0].inside).toBeGreaterThanOrEqual(0.9);
  expect(after.mirrored).toBe(false);
  // drawn as a cover crop of the whole slide (1800 px wide for a 4:3 photo at 1350 high), shifted to the subject on the right: further left than the centred crop (x = -360)
  expect(after.img.how).toBe('clip-path');
  expect(after.img.w).toBeCloseTo(1800, 0);
  expect(after.img.x).toBeLessThan(-500);
  // the same choice in another style (it depends on the photo alone)
  const s3 = await draw(page, { pics, id: 'offcentre', q: 'fx=0.5&fy=0.5', styleId: 'style-3' });
  expect(s3.fills[0]).toMatchObject({ fill: true, inside: after.fills[0].inside, cut: after.fills[0].cut });
});

test('V2b a group across the frame still stays whole (no window keeps 90% of it)', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makePeople(page);
  for (const styleId of ['style-1', 'style-3']) {
    const g = await draw(page, { pics, id: 'group', q: 'fx=0.5&fy=0.5', styleId });
    expect(g.fills[0], styleId).toMatchObject({ fill: false, why: 'subject-cut' });
    expect(g.fills[0].inside, styleId).toBeLessThan(0.9);
    expect(g.mirrored, styleId).toBe(true);
  }
});

test('V2c the switch and a focus point the person set win: off keeps the off-centre photo whole; on fills the group; a set focus point is kept exactly, never moved to the subject', async ({ page }) => {
  await page.goto('/images/carousel');
  const pics = await makePeople(page);
  const off = await draw(page, { pics, id: 'offcentre', q: 'fx=0.5&fy=0.5', styleId: 'style-1', overrides: [['offcentre', 'off']] });
  expect(off.fills[0]).toMatchObject({ fill: false, why: 'off' });
  expect(off.mirrored).toBe(true);
  const on = await draw(page, { pics, id: 'group', q: 'fx=0.5&fy=0.5', styleId: 'style-1', overrides: [['group', 'on']] });
  expect(on.fills[0]).toMatchObject({ fill: true, why: 'on' });
  // a focus point set on the left (fx 0.3, not a default): the window stays there, so the subject on the right is cut and the photo stays whole
  const pinned = await draw(page, { pics, id: 'offcentre', q: 'fx=0.3&fy=0.5', styleId: 'style-1' });
  expect(pinned.fills[0]).toMatchObject({ fill: false, why: 'subject-cut' });
  expect(pinned.fills[0].auto).toBeUndefined();
  // switched on with that focus point: drawn at the person's focus point (x = 540 - 0.3 x 1800 = 0), not moved to the subject
  const pinnedOn = await draw(page, { pics, id: 'offcentre', q: 'fx=0.3&fy=0.5', styleId: 'style-1', overrides: [['offcentre', 'on']] });
  expect(pinnedOn.fills[0]).toMatchObject({ fill: true, why: 'on' });
  expect(pinnedOn.img.x).toBeCloseTo(0, 0);
  // the picture editor writes the focus point as the person's (fs=1); parseRef reads a non-default focus point as set too
  const refs = await page.evaluate(async () => {
    const IM: any = await import('/src/carousel/layouts/images.ts');
    return {
      edited: IM.withCrop('picture:p#w=1280&h=960&fx=0.5&fy=0.5&z=1&k=p', { fx: 0.5, fy: 0.5 }),
      zoomOnly: IM.withCrop('picture:p#w=1280&h=960&fx=0.5&fy=0.5&z=1&k=p', { z: 1.5 }),
      plain: IM.parseRef('picture:p#w=1280&h=960&fx=0.5&fy=0.5&z=1&k=p').focusSet ?? false,
      tall: IM.parseRef('picture:p#w=600&h=1600&fx=0.5&fy=0.1&z=1&k=p').focusSet ?? false,
      moved: IM.parseRef('picture:p#w=1280&h=960&fx=0.62&fy=0.5&z=1&k=p').focusSet ?? false,
    };
  });
  expect(refs.edited).toContain('&fs=1');
  expect(refs.zoomOnly).not.toContain('&fs=1');
  expect([refs.plain, refs.tall, refs.moved]).toEqual([false, false, true]);
});
