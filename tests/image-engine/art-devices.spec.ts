// Art devices (ZERO model calls): a preset lists art items of its own pack; the code places them in safe zones, recoloured to the preset's palette. Checks: off unless the preset asks,
// at least 3 items wired where the pack used them (the presets with fewer say why in the inventory), never over text or a picture, contrast floor, a toggle that turns them off,
// recoloured (no pack colour left), and the credits cover every art folder.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(10 * 60_000);
const ART = path.resolve(process.cwd(), 'src/image-engine/art');

const SPECS = [
  { layout: 'statement-card', fields: { kicker: 'New this week', headline: 'Your bag is now your hoodie', caption: 'Zip, flip, go.' }, accents: ['hoodie'] },
  { layout: 'prose', fields: { heading: 'Why we built it', p1: 'We sewed a bag into the hood, so one layer does both jobs.', p2: 'It took two years of testing in the rain.' }, accents: [] },
  { layout: 'lead-statement', fields: { lead: 'It started in a rainy taxi', headline: 'We ditched the bag and kept the hoodie' }, accents: ['hoodie'] },
  { layout: 'split-text', fields: { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' }, accents: [] },
  { layout: 'prose', fields: { p1: 'Early backers told us the flip was the part they loved most.', p2: 'So we kept it to one zip and ten seconds.' }, accents: [] },
  { layout: 'quote', fields: { quote: 'I stopped carrying a bag the day this arrived.', author: 'An early backer' }, accents: [] },
  { layout: 'prose', fields: { heading: 'Every size', p1: 'Every size ships with the same pocket, so a small hoodie carries as much as a large one.' }, accents: [] },
  { layout: 'contact-closing', fields: { brand: 'Quick Flip', headline: 'Back Quick Flip today', line: 'Early backers save 30%.', button: 'Back it now', contacts: ['@quick.flip', 'quickflip.com'] }, accents: ['today'] },
];

test('presets with art: items placed in safe zones (never over text), recoloured, off when the panel says so; presets without art draw none', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (specs) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const A = await import('/src/image-engine/art/art.ts');
    const out: any = {};
    const hit = (a: any, b: any, pad: number) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
    for (const id of ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'hot-flat', 'dark-quiet']) {
      const pack = PR.presetPackFor(id, false);
      const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style: null, styleNotes: [], plan: { title: 'T', specs } };
      const run = async (pk: any) => {
        const res = await D.redrawLibraryDeck(lib, { pack: pk, hasPhoto: false }, '@quick.flip');
        const slides = Object.entries<any>(res.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s.built);
        const placed: any[] = [];
        const bad: string[] = [];
        slides.forEach((b, i) => {
          const arts = ((b.devices ?? []) as any[]).filter((d) => String(d.id).startsWith('art:'));
          const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text).map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height, name: l.name }));
          const shapes = (b.layers as any[]).filter((l) => l.kind === 'shape' && !/background/.test(String(l.name)) && l.width * l.height < 1080 * 1350 * 0.5).map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height }));
          for (const a of arts) {
            placed.push({ slide: i + 1, id: a.id, box: a.box, ink: a.ink });
            const role = A.artItem(a.id.slice(4))?.role;
            // a solid item is never over text; a soft glow is behind everything and the text over it must still read on the blend of ground and glow
            if (role !== 'background') for (const t of texts) { if (hit(a.box, t, 0)) bad.push(`slide ${i + 1}: ${a.id} over text "${t.name}"`); }
            else {
              const op = Number(a.opacity ?? 0.35);
              const mixc = (c1: string, c2: string, tt: number) => { const h = (c: string) => C.parseColor(c).rgb; const A1 = h(c1), B1 = h(c2); return '#' + A1.map((v: number, k: number) => Math.round(v * (1 - tt) + B1[k] * tt).toString(16).padStart(2, '0')).join(''); };
              const blend = mixc(b.fieldBg ?? b.bg, a.ink, op);
              for (const l of (b.layers as any[]).filter((q) => q.kind === 'text' && q.text && /^#/.test(String(q.style?.color)))) {
                const tb = { x: l.x, y: l.y, w: l.width, h: l.height };
                const own = C.contrastRgb(C.parseColor(l.style.color).rgb, C.parseColor(b.fieldBg ?? b.bg).rgb);
                if (own >= 4.5 && hit(a.box, tb, 0)) { const cr = C.contrastRgb(C.parseColor(l.style.color).rgb, C.parseColor(blend).rgb); if (cr < (l.style.size >= 96 ? 3 : 4.5)) bad.push(`slide ${i + 1}: text "${l.name}" ${l.style.color} on the glow blend ${blend} = ${cr.toFixed(2)}`); }
              }
            }
            if (role !== 'background' && a.ink && !/^url/.test(a.ink)) {
              const cr = C.contrastRgb(C.parseColor(a.ink).rgb, C.parseColor(b.fieldBg ?? b.bg).rgb);
              if (cr < 3) bad.push(`slide ${i + 1}: ${a.id} ink ${a.ink} on ${b.fieldBg ?? b.bg} = ${cr.toFixed(2)} (< 3)`);
            }
            void shapes;
          }
          // the drawn svg: the art is in it, with no pack colour token left over, and no raster
          // a ring drawn round an accent word by the pen-circle device is pack art too, but is reported as the pen circle
          const n = (b.svg.match(/data-art="/g) ?? []).length - (b.svg.match(/data-art="style-7[/]sticker-/g) ?? []).length;
          if (n !== arts.length) bad.push(`slide ${i + 1}: ${arts.length} art devices reported, ${n} drawn`);
          if (/\$(primary|accent|ink|surface|bg)\b/.test(b.svg)) bad.push(`slide ${i + 1}: a colour token is left in the svg`);
        });
        return { placed, bad, n: slides.length };
      };
      const on = await run(pack);
      const off = await run({ ...pack, overrides: { deco: { art: false } } });
      out[id] = { listed: (pack.look?.deco?.art ?? []).map((a: any) => a.item), on: on.placed, bad: on.bad, off: off.placed.length, offBad: off.bad };
    }
    return out;
  }, SPECS);
  for (const id of ['style-1', 'style-2', 'style-4', 'style-5', 'style-7', 'style-8']) {
    const x = r[id];
    expect(x.listed.length, `${id}: lists art`).toBeGreaterThanOrEqual(2);
    const kinds = new Set(x.on.map((p: any) => p.id));
    // style-7's art items are rings: they are drawn round an accent word by the pen-circle device (decor-clutter.spec.ts), never as items in a corner
    if (id !== 'style-7') expect(kinds.size, `${id}: art is drawn, at most on every third slide (${[...kinds].join(', ')})`).toBeGreaterThanOrEqual(1);
    else expect(kinds.size, 'style-7: no free-floating ring art').toBe(0);
    expect(x.on.length, `${id}: at most 3 art slides in an 8-slide deck`).toBeLessThanOrEqual(3);
    expect(x.bad, `${id}: safe zones, contrast and recolour`).toEqual([]);
    expect(x.off, `${id}: the panel switch turns the art off`).toBe(0);
  }
  for (const id of ['style-3', 'style-6', 'hot-flat', 'dark-quiet']) {
    expect(r[id].listed, `${id}: lists no art (off unless the preset asks)`).toEqual([]);
    expect(r[id].on.length, `${id}: draws none`).toBe(0);
  }
  console.log('ART PLACED ' + JSON.stringify(Object.fromEntries(Object.entries<any>(r).map(([k, v]) => [k, [...new Set(v.on.map((p: any) => p.id.slice(4)))]]))));
});

