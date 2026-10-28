// The Live view (stages, pictures, decisions, cache, cancel), Replay edits and the per-slide "why", in real Chrome with a stand-in reader.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { openResults } from './lab-nav';
import { fakeReader, labelsAnswer, makeReference, openStyleFromReferences, readAnswer, refineAnswer, refInput, REF_OUT, ROOT } from './reference-helpers';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1300, height: 1000 } });
const OUT = path.join(ROOT, 'out/image-engine/live');
test.beforeAll(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  void REF_OUT;
});

const usual = (kind: string, n: number) => {
  if (kind === 'read' || kind === 'retry') return readAnswer({ seen: ['cover'], extra: { shape: { radius: 1000, outline: 4, stroke: 8, hardShadow: 0, badge: 'square', marker: 'box', sticker: 'tag', decor: 'blocks' } } });
  if (n === 0) return refineAnswer({ patches: [{ path: 'type.headline', value: 132 }], score: 60 });
  return refineAnswer({ patches: [{ path: 'type.headline', value: 60 }], score: 20 });
};
const openExample = async (page: import('@playwright/test').Page) => {
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel' })).toBeVisible();
  if (!(await page.locator('details.cr-advanced').evaluate((el) => (el as HTMLDetailsElement).open))) await page.getByText('Advanced: write the script yourself').click();
  await page.getByRole('button', { name: 'Try an example script' }).click();
};
const live = (page: import('@playwright/test').Page) => page.getByRole('complementary', { name: 'Live view' });

test('the Live view opens by itself, shows stages with seconds, the pictures, the rounds, and what the reader decided', async ({ page }) => {
  await fakeReader(page, usual, { delayMs: 2500 });
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'live.jpg', kind: 'slide' }));
  await page.getByLabel('Name the style').fill('Live');
  // Rounds are only made with Advanced on (since the one-screen flow), so the Live view's round pictures are looked at with it on.
  await page.getByRole('checkbox', { name: /^Advanced:/ }).check();
  await page.getByRole('button', { name: 'Read references' }).click();
  // It opened without being asked, and the stages are listed in order.
  await expect(live(page)).toBeVisible();
  const stages = live(page).getByRole('list', { name: 'Stages' }).getByRole('listitem');
  await expect(stages.first()).toContainText('Split collage');
  await expect(stages.nth(1)).toContainText('Measure colours, layout and type');
  // The instant draft is a stage of its own (drawn on your content before the reader answers), and a slow call shows as waiting.
  await expect(stages.nth(2)).toContainText('Instant draft from the measurements');
  await expect(live(page).getByText(/Waiting on the reader/)).toBeVisible();
  await expect(live(page).getByRole('img', { name: /^Reference:/ })).toBeVisible();
  await expect(live(page).getByRole('img', { name: /^Our version/ })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, '1-running.png') });
  // It finishes: every stage has a status, and the finished panel shrinks to a bar.
  const bar = page.getByRole('button', { name: 'Open the Live view' });
  await expect(bar).toBeVisible({ timeout: 120_000 });
  await bar.click();
  await expect(live(page).getByRole('list', { name: 'Stages' }).getByRole('listitem').filter({ hasText: 'running' })).toHaveCount(0);
  await expect(live(page).getByRole('list', { name: 'Stages' }).getByRole('listitem').filter({ hasText: 'Keep the best round' })).toContainText('done');
  // Earlier rounds are small pictures that can be clicked.
  const thumbs = live(page).getByRole('list', { name: 'Earlier pictures' }).getByRole('button');
  expect(await thumbs.count()).toBeGreaterThanOrEqual(2);
  await thumbs.nth(0).click();
  await expect(thumbs.nth(0)).toHaveAttribute('aria-pressed', 'true');
  // What the reader decided, marked by where it came from, and what was moved.
  await expect(live(page).getByText('MEASURED', { exact: true }).first()).toBeVisible();
  await expect(live(page).getByText('READER', { exact: true }).first()).toBeVisible();
  await expect(live(page).getByText(/shape\.radius was 1000, lowered to 120/)).toBeVisible();
  await page.screenshot({ path: path.join(OUT, '2-finished.png') });
  // Saved so it can be reopened: the browser keeps the stage times and the rounds, never a reference picture.
  const saved = await page.evaluate(async () => {
    const w = window as unknown as { __liveJobs: { saved: () => Promise<{ kind: string; stages: { seconds?: number }[]; references: { url: string }[]; rounds: unknown[] }[]> } };
    return w.__liveJobs.saved();
  });
  expect(saved[0].kind).toBe('style-from-references');
  expect(saved[0].rounds.length).toBeGreaterThanOrEqual(2);
  expect(saved[0].references.every((r) => r.url === '')).toBe(true);
  expect(saved[0].stages.filter((s) => s.seconds !== undefined).length).toBeGreaterThanOrEqual(5);
});

