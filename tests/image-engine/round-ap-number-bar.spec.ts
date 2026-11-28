// Round AP: a list number glued to the first word ("3. Frame", Round AI) is no longer hidden on the highlight bar of that word. The bar covers only the highlighted part (with the clear
// space a bar keeps from a neighbouring word); the number keeps the text colour on the slide's own background and lines up with the lines below. The phone check measures each piece in the
// colour it is drawn in, so a dark piece on a dark bar fails it. A word the bar covers whole draws as before (the 105 baseline slides are unchanged). Code only: no model call.
import { expect, test } from '@playwright/test';

test('AP1 the bar starts at the highlighted word, clear of the number; the number is in the text colour off the bar and lines up with the next line; a whole highlighted word is as before', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const T: any = await import('/src/image-engine/draw/text.ts');
    const layer = (text: string, ranges: { start: number; end: number }[], runs: any[]) => ({
      kind: 'text', id: 'title', name: 'title', role: 'content', x: 48, y: 300, width: 660, height: 900, rotation: 0, opacity: 1, text, balance: true,
      style: { font: 'Schibsted Grotesk', weight: 800, size: 150, color: '#1B1914', align: 'left', valign: 'top', lineHeight: 1.05 },
      runs, highlight: { words: ['frame'], color: '#7B2514', textColor: '#FFFFFF', paddingX: 24, paddingY: 0, radius: 24, hugLine: true, onlyFirst: true, ranges },
    });
    const NB = ' ';
    const numbered = T.layoutText(layer(`3.${NB}frame inside a frame`, [{ start: 3, end: 8 }], [{ start: 3, end: 8, color: '#FFFFFF' }]));
    const plain = T.layoutText(layer('frame inside a frame', [{ start: 0, end: 5 }], [{ start: 0, end: 5, color: '#FFFFFF' }]));
    const pad = 24;
    const l0 = numbered.lines[0];
    const num = l0.segments.find((g: any) => g.text.startsWith('3.'));
    const word = l0.segments.find((g: any) => g.text === 'frame');
    return {
      lines: numbered.lines.map((l: any) => l.text),
      x: numbered.lines.map((l: any) => l.x),
      marks: l0.marks, num, word, barFrom: l0.words[0].barFrom,
      // the visible number ("3."), without the no-break space that follows it inside its piece
      numInk: T.measureWidth("3.", "Schibsted Grotesk", 800, 150),
      plain: { x: plain.lines.map((l: any) => l.x), marks: plain.lines[0].marks, barFrom: plain.lines[0].words[0].barFrom, firstWordX: plain.lines[0].words[0].x },
      pad,
    };
  });
  expect(r.lines[0]).toMatch(/^3\. frame/);
  // the number: the text colour (no run colour), and wholly left of the bar with its padding
  expect(r.num.color).toBeUndefined();
  expect(r.marks).toHaveLength(1);
  expect(r.num.x + r.numInk, 'the number ends before the bar (with its padding) starts').toBeLessThanOrEqual(r.marks[0].x - r.pad);
  // the bar covers the highlighted word
  expect(r.word.color).toBe('#FFFFFF');
  expect(r.marks[0].x).toBeCloseTo(r.word.x, 3);
  expect(r.barFrom).toBeGreaterThan(0);
  // the clear space: from the end of "3." to the bar's left edge at least the MARKER_GAP (12 px)
  expect(r.marks[0].x - r.pad - (r.num.x + r.numInk)).toBeGreaterThanOrEqual(12 - 0.5);
  // no indent for a bar that does not start the line: the number lines up with the next line
  expect(r.x[0]).toBeCloseTo(r.x[1], 3);
  // a word the bar covers whole: as before (indented by the bar's padding, the bar from the word's own x)
  expect(r.plain.barFrom).toBeUndefined();
  expect(r.plain.x[0]).toBeCloseTo(r.plain.x[1] + r.pad, 3);
  expect(r.plain.marks[0].x).toBeCloseTo(r.plain.firstWordX, 3);
});

test('AP2 the phone check measures each piece in the colour it is drawn in: a dark piece on a dark bar fails; the same piece in the bar\'s text colour passes', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const LINT: any = await import('/src/image-engine/carousel/lint.ts');
    const NB = ' ';
    // the whole headline on the bar (ranges over "3. frame"); the number's run is dark (the hidden-number case), or white (the control)
    const plan = (numberColour: string) => ({
      canvas: { width: 1080, height: 1350 },
      layers: [{
        kind: 'text', id: 'title', name: 'title', role: 'content', x: 48, y: 300, width: 900, height: 400, rotation: 0, opacity: 1, text: `3.${NB}frame`,
        style: { font: 'Schibsted Grotesk', weight: 800, size: 150, color: '#1B1914', align: 'left', valign: 'top', lineHeight: 1.05 },
        runs: [{ start: 0, end: 2, color: numberColour }, { start: 3, end: 8, color: '#FFFFFF' }],
        highlight: { words: ['frame'], color: '#7B2514', textColor: '#FFFFFF', paddingX: 24, paddingY: 0, radius: 24, hugLine: true, onlyFirst: true, ranges: [{ start: 0, end: 8 }] },
      }],
    });
    // what the words sit on: the bar's dark red everywhere (a phone-size copy, scale 1/3)
    const W = 360, H = 450, data = new Uint8ClampedArray(W * H * 4);
    for (let k = 0; k < W * H; k++) { data[k * 4] = 0x7b; data[k * 4 + 1] = 0x25; data[k * 4 + 2] = 0x14; data[k * 4 + 3] = 255; }
    const run = (c: string) => LINT.lintSlide({ plan: plan(c), margin: 48, phoneBackground: { width: W, height: H, data }, phoneScale: 1 / 3 }).find((x: any) => x.id === 'contrast');
    return { dark: run('#1B1914'), white: run('#FFFFFF') };
  });
  expect(r.dark.pass, r.dark.reason).toBe(false);
  expect(r.dark.reason).toMatch(/^The word "3\./);
  expect(r.white.pass, r.white.reason).toBe(true);
});
