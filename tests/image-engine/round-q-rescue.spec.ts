// Round Q part 1: every unused picture gets a second chance (pictureRescue.ts), measured on the slides as drawn, ZERO model calls.
//  - a 7-slide plan with an empty picture slot (image-row: a headline, a subline and a paragraph that no portrait photo fits) and a portrait photo left over: after placement no picture
//    layout's slot is empty while a picture that fits is unused (the slide moves to a sibling layout that carries the same words);
//  - a slide whose layout the person chose and a slide whose picture they set to None never change; no word is lost;
//  - a screenshot is never put under text or on the cover.
import { expect, test } from '@playwright/test';

test('Q1: the empty picture slot gets the left-over portrait photo, every word kept; the person\'s choices stay; a screenshot never goes under text or on the cover', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const IP: any = await import('/src/carousel/imagePlace.ts');
    const PP: any = await import('/src/carousel/picturePass.ts');
    const IM: any = await import('/src/carousel/layouts/images.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const P = (id: string, w: number, h: number, label: string, content = 'photo') => ({ id, width: w, height: h, content, label });
    const images = [P('sky', 960, 1280, 'sky and tower'), P('moto', 960, 1280, 'motorbike on the street'), P('sun', 960, 1280, 'sun rays through palms'), P('tree', 1225, 1600, 'tree-lined road')];
    const ref = (p: any) => IM.makeRef({ id: p.id, w: p.width, h: p.height, photo: true });
    const look = { pack: PR.presetPackFor('editorial-collage', false, null), hasPhoto: true, images, site: '' };
    const style = DL.styleFromPack(look.pack).style;
    const specs = [
      { layout: 'title-over-photo', fields: { headline: "Most creators don't have a design problem.", line: 'They have a "this takes two hours" problem.', image: ref(images[3]) }, accents: [], named: 'tree' },
      { layout: 'prose', fields: { p1: 'You write a good post. Then you spend the evening dragging text boxes around a template.' }, accents: [], pin: { layout: true } },
      { layout: 'stepper', fields: { title: "Here's how it works", steps: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: [] },
      { layout: 'title-over-photo', fields: { headline: 'Change a headline and nothing reruns.', line: 'Switch the style and your words stay put.', image: ref(images[0]) }, accents: [], named: 'sky' },
      { layout: 'image-row', fields: { headline: 'You can add your own pictures too.', subline: 'Photos, screenshots, a product shot.', paragraph: 'They land where they fit, not where a template forces them.' }, accents: [] },
      { layout: 'prose', fields: { p1: "One AI call builds the carousel. I don't want you designing slides.", pull: 'I want you saying something worth swiping for.' }, accents: [], pin: { picture: 'none' } },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'Comment "slides" and I\'ll send you the link.' }, accents: [] },
    ];
    const rs = await DL.applyPictureRescue(specs, look, style, '@x');
    const after = IP.placeImages(rs.specs, DL.deckRotation(rs.specs, look, style).variants, images);
    // a screenshot left over: never under text (title-over-photo), never the cover
    const shots = [{ id: 'shot', width: 1440, height: 900, content: 'screenshot' }];
    const look2 = { ...look, images: shots };
    const specs2 = [
      { layout: 'statement', fields: { headline: 'Look at this' }, accents: [] },
      { layout: 'statement', fields: { headline: 'The settings page', caption: 'Everything in one place.' }, accents: [] },
      { layout: 'split-text', fields: { headline: 'Then you save', paragraph: 'It keeps your choices.' }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Try it today', button: 'Follow for more' }, accents: [] },
    ];
    const rs2 = await DL.applyPictureRescue(specs2, look2, style, '@x');
    return {
      layouts: after.map((s: any) => s.layout),
      pics: after.map((s: any) => IP.usedIds(s.fields)),
      empty: after.map((s: any, i: number) => ((IM.IMAGE_LAYOUT_IDS as string[]).includes(s.layout) && !IP.usedIds(s.fields).length ? i + 1 : null)).filter(Boolean),
      lost: specs.map((s: any, i: number) => (PP.keepsText(IP.withoutImages(s.fields), after[i].fields) ? null : i + 1)).filter(Boolean),
      rows: rs.rows.map((x: any) => ({ picture: x.picture, slide: x.slide, layout: x.layout, fit: x.fit, why: x.why })),
      pinnedLayout: after[1], pinnedNone: after[5],
      shot: rs2.specs.map((s: any, i: number) => ({ i, layout: s.layout, pics: IP.usedIds(s.fields) })),
    };
  });
  // the empty slot of slide 5 holds the motorbike now, in a layout that carries every word
  expect(r.pics[4], JSON.stringify(r.rows)).toEqual(['moto']);
  expect(r.layouts[4]).not.toBe('image-row');
  const row = r.rows.find((x: any) => x.picture === 'moto');
  expect(row.fit.whole ? row.fit.slotShare >= 0.55 : row.fit.crop <= 0.25).toBe(true);
  // no picture layout is left with an empty slot
  expect(r.empty).toEqual([]);
  expect(r.lost).toEqual([]);
  // the person's choices
  expect(r.pinnedLayout.layout).toBe('prose');
  expect(r.pinnedLayout.pin).toEqual({ layout: true });
  expect(r.pinnedNone.layout).toBe('prose');
  expect(r.pinnedNone.pin.picture).toBe('none');
  expect(r.pics[5]).toEqual([]);
  // never the closing slide, never a second picture on a slide
  expect(r.pics[6]).toEqual([]);
  for (const p of r.pics) expect(p.length).toBeLessThanOrEqual(1);
  // a picture with no good home stays unused, said so
  for (const x of r.rows.filter((q: any) => q.slide === null)) expect(x.why).toMatch(/stays unused/);
  // the screenshot: never the cover, never under text
  const s = r.shot.find((x: any) => x.pics.includes('shot'));
  if (s) {
    expect(s.i).toBeGreaterThan(0);
    expect(s.layout).not.toBe('title-over-photo');
  }
});
