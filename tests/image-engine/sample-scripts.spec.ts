// Three ready-made scripts (creator, small business, agency) for trying the paste flow without a Claude chat.
// They were written by hand, not by the prompt in the app, so they do not show how well a real chat answer works.
// Each must pass the app's own checker, load, and draw in every style. Phone-check failures are reported, not hidden.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText('Advanced: write the script yourself').click();
    await page.getByLabel('Paste the script Claude wrote (JSON)').fill(fs.readFileSync(path.join(DIR, f), 'utf8'));
    await page.getByRole('button', { name: 'Use this script' }).click();
    const real = page.getByRole('list', { name: 'Styles' }).getByRole('listitem').filter({ hasNotText: 'Pick for me' }).getByRole('button');
    const names = await real.evaluateAll((els) => els.map((e) => e.querySelector('span.small')?.textContent ?? ''));
    expect(names.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < names.length; i++) {
      await real.nth(i).click();
      await expect(page.locator('.cr-card')).toHaveCount(7);
      await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(7, { timeout: 30_000 });
      await page.waitForTimeout(300);
      const failing = await page.locator('.cr-card').evaluateAll((cards) =>
        cards.flatMap((c, n) => {
          const li = [...c.querySelectorAll('.cr-lint-fail li')].map((x) => x.textContent ?? '');
          return li.length ? [{ slide: n + 1, reasons: li }] : [];
        }),
      );
      report.push({ script: f, style: names[i], failing });
    }
  }
  fs.mkdirSync(path.join(ROOT, 'out/image-engine/app-flow'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'out/image-engine/app-flow/sample-scripts.json'), JSON.stringify(report, null, 2));
  expect(report.filter((r) => r.failing.length > 0).map((r) => `${r.script} in ${r.style}: slides ${r.failing.map((f) => f.slide).join(', ')}`)).toEqual([]);
  console.log(JSON.stringify(report.map((r) => ({ s: r.script, st: r.style, failing: r.failing.map((x) => x.slide) }))));
});
