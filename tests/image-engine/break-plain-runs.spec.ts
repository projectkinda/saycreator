// breakPlainRuns: a deck with planes never ends with 3+ plain slides in a row; flat styles stay all plain; pinned slides are never changed; edge-v and a neighbour's cut are never picked.
// ZERO model calls: stub redraws for the unit cases, the stored plans of the two real decks for the integration cases.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(5 * 60_000);
const SRC = path.resolve(process.cwd(), 'out/designed-library-real');

test('(a unit) a run of 3+ plain slides is broken; (c) pinned slides are never changed; (d) never edge-v or a neighbour\'s cut', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const L = await import('/src/carousel/layouts/index.ts');
    const mk = (cuts: string[]) => cuts.map((cut) => ({ built: {}, cut, invert: false, density: 'normal', adjustments: [] as string[], problems: [] as string[] }));
    const longestPlain = (d: any[]) => { let m = 0, c = 0; for (const x of d) { c = x.cut === 'plain' ? c + 1 : 0; m = Math.max(m, c); } return m; };
    const bad: string[] = [];
    // a stub redraw: draws the cut as asked, except for layouts that cannot carry a plane (they come back plain), and checks the rules at the moment of the call
    const run = async (cuts: string[], layouts: string[], pinned: Set<number>, allow: Record<number, string[]> = {}) => {
      const d: any[] = mk(cuts);
      const calls: [number, string][] = [];
      await D.breakPlainRuns(d, (i: number) => layouts[i], (i: number) => pinned.has(i), async (i: number, cut: string) => {
        calls.push([i, cut]);
        if (cut === 'edge-v') bad.push('edge-v tried');
        if (pinned.has(i)) bad.push(`pinned slide ${i + 1} redrawn`);
        const carry = !/numeral/.test(layouts[i]) && (!allow[i] || allow[i].includes(cut));
        return { built: {}, cut: carry ? cut : 'plain', invert: false, density: 'normal', adjustments: [] as string[], problems: [] as string[] };
      });
      return { d, calls };
    };
    const S = 'statement';
    const five = await run(['plain', 'plain', 'plain', 'plain', 'plain'], [S, S, S, S, S], new Set());
    const withNumerals = await run(['edge-h', 'plain', 'plain', 'plain', 'edge-h'], [S, 'step-numeral', 'listicle-numeral', 'step-numeral', S], new Set());
    const pinMid = await run(['plain', 'plain', 'plain'], [S, S, S], new Set([1]));
    const pinAll = await run(['plain', 'plain', 'plain'], [S, S, S], new Set([0, 1, 2]));
    // the only cut that works for slide 3 is edge-h, which its neighbour (slide 4) has: the neighbour takes another cut
    const swap = await run(['plain', 'plain', 'plain', 'edge-h'], [S, S, S, S], new Set(), { 0: [], 1: [], 2: ['edge-h'] });
    const twoOnly = await run(['edge-h', 'plain', 'plain', 'curve'], [S, S, S, S], new Set());
    const cutsOfS = L.cutsOf(S);
    return { bad, five: { cuts: five.d.map((x: any) => x.cut), longest: longestPlain(five.d), notes: five.d.flatMap((x: any) => x.adjustments).length }, withNumerals: { cuts: withNumerals.d.map((x: any) => x.cut), longest: longestPlain(withNumerals.d) }, pinMid: { cuts: pinMid.d.map((x: any) => x.cut), calls: pinMid.calls }, pinAll: { cuts: pinAll.d.map((x: any) => x.cut), calls: pinAll.calls }, swap: swap.d.map((x: any) => x.cut), twoOnly: { cuts: twoOnly.d.map((x: any) => x.cut), calls: twoOnly.calls }, cutsOfS };
  });
  expect(r.bad).toEqual([]);
  // (d) in the five-plain case no two neighbours share a plane cut
  r.five.cuts.forEach((c: string, i: number) => { if (i > 0 && c !== 'plain') expect(c).not.toBe(r.five.cuts[i - 1]); });
  expect(r.cutsOfS.filter((c: string) => c !== 'plain' && c !== 'edge-v').length).toBeGreaterThan(1);
  expect(r.five.longest, 'five plain slides: ' + r.five.cuts.join(',')).toBeLessThanOrEqual(2);
  expect(r.five.notes, 'every change is noted').toBeGreaterThan(0);
  // slides whose layout cannot carry a plane stay plain: the slides beside them are not (the run of 3 numerals is 3 long, so one of the others cannot help; the stub cannot carry any numeral)
  expect(r.withNumerals.cuts[1] === 'plain' && r.withNumerals.cuts[2] === 'plain' && r.withNumerals.cuts[3] === 'plain').toBe(true);
  // (c) pinned: never redrawn, never changed
  expect(r.pinMid.cuts[1]).toBe('plain');
  expect(r.pinMid.calls.every(([i]: [number, string]) => i !== 1)).toBe(true);
  expect(r.pinAll.cuts).toEqual(['plain', 'plain', 'plain']);
  expect(r.pinAll.calls).toEqual([]);
  // (d) a slide that took a cut never shares it with a neighbour; the swap case
  expect(r.swap[2]).toBe('edge-h');
  expect(r.swap[3]).not.toBe('edge-h');
  expect(r.swap[3]).not.toBe('plain');
  expect(r.swap[3]).not.toBe('edge-v');
  // no run of 3 → nothing is touched
  expect(r.twoOnly.calls).toEqual([]);
  expect(r.twoOnly.cuts).toEqual(['edge-h', 'plain', 'plain', 'curve']);
});

