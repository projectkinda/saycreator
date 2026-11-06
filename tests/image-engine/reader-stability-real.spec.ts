// REAL (skipped unless REAL_STABILITY=1 and REF_LIGHT_DIR is set): the same light reference set is read 4 times in 4 fresh browser contexts (so the read cache is empty each time) and
// the marker count (and the other devices) is recorded for each read: the reader's yes/no answers, and what the drawn geometry says. Output: out/designed-library-real/stability-light.json
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { storedTemplates } from './reference-helpers';

test.skip(!process.env.REAL_STABILITY || !process.env.REF_LIGHT_DIR, 'set REAL_STABILITY=1 and REF_LIGHT_DIR to re-read the light set');
test.setTimeout(20 * 60_000);
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1300, height: 1000 } });
const OUT = path.resolve(process.cwd(), 'out/designed-library-real');
const FILE = path.join(OUT, 'stability-light.json');
const RUNS = Number(process.env.STABILITY_RUNS ?? 4);

for (let n = 1; n <= RUNS; n++) {
  test(`light set, read ${n} of ${RUNS}`, async ({ page }) => {
    const dir = process.env.REF_LIGHT_DIR!;
    const files = fs.readdirSync(dir).filter((f) => /\.(webp|jpe?g|png)$/i.test(f)).sort().slice(0, 10).map((f) => path.join(dir, f));
    let requests = 0;
    page.on('request', (r) => r.url().includes('/__reference/read') && r.method() === 'POST' && requests++);
    await page.goto('/images/carousel');
    await page.getByRole('button', { name: /^New style/ }).click();
    await page.getByLabel('Choose reference images or a PDF').setInputFiles(files);
    await expect(page.getByTestId('quick-count')).toContainText(`${files.length} picture`, { timeout: 60_000 });
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Read it' }).click();
    await Promise.race([page.getByTestId('quick-saved').waitFor({ timeout: 15 * 60_000 }), page.getByRole('alert').first().waitFor({ timeout: 15 * 60_000 })]);
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    const stored = (await storedTemplates(page)) as { pack?: any }[];
    const pack = stored.map((t) => t.pack).find(Boolean);
    expect(pack, 'the read saved a pack').toBeTruthy();
    const rep = await page.evaluate(async (p) => {
      const D = await import('/src/carousel/designLibrary.ts');
      const dr = D.deviceReport(p);
      return { slides: dr.slides, need: dr.need, seen: dr.seen, decided: dr.decided, answered: dr.perSlide.filter((s: any) => s.answered).length, perSlideMarker: dr.perSlide.map((s: any) => (s.marker ? 1 : 0)).join(''), perSlideUnderline: dr.perSlide.map((s: any) => (s.underline ? 1 : 0)).join(''), perSlideProfile: dr.perSlide.map((s: any) => (s.profileHeader ? 1 : 0)).join(''), perSlidePlanes: dr.perSlide.map((s: any) => (s.planes ? 1 : 0)).join('') };
    }, pack);
    fs.mkdirSync(OUT, { recursive: true });
    const all = fs.existsSync(FILE) && n > 1 ? (JSON.parse(fs.readFileSync(FILE, 'utf8')) as { reads: unknown[] }) : { reads: [] as unknown[] };
    all.reads.push({ read: n, seconds, readerRequests: requests, ...rep });
    fs.writeFileSync(FILE, JSON.stringify({ note: 'Same 10 light images, 4 reads in fresh browser contexts (no read cache). marker = on how many of the 10 slides (the rule needs 4).', ...all }, null, 2));
    console.log('light read', n, JSON.stringify({ seconds, requests, marker: rep.seen.marker, of: rep.slides, answered: rep.answered, seen: rep.seen, decided: rep.decided }));
  });
}
