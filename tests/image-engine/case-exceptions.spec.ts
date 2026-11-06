// Brand case exceptions under the case transform, and the preset writer prompt lines (preset only; a reference prompt is unchanged).
import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('case transform keeps brands as written; upper keeps only mixed-case brands', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const B = await import('/src/carousel/layouts/build.ts');
    const L = await import('/src/carousel/layouts/index.ts');
    const w = B.handleWords('@quick.flip');
    const lower = (s: string, canon: string[] = []) => (B.caseFields({ headline: s, kicker: 'Quick Flip News' }, 'lower', { canon, written: w }) as any);
    const upper = (s: string, canon: string[] = []) => (B.caseFields({ headline: s }, 'upper', { canon, written: w }) as any);
    const st: any = { palette: { bg: '#EAE26D', text: '#181714', muted: '#4A473F', accent: '#181714', surface: '#F1ECDE' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: true, profileHeader: false, underline: false, planes: false }, accentStyle: 'marker', caseStyle: 'lower', caseExceptions: ['Acme Labs'] };
    const b = await L.buildSlide('statement', 0, { headline: 'Back Quick Flip on Kickstarter with Acme Labs', caption: 'Open to 20 backers.', accent: ['Kickstarter'] }, st, { handle: '@quick.flip', index: 1, total: 8 });
    const t = (b.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
    return {
      handleWords: w,
      brand: lower('Back Quick Flip on Kickstarter today').headline,
      sentenceStart: lower('Flip your hoodie into a bag').headline,
      namedStart: lower('Quick Flip is a hoodie').headline,
      many: lower('Watch YouTube on your iPhone and iOS, said Instagram, TikTok and LinkedIn. The AI helps').headline,
      kicker: lower('x').kicker,
      listed: lower('Built with Acme Labs', ['Acme Labs']).headline,
      up: upper('Back Quick Flip on Kickstarter and YouTube for iPhone and iOS with AI').headline,
      drawn: t.text,
      accentRun: (t.runs ?? []).length,
    };
  });
  expect(r.handleWords).toEqual(['quick', 'flip']);
  expect(r.brand).toBe('back Quick Flip on Kickstarter today');
  expect(r.sentenceStart, 'a capital that only starts a sentence is not a brand').toBe('flip your hoodie into a bag');
  expect(r.namedStart, 'a two-word name at the start is kept').toBe('Quick Flip is a hoodie');
  expect(r.many).toBe('watch YouTube on your iPhone and iOS, said Instagram, TikTok and LinkedIn. the AI helps');
  expect(r.kicker, 'kickers are not transformed').toBe('Quick Flip News');
  expect(r.listed).toBe('built with Acme Labs');
  expect(r.up, 'upper case keeps only the mixed-case brands').toBe('BACK QUICK FLIP ON KICKSTARTER AND YouTube FOR iPhone AND iOS WITH AI');
  expect(r.drawn).toContain('Kickstarter');
  expect(r.drawn).toContain('Acme Labs');
  expect(r.drawn.startsWith('back ')).toBe(true);
  expect(r.accentRun).toBeGreaterThan(0);
});

test('the preset writer prompt: a shape line and the complete-title rule for presets only; the extra tokens', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const P = await import('/src/carousel/presets.ts');
    const req: any = { text: 'Quick Flip is a hoodie that flips into a backpack. '.repeat(6), slides: 8, tone: 'clear', format: 'carousel', styleChoice: 'a', styles: [] };
    const out: any = {};
    for (const id of ['hot-flat', 'glass-gradient', 'editorial-collage']) {
      const pack = P.presetPackFor(id, false)!;
      const { style } = D.styleFromPack(pack);
      const full = D.buildLibraryPrompt(req, { pack }, style, 'a look', 8);
      const noLook = D.buildLibraryPrompt(req, { pack: { ...pack, look: undefined } }, { ...style, flavour: undefined }, 'a look', 8);
      const added = full.split('\n').filter((l: string) => /This look suits|complete phrase/.test(l));
      out[id] = { added, chars: added.join('\n').length, shape: added.find((l: string) => /This look suits/.test(l)) };
      out[id + ':ref'] = noLook.includes('This look suits') || noLook.includes('complete phrase');
    }
    return out;
  });
  for (const id of ['hot-flat', 'glass-gradient', 'editorial-collage']) {
    expect(r[id].added.length).toBe(2);
    expect(r[id].shape).toContain('never invent content to fit');
    expect(r[id].added.join(' ')).toContain('stands alone as a complete phrase');
    expect(r[id + ':ref'], 'a reference prompt has neither line').toBe(false);
    expect(r[id].chars, 'the added prompt stays tiny').toBeLessThan(700);
  }
  expect(r['glass-gradient'].shape).toMatch(/card lists|comparisons/);
  expect(r['hot-flat'].shape).toMatch(/big statements|one big figure/);
  console.log('PROMPT ' + JSON.stringify(Object.fromEntries(['hot-flat', 'glass-gradient', 'editorial-collage'].map((id) => [id, { chars: r[id].chars, estTokens: Math.round(r[id].chars / 4), shape: r[id].shape }]))));
});
