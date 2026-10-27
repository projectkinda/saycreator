// Step 13: thumbnails, version 2. The engine composes options in every stored style, draws each one and runs twelve checks on a phone-size copy.
// Photos come from test-images/ (the person's own test photos, not shippable; plain pictures, not video frames).
// Everything written to out/image-engine/thumbs-v2/ is shown on the Results screen.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { validatePlan } from '../../src/image-engine/validate';
import { ALL_CHECKS, OUT, STYLES, presentCases, run, save, slug, url } from './thumbnails-v2-helpers';

const summary: Record<string, unknown>[] = [];
const present = presentCases();

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  expect(present.length, 'no test photos found in test-images/').toBeGreaterThan(0);
  // Only what this spec writes is cleared: the bad variants and the pointer pictures belong to the checks spec.
  for (const s of STYLES) fs.rmSync(path.join(OUT, s), { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
});
test.afterAll(() => {
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
});
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

for (const style of STYLES) {
  test(`${style}: every test photo gets at least 3 options, each is a valid plan with its twelve checks`, async ({ page }) => {
    test.setTimeout(240_000);
    for (const c of present) {
      for (const aspect of c.aspects) {
        const r = await run(page, { style, photoUrl: url(c.file), title: c.title, emphasis: c.emphasis, subject: c.subject, aspect });
        expect(r.options.length, `${style} ${c.file} ${aspect}`).toBeGreaterThanOrEqual(3);
        for (const o of r.options) {
          const errors = validatePlan(o.plan);
          expect(errors, `${o.id}`).toEqual([]);
          expect(o.lint.map((l) => l.id), `${o.id} checks`).toEqual(expect.arrayContaining(ALL_CHECKS));
          const rel = `${style}/${slug(c.file)}-${aspect.replace(':', 'x')}-${o.layout}`;
          save(`${rel}.png`, o.png);
          save(`${rel}-phone.png`, o.phone);
          fs.writeFileSync(path.join(OUT, `${rel}.json`), JSON.stringify({ plan: o.plan, lint: o.lint, notes: o.notes, subjects: o.subjects, elementsUsed: o.elementsUsed }, null, 2));
          summary.push({ style, image: c.file, title: c.title, aspect, layout: o.layout, id: o.id, rel, composeMs: r.composeMs, checkMs: Math.round(o.ms), subject: r.subject, lint: Object.fromEntries(o.lint.map((l) => [l.id, l.pass])), reasons: Object.fromEntries(o.lint.filter((l) => !l.pass).map((l) => [l.id, l.reason])), notes: o.notes, elementsUsed: o.elementsUsed });
        }
      }
    }
  });
}
