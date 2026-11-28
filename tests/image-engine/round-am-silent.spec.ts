// Round AM part 3: no words are lost without the person seeing it.
//  - A text edit after a layout switch that left a line out keeps that line (with the edit carried into the kept words); a plain line under the Edit tabs says what is left out, and
//    "Bring it back" switches to the layout that shows it, with the edit. An edit that writes the line back, or writes into an empty part of the slide, lets it go.
//  - "Add a picture to this slide" never takes a layout that leaves out any of the slide's words (optional ones included): it takes the next layout that keeps them all, or says none does.
// A FAKE writer makes the deck (one answer) and a FAKE describer counts: every click is code only, ZERO model calls.
import { expect, test, type Page } from '@playwright/test';
import { deckDrawn, openTab, toStep } from './ui';

test.setTimeout(6 * 60_000);

const NB = ' ';
const ITEM = { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' };

test('S1 the kept words follow a text edit; "Bring it back" restores them with the edit; an edit that writes the line back or fills an empty part lets them go', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async ({ ITEM, NB }) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const P: any = await import('/src/carousel/designLibraryPick.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const pack = PR.presetPackFor('editorial-collage', false);
    const style = D.styleFromPack(pack).style;
    const look = { hasPhoto: false };
    const lib0: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style, styleNotes: [], plan: { title: 'T', specs: [
      { layout: 'statement', fields: { headline: '5 small habits for your photos' }, accents: [] },
      { layout: 'listicle-numeral', fields: ITEM, accents: [] },
    ] } };
    const lib = (await D.redrawLibraryDeck(lib0, { pack, hasPhoto: false }, '@h')).library;
    const sw = await P.redrawLibrarySlide(lib, look, '@h', 1, { layout: 'statement', variant: 0 });
    const lost0 = P.leftOutOf(sw.spec);
    // an edit of the headline in the statement
    const ed = await P.redrawLibrarySlide(sw.library, look, '@h', 1, { fields: { headline: `1.${NB}Shoot at sunrise` } });
    const lost1 = P.leftOutOf(ed.spec);
    const back = await P.redrawLibrarySlide(ed.library, look, '@h', 1, { layout: 'listicle-numeral', variant: 0 });
    // an edit that writes the left-out line back (into the caption), and one that fills an empty part with other words
    const putBack = await P.redrawLibrarySlide(sw.library, look, '@h', 1, { fields: { headline: `1.${NB}Shoot at golden hour`, caption: 'Sunrise and the hour before sunset do more than any filter.' } });
    const filled = await P.redrawLibrarySlide(sw.library, look, '@h', 1, { fields: { headline: `1.${NB}Shoot at golden hour`, caption: 'Any light will do.' } });
    // an edit of another slide's look (no words changed) keeps them as they were
    const look2 = await P.redrawLibrarySlide(ed.library, look, '@h', 1, { invert: 'full' });
    return {
      lost0, lost1,
      keptAfterEdit: ed.spec.left?.fields ?? null,
      back: back.ok ? { layout: back.spec.layout, fields: back.spec.fields, left: back.spec.left ?? null } : back.reasons,
      putBack: { left: putBack.spec.left ?? null, lost: P.leftOutOf(putBack.spec) },
      filled: { left: filled.spec.left ?? null, lost: P.leftOutOf(filled.spec) },
      look2: P.leftOutOf(look2.spec),
    };
  }, { ITEM, NB });
  expect(r.lost0).toEqual([ITEM.body]);
  expect(r.keptAfterEdit, 'the edit is carried into the kept words').toEqual({ numeral: '1', title: 'Shoot at sunrise', body: ITEM.body });
  expect(r.lost1).toEqual([ITEM.body]);
  expect(r.back).toEqual({ layout: 'listicle-numeral', fields: { numeral: '1', title: 'Shoot at sunrise', body: ITEM.body }, left: null });
  expect(r.putBack).toEqual({ left: null, lost: [] });
  expect(r.filled).toEqual({ left: null, lost: [] });
  expect(r.look2).toEqual([ITEM.body]);
});

