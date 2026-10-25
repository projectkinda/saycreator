// The style format: validation in plain words, SVG assets, and "a new style is a new folder, no code changes".
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STYLES = path.join(ROOT, 'src/image-engine/styles');
const readStyle = (n: string) => JSON.parse(fs.readFileSync(path.join(STYLES, n, 'style.json'), 'utf8'));
const DECK = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/image-engine/carousels/howto-linkedin.json'), 'utf8'));

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

const check = (page: Page, raw: unknown, folder: string) => call<{ errors: string[]; warnings: string[] }>(page, 'styleValidate', raw, folder);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

test('the shipped styles pass; a style that breaks our phone-size rules loads with a warning that says so', async ({ page }) => {
  for (const n of ['hot-flat', 'editorial-collage', 'dark-quiet', 'object-neon']) {
    const r = await check(page, readStyle(n), n);
    expect(r.errors, n).toEqual([]);
  }
  const quiet = await check(page, readStyle('dark-quiet'), 'dark-quiet');
  expect(quiet.warnings.join(' ')).toMatch(/type\.body is 28 px.*at least 32 px/);
  expect(quiet.warnings.join(' ')).toMatch(/type.small is 30 px/);
  expect(quiet.warnings.join(' ')).not.toMatch(/type.label/); // labels and page numbers were raised to 32 px
});

test('every kind of mistake in style.json is refused with a sentence that says what to change', async ({ page }) => {
  const good = readStyle('hot-flat');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cases: [string, (s: any) => void, RegExp][] = [
    ['name differs from folder', (s) => { s.name = 'hotflat'; }, /"name" is "hotflat" but the folder is called "hot-flat"\. They must match/],
    ['missing palette colour', (s) => { delete s.palettes.dark.accent; }, /palette "dark" has no "accent" colour/],
    ['colour that is not a colour', (s) => { s.palettes.dark.text = 'white'; }, /palette "dark": "text" is "white", which is not a colour/],
    ['unknown palette in rhythm', (s) => { s.rhythm = ['dark', 'neon']; }, /"rhythm" uses the palette "neon", which is not in "palettes"/],
    ['font weight that is not bundled', (s) => { s.fonts.headlineWeight = 900; }, /fonts\.headlineWeight is 900, but Schibsted Grotesk is bundled only in weights 600, 700, 800/],
    ['font that is not bundled', (s) => { s.fonts.body = 'Comic Sans'; }, /fonts\.body is "Comic Sans"\. Only the bundled fonts can be used/],
    ['margin too small', (s) => { s.spacing.margin = 20; }, /spacing\.margin is 20\. Anything under 48 px is too close to the edge/],
    ['only one layout rule', (s) => { s.layouts.step = [s.layouts.step[0]]; }, /layouts\.step has 1 rule\. A style needs at least 2 distinct layouts/],
    ['two rules but the same layout', (s) => { s.layouts.stat = [{ use: 'stat-card', when: { valueCharsMax: 3 } }, { use: 'stat-card' }]; }, /layouts\.stat uses only 1 different layout/],
    ['layout that does not exist', (s) => { s.layouts.cover[0].use = 'cover-spiral'; }, /layouts\.cover\[0\]\.use is "cover-spiral"\. Layouts for cover: cover-stack, cover-top, cover-centre/],
    ['layout from the wrong slide type', (s) => { s.layouts.quote[0].use = 'cover-stack'; }, /layouts\.quote\[0\]\.use is "cover-stack"/],
    ['last rule has a condition', (s) => { s.layouts.closing[1].when = { headlineWordsMin: 2 }; }, /last rule of layouts\.closing has a "when"/],
    ['unknown condition', (s) => { s.layouts.content[0].when = { colour: 'red' }; }, /layouts\.content\[0\]\.when has "colour", which is not a condition/],
    ['asset that is not listed', (s) => { s.layouts.cover[0].params.asset = 'rocket'; }, /uses the asset "rocket", which is not listed in "assets"/],
    ['unknown chrome', (s) => { s.chrome = 'banner'; }, /"chrome" must be one of dots-swipe, page-number, strip, none/],
    ['missing slide type', (s) => { delete s.layouts.stat; }, /layouts\.stat is missing\. Every slide type needs a list of at least 2 layout rules/],
    ['palette for a type that does not exist', (s) => { s.byType = { cover: 'neon' }; }, /"byType\.cover" uses the palette "neon", which does not exist/],
  ];
  for (const [what, edit, expected] of cases) {
    const s = clone(good);
    edit(s);
    const r = await check(page, s, 'hot-flat');
    expect(r.errors.length, `${what} should be refused`).toBeGreaterThan(0);
    expect(r.errors.join(' | '), what).toMatch(expected);
  }
  expect((await check(page, 'not an object', 'x')).errors[0]).toMatch(/style\.json is not a JSON object/);
});

