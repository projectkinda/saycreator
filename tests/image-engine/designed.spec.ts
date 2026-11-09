// Designed mode (the model designs every slide), tested with a FAKE writer only: the mode switch and estimate, one call for the story and the designs,
// the checks (extra words, edges), the one retry and the fallback, text edits through the slots with no model call, per-slide redesign, and saving the look as a pack.
import { expect, test, type Page, type Route } from '@playwright/test';
import { exampleScript } from '../../src/carousel/script';

test.setTimeout(240_000);
test.use({ viewport: { width: 1280, height: 900 } });

const TEXT = 'I film five videos in one afternoon once a week. The night before I write the five titles. I keep one setup so I never rebuild the lights. Then I edit all five back to back the next day.';
const PAL = `data-palette='{"bg":"#101820","text":"#F5F0EB","accent":"#FF8A4C","accent2":"#4CC9F0","surface":"#1B2733","muted":"#9AA5B1"}'`;
const Y = [300, 800, 520, 700, 380, 760, 600];
type S = Record<string, unknown>;
const script = JSON.parse(exampleScript('carousel')) as { slides: S[]; brand: { handle: string } };
const titleOf = (s: S) => String(s.headline ?? s.quote ?? s.label ?? s.value ?? s.body ?? 'x');

/** A design for slide i that uses only the slide's own words, a different arrangement per slide, and the recurring page number. */
function svgFor(i: number, s: S, o: { extra?: string; edge?: boolean } = {}): string {
  const base = titleOf(s).split(/\s+/).slice(0, 3).join(' ');
  const title = (o.extra ? base + ' ' + o.extra : base).replace(/&/g, '&amp;');
  const x = o.edge ? 4 : 80 + (i % 3) * 40;
  const items = Array.isArray(s.items) ? (s.items as string[]) : [];
  const rows = s.type === 'checklist' ? items.map((it, k) => `<rect x="80" y="${1000 + k * 0}" width="1" height="1" fill="$bg"/><text data-role="body" data-min-size="40" data-max-lines="2" x="120" y="${900 + k * 110}" font-size="44" font-family="Instrument Sans" fill="$text">${it.split(/\s+/).slice(0, 3).join(' ').replace(/&/g, '&amp;')}</text>`).join('') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-slide="${i + 1}" data-type="${String(s.type)}" ${PAL}><rect width="1080" height="1350" fill="$bg"/><g id="icon-${i}"><circle cx="${880 - i * 20}" cy="${160 + i * 10}" r="${50 + i * 6}" fill="$accent"/></g><rect x="80" y="240" width="160" height="10" fill="$accent"/><circle cx="960" cy="1100" r="70" fill="$surface"/><text data-role="title" data-min-size="44" data-max-lines="4" x="${x}" y="${Y[i % 7]}" font-size="64" font-family="Schibsted Grotesk" font-weight="700" fill="$text">${title}</text>${rows}${s.type === 'stat' && s.value ? `<text data-role="number" data-min-size="120" data-max-lines="1" x="80" y="560" font-size="240" font-family="Schibsted Grotesk" font-weight="700" fill="$accent">${String(s.value).replace(/&/g, '&amp;')}</text>` : ''}<text x="80" y="1270" font-size="30" font-family="Instrument Sans" fill="$muted">${i + 1} / 7</text></svg>`;
}
const answer = (svgs: string[], extra: Record<string, unknown> = {}) => JSON.stringify({ ...script, ...extra }) + '\n' + svgs.join('\n');
const all = (o: Record<number, { extra?: string; edge?: boolean }> = {}) => script.slides.map((s, i) => svgFor(i, s, o[i]));

interface Fake {
  calls: string[];
}
async function fake(page: Page, answerFor: (n: number, prompt: string) => string): Promise<Fake> {
  const f: Fake = { calls: [] };
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false, reason: 'no key' } }));
  const write = async (r: Route) => {
    const prompt = (r.request().postDataJSON() as { prompt: string }).prompt;
    f.calls.push(prompt);
    await r.fulfill({ json: { text: answerFor(f.calls.length, prompt), ms: 5 } }).catch(() => undefined);
  };
  await page.route('**/__carousel/write', write);
  await page.route('**/api/carousel/write', write);
  return f;
}
const open = async (page: Page) => {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
  await page.getByLabel('Your text or topic').fill(TEXT);
};
const generate = (page: Page) => page.getByRole('button', { name: 'Make carousel', exact: true });
const drawn = async (page: Page, n = 7) => {
  await expect(page.locator('.cr-card')).toHaveCount(n, { timeout: 60_000 });
  await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(n, { timeout: 60_000 });
};

test('the checks: extra words and edge-hugging slots are refused in plain words; the other slides pass', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ text, handle }) => {
    const D = await import('/src/carousel/designed.ts');
    const S = await import('/src/carousel/script.ts');
    const v = S.validateScriptText(text.slice(0, text.search(/<svg/i)), 'carousel');
    const blocks = [...D.svgsOf(text).values()];
    const out: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const slide = v.script!.slides[i] as unknown as Record<string, unknown>;
      out.push(D.checkDesign(slide, handle, 7, blocks[i], null, []));
    }
    return out;
  }, { text: answer([svgFor(0, script.slides[0], { extra: 'zebra unicorn' }), svgFor(1, script.slides[1]), svgFor(2, script.slides[2])]), handle: script.brand?.handle ?? '@yourname' });
  expect(r[0][0]).toMatch(/not in this slide's script: .*zebra/);
  expect(r[1]).toEqual([]);
  expect(r[2]).toEqual([]);
});

const ITEMS = ['Clear well-lit photo', 'Name who you help', 'Contact info is current', 'Link in bio', 'One call to action'];
const rowsSvg = (rows: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="list" ${PAL}><rect width="1080" height="1350" fill="$bg"/><text data-role="title" data-min-size="44" data-max-lines="2" x="80" y="200" font-size="64" font-family="Schibsted Grotesk" font-weight="700" fill="$text">Before you save</text>${Array.from({ length: rows }, (_, i) => `<rect x="80" y="${300 + i * 190}" width="920" height="150" rx="20" fill="$surface"/><circle cx="150" cy="${375 + i * 190}" r="30" fill="$accent"/><text data-role="body" data-min-size="40" data-max-lines="2" x="220" y="${390 + i * 190}" font-size="44" font-family="Instrument Sans" fill="$text">item ${i + 1}</text>`).join('')}</svg>`;

async function fillChecklist(page: Page, rows: number, items: string[]) {
  await page.goto('/images/carousel');
  return page.evaluate(async ({ svg, items }) => {
    const P = await import('/src/reference/pack.ts');
    const p = await P.parsePack(svg, 'Rows');
    if (!p.ok) return { ok: false as const, reasons: p.reasons };
    const r = P.packSlide(p.pack, 'checklist', { type: 'checklist', headline: 'Before you save', items }, '@x');
    const f = r.faithful ?? '';
    const texts = [...f.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    return { ok: true as const, texts, circles: (f.match(/<circle\b/g) ?? []).length, cards: (f.match(/<rect\b[^>]*rx="20"/g) ?? []).length };
  }, { svg: rowsSvg(rows), items });
}

test('checklist: 3 items land one per row, and 5 items land one per row', async ({ page }) => {
  for (const n of [3, 5]) {
    const r = await fillChecklist(page, n, ITEMS.slice(0, n));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const res = r as Extract<typeof r, { ok: true }>;
    for (const it of ITEMS.slice(0, n)) expect(res.texts.filter((t) => t === it), `${n} items: "${it}" is its own row`).toHaveLength(1);
    expect(res.texts.some((t) => ITEMS.filter((it) => t.includes(it)).length > 1), 'no row holds two items').toBe(false);
    expect(res.circles).toBe(n);
    expect(res.cards).toBe(n);
  }
});

test('checklist: a design with 5 rows and 3 items hides the 2 empty rows (card and check mark too)', async ({ page }) => {
  const r = await fillChecklist(page, 5, ITEMS.slice(0, 3));
  expect(r.ok, JSON.stringify(r)).toBe(true);
  const res = r as Extract<typeof r, { ok: true }>;
  expect(res.texts.filter((t) => ITEMS.includes(t))).toEqual(ITEMS.slice(0, 3));
  expect(res.texts.some((t) => /^item \d$/.test(t)), 'no sample words left').toBe(false);
  expect(res.circles).toBe(3);
  expect(res.cards).toBe(3);
});

test('the edge check measures the box, not the sample width: a wide sample is clamped inside the margins; only an off-slide slot is rejected', async ({ page }) => {
  await page.goto('/images/carousel');
  const wide = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="cover" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="80" y="240" width="160" height="10" fill="$accent"/><circle cx="900" cy="200" r="60" fill="$accent"/><circle cx="960" cy="1100" r="70" fill="$surface"/><text data-role="title" data-min-size="44" data-max-lines="3" x="20" y="300" font-size="64" font-family="Schibsted Grotesk" font-weight="700" fill="$text">A really quite long sample headline A really quite long sample headline A really quite long sample headline</text></svg>`;
  const off = wide.replace('x="20"', 'x="1300"');
  const r = await page.evaluate(async ({ wide, off }) => {
    const P = await import('/src/reference/pack.ts');
    const D = await import('/src/carousel/designed.ts');
    const slide = { type: 'cover', headline: 'A really quite long sample headline', sub: 'x' } as Record<string, unknown>;
    const a = await P.parsePack(wide, 'W');
    const b = await P.parsePack(off, 'O');
    if (!a.ok || !b.ok) return null;
    const problemsWide = D.checkDesign(slide, '@x', 7, wide, a.pack, []);
    const clamped = D.clampSlots(a.pack, 'cover');
    const m = clamped.slotMeta!.cover!.find((s) => s.role === 'title')!;
    return { problemsWide, x: m.x, right: m.x + m.w, problemsOff: D.checkDesign(slide, '@x', 7, off, b.pack, []) };
  }, { wide, off });
  expect(r).not.toBeNull();
  expect(r!.problemsWide).toEqual([]);
  expect(r!.x).toBeGreaterThanOrEqual(26);
  expect(r!.right).toBeLessThanOrEqual(1032 + 1);
  expect(r!.problemsOff.join(' ')).toMatch(/no box on the slide/);
});

test('a slide that falls back is drawn in the deck\'s palette and fonts, with its page number', async ({ page }) => {
  await page.goto('/images/carousel');
  const bad = all({ 2: { extra: 'zebra' } });
  const r = await page.evaluate(async ({ first, retry }) => {
    const D = await import('/src/carousel/designed.ts');
    const R = await import('/src/carousel/render.ts');
    let n = 0;
    const provider = { id: 'api' as const, label: 'fake', write: async () => ({ text: n++ === 0 ? first : retry, ms: 1 }) };
    const req = { text: 'x'.repeat(60), slides: 7, tone: 'clear' as const, format: 'carousel' as const, styleChoice: 'auto', styles: [] };
    const out = await D.designDeck(req, {}, '', provider, new AbortController().signal);
    const style = R.carouselStyles()[0].spec.name;
    const doc = { version: 1 as const, format: 'carousel' as const, style, topic: '', script: out.script, choices: {}, designed: out.designed };
    const slides = R.composeDoc(doc).slides;
    return { fallbacks: Object.keys(out.designed.fallbacks), svg: JSON.stringify(slides[2].plan.layers), own: R.faithfulOf(slides[0])?.svg ?? '' };
  }, { first: answer(bad), retry: svgFor(2, script.slides[2], { extra: 'zebra' }) });
  expect(r.fallbacks).toEqual(['2']);
  expect(r.svg.length).toBeGreaterThan(100);
  expect(r.svg.toUpperCase(), "the deck's background colour").toContain('#101820');
  expect(r.svg, 'its own page number').toContain('3 / 7');
  expect(r.svg).toContain('Schibsted Grotesk');
});

test('the writer prompt says a stat value is a real figure from the text, never X or empty', async ({ page }) => {
  await page.goto('/images/carousel');
  const p = await page.evaluate(async () => {
    const W = await import('/src/carousel/writerPrompt.ts');
    return W.buildWritePrompt({ text: 'x'.repeat(60), slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'auto', styles: [] });
  });
  expect(p).toContain('must be a real figure taken from the text');
  expect(p).toContain('never "X"');
});

const STAT = { type: 'stat', value: '6 hours', label: 'saved every week', note: 'by batching videos' };
const statSvg = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="stat" ${PAL}><rect width="1080" height="1350" fill="$bg"/><rect x="60" y="260" width="960" height="720" rx="40" fill="$surface"/><circle cx="900" cy="150" r="60" fill="$accent"/><rect x="80" y="1000" width="200" height="10" fill="$accent"/><text data-role="number" data-min-size="120" data-max-lines="1" x="80" y="700" font-size="${size}" font-family="Schibsted Grotesk" font-weight="700" fill="$accent">6 hours</text><text data-role="title" data-min-size="44" data-max-lines="2" x="80" y="860" font-size="56" font-family="Schibsted Grotesk" font-weight="700" fill="$text">saved every week</text><text data-role="body" data-min-size="36" data-max-lines="2" x="80" y="1100" font-size="40" font-family="Instrument Sans" fill="$muted">by batching videos</text></svg>`;

test('stat slide with a real figure: the design must draw it as a huge number, and the fill keeps it huge', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ big, small, stat }) => {
    const P = await import('/src/reference/pack.ts');
    const D = await import('/src/carousel/designed.ts');
    const a = await P.parsePack(big, 'Big');
    const b = await P.parsePack(small, 'Small');
    if (!a.ok || !b.ok) return null;
    const bigProblems = D.checkDesign(stat, '@x', 7, big, a.pack, []);
    const smallProblems = D.checkDesign(stat, '@x', 7, small, b.pack, []);
    const filled = P.packSlide(a.pack, 'stat', stat, '@x').faithful ?? '';
    const doc = new DOMParser().parseFromString(filled, 'image/svg+xml');
    const el = [...doc.getElementsByTagName('text')].find((t) => (t.textContent ?? '').replace(/\s+/g, ' ').trim() === stat.value);
    const size = Number(el?.getAttribute('font-size') ?? el?.querySelector('tspan')?.getAttribute('font-size') ?? 0);
    const placeholder = D.checkDesign({ ...stat, value: 'X' }, '@x', 7, small.replace('6 hours', 'X'), b.pack, []);
    return { bigProblems, smallProblems, size, found: !!el, placeholder };
  }, { big: statSvg(260), small: statSvg(80), stat: STAT });
  expect(r).not.toBeNull();
  expect(r!.bigProblems).toEqual([]);
  expect(r!.smallProblems.join(' ')).toMatch(/HUGE number/);
  expect(r!.found, 'the real value is on the slide').toBe(true);
  expect(r!.size, 'and it stays a huge number').toBeGreaterThanOrEqual(150);
  expect(r!.placeholder.join(' '), 'a placeholder value does not demand a huge number').not.toMatch(/HUGE number/);
});

