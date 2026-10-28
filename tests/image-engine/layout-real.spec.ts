// Step 14e, REAL (REAL_LAYOUT=1): the same five real reference sets read twice: BEFORE (the stored layouts only: the free layout switched off, the full style
// read with rounds) and AFTER (the detected boxes, one labelling call). For each it records the layout overlap the closeness panel reports, the model calls,
// and screenshots of the detection overlay and of the result. Reference files are read from the private folder and never stored.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { loopDone, openStyleFromReferences, refInput, ROOT } from './reference-helpers';

const OUT = path.join(ROOT, 'out/image-engine/layout-real');
const DIR = path.join(ROOT, 'Reference carousels likes');
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1500, height: 1000 } });
test.skip(process.env.REAL_LAYOUT !== '1', 'Real runs are opt-in (REAL_LAYOUT=1): they use model time.');
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const SETS: { id: string; label: string; file: string; keep?: number[] }[] = [
  { id: 'deck-a', label: 'Deck A (6 of 12 slides)', file: '44937935e682165c1f93e99a11a47123.jpg', keep: [1, 2, 3, 5, 8, 11] },
  { id: 'deck-b', label: 'Deck B (6 of 9 slides)', file: '58d68b12ac74ce8cc0f8d2f9df45e6de.jpg', keep: [1, 2, 4, 5, 7, 9] },
  { id: 'deck-c', label: 'Deck C, the yellow posters (6 of 12 slides)', file: '05bedfc0.jpg', 'dfc030d7d').slice(0, 36) + '.jpg', keep: [1, 2, 3, 5, 8, 11] },
  { id: 'single', label: 'One slide on its own', file: '1503c1de8dded2a7cbe333f061c7131a.jpg', keep: [1] },
  { id: 'laptop', label: 'The laptop slide', file: '9885e1020f38cd3f6c18df82813e7699.jpg', keep: [2] },
];

async function run(page: Page, set: (typeof SETS)[number], mode: 'before' | 'after') {
  await openStyleFromReferences(page);
  await expect(page.getByText('Reader: Claude Code on this computer')).toBeVisible({ timeout: 30_000 });
  await page.evaluate((m) => ((window as unknown as { __flags: { free: boolean } }).__flags.free = m === 'after'), mode);
  const real = fs.readdirSync(DIR).find((f) => f.startsWith(set.file.slice(0, 8)))!;
  await refInput(page).setInputFiles(path.join(DIR, real));
  const card = page.locator('.rf-upload').first();
  await expect(card).toBeVisible();
  await expect(card.getByRole('checkbox').first()).toBeVisible();
  const total = await card.getByRole('checkbox').count();
  if (set.keep) for (let i = 1; i <= total; i++) if (!set.keep.includes(i)) await card.getByRole('checkbox', { name: new RegExp(`^Use slide ${i} of `) }).uncheck();
  await expect(page.getByText(/^Instant draft: [\d.]+ s, no model\./)).toBeVisible({ timeout: 30_000 });
  const draft = Number(/Instant draft: ([\d.]+) s/.exec(await page.getByText(/^Instant draft:/).innerText())![1]);
  if (mode === 'before') await page.getByRole('checkbox', { name: /^Advanced:/ }).check();
  await page.getByLabel('Name the style').fill(`${set.id}-${mode}`);
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Read references' }).click();
  await Promise.race([loopDone(page).catch(() => undefined), page.getByRole('alert').first().waitFor({ timeout: 600_000 }).catch(() => undefined)]);
  const alert = (await page.getByRole('alert').allInnerTexts()).filter((t) => !/would not save/.test(t));
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  const out: Record<string, unknown> = { id: set.id, label: set.label, mode, seconds, instantDraftSeconds: draft, alert };
  if (!alert.length) {
    await expect(page.getByRole('list', { name: 'Layout overlap' })).toBeVisible({ timeout: 60_000 });
    out.overlap = await page.getByRole('list', { name: 'Layout overlap' }).getByRole('listitem').allInnerTexts();
    out.calls = (await page.getByRole('status', { name: 'Model calls' }).innerText()).replace(/\s+/g, ' ');
    out.missing = await page.getByRole('list', { name: 'Missing tools' }).getByRole('listitem').allInnerTexts();
    await page.locator('section[aria-labelledby="rf-result-h"]').screenshot({ path: path.join(OUT, `${set.id}-${mode}-result.png`) });
    if (mode === 'after') {
      await page.getByRole('button', { name: 'Show what I detected' }).click();
      await page.locator('.rf-detect').screenshot({ path: path.join(OUT, `${set.id}-detected.png`) });
      out.boxes = await page.getByLabel('What I detected').getByRole('button', { name: /^(Text box|Photo region|Shape|Graphic)/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
      out.notDrawn = await page.getByRole('list', { name: 'Missing for this reference' }).getByRole('listitem').allInnerTexts().catch(() => []);
    }
  }
  fs.writeFileSync(path.join(OUT, `${set.id}-${mode}.json`), JSON.stringify(out, null, 2));
  return out;
}

for (const set of SETS) {
  test(`real: ${set.label}`, async ({ page }) => {
    test.setTimeout(900_000);
    const after = await run(page, set, 'after');
    expect(after.alert, 'the labelling read worked').toEqual([]);
    const before = await run(page, set, 'before');
    expect(before.alert, 'the old read worked').toEqual([]);
  });
}
