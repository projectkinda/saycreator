// Step 3. Every sample script in every theme: draws seven slides, checks each at phone size, writes PNGs and sheets.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/step3');
const DIR = path.join(ROOT, 'tests/image-engine/carousels');
const SCRIPTS = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const THEMES = ['paper', 'midnight', 'pop'];

interface Lint {
  id: string;
  label: string;
  pass: boolean;
  reason: string;
  measured?: number;
  limit?: number;
}
interface RunSlide {
  id: string;
  type: string;
  notes: string[];
  plan: unknown;
  lint: Lint[];
  warnings: unknown[];
  png: string;
  phone: string;
}
const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const save = (rel: string, b64: string) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), Buffer.from(b64, 'base64'));
};

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

test('every script in every theme: seven slides drawn and checked, outputs written', async ({ page }) => {
  test.setTimeout(300_000);
  const summary: unknown[] = [];
  for (const script of SCRIPTS) {
    const rows: { label: string; lines: string[]; slides: { b64: string; pass: boolean }[] }[] = [];
    for (const theme of THEMES) {
      const run = await call<{ ms: number; slides: RunSlide[] }>(page, 'carouselRun', script, theme);
      expect(run.slides).toHaveLength(7);
      const dir = `${script.id}/${theme}`;
      run.slides.forEach((s, i) => {
        save(`${dir}/slide-${i + 1}.png`, s.png);
        save(`${dir}/slide-${i + 1}-phone.png`, s.phone);
        fs.writeFileSync(
          path.join(OUT, `${dir}/slide-${i + 1}.lint.json`),
          JSON.stringify({ script: script.id, scriptTitle: script.title, theme, index: i + 1, type: s.type, notes: s.notes, lint: s.lint, warnings: s.warnings, pass: s.lint.every((l) => l.pass) }, null, 2),
        );
        fs.writeFileSync(path.join(OUT, `${dir}/slide-${i + 1}.plan.json`), JSON.stringify(s.plan, null, 2));
      });
      const failed = run.slides.flatMap((s, i) => s.lint.filter((l) => !l.pass).map((l) => `slide ${i + 1} (${s.type}) ${l.id}: ${l.reason}`));
      summary.push({ script: script.id, theme, ms: run.ms, passed: run.slides.filter((s) => s.lint.every((l) => l.pass)).length, failed });
      rows.push({
        label: `${script.title}  |  theme: ${theme}`,
        lines: [failed.length ? `${failed.length} failed checks` : 'all checks pass'],
        slides: run.slides.map((s) => ({ b64: s.png, pass: s.lint.every((l) => l.pass) })),
      });
    }
    save(`${script.id}/sheet-all-themes.png`, await call<string>(page, 'makeCarouselSheet', rows));
  }
  fs.writeFileSync(path.join(OUT, 'step3-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 1));
});
