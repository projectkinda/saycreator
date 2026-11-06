// Round-4 fixes in the layout library (no model): the ink pick on a full-bleed accent slide, the numeral bleed (at least ~85% of the glyph stays visible) and no lone short
// word on a line in the split-text columns.
import { expect, test } from '@playwright/test';

test.setTimeout(240_000);

const STYLES = `
  const STYLES = {
    dark: { palette: { bg: '#0A0A0A', text: '#FFFFFF', muted: '#8A8A8A', accent: '#CC0000', surface: '#161616' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'glow', devices: { marker: false, profileHeader: true, underline: false, planes: false }, accentStyle: 'text' },
    light: { palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#D9F77A', surface: '#F0F0F0' }, fonts: { headline: 'Schibsted Grotesk', body: 'Schibsted Grotesk' }, background: 'flat', devices: { marker: true, profileHeader: true, underline: false, planes: false }, accentStyle: 'marker' },
  };
`;

test('ink pick on a full-bleed accent slide: the text colour with the higher contrast, at least 4.5:1 (white on #CC0000)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (styles) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const STYLES: any = new Function(styles + ' return STYLES;')();
    const lum = (a: string, b: string) => C.contrastRgb(C.parseColor(a).rgb, C.parseColor(b).rgb);
    const red = L.coloursFor({ bg: '#0A0A0A', text: '#FFFFFF', muted: '#8A8A8A', accent: '#CC0000', surface: '#161616', onAccent: '#0A0A0A' }, { invert: 'full' });
    const lime = L.coloursFor({ bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#D9F77A', surface: '#F0F0F0', onAccent: '#0A0A0A' }, { invert: 'full' });
    // the whole slide: the headline, its accent phrase and the button label on the full-bleed red
    const b = await L.buildSlide('cta-button', 0, { headline: 'Back Quick Flip on Kickstarter', button: 'Back the project', sub: 'Early backers save 30%.', accent: ['Quick Flip on'] }, STYLES.dark, { handle: '@quick.flip', index: 6, total: 7, invert: 'full' });
    const title = (b.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
    return {
      red: { bg: red.F.bg, text: red.F.text, accent: red.F.accent, tText: lum(red.F.text, red.F.bg), tAccent: lum(red.F.accent, red.F.bg), onAccent: lum(red.F.onAccent, red.F.accent) },
      lime: { bg: lime.F.bg, text: lime.F.text, tText: lum(lime.F.text, lime.F.bg) },
      slide: { ok: b.ok, errors: b.errors, fieldBg: b.fieldBg, color: title.style.color, tColor: lum(title.style.color, b.fieldBg!), runs: (title.runs ?? []).map((x: any) => [x.color, lum(x.color, b.fieldBg!)]), hl: title.highlight ? { ink: title.highlight.textColor, bar: title.highlight.color, t: lum(title.highlight.textColor, title.highlight.color) } : null },
    };
  }, STYLES);
  expect(r.red.bg).toBe('#CC0000');
  expect(r.red.text).toBe('#FFFFFF'); // not the near-black that reaches only 3.4:1
  expect(r.red.tText).toBeGreaterThanOrEqual(4.5);
  expect(r.red.accent === r.red.text || r.red.tAccent >= 4.5).toBe(true);
  expect(r.red.onAccent).toBeGreaterThanOrEqual(4.5);
  expect(r.lime.text).toBe('#0A0A0A');
  expect(r.lime.tText).toBeGreaterThanOrEqual(4.5);
  expect(r.slide.errors).toEqual([]);
  expect(r.slide.fieldBg).toBe('#CC0000');
  expect(r.slide.tColor).toBeGreaterThanOrEqual(4.5);
  for (const [, ratio] of r.slide.runs) expect(r.slide.hl ? true : ratio >= 4.5).toBe(true);
  if (r.slide.hl) expect(r.slide.hl.t).toBeGreaterThanOrEqual(4.5);
});

