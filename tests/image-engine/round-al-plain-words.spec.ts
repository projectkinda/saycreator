// Round AL part 1: the Edit slides view speaks plain words. On every slide of a deck (cover, numbered item, photo, statement, prose, split text, closing) the visible text of the four
// tabs, their tooltips, the message after a layout change and the Undo tooltip hold no layout id ("split-half"), no quoted field id ("lead", "numeral"), and none of the engine words
// variant, cut, invert, density, plane, kicker. A FAKE writer makes the deck (one answer); every later step is code only: ZERO model calls.
import { expect, test, type Page } from '@playwright/test';
import { deckDrawn, openTab, toStep } from './ui';

test.setTimeout(6 * 60_000);
test.use({ viewport: { width: 390, height: 844 } });

const TEXT = "5 small habits that make your photos look less like everyone else's.\n\n1. Shoot at golden hour. Sunrise and the hour before sunset do more than any filter.\n2. Look for reflections. Puddles, windows and wet streets give you a second picture for free.\n3. Get low or get high. Eye level is what everyone else does.\n4. Leave empty space. A small subject in a big scene feels like a story.\n5. Pick one detail. A single leaf on a table can beat a whole landscape.\n\nSave this for your next shoot, and tell me which one you'll try first.";
const S = (layout: string, fields: Record<string, string>) => ({ layout, fields, accents: [] as string[] });
const WRITER = JSON.stringify({
  title: '5 small habits',
  slides: [
    S('statement-card', { headline: "5 small habits that make your photos look less like everyone else's." }),
    S('listicle-numeral', { numeral: '1', title: 'Shoot at golden hour', body: 'Sunrise and the hour before sunset do more than any filter.' }),
    S('photo-cover', { headline: 'Look for reflections', intro: 'Puddles, windows and wet streets give you a second picture for free.' }),
    S('statement', { headline: 'Get low or get high.', caption: 'Eye level is what everyone else does.' }),
    S('prose', { heading: 'Leave empty space.', p1: 'A small subject in a big scene feels like a story.' }),
    S('split-text', { headline: 'Pick one detail.', paragraph: 'A single leaf on a table can beat a whole landscape.' }),
    S('cta-pair', { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me', line2: "Tell me which one you'll try first." }),
  ],
});

/** A photo-like generated picture (gradient and small marks, no stock) as file bytes. */
async function picture(page: Page, w: number, h: number) {
  const b64 = await page.evaluate(async ({ w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2471a3'); gr.addColorStop(1, '#ffe9c4'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 60%, ${20 + rnd() * 60}%, 0.55)`; const s = (0.004 + rnd() * 0.03) * Math.min(w, h); g.fillRect(rnd() * w, rnd() * h, s, s); }
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
  }, { w, h });
  return { name: 'wide.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

test('AL1 the Edit slides view on every kind of slide: no layout id, no quoted field id, no engine word (variant, cut, invert, density, plane, kicker); a layout change is told by its plain name', async ({ page }) => {
  let calls = 0;
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  const write = (r: any) => { calls++; return r.fulfill({ json: { text: WRITER, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  await page.getByLabel('Choose images for the slides').setInputFiles([await picture(page, 1500, 1000)]);
  await expect(page.getByTestId('image-0')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await deckDrawn(page, 7);
  const words = await page.evaluate(async () => {
    const L: any = await import('/src/carousel/layouts/index.ts');
    const ids = (L.LAYOUT_IDS as string[]).filter((x) => x.includes('-'));
    const fields = [...new Set((L.LAYOUT_IDS as string[]).flatMap((id) => L.layoutDef(id).fields.map((f: any) => f.name as string)))];
    return { ids, fields };
  });
  const texts: { where: string; text: string }[] = [];
  const grab = async (where: string) => {
    const t = await page.getByTestId('edit-view').evaluate((v) => [v.querySelector('.cr-edit-bar')?.textContent ?? '', (v.querySelector('#cr-tabpanel') as HTMLElement | null)?.innerText ?? '', ...[...v.querySelectorAll('#cr-tabpanel [title]')].map((e) => e.getAttribute('title') ?? '')].join('\n'));
    texts.push({ where, text: t });
  };
  for (let n = 1; n <= 7; n++) {
    await openTab(page, 'Layout', n);
    const gal = page.getByTestId(`gallery-${n - 1}`);
    await gal.scrollIntoViewIfNeeded();
    await expect(gal).not.toHaveAttribute('data-ready-ms', '', { timeout: 60_000 });
    // Round AM part 4: the reasons under "Why not the others" are read too
    const off = page.getByTestId(`gallery-off-${n - 1}`);
    if (await off.count()) { await off.locator('summary').click(); await expect(off).toHaveAttribute('open', ''); }
    await grab(`slide ${n} Layout`);
    for (const tab of ['Text', 'Pictures', 'Fine-tune'] as const) { await openTab(page, tab, n); await grab(`slide ${n} ${tab}`); }
  }
  // a layout change on slide 6: the message and the Undo tooltip name the layout in plain words
  await openTab(page, 'Layout', 6);
  const tile = page.locator('[data-testid="gallery-5"] button[data-state="ready"][data-testid^="gal-"]:not([data-testid^="gal-split-text"])').first();
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  const status = page.getByTestId('gallery-5').getByRole('status');
  await expect(status).toHaveText(/^Slide 6 is now [A-Z][^:]*: no model call\. Undo brings the old one back\.$/, { timeout: 60_000 });
  texts.push({ where: 'after a change', text: (await status.textContent()) ?? '' });
  texts.push({ where: 'Undo tooltip', text: (await page.getByRole('button', { name: /^Undo/ }).first().getAttribute('title')) ?? '' });
  await grab('slide 6 Layout after the change');

  const bad: string[] = [];
  const engine = /\b(variants?|cuts?|invert(ed)?|density|planes?|kicker)\b/i;
  for (const { where, text } of texts) {
    for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const id = words.ids.find((x) => new RegExp(`(^|[^\\w-])${x}([^\\w-]|$)`).test(line));
      if (id) bad.push(`${where}: layout id "${id}" in: ${line}`);
      const q = [...line.matchAll(/"(\w+)"/g)].map((m) => m[1]).find((w) => words.fields.includes(w));
      if (q) bad.push(`${where}: field id "${q}" in: ${line}`);
      const e = engine.exec(line);
      if (e) bad.push(`${where}: engine word "${e[0]}" in: ${line}`);
    }
  }
  expect(bad, bad.join('\n')).toEqual([]);
  // Round AM part 4: no reason that says nothing ("Works only with text written for it."), no part the slide does not have ("The author is ..."), and a line shown cut short is cut
  // at a word boundary and ends with "…" (a line that fits is whole)
  const all = texts.map((t) => t.text).join('\n');
  expect(all).not.toContain('Works only with text written for it');
  expect(all).not.toMatch(/\bThe author (is|has)\b/);
  const lines = (JSON.parse(WRITER).slides as any[]).flatMap((s) => Object.values(s.fields) as string[]).map((x) => String(x).trim());
  const cuts = [...all.matchAll(/(?:Leaves out|Left out of this layout): ((?:"[^"]*"(?:, )?)+)/g)].flatMap((m) => [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]));
  for (const c of cuts) {
    if (c.endsWith('…')) {
      const head = c.slice(0, -1);
      expect(head.length, `cut to 40 letters: ${c}`).toBeLessThanOrEqual(40);
      expect(lines.some((l) => l.startsWith(head) && /[\s,;:.\-–—]/.test(l[head.length] ?? ' ')), `cut at a word boundary: ${c}`).toBe(true);
    } else expect(c.length <= 40 && lines.some((l) => l === c || l.includes(c) || c.includes(l)), `shown whole (the deck may have settled a button to the text's phrase): ${c}`).toBe(true);
  }
  expect(texts.find((t) => t.where === 'Undo tooltip')!.text).toMatch(/Undoes: Change slide 6 to [A-Z]/);
  expect(calls, 'the fake writer is asked once; the tabs and the change cost nothing').toBe(1);
});