test('the same references read again come from the cache, and Clear cache empties it', async ({ page }) => {
  const rec = await fakeReader(page, (kind, n, prompt) => (kind === 'refine' ? usual(kind, n) : labelsAnswer(prompt)));
  await openStyleFromReferences(page);
  const ref = await makeReference(page, { name: 'cache.jpg', kind: 'slide' });
  await refInput(page).setInputFiles(ref);
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(page.getByRole('button', { name: 'Open the Live view' })).toBeVisible({ timeout: 120_000 });
  const firstReads = rec.reads.length;
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(page.getByText(/from cache/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Open the Live view' })).toBeVisible({ timeout: 120_000 });
  expect(rec.reads.length, 'the second read did not call the reader').toBe(firstReads);
  const clear = page.getByRole('button', { name: /^Clear cache/ });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect(clear).toBeDisabled();
});

test('Cancel stops the job cleanly: nothing keeps running and the stages say so', async ({ page }) => {
  await fakeReader(page, (kind, n, prompt) => (kind === 'refine' ? usual(kind, n) : labelsAnswer(prompt)), { delayMs: 8000 });
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'cancel.jpg', kind: 'slide' }));
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(live(page)).toBeVisible();
  await live(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Open the Live view' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Open the Live view' }).click();
  await expect(live(page)).toContainText('cancelled');
  await expect(live(page).getByRole('listitem').filter({ hasText: 'running' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Read references' })).toBeEnabled();
});

test('Replay edits rebuilds a slide layer by layer with the patch system: step forward, step back, play', async ({ page }) => {
  await openExample(page);
  const card = page.getByRole('listitem', { name: /^Slide 1 of/ });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByRole('button', { name: 'Replay edits' }).click();
  const dlg = page.getByRole('dialog', { name: /^Replay edits/ });
  await expect(dlg).toContainText('Edit 0 of');
  await dlg.getByRole('button', { name: 'Step forward' }).click();
  await expect(dlg).toContainText(/Edit 1 of/);
  await dlg.getByRole('button', { name: 'Step forward' }).click();
  await expect(dlg).toContainText(/Edit 2 of/);
  await dlg.getByRole('button', { name: 'Step back' }).click();
  await expect(dlg).toContainText(/Edit 1 of/);
  await expect(dlg.getByRole('img')).toBeVisible();
  await dlg.getByLabel('Speed').selectOption('8');
  await dlg.getByRole('button', { name: 'Play' }).click();
  await expect(dlg.getByRole('button', { name: 'Play again' })).toBeVisible({ timeout: 90_000 });
  const m = /Edit (\d+) of (\d+)/.exec(await dlg.innerText())!;
  expect(m[1]).toBe(m[2]);
  await page.screenshot({ path: path.join(OUT, '3-replay.png') });
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(dlg).toHaveCount(0);
});

test('"Why this slide" says the style, the layout and why, the checks, and what the safety net changed', async ({ page }) => {
  await openExample(page);
  const card = page.getByRole('listitem', { name: /^Slide 1 of/ });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await card.getByRole('button', { name: 'Why this slide' }).click();
  const pop = card.getByRole('dialog');
  await expect(pop).toContainText('Style:');
  await expect(pop).toContainText('Layout:');
  await expect(pop).toContainText('Why this layout:');
  await expect(pop).toContainText(/Checks: \d+ passed/);
  await expect(pop).toContainText('What the safety net changed');
});

test('Results shows the latest run: the stage times, their share, and the rounds, as saved by the Live view', async ({ page }) => {
  await fakeReader(page, usual);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'latest.jpg', kind: 'slide' }));
  await page.getByRole('checkbox', { name: /^Advanced:/ }).check();
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(page.getByRole('button', { name: 'Open the Live view' })).toBeVisible({ timeout: 120_000 });
  await openResults(page, 'Style from references');
  const latest = page.getByRole('region', { name: 'Latest run' });
  await expect(latest).toBeVisible();
  await expect(latest.getByRole('article').first()).toContainText('Style from references');
  await expect(latest.getByRole('row', { name: /Ask the reader/ })).toContainText('%');
  expect(await latest.getByRole('list', { name: 'Rounds of this run' }).first().getByRole('listitem').count()).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: path.join(OUT, '4-results-latest.png'), fullPage: true });
});