test('SVG assets: the small allowed set is accepted; anything else is refused in words', async ({ page }) => {
  const svg = (inner: string, vb = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`;
  const ok = await call<{ asset?: { shapes: unknown[] }; errors: string[] }>(page, 'svgCheck', 'good', svg('<path d="M 10 10 L 90 90 Q 50 10 10 90 Z" stroke="accent" stroke-width="6" fill="none"/><circle cx="50" cy="50" r="20" fill="text"/><line x1="0" y1="0" x2="100" y2="0" stroke="muted"/><polygon points="10,10 90,10 50,90" fill="marker"/>'));
  expect(ok.errors).toEqual([]);
  expect(ok.asset!.shapes).toHaveLength(4);
  const bad: [string, string, RegExp][] = [
    ['hex colour', svg('<circle cx="5" cy="5" r="4" fill="#FF0000"/>'), /fill="#FF0000"\. Use a colour name from the palette/],
    ['lower-case path', svg('<path d="m 10 10 l 5 5" stroke="text"/>'), /commands other than M L C Q H V Z in capital letters/],
    ['arc', svg('<path d="M 10 10 A 5 5 0 0 1 20 20" stroke="text"/>'), /commands other than M L C Q H V Z/],
    ['unsupported element', svg('<text>hi</text>'), /<text>, which is not supported/],
    ['image element', svg('<image href="x.png"/>'), /<image>, which is not supported/],
    ['no viewBox', '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4" fill="text"/></svg>', /needs a viewBox that starts at 0 0/],
    ['rounded rect', svg('<rect x="1" y="1" width="9" height="9" rx="2" fill="text"/>'), /rounded corners/],
    ['nothing drawn', svg('<circle cx="5" cy="5" r="4"/>'), /neither fill nor stroke/],
    ['empty', svg(''), /contains no shapes/],
    ['not svg', 'hello', /not a valid SVG file/],
  ];
  for (const [what, text, expected] of bad) {
    const r = await call<{ errors: string[] }>(page, 'svgCheck', 'x', text);
    expect(r.errors.join(' | '), what).toMatch(expected);
  }
});

test('assets take the style\'s own colours, so one graphic works in every palette', async ({ page }) => {
  const slides = await call<{ layout: string; palette: string; plan: { layers: { id: string; fill?: string; stroke?: { color: string } }[] } }[]>(page, 'styleCompose', DECK, 'hot-flat');
  const cover = slides[0];
  const style = readStyle('hot-flat');
  const art = cover.plan.layers.filter((l) => l.id.startsWith('art-'));
  expect(art.length).toBeGreaterThan(0);
  const pal = style.palettes[cover.palette] as Record<string, string>;
  for (const l of art) expect(Object.values(pal)).toContain(l.stroke?.color ?? l.fill);
});

test('a new style is a new folder: it is picked up with no code change, and a broken folder is reported, not loaded', async ({ page }) => {
  test.setTimeout(120_000);
  const good = path.join(STYLES, 'zz-copy');
  const broken = path.join(STYLES, 'zz-broken');
  try {
    fs.cpSync(path.join(STYLES, 'hot-flat'), good, { recursive: true });
    const s = readStyle('hot-flat');
    s.name = 'zz-copy';
    s.title = 'Copy for the test';
    s.palettes.hot.bg = '#FF3D81';
    s.palettes.hot.muted = '#3A0F20';
    fs.writeFileSync(path.join(good, 'style.json'), JSON.stringify(s, null, 2));
    fs.mkdirSync(broken, { recursive: true });
    const b = readStyle('hot-flat');
    b.name = 'zz-broken';
    b.fonts.headlineWeight = 900;
    fs.writeFileSync(path.join(broken, 'style.json'), JSON.stringify(b, null, 2));

    await expect
      .poll(async () => {
        await page.reload();
        await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
        return (await call<{ styles: { spec: { name: string } }[]; problems: { folder: string }[] }>(page, 'styleList')).styles.some((x) => x.spec.name === 'zz-copy');
      }, { timeout: 60_000, intervals: [1000] })
      .toBe(true);
    const r = await call<{ styles: { spec: { name: string } }[]; problems: { folder: string; messages: string[] }[] }>(page, 'styleList');
    expect(r.styles.map((x) => x.spec.name)).toContain('zz-copy');
    expect(r.styles.map((x) => x.spec.name)).not.toContain('zz-broken');
    const prob = r.problems.find((p) => p.folder === 'zz-broken');
    expect(prob?.messages.join(' ')).toMatch(/headlineWeight is 900/);
    // The new style draws, with its own colour on the cover.
    const slides = await call<{ plan: { layers: { id: string; fill?: string }[] } }[]>(page, 'styleCompose', DECK, 'zz-copy');
    expect(slides[0].plan.layers.find((l) => l.id === 'bg')!.fill).toBe('#FF3D81');
  } finally {
    fs.rmSync(good, { recursive: true, force: true });
    fs.rmSync(broken, { recursive: true, force: true });
  }
});
