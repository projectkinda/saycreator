// The writer guidance for prose slides (ZERO model calls): the prompt keeps the 35 to 50 word aim, the 70 word hard limit, the one-paragraph-plus-takeaway advice and the split rule; and the hard cap
// of 70 stays in trimProse and in the app's phone check, so none of it can be lost by accident.
import { expect, test } from '@playwright/test';

test('writer prompt: prose aims for 35 to 50 words, 70 is the hard limit, a long passage is split', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const pack = PR.presetPackFor('style-6', false);
    const style = D.styleFromPack(pack).style;
    const prompt = D.buildLibraryPrompt({ text: 'A long critique of a product idea. '.repeat(20), slides: 7, tone: 'clear', format: 'carousel' } as any, { pack } as any, style, 'a look', 7);
    const mk = (n: number) => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
    const big = D.trimProse([{ layout: 'prose', fields: { heading: 'A title here', p1: mk(40) + '.', p2: mk(40) + '.', pull: 'Both halves must be true.' }, accents: [] }] as any);
    const small = D.trimProse([{ layout: 'prose', fields: { p1: mk(60) + '.' }, accents: [] }] as any);
    return { prompt, cap: D.PROSE_WORDS, bigWords: Object.values(big.specs[0].fields).flat().join(' ').split(/\s+/).filter(Boolean).length, smallKept: small.trims.length === 0 };
  });
  const prose = r.prompt.split('\n').filter((l: string) => /Prose:|Long passages:/.test(l)).join('\n');
  expect(prose, 'the 35 to 50 word aim').toMatch(/Aim for 35 to 50 words/);
  expect(prose, 'the hard limit').toMatch(/70 is a hard limit/);
  expect(prose, 'only up to 70 when the text needs it').toMatch(/up to 70 only when the source text truly needs it/);
  expect(prose, 'one paragraph and a takeaway').toMatch(/ONE short paragraph plus a bold one-line takeaway/);
  expect(prose, 'the split rule').toMatch(/past 70 words, split it across two slides/);
  expect(prose, 'the split target layouts').toMatch(/statement, bullet-list or numbered-list slide/);
  expect(prose, 'a fixed slide count: split only with room').toMatch(/split only when another slide of your plan can be spared/);
  expect(prose, 'otherwise tighten to 70').toMatch(/tighten the prose to 70 words or fewer/);
  // the hard cap stays at 70 in the trim: a prose slide of 82 words is cut to 70 or fewer, one of 60 words is left alone
  expect(r.cap).toBe(70);
  expect(r.bigWords).toBeLessThanOrEqual(70);
  expect(r.smallKept).toBe(true);
});

test('the app phone check holds a prose slide to 70 words, not 50, and counts no handle or page number', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const C = await import('/src/reference/faithfulChecks.ts');
    const L = await import('/src/image-engine/carousel/lint.ts');
    const txt = (name: string, text: string, y: number) => ({ kind: 'text', id: name + y, name, text, x: 48, y, width: 900, height: 60, visible: true, style: { size: 44, color: '#000000', weight: 400, lineHeight: 1.2, font: 'Instrument Sans' } }) as any;
    const mk = (n: number) => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
    const layers = (n: number) => [txt('body', mk(n), 300), txt('recurring', '@maya.designs', 62), txt('recurring', '3 / 7', 1258)];
    const run = (n: number, prose: boolean) => C.faithfulChecks(layers(n), { canvas: { w: 1080, h: 1350 }, bg: '#FFFFFF', k: 1, slideType: 'content', prose }).find((q: any) => q.id === 'words')!;
    return { limit: L.CAROUSEL_LIMITS.proseWordsFail, prose68: run(68, true).pass, prose72: run(72, true).pass, plain68: run(68, false).pass, plain48: run(48, false).pass };
  });
  expect(r.limit).toBe(70);
  expect(r.prose68, '68 words of prose pass').toBe(true);
  expect(r.prose72, '72 words of prose fail').toBe(false);
  expect(r.plain68, 'another content slide still fails past 50').toBe(false);
});
