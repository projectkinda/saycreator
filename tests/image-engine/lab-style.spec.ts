// The "Style reading" section of the Results screen: clusters, swatches, missing tools, moving a picture, verdicts.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { goView, openResults } from './lab-nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/results-screen');
const CLUSTERS = path.join(ROOT, 'Reference carousels likes/clusters.json');

/** Reads clusters.json, trying again if it is caught while being replaced. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readClusters = (): any => {
  for (let i = 0; i < 30; i++) {
    try {
      return JSON.parse(fs.readFileSync(CLUSTERS, "utf8"));
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  throw new Error('clusters.json could not be read');
};

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1500, height: 1000 } });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const open = async (page: Page) => {
  await openResults(page, 'Checks and tests', { details: true });
  await expect(page.locator('#style-reading')).toBeVisible();
  await expect(page.locator('#style-reading article[aria-label^="Cluster"]').first()).toBeVisible();
};

test('Style reading shows every cluster with its pictures, swatches, summary, measurements and missing tools', async ({ page }) => {
  await open(page);
  const s = page.locator('#style-reading');
  const saved = readClusters();
  await expect(s.locator('article[aria-label^="Cluster"]')).toHaveCount(saved.clusters.length);
  await expect(s.getByText(/Last run /)).toBeVisible();
  await expect(s.getByRole('button', { name: /^Refresh/ })).toBeVisible();
  for (const c of saved.clusters) {
    const a = s.locator(`article[aria-label="Cluster ${c.name}"]`);
    await expect(a.locator('.res-mosaic')).toHaveCount(c.images.length);
    await expect(a.locator('.res-summary')).toContainText(c.summary.slice(0, 40));
    expect(await a.locator('.res-swatch-box').count()).toBeGreaterThanOrEqual(5);
    await expect(a.getByRole('heading', { name: 'Missing tools' })).toBeVisible();
    expect(await a.locator('.res-missing li').count()).toBe(c.spec.missingTools.length);
    await expect(a.locator('.res-table')).toContainText('Text contrast');
    await expect(a.getByRole('button', { name: 'right', exact: true })).toBeVisible();
    await expect(a.getByRole('button', { name: 'partly right' })).toBeVisible();
    await expect(a.getByRole('button', { name: 'wrong' })).toBeVisible();
  }
  // Every claim in the draft spec is labelled MEASURED or GUESS.
  await s.locator('details summary').first().click();
  const chips = await s.locator('.res-tagged .chip').allTextContents();
  expect(chips.length).toBeGreaterThan(8);
  for (const t of chips) expect(['MEASURED', 'GUESS']).toContain(t);
  await expect(s.locator('article[aria-label="Unplaced pictures"] .res-mosaic')).toHaveCount(saved.unplaced.length);
  await s.locator('article').first().screenshot({ path: path.join(OUT, '05-style-cluster.png') });
});

test('a picture can be moved to another cluster, is saved to clusters.json, and moves back', async ({ page }) => {
  const original = fs.readFileSync(CLUSTERS, 'utf8');
  try {
    await open(page);
    const before = JSON.parse(original);
    const file = before.clusters[0].images[0];
    const target = before.clusters[1];
    const card = page.locator('#style-reading .res-mosaic').filter({ has: page.getByLabel(`Move ${file} to another cluster`) });
    await card.getByLabel(`Move ${file} to another cluster`).selectOption(target.id);
    await expect.poll(() => readClusters().clusters[1].images).toContain(file);
    const after = readClusters();
    expect(after.clusters[0].images).not.toContain(file);
    expect(after.clusters[0].summary).toBe(before.clusters[0].summary); // my text is untouched
    await expect(page.locator(`#style-reading article[aria-label="Cluster ${target.name}"] .res-mosaic`)).toHaveCount(target.images.length + 1);
    // Unplaced works too, and keeps every picture exactly once.
    await page.getByLabel(`Move ${file} to another cluster`).selectOption('unplaced');
    await expect.poll(() => readClusters().unplaced.map((u: { file: string }) => u.file)).toContain(file);
    const all = (() => {
      const c = readClusters();
      return [...c.clusters.flatMap((x: { images: string[] }) => x.images), ...c.unplaced.map((u: { file: string }) => u.file)];
    })();
    expect(new Set(all).size).toBe(all.length);
  } finally {
    fs.writeFileSync(CLUSTERS, original);
  }
});

test('a verdict on a cluster is saved, survives a reload and is exported with the placement', async ({ page }) => {
  await open(page);
  const a = page.locator('#style-reading article[aria-label^="Cluster"]').first();
  await a.getByRole('button', { name: 'partly right' }).click();
  await a.getByPlaceholder('why? (one line)').fill('yellow deck is the odd one out');
  await page.reload();
  await goView(page, 'Checks and tests', { details: true });
  const b = page.locator('#style-reading article[aria-label^="Cluster"]').first();
  await expect(b.getByPlaceholder('why? (one line)')).toHaveValue('yellow deck is the odd one out');
  await expect(b.getByRole('button', { name: 'partly right' })).toHaveAttribute('aria-pressed', 'true');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export verdicts JSON' }).click();
  const saved = path.join(OUT, 'export-style.json');
  await (await download).saveAs(saved);
  const data = JSON.parse(fs.readFileSync(saved, 'utf8'));
  const v = data.verdicts.find((x: { kind: string }) => x.kind === 'style-cluster');
  expect(v).toMatchObject({ verdict: 'partly', reason: 'yellow deck is the odd one out', step: 'style-reading' });
  expect(data.styleReading.clusters.length).toBeGreaterThan(0);
  expect(data.styleReading.unplaced.length).toBe(1);
});

test('verdicts have a copy on disk: newest wins per item, and nothing is lost by a second save', async ({ request }) => {
  const file = path.join(ROOT, 'out/image-engine/verdicts.json');
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  try {
    const rec = (verdict: string, at: string) => ({ key: 'test|a', step: 'test', kind: 'x', image: 'a', option: 'a', verdict, reason: '', updatedAt: at });
    await request.post('/__lab/verdicts', { data: { clear: true } });
    await request.post('/__lab/verdicts', { data: { records: { 'test|a': rec('good', '2026-01-02T00:00:00Z'), 'test|b': { ...rec('bad', '2026-01-01T00:00:00Z'), key: 'test|b' } } } });
    await request.post('/__lab/verdicts', { data: { records: { 'test|a': rec('bad', '2026-01-01T00:00:00Z') } } }); // older: must not win
    const got = await (await request.get('/__lab/verdicts')).json();
    expect(got.records['test|a'].verdict).toBe('good');
    expect(Object.keys(got.records).sort()).toEqual(['test|a', 'test|b']);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).records['test|b'].verdict).toBe('bad');
  } finally {
    if (before === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, before);
  }
});
