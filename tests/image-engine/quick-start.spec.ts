// The simple carousel page: one panel with three steps (drop a reference, Read it, paste text and Generate); everything else under Advanced; a project that points to a style
// that no longer exists opens with the default style and a note. A fake reader stands in for the model: no model calls.
import { expect, test, type Page } from '@playwright/test';
import { toStep } from './ui';
import { fakeReader, labelsAnswer, readAnswer, refineAnswer, storedTemplates } from './reference-helpers';

test.setTimeout(180_000);
test.use({ viewport: { width: 1300, height: 1000 } });

const usual = (kind: string, n: number, prompt = '') => (kind === 'read' || kind === 'retry' ? (prompt.includes('describe the scene') || /r\d+T\d+/.test(prompt) ? labelsAnswer(prompt, { seen: ['cover'] }) : readAnswer({ seen: ['cover'] })) : n === 0 ? refineAnswer({ patches: [], score: 70, stop: true }) : refineAnswer({ patches: [], stop: true }));

/** A small two-page PDF (no xref table: the reader rebuilds it). */
function twoPagePdf(): Buffer {
  const stream = (rgb: string) => `0 0 0 rg ${rgb} rg 40 40 320 200 re f`;
  const s1 = stream('0.8 0.2 0.2');
  const s2 = stream('0.2 0.4 0.8');
  const body = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 500]/Contents 5 0 R/Resources<<>>>>endobj',
    '4 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 500]/Contents 6 0 R/Resources<<>>>>endobj',
    `5 0 obj<</Length ${s1.length}>>stream\n${s1}\nendstream endobj`,
    `6 0 obj<</Length ${s2.length}>>stream\n${s2}\nendstream endobj`,
    'trailer<</Root 1 0 R/Size 7>>',
    '%%EOF',
  ].join('\n');
  return Buffer.from(body, 'latin1');
}

const storedStyle = (page: Page) =>
  page.evaluate(() => {
    try {
      return (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as { project?: { doc?: { style?: string } } }).project?.doc?.style ?? '';
    } catch {
      return '';
    }
  });

test('the page has the steps, the reference box is behind a link, and the other tools are under Developer tools and nothing was deleted', async ({ page }) => {
  await fakeReader(page, usual);
  await page.goto('/images/carousel');
  await expect(page.locator('.cr-wiz-steps .cr-wiz-name')).toHaveText(['Content', 'Format', 'Style', 'Slides']);
  await expect(page.getByLabel('Your text or topic')).toBeVisible();
  await toStep(page, 3);
  await expect(page.getByRole('button', { name: 'Make carousel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read it' })).toHaveCount(0);
  await page.getByRole('button', { name: /^New style/ }).click();
  await expect(page.getByRole('button', { name: 'Read it' })).toBeDisabled();
  // The old tools are not on the page until Developer tools is switched on.
  await expect(page.getByText('Match a reference', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: /New style/ }).first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Styles' }).first()).toBeVisible();
  await page.getByRole('checkbox', { name: 'Developer tools' }).check();
  await expect(page.getByRole('link', { name: 'Open the Styles page' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Report' })).toBeVisible();
  // Recreate and Match mode (from a reference) are under Advanced, in the same Match a reference panel as before.
  await expect(page.getByText('Match a reference', { exact: true })).toBeVisible();
  await page.getByText('Match a reference', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Recreate/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Match/ })).toBeVisible();
  await expect(page.getByText('Reference reader (match mode')).toBeVisible();
});

test('a PDF becomes one slide per page, Read it saves the result as a style and selects it', async ({ page }) => {
  const rec = await fakeReader(page, usual);
  await page.goto('/images/carousel');
  await toStep(page, 3);
  await page.getByRole('button', { name: /^New style/ }).click();
  const quick = page.getByTestId('quick-start');
  await quick.getByLabel('Choose reference images or a PDF').setInputFiles({ name: 'my deck.pdf', mimeType: 'application/pdf', buffer: twoPagePdf() });
  await expect(page.getByTestId('quick-count')).toHaveText('2 pictures added', { timeout: 90_000 });
  await expect(quick.getByText(/2 of 2 pages added as slides/)).toBeVisible();
  const read = quick.getByRole('button', { name: 'Read it' });
  await expect(read).toBeEnabled({ timeout: 60_000 });
  await read.click();
  await expect(page.getByTestId('quick-saved')).toContainText('as a Mine style and selected it', { timeout: 120_000 });
  expect(rec.reads.length).toBeGreaterThan(0);
  const names = rec.reads.flatMap((r) => r.images.map((i) => i.name));
  expect(names.length, 'the reader got the page pictures').toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await storedTemplates(page)).length, { timeout: 30_000 }).toBe(1);
  await expect.poll(() => storedStyle(page), { timeout: 30_000 }).toMatch(/^mine-/);
});

test('an old project that names a style that no longer exists opens with the default style and a note, not an error', async ({ page }) => {
  await page.goto('/images/carousel');
  await page.evaluate(async () => {
    const Dc = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    const U = await import('/src/carousel/useProject.ts');
    const doc = { ...Dc.emptyDoc('mine-gone-template'), script: S.EXAMPLE };
    U.writeStore(U.STORE_KEY, JSON.stringify({ project: { doc, past: [], future: [] } }));
  });
  await page.reload();
  await expect(page.getByText(/no longer available, so it opens with the default style/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Filmstrip' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => storedStyle(page), { timeout: 30_000 }).toBe('editorial-collage');
});
