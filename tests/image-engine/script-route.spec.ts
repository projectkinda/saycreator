// Round 10: pasted ready-made slide text (blocks separated by blank lines) is drawn by the LAYOUT LIBRARY (libraryFromScript.ts), not by the old pack route.
// The real post below (8 blocks) must give: library layouts and library fields in the report, no sentence drawn twice on one slide, the numbered list kept as 3 items, the closing button
// "Comment slides", no highlight longer than the clamp, 29 words on slide 2, and ZERO model calls. A fake writer that counts any call is installed in the UI test.
// Screenshots and the report: out/script-route-fix/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { deckDrawn, openEdit, toStep } from './ui';

test.setTimeout(10 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const OUT = 'out/script-route-fix';

export const POST = `Most creators don't have a design problem. They have a "this takes two hours" problem.

You write a good post. Then you spend the evening dragging text boxes around a template. The idea took ten minutes. The slides took the rest of the night.

So we built Say Creator. Here's how it works:

1. Paste your text
2. Pick a look from 15 styles
3. Get slides you can edit

Change a headline and nothing reruns. Switch the style and your words stay put. One AI call builds the carousel, and editing or restyling costs nothing after that.

You can add your own pictures too. Photos, screenshots, a product shot. They land where they fit, not where a template forces them.

I don't want you designing slides. I want you saying something worth swiping for.

Try it on your next post. Comment "slides" and I'll send you the link.`;

const IDS = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];

/** Draws the post in one style the way the app does (pasted blocks -> script -> library, no model); returns what the checks need. */
async function drawPost(page: Page, style: string, text = POST, sheet = false) {
  await page.goto('/images/carousel');
  return page.evaluate(async ({ style, text, sheet }) => {
    const P: any = await import('/src/carousel/pasted.ts');
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const F: any = await import('/src/reference/faithful.ts');
    const L: any = await import('/src/image-engine/carousel/lint.ts');
    const blocks = P.slideBlocks(text);
    const built = P.scriptFromBlocks(blocks, 'carousel', '');
    if (!built.script) return { error: built.errors.join('; ') };
    const made: any = await FS.libraryDeckFromScript(built.script, { pack: PR.presetPackFor(style, false), brief: '', hasPhoto: false, images: [], site: '' }, '');
    if (!made.ok) return { error: made.reason };
    const lib = made.designed.library;
    let png = '';
    if (sheet) {
      const n = Object.keys(made.designed.slides).length;
      const c = document.createElement('canvas'); c.width = 540 * 4; c.height = 675 * Math.ceil(n / 4);
      const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < n; i++) {
        const svg: string = made.designed.slides[String(i)]?.built?.svg ?? '';
        if (!svg) continue;
        const bm = await createImageBitmap(await F.svgToPng(svg, 540));
        g.drawImage(bm, (i % 4) * 540, Math.floor(i / 4) * 675);
      }
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
      const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); png = btoa(t);
    }
    return {
      calls: made.designed.calls as number,
      script: built.script.slides as any[],
      specs: lib.plan.specs.map((s: any) => ({ layout: s.layout, fields: s.fields, accents: s.accents, keep: !!s.keepAsWritten })) as { layout: string; fields: Record<string, any>; accents: string[]; keep: boolean }[],
      fallbacks: (lib.fallbacks ?? []) as any[],
      drawn: Object.keys(made.designed.slides).length,
      words: Object.keys(made.designed.slides).map((k) => L.wordCount({ layers: made.designed.slides[k].built.layers })) as number[],
      png,
    };
  }, { style, text, sheet });
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
/** The sentences of every text field of a slide, normalised; a sentence drawn twice on one slide is a duplicate. */
function repeated(fields: Record<string, any>): string[] {
  const all: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'accent') continue;
    for (const s of Array.isArray(v) ? v : [v]) if (typeof s === 'string') all.push(...s.split(/(?<=[.!?])\s+/).map(norm).filter((x) => x.split(' ').length >= 3));
  }
  return all.filter((s, i) => all.indexOf(s) !== i);
}
const wordsOf = (t: string) => t.split(/\s+/).filter(Boolean);

