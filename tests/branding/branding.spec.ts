import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/branding');
  await page.evaluate(() => localStorage.removeItem('creator.brand-workspaces.v1'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Branding' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Brand kits' }).getByRole('button', { name: /Maya Rao/ })).toBeVisible();
});

test('creates and switches independent brand kits with visible ownership', async ({ page }) => {
  await page.getByRole('button', { name: '+ New brand kit' }).click();
  await expect(page.getByText('2 brand kits')).toBeVisible();
  await expect(page.getByText('Every section below belongs to').locator('..')).toContainText('Brand 2');
  await page.getByLabel('Brand name', { exact: true }).fill('Second Studio');
  await page.getByLabel('Website name').fill('Second Studio Web');
  await page.getByLabel('Website URL').fill('https://second.example');
  await expect(page.getByText('Editing brand kit').locator('..')).toContainText('Second Studio Web');
  await page.reload();
  await page.getByRole('button', { name: /Second Studio/ }).click();
  await expect(page.getByLabel('Website name')).toHaveValue('Second Studio Web');
});

test('stores competitor website links for the selected brand', async ({ page }) => {
  await page.getByRole('tab', { name: 'Competitors' }).click();
  await page.getByLabel('Competitor name').fill('Rival Co');
  await page.getByLabel('Website URL').fill('https://rival.example');
  await page.getByLabel('Why they matter').fill('Overlapping audience');
  await page.getByRole('button', { name: 'Add competitor' }).click();
  await expect(page.getByRole('link', { name: 'https://rival.example' })).toHaveAttribute('href', 'https://rival.example');
  await expect(page.getByText('Overlapping audience')).toBeVisible();
});

test('picks country and niche and stores a rules document locally', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Country' }).fill('Ind');
  await page.getByRole('option', { name: 'India' }).click();
  await page.getByRole('combobox', { name: 'Niche' }).fill('Marketing');
  await page.getByRole('option', { name: 'Marketing / creative / PR agencies' }).click();
  await page.getByLabel('Upload rules document').setInputFiles({ name: 'brand-rules.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF rules') });
  await expect(page.getByText('brand-rules.pdf')).toBeVisible();
  await expect(page.getByText('stored on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('India');
  await expect(page.getByRole('combobox', { name: 'Niche' })).toHaveValue('Marketing / creative / PR agencies');
  await expect(page.getByText('brand-rules.pdf')).toBeVisible();
});

test('keeps visual kits separate when switching brands', async ({ page }) => {
  await page.getByRole('button', { name: '+ New brand kit' }).click();
  await page.getByRole('tab', { name: 'Brand kit' }).click();
  await expect(page.getByText('@newbrand').first()).toBeVisible();
  await page.getByRole('region', { name: 'Brand kits' }).getByRole('button', { name: /Maya Rao/ }).click();
  await expect(page.getByText('@mayarao').first()).toBeVisible();
  await expect(page.getByText('@newbrand')).toHaveCount(0);
});