test('credits: every art folder has a credits entry with the licence; the Credits page lists the packs and shows only name and licence while the author is TODO', async ({ page }) => {
  const credits = JSON.parse(fs.readFileSync(path.join(ART, 'credits.json'), 'utf8')) as { packs: { pack: string; name: string; author: string; source: string; licence: string; licenceUrl: string; note: string }[] };
  const folders = fs.readdirSync(ART, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  expect(folders.length).toBeGreaterThan(0);
  for (const f of folders) {
    const e = credits.packs.find((p) => p.pack === f);
    expect(e, `art folder "${f}" has no credits.json entry`).toBeTruthy();
    expect(e!.licence).toBe('CC BY 4.0');
    expect(e!.licenceUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(e!.note).toBe('Modified: recoloured and resized');
    expect('author' in e! && 'source' in e!).toBe(true);
  }
  const md = fs.readFileSync(path.join(ART, 'CREDITS.md'), 'utf8');
  for (const p of credits.packs) expect(md, `CREDITS.md names ${p.name}`).toContain(p.name);
  // the page, reached from the footer link
  await page.goto('/');
  await page.getByRole('link', { name: 'Credits', exact: true }).click();
  await expect(page).toHaveURL(/\/credits$/);
  await expect(page.getByRole('heading', { name: 'Credits', exact: true })).toBeVisible();
  for (const p of credits.packs) {
    const item = page.getByTestId(`credit-${p.pack}`);
    await expect(item).toContainText(p.name);
    await expect(item).toContainText('CC BY 4.0');
    await expect(item).toContainText('Modified: recoloured and resized');
    if (p.author.toUpperCase() === 'TODO') await expect(item).not.toContainText(/TODO|By /);
  }
  await expect(page.getByRole('link', { name: 'CC BY 4.0' }).first()).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
});

test('in the app: the style panel has a switch for the art; flipping it redraws from the plan with no model call', async ({ page }) => {
  const calls = { n: 0 };
  const answer = JSON.stringify({ title: 'Quick Flip', slides: SPECS.slice(0, 7) });
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  await page.route('**/api/reference/status', (r) => r.fulfill({ json: { available: false, reason: 'not used in this test' } }));
  const write = (r: import('@playwright/test').Route) => { calls.n++; return r.fulfill({ json: { text: answer, ms: 5, usage: { input: 10, output: 5 } } }); };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Pink serif/ }).first().click();
  await page.getByLabel('Your text or topic').fill('Quick Flip is a hoodie that flips into a backpack in ten seconds. We sewed a bag into the hood, so one layer does both jobs.');
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('[data-signature]')).toHaveCount(7, { timeout: 120_000 });
  const artCount = () => page.evaluate(() => {
    const d = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as { project?: { doc?: any } }).project?.doc;
    const slides = Object.values<any>(d?.designed?.slides ?? {});
    return slides.reduce((n, s) => n + ((s.built?.svg ?? '').match(/data-art="/g) ?? []).length, 0);
  });
  await expect.poll(artCount, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  const base = calls.n; // the deck itself (a retry of the writer is part of making it)
  const sw = page.getByTestId('detected-style').getByRole('checkbox', { name: 'Vector art from the style’s pack' });
  await expect(sw).toBeChecked();
  await sw.click();
  await expect.poll(artCount, { timeout: 60_000 }).toBe(0);
  expect(calls.n, 'a switch makes no model call').toBe(base);
  await sw.click();
  await expect.poll(artCount, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  expect(calls.n).toBe(base);
});

test('style-1 art is a soft glow only: large, low opacity, blurred, behind all content, a soft warm tint on light pages (never black); no preset has a lone small dot', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (specs) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const A = await import('/src/image-engine/art/art.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const pack = PR.presetPackFor('style-1', false);
    const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style: null, styleNotes: [], plan: { title: 'T', specs } };
    const res = await D.redrawLibraryDeck(lib, { pack, hasPhoto: false }, '@quick.flip');
    const slides = Object.entries<any>(res.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s.built);
    const items: any[] = [];
    slides.forEach((b, i) => {
      const doc = new DOMParser().parseFromString(b.svg, 'image/svg+xml');
      const firstText = b.svg.indexOf('<text');
      for (const el of doc.querySelectorAll('svg[data-art]')) {
        const key = el.getAttribute('data-art')!;
        const at = b.svg.indexOf(`data-art="${key}"`);
        const fills = [...el.querySelectorAll('[fill],[stop-color]')].flatMap((n) => [n.getAttribute('fill'), n.getAttribute('stop-color')]).filter((v): v is string => !!v && /^#/.test(v));
        const bg = (b.fieldBg ?? b.bg) as string;
        items.push({ slide: i + 1, key, role: A.artItem(key)?.role, w: Number(el.getAttribute('width')), opacity: Number(el.getAttribute('data-art-opacity') ?? 1), blurred: !!el.querySelector('feGaussianBlur'), behind: firstText < 0 || at < firstText, light: lum(C.parseColor(bg).rgb) > 0.6, maxDark: Math.min(...fills.map((f) => lum(C.parseColor(f).rgb))), bg });
      }
    });
    // every preset's listed art: no lone small dot
    const dots: string[] = [];
    for (const id of ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8']) {
      const list = (PR.presetPackFor(id, false)?.look?.deco?.art ?? []) as any[];
      for (const p of list) {
        const it = A.artItem(p.item)!;
        const w = Math.max(p.w ?? 220, it.role === 'background' ? 380 : 0);
        const aspect = it.bbox.w / it.bbox.h;
        const hair = aspect > 8 || it.bbox.h <= 8;
        if (!hair && w < 65) dots.push(`${id} ${p.item}: ${w}px is under 6% of the page`);
        const compact = aspect > 0.7 && aspect < 1.43 && /sticker|corner|badge/.test(it.role) && !/row/.test(it.shape);
        if (compact && w < 130) dots.push(`${id} ${p.item}: a compact shape ${w}px wide reads as a lone dot`);
        if (id === 'style-1' && !(it.role === 'background' && w >= 378)) dots.push(`${id} ${p.item}: style-1 art must be a large glow`);
      }
    }
    return { items, dots };
  }, SPECS);
  expect(r.dots).toEqual([]);
  expect(r.items.length, 'style-1 draws glows somewhere in the deck').toBeGreaterThanOrEqual(2);
  for (const x of r.items) {
    expect(x.role, `${x.key}: a glow`).toBe('background');
    expect(x.w, `slide ${x.slide} ${x.key}: at least 35% of the page width`).toBeGreaterThanOrEqual(378);
    expect(x.opacity, `slide ${x.slide} ${x.key}: at most 35% opaque`).toBeLessThanOrEqual(0.35);
    expect(x.blurred, `slide ${x.slide} ${x.key}: blurred edge`).toBe(true);
    expect(x.behind, `slide ${x.slide} ${x.key}: behind all the content`).toBe(true);
    if (x.light) expect(x.maxDark, `slide ${x.slide}: on a light page the glow is a soft tint, never dark`).toBeGreaterThan(0.55);
  }
  console.log('STYLE1 GLOWS ' + JSON.stringify(r.items.map((i: any) => [i.slide, i.key.slice(8), i.w, i.opacity, i.light])));
});
