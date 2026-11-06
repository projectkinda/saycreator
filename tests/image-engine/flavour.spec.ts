// The preset flavour pass (no model): swaps only layouts, never drops core text, keeps neighbours apart, caps the swaps, leaves references alone and logs every swap.
import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('flavour pass rules', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const F = await import('/src/carousel/flavour.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const P = await import('/src/carousel/presets.ts');
    const style = (id: string) => D.styleFromPack(P.presetPackFor(id, false)).style;
    const look = { hasPhoto: false };
    const spec = (layout: string, fields: any, accents: string[] = []) => ({ layout, fields, accents });
    const deck = [
      spec('big-question', { question: 'What if your hoodie was your bag?', line: 'Keep reading.' }),
      spec('split-text', { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood.' }),
      spec('stepper', { title: 'How to flip it', steps: ['Zip the hood in', 'Fold the sleeves', 'Pull the straps'] }),
      spec('big-stat', { number: '10', label: 'seconds to flip it', source: 'Measured in our workshop' }),
      spec('checklist', { title: 'What you get', items: ['Waterproof shell', 'Fits a laptop', 'Machine washable'] }),
      spec('stat-bar', { number: '$500,000', label: 'for 5% of the company', bar: '5', note: 'Open to 20 backers only.' }),
      spec('quote', { quote: 'I stopped carrying a bag.', author: 'An early backer' }),
      spec('cta-button', { headline: 'Back it today', button: 'Back it now' }),
    ];
    const words = (specs: any[]) => specs.map((s) => Object.values(s.fields).flat().join(' ').toLowerCase());
    const ed = F.flavourPass(deck as any, style('editorial-collage'), look, 'editorial-collage');
    const none = F.flavourPass(deck as any, D.styleFromPack(null).style, look);
    const hot = F.flavourPass(deck as any, style('hot-flat'), look, 'hot-flat');
    // a deck of one layout the preset avoids and cannot be moved (its text fits nothing preferred)
    const stuck = F.flavourPass([spec('comparison', { title: 'Before and after', leftLabel: 'Before', leftText: 'A bag and a hoodie', rightLabel: 'After', rightText: 'One piece' }), deck[1], deck[4], deck[7]] as any, style('hot-flat'), look, 'hot-flat');
    const open = F.flavourPass([deck[0], spec('feature-slider', { title: 'Slide and bite', body: 'Slide the zip and bite the clasp.', position: '60' }), deck[2], deck[7]] as any, style('editorial-collage'), look, 'editorial-collage');
    return { open, ed, none, hot, stuck, edWords: words(ed.specs), srcWords: words(deck), famOk: ed.specs.every((s: any, i: number, a: any[]) => i === 0 || F.familyOf(s.layout) !== F.familyOf(a[i - 1].layout) || s.layout === deck[i].layout), n: deck.length };
  });
  // references (no flavour): untouched
  expect(r.none.swaps).toEqual([]);
  expect(r.none.specs.map((s: any) => s.layout)).toEqual(r.srcWords.map((_: unknown, i: number) => ['big-question', 'split-text', 'stepper', 'big-stat', 'checklist', 'stat-bar', 'quote', 'cta-button'][i]));
  // editorial-collage: the cover takes its cover layout, avoided stat-bar moves, the story order stays, the cap holds
  expect(r.ed.specs[0].layout).toBe('statement');
  // meaning is protected: the stepper, the figure slides and the quote keep their layouts (they would only move to a layout that says the same thing)
  expect(r.ed.specs[2].layout).toBe('stepper');
  expect(r.ed.specs[3].layout).toBe('big-stat');
  expect(r.ed.specs[5].layout).toBe('stat-bar');
  expect(r.ed.specs[6].layout).toBe('quote');
  expect(r.open.swaps.map((w: any) => w.from + '>' + w.to)).toEqual(['big-question>statement', 'feature-slider>split-text']);
  expect(r.ed.kept.some((k: any) => /carries an order/.test(k.why))).toBe(true);
  expect(r.ed.specs.length).toBe(r.n);
  expect(r.ed.swaps.length).toBeLessThanOrEqual(Math.ceil(r.n / 2));
  for (const w of r.ed.swaps) {
    expect(w.why.length).toBeGreaterThan(5);
    expect(w.from).not.toBe(w.to);
  }
  // no core text is lost: every word of every slide's source text is still on the slide
  r.srcWords.forEach((src: string, i: number) => {
    if (r.ed.specs[i].layout === ['big-question', 'split-text', 'stepper', 'big-stat', 'checklist', 'stat-bar', 'quote', 'cta-button'][i]) return;
    const kept = new Set(r.edWords[i].split(/\W+/).filter(Boolean));
    const core = src.split(/\W+/).filter((x: string) => x.length > 2);
    const lost = core.filter((x: string) => !kept.has(x));
    // only the optional line (a kicker, a note, a source) may go; the log says which
    const droppedOpt = (r.ed.swaps.find((w: any) => w.slide === i + 1)?.droppedOptional ?? []).join(' ').toLowerCase();
    for (const w of lost) expect(droppedOpt.includes(w), `slide ${i + 1}: "${w}" was lost without being logged`).toBe(true);
  });
  // neighbours: no swap puts a slide in the family of the slide beside it
  expect(r.famOk).toBe(true);
  // a slide whose text fits no preferred layout stays, and the log says why
  expect(r.stuck.specs[0].layout).toBe('comparison');
  expect(r.stuck.kept.some((k: any) => k.slide === 1 && /cover stays/.test(k.why))).toBe(true); // the cover could not take the preset's cover layout: the log says so
  expect(r.stuck.swaps.every((s: any) => s.slide !== 1 || s.to === 'statement')).toBe(true);
});