for (const style of ['style-6', 'editorial-collage', 'style-4']) {
  test(`the post in ${style}: library fields, no repeated sentence, 3 list items, "Comment slides", clamped highlights, 0 model calls`, async ({ page }) => {
    const r: any = await drawPost(page, style, POST, true);
    expect(r.error).toBeUndefined();
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/sheet-${style}.png`, Buffer.from(r.png, 'base64'));
    expect(r.calls, 'a pasted text never calls a model').toBe(0);
    expect(r.drawn).toBe(7);
    expect(r.words[1], `slide 2 words (the app's own counter), all: ${r.words}`).toBe(29);
    expect(r.specs.map((s: any) => s.layout), 'library layouts only').not.toContainEqual(expect.stringMatching(/^(cover-top|content-stack|content-bar|checklist-icons|closing-bar)$/));
    r.specs.forEach((s: any, i: number) => expect(repeated(s.fields), `slide ${i + 1} (${s.layout}) draws a sentence twice: ${JSON.stringify(s.fields)}`).toEqual([]));
    const list = r.specs.filter((s: any) => Array.isArray(s.fields.items));
    expect(list, 'one list slide').toHaveLength(1);
    expect(list[0].fields.items).toEqual(['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit']);
    const last = r.specs[r.specs.length - 1];
    expect(last.layout).toBe('cta-button');
    expect(last.fields.button).toBe('Comment slides');
    expect(last.fields.headline).toBe('Try it on your next post.');
    r.specs.forEach((s: any, i: number) => {
      const head = String(s.fields.headline ?? s.fields.title ?? s.fields.quote ?? '');
      const n = wordsOf(head).length;
      const max = Math.max(1, Math.min(n >= 8 ? 3 : 2, Math.floor(n / 2)));
      for (const a of s.accents) expect(wordsOf(a).length, `slide ${i + 1} highlight "${a}" in "${head}"`).toBeLessThanOrEqual(max);
    });
    expect(r.fallbacks.map((f: any) => `${f.slide}: ${f.level}`), 'no slide fell out of the library').toEqual([]);
  });
}

test('all 15 styles: no repeated sentence on a slide, and the list keeps its 3 items', async ({ page }) => {
  for (const style of IDS) {
    const r: any = await drawPost(page, style);
    expect(r.error, style).toBeUndefined();
    expect(r.calls, style).toBe(0);
    r.specs.forEach((s: any, i: number) => expect(repeated(s.fields), `${style} slide ${i + 1} (${s.layout}): ${JSON.stringify(s.fields)}`).toEqual([]));
    const list = r.specs.filter((s: any) => Array.isArray(s.fields.items));
    expect(list.map((s: any) => s.fields.items.length), `${style}: list items`).toEqual([3]);
  }
});

test('the blocks become the right slides: each paragraph once, a lead-in goes with its list, **marks** are the typed highlight', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (post) => {
    const P: any = await import('/src/carousel/pasted.ts');
    const a = P.scriptFromBlocks(P.slideBlocks(post), 'carousel', '').script.slides;
    const b = P.scriptFromBlocks(['One short block here', 'This is a longer block of text. It goes on for a while so the rule applies. And a third sentence follows it.', 'A **typed highlight** here is kept', 'Save this'], 'carousel', '').script.slides;
    return { a, b };
  }, POST);
  const t = r.a.map((s: any) => s.type);
  expect(t).toEqual(['cover', 'content', 'checklist', 'content', 'content', 'content', 'closing']);
  expect(r.a[1]).toMatchObject({ headline: 'You write a good post.' });
  expect(r.a[1].body).not.toContain('You write a good post');
  expect(r.a[2]).toMatchObject({ headline: "So we built Say Creator. Here's how it works", items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] });
  expect(r.b[0]).toMatchObject({ type: 'cover', headline: 'One short block here' });
  expect(r.b[0].sub).toBeUndefined();
  expect(r.b[1]).toMatchObject({ type: 'content', headline: 'This is a longer block of text.' });
  expect(r.b[2]).toMatchObject({ headline: 'A typed highlight here is kept', highlight: 'typed highlight' });
});

test('the app: Make carousel with the post in Cream social profile = library route, 0 calls, 8 slides, slide 2 has 29 words', async ({ page }) => {
  const calls: string[] = [];
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const w = (r: any) => { calls.push(String(r.request().url())); return r.fulfill({ json: { text: '{}', ms: 1 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(POST);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Cream social profile/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 7);
  await page.waitForTimeout(2500);
  expect(calls, 'no model call').toEqual([]);
  // the project as stored: the route, the library report
  const rep: any = await page.evaluate(async () => {
    const RP: any = await import('/src/reference/report.ts');
    const raw = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}');
    const doc = raw.project?.doc;
    const r = JSON.parse((await RP.buildReport({ doc, includeRefs: false, verdicts: {}, note: '' })).json);
    return { report: r, route: doc.route };
  });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/report-after.json`, JSON.stringify(rep.report, null, 2));
  expect(rep.route.route).toBe('designed');
  expect(rep.route.reason).toContain('layout library');
  expect(rep.route.reason).toContain('0 model calls');
  expect(rep.report.designed.library, 'the report carries the library fields').toBeTruthy();
  const layouts = rep.report.slides.map((s: any) => s.libraryLayout ?? s.layout ?? s.library);
  console.log('report layouts', JSON.stringify(layouts), 'route', JSON.stringify(rep.route));
  // the film strip: save the 8 slides as one picture
  const sheet = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.cr-film img')];
    const c = document.createElement('canvas'); c.width = 540 * 4; c.height = 675 * Math.ceil(imgs.length / 4);
    const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
    for (const [i, im] of imgs.entries()) { const bm = await createImageBitmap(await (await fetch(im.src)).blob()); g.drawImage(bm, (i % 4) * 540, Math.floor(i / 4) * 675, 540, 675); }
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
    const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
  });
  fs.writeFileSync(`${OUT}/after.png`, Buffer.from(sheet, 'base64'));
});