test('footer text is at least 28 px and the phone checks say so; a design needs at least 3 visual elements beyond its text', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designed.ts');
    const F = await import('/src/reference/faithfulChecks.ts');
    const Fo = await import('/src/image-engine/fonts.ts');
    await Fo.loadFonts();
    const tiny = D.splitRecurring('<svg><text x="80" y="1270" font-size="18" font-family="Instrument Sans">1 / 7</text></svg>').recurring[0].size;
    const mk = (size: number) => [{ kind: 'text', id: 'r', name: 'recurring', role: 'content', x: 80, y: 1270, width: 200, height: 50, rotation: 0, opacity: 1, text: '1 / 7', style: { font: 'Instrument Sans', weight: 400, size, color: '#888888', align: 'left', valign: 'top', lineHeight: 1.15 } }] as never;
    const chk = (size: number) => F.faithfulChecks(mk(size), { canvas: { w: 1080, h: 1350 }, bg: '#101820', k: 1, slideType: 'content' }).find((x) => x.id === 'size')!;
    const lone = D.visualElements('<svg><rect width="1080" height="1350"/><g id="icon"><circle cx="9" cy="9" r="5"/></g><text data-role="title">x</text></svg>');
    const full = D.visualElements('<svg><rect width="1080" height="1350"/><circle cx="9" cy="9" r="5"/><rect x="1" y="1" width="9" height="9"/><path d="M0 0L5 5"/><text data-role="title">x</text></svg>');
    const slide = { type: 'content', headline: 'x', body: 'x' } as Record<string, unknown>;
    const P = await import('/src/reference/pack.ts');
    const sparse = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="content" data-palette=\'{"bg":"#101820","text":"#F5F0EB"}\'><rect width="1080" height="1350" fill="$bg"/><circle cx="900" cy="200" r="60" fill="$text"/><text data-role="title" data-min-size="44" data-max-lines="2" x="80" y="400" font-size="64" font-family="Schibsted Grotesk" fill="$text">x</text></svg>';
    const p = await P.parsePack(sparse, 'S');
    return { tiny, small: chk(24), ok: chk(28), lone, full, sparse: p.ok ? D.checkDesign(slide, '@x', 7, sparse, p.pack, []) : ['parse'] };
  });
  expect(r.tiny, 'a footer drawn at 18 px is raised to 28').toBe(28);
  expect(r.small.pass, 'a 24 px footer fails the phone check').toBe(false);
  expect(r.small.reason).toContain('28');
  expect(r.ok.pass, 'a 28 px footer passes').toBe(true);
  expect(r.lone).toBe(1);
  expect(r.full).toBe(3);
  expect(r.sparse.join(' '), 'a lone icon on empty space is refused').toMatch(/at least 3 visual elements/);
});
