// "Download report" (no model): report.json is small and has no image data; compare.jpg is about 1600 px wide with the reference slides on top and the generated ones below.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(120_000);

async function seed(page: Page) {
  await page.addInitScript(() => localStorage.setItem('creator.devtools', '1')); // the Report panel is a developer tool since round 1
  await page.goto('/images/carousel');
  await page.evaluate(async () => {
    const Dc = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    const U = await import('/src/carousel/useProject.ts');
    const doc = { ...Dc.emptyDoc('editorial-collage'), script: S.EXAMPLE };
    U.writeStore(U.STORE_KEY, JSON.stringify({ project: { doc, past: [], future: [] } }));
  });
  await page.reload();
}
async function withReference(page: Page) {
  await page.evaluate(async () => {
    const A = await import('/src/reference/active.ts');
    const B = await import('/src/reference/blank.ts');
    const c = new OffscreenCanvas(400, 500);
    const g = c.getContext('2d')!;
    g.fillStyle = '#d33';
    g.fillRect(0, 0, 400, 500);
    const blob = await c.convertToBlob({ type: 'image/jpeg' });
    const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
    A.setActiveReference({ source: 'recreate', /* the screen's own reader clears a reference of its own source when it holds no pictures; this one is set by the test */ spec: B.blankStyle(), thumb: '', learn: 'everything', target: 'carousel', ratioNote: null, photoRegion: null, report: { files: [{ name: 'ref-one.jpg', bytes: 54321, width: 400, height: 500 }, { name: 'ref-two.jpg', bytes: 4321, width: 400, height: 500 }], thumbs: [url, url] } });
  });
}
const dims = (page: Page, file: string) =>
  page.evaluate(async (b64) => {
    const bm = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }));
    return { w: bm.width, h: bm.height };
  }, fs.readFileSync(file).toString('base64'));

test('the carousel page downloads report.json and compare.jpg, with verdicts, the note and the reference files', async ({ page }, info) => {
  await seed(page);
  await withReference(page);
  const panel = page.getByRole('region', { name: 'Report' });
  await expect(panel.getByRole('button', { name: 'Download report' })).toBeVisible();
  await panel.getByRole('group', { name: 'Verdict for slide 1' }).getByRole('button', { name: 'good' }).click();
  await panel.getByRole('group', { name: 'Verdict for slide 2' }).getByRole('button', { name: 'bad' }).click();
  await panel.getByLabel("What I wanted / what's wrong").fill('The title should sit lower.');
  const downloads: { name: string; path: string }[] = [];
  page.on('download', async (d) => downloads.push({ name: d.suggestedFilename(), path: (await d.path())! }));
  await panel.getByRole('button', { name: 'Download report' }).click();
  await expect(page.getByTestId('report-status')).toContainText('No model was called', { timeout: 90_000 });
  await expect.poll(() => downloads.length).toBe(2);
  const json = downloads.find((d) => d.name === 'report.json')!;
  const jpg = downloads.find((d) => d.name === 'compare.jpg')!;
  expect(json && jpg).toBeTruthy();
  const text = fs.readFileSync(json.path, 'utf8');
  const rep = JSON.parse(text);
  expect(text.length, 'small').toBeLessThan(60_000);
  expect(text).not.toMatch(/data:image|base64/);
  expect(rep.referenceFiles).toEqual([{ name: 'ref-one.jpg', bytes: 54321, width: 400, height: 500 }, { name: 'ref-two.jpg', bytes: 4321, width: 400, height: 500 }]);
  expect(rep.read.fonts).toBeTruthy();
  expect(Object.keys(rep.read.layouts)).toContain('cover');
  expect(rep.model).toHaveProperty('calls');
  expect(rep.slides.length).toBeGreaterThan(2);
  expect(rep.slides[0]).toMatchObject({ number: 1, type: 'cover', verdict: 'good' });
  expect(rep.slides[1].verdict).toBe('bad');
  expect(rep.slides[2].verdict).toBeNull();
  for (const s of rep.slides) {
    expect(typeof s.layout).toBe('string');
    expect(Array.isArray(s.checks)).toBe(true);
    expect(s.checks.length).toBeGreaterThan(0);
    expect(s.checks[0]).toHaveProperty('pass');
  }
  expect(rep.whatIWantedAndWhatsWrong).toBe('The title should sit lower.');
  const d = await dims(page, jpg.path);
  expect(d.w).toBeGreaterThan(1500);
  expect(d.w).toBeLessThan(1700);
  // Without the reference pictures: the reference row is gone, the picture is shorter, and nothing else changes.
  downloads.length = 0;
  await panel.getByRole('checkbox', { name: 'Include my reference pictures' }).uncheck();
  await panel.getByRole('button', { name: 'Download report' }).click();
  await expect.poll(() => downloads.length, { timeout: 90_000 }).toBe(2);
  const d2 = await dims(page, downloads.find((x) => x.name === 'compare.jpg')!.path);
  expect(d2.w).toBe(d.w);
  expect(d2.h, 'no reference row').toBeLessThan(d.h);
  info.annotations.push({ type: 'compare', description: `with refs ${d.w}x${d.h}, without ${d2.w}x${d2.h}, json ${text.length} chars` });
});

test('the Results screen has the same Download report button', async ({ page }) => {
  await seed(page);
  await page.goto('/lab');
  const panel = page.getByRole('region', { name: 'Report' });
  await expect(panel.getByRole('button', { name: 'Download report' })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole('checkbox', { name: 'Include my reference pictures' })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Verdict for slide 1' })).toBeVisible();
});
