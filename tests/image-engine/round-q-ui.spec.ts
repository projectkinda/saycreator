// Round Q part 4: the "Show them" fold looks tappable (a chevron that turns when open, a hover state, a 44 px tap area); the Format step at 390 px gives "Platform" the space "Slides" has, and
// the default (no platform: no limit) is a chip of its own, selected; a chosen platform also bounds the extra slides "Keep every sentence" allows. ZERO model calls (a fake writer).
import { expect, test, type Route } from '@playwright/test';
import { toStep } from './ui';

test('Q4: the Format step at 390 px: Platform has the space Slides has, "None" is selected by default and clears a platform', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill('A short text about a morning ride on the motorbike, before the city wakes up.');
  await toStep(page, 2);
  const r = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="options"]')!;
    const labels = [...box.querySelectorAll('.field-label')] as HTMLElement[];
    const slides = labels.find((l) => l.textContent === 'Slides')!, platform = labels.find((l) => l.textContent === 'Platform')!;
    const above = (el: HTMLElement) => { const prev = el.closest('.cr-inline')!.previousElementSibling as HTMLElement | null; return prev ? el.getBoundingClientRect().top - prev.getBoundingClientRect().bottom : null; };
    return { platformGap: above(platform), slidesTop: slides.getBoundingClientRect().top, overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(r.platformGap!, 'the space above Platform').toBeGreaterThanOrEqual(14);
  expect(r.overflow).toBe(false);
  const group = page.getByRole('group', { name: 'Platform' });
  await expect(group.getByRole('button', { name: 'None', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await group.getByRole('button', { name: 'X', exact: true }).click();
  await expect(group.getByRole('button', { name: 'X', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { name: 'None', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await group.getByRole('button', { name: 'None', exact: true }).click();
  await expect(group.getByRole('button', { name: 'None', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { name: 'X', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('Q4: a platform bounds the extra slides: X (at most 4) with 4 picked asks for 4 and never "up to 6"; Instagram with 7 still allows up to 9', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const pack = PR.presetPackFor('style-6', false);
    const style = D.styleFromPack(pack).style;
    const p = (slides: number, slidesMax?: number) => D.buildLibraryPrompt({ text: 'A text. '.repeat(30), slides, tone: 'clear', format: 'carousel', keepEverySentence: true, ...(slidesMax ? { slidesMax } : {}) }, { pack }, style, 'a look', slides);
    return { x4: p(4, 4), ig7: p(7, 20), none7: p(7) };
  });
  expect(r.x4).not.toMatch(/use up to \d+ slides/);
  expect(r.x4).toContain('Write 4 slides.');
  expect(r.ig7).toContain('use up to 9 slides (never more than 9)');
  expect(r.none7).toContain('use up to 9 slides (never more than 9)');
});

test('Q4: the "Show them" fold: a chevron that turns when open, a 44 px tap area, a hover state', async ({ page }) => {
  const TEXT = "Most creators don't have a design problem. They have a time problem. The idea took ten minutes. Try it on your next post.";
  const plan = { title: 'x', slides: [
    { layout: 'statement', fields: { headline: "Most creators don't have a design problem.", caption: 'They have a time problem.' }, accents: [] },
    { layout: 'split-text', fields: { headline: 'You write a good post', paragraph: 'Then the evening goes.' }, accents: [] },
    { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Follow for more' }, accents: [] },
  ] };
  await page.route('**/__carousel/status', (r: Route) => r.fulfill({ json: { available: true } }));
  await page.route('**/api/carousel/status', (r: Route) => r.fulfill({ json: { available: false } }));
  await page.route('**/__carousel/write', (r: Route) => r.fulfill({ json: { text: JSON.stringify(plan), ms: 5 } }));
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT);
  await toStep(page, 3);
  await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Warm editorial collage/ }).first().click();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.locator('.cr-film img')).toHaveCount(3, { timeout: 90_000 });
  const summary = page.getByTestId('not-on-slides').locator('summary');
  await expect(summary).toBeVisible();
  const read = () => summary.evaluate((el) => ({ h: el.getBoundingClientRect().height, chevron: getComputedStyle(el, '::before').transform, bg: getComputedStyle(el).backgroundColor, marker: getComputedStyle(el).listStyleType }));
  const closed = await read();
  expect(closed.h).toBeGreaterThanOrEqual(44);
  expect(closed.chevron).not.toBe('none');
  await summary.hover();
  const hovered = await read();
  expect(hovered.bg, 'a hover state').not.toBe(closed.bg);
  await summary.click();
  await expect(page.getByTestId('not-on-slides-list')).toBeVisible();
  const open = await read();
  expect(open.chevron, 'the chevron turns when open').not.toBe(closed.chevron);
});
