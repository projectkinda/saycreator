// Round J part 1: the second colour (accent2) and the extra colour (accent3) on the small marks. No writer at all: these draw with the layout library directly.
import { expect, test } from '@playwright/test';

test.setTimeout(3 * 60_000);

test('J1: the second and extra colour roles: used where they show, today\'s colours where they do not, and nothing changes without them', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const C: any = await import('/src/carousel/layouts/cuts.ts');
    const base = { bg: '#FFFFFF', text: '#111111', muted: '#555555', accent: '#14213D', surface: '#F2F2F2', onAccent: '#FFFFFF', accentText: '#14213D', accentDisplay: '#14213D' };
    const dark = { ...base, bg: '#111111', text: '#F4F4F4', surface: '#222222', onAccent: '#FFFFFF' };
    return {
      none: C.secondRoles(base),
      orangeLight: C.secondRoles(base, '#FCA311'),
      whiteLight: C.secondRoles(base, '#FFFFFF', '#F5F1E8'),
      limeLight: C.secondRoles(base, '#C6F432'),
      limeDark: C.secondRoles(dark, '#C6F432', '#FF6B5B'),
      sameAsMain: C.secondRoles(base, '#14213d'),
    };
  });
  // no second or extra colour: exactly today's roles
  expect(r.none).toEqual({ accent2: '#14213D', onAccent2: '#FFFFFF', accent2Text: '#14213D', accent3: '#14213D' });
  expect(r.sameAsMain.accent2).toBe('#14213D');
  // orange on white: a mark in orange with an ink that reads on it; orange as TEXT on white is under 4.5:1, so numerals set as text stay as today
  expect(r.orangeLight.accent2).toBe('#FCA311');
  expect(r.orangeLight.accent2Text).toBe('#14213D');
  // white and paper on a white slide do not show: today's colours
  expect(r.whiteLight).toEqual({ accent2: '#14213D', onAccent2: '#FFFFFF', accent2Text: '#14213D', accent3: '#14213D' });
  // lime on white shows by its colour (OKLab), not by brightness, and the ink on it reads: used for marks, not for text
  expect(r.limeLight.accent2).toBe('#C6F432');
  expect(r.limeLight.accent2Text).toBe('#14213D');
  // on a dark slide lime reads as text too, and coral is the thin rules
  expect(r.limeDark).toMatchObject({ accent2: '#C6F432', accent2Text: '#C6F432', accent3: '#FF6B5B' });
});

test('J1: a checklist draws its ticks in the second colour, a one-colour brand draws exactly as it did, and no second-colour name is left in a drawing without one', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const BP: any = await import('/src/carousel/brandPalette.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts');
    await fonts.loadFonts();
    const spec = { layout: 'checklist', fields: { title: 'Before you post', items: ['One idea per slide', 'Big, readable words', 'A clear last step'] }, accents: [] };
    const drawWith = async (colours: string[] | null, idx: number) => {
      const base = PR.presetPackFor('dark-quiet', false, null);
      const pack = colours ? BP.applyBrand(structuredClone(base), { colours }).pack : base;
      const { style } = DL.styleFromPack(structuredClone(pack));
      const d = await DL.drawOne(spec, 0, style, { handle: '@x', index: idx, total: 7, cut: 'plain', invert: false, density: 'normal' });
      return d.built.svg as string;
    };
    const out: any = {};
    out.twoDark = await drawWith(['#2557D6', '#C6F432'], 0);
    out.twoLight = await drawWith(['#2557D6', '#C6F432'], 1);
    out.one = await drawWith(['#2557D6'], 0);
    out.none = await drawWith(null, 0);
    return out;
  });
  expect(r.twoDark.toUpperCase()).toContain('#C6F432');
  expect(r.twoLight.toUpperCase()).toContain('#C6F432');
  for (const k of ['one', 'none']) {
    expect(r[k].toUpperCase(), k).not.toContain('#C6F432');
    expect(r[k], `${k}: no second-colour token or palette entry is left`).not.toMatch(/accent2|accent3|onAccent2/i);
  }
});

test('J1: "What we adjusted" says in one plain sentence where the second colour cannot be used, and nothing when it is used normally', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const PR: any = await import('/src/carousel/presets.ts');
    const BP: any = await import('/src/carousel/brandPalette.ts');
    const of = (colours: string[]) => BP.applyBrand(structuredClone(PR.presetPackFor('style-3', false, null)), { colours }).changes.filter((c: any) => c.kind === 'second');
    return { paper: of(['#1a1a1a', '#f5f1e8']), amber: of(['#0b3c5d', '#f2a900']), extra: of(['#1f4d3a', '#f2a900', '#f5f1e8']) };
  });
  expect(r.amber, 'amber shows everywhere: nothing to say').toEqual([]);
  expect(r.paper).toHaveLength(1);
  expect(r.paper[0].text).toBe('Your second colour does not show on your light slides, so the small marks there (list numbers, ticks, bullets) use your main colour.');
  expect(r.paper[0].text).not.toMatch(/#[0-9a-f]{3,6}|\d:1/i);
  expect(r.paper[0].detail).toMatch(/#F5F1E8 on #[0-9A-F]{6}: [\d.]+:1/);
  expect(r.extra.map((c: any) => c.text)).toEqual(['Your extra colour does not show on your light slides, so the thin lines there use your main colour.']);
});
