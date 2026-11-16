// Round R part 2: a picture layout may take 3 slides (not 2) when the person added 4 or more photos (screenshots do not count); never two slides in a row still holds; every other layout keeps
// its cap of 2. A FAKE writer: ZERO real model calls.
import { expect, test } from '@playwright/test';

test.setTimeout(4 * 60_000);
const TEXT = "Had a wonderful blast at the Hyderabad event. Thank you Punit Chawla for the crazy day man. Met some wonderful people there. And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun. Looking forward for some more of these going forward. And also don't you forget man Punit Chawla";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
// the writer puts title-over-photo on 3 slides, never two in a row
const PLAN3 = { title: 'Hyderabad event', slides: [
  S('title-over-photo', { headline: 'Had a wonderful blast at the Hyderabad event.' }),
  S('lead-statement', { lead: 'Thank you Punit Chawla', headline: 'for the crazy day man.' }),
  S('title-over-photo', { headline: 'Met some wonderful people there.' }),
  S('prose', { p1: 'And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun.' }),
  S('title-over-photo', { headline: 'Looking forward for some more of these.' }),
  S('statement-card', { headline: "And also don't you forget man Punit Chawla." }),
  S('cta-button', { headline: 'Looking forward for some more of these going forward.', button: 'Follow for more' }),
] };

test('R2: the cap is 3 with 4 or more photos (screenshots not counted), 2 otherwise; never two in a row; other layouts keep 2', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async ({ TEXT, PLAN3 }) => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    // the same module instances the app uses (the dev server adds a version to a module it reloaded)
    const url = (p: string) => performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes(p)) ?? p;
    const IM: any = await import(url('/src/carousel/layouts/images.ts'));
    const PK: any = await import(url('/src/carousel/layouts/pick.ts'));
    const PR: any = await import('/src/carousel/presets.ts');
    const FA: any = await import('/src/reference/faithful.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const photo = (id: string) => ({ id, width: 1280, height: 960, content: 'photo' });
    const shot = (id: string) => ({ id, width: 1600, height: 1000, content: 'screenshot' });
    const caps = { four: IM.pictureLayoutCap(['a', 'b', 'c', 'd'].map(photo)), three: IM.pictureLayoutCap(['a', 'b', 'c'].map(photo)), threeAndShots: IM.pictureLayoutCap([...['a', 'b', 'c'].map(photo), shot('s1'), shot('s2')]), none: IM.pictureLayoutCap(undefined) };
    const rot = (ids: string[], cap: number) => PK.rotateVariants(ids.map((layout) => ({ layout })), { photo: true, pictureCap: cap }).map((x: any) => x.layout);
    const three = ['title-over-photo', 'lead-statement', 'title-over-photo', 'prose', 'title-over-photo', 'statement-card', 'cta-button'];
    const inRow = ['title-over-photo', 'title-over-photo', 'prose', 'statement', 'cta-button'];
    const textThree = ['statement', 'prose', 'statement', 'prose', 'statement', 'split-text', 'cta-button'];
    const data: Record<string, string> = {};
    const pic = (i: number) => { const c = document.createElement('canvas'); c.width = 1280; c.height = 960; const g = c.getContext('2d')!; g.fillStyle = `hsl(${i * 60},40%,40%)`; g.fillRect(0, 0, 1280, 960); g.fillStyle = '#ddd'; g.fillRect(200, 200, 400, 300); return c.toDataURL('image/jpeg', 0.9); };
    FA.setPictureResolver(async (ref: string) => data[ref.slice('picture:'.length).split('#')[0]] ?? null);
    const deck = async (n: number) => {
      const images = Array.from({ length: n }, (_, i) => { data['c' + i] = pic(i); return photo('c' + i); });
      let calls = 0;
      const p = { id: 'fake', write: async () => { calls++; return { text: JSON.stringify(PLAN3), ms: 5 }; } };
      const out = await DL.designLibraryDeck({ text: TEXT, slides: 7, tone: 'clear', format: 'carousel', keepEverySentence: true }, { pack: PR.presetPackFor('style-1', false, null), hasPhoto: true, images, site: '' }, '@saycreator', p, new AbortController().signal);
      const specs = out.designed.library.plan.specs;
      return { calls, layouts: specs.map((s: any) => s.layout), withPicture: specs.filter((s: any) => /picture:/.test(JSON.stringify(s.fields))).length };
    };
    return { caps, cap2: rot(three, 2), cap3: rot(three, 3), inRow3: rot(inRow, 3), text3: rot(textThree, 3), four: await deck(4), three: await deck(3) };
  }, { TEXT, PLAN3 });
  expect(r.caps).toEqual({ four: 3, three: 2, threeAndShots: 2, none: 2 });
  // cap 2: the third title-over-photo is replaced; cap 3: it stays
  expect(r.cap2.filter((l: string) => l === 'title-over-photo').length).toBe(2);
  expect(r.cap3.filter((l: string) => l === 'title-over-photo').length).toBe(3);
  // never two in a row, with any cap
  expect(r.inRow3[1]).not.toBe('title-over-photo');
  // a text layout keeps its cap of 2 (statement three times: the third is replaced)
  expect(r.text3.filter((l: string) => l === 'statement').length).toBe(2);
  // the deck with 4 photos keeps the writer's three title-over-photo slides, one writer call, every photo on a slide
  expect(r.four.calls).toBe(1);
  expect(r.four.layouts.filter((l: string) => l === 'title-over-photo').length).toBe(3);
  expect(r.four.withPicture).toBe(4);
  for (let i = 1; i < r.four.layouts.length; i++) expect(r.four.layouts[i] === 'title-over-photo' && r.four.layouts[i - 1] === 'title-over-photo').toBe(false);
  // with 3 photos the cap stays 2: the deck never shows title-over-photo three times
  expect(r.three.layouts.filter((l: string) => l === 'title-over-photo').length).toBeLessThanOrEqual(2);
});
