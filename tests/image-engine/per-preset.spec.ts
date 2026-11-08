// Per-preset proof (ZERO model calls; static): each of the 8 new presets gets an 8-slide deck that follows ITS OWN pack's slide sequence (out/layouts-inventory/inventory.md), drawn
// with the layouts built in Rounds A to C (and the nearest existing layout where a pack slide is a picture: a card grid for an image row, a split for a headline + body + image).
// A pack with fewer than 8 slides repeats ITS OWN most-used page (never another preset's). All text is real Quick Flip copy, and a repeated layout gets different text on each slide.
// Output: out/presets-v14/per-preset.png (one row per preset) and pairs.json. Style-5 is also checked on the RENDERED pixels (every text run 4.5:1, no thin weight at body size).
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(10 * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
const OUT = path.resolve(process.cwd(), 'out/presets-v14');

type S = { layout: string; variant?: 0 | 1; fields: Record<string, string | string[]>; accents?: string[]; pin?: { variant?: 0 | 1; invert?: false | 'full' | 'tint' } };
const S = (layout: string, fields: S['fields'], variant: 0 | 1 = 0, accents: string[] = []): S => ({ layout, variant, fields, accents });
// the copy: every paragraph is different, so a layout that repeats in a deck never repeats its words
const PARA = [
  'We sewed a waterproof bag into the hood and tested it for two years on trains, planes and rainy streets.',
  'Early backers told us the flip was the part they loved most, so we kept it to one zip and ten seconds.',
  'The shell is machine washable at thirty degrees and every seam is taped.',
  'The first prototype leaked in the first storm, so we rebuilt the hood pocket from scratch.',
  'A padded sleeve holds a sixteen-inch laptop, and the straps tuck away when you wear it as a hoodie.',
  'We tested the zip ten thousand times before we trusted it with a daily commute.',
  'Every size ships with the same pocket, so a small hoodie carries as much as a large one.',
  'Backers in forty countries have asked for a lighter fabric for summer, and we are making one.',
  'The pouch packs flat, weighs less than a phone and clips to a belt loop.',
  'We ship in March, and every backer gets a repair kit with spare zips.',
  'Colours are charcoal, forest and sand, picked so nothing clashes with a bag strap.',
  'It costs less than a good backpack and a good hoodie bought separately.',
];
const STEP = [
  ['Zip the hood', 'Zip the hood into the pocket and the hoodie becomes a bag you can carry on one shoulder.'],
  ['Pull the straps', 'Pull the straps out of the sleeves and they lock into place with a single tug.'],
  ['Fold the sleeves', 'Fold the sleeves behind you so the bag sits flat against your back.'],
  ['Flip it back', 'To turn it back, open the zip and the hood drops out, ready to wear again.'],
  ['Go', 'Then go: the whole flip takes ten seconds, start to finish, with no bag to pack.'],
];
const HEAD = 'A hoodie that flips into a backpack';
const statement = (v: 0 | 1 = 0) => S('statement', { kicker: 'New on Kickstarter', headline: HEAD, caption: 'One piece. Two jobs.' }, v, ['backpack']);
const stacked = () => S('statement-stacked', { headline: 'Flip it, wear it', caption: 'One hoodie that turns into a backpack in ten seconds.' }, 0, ['wear it']);
const card = (i: number, v: 0 | 1 = 0) => (i === 0 ? S('statement-card', { kicker: 'New this week', headline: 'Your bag is now your hoodie', caption: 'Zip, flip, go.' }, v, v === 0 ? ['hoodie'] : []) : S('statement-card', { kicker: 'Ten seconds', headline: 'From hoodie to bag before the train arrives', caption: 'No bag to pack.' }, v, v === 0 ? ['train'] : []));
const pill = () => S('statement-pill', { kicker: 'New on Kickstarter', headline: HEAD, caption: 'Back it before Friday' }, 0, ['backpack']);
const question = (i: number, v: 0 | 1 = 0) => (i === 0 ? S('statement-question', { question: 'What if your hoodie was also your bag?', line: 'Keep reading to see how.' }, v, ['bag']) : S('statement-question', { question: 'Why carry two things when one will do?', line: 'The flip takes ten seconds.' }, v, ['one']));
const proseBullets = () => S('prose', { heading: 'Why we built it', p1: 'We sewed a bag into the hood, so one layer does both jobs.', bullets: ['Waterproof shell', 'Fits a 16-inch laptop', 'Machine washable'] });
const proseBare = (a: number, v: 0 | 1 = 0) => S('prose', { p1: PARA[a], p2: PARA[a + 1], p3: PARA[a + 2] }, v);
const proseTwo = (a: number, heading: string, v: 0 | 1 = 0) => S('prose', { heading, p1: PARA[a], p2: PARA[a + 1] }, v);
const proseNum = (n: number, v: 0 | 1 = 0) => S('prose', { heading: STEP[n - 1][0], num: String(n), p1: STEP[n - 1][1] }, v);
const prosePull = (a: number, heading: string, pull: string, v: 0 | 1 = 0) => S('prose', { heading, p1: PARA[a], p2: PARA[a + 1], pull }, v);
const proseBold = () => S('prose', { heading: 'The two-year test', p1: PARA[3], p2: PARA[5], p3: PARA[2], pull: 'Built to be worn all day.' });
const proseBig = (a: number, v: 0 | 1 = 1) => S('prose', { p1: a === 0 ? 'One hoodie that turns into a backpack in ten seconds, with a waterproof shell and a pocket that holds a laptop.' : PARA[a] }, v);
const proseHP = (heading: string, a: number, v: 0 | 1 = 0) => S('prose', { heading, p1: PARA[a] }, v);
const proseAccent = (a: number, pull: string, v: 0 | 1 = 1) => S('prose', { p1: PARA[a], pull }, v);
const stagger = (v: 0 | 1 = 0) => S('numbered-stagger', { title: 'Two ways to wear it', items: ['Zip the hood into the pocket and the hoodie becomes a small bag.', 'Pull the straps out and wear it as a backpack on the train.'] }, v);
const quote = () => S('quote', { quote: 'I stopped carrying a bag the day this arrived.', author: 'An early backer' }, 0, ['stopped carrying']);
const ctaButton = () => S('cta-button', { headline: 'Back Quick Flip today', button: 'Back it now', sub: 'Early backers save 30%.' }, 0, ['today']);
const ctaPair = () => S('cta-pair', { headline: 'Two ways to join', button1: 'Back it now', line1: 'Early backers save 30%.', button2: 'See how it works', line2: 'Watch the ten-second flip.', link: 'quickflip.com/demo' });
const contact = (v: 0 | 1 = 0) => S('contact-closing', { brand: 'Quick Flip', headline: 'Back Quick Flip today', line: 'Early backers save 30%.', button: 'Back it now', contacts: ['@quick.flip', 'quickflip.com', 'hello@quickflip.com'] }, v, ['today']);
const bullets = (i: number, v: 0 | 1 = 0) => (i === 0 ? S('bullet-list', { title: 'What is in the box', items: ['The Quick Flip hoodie', 'A waterproof pouch', 'A pocket guide', 'A thank-you card'] }, v) : S('bullet-list', { title: 'What you can carry', items: ['A 16-inch laptop', 'A lunch and a bottle', 'A folded umbrella', 'Your keys and wallet'] }, v));
const pills = (i: number, v: 0 | 1 = 0) => (i === 0 ? S('pill-stagger', { headline: 'Four ways to wear it', subline: 'Pick the one that fits your day.', items: ['As a hoodie', 'As a backpack', 'As a pillow', 'As a blanket'] }, v) : S('pill-stagger', { headline: 'Three places it travels', subline: 'Wherever the day goes.', items: ['On the morning train', 'Through the rain', 'Across the airport'] }, v));
const hcard = (i: number, v: 0 | 1 = 0) => (i === 0 ? S('headline-card', { headline: 'How it works', subline: 'Three things happen when you zip.', card: 'The hood folds into a waterproof pocket that holds a 16-inch laptop.', paragraph: 'The straps slide out of the sleeves in one pull.', closing: 'That is the whole trick.' }, v) : S('headline-card', { headline: 'Why it stays dry', subline: 'Two layers, one seam.', card: 'The outer shell is taped at every seam, so water runs off instead of in.', paragraph: 'The pocket lining wicks away what gets through.', closing: 'Dry bag, dry laptop.' }, v));
const lead = () => S('lead-statement', { lead: 'It started in a rainy taxi', headline: 'We ditched the bag and kept the hoodie' }, 0, ['hoodie']);
const split = () => S('split-text', { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' }, 0, ['built it']);
const cgrid = (i: number, v: 0 | 1 = 0) => (i === 0 ? S('card-grid', { title: 'Built for everyday', cardTitles: ['Rain', 'Travel', 'Work'], cardLines: ['Waterproof shell', 'Fits under a seat', 'Holds a laptop'] }, v) : S('card-grid', { title: 'What backers love', cardTitles: ['The flip', 'The pocket', 'The fabric'], cardLines: ['Ten seconds, one zip', 'Fits a laptop and lunch', 'Light and washable'] }, v));
const COMPARE = [
  ['Pack it', 'Hoodie in one bag, bag in another.', 'One hoodie, and the bag is the hood.'],
  ['Carry it', 'A strap digs into one shoulder.', 'Two straps share the weight.'],
  ['Wear it', 'A bulky backpack on a hot train.', 'The hood folds flat on your back.'],
  ['Wash it', 'A bag that never fits the machine.', 'It goes in the wash like a hoodie.'],
  ['Store it', 'A closet full of bags and hoodies.', 'One piece in one drawer.'],
  ['Share it', 'Lend a bag, never see it again.', 'Lend a hoodie, get a thank-you.'],
];
const compare = (n: number) => S('comparison', { title: `${n}. ${COMPARE[n - 1][0]}`, leftLabel: 'Before', leftText: COMPARE[n - 1][1], rightLabel: 'After', rightText: COMPARE[n - 1][2] }, 0);

// the sequence of each pack (inventory.md), in its order; the pack slide that is a picture is drawn with the nearest existing layout, and a short pack repeats its own page
const SEQ: Record<string, { pack: string; slots: S[] }> = {
  'style-1': { pack: 'photo cover, prose, prose, prose, numbered pair, big quote, closing with button', slots: [statement(), proseBullets(), proseBare(0), proseTwo(3, 'The first prototype'), stagger(), quote(), prosePull(6, 'Built for every size', 'One pocket, every size.'), ctaButton()] },
  'style-2': { pack: 'cover art, numbered title + body (x3), two actions, contact card', slots: [statement(), proseNum(1), proseNum(2), proseNum(3), proseNum(4), proseNum(5), ctaPair(), contact()] },
  'style-3': { pack: 'cover with pill, prose, numbered prose (x2), bullets, heading + body, closing', slots: [pill(), proseBold(), proseNum(1), S('prose', { heading: STEP[1][0], num: '2', p1: STEP[1][1], p2: PARA[4], pull: 'One pull, one lock.' }), proseNum(3), bullets(0), proseHP('The idea', 8), S('statement', { kicker: 'Follow along', headline: 'Follow Quick Flip for launch news', caption: 'We post every Friday.' }, 0, ['launch news'])] },
  'style-4': { pack: 'stacked cover, big paragraph, thumbnail rows, big paragraphs, headline + body + image, contact closing', slots: [stacked(), proseBig(0), bullets(1, 1), S('prose', { p1: PARA[3], p2: PARA[7] }, 1), split(), proseBig(10), proseHP('Summer fabric', 11, 1), contact()] },
  'style-5': { pack: 'green card cover, italic prose, lead statement, statement card, prose (x2), green card closing', slots: [card(0), S('prose', { p1: PARA[1], p2: PARA[4], p3: PARA[8], pull: 'Ten seconds, start to finish.' }), lead(), card(1, 1), proseAccent(5, 'Tested ten thousand times.', 0), proseBare(9, 0), proseTwo(6, 'Every size', 0), { ...S('statement-card', { kicker: 'Back it now', headline: 'Back Quick Flip today', caption: 'Early backers save 30%.' }, 1), pin: { variant: 1, invert: false } }] },
  'style-6': { pack: 'post, do / do-not (x5), post', slots: [proseBare(3), compare(1), compare(2), compare(3), compare(4), compare(5), compare(6), proseAccent(11, 'Worth the price.', 0)] },
  'style-7': { pack: 'pill cover, image row, staggered pills, headline + card, image row, image row, socials closing', slots: [pill(), cgrid(0), pills(0), hcard(0), cgrid(1, 1), hcard(1, 1), pills(1, 1), contact(1)] },
  'style-8': { pack: 'gradient cover, prose under a rule (x3), single question', slots: [statement(), proseBare(1, 1), S('prose', { p1: PARA[4] }, 1), proseAccent(0, 'Built to be worn all day, flipped in ten seconds.'), question(0), proseBig(6), proseAccent(9, 'Spare zips in every box.'), question(1, 1)] },
};

test('each new preset: an 8-slide deck that follows its own pack; one sheet; how many slots two presets share', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/images/carousel');
  const ids = Object.keys(SEQ);
  const r = await page.evaluate(async ({ ids, seq }: any) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const rgb = (c: string) => C.parseColor(c).rgb;
    const ratio = (a: string, b: string) => C.contrastRgb(rgb(a), rgb(b));
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const cr = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const w = 270, h = 338, labelW = 200;
    const cv = document.createElement('canvas'); cv.width = labelW + 8 * (w + 10) + 10; cv.height = ids.length * (h + 10) + 10;
    const g = cv.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, cv.width, cv.height);
    const out: any = {};
    for (let r = 0; r < ids.length; r++) {
      const id = ids[r];
      const pack = PR.presetPackFor(id, false);
      const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style: null, styleNotes: [], plan: { title: 'Quick Flip', specs: seq[id].slots.map((s: any) => ({ layout: s.layout, variant: s.variant, fields: s.fields, accents: s.accents ?? [], ...(s.pin ? { pin: s.pin } : {}) })) } };
      const res = await D.redrawLibraryDeck(lib, { pack, hasPhoto: false }, '@quick.flip');
      const slides = Object.entries<any>(res.slides).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, s]) => s.built);
      const low: string[] = [];
      const inkLow: string[] = [];
      const thin: string[] = [];
      const bms: ImageBitmap[] = [];
      for (let i = 0; i < slides.length; i++) {
        const b = slides[i];
        const png = await F.svgToPng(b.svg, 1080);
        bms.push(await createImageBitmap(png));
        const shapes = (b.layers as any[]).filter((l) => l.kind === 'shape' && typeof l.fill === 'string' && /^#[0-9a-f]{6}/i.test(l.fill) && (l.opacity ?? 1) >= 0.95 && l.width * l.height < 1080 * 1350 * 0.9 && !/background/.test(String(l.name)));
        // the rendered pixels of this slide (style-5 is measured on them)
        let canvas: CanvasRenderingContext2D | null = null;
        if (id === 'style-5') { const c2 = document.createElement('canvas'); c2.width = bms[i].width; c2.height = bms[i].height; canvas = c2.getContext('2d')!; canvas.drawImage(bms[i], 0, 0); }
        for (const l of (b.layers as any[]).filter((q) => q.kind === 'text' && q.text)) {
          const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
          let sh: any = null;
          for (const q of shapes) if (q.x <= cx && q.x + q.width >= cx && q.y <= cy && q.y + q.height >= cy && (!sh || q.width * q.height <= sh.width * sh.height)) sh = q;
          const under = sh ? sh.fill : b.bg;
          const floor = l.style.size >= 96 ? 3 : 4.5;
          if (/^#/.test(String(l.style.color)) && ratio(l.style.color, under) < floor) low.push(`slide ${i + 1} ${l.name} ${l.style.color} on ${under} = ${ratio(l.style.color, under).toFixed(2)}`);
          if (canvas) {
            // the darkest 15% of the ink pixels of this text box, against the ground under it
            const sc = bms[i].width / 1080;
            const x0 = Math.max(0, Math.floor(l.x * sc)), y0 = Math.max(0, Math.floor(l.y * sc));
            const ww = Math.max(1, Math.min(bms[i].width - x0, Math.ceil(l.width * sc))), hh = Math.max(1, Math.min(bms[i].height - y0, Math.ceil(l.height * sc)));
            const d = canvas.getImageData(x0, y0, ww, hh).data;
            const ground = rgb(under);
            const px: { c: number[]; r: number }[] = [];
            for (let k = 0; k < d.length; k += 4) { const c = [d[k], d[k + 1], d[k + 2]]; const rr = cr(c, ground); if (rr > 1.6) px.push({ c, r: rr }); }
            if (px.length >= 12) {
              px.sort((a, b2) => b2.r - a.r);
              const core = px.slice(0, Math.max(6, Math.round(px.length * 0.15)));
              const m = [0, 1, 2].map((q) => core.reduce((s, p) => s + p.c[q], 0) / core.length);
              const rr = cr(m, ground);
              if (rr < 4.5 && !(l.style.size >= 96 && rr >= 3)) inkLow.push(`slide ${i + 1} ${l.name} "${String(l.text).slice(0, 18)}" rendered ink ${rr.toFixed(2)}`);
            }
            if (/^body/.test(String(l.name)) && l.style.size <= 64 && l.style.weight < 400) thin.push(`slide ${i + 1} ${l.name} weight ${l.style.weight}`);
          }
        }
      }
      const layouts = res.library.layouts as string[];
      out[id] = { layouts, variants: res.library.variants as number[], drawn: slides.length, low, inkLow, thin };
      g.fillStyle = '#ffd54a'; g.font = 'bold 20px sans-serif'; g.fillText(id, 12, 10 + r * (h + 10) + 28);
      g.fillStyle = '#fff'; g.font = '12px sans-serif';
      (seq[id].pack as string).split(', ').slice(0, 7).forEach((t: string, k: number) => g.fillText(t.slice(0, 30), 12, 10 + r * (h + 10) + 52 + k * 15));
      bms.forEach((bm, i) => g.drawImage(bm, labelW + 10 + i * (w + 10), 10 + r * (h + 10), w, h));
    }
    return { out, png: cv.toDataURL('image/png').split(',')[1] };
  }, { ids, seq: SEQ });
  fs.writeFileSync(path.join(OUT, 'per-preset.png'), Buffer.from(r.png, 'base64'));
  const pairs: { a: string; b: string; sameLayout: number; sameLayoutAndVariant: number; slots: number[] }[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = r.out[ids[i]], B = r.out[ids[j]];
    const same = A.layouts.map((l: string, k: number) => (l === B.layouts[k] ? k + 1 : 0)).filter(Boolean);
    pairs.push({ a: ids[i], b: ids[j], sameLayout: same.length, sameLayoutAndVariant: same.filter((s: number) => A.variants[s - 1] === B.variants[s - 1]).length, slots: same });
  }
  const distinct = Object.fromEntries(ids.map((id) => [id, new Set(r.out[id].layouts).size]));
  fs.writeFileSync(path.join(OUT, 'pairs.json'), JSON.stringify({ decks: r.out, pairs, distinctLayoutsPerDeck: distinct }, null, 1));
  console.log('PAIRS ' + JSON.stringify(pairs.map((p) => `${p.a.slice(6)}-${p.b.slice(6)}:${p.sameLayout}`)));
  console.log('DISTINCT ' + JSON.stringify(distinct));
  console.log('S5 INK ' + JSON.stringify({ inkLow: r.out['style-5'].inkLow, thin: r.out['style-5'].thin }));
  // a repeated layout never repeats its words: no two slides of one deck carry the same paragraph
  const texts = (s: S) => Object.values(s.fields).flat().map(String).filter((t) => t.length > 24);
  for (const id of ids) {
    const all = SEQ[id].slots.flatMap(texts);
    expect(new Set(all).size, `${id}: no text repeats inside the deck`).toBe(all.length);
    expect(r.out[id].drawn, `${id}: all 8 slides drawn`).toBe(8);
    expect(r.out[id].layouts, `${id}: the deck uses the layouts of its own sequence`).toEqual(SEQ[id].slots.map((s) => s.layout));
    expect(r.out[id].low, `${id}: contrast`).toEqual([]);
  }
  expect(r.out['style-5'].inkLow, 'style-5: every text run reads 4.5:1 on the rendered pixels').toEqual([]);
  expect(r.out['style-5'].thin, 'style-5: no thin weight at body size').toEqual([]);
});
