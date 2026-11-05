// ONE real model run of Designed mode on the example script's text (skipped unless REAL_DESIGNED=1): the writer endpoints are the dev server's real ones.
// Saves a sheet of all slides side by side, and the same script drawn by the template code path (Quick mode) directly, with no model call and no saved project.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleScript } from '../../src/carousel/script';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test.skip(!process.env.REAL_DESIGNED, 'real model run only when REAL_DESIGNED=1');
test.setTimeout(15 * 60_000);
test.use({ viewport: { width: 1280, height: 900 } });

const ex = JSON.parse(exampleScript('carousel')) as { slides: Record<string, unknown>[] };
const TEXT = 'Accounts that fix their headline get about 3x more replies. ' + ex.slides.map((s) => [s.headline, s.sub, s.body, ...(Array.isArray(s.items) ? (s.items as string[]) : []), s.quote, s.label, s.note, s.cta].filter((x) => typeof x === 'string' && x).join('. ')).join('\n');

const SHEET = async (urls: string[]) => {
  const w = 300;
  const h = Math.round(w * 1.25);
  const c = document.createElement('canvas');
  c.width = urls.length * (w + 10) + 10;
  c.height = h + 20;
  const g = c.getContext('2d')!;
  g.fillStyle = '#888';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < urls.length; i++) {
    const im = new Image();
    im.src = urls[i];
    await im.decode();
    g.drawImage(im, 10 + i * (w + 10), 10, w, h);
  }
  return c.toDataURL('image/png');
};

test('real Designed run on the example script text', async ({ page }) => {
  let answer = '';
  page.on('response', async (r) => {
    if (/\/__carousel\/write|\/api\/carousel\/write/.test(r.url())) answer = (((await r.json().catch(() => ({}))) as { text?: string }).text) ?? '';
  });
  await page.goto('/images/carousel');
  await page.getByLabel('Your text or topic').fill(TEXT);
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
  await expect(page.getByTestId('designed-card')).toBeVisible({ timeout: 12 * 60_000 });
  await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(7, { timeout: 120_000 });
  const seconds = Math.round((Date.now() - t0) / 1000);
  const card = (await page.getByTestId('designed-card').innerText()).replace(/\n+/g, ' | ');
  const out = path.join(ROOT, 'out/image-engine/designed');
  const outQ = path.join(ROOT, 'out/image-engine/quick');
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(outQ, { recursive: true });
  fs.writeFileSync(path.join(out, 'example-3.txt'), `seconds (click to drawn): ${seconds}\n${card}\n`);
  const designed = await page.evaluate(`(${SHEET.toString()})([...document.querySelectorAll('.cr-pic img')].map((e) => e.src))`) as string;
  fs.writeFileSync(path.join(out, 'designed-example-3.png'), Buffer.from(designed.split(',')[1], 'base64'));
  // Quick: the same script through the template code path (compose + render), no model call, no saved project.
  const styleTitle = await page.locator('button.cr-style:has-text("In use") strong').first().innerText().catch(() => '');
  const quick = await page.evaluate(async ({ answer, styleTitle, sheet }) => {
    const R = await import('/src/carousel/render.ts');
    const S = await import('/src/carousel/script.ts');
    const v = S.validateScriptText(answer.slice(0, answer.search(/<svg/i) < 0 ? answer.length : answer.search(/<svg/i)), 'carousel');
    const style = (R.carouselStyles().find((s) => s.spec.title === styleTitle) ?? R.carouselStyles()[0]).spec.name;
    const { slides, margin } = R.composeDoc({ version: 1, format: 'carousel', style, topic: '', script: v.script!, choices: {} });
    const urls: string[] = [];
    for (const s of slides) urls.push(URL.createObjectURL((await R.renderer.render(s, margin)).png));
    // eslint-disable-next-line no-eval
    return { sheet: await (eval(`(${sheet})`) as (u: string[]) => Promise<string>)(urls), style };
  }, { answer, styleTitle, sheet: SHEET.toString() });
  fs.writeFileSync(path.join(outQ, 'quick-example-3.png'), Buffer.from(quick.sheet.split(',')[1], 'base64'));
  fs.appendFileSync(path.join(out, 'example-3.txt'), `quick style: ${quick.style}\n`);
});
