// Round 12 A: every layout of the library x all 15 styles x three text sizes (short, long, worst case) x both variants (the picture layouts also with a tall, a wide and a square picture) is drawn the way a
// deck draws it (drawOne), and every text element's REAL box (the lines the engine lays out) is measured. A drawing the engine itself refused is a layout that is "not chosen" for that text and is not a
// failure; a drawing the engine accepted whose text goes outside the slide minus the 48 px margin, overlaps the page counter or the swipe footer, overlaps another text, or does not fit its own box, is.
// The text is the layout's own legal maximum (each field is cut at its declared character / word limit): the words are never cut to make a drawing fit.
// Failures are written to out/round-12/text-fits-failures.md. A fake provider only: no model is called.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(30 * 60_000);
const OUT = 'out/round-12';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const STYLES = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
const TMP = `${OUT}/.tf`;

for (const style of STYLES) {
  test(`text fits: every layout in ${style}, three text sizes, both variants`, async ({ page }) => {
    await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
    await page.goto('/images/carousel');
    await page.evaluate(HELP);
    const r: any = await page.evaluate(async (style) => {
      const H = (window as any).__H;
      const L: any = await import('/src/carousel/layouts/index.ts');
      const T: any = await import('/src/image-engine/draw/text.ts');
      const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
      const WORDS = 'people save notes and never open them again because a second brain keeps ideas where you can find them later so the week feels lighter and every project starts with a clear next step instead of a blank page'.split(' ');
      const make = (n: number, seed: number) => Array.from({ length: n }, (_, i) => WORDS[(seed + i * 7) % WORDS.length]).join(' ');
      const cut = (t: string, max: number, maxWords?: number) => { let w = t.split(' '); if (maxWords) w = w.slice(0, maxWords); let o = ''; for (const x of w) { if ((o ? o + ' ' + x : x).length > max) break; o = o ? o + ' ' + x : x; } return o || w[0].slice(0, max); };
      const HEAD = new Set(['headline', 'title', 'heading', 'question', 'quote', 'lead', 'statement']);
      const SIZES: Record<string, { head: number; body: number; item: number; quote: number }> = { short: { head: 4, body: 10, item: 3, quote: 8 }, long: { head: 12, body: 60, item: 6, quote: 30 }, worst: { head: 14, body: 70, item: 8, quote: 41 } };
      const fieldsFor = (def: any, size: string, pic: string | null, seed: number) => {
        const sz = SIZES[size];
        const f: any = { ...def.samples.normal };
        for (const fd of def.fields) {
          if (fd.image) { if (pic) { const s = H.SHAPES[pic]; f[fd.name] = H.IM.makeRef({ id: pic, w: s[0], h: s[1], ...(s[0] / s[1] <= 0.5 ? { fy: 0.1 } : {}) }); } else delete f[fd.name]; continue; }
          if (fd.percent || fd.max <= 14) continue; // a numeral, a label: the layout's own sample
          if (fd.list) { const n = Math.max(fd.list.min ?? 2, Math.min(fd.list.max ?? 5, 5)); f[fd.name] = Array.from({ length: n }, (_, i) => cut(make(sz.item, seed + i * 3), fd.max, fd.maxWords)); continue; }
          const quote = fd.name === 'quote';
          const words = quote ? sz.quote : HEAD.has(fd.name) ? sz.head : Math.max(1, Math.min(sz.body, Math.floor(fd.max / 6)));
          let t = make(words, seed);
          if (quote && size === 'worst') t = (t + ' ' + make(30, seed + 3)).slice(0, 240).replace(/\s+\S*$/, '');
          f[fd.name] = cut(t, fd.max, fd.maxWords);
        }
        return f;
      };
      const boxOf = (l: any) => {
        const b = T.layoutText(l);
        if (!b.lines.length) return null;
        const xs = b.lines.map((q: any) => [l.x + q.x, l.x + q.x + q.width]);
        return { x0: Math.min(...xs.map((q: number[]) => q[0])), x1: Math.max(...xs.map((q: number[]) => q[1])), y0: l.y, y1: l.y + b.lines.length * b.lineStep, size: b.size, fits: b.fits, boxH: l.height, need: b.lines.length * b.lineStep };
      };
      const failures: any[] = [];
      let tested = 0, refused = 0, invalid = 0;
      const ids: string[] = L.LAYOUT_IDS;
      for (const id of ids) {
        const def = L.layoutDef(id);
        const hasImg = def.fields.some((x: any) => x.image);
        const pics: (string | null)[] = hasImg ? [null, 'tall', 'wide', 'square'] : [null];
        for (const size of ['short', 'long', 'worst']) for (const pic of pics) for (const variant of [0, 1] as const) {
          const fields = fieldsFor(def, size, pic, 3);
          if (L.validateSlideContent(id, fields).errors.length) { invalid++; continue; }
          let d: any;
          try { d = await H.D.drawOne({ layout: id, fields, accents: [] }, variant, st, { handle: '@handle', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' }); } catch (e) { failures.push({ layout: id, style, size, pic, variant, what: 'threw: ' + (e as Error).message.slice(0, 80), px: 0 }); continue; }
          if (!d.built || !d.built.ok) { refused++; continue; }
          tested++;
          const texts = d.built.layers.filter((l: any) => l.kind === 'text' && l.text && l.visible !== false);
          const rec = texts.filter((l: any) => /recurring/.test(l.id + l.name));
          const own = texts.filter((l: any) => !/recurring/.test(l.id + l.name) && l.role !== 'decor');
          const boxes = own.map((l: any) => ({ l, b: boxOf(l) })).filter((x: any) => x.b);
          const add = (what: string, px: number) => failures.push({ layout: id, style, size, pic, variant, what, px: Math.round(px) });
          for (const { l, b } of boxes) {
            if (b.x0 < 48 - 2) add(`${l.name} starts ${Math.round(48 - b.x0)} px outside the left margin`, 48 - b.x0);
            if (b.x1 > 1032 + 2) add(`${l.name} ends ${Math.round(b.x1 - 1032)} px outside the right margin`, b.x1 - 1032);
            if (b.y0 < 48 - 2) add(`${l.name} starts ${Math.round(48 - b.y0)} px above the top margin`, 48 - b.y0);
            if (b.y1 > 1302 + 2) add(`${l.name} ends ${Math.round(b.y1 - 1302)} px below the bottom margin`, b.y1 - 1302);
            if (!b.fits && b.need > b.boxH + 2) add(`${l.name} is ${Math.round(b.need - b.boxH)} px taller than its box`, b.need - b.boxH);
            if (b.size < 24) add(`${l.name} is set at ${Math.round(b.size)} px, under the 85% floor`, 24 - b.size);
            for (const rc of rec) { const rb = boxOf(rc); if (rb && b.x0 < rb.x1 - 1 && b.x1 > rb.x0 + 1 && b.y0 < rb.y1 - 1 && b.y1 > rb.y0 + 1) add(`${l.name} overlaps the page counter / swipe footer`, Math.min(b.y1, rb.y1) - Math.max(b.y0, rb.y0)); }
          }
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i].b, c = boxes[j].b;
            const ox = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0), oy = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
            if (ox > 4 && oy > 4) add(`${boxes[i].l.name} overlaps ${boxes[j].l.name}`, oy);
          }
        }
      }
      return { failures, tested, refused, invalid };
    }, style);
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(`${TMP}/${style}.json`, JSON.stringify(r));
    console.log(`${style}: tested ${r.tested}, refused by the engine ${r.refused}, not valid for that text ${r.invalid}, failures ${r.failures.length}`);
    expect(r.failures.slice(0, 5), `${style}: ${r.failures.length} text-fit failures (see ${OUT}/text-fits-failures.md)`).toEqual([]);
  });
}

test('text fits: the report of all styles is written, and there are no failures', async () => {
  const rows: any[] = [];
  let tested = 0, refused = 0, invalid = 0;
  for (const s of STYLES) {
    const f = `${TMP}/${s}.json`;
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    rows.push(...j.failures);
    tested += j.tested; refused += j.refused; invalid += j.invalid;
  }
  const md = [
    '# Text-fits failures',
    '',
    `Combinations drawn and measured: ${tested} (layout x style x text size x variant x picture). Refused by the engine (layout not chosen for that text): ${refused}. Not valid for that text (over a field limit): ${invalid}. Failures: ${rows.length}.`,
    '',
    '| layout | style | text size | variant | picture | what failed | px |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((x) => `| ${x.layout} | ${x.style} | ${x.size} | ${x.variant} | ${x.pic ?? 'none'} | ${x.what} | ${x.px} |`),
    '',
  ].join('\n');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/text-fits-failures.md`, md);
  console.log(`TEXT-FITS tested ${tested} refused ${refused} invalid ${invalid} failures ${rows.length}`);
  expect(rows.length).toBe(0);
});