const TEXT = "5 small habits that make your photos look less like everyone else's.\n\n1. Shoot at golden hour. Sunrise and the hour before sunset do more than any filter.\n2. Look for reflections. Puddles, windows and wet streets give you a second picture for free.\n3. Get low or get high. Eye level is what everyone else does.\n4. Leave empty space. A small subject in a big scene feels like a story.\n5. Pick one detail. A single leaf on a table can beat a whole landscape.\n\nSave this for your next shoot, and tell me which one you'll try first.";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const WRITER = JSON.stringify({ title: '5 small habits', slides: [
  S('statement', { kicker: '5 small habits', headline: 'Make your photos look less like everyone else', caption: 'Save this for your next shoot.' }),
  S('listicle-numeral', ITEM),
  S('split-text', { headline: 'Look for reflections', paragraph: 'Puddles, windows and wet streets give you a second picture for free.' }),
  S('cta-pair', { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me', line2: "Tell me which one you'll try first." }),
] });

/** A photo-like generated picture (gradient and small marks, no stock) as file bytes. */
async function picture(page: Page, w: number, h: number, name: string) {
  const b64 = await page.evaluate(async ({ w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2471a3'); gr.addColorStop(1, '#ffe9c4'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 60%, ${20 + rnd() * 60}%, 0.55)`; const s = (0.004 + rnd() * 0.03) * Math.min(w, h); g.fillRect(rnd() * w, rnd() * h, s, s); }
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
  }, { w, h });
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

async function makeDeck(page: Page, f: { calls: number; describes: number }) {
  await page.route('**/__carousel/status', (x) => x.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (x) => x.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (x) => x.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (x) => x.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/__picture/describe', (x) => { f.describes++; return x.fulfill({ json: { captions: [], calls: 1 } }); });
  const write = (x: any) => { f.calls++; return x.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 4);
}
const libOf = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as any).project?.doc?.designed?.library);
const words = (f: Record<string, unknown>) => Object.entries(f).filter(([k]) => k !== 'accent' && !/^(image|image\d|photo|picture|portrait|avatar|thumb\d?|screen)$/.test(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map((x) => String(x).trim()).filter((x) => x && !x.startsWith('picture:'));
const keepsAll = (before: string[], after: string[]) => before.filter((t) => !after.some((u) => u === t || u.includes(t)));
/** No layout id, no quoted field id, no engine word. */
async function plain(page: Page, t: string, where: string) {
  const w = await page.evaluate(async () => {
    const L: any = await import('/src/carousel/layouts/index.ts');
    return { ids: (L.LAYOUT_IDS as string[]).filter((x) => x.includes('-')), fields: [...new Set((L.LAYOUT_IDS as string[]).flatMap((id) => L.layoutDef(id).fields.map((f: any) => f.name as string)))] };
  });
  for (const id of w.ids) expect(t, `${where}: layout id ${id}`).not.toContain(id);
  for (const fid of w.fields) expect(t, `${where}: quoted field id ${fid}`).not.toMatch(new RegExp(`["'“]${fid}["'”]`));
  expect(t, `${where}: engine word`).not.toMatch(/\b(variant|cut|invert|density|plane|kicker)s?\b/i);
}

test('S2 in the app at 390 px: a text edit after a switch that left a line out shows "Left out of this layout ... Bring it back"; the click brings the line back with the edit; zero model calls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = { calls: 0, describes: 0 };
  await makeDeck(page, f);
  expect((await libOf(page)).plan.specs[1].layout).toBe('listicle-numeral');
  // the switch: Big statement leaves the sentence out (asked first)
  await openTab(page, 'Layout', 2);
  const g = page.getByTestId('gallery-1');
  await g.scrollIntoViewIfNeeded();
  await expect(g).not.toHaveAttribute('data-ready-ms', '', { timeout: 60_000 });
  await g.getByTestId('gal-statement').click();
  await page.getByTestId('fit-use').click();
  await expect.poll(async () => (await libOf(page)).plan.specs[1].layout, { timeout: 30_000 }).toBe('statement');
  // the edit: the headline
  await openTab(page, 'Text', 2);
  const head = page.getByTestId('text-tab-1').locator('input, textarea').first();
  await expect(head).toHaveValue(`1.${NB}Shoot at golden hour`);
  await head.fill(`1.${NB}Shoot at sunrise`);
  await head.press('Tab');
  await expect.poll(async () => (await libOf(page)).plan.specs[1].fields.headline, { timeout: 30_000 }).toBe(`1.${NB}Shoot at sunrise`);
  const line = page.getByTestId('left-out');
  await expect(line).toBeVisible();
  await expect(line).toContainText('Left out of this layout: "Sunrise and the hour before sunset do mo…"');
  await expect(line.getByRole('button', { name: 'Bring it back' })).toBeVisible();
  await plain(page, await line.innerText(), 'the bring-back line');
  await page.evaluate(() => { const bar = document.querySelector('.cr-edit-bar') as HTMLElement | null; if (bar) bar.style.position = 'static'; });
  await line.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'out/round-am/part3/bring-back-line-390.png' });
  // the click: back to the numbered step, with the edit
  await line.getByRole('button', { name: 'Bring it back' }).click();
  await expect(page.getByTestId('left-out-msg')).toHaveText(/^Slide 2 is now Numbered step/, { timeout: 60_000 });
  await plain(page, await page.getByTestId('left-out-msg').innerText(), 'the message');
  await expect.poll(async () => (await libOf(page)).plan.specs[1].layout, { timeout: 30_000 }).toBe('listicle-numeral');
  expect((await libOf(page)).plan.specs[1].fields).toMatchObject({ numeral: '1', title: 'Shoot at sunrise', body: ITEM.body });
  await expect(page.getByTestId('left-out')).toHaveCount(0);
  await page.screenshot({ path: 'out/round-am/part3/bring-back-done-390.png' });
  expect(f.calls, 'one fake writer call for the deck').toBe(1);
  expect(f.describes).toBe(0);
});

test('S3 in the app at 390 px: "Add a picture to this slide" never leaves a word out: a slide no picture layout can take whole stays as it is; a slide one can take gets it with every word; zero model calls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = { calls: 0, describes: 0 };
  await makeDeck(page, f);
  const l0 = await libOf(page);
  // pictures added after the deck: free for "Add a picture"
  await toStep(page, 1);
  await page.getByLabel('Choose images for the slides').setInputFiles([await picture(page, 1500, 1000, 'wide.jpg'), await picture(page, 1000, 1500, 'tall.jpg')]);
  await expect(page.getByTestId('image-1')).toBeVisible({ timeout: 30_000 });

  // slide 1: a small line, a headline and a caption; every picture layout would leave one of them out
  const s1 = words(l0.plan.specs[0].fields);
  expect(s1.length, 'slide 1 has three lines').toBe(3);
  await openTab(page, 'Pictures', 1);
  const add = page.getByTestId('add-picture');
  await add.getByRole('button', { name: 'Add a picture to this slide' }).click();
  await expect(add.getByRole('status')).toHaveText(/^(No picture layout fits what this slide says without losing words|Added a picture)/, { timeout: 60_000 });
  const l1 = await libOf(page);
  expect(keepsAll(s1, words(l1.plan.specs[0].fields)), 'slide 1 keeps every word').toEqual([]);
  await plain(page, await add.getByRole('status').innerText().then((t) => t.replace(/the layout is now \S+/, '')), 'the add-picture message');
  await page.evaluate(() => { const bar = document.querySelector('.cr-edit-bar') as HTMLElement | null; if (bar) bar.style.position = 'static'; });
  await add.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'out/round-am/part3/add-picture-slide1-390.png' });

  // slide 3: a headline and a sentence; a picture layout takes both
  const s3 = words(l0.plan.specs[2].fields);
  await openTab(page, 'Pictures', 3);
  const add3 = page.getByTestId('add-picture');
  await add3.getByRole('button', { name: 'Add a picture to this slide' }).click();
  // (the slide now has a picture: the tab shows its picture slots in place of this block)
  await expect.poll(async () => (await libOf(page)).plan.specs[2].layout, { timeout: 30_000 }).not.toBe(l0.plan.specs[2].layout);
  const l3 = await libOf(page);
  expect(keepsAll(s3, words(l3.plan.specs[2].fields)), 'slide 3 keeps every word').toEqual([]);
  expect(Object.values(l3.plan.specs[2].fields).some((v) => typeof v === 'string' && v.startsWith('picture:')), 'slide 3 got a picture').toBe(true);
  await page.screenshot({ path: 'out/round-am/part3/add-picture-slide3-390.png' });
  expect(f.calls, 'one fake writer call for the deck').toBe(1);
  expect(f.describes).toBe(0);
});
