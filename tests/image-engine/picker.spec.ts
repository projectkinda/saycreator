// Round 14 B: the per-slide picture picker (Auto / None / a picture): no writer call, pinned (a restyle and a text edit keep it), the same picture on two slides, a layout swap loses no words, the
// unused-pictures line and the report follow, and at 390 px the control is reachable and nothing overflows. A fake writer that counts every call: ZERO real model calls.
// Output: out/round-14/slides-step-picker.png (desktop and 390 px phone)
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { deckDrawn, openEdit, openTab, toStep } from './ui';

test.setTimeout(10 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });
const OUT = 'out/round-14';
const PLAN = JSON.stringify({ title: 'Say Creator', slides: [
  { layout: 'statement', fields: { headline: "Most creators don't have a design problem." }, accents: [] },
  { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes to dragging text boxes.' }, accents: [] },
  { layout: 'numbered-list', fields: { title: 'How it works', items: ['Paste your text', 'Pick a look from 15 styles', 'Get slides you can edit'] }, accents: [] },
  { layout: 'headline-card', fields: { headline: 'Change a headline and nothing reruns.', card: 'Switch the style and your words stay put.' }, accents: [] },
  { layout: 'statement-card', fields: { headline: 'You can add your own pictures too.' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'I want you saying something', paragraph: 'Something worth swiping for.' }, accents: [] },
  { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: "I'll send you the link." }, accents: [] },
] });

