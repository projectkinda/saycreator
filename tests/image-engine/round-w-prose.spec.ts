// Round W: a prose slide with a long block of running text (25 words or more of paragraphs and pull line) gets a hierarchy: the first sentence is a lead (1.4 to 1.7 x the body, in the
// headline font), the rest is body text at 44 px or more in short paragraphs cut only at the sentence boundaries the text has, and the style's own rule between them when it has one. Not one
// word, mark or emoji changes; a slide under the threshold is drawn exactly as before (the switch proseLeadRule turns the rule off for the comparison; the app never does). ZERO model calls.
import { expect, test, type Page } from '@playwright/test';

const W45 = 'Most of us write the post in ten minutes and then lose the whole evening to the slides. We nudge a text box and change a colour, then change it back again. The words were never the hard part; making them all belong together is.';
const W70a = 'Most of us write the post in ten minutes and then lose the whole evening to the slides. We nudge a text box, change a colour, and nudge it back again, twice. The words were never the hard part.';
const W70b = 'The hard part is making them look like they belong together, slide after slide, week after week. That is the one job we always wanted to hand over to the code.';
const LONG1 = 'When you have spent the whole evening moving text boxes around a template that was never made for your words, the idea you started with feels smaller than it was at the start. So we built a tool that does the moving.';
/** The real walls (stored plans of decks O, M and the Round R event deck) and the synthetic sizes. */
const WALLS: [string, Record<string, unknown>, string, 'lead' | 'paragraphs'][] = [
  ['deck O 2', { p1: 'You write a good post. Then you spend the evening dragging text boxes around a template. The idea took ten minutes. The slides took the rest of the night. So we built Say Creator.' }, 'You write a good post.', 'lead'],
  ['deck O 6', { p1: "One AI call builds the carousel, and editing or restyling costs nothing after that. I don't want you designing slides.", pull: 'I want you saying something worth swiping for.' }, 'One AI call builds the carousel, and editing or restyling costs nothing after that.', 'lead'],
  ['deck M 5', { p1: 'Change a headline and nothing reruns. Switch the style and your words stay put. One AI call builds the carousel, and editing or restyling costs nothing after that.' }, 'Change a headline and nothing reruns.', 'lead'],
  ['event R 4', { p1: 'And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks, those were very valuable and fun.', pull: "And also don't you forget man Punit Chawla." }, '', 'paragraphs'],
  ['70 words', { p1: W70a, p2: W70b }, 'Most of us write the post in ten minutes and then lose the whole evening to the slides.', 'lead'],
  ['45 words', { p1: W45 }, 'Most of us write the post in ten minutes and then lose the whole evening to the slides.', 'lead'],
  ['first sentence of 33 words', { p1: LONG1 }, '', 'paragraphs'],
  ['45 words + pull', { p1: W45, pull: 'One layer. Two jobs.' }, 'Most of us write the post in ten minutes and then lose the whole evening to the slides.', 'lead'],
  ['70 words + pull', { p1: W70a, p2: W70b.split(' That is')[0], pull: 'That is the one job we always wanted to hand over to the code.' }, 'Most of us write the post in ten minutes and then lose the whole evening to the slides.', 'lead'],
];

