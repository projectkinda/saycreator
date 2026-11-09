// Three ready-made scripts (creator, small business, agency) for trying the paste flow without a Claude chat.
// They were written by hand, not by the prompt in the app, so they do not show how well a real chat answer works.
// Each must pass the app's own checker, load, and draw in every style. Phone-check failures are reported, not hidden.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEdit, toStep } from './ui';
import { validateScriptText } from '../../src/carousel/script';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'sample-scripts');
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
test.use({ viewport: { width: 1280, height: 900 } });

test('the sample scripts pass the app checker with no problems', () => {
  expect(FILES).toHaveLength(3);
  for (const f of FILES) {
    const r = validateScriptText(fs.readFileSync(path.join(DIR, f), 'utf8'), 'carousel');
    expect(r.errors.map((e) => e.message), f).toEqual([]);
    expect(r.warnings.map((e) => e.message), f).toEqual([]);
  }
});

test('each sample script loads in the app and draws in every style; phone-check failures are written down', async ({ page }) => {
  test.setTimeout(300_000);
  const report: { script: string; style: string; failing: { slide: number; reasons: string[] }[] }[] = [];
  for (const f of FILES) {
    await page.goto('/images/carousel');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('creator.groups', 'all'); });
    await page.reload();
    await page.getByRole('button', { name: 'I already have a script' }).click();
    await page.getByLabel('Paste the script Claude wrote (JSON)').fill(fs.readFileSync(path.join(DIR, f), 'utf8'));
    await page.getByRole('button', { name: 'Use this script' }).click();
    await toStep(page, 3);
    const real = page.getByRole('list', { name: 'Styles' }).getByRole('listitem').filter({ hasNotText: 'Pick for me' }).getByRole('button');
    await expect(page.getByRole('list', { name: 'Styles' }).getByText('Drawing…')).toHaveCount(0, { timeout: 60_000 });
    const names = await real.evaluateAll((els) => els.map((e) => e.querySelector('span.small')?.textContent ?? ''));
    expect(names.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < names.length; i++) {
      await real.nth(i).click();
      await expect(page.locator('.cr-film li')).toHaveCount(7);
      // The phone check is on the slide card, which is in the Edit slides view: look at the slides one by one.
      const failing: { slide: number; reasons: string[] }[] = [];
      for (let n = 1; n <= 7; n++) {
        await openEdit(page, n);
        await expect(page.locator('.cr-card').getByText('Drawing…')).toHaveCount(0, { timeout: 60_000 });
        await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(1, { timeout: 30_000 });
        await page.waitForTimeout(600);
        const li = await page.locator('.cr-card .cr-lint-fail li').evaluateAll((els) => els.map((x) => x.textContent ?? ''));
        if (li.length) failing.push({ slide: n, reasons: li });
      }
      await toStep(page, 3);
      report.push({ script: f, style: names[i], failing });
    }
  }
  fs.mkdirSync(path.join(ROOT, 'out/image-engine/app-flow'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'out/image-engine/app-flow/sample-scripts.json'), JSON.stringify(report, null, 2));
  expect(report.filter((r) => r.failing.length > 0).map((r) => `${r.script} in ${r.style}: slides ${r.failing.map((f) => f.slide).join(', ')}`)).toEqual([]);
  console.log(JSON.stringify(report.map((r) => ({ s: r.script, st: r.style, failing: r.failing.map((x) => x.slide) }))));
});
