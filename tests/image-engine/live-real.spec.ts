// REAL timings of the four long jobs, with the real dev reader and writer, off unless REAL_LIVE=1 (each job takes about a minute and uses model time).
// For the two style jobs it also runs each picture-size profile on the same references, to find how small the pictures sent to the reader can be
// before the result gets worse. Writes out/image-engine/live-real/<id>.json (stage times, rounds, scores) for the Results screen.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { loopDone, makeReference, openStyleFromReferences, refInput, ROOT } from './reference-helpers';
import { openThumb, photoInput, titleInput, allDrawn } from './thumbnail-app-helpers';

const OUT = path.join(ROOT, 'out/image-engine/live-real');
const CAROUSELS = path.join(ROOT, 'Reference carousels likes');
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1400, height: 1000 } });
test.skip(process.env.REAL_LIVE !== '1', 'Real timings are opt-in (REAL_LIVE=1): they use model time.');
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

interface JobOut {
  kind: string;
  status: string;
  title: string;
  seconds: number;
  stages: { id: string; label: string; status: string; seconds?: number; note?: string }[];
  rounds: { n: number; label: string; measuredPct: number; readerScore: number | null; score: number; kept?: boolean; draft?: boolean }[];
  cached?: boolean;
}
const readJob = (page: Page): Promise<JobOut> =>
  page.evaluate(() => {
    const j = (window as unknown as { __liveJobs: { now: () => Record<string, unknown> } }).__liveJobs.now() as { kind: string; status: string; title: string; startedAt: number; endedAt?: number; stages: JobOut['stages']; rounds: JobOut['rounds']; cached?: boolean };
    return { kind: j.kind, status: j.status, title: j.title, seconds: Math.round((((j.endedAt ?? Date.now()) - j.startedAt) / 1000) * 10) / 10, stages: j.stages, rounds: j.rounds.map((r) => ({ n: r.n, label: r.label, measuredPct: r.measuredPct, readerScore: r.readerScore, score: r.score, kept: r.kept, draft: r.draft })), cached: j.cached };
  });
const save = (id: string, o: unknown) => fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(o, null, 2));

async function styleJob(page: Page, id: string, file: string, keep: number[] | null, profile: string) {
  await openStyleFromReferences(page);
  await page.evaluate(async (p) => (window as unknown as { __speed: { setProfile: (x: string) => void } }).__speed.setProfile(p), profile);
  await page.evaluate(() => indexedDB.deleteDatabase('creator-reader-cache'));
  await refInput(page).setInputFiles(path.join(CAROUSELS, file));
  const card = page.locator('.rf-upload').first();
  await expect(card).toBeVisible();
  const total = await card.getByRole('checkbox').count();
  if (keep) for (let i = 1; i <= total; i++) if (!keep.includes(i)) await card.getByRole('checkbox', { name: new RegExp(`^Use slide ${i} of `) }).uncheck();
  await page.getByLabel('Name the style').fill(id);
  await page.getByRole('button', { name: 'Read references' }).click();
  await Promise.race([loopDone(page).catch(() => undefined), page.getByRole('alert').first().waitFor({ timeout: 900_000 }).catch(() => undefined)]);
  const job = await readJob(page);
  await page.screenshot({ path: path.join(OUT, `${id}.png`) });
  save(id, { id, profile, cells: total, ...job });
  expect(job.status, `${id} finished`).toBe('done');
}

const PROFILES = ['before', 'now', 'small'];
for (const p of PROFILES) {
  test(`style from one slide, picture sizes: ${p}`, async ({ page }) => {
    test.setTimeout(900_000);
    await styleJob(page, `style-one-${p}`, '1503c1de8dded2a7cbe333f061c7131a.jpg', [1], p);
  });
}
for (const p of PROFILES) {
  test(`style from a 12-slide deck, picture sizes: ${p}`, async ({ page }) => {
    test.setTimeout(1_200_000);
    await styleJob(page, `style-deck-${p}`, '44937935e682165c1f93e99a11a47123.jpg', null, p);
  });
}

test('the same references read again: from the cache', async ({ page }) => {
  test.setTimeout(900_000);
  await openStyleFromReferences(page);
  await page.evaluate(() => indexedDB.deleteDatabase('creator-reader-cache'));
  await refInput(page).setInputFiles(path.join(CAROUSELS, '1503c1de8dded2a7cbe333f061c7131a.jpg'));
  const card = page.locator('.rf-upload').first();
  const total = await card.getByRole('checkbox').count();
  for (let i = 2; i <= total; i++) await card.getByRole('checkbox', { name: new RegExp(`^Use slide ${i} of `) }).uncheck();
  for (const n of [1, 2]) {
    await page.getByRole('button', { name: 'Read references' }).click();
    await Promise.race([loopDone(page).catch(() => undefined), page.getByRole('alert').first().waitFor({ timeout: 900_000 }).catch(() => undefined)]);
    const job = await readJob(page);
    save(n === 1 ? 'style-one-cold' : 'style-one-cached', { id: n === 1 ? 'style-one-cold' : 'style-one-cached', profile: 'now', ...job });
  }
});

test('one-shot carousel with the real writer', async ({ page }) => {
  test.setTimeout(900_000);
  const text = fs.readFileSync(path.join(ROOT, 'sample-inputs', 'creator.txt'), 'utf8');
  await page.goto('/images/carousel');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('writer-label')).toContainText(/Claude Code|Claude API/);
  await page.getByLabel('Your text, idea or article').fill(text);
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('progress')).toContainText('Done:', { timeout: 600_000 });
  await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(await page.locator('.cr-card').count(), { timeout: 90_000 });
  const job = await readJob(page);
  await page.screenshot({ path: path.join(OUT, 'one-shot.png') });
  save('one-shot', { id: 'one-shot', profile: 'now', ...job });
  expect(job.status).toBe('done');
});

test('thumbnail making', async ({ page }) => {
  test.setTimeout(300_000);
  await openStyleFromReferences(page);
  const pic = await makeReference(page, { name: 'photo.jpg', kind: 'slide', cell: [1280, 720] });
  await openThumb(page);
  await photoInput(page).setInputFiles(pic);
  await titleInput(page).fill('Ride before sunrise');
  await allDrawn(page, 3);
  const job = await readJob(page);
  save('thumbnail', { id: 'thumbnail', profile: 'now', ...job });
  expect(job.kind).toBe('thumbnail');
});