const DRAW = `(async ({ items, styleId, brand }) => {
  const DL = await import('/src/carousel/designLibrary.ts'); const PR = await import('/src/carousel/presets.ts'); const FC = await import('/src/reference/faithfulChecks.ts');
  const PL = await import('/src/carousel/layouts/proseLead.ts');
  const fonts = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
  let pack = structuredClone(PR.presetPackFor(styleId, false, null));
  if (brand) { const BP = await import('/src/carousel/brandPalette.ts'); pack = BP.applyBrand(pack, brand).pack; }
  const { style } = DL.styleFromPack(pack);
  const out = [];
  for (const it of items) {
    const res = {};
    for (const on of [true, false]) {
      PL.proseLeadRule.on = on;
      const sp = { layout: 'prose', fields: it.fields, accents: it.accents ?? [] };
      const d = await DL.drawOne(sp, it.v ?? 0, style, { handle: '@saycreator', index: 1, total: 7, cut: 'plain', invert: false, density: 'normal', ground: it.ground ?? 0 });
      PL.proseLeadRule.on = true;
      if (!d.built) { res[on ? 'on' : 'off'] = { failed: d.problems }; continue; }
      const texts = d.built.layers.filter((l) => l.kind === 'text' && l.name !== 'recurring').sort((a, b) => a.y - b.y || a.x - b.x).map((l) => ({ name: l.name, text: l.text, size: l.style.size, weight: l.style.weight, font: l.style.font, w: l.width, y: l.y, h: l.height }));
      const field = d.built.field; const fill = (Math.max(...texts.map((t) => t.y + t.h)) - Math.min(...texts.map((t) => t.y))) / (field.y1 - field.y0);
      const fails = FC.faithfulChecks(d.built.layers, { canvas: { w: 1080, h: 1350 }, bg: d.built.fieldBg ?? style.palette.bg, k: 1, slideType: String(DL.scriptSlideOf('prose', it.fields).type ?? 'content'), prose: true, svg: d.built.svg, devices: d.built.devices }).filter((q) => !q.pass).map((q) => q.id + ': ' + q.reason);
      res[on ? 'on' : 'off'] = { svg: d.built.svg, texts, fill, fieldH: field.y1 - field.y0, fails, long: d.built.plan.longProse ?? null, fonts: style.fonts, underline: !!style.devices.underline, marker: style.accentStyle === 'marker' };
    }
    out.push(res);
  }
  return out;
})`;
const draw = (page: Page, items: unknown[], styleId: string, brand?: unknown) => page.evaluate(`${DRAW}(${JSON.stringify({ items, styleId, brand })})`) as Promise<any[]>;
const tok = (t: string) => t.split(/\s+/).filter(Boolean);
const want = (f: Record<string, any>) => [...(f.heading ? tok((f.num ? f.num + '. ' : '') + f.heading) : []), ...['p1', 'p2', 'p3'].flatMap((k) => tok(f[k] ?? '')), ...(f.bullets ?? []).flatMap(tok), ...tok(f.pull ?? '')];
const have = (r: any) => r.texts.flatMap((t: any) => tok(t.text));

let writes = 0;
test.beforeEach(async ({ page }) => {
  writes = 0;
  page.on('request', (r) => { if (/\/(__carousel|api\/carousel)\/write/.test(r.url())) writes++; });
  await page.goto('/images/carousel');
});
test.afterEach(() => expect(writes, 'writer calls').toBe(0));

