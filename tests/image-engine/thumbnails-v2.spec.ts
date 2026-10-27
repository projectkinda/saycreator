// Step 13: thumbnails, version 2. The engine composes options in every stored style, draws each one and runs twelve checks on a phone-size copy.
// Photos come from test-images/ (the person's own test photos, not shippable; plain pictures, not video frames).
// Everything written to out/image-engine/thumbs-v2/ is shown on the Results screen.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LintResult, Plan } from '../../src/image-engine/types';
import { validatePlan } from '../../src/image-engine/validate';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
export const OUT = path.join(ROOT, 'out/image-engine/thumbs-v2');
const IMAGES = path.join(ROOT, 'test-images');

export const NEW_CHECKS = ['subject', 'focal', 'overlap'];
export const ALL_CHECKS = ['words', 'readable', 'contrast', 'overlay', 'margins', 'resolution', 'crop', 'brightness', 'sharpness', ...NEW_CHECKS];
export const STYLES = ['hot-flat', 'mono-poster', 'object-neon', 'glass-gradient', 'film-paper', 'editorial-collage'];

/** The test photos and the title for each, with the subject pointer where a person would put it (a share of the photo). */
export interface Case { file: string; title: string; emphasis?: string; subject?: { x: number; y: number }; aspects: ('16:9' | '9:16')[] }
export const CASES: Case[] = [
  { file: 'GCKR3575.JPG', title: 'Ride Before Sunrise', aspects: ['16:9', '9:16'] },
  { file: 'wp13065863-mahesh-babu-guntur-kaaram-wallpapers.jpg', title: '5 Rules For Dust', aspects: ['16:9', '9:16'] },
  { file: 'GHWd3WIW0AICE11.jpg', title: 'The Quiet Genius', aspects: ['16:9'] },
  { file: 'filters_quality(95)format(webp) (1).jpg', title: 'Two Sides Of Him', aspects: ['16:9'] },
  { file: 'wp13337965-guntur-kaaram-wallpapers.jpg', title: 'Calm Before Storm', aspects: ['16:9'] },
];

export const url = (file: string) => '/test-images/' + encodeURIComponent(file);
export const slug = (s: string) => s.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
export const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
export const save = (rel: string, dataUrl: string) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), Buffer.from(dataUrl.replace(/^data:[^,]+,/, ''), 'base64'));
};

interface RunOption { id: string; layout: string; plan: Plan; option: unknown; notes: string[]; subjects: { x: number; y: number; r: number; of: string }[]; elementsUsed: string[]; lint: LintResult[]; ms: number; png: string; phone: string }
interface Run { subject: { x: number; y: number; guessed?: boolean }; composeMs: number; options: RunOption[] }
const run = (page: Page, args: Record<string, unknown>) => call<Run>(page, 'thumbV2Run', args);

const summary: Record<string, unknown>[] = [];
const present = CASES.filter((c) => fs.existsSync(path.join(IMAGES, c.file)));

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  expect(present.length, 'no test photos found in test-images/').toBeGreaterThan(0);
  fs.rmSync(OUT, { recursive: true, force: true });
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
