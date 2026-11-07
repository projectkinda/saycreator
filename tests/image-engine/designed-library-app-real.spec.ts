// REAL, through the app's own path (skipped unless REAL_APP=1 and the reference folders are given): the carousel page's "New style" box reads the person's real reference
// images with the real whole-slide reader (the dev server's Claude Code reader), saves the style and selects it; then the real text goes in and "Make carousel" runs the
// library route with the real writer. A second "New style" on the same images must come from the saved style (no reader request).
//
//   REAL_APP=1 REF_DARK_DIR="<folder of the dark deck's images>" REF_LIGHT_DIR="<folder of the light deck's images>" npx playwright test ... designed-library-app-real.spec.ts
//   Optional: E2E_PORT=5299 READER_LOG=<file> starts a separate dev server that logs every reader request it receives, to check the browser-side count against the server's.
//
// Saves per reference in out/designed-library-real/<name>/: slide-1..7.png, sheet.png, report.json, style-mapping.json (with per-slide device counts), every writer call.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { storedTemplates } from './reference-helpers';

test.skip(!process.env.REAL_APP, 'real run only when REAL_APP=1');
test.setTimeout(45 * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
const OUT = path.resolve(process.cwd(), 'out/designed-library-real');
const IMAGE = /\.(webp|jpe?g|png)$/i;

const RUNS = [
  {
    name: 'quickflip-dark',
    env: 'REF_DARK_DIR',
    handle: '@quick.flip',
    text: "Quick Flip is a Kickstarter project: a hoodie that flips into a backpack in 10 seconds. Slide the zip and bite the clasp, and the hoodie locks into a backpack. To flip it, zip the hood into the pocket, fold the sleeves behind you, then pull the straps and go. The shell is waterproof, it fits a 16-inch laptop, it is machine washable and it flips in 10 seconds. The team is raising $500,000 for 5% of the company and is open to 20 backers only. Early backers save 30%. One early backer said: \"I stopped carrying a bag the day this arrived.\"",
  },
  {
    name: 'harsh-light',
    env: 'REF_LIGHT_DIR',
    handle: '@harsh.parekh',
    text: 'Accounts that fix their headline get about 3x more replies. Fix your profile in 15 minutes with three edits that make people stop scrolling and start replying. Step 1: rewrite your headline: skip the job title and say who you help and how. Step 2: lead with a result: open with one number or outcome, not a list of adjectives. Step 3: pin one proof post: feature your best post at the top, because people decide in seconds. Before you hit save, check that you have a clear, well-lit photo, a headline that names who you help, and current contact info. Save this and fix it tonight.',
  },
];
const only = process.env.REAL_ONLY;

/** The size of a JPEG from its header. */
function jpegSize(b: Buffer): { w: number; h: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

for (const run of RUNS.filter((r) => !only || r.name === only)) {
  test('real app path: ' + run.name, async ({ page }) => {
    const refDir = process.env[run.env];
    test.skip(!refDir || !fs.existsSync(refDir), `${run.env} is not set (or the folder is missing): no reference images to read.`);
    const files = fs.readdirSync(refDir!).filter((f) => IMAGE.test(f)).sort().slice(0, 10).map((f) => path.join(refDir!, f));
    expect(files.length).toBeGreaterThanOrEqual(5);
    const logFile = process.env.READER_LOG;
    const logLines = () => (logFile && fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length : null);
    const logBefore = logLines();
    const reqs: { role?: string; images: number; promptChars: number; estTokens: number; dims: string[] }[] = [];
    const resp: { ms: number; chars: number }[] = [];
    const writes: { prompt: string; answer: string; usage?: { input: number; output: number } }[] = [];
    const methods: Record<string, number> = {};
    const cacheLogs: string[] = [];
    page.on('console', (m) => m.text().startsWith('[whole-cache]') && cacheLogs.push(new Date().toISOString().slice(11, 19) + ' ' + m.text()));
    page.on('request', (r) => {
      if (r.url().includes('/__reference/read')) methods[r.method()] = (methods[r.method()] ?? 0) + 1;
      if (!r.url().includes('/__reference/read') || r.method() !== 'POST') return;
      const b = r.postDataJSON() as { role?: string; prompt?: string; images?: { base64: string }[] };
      const dims: string[] = [];
      let est = Math.round((b.prompt ?? '').length / 4);
      for (const im of b.images ?? []) {
        const s = jpegSize(Buffer.from(im.base64, 'base64'));
        if (!s) continue;
        const k = Math.min(1, 1568 / Math.max(s.w, s.h)); // the model scales a picture down to at most 1568 px on its long side
        est += Math.round((s.w * k * s.h * k) / 750);
        dims.push(`${s.w}x${s.h}`);
      }
      reqs.push({ role: b.role, images: b.images?.length ?? 0, promptChars: (b.prompt ?? '').length, estTokens: est, dims });
    });
    page.on('response', async (r) => {
      const u = r.url();
      if (u.includes('/__reference/read') && r.request().method() === 'POST') {
        const j = (await r.json().catch(() => ({}))) as { text?: string; ms?: number };
        resp.push({ ms: j.ms ?? 0, chars: (j.text ?? '').length });
      }
      if (u.includes('/__carousel/write')) {
        const j = (await r.json().catch(() => ({}))) as { text?: string; usage?: { input: number; output: number } };
        writes.push({ prompt: (r.request().postDataJSON() as { prompt?: string }).prompt ?? '', answer: j.text ?? '', usage: j.usage });
      }
    });
    await page.goto('/images/carousel');
    await page.getByRole('button', { name: /^New style/ }).click();
    await page.getByLabel('Choose reference images or a PDF').setInputFiles(files);
    await expect(page.getByTestId('quick-count')).toContainText(`${files.length} picture`, { timeout: 60_000 });
    const t0 = Date.now();
    const marks: Record<string, string> = { firstReadClicked: new Date().toISOString() };
    await page.getByRole('button', { name: 'Read it' }).click();
    await Promise.race([page.getByTestId('quick-saved').waitFor({ timeout: 35 * 60_000 }), page.getByRole('alert').first().waitFor({ timeout: 35 * 60_000 })]);
    const readSeconds = Math.round((Date.now() - t0) / 100) / 10;
    marks.firstReadSaved = new Date().toISOString();
    const alerts = await page.getByRole('alert').allInnerTexts();
    const saved = await page.getByTestId('quick-saved').innerText().catch(() => '');
    const dir = path.join(OUT, run.name);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true, recursive: true });
    const readCount = { browserRequests: reqs.length, browserResponses: resp.length, methods: { ...methods }, serverLog: logLines() === null ? null : logLines()! - (logBefore ?? 0) };
    // what the style mapping produced from the REAL pack the read made, with per-slide device counts
    const stored = (await storedTemplates(page)) as { pack?: any }[];
    const pack = stored.map((t) => t.pack).find(Boolean);
    const mapping = pack
      ? await page.evaluate(async (p) => {
          const D = await import('/src/carousel/designLibrary.ts');
          const m = D.styleFromPack(p);
          return { style: m.style, notes: m.notes, devices: D.deviceReport(p), pack: { name: p.name, palette: p.palette, fonts: p.fonts, devices: p.devices ?? null, types: Object.keys(p.designs ?? {}), variants: Object.fromEntries(Object.entries(p.variants ?? {}).map(([k, v]: [string, any]) => [k, v.length])) } };
        }, pack)
      : null;
    const tokenEstimate = { note: 'ESTIMATE: the reader endpoint reports no token usage. Input = prompt chars / 4 + picture tokens (width x height / 750 after scaling to 1568 px on the long side); output is not estimated.', inputTokens: reqs.reduce((a, r) => a + r.estTokens, 0), perRequest: reqs.map((r) => ({ role: r.role, images: r.images, dims: r.dims, promptChars: r.promptChars, estTokens: r.estTokens })) };
    fs.writeFileSync(path.join(dir, 'style-mapping.json'), JSON.stringify({ savedMessage: saved, alerts, readSeconds, readRequests: readCount, tokenEstimate, mapping }, null, 2));
    expect(alerts.filter((a) => !/would not save/.test(a)), 'the read ended without an alert').toEqual([]);
    expect(pack, 'the read saved a pack').toBeTruthy();
    // the real text goes in and the library route runs with the real writer
    await page.getByLabel('Your text or topic').fill(run.text);
    const handleField = page.getByLabel(/handle/i).first();
    if (await handleField.count()) await handleField.fill(run.handle).catch(() => undefined);
    const g0 = Date.now();
    marks.makeClicked = new Date().toISOString();
    await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
    await expect(page.locator('.cr-pic img')).toHaveCount(7, { timeout: 15 * 60_000 });
    await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(7, { timeout: 180_000 });
    const makeSeconds = Math.round((Date.now() - g0) / 100) / 10;
    marks.makeDone = new Date().toISOString();
    const readsAfterMake = reqs.length;
    const grab = () => page.evaluate(async () => {
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
      const w = 300;
      const h = 375;
      const c = document.createElement('canvas');
      c.width = bmps.length * (w + 10) + 10;
      c.height = h + 20;
      const g = c.getContext('2d')!;
      g.fillStyle = '#888';
      g.fillRect(0, 0, c.width, c.height);
      bmps.forEach((b, i) => g.drawImage(b, 10 + i * (w + 10), 10, w, h));
      return { pngs, sheet: c.toDataURL('image/png').split(',')[1] };
    });
    const out = await grab();
    out.pngs.forEach((b, i) => fs.writeFileSync(path.join(dir, `slide-${i + 1}.png`), Buffer.from(b, 'base64')));
    fs.writeFileSync(path.join(dir, 'sheet.png'), Buffer.from(out.sheet, 'base64'));
    writes.forEach((w, i) => {
      fs.writeFileSync(path.join(dir, `write${i + 1}-prompt.txt`), w.prompt);
      fs.writeFileSync(path.join(dir, `write${i + 1}-answer.txt`), w.answer);
    });
    // the detected devices as toggles: flipping them draws the deck again from its stored plan, with no reader and no writer request
    const panel = page.getByTestId('detected-style');
    await expect(panel).toBeVisible();
    const panelBefore = (await panel.innerText()).replace(/\n+/g, ' | ');
    const before = { reads: reqs.length, writes: writes.length, log: logLines() };
    const srcBefore = await page.locator('.cr-pic img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    const underline = panel.getByRole('checkbox', { name: 'Underline' });
    const wasUnderline = await underline.isChecked();
    await underline.click();
    await expect(page.getByText(/^Style devices changed/).first()).toBeVisible({ timeout: 60_000 });
    await panel.getByRole('radio', { name: 'Shapes: bold' }).click();
    await page.waitForTimeout(2500);
    await page.getByRole('radio', { name: 'Shapes: bold' }).waitFor();
    const after = await grab();
    fs.writeFileSync(path.join(dir, 'sheet-overrides.png'), Buffer.from(after.sheet, 'base64'));
    after.pngs.forEach((b, i) => fs.writeFileSync(path.join(dir, `slide-${i + 1}-overrides.png`), Buffer.from(b, 'base64')));
    const srcAfter = await page.locator('.cr-pic img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    const wantOv = { underline: !wasUnderline, shapes: 'bold' };
    const ovNow = await page.evaluate(async () => (await import('/src/reference/active.ts')).activeReference()?.pack?.overrides ?? null);
    const toggles = { panelBefore, wasUnderline, overridesNow: ovNow, slidesRedrawn: srcAfter.filter((x, i) => x !== srcBefore[i]).length, newReaderRequests: reqs.length - before.reads, newWriterCalls: writes.length - before.writes, newServerLogLines: before.log === null ? null : logLines()! - before.log };
    // the project the app saved (localStorage) carries the library report
    const proj = await page.evaluate(() => {
      try {
        const p = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as { project?: { doc?: { designed?: { library?: unknown; notes?: string[] }; route?: unknown } } }).project?.doc;
        return { library: p?.designed?.library ?? null, notes: p?.designed?.notes ?? [], route: p?.route ?? null };
      } catch {
        return { library: null, notes: [], route: null };
      }
    });
    const lib = proj.library as { calls: number; tokens: unknown; layouts: string[]; cuts: string[]; inverts: string[]; retries: unknown[]; fallbacks: unknown[]; seconds: number } | null;
    // the layout picker on slide 3: thumbnails drawn by the code, a click redraws that one slide with no request; "Rewrite text" is the one small model call
    const pk = { idx: 2 };
    const picker = page.getByTestId(`gallery-${pk.idx}`);
    await picker.scrollIntoViewIfNeeded();
    await expect(picker.locator('img').first()).toBeVisible({ timeout: 180_000 });
    await expect.poll(async () => picker.locator('img').count(), { timeout: 180_000, intervals: [1500] }).toBeGreaterThanOrEqual(4);
    await page.waitForTimeout(3000);
    const tileIds = await picker.locator(`[data-testid^="gal-"]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    await picker.screenshot({ path: path.join(dir, 'picker.png') });
    const srcsNow = () => page.locator('.cr-pic img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    const pk0 = { reads: reqs.length, writes: writes.length };
    const s0s = await srcsNow();
    const layoutTile = picker.locator(`[data-current="false"][data-enabled="true"] button:not([disabled])`).first();
    const layoutPicked = (await layoutTile.getAttribute('data-testid')) ?? '';
    await layoutTile.click();
    await expect(picker.getByText(/^Redrew slide 3/)).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(3500);
    const s1s = await srcsNow();
    const changedAfterLayout = s1s.map((x, i) => (x !== s0s[i] ? i : -1)).filter((i) => i >= 0);
    const cutTile = picker.locator(`[data-testid^="gal-cut-"]:not([disabled])`).first();
    const cutPicked = (await cutTile.count()) ? (await cutTile.getAttribute('data-testid')) ?? '' : '';
    if (cutPicked) {
      await cutTile.click();
      await expect(picker.getByText(/^Redrew slide 3/)).toBeVisible({ timeout: 60_000 });
    }
    const afterPicks = await srcsNow();
    const picksNoModel = { newReaderRequests: reqs.length - pk0.reads, newWriterCalls: writes.length - pk0.writes };
    const pickedGrab = await grab();
    fs.writeFileSync(path.join(dir, 'sheet-picked.png'), Buffer.from(pickedGrab.sheet, 'base64'));
    pickedGrab.pngs.forEach((b, i) => fs.writeFileSync(path.join(dir, `slide-${i + 1}-picked.png`), Buffer.from(b, 'base64')));
    // Rewrite text: exactly one small call (the retry may make a second), for this slide only
    const rw0 = { reads: reqs.length, writes: writes.length };
    const s2s = await srcsNow();
    await page.getByTestId(`rewrite-${pk.idx}`).getByRole('button', { name: 'Rewrite text' }).click();
    await expect(picker.getByText(/^(Rewrote the text of slide 3|Could not rewrite slide 3)/)).toBeVisible({ timeout: 10 * 60_000 });
    const rewriteMsg = await picker.getByText(/^(Rewrote the text of slide 3|Could not rewrite slide 3)/).innerText();
    await page.waitForTimeout(2500);
    const s3s = await srcsNow();
    const rewriteGrab = await grab();
    rewriteGrab.pngs.forEach((b, i) => i === pk.idx && fs.writeFileSync(path.join(dir, `slide-${i + 1}-rewritten.png`), Buffer.from(b, 'base64')));
    const pickerReport = {
      tiles: tileIds,
      layoutPicked,
      cutPicked,
      slidesChangedByTheLayoutPick: changedAfterLayout,
      picksMade: { ...picksNoModel },
      rewrite: { message: rewriteMsg, newReaderRequests: reqs.length - rw0.reads, newWriterCalls: writes.length - rw0.writes, slidesChanged: s3s.map((x, i) => (x !== s2s[i] ? i : -1)).filter((i) => i >= 0) },
      slidesChangedByPicksOverall: afterPicks.map((x, i) => (x !== s0s[i] ? i : -1)).filter((i) => i >= 0),
    };
    // a second "New style" on the same images: the saved style is used and the reader is not asked again
    const before2 ={ reqs: reqs.length, log: logLines() };
    // a fresh page in the same browser (the saved-style cache lives in IndexedDB, the working state does not)
    await page.reload();
    await page.getByRole('button', { name: /^New style/ }).click();
    await page.getByLabel('Choose reference images or a PDF').setInputFiles(files);
    await expect(page.getByTestId('quick-count')).toContainText(`${files.length} picture`, { timeout: 60_000 });
    const s0 = Date.now();
    const countText = await page.getByTestId('quick-count').innerText();
    marks.secondReadClicked = new Date().toISOString();
    await page.getByRole('button', { name: 'Read it' }).click();
    const shown = await page.getByText(/^Using saved style/).first().waitFor({ timeout: 60_000 }).then(() => true, () => false);
    const secondSeconds = Math.round((Date.now() - s0) / 100) / 10;
    marks.secondReadDone = new Date().toISOString();
    await page.waitForTimeout(1500);
    await page.getByTestId('quick-saved').waitFor({ timeout: 12 * 60_000 }).catch(() => undefined);
    const keptOv = await page.evaluate(async () => (await import('/src/reference/active.ts')).activeReference()?.pack?.overrides ?? null);
    const cache = { overridesKeptAfterCacheHit: keptOv, cacheLogs, countTextAfterSecondAdd: countText, usingSavedStyleShown: shown, secondReadSeconds: secondSeconds, newReaderRequests: reqs.length - before2.reqs, newServerLogLines: before2.log === null ? null : logLines()! - before2.log };
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ kind: 'say-creator-real-app-run', carousel: run.name, readSeconds, milestones: marks, readRequests: readCount, readerRequestsDuringMake: readsAfterMake - readCount.browserRequests, makeSeconds, writeCalls: writes.length, perWrite: writes.map((w) => ({ usage: w.usage ?? null, promptChars: w.prompt.length, answerChars: w.answer.length })), library: lib, route: proj.route, notes: proj.notes, cacheCheck: cache, toggles, picker: pickerReport, styleMapping: mapping, tokenEstimate: { inputTokens: tokenEstimate.inputTokens, note: tokenEstimate.note } }, null, 2));
    console.log(run.name, JSON.stringify({ readRequests: readCount, readSeconds, writeCalls: writes.length, makeSeconds, usage: writes.map((w) => w.usage), estInput: tokenEstimate.inputTokens, lib: lib && { calls: lib.calls, tokens: lib.tokens, layouts: lib.layouts, cuts: lib.cuts, inverts: lib.inverts, retries: lib.retries, fallbacks: lib.fallbacks }, cache, devices: mapping?.devices.seen, decided: mapping?.devices.decided, style: mapping?.style }));
    expect(lib, 'the report carries the library section').toBeTruthy();
    expect(cache.newReaderRequests, 'the second read used the saved style').toBe(0);
    expect(toggles.newReaderRequests + toggles.newWriterCalls, 'the toggles made no model call').toBe(0);
    expect(toggles.slidesRedrawn, 'the toggles changed the slides').toBeGreaterThan(0);
    expect(pickerReport.picksMade.newReaderRequests + pickerReport.picksMade.newWriterCalls, 'picking a layout or a cut made no model call').toBe(0);
    expect(pickerReport.slidesChangedByTheLayoutPick, 'a layout pick redraws that one slide only').toEqual([2]);
    expect(pickerReport.rewrite.newReaderRequests, 'Rewrite text reads no reference').toBe(0);
    expect(pickerReport.rewrite.newWriterCalls, 'Rewrite text is one small call (two if the first answer broke a limit)').toBeLessThanOrEqual(2);
    expect(toggles.overridesNow).toEqual(wantOv);
    expect(cache.overridesKeptAfterCacheHit, 'the read cache did not overwrite the overrides').toEqual(wantOv);
  });
}
