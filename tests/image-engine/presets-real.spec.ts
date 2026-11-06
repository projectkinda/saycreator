// REAL RUN (skipped unless REAL_PRESETS=1): three built-in presets through the app's own path with the real writer (dev-cli), ONE model call per carousel, the same topic, 8 slides.
//   REAL_PRESETS=1 E2E_PORT=5299 npx playwright test -c tests/image-engine/playwright.config.ts presets-real.spec.ts
// Saves out/presets-real/<preset>/{sheet.png, slide-N.png, report.json, write-prompt.txt, write-answer.txt}.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.skip(!process.env.REAL_PRESETS, 'real run only when REAL_PRESETS=1');
test.setTimeout(Number(process.env.PRESET_TIMEOUT_MIN || 30) * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
const OUT = path.resolve(process.cwd(), process.env.PRESET_OUT ?? 'out/presets-real');
const TEXT = "Quick Flip is a Kickstarter project: a hoodie that flips into a backpack in 10 seconds. Slide the zip and bite the clasp, and the hoodie locks into a backpack. To flip it, zip the hood into the pocket, fold the sleeves behind you, then pull the straps and go. The shell is waterproof, it fits a 16-inch laptop, it is machine washable and it flips in 10 seconds. The team is raising $500,000 for 5% of the company and is open to 20 backers only. Early backers save 30%. One early backer said: \"I stopped carrying a bag the day this arrived.\"";
const PRESETS = [{ id: 'hot-flat', re: /Hot flat/ }, { id: 'editorial-collage', re: /editorial/i }, { id: 'glass-gradient', re: /Soft gradient|glass/i }];

for (const p of PRESETS.filter((x) => !process.env.PRESET_ONLY || process.env.PRESET_ONLY.split(',').includes(x.id))) {
  test('real preset: ' + p.id, async ({ page }) => {
    const writes: { prompt: string; answer: string; usage?: { input: number; output: number }; url: string }[] = [];
    const refs: string[] = [];
    page.on('request', (r) => { if (/\/(__|api\/)reference\//.test(r.url()) && !/status/.test(r.url())) refs.push(r.url()); });
    page.on('response', async (r) => {
      if (/\/(__|api\/)carousel\/write/.test(r.url()) && r.request().method() === 'POST') {
        const j = (await r.json().catch(() => ({}))) as { text?: string; usage?: { input: number; output: number } };
        writes.push({ prompt: (r.request().postDataJSON() as { prompt?: string }).prompt ?? '', answer: j.text ?? '', usage: j.usage, url: r.url().replace(/^https?:\/\/[^/]+/, '') });
      }
    });
    await page.goto('/images/carousel');
    await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
    await page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: p.re }).first().click();
    if (!(await page.locator('details.cr-advanced').evaluate((el) => (el as HTMLDetailsElement).open))) await page.getByText('Advanced: write the script yourself').click();
    await page.locator('label.cr-inline').filter({ hasText: /^Slides/ }).locator('select').selectOption('8');
    await page.getByLabel('Your text or topic').fill(TEXT);
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
    await expect(page.locator('.cr-pic img')).toHaveCount(8, { timeout: 15 * 60_000 });
    await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(8, { timeout: 180_000 });
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    const proj = await page.evaluate(() => {
      const d = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as { project?: { doc?: any } }).project?.doc;
      const l = d?.designed?.library;
      return { style: d?.style, route: d?.route ?? null, library: l ? { source: l.source, calls: l.calls, tokens: l.tokens, layouts: l.layouts, variants: l.variants, cuts: l.cuts, inverts: l.inverts, grounds: l.grounds, retries: l.retries, fallbacks: l.fallbacks, adjustments: l.codeAdjustments, flavour: l.style?.flavour ?? null, rhythm: (l.style?.rhythm ?? []).map((g: any) => g.bg), caseStyle: l.style?.caseStyle ?? null, weights: l.style?.weights ?? null, background: l.style?.background } : null };
    });
    const dir = path.join(OUT, p.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true, recursive: true });
    const grab = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('.cr-pic img')] as HTMLImageElement[];
      const pngs: string[] = [];
      const bmps: ImageBitmap[] = [];
      for (const im of imgs) {
        const blob = await (await fetch(im.src)).blob();
        bmps.push(await createImageBitmap(blob));
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        pngs.push(btoa(s));
      }
      const w = 270, h = 338;
      const c = document.createElement('canvas');
      c.width = bmps.length * (w + 10) + 10;
      c.height = h + 20;
      const g = c.getContext('2d')!;
      g.fillStyle = '#888';
      g.fillRect(0, 0, c.width, c.height);
      bmps.forEach((b, i) => g.drawImage(b, 10 + i * (w + 10), 10, w, h));
      return { pngs, sheet: c.toDataURL('image/png').split(',')[1] };
    });
    grab.pngs.forEach((b, i) => fs.writeFileSync(path.join(dir, `slide-${i + 1}.png`), Buffer.from(b, 'base64')));
    fs.writeFileSync(path.join(dir, 'sheet.png'), Buffer.from(grab.sheet, 'base64'));
    writes.forEach((w, i) => { fs.writeFileSync(path.join(dir, `write${i + 1}-prompt.txt`), w.prompt); fs.writeFileSync(path.join(dir, `write${i + 1}-answer.txt`), w.answer); });
    const fl = proj.library?.flavour as { prefer?: string[]; avoid?: string[]; cover?: string } | null;
    const layouts = (proj.library?.layouts ?? []) as string[];
    const flavour = fl ? { cover: fl.cover, coverUsed: layouts[0], preferredUsed: layouts.filter((l) => fl.prefer?.includes(l)), avoidedUsed: layouts.filter((l) => fl.avoid?.includes(l)), neitherUsed: layouts.filter((l) => !fl.prefer?.includes(l) && !fl.avoid?.includes(l)), promptHadFlavourLine: /This look suits/.test(writes[0]?.prompt ?? '') } : null;
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ preset: p.id, seconds, writeRequests: writes.length, writeUrls: writes.map((w) => w.url), usage: writes.map((w) => w.usage ?? null), promptChars: writes.map((w) => w.prompt.length), referenceRequests: refs.length, ...proj, flavourCheck: flavour }, null, 2));
    console.log('PRESET ' + p.id + ' ' + JSON.stringify({ writes: writes.length, usage: writes.map((w) => w.usage), layouts, flavour, route: proj.route, refs: refs.length, seconds }));
    expect(writes.length, 'one model call per carousel').toBe(1);
    expect(refs.length, 'the preset never reads a reference').toBe(0);
    expect(proj.library?.source).toBe(p.id);
  });
}