for (const deck of [{ name: 'quickflip-dark', handle: '@quick.flip' }, { name: 'harsh-light', handle: '@harsh.parekh' }]) {
  test(`(a, b, d integration) ${deck.name}: with planes no run of 3+ plain, flat (Shapes off) stays all plain, no neighbour shares a cut`, async ({ page }) => {
    const lib = JSON.parse(fs.readFileSync(path.join(SRC, deck.name, 'report.json'), 'utf8')).library;
    await page.goto('/images/carousel');
    const r = await page.evaluate(async ({ lib, handle }) => {
      const D = await import('/src/carousel/designLibrary.ts');
      const st = lib.style;
      const go = async (shapes: 'off' | 'subtle' | 'bold') => {
        const pack: any = { name: 'stub', palette: { ...st.palette }, fonts: { ...st.fonts }, motifs: [], designs: {}, canvas: { w: 1080, h: 1350 }, notes: [], svgs: st.background === 'glow' ? { cover: '<svg><radialGradient id="g"/></svg>' } : {}, devices: { marker: st.devices.marker, profileHeader: st.devices.profileHeader, underline: st.devices.underline, slides: 1, counts: { marker: 0, profileHeader: 0, underline: 0 } }, overrides: { marker: st.devices.marker, underline: st.devices.underline, profileHeader: st.devices.profileHeader, shapes } };
        const res = await D.redrawLibraryDeck({ ...lib, redraws: 0 }, { pack, hasPhoto: false }, handle);
        return res.library.cuts as string[];
      };
      return { off: await go('off'), subtle: await go('subtle'), bold: await go('bold') };
    }, { lib, handle: deck.handle });
    const longest = (c: string[]) => { let m = 0, k = 0; for (const x of c) { k = x === 'plain' ? k + 1 : 0; m = Math.max(m, k); } return m; };
    expect(r.off.every((c) => c === 'plain'), 'flat stays plain: ' + r.off.join(',')).toBe(true);
    for (const m of ['subtle', 'bold'] as const) {
      expect(longest(r[m]), `${deck.name}/${m}: ${r[m].join(',')}`).toBeLessThanOrEqual(2);
      expect(r[m].includes('edge-v')).toBe(false);
      r[m].forEach((c, i) => { if (i > 0 && c !== 'plain') expect(c, `${m}: slide ${i + 1} repeats the cut of the slide before`).not.toBe(r[m][i - 1]); });
    }
  });
}
