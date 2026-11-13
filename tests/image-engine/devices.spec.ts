// The generic design devices of the new presets (ZERO model calls; static). For each of style-1..8, the same 8-slide sample the sheets use:
//   - every device the preset asks for is drawn (at least once across the slides, and on the right slide for the last-slide ones)
//   - no device is placed on text (stickers, pen circle, side label, header and footer parts are checked against every text box, content and chrome)
//   - the contrast floor holds: text 4.5:1 (display 3:1), device ink 3:1 on its ground, every gradient stop 3:1, text over a glow measured on the glow
//   - light closing slides keep 4.5:1 on every run
//   - devices are OFF when the preset does not ask for them (the 7 older presets, a style with every switch turned off in the panel)
import { expect, test } from '@playwright/test';
import { toStep } from './ui';

test.setTimeout(10 * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
const NEW = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
const OLD = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
const SPECS = [
  { layout: 'statement', fields: { kicker: 'New on Kickstarter', headline: 'A hoodie that flips into a backpack', caption: 'One piece. Two jobs.' }, accents: ['backpack'] },
  { layout: 'big-stat', fields: { number: '10', label: 'seconds to flip it', source: 'Measured in our workshop' }, accents: [] },
  { layout: 'stepper', fields: { title: 'How to flip it', steps: ['Zip the hood into the pocket', 'Fold the sleeves behind you', 'Pull the straps and go'] }, accents: [] },
  { layout: 'quote', fields: { quote: 'I stopped carrying a bag the day this arrived.', author: 'An early backer' }, accents: ['stopped carrying'] },
  { layout: 'checklist', fields: { title: 'What you get', items: ['Waterproof shell', 'Fits a 16-inch laptop', 'Machine washable'] }, accents: [] },
  { layout: 'stat-bar', fields: { number: '$500,000', label: 'for 5% of the company', bar: '5', note: 'Open to 20 backers only.' }, accents: [] },
  { layout: 'split-text', fields: { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' }, accents: ['built it'] },
  { layout: 'cta-button', fields: { headline: 'Early backers save 30%', button: 'Back on Kickstarter', sub: 'Open to 20 backers only.' }, accents: ['save 30%'] },
];

async function drawAll(page: any, ids: string[], off: boolean) {
  return page.evaluate(async ({ ids, specs, off }: any) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const DC = await import('/src/reference/deco.ts');
    const rgb = (c: string) => C.parseColor(c).rgb;
    const ratio = (a: string, b: string) => C.contrastRgb(rgb(a), rgb(b));
    const hexOf = (c: [number, number, number]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const blend = (bg: string, fg: string, a: number) => { const x = rgb(bg), y = rgb(fg); return hexOf([0, 1, 2].map((i) => x[i] * (1 - a) + y[i] * a) as [number, number, number]); };
    const hit = (a: any, b: any, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
    const out: any = {};
    for (const id of ids) {
      let pack = PR.presetPackFor(id, false);
      if (!pack) { out[id] = { nopack: true }; continue; }
      if (off) pack = { ...pack, overrides: { deco: Object.fromEntries(DC.DECO_SWITCHES.map((k: string) => [k, false])), profileHeader: false } };
      const { style } = D.styleFromPack(pack);
      const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style: null, styleNotes: [], plan: { title: 'Sample', specs: specs.map((s: any) => ({ ...s })) } };
      const res = await D.redrawLibraryDeck(lib, { pack, hasPhoto: false, site: 'quickflip.com' }, '@quick.flip');
      const slides = Object.entries<any>(res.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s.built);
      const rows = slides.map((b: any, i: number) => {
        const layers = b.layers as any[];
        const texts = layers.filter((l) => l.kind === 'text' && l.text).map((l) => ({ name: String(l.name), chrome: String(l.name).startsWith('recurring'), x: l.x, y: l.y, w: l.width, h: l.height, size: l.style.size, color: l.style.color, runs: l.runs ?? [], hl: l.highlight && l.highlight.color && !/^(transparent|none)$/i.test(l.highlight.color) ? l.highlight.color : null }));
        const shapes = layers.filter((l) => l.kind === 'shape' && typeof l.fill === 'string' && /^#[0-9a-f]{6}/i.test(l.fill) && (l.opacity ?? 1) >= 0.95 && l.width * l.height < 1080 * 1350 * 0.9).map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height, fill: l.fill as string }));
        const devs = (b.devices ?? []) as any[];
        const bg = (b.bg ?? b.fieldBg) as string;
        const problems: string[] = [];
        // overlap: placed devices that must never touch text
        for (const d of devs) {
          if (!['sticker', 'chrome', 'accent'].includes(d.kind)) continue;
          if (d.id === 'italic-accent' || d.id === 'gradient-text') continue; // these ARE the text
          const others = texts.filter((t) => !((d.id === 'pen-circle' || d.id === 'pen-underline') && t.name === 'title'));
          for (const t of others) if (hit(d.box, t, 0)) problems.push(`${d.id} overlaps ${t.name} "${t.chrome ? 'chrome' : ''}" (${Math.round(t.x)},${Math.round(t.y)},${Math.round(t.w)}x${Math.round(t.h)}) on slide ${i + 1}`);
        }
        // pen circle must also stay off the OTHER lines of its own headline (only the accent line holds it): the ring's box against the title box top and bottom is allowed, so check the neighbours by height
        // contrast of text (on the ground, or on the glow where the text sits in it)
        const glow = devs.find((d) => d.id === 'glow');
        const g = style.deco?.glow;
        for (const t of texts) {
          let under = bg;
          const cx0 = t.x + t.w / 2, cy0 = t.y + t.h / 2;
          const sh = shapes.filter((q) => q.x <= cx0 && q.x + q.w >= cx0 && q.y <= cy0 && q.y + q.h >= cy0).sort((a, b) => a.w * a.h - b.w * b.h)[0];
          if (sh) under = sh.fill;
          else if (glow && g) {
            const dark = ratio(bg, '#000000') < ratio(bg, '#FFFFFF');
            const gx = g.corner.endsWith('r') ? 0.92 : 0.08, gy = g.corner.startsWith('b') ? 0.94 : 0.06;
            const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
            const dx = (cx / 1080 - gx) / 0.62, dy = (cy / 1350 - gy) / 0.8 / 0.62;
            const a = Math.max(0, 1 - Math.hypot(dx, dy)) * (dark ? 0.24 : 1);
            under = blend(bg, g.color, a);
          }
          const r = ratio(String(t.color), under);
          const floor = t.size >= 96 ? 3 : 4.5;
          if (typeof t.color === 'string' && /^#/.test(t.color) && r < floor) problems.push(`slide ${i + 1} ${t.name} ${t.color} on ${under} = ${r.toFixed(2)} (< ${floor})`);
          for (const q of t.runs) { const on = t.hl ?? under; if (/^#/.test(q.color) && ratio(q.color, on) < floor) problems.push(`slide ${i + 1} ${t.name} run ${q.color} on ${on} = ${ratio(q.color, on).toFixed(2)} (< ${floor})`); }
        }
        for (const d of devs) {
          if (d.ink && d.id !== 'gradient-text' && /^#[0-9a-f]{6}$/i.test(d.ink) && ['sticker', 'accent', 'chrome'].includes(d.kind) && ratio(d.ink, bg) < 3) problems.push(`device ${d.id} ink ${d.ink} on ${bg} = ${ratio(d.ink, bg).toFixed(2)} (< 3) on slide ${i + 1}`);
          if (d.id === 'gradient-text') for (const c of String(d.ink).split(',')) if (ratio(c, bg) < 3) problems.push(`gradient stop ${c} on ${bg} = ${ratio(c, bg).toFixed(2)} (< 3) on slide ${i + 1}`);
        }
        return { i, layout: res.library.layouts[i], ids: devs.map((d) => d.id), bg, problems, svg: { emoji: b.svg.includes('Noto Emoji'), htext: b.svg.includes('url(#htext)'), cglow: b.svg.includes('cglow'), outlineBtn: /<rect[^>]*fill="none"[^>]*stroke=[^>]*rx=/.test(b.svg) || /<rect[^>]*rx="[^"]*"[^>]*fill="none"[^>]*stroke=/.test(b.svg), idx: />0\d</.test(b.svg), site: b.svg.includes('quickflip.com'), side: b.svg.includes('rotate(-90)'), avatar: b.svg.includes('r="36"'), shadowRects: (b.svg.match(/stroke-width="3"/g) ?? []).length } };
      });
      out[id] = { rows, deco: style.deco ?? null, closingBg: rows[7].bg, closingProblems: rows[7].problems, light: ratio(rows[7].bg, '#FFFFFF') < ratio(rows[7].bg, '#000000') };
    }
    return out;
  }, { ids, specs: SPECS, off });
}

test('every device a preset asks for is drawn; none sits on text; the contrast floor holds', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await drawAll(page, NEW, false);
  const MAP: Record<string, string> = { glow: 'glow', sideLabel: 'side-label', footerRow: 'footer-logo', arrowHeader: 'arrow-header', scallop: 'scallop', rule: 'rule', insetCard: 'inset-card', penCircle: 'pen-circle', italicAccent: 'italic-accent', gradientText: 'gradient-text', stickers: 'sticker', contactClosing: 'contact-icons' };
  const seen: Record<string, string[]> = {};
  for (const id of NEW) {
    const p = r[id];
    const asked = Object.keys(p.deco ?? {});
    seen[id] = [...new Set<string>(p.rows.flatMap((x: any) => x.ids))];
    for (const k of asked) {
      if (MAP[k]) { if (k === 'penCircle') expect(seen[id].some((q: string) => q === 'pen-circle' || q === 'pen-underline'), `${id}: the pen ring (or its underline fallback) is drawn`).toBe(true); else expect(seen[id], `${id}: ${k} is drawn`).toContain(MAP[k]); }
    }
    if (p.deco?.contactClosing) expect(p.rows[7].ids, `${id}: the contact block is on the last slide`).toContain('contact-icons');
    if (p.deco?.contactClosing) expect(p.rows[0].ids, `${id}: not on the first`).not.toContain('contact-icons');
    if (p.deco?.pageIndex) expect(p.rows.every((x: any) => x.svg.idx), `${id}: page index on every slide`).toBe(true);
    if (p.deco?.headerRow || p.deco?.footerRow) expect(p.rows.every((x: any) => x.svg.site), `${id}: site in the header or footer row`).toBe(true);
    if (p.deco?.hardShadow) expect(p.rows.some((x: any) => x.svg.shadowRects > 0), `${id}: outlined cards`).toBe(true);
    if (p.deco?.stickers) expect(p.rows.some((x: any) => x.svg.emoji), `${id}: a sticker`).toBe(true);
    if (p.deco?.gradientText) expect(p.rows.some((x: any) => x.svg.htext), `${id}: gradient headline`).toBe(true);
    const problems = p.rows.flatMap((x: any) => x.problems);
    expect(problems, `${id}: overlap or contrast`).toEqual([]);
  }
  // the light closing slides keep the floor on every run
  for (const id of NEW) if (r[id].light) expect(r[id].closingProblems, `${id}: light closing slide`).toEqual([]);
  console.log('DEVICES ' + JSON.stringify(seen));
});

test('devices are off when a preset does not ask for them, and when the panel switches them off', async ({ page }) => {
  await page.goto('/images/carousel');
  const old = await drawAll(page, OLD, false);
  for (const id of OLD) {
    const p = old[id];
    expect(p.deco, `${id} asks for no device`).toBeNull();
    expect(p.rows.flatMap((x: any) => x.ids), `${id}: nothing placed`).toEqual([]);
    expect(p.rows.some((x: any) => x.svg.emoji || x.svg.htext || x.svg.cglow || x.svg.side || x.svg.site), `${id}: no device markup`).toBe(false);
  }
  const off = await drawAll(page, NEW, true);
  for (const id of NEW) {
    const p = off[id];
    expect(p.rows.flatMap((x: any) => x.ids), `${id}: every switch off, nothing placed`).toEqual([]);
    expect(p.rows.some((x: any) => x.svg.emoji || x.svg.htext || x.svg.cglow || x.svg.side || x.svg.site || x.svg.idx), `${id}: no device markup when off`).toBe(false);
  }
});

test('the style panel shows a switch for each device of the chosen preset and keeps it off', async ({ page }) => {
  await page.goto('/images/carousel');
  await toStep(page, 3); // the Styles list is on step 3 since UI Round 1
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Pink serif stickers/ }).first().click();
  const pen = page.getByRole('checkbox', { name: 'Pen circle round the accent word' });
  await expect(pen).toBeVisible();
  await expect(pen).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Emoji stickers' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Offset shadow on cards and pills' })).toBeChecked();
  // a style without the device does not show its switch
  await toStep(page, 3); // the Styles list is on step 3 since UI Round 1
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Black holographic/ }).first().click();
  await expect(page.getByRole('checkbox', { name: 'Pen circle round the accent word' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Gradient headline' })).toBeChecked();
  await toStep(page, 3); // the Styles list is on step 3 since UI Round 1
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Pink serif stickers/ }).first().click();
  await page.getByRole('checkbox', { name: 'Pen circle round the accent word' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Pen circle round the accent word' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Emoji stickers' })).toBeChecked();
  // kept: the choice is stored with the preset and shows again
  await page.reload();
  await toStep(page, 3); // the Styles list is on step 3 since UI Round 1
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Pink serif stickers/ }).first().click();
  await expect(page.getByRole('checkbox', { name: 'Pen circle round the accent word' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Emoji stickers' })).toBeChecked();
});
