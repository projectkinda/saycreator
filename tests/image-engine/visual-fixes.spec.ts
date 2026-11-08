// Three visual fixes from the v8 sheet (ZERO model calls; static images):
//   1. style-5 closing slide and slide 2 numeral: the RENDERED ink (pixels of the drawn picture, not the declared colour) reads 4.5:1 on the page, the accent in a medium italic
//   2. style-8: the thin rule does not shrink the content: slides 3, 5 and 6 are drawn at the same size and fill with the rule on or off; the rule sits above the content and crosses nothing
//   3. style-7: a sticker keeps a clear gap (one line height of the text it is next to, and from the headline's whole box), not just no overlap
import { expect, test } from '@playwright/test';

test.setTimeout(10 * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
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

async function draw(page: any, id: string, o: { ruleOff?: boolean; measure?: number[] }) {
  return page.evaluate(async ({ id, specs, o }: any) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    let pack = PR.presetPackFor(id, false);
    if (o.ruleOff) pack = { ...pack, overrides: { deco: { rule: false } } };
    const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style: null, styleNotes: [], plan: { title: 'Sample', specs: specs.map((s: any) => ({ ...s })) } };
    const res = await D.redrawLibraryDeck(lib, { pack, hasPhoto: false }, '@quick.flip');
    const slides = Object.entries<any>(res.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s.built);
    const rgb = (c: string) => C.parseColor(c).rgb;
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const cr = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const out: any[] = [];
    for (let i = 0; i < slides.length; i++) {
      const b = slides[i];
      const layers = b.layers as any[];
      const texts = layers.filter((l) => l.kind === 'text' && l.text).map((l) => ({ name: String(l.name), chrome: String(l.name).startsWith('recurring'), x: l.x, y: l.y, w: l.width, h: l.height, size: l.style.size, lh: l.style.lineHeight ?? 1.15, color: l.style.color, text: l.text }));
      const shapes = layers.filter((l) => l.kind === 'shape' && !/background/.test(String(l.name)) && l.width * l.height < 1080 * 1350 * 0.5 && !String(l.name).startsWith('recurring')).map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height }));
      const row: any = { i, layout: res.library.layouts[i], texts, shapes, devices: b.devices ?? [], bg: b.bg, svgHasItalic: /EB Garamond Italic/.test(b.svg) };
      if (o.measure?.includes(i)) {
        const bmp = await createImageBitmap(await F.svgToPng(b.svg, 1080));
        const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
        const g = cv.getContext('2d')!; g.drawImage(bmp, 0, 0);
        const sc = bmp.width / 1080;
        const ink = (box: any, ground: number[]) => {
          const x0 = Math.max(0, Math.floor(box.x * sc)), y0 = Math.max(0, Math.floor(box.y * sc));
          const w = Math.max(1, Math.min(cv.width - x0, Math.ceil(box.w * sc))), h = Math.max(1, Math.min(cv.height - y0, Math.ceil(box.h * sc)));
          const d = g.getImageData(x0, y0, w, h).data;
          const px: { c: number[]; r: number }[] = [];
          for (let k = 0; k < d.length; k += 4) { const c = [d[k], d[k + 1], d[k + 2]]; const r = cr(c, ground); if (r > 1.6) px.push({ c, r }); }
          if (px.length < 12) return null;
          px.sort((a, b2) => b2.r - a.r);
          const core = px.slice(0, Math.max(6, Math.round(px.length * 0.15)));
          const m = [0, 1, 2].map((q) => core.reduce((s, p) => s + p.c[q], 0) / core.length);
          return { ratio: Math.round(cr(m, ground) * 100) / 100, ink: '#' + m.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') };
        };
        const ground = rgb(b.bg);
        row.rendered = texts.filter((t) => !t.chrome).map((t) => ({ name: t.name, text: String(t.text).slice(0, 24), size: t.size, ...ink(t, ground) }));
        row.renderedDevices = (b.devices ?? []).filter((d: any) => d.id === 'italic-accent').map((d: any) => ({ id: d.id, ...ink(d.box, ground) }));
      }
      out.push(row);
    }
    return { rows: out, deco: pack.look?.deco ?? null };
  }, { id, specs: SPECS, o });
}

