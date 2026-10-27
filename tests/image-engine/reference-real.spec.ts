// The REAL dev reader (Claude Code on this computer) on the person's own references, through the real screen. Off unless REAL_REFERENCE=1:
// each run takes minutes and uses model time. It writes what it finds under out/image-engine/reference-real/ for the Results screen.
// The references are never copied into the app or the repository: they are read from "Reference carousels likes/" and "Reference thumbnails/".
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loopDone, openStyleFromReferences, refInput } from './reference-helpers';

export const REAL_OUT = path.join(ROOT, 'out/image-engine/reference-real');
const CAROUSELS = path.join(ROOT, 'Reference carousels likes');
const THUMBNAILS = path.join(ROOT, 'Reference thumbnails');

interface RealRun {
  id: string;
  label: string;
  /** Files, relative to the reference folder. */
  files: string[];
  target: 'Carousels' | 'Thumbnails' | 'Both';
  /** For a collage: keep only these slides (counted from 1). */
  keep?: number[];
  dir: string;
}

const RUNS: RealRun[] = [
  { id: 'deck-a', label: 'A carousel deck (6 of 12 slides)', files: ['44937935e682165c1f93e99a11a47123.jpg'], target: 'Carousels', keep: [1, 2, 3, 5, 8, 11], dir: CAROUSELS },
  { id: 'deck-b', label: 'Another carousel deck (6 of 9 slides)', files: ['58d68b12ac74ce8cc0f8d2f9df45e6de.jpg'], target: 'Carousels', keep: [1, 2, 4, 5, 7, 9], dir: CAROUSELS },
  { id: 'single', label: 'One image on its own (one slide)', files: ['1503c1de8dded2a7cbe333f061c7131a.jpg'], target: 'Carousels', keep: [1], dir: CAROUSELS },
];
const only = process.env.REAL_ONLY;

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1400, height: 1000 } });
test.skip(process.env.REAL_REFERENCE !== '1', 'The real reader is opt-in (REAL_REFERENCE=1): each run takes minutes and uses model time.');
test.beforeAll(() => fs.mkdirSync(REAL_OUT, { recursive: true }));

async function pictureOf(page: Page, selector: string): Promise<string> {
  return page.evaluate(async (sel) => {
    const img = document.querySelector(sel) as HTMLImageElement | null;
    if (!img) return '';
    const blob = await (await fetch(img.src)).blob();
    return await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(',')[1]);
      r.readAsDataURL(blob);
    });
  }, selector);
}

for (const run of RUNS.filter((r) => !only || r.id === only)) {
  test(`real reader: ${run.label}`, async ({ page }) => {
    test.setTimeout(1_500_000);
    const files = run.files.map((f) => path.join(run.dir, f)).filter((f) => fs.existsSync(f));
    test.skip(files.length === 0, `No reference files for ${run.id}.`);
    let calls = 0;
    page.on('request', (r) => r.url().includes('/__reference/read') && calls++);
    await openStyleFromReferences(page);
    await expect(page.getByText('Reader: Claude Code on this computer')).toBeVisible({ timeout: 30_000 });
    await refInput(page).setInputFiles(files);
    const card = page.locator('.rf-upload').first();
    await expect(card).toBeVisible();
    const modeBefore = await card.getAttribute('data-mode');
    const total = await card.getByRole('checkbox').count();
    if (run.keep) for (let i = 1; i <= total; i++) if (!run.keep.includes(i)) await card.getByRole('checkbox', { name: new RegExp(`^Use slide ${i} of `) }).uncheck();
    await page.getByLabel('Name the style').fill(run.label.slice(0, 30));
    await page.getByRole('radio', { name: run.target, exact: true }).click();
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Read references' }).click();
    await Promise.race([loopDone(page).catch(() => undefined), page.getByRole('alert').first().waitFor({ timeout: 1_400_000 }).catch(() => undefined)]);
    const seconds = Math.round((Date.now() - t0) / 1000);
    const dir = path.join(REAL_OUT, run.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const alert = (await page.getByRole('alert').allInnerTexts()).filter((t) => !/would not save/.test(t));
    const result: Record<string, unknown> = { id: run.id, label: run.label, files: run.files, target: run.target, detectedMode: modeBefore, cells: total, seconds, alert, readerCalls: calls };
    if (alert.length === 0) {
      const rounds = page.getByRole('list', { name: 'Rounds' }).getByRole('listitem');
      const n = await rounds.count();
      const out: unknown[] = [];
      for (let i = 0; i < n; i++) {
        const r = rounds.nth(i);
        const header = (await r.locator('.rf-round-head').innerText()).replace(/\s+/g, ' ');
        const made = (await r.locator('p.muted').allInnerTexts()).join(' ');
        const pc = await r.locator('.rf-pair').count();
        const names: string[] = [];
        for (let k = 0; k < Math.min(pc, 3); k++) {
          const base = `ol[aria-label="Rounds"] > li:nth-child(${i + 1}) .rf-pair:nth-child(${k + 1})`;
          const a = await pictureOf(page, `${base} .rf-pair-imgs img:nth-child(1)`);
          const b = await pictureOf(page, `${base} .rf-pair-imgs img:nth-child(2)`);
          if (!a || !b) continue;
          fs.writeFileSync(path.join(dir, `round${i}-ref${k + 1}.png`), Buffer.from(a, 'base64'));
          fs.writeFileSync(path.join(dir, `round${i}-ours${k + 1}.png`), Buffer.from(b, 'base64'));
          names.push(`round${i}-ref${k + 1}.png`, `round${i}-ours${k + 1}.png`);
        }
        out.push({ header, made, files: names });
      }
      result.rounds = out;
      const panel = page.locator('section[aria-labelledby="rf-close-h"]');
      result.closeness = (await panel.innerText()).replace(/\n{2,}/g, '\n');
      result.missing = await panel.getByRole('list', { name: 'Missing tools' }).getByRole('listitem').allInnerTexts();
      result.measured = (await page.locator('section[aria-labelledby="rf-measured-h"]').innerText()).slice(0, 2500);
      result.notes = await page.locator('section[aria-labelledby="rf-rounds-h"] p').allInnerTexts();
      await page.screenshot({ path: path.join(dir, 'screen.png'), fullPage: true });
    }
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
    expect(alert, `the reader should have answered: ${alert.join(' | ')}`).toEqual([]);
  });
}

test('the reference folders: what exists', async () => {
  const count = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).length : 0);
  const info = { carousels: count(CAROUSELS), thumbnails: count(THUMBNAILS) };
  fs.writeFileSync(path.join(REAL_OUT, 'folders.json'), JSON.stringify(info));
  expect(info.carousels).toBeGreaterThan(0);
});
