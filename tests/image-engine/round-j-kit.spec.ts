// Round J part 3: one colour list on the Branding page. The old four-role kit colours (in memory) come into the brand list once (main = primary, second = highlight), never over colours the person
// set and never invented for a made-up default kit; the kit reads and writes its primary and highlight through the list.
import { expect, test } from '@playwright/test';

test.setTimeout(3 * 60_000);
const WS = 'creator.brand-workspaces.v1';
const MARK = 'creator.brand-kit-colours.migrated.v1';
const stored = (page: any) => page.evaluate((k: string) => JSON.parse(localStorage.getItem(k) || '[]') as any[], WS);

test('J3: the account brand\'s kit colours move into the brand list once, the page has ONE colour editor, and a reload changes nothing', async ({ page }) => {
  await page.goto('/branding');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/branding?tab=kit');
  await expect(page.getByRole('region', { name: 'Brand kits' }).getByRole('button', { name: /Maya Rao/ })).toBeVisible();
  await expect.poll(async () => (await stored(page)).find((w) => w.id === 'b1')?.colours).toEqual(['#0f7b78', '#e8a33d']);
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), MARK)) ?? '[]')).toContain('b1');
  // one place to edit colours: the Brand colours card; the old Colors card only shows them
  await expect(page.getByTestId('bc-hex-0')).toHaveValue('#0f7b78');
  await expect(page.getByTestId('bc-hex-1')).toHaveValue('#e8a33d');
  await expect(page.getByRole('button', { name: 'Edit colors' })).toHaveCount(0);
  await expect(page.getByTestId('kit-colours')).toContainText('#0F7B78');
  await expect(page.getByTestId('kit-colours')).toContainText('#E8A33D');
  // the person changes the colours: a reload (the migration runs again) does not bring the kit's colours back
  await page.getByTestId('bc-hex-0').fill('#2557d6');
  await page.getByTestId('bc-hex-0').blur();
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByTestId('bc-hex-0')).toHaveValue('#2557d6');
  expect((await stored(page)).find((w) => w.id === 'b1').colours).toEqual(['#2557d6', '#e8a33d']);
  // the kit card reads the list
  await expect(page.getByTestId('kit-colours')).toContainText('#2557D6');
  // a new brand kit gets no invented colours (its kit is only a made-up default)
  await page.getByRole('button', { name: '+ New brand kit' }).click();
  await page.waitForTimeout(400);
  await page.reload();
  const fresh = (await stored(page)).find((w) => w.name === 'Brand 2');
  expect(fresh, 'the new brand is stored').toBeTruthy();
  expect(fresh.colours, 'and has no colours').toBeUndefined();
});

test('J3: the migration is idempotent and never overwrites; the old kit reads and writes its primary and highlight through the list', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    localStorage.clear();
    const W: any = await import('/src/pages/branding/workspace.ts');
    const E: any = await import('/src/engine/index.ts');
    const list = [W.initialWorkspace('b1', 'Maya Rao'), { ...W.initialWorkspace('brand-x', 'Own colours'), colours: ['#111111'] }, W.initialWorkspace('brand-y', 'Made-up kit')];
    const kit = (id: string) => (id === 'b1' || id === 'brand-x' ? { primary: '#0F7B78', highlight: '#E8A33D' } : null);
    const once = W.migrateKitColours(list, kit);
    const twice = W.migrateKitColours(once, kit);
    const same = W.migrateKitColours(list.map((w: any) => ({ ...w })), kit); // the marker remembers b1: an empty b1 is not filled again
    // legacy tools: the kit reads the list
    W.writeWorkspaces([{ ...W.initialWorkspace('b1', 'Maya Rao'), colours: ['#2557d6', '#c6f432', '#ff6b5b'] }]);
    const k1 = await E.getBrandKit('b1');
    // and writes into it (the extra colour is kept)
    await E.updateBrandKit('b1', { colors: { highlight: '#112233' } });
    const after = W.readWorkspaces()[0].colours;
    const k2 = await E.getBrandKit('b1');
    return { once: once.map((w: any) => w.colours ?? null), twiceSame: twice === once, refill: same[0].colours ?? null, k1: k1.colors, after, k2: k2.colors, stored: E.storedKitColours('brand-y') };
  });
  expect(r.once).toEqual([['#0f7b78', '#e8a33d'], ['#111111'], null]);
  expect(r.twiceSame, 'running it again returns the same list').toBe(true);
  expect(r.refill, 'a brand already done is not filled again').toBeNull();
  expect(r.k1).toMatchObject({ primary: '#2557D6', highlight: '#C6F432' });
  expect(r.after).toEqual(['#2557d6', '#112233', '#ff6b5b']);
  expect(r.k2).toMatchObject({ primary: '#2557D6', highlight: '#112233' });
  expect(r.stored, 'a made-up default kit has no colours to bring in').toBeNull();
});