test('style-5: the rendered ink of the closing slide and of the slide 2 numeral reads 4.5:1, the accent is a medium italic', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await draw(page, 'style-5', { measure: [1, 7] });
  const closing = r.rows[7];
  console.log('S5 CLOSING ' + JSON.stringify(closing.rendered) + ' ITALIC ' + JSON.stringify(closing.renderedDevices));
  console.log('S5 SLIDE2 ' + JSON.stringify(r.rows[1].rendered));
  expect(closing.svgHasItalic, 'the accent run is set in EB Garamond Italic (medium), not the thin italic').toBe(true);
  expect(closing.renderedDevices.length, 'the italic accent is on the closing slide').toBeGreaterThan(0);
  for (const t of [...closing.rendered, ...closing.renderedDevices, ...r.rows[1].rendered]) {
    if (t.ratio === undefined) continue;
    expect(t.ratio, `rendered ink of "${t.text ?? t.id}" (${t.ink}) on the page`).toBeGreaterThanOrEqual(4.5);
  }
  const num = r.rows[1].rendered.find((t: any) => t.size >= 250);
  expect(num, 'the numeral was measured').toBeTruthy();
  expect(num.ratio).toBeGreaterThanOrEqual(4.5);
});

test('style-8: the rule does not shrink the content; slides 3, 5 and 6 keep their size and fill', async ({ page }) => {
  await page.goto('/images/carousel');
  const on = await draw(page, 'style-8', {});
  const off = await draw(page, 'style-8', { ruleOff: true });
  const fill = (row: any) => {
    const c = [...row.texts.filter((t: any) => !t.chrome), ...row.shapes];
    const top = Math.min(...c.map((b: any) => b.y)), bot = Math.max(...c.map((b: any) => b.y + b.h));
    return { top, bot, fill: Math.round(((bot - top) / 1000) * 100) / 100 };
  };
  const minSize = (row: any) => Math.min(...row.texts.filter((t: any) => !t.chrome).map((t: any) => t.size));
  const lines: string[] = [];
  for (const i of [2, 4, 5]) {
    const a = fill(on.rows[i]), b = fill(off.rows[i]);
    lines.push(`slide ${i + 1} ${on.rows[i].layout}: fill ${a.fill} (rule off ${b.fill}), min text ${minSize(on.rows[i])} (rule off ${minSize(off.rows[i])}), content ${a.top}..${a.bot}`);
    expect(minSize(on.rows[i]), `slide ${i + 1}: the rule does not shrink the text`).toBe(minSize(off.rows[i]));
    expect(a.fill, `slide ${i + 1}: the content is as large with the rule`).toBeGreaterThanOrEqual(b.fill - 0.01);
    expect(minSize(on.rows[i]), `slide ${i + 1}: minimum text size`).toBeGreaterThanOrEqual(32);
    // the rule: just above the content, crossing no text and no shape
    const rule = on.rows[i].devices.find((d: any) => d.id === 'rule');
    expect(rule, `slide ${i + 1}: the rule is drawn`).toBeTruthy();
    expect(rule.box.y + rule.box.h, 'the rule is above the content').toBeLessThanOrEqual(a.top);
  }
  console.log('S8 FILL ' + lines.join(' | '));
  for (let i = 0; i < 8; i++) expect(on.rows[i].texts.filter((t: any) => !t.chrome).every((t: any) => t.size >= 32), `slide ${i + 1} sizes`).toBe(true);
});

test('style-7: a sticker keeps a clear gap of one line height from every text and from the headline box', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await draw(page, 'style-7', {});
  let n = 0;
  const gapBetween = (a: any, b: any) => Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
  const seen: string[] = [];
  for (const row of r.rows) {
    const st = row.devices.find((d: any) => d.id === 'sticker');
    if (!st) { seen.push(`slide ${row.i + 1}: none`); continue; }
    n++;
    let min = 9999;
    for (const t of row.texts) {
      const gap = gapBetween(st.box, t);
      const need = Math.round(t.size * t.lh);
      min = Math.min(min, gap - need);
      expect(gap, `slide ${row.i + 1}: sticker to ${t.name} "${String(t.text).slice(0, 18)}" (needs ${need})`).toBeGreaterThanOrEqual(need);
    }
    const title = row.texts.find((t: any) => t.name === 'title');
    if (title) expect(gapBetween(st.box, title), `slide ${row.i + 1}: clear of the headline box`).toBeGreaterThanOrEqual(Math.round(title.size * title.lh));
    for (const s of row.shapes) expect(gapBetween(st.box, s), `slide ${row.i + 1}: clear of shapes`).toBeGreaterThanOrEqual(24);
    seen.push(`slide ${row.i + 1}: sticker at ${Math.round(st.box.x)},${Math.round(st.box.y)} (spare gap ${min})`);
  }
  console.log('S7 STICKERS ' + n + ' of 8: ' + seen.join('; '));
  expect(n, 'stickers are still drawn where there is room').toBeGreaterThanOrEqual(2);
});
