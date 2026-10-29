// Step 14g-fix, REAL (REAL_SCENE=1): the single slide read once in a chosen mode (READ_MODE=labels|scene). REPLAY=<file> answers from a saved answer instead of
// the reader, so a fix to the code can be measured again without a new model call. Reference files are read from the private folder and never stored.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { loopDone, openStyleFromReferences, refInput, ROOT } from './reference-helpers';

const OUT = path.join(ROOT, 'out/image-engine/scene-single');
const DIR = path.join(ROOT, 'Reference carousels likes');
test.skip(process.env.REAL_SCENE !== '1', 'Real runs are opt-in (REAL_SCENE=1): they use model time.');
test.use({ viewport: { width: 1500, height: 1000 } });

test('single slide, one read', async ({ page }) => {
  test.setTimeout(600_000);
  fs.mkdirSync(OUT, { recursive: true });
  const mode = process.env.READ_MODE === 'labels' ? 'labels' : 'scene';
  const tag = process.env.TAG ?? mode;
  await page.addInitScript((m) => localStorage.setItem('creator.readMode', m), mode);
  if (process.env.REPLAY) {
    const saved = JSON.parse(fs.readFileSync(process.env.REPLAY, 'utf8')).raw;
    await page.addInitScript((r) => ((window as unknown as { __sceneReplay: unknown }).__sceneReplay = r), saved);
  }
  await openStyleFromReferences(page);
  await expect(page.getByText('Reader: Claude Code on this computer')).toBeVisible({ timeout: 30_000 });
  const real = fs.readdirSync(DIR).find((f) => f.startsWith('1503c1de'))!;
  await refInput(page).setInputFiles(path.join(DIR, real));
  const card = page.locator('.rf-upload').first();
  await expect(card.getByRole('checkbox').first()).toBeVisible();
  const total = await card.getByRole('checkbox').count();
  for (let i = 2; i <= total; i++) await card.getByRole('checkbox', { name: new RegExp(`^Use slide ${i} of `) }).uncheck();
  await expect(page.getByText(/^Instant draft: [\d.]+ s, no model\./)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Name the style').fill(`single-${tag}`);
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Read references' }).click();
  await Promise.race([loopDone(page).catch(() => undefined), page.getByRole('alert').first().waitFor({ timeout: 300_000 }).catch(() => undefined)]);
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  const alert = (await page.getByRole('alert').allInnerTexts()).filter((t) => !/would not save/.test(t));
  const out: Record<string, unknown> = { tag, mode, seconds, alert };
  if (!alert.length) {
    await expect(page.getByRole('list', { name: 'Layout overlap' })).toBeVisible({ timeout: 60_000 });
    out.overlap = await page.getByRole('list', { name: 'Layout overlap' }).getByRole('listitem').allInnerTexts();
    out.calls = (await page.getByRole('status', { name: 'Model calls' }).innerText()).replace(/\s+/g, ' ');
  }
  const dump = await page.evaluate(() => (window as unknown as { __sceneDump?: unknown }).__sceneDump ?? null);
  if (dump) fs.writeFileSync(path.join(OUT, `${tag}-dump.json`), JSON.stringify(dump, null, 1));
  fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(out, null, 2));
  expect(alert).toEqual([]);
});