test('numeral bleed: at least ~85% of the glyph stays visible', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (styles) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const STYLES: any = new Function(styles + ' return STYLES;')();
    const out: { n: string; v: number; share: number; bleed: number }[] = [];
    for (const n of ['1', '2', '3', '4', '5', '7', '9', '10', '12', '42']) for (const v of [0, 1] as const) {
      const b = await L.buildSlide('listicle-numeral', v, { numeral: n, title: 'Wear it as a pillow', body: 'Stuff the hood and sleeves.' }, STYLES.light, { handle: '@h', index: 2, total: 7 });
      out.push({ n, v, share: (b.plan!.bleedLeft ?? 0) / (b.plan!.glyphW ?? 1), bleed: b.plan!.bleedLeft ?? 0 });
    }
    const step = await L.buildSlide('step-numeral', 0, { step: '3', title: 'Pin one proof post', body: 'Feature your best post at the top.' }, STYLES.light, { handle: '@h', index: 2, total: 7 });
    return { out, stepBleed: step.plan!.bleedLeft ?? 0 };
  }, STYLES);
  for (const o of r.out) {
    expect(o.share, `numeral ${o.n}`).toBeLessThanOrEqual(0.15);
    expect(o.bleed).toBeGreaterThan(0);
  }
  expect(r.stepBleed).toBe(0);
});

test('split-text columns: no lone short word on a line (a, I, to ...)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (styles) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const T = await import('/src/image-engine/draw/text.ts');
    const STYLES: any = new Function(styles + ' return STYLES;')();
    const def = L.layoutDef('split-text')!;
    const cases: [string, any][] = [
      ['normal', def.samples.normal], ['long', def.samples.long], ['short', def.samples.short],
      ['real', { headline: 'Then lead with a result', paragraph: 'Open with one number or outcome, then pin your best post at the top.', accent: ['a result'] }],
      ['lone-a', { headline: 'Lead with a result', paragraph: 'Say who you help and how. Use a number, not a list of adjectives.', accent: ['a result'] }],
      ['lone-I', { headline: 'What I learned about a big idea', paragraph: 'A short note to a friend, so I can say it plainly.' }],
    ];
    const bad: string[] = [];
    let n = 0;
    for (const [sname, st] of Object.entries<any>(STYLES)) for (const v of [0, 1] as const) for (const [cname, f] of cases) {
      const b = await L.buildSlide('split-text', v, f, st, { handle: '@h', index: 3, total: 7 });
      n++;
      if (!b.ok) { bad.push(`${sname}/v${v + 1}/${cname}: ${b.errors.join(' | ')}`); continue; }
      for (const l of b.layers as any[]) {
        if (l.kind !== 'text' || !(l.name === 'title' || l.name === 'body') || !l.text) continue;
        const m = T.layoutText(l);
        const lines = m.lines.map((q: any) => String(q.text).trim());
        if (lines.length > 1) for (const t of lines) if (!/\s/.test(t) && t.length <= 3) bad.push(`${sname}/v${v + 1}/${cname}: ${l.name} has a line with the lone word "${t}" (${lines.join(' / ')})`);
      }
    }
    return { bad, n };
  }, STYLES);
  expect(r.n).toBe(24);
  expect(r.bad).toEqual([]);
});

test('a marker on a multi-word accent phrase draws its bar (the phrase is one glued token in the styled layout)', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (styles) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const T = await import('/src/image-engine/draw/text.ts');
    const STYLES: any = new Function(styles + ' return STYLES;')();
    const out: Record<string, { marks: number; bars: number; ink: string | null }> = {};
    for (const [name, st, inv] of [['red-full', STYLES.dark, 'full'], ['lime-plain', STYLES.light, false], ['lime-full', STYLES.light, 'full']] as const) {
      const b = await L.buildSlide('cta-button', 0, { headline: 'Early backers save 30%', button: 'Back the project', sub: 'Open to 20 backers only.', accent: ['save 30%'] }, st, { handle: '@q', index: 6, total: 7, invert: inv as any });
      const t = (b.layers as any[]).find((l) => l.kind === 'text' && l.name === 'title');
      const marks = T.layoutText(t).lines.reduce((a: number, l: any) => a + l.marks.length, 0);
      const bar = t.highlight ? (b.svg.match(new RegExp('<rect[^>]*fill="' + t.highlight.color + '"', 'gi')) ?? []).length : 0;
      out[name] = { marks, bars: bar, ink: t.highlight ? t.highlight.textColor : null };
    }
    return out;
  }, STYLES);
  for (const [name, o] of Object.entries(r)) {
    if (o.ink) {
      expect(o.marks, name + ': the glued phrase is marked').toBeGreaterThanOrEqual(1);
      expect(o.bars, name + ': the bar is in the drawing').toBeGreaterThanOrEqual(1);
    }
  }
  expect(r['red-full'].ink).not.toBeNull();
});