async function setup(page: Page) {
  const calls: string[] = [];
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const w = (r: any) => { calls.push('write'); return r.fulfill({ json: { text: PLAN, ms: 5 } }); };
  await page.route('**/__carousel/write', w);
  await page.route('**/api/carousel/write', w);
  await page.goto('/images/carousel');
  const files: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (let i = 0; i < 3; i++) {
    const b64 = await page.evaluate(async (i) => {
      const c = document.createElement('canvas'); c.width = 1500; c.height = 1000; const g = c.getContext('2d')!;
      const gr = g.createLinearGradient(0, 0, 1500, 1000); gr.addColorStop(0, `hsl(${i * 90},60%,55%)`); gr.addColorStop(1, `hsl(${i * 90 + 40},60%,30%)`); g.fillStyle = gr; g.fillRect(0, 0, 1500, 1000);
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.8)); const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
    }, i);
    files.push({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  }
  await page.getByLabel('Choose images for the slides').setInputFiles(files);
  await expect(page.getByTestId(/^image-\d+$/)).toHaveCount(3, { timeout: 60_000 });
  await page.getByLabel('Your text or topic').fill('Most creators do not have a design problem. Write a good post, then turn it into slides. Pick a style. Add pictures. Comment "slides" and I will send you the link.');
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 7);
  return calls;
}
const doc = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc);
const words = (s: any) => (JSON.stringify(Object.entries(s.fields).filter(([k]) => !/^image\d?$|accent/.test(k)).map(([, v]) => v)).toLowerCase().match(/[a-z0-9']+/g) ?? []);
const picIds = (s: any) => Object.entries(s.fields).filter(([k]) => /^image\d?$/.test(k)).map(([, v]) => /^picture:([^#]+)#/.exec(String(v))?.[1]).filter(Boolean);

test('the picker: a pick is pinned, no writer call, restyle and text edit keep it, "None" stays, Auto brings the deck\'s own back, the same picture on two slides, no words lost', async ({ page }) => {
  const calls = await setup(page);
  await page.waitForTimeout(1500);
  expect(calls.length, 'the deck: one writer call').toBe(1);
  const d0 = await doc(page);
  const specs0 = d0.designed.library.plan.specs as any[];
  const photos: string[] = d0.photos.filter((p: any) => p.kind === 'photo').map((p: any) => p.id);
  expect(photos).toHaveLength(3);
  // a slide with no picture in the deck as it was made (a text layout): slide 5 (index 4) or the first one without a picture
  const target = specs0.findIndex((s, i) => i > 0 && i < 6 && picIds(s).length === 0 && !/numbered-list/.test(s.layout));
  expect(target).toBeGreaterThan(0);
  const target2 = specs0.findIndex((s, i) => i > target && i < 6 && picIds(s).length === 0 && !/numbered-list/.test(s.layout));
  const wordsBefore = words(specs0[target]);
  // ----- pick picture 1 on the target slide
  await openEdit(page, target + 1);
  await expect(page.getByTestId(`picker-${target}`)).toBeVisible();
  await page.getByTestId(`pick-${target}-0`).click();
  await expect(page.getByTestId(`pick-${target}-msg`)).not.toHaveText('', { timeout: 30_000 });
  await page.waitForTimeout(600);
  let d1 = await doc(page);
  let s1 = d1.designed.library.plan.specs[target];
  expect(picIds(s1), `the pick is on the slide (${s1.layout})`).toEqual([photos[0]]);
  expect(s1.pin.picture).toBe(photos[0]);
  for (const w of wordsBefore) expect(words(s1), `word "${w}" was lost in the swap to ${s1.layout}`).toContain(w);
  expect(calls.length, 'a pick makes no writer call').toBe(1);
  // the same picture on a second slide
  if (target2 > 0) {
    await openEdit(page, target2 + 1);
    await page.getByTestId(`pick-${target2}-0`).click();
    await page.waitForTimeout(900);
    d1 = await doc(page);
    expect(picIds(d1.designed.library.plan.specs[target2])).toEqual([photos[0]]);
    expect(picIds(d1.designed.library.plan.specs[target])).toEqual([photos[0]]);
  }
  // the unused-pictures line follows the deck
  const specsNow = (await doc(page)).designed.library.plan.specs as any[];
  const usedNow = new Set(specsNow.flatMap(picIds));
  const unusedNow = photos.filter((p) => !usedNow.has(p)).length;
  // ----- "None" on a slide the deck gave a picture
  const withAuto = specs0.findIndex((s, i) => i > 0 && i !== target && i !== target2 && picIds(s).length > 0);
  let none = -1;
  if (withAuto >= 0) {
    none = withAuto;
    await openEdit(page, none + 1);
    await page.getByTestId(`pick-${none}-none`).click();
    await page.waitForTimeout(900);
    const dn = await doc(page);
    expect(picIds(dn.designed.library.plan.specs[none]), 'None removes the picture').toEqual([]);
    expect(dn.designed.library.plan.specs[none].pin.picture).toBe('none');
  }
  // ----- restyle keeps every pin
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Quiet dark minimal/ }).first().click();
  await page.waitForTimeout(2500);
  const d2 = await doc(page);
  const s2 = d2.designed.library.plan.specs as any[];
  expect(picIds(s2[target]), 'a restyle keeps the pick').toEqual([photos[0]]);
  expect(s2[target].pin.picture).toBe(photos[0]);
  if (none >= 0) { expect(picIds(s2[none]), 'a restyle keeps None').toEqual([]); expect(s2[none].pin.picture).toBe('none'); }
  expect(calls.length, 'a restyle makes no writer call').toBe(1);
  // ----- a text edit keeps the pick
  await openTab(page, 'Text', target + 1);
  const first = page.locator('.cr-card input').first();
  await first.fill((await first.inputValue()) + '!');
  await first.blur();
  await page.waitForTimeout(1500);
  const d3 = await doc(page);
  expect(picIds(d3.designed.library.plan.specs[target]), 'a text edit keeps the pick').toEqual([photos[0]]);
  expect(calls.length, 'a text edit makes no writer call').toBe(1);
  // ----- the unused line and the report agree with the deck
  const usedAll = new Set((d3.designed.library.plan.specs as any[]).flatMap(picIds));
  const unusedAll = photos.filter((p) => !usedAll.has(p)).length;
  await page.locator('.cr-wiz-steps button').nth(3).click();
  const line = page.getByTestId('pictures-unused');
  if (unusedAll > 0) await expect(line).toHaveText(new RegExp(`^${unusedAll} of 3 pictures? (is|are) not on a slide\\.$`));
  else await expect(line).toHaveCount(0);
  console.log('PICKER unused after the picks', unusedNow, 'at the end', unusedAll);
  const rep: any = await page.evaluate(async () => {
    const RP: any = await import('/src/reference/report.ts');
    const dd = JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project?.doc;
    return JSON.parse((await RP.buildReport({ doc: dd, includeRefs: false, verdicts: {}, note: '' })).json).pictures;
  });
  expect(rep.unused.length).toBe(unusedAll);
  // ----- Auto brings the deck's own placement back (the slide as the deck made it), and drops the pin
  await openEdit(page, target + 1);
  await page.getByTestId(`pick-${target}-auto`).click();
  await page.waitForTimeout(1200);
  const d4 = await doc(page);
  const s4 = d4.designed.library.plan.specs[target];
  expect(s4.pin?.picture, 'Auto drops the pin').toBeUndefined();
  expect(s4.layout, 'Auto brings back the deck\'s own layout').toBe(specs0[target].layout);
  expect(picIds(s4)).toEqual(picIds(specs0[target]));
  expect(calls.length, 'the whole session: one writer call').toBe(1);
});

test('the picker at 390 px: reachable, nothing overflows the page; the screenshot of the Slides step (desktop and phone)', async ({ page }) => {
  await setup(page);
  await openEdit(page, 2);
  const desk = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 900 } });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(500);
  const picker = page.getByTestId('picker-1');
  await picker.scrollIntoViewIfNeeded();
  await expect(picker).toBeVisible();
  const over = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth, pick: (() => { const el = document.querySelector('[data-testid="picker-1"]') as HTMLElement; return el ? el.getBoundingClientRect().right - window.innerWidth : 999; })() }));
  expect(over.doc, 'the page does not scroll sideways').toBeLessThanOrEqual(1);
  expect(over.pick, 'the control stays inside the screen').toBeLessThanOrEqual(1);
  // the last thumbnail is reachable (the row scrolls inside its own box)
  const last = page.getByTestId('pick-1-2');
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await page.waitForTimeout(900);
  const shot = await page.screenshot({ clip: { x: 0, y: Math.max(0, ((await picker.boundingBox())?.y ?? 0) - 160), width: 390, height: 640 } });
  const both = await page.evaluate(async ([a, b]) => {
    const ia = await createImageBitmap(await (await fetch('data:image/png;base64,' + a)).blob());
    const ib = await createImageBitmap(await (await fetch('data:image/png;base64,' + b)).blob());
    const c = document.createElement('canvas'); c.width = ia.width + ib.width + 20; c.height = Math.max(ia.height, ib.height);
    const g = c.getContext('2d')!; g.fillStyle = '#999'; g.fillRect(0, 0, c.width, c.height); g.drawImage(ia, 0, 0); g.drawImage(ib, ia.width + 20, 0);
    const blob: Blob = await new Promise((res) => c.toBlob((x) => res(x!), 'image/png'));
    const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); return btoa(t);
  }, [desk.toString('base64'), shot.toString('base64')]);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/slides-step-picker.png`, Buffer.from(both, 'base64'));
});

// Round 16 F: at 390 px the Picture row wraps (two lines at most for 3 pictures) with Auto first; it never scrolls sideways; Auto and None are always in view.
test('the picker row at 390 px wraps to two lines with Auto first, no sideways scroll, Auto and None visible (out/round-16/picker-phone.png)', async ({ page }) => {
  await setup(page);
  await openEdit(page, 2);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(500);
  const picker = page.getByTestId('picker-1');
  await picker.scrollIntoViewIfNeeded();
  await expect(picker).toBeVisible();
  const m = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="picker-1"] .cr-pick-row') as HTMLElement;
    const kids = [...row.children] as HTMLElement[];
    const rects = kids.map((k) => k.getBoundingClientRect());
    const rows = new Set(rects.map((r) => Math.round(r.top / 10))).size;
    return {
      overflowX: getComputedStyle(row).overflowX, scrollW: row.scrollWidth, clientW: row.clientWidth, rows,
      firstText: kids[0].textContent, secondText: kids[1].textContent,
      inView: rects.slice(0, 2).map((r) => r.left >= 0 && r.right <= window.innerWidth),
      allInView: rects.every((r) => r.left >= 0 && r.right <= window.innerWidth + 1),
      page: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(m.firstText).toBe('Auto');
  expect(m.secondText).toBe('None');
  expect(m.overflowX).not.toBe('auto');
  expect(m.scrollW, 'the row does not scroll sideways').toBeLessThanOrEqual(m.clientW + 1);
  expect(m.rows, 'two lines').toBe(2);
  expect(m.inView).toEqual([true, true]);
  expect(m.allInView).toBe(true);
  expect(m.page).toBeLessThanOrEqual(1);
  fs.mkdirSync('out/round-16', { recursive: true });
  await page.screenshot({ path: 'out/round-16/picker-phone.png', clip: { x: 0, y: Math.max(0, ((await picker.boundingBox())?.y ?? 0) - 200), width: 390, height: 520 } });
});