test('W1 the real walls and the synthetic sizes: same words and marks before and after, a lead only where the rule allows, sizes within the rule, the phone check passes', async ({ page }) => {
  for (const [styleId, brand] of [['editorial-collage', null], ['style-1', null], ['style-5', null], ['style-3', { colours: ['#E11D48', '#111827'] }]] as const) {
    const res = await draw(page, WALLS.map(([, fields]) => ({ fields })), styleId, brand);
    for (const [i, [name, fields, lead, kind]] of WALLS.entries()) {
      const { on, off } = res[i];
      const tag = `${name} ${styleId}${brand ? ' + brand' : ''}`;
      expect(on.failed, tag).toBeUndefined();
      // every word and mark, in order: as written, and as the one-block slide had them
      expect(have(on), tag).toEqual(want(fields));
      expect(have(on), tag).toEqual(have(off));
      expect(on.fails, tag).toEqual([]);
      expect(on.long?.kind, tag).toBe(kind);
      expect(off.long, `${tag}: without the rule, the one-block slide`).toBeNull();
      // Round W2: the pull line (the strongest sentence) is never smaller than the body and keeps its bold weight
      if (fields.pull) {
        const pt = on.texts.find((t: any) => t.text === fields.pull); const po = off.texts.find((t: any) => t.text === fields.pull);
        expect(pt.size, `${tag}: pull >= body`).toBeGreaterThanOrEqual(on.long.body);
        expect(pt.size, `${tag}: pull >= every body paragraph`).toBeGreaterThanOrEqual(Math.max(...on.texts.filter((t: any) => t.name !== 'title' && t !== pt).map((t: any) => t.size)));
        expect(pt.weight, `${tag}: pull keeps its bold weight`).toBe(po.weight);
        expect(pt.font, tag).toBe(on.fonts.headline);
      }
      // the house rule of every layout: the drawing fills at least 65% of the free height
      expect(on.fill, tag).toBeGreaterThanOrEqual(0.65);
      const title = on.texts.find((t: any) => t.name === 'title');
      if (kind === 'lead') {
        // the lead is the first sentence exactly (its full stop kept), in the headline font, 1.4 to 1.7 x the body (at least the 72 px headline floor)
        expect(title?.text, tag).toBe(lead);
        expect(title.font, tag).toBe(on.fonts.headline);
        expect(title.size / on.long.body, tag).toBeGreaterThanOrEqual(1.4);
        expect(title.size, tag).toBeLessThanOrEqual(Math.max(72, Math.round(1.7 * on.long.body)));
        // Round W2: the lead takes at most 45% of the free height
        expect(title.h / on.fieldH, `${tag}: lead share`).toBeLessThanOrEqual(0.45 + 0.003);
        // the style's own rule between lead and body, only when the style has the underline device
        expect(/<rect[^>]*width="120" height="8"/.test(on.svg), tag).toBe(on.underline);
      } else expect(title, tag).toBeUndefined();
      // body text at 44 px or more; paragraphs only cut where a sentence ends
      for (const t of on.texts.filter((x: any) => x.name !== 'title')) {
        expect(t.size, tag).toBeGreaterThanOrEqual(44);
        expect(/[.!?…]["'”’)\]]*$|[\p{Extended_Pictographic}]$/u.test(t.text) || t.text === on.texts[on.texts.length - 1].text, `${tag}: "${t.text}" ends a sentence`).toBe(true);
      }
      // the measure: the body box holds 28 to 40 characters a line (narrowed at small sizes); the body is never larger than the one block it replaces
      expect(on.long.body, tag).toBeLessThanOrEqual(off.texts[0].size);
    }
  }
});

test('W2 the threshold: 24 words of running text stay exactly as before (same drawing), 25 get the lead; a heading or a first sentence over 25 words means no lead', async ({ page }) => {
  const at24 = 'We write the post in ten minutes. Then the slides take the whole long evening. The words were never the hard part at all.';
  const at25 = 'We write the post in ten minutes. Then the slides take the whole long evening. The words were never the hard part at all, sadly.';
  const short = 'And also thank you Sujit Kumar Pradhan Samruddhi Kelkar Yogesh Gurera for your wonderful insights and talks.';
  for (const styleId of ['editorial-collage', 'style-1', 'style-6']) {
    const [a, b, c, d, e] = await draw(page, [{ fields: { p1: at24 } }, { fields: { p1: short } }, { fields: { p1: at24 }, v: 1, ground: 1 }, { fields: { p1: at25 } }, { fields: { heading: 'Why we built it', num: '2', p1: W45 } }], styleId);
    for (const [k, r] of [a, b, c].entries()) {
      expect(r.on.long, `${styleId} ${k}`).toBeNull();
      expect(r.on.svg, `${styleId} ${k}: the same drawing as without the rule`).toBe(r.off.svg);
    }
    expect(d.on.long.kind, styleId).toBe('lead');
    expect(d.on.texts.find((t: any) => t.name === 'title').text).toBe('We write the post in ten minutes.');
    // a heading is the slide's hierarchy: no lead under it; the heading keeps its title, the words are the same
    expect(e.on.long.kind, styleId).toBe('paragraphs');
    expect(e.on.texts.filter((t: any) => t.name === 'title').map((t: any) => t.text), styleId).toEqual(['2. Why we built it']);
    expect(have(e.on), styleId).toEqual(want({ heading: 'Why we built it', num: '2', p1: W45 }));
  }
});

test('W3 sentences are only cut where they end: "Dr." stays inside its sentence and an emoji stays with the sentence it follows', async ({ page }) => {
  const abbr = 'We met Dr. Rao at the event and talked for an hour. She showed us how a carousel can carry a whole talk. The idea took ten minutes; the slides took the night.';
  const emoji = 'Had a wonderful blast at the Hyderabad event. 😂 Thank you all for the crazy day, the talks and the people. Looking forward to some more of these going forward, man!';
  const split = await page.evaluate(async ({ abbr, emoji }) => {
    const PL: any = await import('/src/carousel/layouts/proseLead.ts');
    return { abbr: PL.sentences(abbr), emoji: PL.sentences(emoji), quote: PL.sentences('He said "stop." Then we left. e.g. this stays.'), paras: PL.paragraphs(PL.sentences(abbr)) };
  }, { abbr, emoji });
  expect(split.abbr).toEqual(['We met Dr. Rao at the event and talked for an hour.', 'She showed us how a carousel can carry a whole talk.', 'The idea took ten minutes; the slides took the night.']);
  expect(split.emoji).toEqual(['Had a wonderful blast at the Hyderabad event. 😂', 'Thank you all for the crazy day, the talks and the people.', 'Looking forward to some more of these going forward, man!']);
  expect(split.quote).toEqual(['He said "stop."', 'Then we left. e.g. this stays.']);
  expect(split.paras.join(' ')).toBe(abbr);
  const [a, e] = await draw(page, [{ fields: { p1: abbr } }, { fields: { p1: emoji } }], 'style-3');
  expect(a.on.texts.find((t: any) => t.name === 'title').text).toBe('We met Dr. Rao at the event and talked for an hour.');
  expect(e.on.texts.find((t: any) => t.name === 'title').text).toBe('Had a wonderful blast at the Hyderabad event. 😂');
  expect(have(a.on)).toEqual(tok(abbr));
  expect(have(e.on)).toEqual(tok(emoji));
});

test('W4 accents stay where they are: an accent phrase in the lead is highlighted with the style\'s accent (marker or colour) in all 15 styles and a brand set; words, full stop and phone check intact', async ({ page }) => {
  const styles = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
  for (const [styleId, brand] of [...styles.map((s) => [s, null] as const), ['style-3', { colours: ['#E11D48', '#111827'] }] as const]) {
    const [mid, last] = await draw(page, [{ fields: { p1: W45 }, accents: ['whole evening'] }, { fields: { p1: W45 }, accents: ['the slides'] }], styleId, brand);
    for (const [k, r] of [mid, last].entries()) {
      const tag = `${styleId}${brand ? ' + brand' : ''} ${k}`;
      expect(r.on.failed, tag).toBeUndefined();
      expect(have(r.on), tag).toEqual(tok(W45));
      expect(r.on.fails, tag).toEqual([]);
      const title = r.on.texts.find((t: any) => t.name === 'title');
      expect(title.text, tag).toBe('Most of us write the post in ten minutes and then lose the whole evening to the slides.');
      // the drawn title: the accent words set apart (their own tspan, on a marker bar or in the accent colour)
      const t = /<text data-role="title"[\s\S]*?<\/text>/.exec(r.on.svg)![0];
      const word = k === 0 ? 'evening' : 'slides';
      expect(new RegExp(`<tspan[^>]*fill="#[0-9A-Fa-f]{6}"[^>]*>[^<]*${word}`).test(t), tag).toBe(true);
    }
  }
});

test('W5 the order of concessions when room runs short: the lead ratio goes down to 1.4 first, then the body down to 44 px, then no lead; the pull never below the body', async ({ page }) => {
  const r = await page.evaluate(async ({ p1, pull }) => {
    const DL: any = await import('/src/carousel/designLibrary.ts'); const PR: any = await import('/src/carousel/presets.ts');
    const PL: any = await import('/src/carousel/layouts/proseLead.ts'); const DR: any = await import('/src/carousel/layouts/draw.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    const { style } = DL.styleFromPack(PR.presetPackFor('editorial-collage', false, null));
    const out = [];
    // the free field made shorter step by step (1000 px is a real slide's)
    for (let h = 1000; h >= 380; h -= 20) {
      const cx = { field: { x0: 48, w: 978, y0: 190, y1: 190 + h } };
      const extra = (z: number) => DR.measure(pull, style.fonts.headline, DR.nearestWeight(style.fonts.headline, 800), PL.pullSize(style, z), 978, 1.2).h + Math.round(0.8 * z);
      const p = PL.planLong(style, cx, '', [p1], extra);
      out.push({ h, kind: p.kind, body: p.body, ratio: p.ratio ?? null, pull: PL.pullSize(style, p.body), lead: p.leadSize ?? null });
    }
    return out;
  }, { p1: W45, pull: 'One layer. Two jobs.' });
  console.log('W5 ' + JSON.stringify(r.map((x) => [x.h, x.kind[0], x.body, x.ratio])));
  const leads = r.filter((x) => x.kind === 'lead');
  expect(leads.length).toBeGreaterThan(3);
  expect(r.some((x) => x.kind === 'paragraphs'), 'a field short enough drops the lead').toBe(true);
  // once the lead is gone it never comes back on a shorter field; the pull is always >= the body
  const firstFlat = r.findIndex((x) => x.kind === 'paragraphs');
  expect(r.slice(firstFlat).every((x) => x.kind === 'paragraphs')).toBe(true);
  for (const x of r) expect(x.pull, String(x.h)).toBeGreaterThanOrEqual(x.body);
  // the body never grows as the field shrinks (at each body size the ratio is tried from 1.7 down to 1.4, or to the 72 px headline floor, before the next smaller body)
  for (let i = 1; i < leads.length; i++) expect(leads[i].body, String(leads[i].h)).toBeLessThanOrEqual(leads[i - 1].body);
  for (const x of leads) expect(x.ratio, String(x.h)).toBeGreaterThanOrEqual(Math.min(1.4, 72 / x.body) - 0.005);
  // the lead is given up only after the body reached its floor: the last slide with a lead has a 44 px body
  expect(leads[leads.length - 1].body).toBe(44);
});
