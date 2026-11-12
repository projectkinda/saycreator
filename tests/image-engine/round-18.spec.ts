// Round 18: pictures with numbers and names. A. the Content step (numbers, "What is this?", saved with the project) and the Slides-step picker (bigger thumbnails, badges, the line under the row,
// plain words, no layout id in any visible text); B. the writer is told the names (and its choice is kept only when the rules allow it); C. the code places named pictures by words (no writer, no
// extra call); D. the cases below. A FAKE writer that counts every call: ZERO real model calls.
// Output: out/round-18/ (content-step-names.png, picker-bigger.png, messages.png, named-deck.png)
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { deckDrawn, openEdit, toStep } from './ui';

test.setTimeout(10 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const OUT = 'out/round-18';

// the real sizes of the four pictures of the Say Creator post: a text box, a style step, a phone, a slides step
const SIZES: [string, number, number][] = [['text-box.png', 609, 757], ['style-step.png', 1402, 1313], ['phone.png', 1107, 2400], ['slides-step.png', 2400, 1230]];
const NAMES = ['text box', 'style step', 'phone', 'slides step'];
const PARAS = [
  "Most creators don't have a design problem.",
  'You write a good post. Then the evening goes to dragging text boxes.',
  'Pick a look from 15 styles.',
  'Paste your text and get slides you can edit.',
  'Change a headline and nothing reruns.',
  'Post it straight from your phone.',
  'Try it on your next post.',
];
const POST = PARAS.join('\n\n');
const WRITER_PLAN = { title: 'Say Creator', slides: [
  { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
  { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }, accents: [] },
  { layout: 'numbered-list', fields: { title: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: [] },
  { layout: 'headline-card', fields: { headline: 'Change a headline and nothing reruns.', card: 'Switch the style and your words stay put.' }, accents: [] },
  { layout: 'statement-card', fields: { headline: 'Post it straight from your phone.' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'I want you saying something', paragraph: 'Something worth swiping for.' }, accents: [] },
  { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." }, accents: [] },
] };

type Rig = { calls: number; bodies: string[] };
async function rig(page: Page, plan: unknown = WRITER_PLAN): Promise<Rig> {
  const r: Rig = { calls: 0, bodies: [] };
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  const w = (x: any) => { r.calls++; r.bodies.push(x.request().postData() ?? ''); return x.fulfill({ json: { text: JSON.stringify(plan), ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  return r;
}
/** Four synthetic pictures at the real sizes: blocks of flat colour with text-like bars (a screenshot, by the safe-by-default rule). */
async function addPictures(page: Page, sizes = SIZES) {
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (const [name, w, h] of sizes) {
    const b64 = await page.evaluate(async ({ w, h, name }) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1f3a5f'; g.fillRect(0, 0, w, Math.round(h * 0.08));
      g.fillStyle = '#d9d4c7'; for (let y = Math.round(h * 0.14); y < h * 0.95; y += Math.round(h * 0.07)) g.fillRect(Math.round(w * 0.08), y, Math.round(w * (0.5 + 0.3 * ((y / h) % 0.3))), Math.round(h * 0.03));
      g.fillStyle = '#b4452b'; g.font = `bold ${Math.round(h * 0.05)}px sans-serif`; g.fillText(name.replace('.png', ''), Math.round(w * 0.08), Math.round(h * 0.12));
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png')); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
    }, { w, h, name });
    files.push({ name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  }
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(files.length, { timeout: 60_000 });
}
async function nameThem(page: Page, names: string[]) {
  for (let i = 0; i < names.length; i++) await page.getByTestId(`image-${i}-label`).fill(names[i]);
}
async function makeParagraphDeck(page: Page, names: string[] | null, text = POST, n = 7) {
  await page.goto('/images/carousel');
  await page.evaluate(() => localStorage.removeItem('creator.carousel.project.v1')); // a second deck in the same test starts from an empty project
  await page.reload();
  await addPictures(page);
  if (names) await nameThem(page, names);
  await page.getByLabel('Your text or topic').fill(text);
  await page.getByTestId('text-mode').getByRole('radio', { name: /Use my paragraphs as slides/ }).check();
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, n);
  await page.waitForTimeout(800);
}
const doc = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
const picIds = (s: any) => Object.entries(s.fields).filter(([k]) => /^image\d?$/.test(k)).map(([, v]) => /^picture:([^#]+)#/.exec(String(v))?.[1]).filter(Boolean) as string[];
const textWords = (s: any) => (JSON.stringify(Object.entries(s.fields).filter(([k]) => !/^image\d?$/.test(k)).map(([, v]) => v)).toLowerCase().match(/[a-z0-9']+/g) ?? []);
/** Which slide (1-based) each picture (1-based) is on. */
const whereOf = (d: any) => {
  const photos: string[] = d.photos.filter((p: any) => p.kind === 'photo').map((p: any) => p.id);
  const out: Record<number, number[]> = {};
  (d.designed.library.plan.specs as any[]).forEach((s, i) => picIds(s).forEach((id) => { const k = photos.indexOf(id) + 1; (out[k] ??= []).push(i + 1); }));
  return { photos, out };
};

test('C: stemming and scoring: "style" matches "styles", "edit" matches "editing"; stop words and punctuation do not count', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const N: any = await import('/src/carousel/pictureNames.ts');
    return {
      styleStyles: N.nameScore('style', 'Pick a look from 15 styles.'),
      editEditing: N.nameScore('edit', 'We are editing it now'),
      editsEdited: N.nameScore('edits', 'She edited the text'),
      none: N.nameScore('phone', 'Pick a look from 15 styles.'),
      two: N.nameScore('text box', 'dragging text boxes'),
      punct: N.nameScore('STYLE, step!', 'a Styles; step.'),
      stop: N.nameScore('the of', 'the of'),
      empty: N.nameScore('', 'anything'),
    };
  });
  expect(r).toEqual({ styleStyles: 1, editEditing: 1, editsEdited: 1, none: 0, two: 2, punct: 2, stop: 0, empty: 0 });
});

test('A: the Content step: a number and a "What is this?" box on every picture, 40 characters at most, saved with the project and back after a reload', async ({ page }) => {
  await rig(page);
  await page.goto('/images/carousel');
  await addPictures(page);
  await expect(page.getByTestId('images-name-hint')).toContainText('pick a look');
  for (let i = 0; i < 4; i++) {
    await expect(page.getByTestId(`image-${i}`).getByTestId('thumb-num')).toHaveText(String(i + 1));
    await expect(page.getByTestId(`image-${i}-label`)).toHaveAttribute('placeholder', 'What is this?');
  }
  await page.getByTestId('image-1-label').fill('x'.repeat(60));
  expect((await page.getByTestId('image-1-label').inputValue()).length).toBe(40);
  await nameThem(page, NAMES);
  // the thumbnails: at least 96 x 120, each in its own shape (the box is the same height, the picture inside is never squashed)
  const boxes = await page.getByTestId('thumb-box').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); const im = e.querySelector('img')!; return { w: r.width, h: r.height, fit: getComputedStyle(im).objectFit, nat: im.naturalWidth / im.naturalHeight, shown: im.getBoundingClientRect().width / im.getBoundingClientRect().height, box: r.width / r.height }; }));
  for (const b of boxes) { expect(b.w).toBeGreaterThanOrEqual(96); expect(b.h).toBeGreaterThanOrEqual(120); expect(b.fit).toBe('contain'); }
  await page.waitForTimeout(1200);
  const d0 = await doc(page);
  expect(d0.photos.map((p: any) => p.label)).toEqual(NAMES);
  await page.reload();
  for (let i = 0; i < 4; i++) await expect(page.getByTestId(`image-${i}-label`)).toHaveValue(NAMES[i]);
  fs.mkdirSync(OUT, { recursive: true });
  await page.getByTestId('images-field').screenshot({ path: `${OUT}/content-step-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const ph = await page.getByTestId('thumb-box').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  for (const w of ph) expect(w).toBeGreaterThanOrEqual(140);
  const inputs = await page.locator('[data-testid$="-label"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of inputs) expect(h).toBeGreaterThanOrEqual(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll at 390 px').toBe(true);
  await page.getByTestId('images-field').screenshot({ path: `${OUT}/content-step-phone.png` });
});

test('C+D: the paragraphs route: pictures named "text box", "style step", "phone", "slides step" land on the slides with those words; every word kept; ZERO writer calls', async ({ page }) => {
  const r = await rig(page, { title: 'unused', slides: [] });
  await makeParagraphDeck(page, NAMES);
  expect(r.calls, 'the paragraphs route makes no writer call').toBe(0);
  const d = await doc(page);
  const { out } = whereOf(d);
  const specs = d.designed.library.plan.specs as any[];
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/named-deck-where.json`, JSON.stringify({ out, layouts: specs.map((s, i) => `${i + 1}: ${s.layout}${s.named ? ' (named)' : ''}`), swaps: d.designed.library.pictureSwaps }, null, 1));
  // the slide that holds each paragraph
  const slideWith = (re: RegExp) => specs.findIndex((s) => re.test(JSON.stringify(Object.values(s.fields))));
  expect(out[1], 'text box').toEqual([slideWith(/text boxes/) + 1]);
  expect(out[2], 'style step').toEqual([slideWith(/15 styles/) + 1]);
  expect(out[3], 'phone').toEqual([slideWith(/your phone/) + 1]);
  expect(out[4], 'slides step').toEqual([slideWith(/get slides/) + 1]);
  // every word of the post is still on a slide
  const all = specs.flatMap(textWords);
  for (const w of POST.toLowerCase().match(/[a-z0-9']+/g)!) expect(all, `word "${w}" kept`).toContain(w);
  // a screenshot is never the cover and never under text
  expect(picIds(specs[0])).toEqual([]);
  for (const s of specs) expect(s.layout).not.toBe('title-over-photo');
  await page.waitForTimeout(500);
  expect(r.calls).toBe(0);
  // the sheet: every slide, with the picture it carries
  const photos = whereOf(d).photos;
  const tiles: { buf: Buffer; caption: string }[] = [];
  for (let k = 0; k < specs.length; k++) {
    await page.getByRole('button', { name: `Show slide ${k + 1}`, exact: true }).click();
    await page.waitForTimeout(500);
    const b64 = await page.evaluate(async () => { const img = document.querySelector('.cr-stage-pic img') as HTMLImageElement; const blob = await (await fetch(img.src)).blob(); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); });
    const ids = picIds(specs[k]).map((id) => photos.indexOf(id) + 1);
    tiles.push({ buf: Buffer.from(b64, 'base64'), caption: `Slide ${k + 1}${ids.length ? ' - picture ' + ids.map((n) => n + ' "' + NAMES[n - 1] + '"').join(', ') : ' - no picture'}` });
  }
  await sheet(page, tiles, `${OUT}/named-deck.png`, 'row', 4, 420);
});

test('D: no names: the plan is the same as with blank names (nothing changes for a project without names)', async ({ page }) => {
  await rig(page, { title: 'unused', slides: [] });
  await makeParagraphDeck(page, null);
  const a = await doc(page);
  await rig(page, { title: 'unused', slides: [] });
  await makeParagraphDeck(page, ['  ', '', ' ', '']);
  const b = await doc(page);
  const strip = (d: any) => JSON.stringify(d.designed.library.plan.specs.map((s: any) => ({ ...s, fields: Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, /^image/.test(k) ? String(v).replace(/picture:[^#]+/, 'picture:ID') : v])) })));
  expect(strip(b)).toBe(strip(a));
  expect(a.designed.library.plan.specs.some((s: any) => s.named)).toBe(false);
  // and the pass itself hands the very same specs back when no picture has a name
  const same = await page.evaluate(async () => {
    const N: any = await import('/src/carousel/pictureNames.ts');
    const specs = [{ layout: 'statement', fields: { headline: 'Hello styles' }, accents: [] }];
    return N.namePass(specs, { images: [{ id: 'a', width: 1000, height: 700 }] }).specs === specs;
  });
  expect(same).toBe(true);
});

test('B+D: the writer route: the prompt names the pictures and carries the name rule; the writer\'s choice is kept only when the rules allow it (a screenshot on the cover is refused, the code matches by words)', async ({ page }) => {
  // the fake writer puts picture 1 ("text box", a screenshot) on the COVER and picture 3 on a slide that has nothing to do with its name
  const plan = JSON.parse(JSON.stringify(WRITER_PLAN));
  plan.slides[0].picture = 1;
  plan.slides[3].picture = 3; // "phone" on "Change a headline and nothing reruns."
  const r = await rig(page, plan);
  await page.goto('/images/carousel');
  await addPictures(page);
  await nameThem(page, NAMES);
  await page.getByLabel('Your text or topic').fill('Most creators do not have a design problem. You write a good post. Then the evening goes to dragging text boxes. Pick a look from 15 styles. Paste your text and get slides you can edit. Post it straight from your phone.');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 7);
  await page.waitForTimeout(800);
  expect(r.calls).toBe(1);
  const body = r.bodies[0];
  expect(body).toContain('If a picture has a name, put it on the slide whose words it matches best');
  expect(body).toContain('Use each named picture at most once');
  expect(body).toContain('Never add words to a slide because of a picture name');
  expect(body).toContain('named \\"text box\\"');
  expect(body).toContain('named \\"style step\\"');
  const d = await doc(page);
  const { out } = whereOf(d);
  const specs = d.designed.library.plan.specs as any[];
  // the cover took no screenshot, though the writer asked for one there
  expect(picIds(specs[0])).toEqual([]);
  // every named picture is used at most once
  for (const k of Object.keys(out)) expect(out[+k].length, `picture ${k} used once`).toBe(1);
  // the writer's other suggestion ("phone" on the headline slide) was legal, so it is kept: picture 3 is on slide 4
  expect(out[3]).toEqual([4]);
  // no words were added by the names
  const all = JSON.stringify(specs.map((s) => s.fields)).toLowerCase();
  for (const n of NAMES) expect(all.includes(`"${n}"`), `the name "${n}" is not a slide text`).toBe(false);
});

/** Puts PNG buffers side by side (or one above the other) on one sheet, with a caption over each. */
async function sheet(page: Page, items: { buf: Buffer; caption: string }[], out: string, dir: 'row' | 'col' = 'row', cols = 0, tileW = 0) {
  const b64 = await page.evaluate(async ({ items, dir, cols, tileW }) => {
    const raw = await Promise.all(items.map(async (it) => createImageBitmap(await (await fetch('data:image/png;base64,' + it.b64)).blob())));
    const pad = 16, cap = 34;
    if (cols) {
      // a grid of tiles of equal width (the slides of a deck)
      const th = Math.round(Math.max(...raw.map((b) => (b.height * tileW) / b.width)));
      const rows = Math.ceil(raw.length / cols);
      const c2 = document.createElement('canvas'); c2.width = cols * (tileW + pad) + pad; c2.height = rows * (th + cap + pad) + pad;
      const g2 = c2.getContext('2d')!; g2.fillStyle = '#e9e6df'; g2.fillRect(0, 0, c2.width, c2.height); g2.font = '600 17px sans-serif';
      raw.forEach((b, i) => { const x = pad + (i % cols) * (tileW + pad), y = pad + Math.floor(i / cols) * (th + cap + pad); g2.fillStyle = '#222'; g2.fillText(items[i].caption, x, y + 20); g2.drawImage(b, x, y + cap, tileW, (b.height * tileW) / b.width); });
      return c2.toDataURL('image/png').split(',')[1];
    }
    const bms = raw;
    const W = dir === 'row' ? bms.reduce((a, b) => a + b.width, 0) + pad * (bms.length + 1) : Math.max(...bms.map((b) => b.width)) + pad * 2;
    const H = dir === 'row' ? Math.max(...bms.map((b) => b.height)) + cap + pad * 2 : bms.reduce((a, b) => a + b.height + cap, 0) + pad * (bms.length + 1);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
    g.fillStyle = '#e9e6df'; g.fillRect(0, 0, W, H); g.font = '600 20px sans-serif';
    let x = pad, y = pad;
    bms.forEach((b, i) => { g.fillStyle = '#222'; g.fillText(items[i].caption, x, y + 22); g.drawImage(b, x, y + cap); if (dir === 'row') x += b.width + pad; else y += b.height + cap + pad; });
    return c.toDataURL('image/png').split(',')[1];
  }, { items: items.map((i) => ({ caption: i.caption, b64: i.buf.toString('base64') })), dir, cols, tileW });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
}

const PLAN2 = { title: 'Say Creator', slides: [
  { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
  { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }, accents: [] },
  { layout: 'numbered-list', fields: { title: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: [] },
  { layout: 'big-stat', fields: { number: '1', label: 'idea a day, one place' }, accents: [] },
  { layout: 'headline-card', fields: { headline: 'Change a headline and nothing reruns.', card: 'Switch the style and your words stay put.' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'I want you saying something', paragraph: 'Something worth swiping for.' }, accents: [] },
  { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." }, accents: [] },
] };

test('A: the Slides-step picker: big thumbnails in their own shape, numbers, names, badges, the line under the row, a 280 px preview, Auto and None in the first row; two per row at 390 px; plain words and no layout id in any visible text', async ({ page }) => {
  const r = await rig(page, PLAN2);
  await page.goto('/images/carousel');
  await addPictures(page);
  await nameThem(page, NAMES);
  await page.getByLabel('Your text or topic').fill('Most creators do not have a design problem. You write a good post. Then the evening goes to dragging text boxes. How it works: paste your text, pick a look from 15 styles, get slides you can edit.');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 7);
  await page.waitForTimeout(1200);
  const d0 = await doc(page);
  const specs0 = d0.designed.library.plan.specs as any[];
  const li = specs0.findIndex((s) => /^(numbered-list|list-under-band|list-beside-picture)$/.test(s.layout));
  const bs = specs0.findIndex((s) => s.layout === 'big-stat');
  expect(li, 'a list slide').toBeGreaterThan(0);
  expect(bs, 'a big-number slide').toBeGreaterThan(0);
  // ----- the picker of the list slide
  await openEdit(page, li + 1);
  const picker = page.getByTestId(`picker-${li}`);
  await expect(picker).toBeVisible();
  const first = await picker.evaluate((el, i) => {
    const modes = el.querySelector('.cr-pick-modes')!.getBoundingClientRect();
    const thumbs = [...el.querySelectorAll('[data-testid="thumb-box"]')].map((b) => { const r = b.getBoundingClientRect(); const im = b.querySelector('img')!; return { w: r.width, h: r.height, fit: getComputedStyle(im).objectFit }; });
    const auto = el.querySelector(`[data-testid="pick-${i}-auto"]`)!.getBoundingClientRect(), none = el.querySelector(`[data-testid="pick-${i}-none"]`)!.getBoundingClientRect();
    const t0 = el.querySelector('.cr-pick-thumbs')!.getBoundingClientRect();
    return { thumbs, autoTop: auto.top, noneTop: none.top, modesBottom: modes.bottom, thumbsTop: t0.top, autoH: auto.height };
  }, li);
  expect(first.thumbs).toHaveLength(4);
  for (const t of first.thumbs) { expect(t.w).toBeGreaterThanOrEqual(96); expect(t.h).toBeGreaterThanOrEqual(120); expect(t.fit).toBe('contain'); }
  expect(first.autoTop).toBe(first.noneTop);
  expect(first.modesBottom).toBeLessThanOrEqual(first.thumbsTop + 1); // Auto and None are the first row
  expect(first.autoH).toBeGreaterThanOrEqual(40);
  for (let k = 0; k < 4; k++) await expect(page.getByTestId(`pick-${li}-${k}`).getByTestId('thumb-num')).toHaveText(String(k + 1));
  await expect(page.getByTestId(`pick-${li}-1`)).toHaveAttribute('aria-label', /Picture 2: style step/);
  await expect(page.getByTestId(`pick-${li}-1`).locator('.cr-thumb')).toHaveAttribute('title', 'Picture 2: style step');
  // the badge: a picture the deck already used says on which slides
  const used = await picker.getByTestId('thumb-badge').allTextContents();
  expect(used.length, 'the pictures the deck placed carry an "on slide N" badge').toBeGreaterThan(0);
  for (const u of used) expect(u).toMatch(/^on slide \d+(, \d+)*$/);
  // the hover preview: about 280 px wide, with the name
  await page.getByTestId(`pick-${li}-1`).hover();
  const pre = page.getByTestId('thumb-preview');
  await expect(pre).toBeVisible();
  const pw = (await pre.boundingBox())!.width;
  expect(pw).toBeGreaterThanOrEqual(270); expect(pw).toBeLessThanOrEqual(300);
  await expect(pre).toContainText('Picture 2: style step');
  await page.mouse.move(5, 5);
  // ----- the messages: a swap, a refusal, None
  const msgs: Record<string, string> = {};
  const texts: string[] = [];
  const shots: { buf: Buffer; caption: string }[] = [];
  // a swap: the tall picture (3, "phone") goes beside a list that is under a band, the wide one (4, "slides step") above any other list
  const k = specs0[li].layout === 'list-under-band' ? 2 : 3;
  await page.getByTestId(`pick-${li}-${k}`).click();
  const m1 = page.getByTestId(`pick-${li}-msg`);
  await expect(m1).toContainText('Every word is kept', { timeout: 30_000 });
  msgs.swap = (await m1.textContent())!;
  expect(msgs.swap).toMatch(k === 2 ? /next to your list/ : /above your list/);
  await expect(page.getByTestId(`pick-${li}-shown`)).toHaveText(k === 2 ? 'Picture 3: phone' : 'Picture 4: slides step');
  texts.push(await picker.innerText());
  shots.push({ buf: await picker.screenshot(), caption: 'A swap' });
  await openEdit(page, bs + 1);
  await page.getByTestId(`pick-${bs}-0`).click();
  const m2 = page.getByTestId(`pick-${bs}-msg`);
  await expect(m2).toContainText('cannot show this picture without losing words', { timeout: 30_000 });
  msgs.refusal = (await m2.textContent())!;
  shots.push({ buf: await page.getByTestId(`picker-${bs}`).screenshot(), caption: 'A refusal' });
  await page.getByTestId(`pick-${bs}-none`).click();
  const m3 = page.getByTestId(`pick-${bs}-msg`);
  await expect(m3).toContainText('keep no picture', { timeout: 30_000 });
  await expect(page.getByTestId(`pick-${bs}-shown`)).toHaveText('No picture on this slide.');
  msgs.none = (await m3.textContent())!;
  texts.push(await page.getByTestId(`picker-${bs}`).innerText());
  shots.push({ buf: await page.getByTestId(`picker-${bs}`).screenshot(), caption: 'None' });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/messages.json`, JSON.stringify(msgs, null, 1));
  await sheet(page, shots, `${OUT}/messages.png`, 'col');
  // ----- no layout id anywhere in the visible text of the picker, the Content step or a message
  const ids: string[] = await page.evaluate(async () => { const L: any = await import('/src/carousel/layouts/index.ts'); return [...L.LAYOUT_IDS, 'phone-frame', 'split-half', 'title-over-photo', 'list-beside-picture', 'list-under-band']; });
  const idRe = new RegExp('(^|[^a-z-])(' + [...new Set(ids)].map((x) => x.replace(/-/g, '\\-')).join('|') + ')([^a-z-]|$)');
  const visible = [...texts, ...Object.values(msgs)];
  for (const v of visible) expect(idRe.test(v), `a layout id in: ${v.slice(0, 120)}`).toBe(false);
  await page.getByRole('button', { name: 'Done', exact: true }).first().click();
  await toStep(page, 1);
  expect(idRe.test(await page.getByTestId('images-field').innerText()), 'a layout id in the Content step').toBe(false);
  expect(r.calls, 'one writer call for the deck, none for the picks').toBe(1);
  // ----- the picker at 390 px: two per row, each at least 140 px wide, no sideways scroll, tap targets at least 40 px
  await toStep(page, 4);
  await openEdit(page, li + 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const ph = await page.getByTestId(`picker-${li}`).evaluate((el, i) => {
    const boxes = [...el.querySelectorAll('[data-testid="thumb-box"]')].map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, top: Math.round(r.top) }; });
    const btn = (id: string) => el.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    const rows = [...new Set(boxes.map((b) => b.top))].length;
    return { boxes, rows, autoH: btn(`pick-${i}-auto`).height, autoW: btn(`pick-${i}-auto`).width, noneH: btn(`pick-${i}-none`).height, scroll: document.documentElement.scrollWidth <= window.innerWidth + 1, thumbBtnH: btn(`pick-${i}-0`).height, fits: el.scrollWidth <= el.clientWidth + 1, pw: el.clientWidth, sw: el.scrollWidth, rightmost: Math.max(...[...el.querySelectorAll('.cr-pick-thumb')].map((b) => b.getBoundingClientRect().right)), pr: el.getBoundingClientRect().right };
  }, li);
  for (const b of ph.boxes) expect(b.w).toBeGreaterThanOrEqual(140);
  expect(ph.rows, 'four pictures, two per row').toBe(2);
  expect(ph.autoH).toBeGreaterThanOrEqual(40); expect(ph.noneH).toBeGreaterThanOrEqual(40); expect(ph.autoW).toBeGreaterThanOrEqual(40);
  expect(ph.thumbBtnH).toBeGreaterThanOrEqual(40);
  expect(ph.scroll, 'no sideways scroll at 390 px').toBe(true);
  expect(ph.rightmost, `the thumbnails stay inside the picker (${JSON.stringify(ph)})`).toBeLessThanOrEqual(ph.pr + 0.5);
  const phoneShot = await page.getByTestId(`picker-${li}`).screenshot();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
  const deskShot = await page.getByTestId(`picker-${li}`).screenshot();
  await sheet(page, [{ buf: deskShot, caption: 'Desktop' }, { buf: phoneShot, caption: '390 px phone' }], `${OUT}/picker-bigger.png`, 'row');
});

test('A: the Content step sheet: desktop and 390 px, with names', async ({ page }) => {
  await rig(page);
  await page.goto('/images/carousel');
  await addPictures(page);
  await nameThem(page, NAMES);
  const desk = await page.getByTestId('images-field').screenshot();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const ph = await page.getByTestId('images-field').screenshot();
  await sheet(page, [{ buf: desk, caption: 'Desktop' }, { buf: ph, caption: '390 px phone' }], `${OUT}/content-step-names.png`, 'row');
});

// Part F: style-6 (a profile header, about 45 px taller than the usual handle row) plans its picture zone below the header: split-half is half of the slide, the caption picture is within 1% of the other styles.
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
test('F: style-6 and another style side by side: split-half and photo-full-caption (style-6-fixed.png), the shares measured', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  const r: any = await page.evaluate(async () => {
    const H = (window as any).__H;
    const share = (b: any) => (b.images ?? []).reduce((a: number, p: any) => a + (p.w * p.h) / (1080 * 1350), 0);
    const tiles: { svg: string; label: string }[] = [];
    const rows: any[] = [];
    for (const style of ['style-6', 'dark-quiet']) {
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      const cases: [string, any, string][] = [
        ['split-half', { headline: 'Why we built it', body: 'We sewed the bag into the hood, so one layer does both jobs.', image: H.IM.makeRef({ id: 'landscape', w: 1600, h: 1067 }) }, 'landscape (a top half)'],
        ['split-half', { headline: 'Why we built it', body: 'We sewed the bag into the hood, so one layer does both jobs.', image: H.IM.makeRef({ id: 'portrait', w: 1200, h: 1600 }) }, 'portrait (a side half)'],
        ['photo-full-caption', { headline: 'The hoodie that becomes a backpack', line: 'Ten seconds, one zip.', image: H.IM.makeRef({ id: 'landscape', w: 1600, h: 1067 }) }, 'landscape'],
      ];
      for (const [layout, f, label] of cases) {
        const d = await H.D.drawOne({ layout, fields: f, accents: [] }, 0, st, { handle: '@maya.designs', index: 1, total: 7, cut: 'plain', invert: false, density: 'normal' });
        if (!d.built) { rows.push({ style, layout, label, error: d.problems?.[0] }); continue; }
        const img = d.built.images[0];
        rows.push({ style, layout, label, share: Math.round(share(d.built) * 10000) / 100, pictureTop: Math.round(img.y), pictureBottom: Math.round(img.y + img.h), pictureW: Math.round(img.w), titleSize: Math.round(d.built.layers.find((l: any) => l.kind === 'text' && l.name === 'title')?.style?.size ?? 0) });
        tiles.push({ svg: d.built.svg, label: `${style} ${layout} ${label}` });
      }
    }
    const cols = 3, w = 420, h = 525, pad = 12, cap = 30;
    const c = document.createElement('canvas'); c.width = cols * (w + pad) + pad; c.height = 2 * (h + cap + pad) + pad;
    const g = c.getContext('2d')!; g.fillStyle = '#e9e6df'; g.fillRect(0, 0, c.width, c.height); g.font = '600 16px sans-serif';
    for (const [i, t] of tiles.entries()) { const bm = await createImageBitmap(await H.FA.svgToPng(t.svg, 840)); const x = pad + (i % cols) * (w + pad), y = pad + Math.floor(i / cols) * (h + cap + pad); g.fillStyle = '#222'; g.fillText(t.label, x, y + 20); g.drawImage(bm, x, y + cap, w, h); }
    return { rows, sheet: c.toDataURL('image/png').split(',')[1] };
  });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/style-6-fixed.png`, Buffer.from(r.sheet, 'base64'));
  fs.writeFileSync(`${OUT}/style-6-fixed.json`, JSON.stringify(r.rows, null, 1));
  for (const row of r.rows) expect(row.error, JSON.stringify(row)).toBeUndefined();
  const by = (s: string, l: string, k: string) => r.rows.find((x: any) => x.style === s && x.layout === l && x.label.startsWith(k));
  for (const s of ['style-6', 'dark-quiet']) {
    expect(Math.abs(by(s, 'split-half', 'landscape').share - 50), `${s} split-half top half`).toBeLessThanOrEqual(0.2);
    expect(Math.abs(by(s, 'split-half', 'portrait').share - 50), `${s} split-half side half`).toBeLessThanOrEqual(0.2);
  }
  // the caption picture in style-6 is the header's height (45 px, 3.3% of the slide) smaller than in another style: the panel under it is the same, so the headline is not pressed against the clamp
  const gap = by('dark-quiet', 'photo-full-caption', 'landscape').share - by('style-6', 'photo-full-caption', 'landscape').share;
  expect(gap, 'the caption picture in style-6 vs another style').toBeLessThanOrEqual(3.5);
  expect(gap).toBeGreaterThanOrEqual(0);
  // style-6's picture starts below its profile header, so nothing is trimmed afterwards: the top is where the layout put it
  expect(by('style-6', 'split-half', 'landscape').pictureTop).toBeGreaterThanOrEqual(161);
});
