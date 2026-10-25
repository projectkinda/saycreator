// Step 9: REAL generations through the dev writer (Claude Code on this computer). Not part of the normal suite: it spends model usage
// and the answers differ each time. Run it on purpose:   REAL_GENERATE=1 npx playwright test -c tests/image-engine/playwright.config.ts carousel-real
// The second test (always on) turns the saved runs plus tests/image-engine/oneshot-findings.json into the "Step 9" Results section.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScriptText } from '../../src/carousel/script';
import { outUrl, writeStepResults, type ResultsItem } from './results';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/oneshot-real');
const INPUTS = [
  { id: 'creator', title: 'A creator (batching videos)', file: 'creator.txt', handle: '@woodbench.daily' },
  { id: 'small-business', title: 'A small business (a cafe)', file: 'small-business.txt', handle: '@corner.cafe' },
  { id: 'agency', title: 'An agency (client briefs)', file: 'agency.txt', handle: '@studio.brief' },
];
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1280, height: 900 } });

interface Run {
  id: string;
  title: string;
  inputChars: number;
  writerLabel: string;
  wallMsToScript: number;
  wallMsToAllDrawn: number;
  calls: { ms: number; status: number }[];
  attempts: number;
  progressMessage: string;
  slides: number;
  style: string;
  warnings: string[];
  phoneFailures: string[];
  headlines: string[];
  scriptFile: string;
  slideFiles: string[];
  error?: string;
}

test('REAL: three generations on the sample texts, through the real Generate button and the real dev writer', async ({ page }) => {
  test.skip(process.env.REAL_GENERATE !== '1', 'Real generations are opt-in (REAL_GENERATE=1): they use model usage and take a minute each.');
  test.setTimeout(900_000);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const runs: Run[] = [];
  page.on('crash', () => console.log('PAGE CRASHED'));
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
  for (const inp of INPUTS.filter((i) => !process.env.REAL_ONLY || process.env.REAL_ONLY.split(',').includes(i.id))) {
    const text = fs.readFileSync(path.join(ROOT, 'sample-inputs', inp.file), 'utf8');
    await page.goto('/images/carousel');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('writer-label')).toContainText(/Claude Code|Claude API/);
    const writerLabel = await page.getByTestId('writer-label').innerText();
    await page.getByLabel('Your text, idea or article').fill(text);
    await page.getByLabel('Your handle (optional)').fill(inp.handle);
    const calls: Run['calls'] = [];
    const t0 = Date.now();
    page.on('response', (r) => {
      if (/\/(__carousel|api\/carousel)\/write$/.test(r.url())) { calls.push({ ms: Date.now() - t0, status: r.status() }); r.text().then((t) => fs.writeFileSync(path.join(OUT, 'raw-' + inp.id + '-' + calls.length + '.json'), t)).catch(() => undefined); }
    });
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByTestId('progress')).toContainText(/Drawing slide|Done:/, { timeout: 420_000 }).catch(() => undefined);
    const wallMsToScript = Date.now() - t0;
    const errBox = page.getByRole('alert').filter({ hasText: /Your text is kept/ });
    const error = (await errBox.count()) > 0 ? await errBox.first().innerText() : '';
    if (error) {
      runs.push({ id: inp.id, title: inp.title, inputChars: text.length, writerLabel, wallMsToScript, wallMsToAllDrawn: wallMsToScript, calls, attempts: calls.length, progressMessage: '', slides: 0, style: '', warnings: [], phoneFailures: [], headlines: [], scriptFile: '', slideFiles: [], error });
      continue;
    }
    await expect(page.getByTestId('progress')).toContainText('Done:', { timeout: 120_000 });
    await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(await page.locator('.cr-card').count(), { timeout: 60_000 });
    const wallMsToAllDrawn = Date.now() - t0;
    const progressMessage = (await page.getByTestId('progress').innerText()).trim();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project.doc);
    const scriptFile = path.join(OUT, `${inp.id}-script.json`);
    fs.writeFileSync(scriptFile, JSON.stringify(saved.script, null, 2));
    const v = validateScriptText(JSON.stringify(saved.script), saved.format);
    const imgs = await page.locator('.cr-card .cr-pic img').evaluateAll(async (els) =>
      Promise.all(els.map(async (e) => {
        const blob = await (await fetch((e as HTMLImageElement).src)).blob();
        return await new Promise<string>((res) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(',')[1]);
          fr.readAsDataURL(blob);
        });
      })),
    );
    const slideFiles = imgs.map((bin, i) => {
      const f = path.join(OUT, `${inp.id}-slide-${String(i + 1).padStart(2, '0')}.png`);
      fs.writeFileSync(f, Buffer.from(bin, 'base64'));
      return f;
    });
    const phoneFailures = await page.locator('.cr-card').evaluateAll((cards) => cards.flatMap((c, n) => [...c.querySelectorAll('.cr-lint-fail li')].map((x) => `Slide ${n + 1}: ${x.textContent}`)));
    await page.screenshot({ path: path.join(OUT, `${inp.id}-page.png`), fullPage: false });
    runs.push({
      id: inp.id, title: inp.title, inputChars: text.length, writerLabel, wallMsToScript, wallMsToAllDrawn, calls, attempts: calls.length, progressMessage,
      slides: saved.script.slides.length, style: saved.style, warnings: v.warnings.map((w) => `${w.path}: ${w.message}`), phoneFailures,
      headlines: saved.script.slides.map((s: Record<string, string>) => `${s.type}: ${s.headline ?? s.quote ?? s.value ?? ''}`), scriptFile, slideFiles,
    });
    page.removeAllListeners('response');
  }
  fs.writeFileSync(path.join(OUT, 'runs.json'), JSON.stringify({ machine: `${os.cpus()[0].model.trim()}, ${os.cpus().length} logical cores, ${Math.round(os.totalmem() / 1073741824)} GB, ${os.platform()} ${os.release()}`, at: new Date().toISOString(), runs }, null, 2));
  for (const r of runs) expect(r.error ?? '', `${r.id} failed`).toBe('');
});

test('REAL: one quote card set (3 cards) from a text with named speakers', async ({ page }) => {
  test.skip(process.env.REAL_GENERATE !== '1', 'Real generations are opt-in (REAL_GENERATE=1).');
  test.setTimeout(300_000);
  const out = path.join(ROOT, 'out/image-engine/step10');
  fs.mkdirSync(out, { recursive: true });
  const text = fs.readFileSync(path.join(ROOT, 'sample-inputs/quotes.txt'), 'utf8');
  await page.goto('/images/carousel');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('writer-label')).toContainText(/Claude Code|Claude API/);
  await page.getByLabel('Your text, idea or article').fill(text);
  await page.getByRole('button', { name: /^Quote card/ }).click();
  const calls: { ms: number; status: number }[] = [];
  const t0 = Date.now();
  page.on('response', (r) => {
    if (/\/(__carousel|api\/carousel)\/write$/.test(r.url())) calls.push({ ms: Date.now() - t0, status: r.status() });
  });
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('progress')).toContainText(/Done:|Drawing slide/, { timeout: 240_000 });
  const errBox = page.getByRole('alert').filter({ hasText: /Your text is kept/ });
  const error = (await errBox.count()) > 0 ? await errBox.first().innerText() : '';
  let run: Record<string, unknown> = { error, calls };
  if (!error) {
    await expect(page.getByTestId('progress')).toContainText('Done:', { timeout: 120_000 });
    const n = await page.locator('.cr-card').count();
    await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(n, { timeout: 60_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}').project.doc);
    const imgs = await page.locator('.cr-card .cr-pic img').evaluateAll(async (els) =>
      Promise.all(els.map(async (e) => {
        const blob = await (await fetch((e as HTMLImageElement).src)).blob();
        return await new Promise<string>((res) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(',')[1]);
          fr.readAsDataURL(blob);
        });
      })),
    );
    const files = imgs.map((b64, i) => {
      const f = path.join(out, 'real-quote-' + String(i + 1).padStart(2, '0') + '.png');
      fs.writeFileSync(f, Buffer.from(b64, 'base64'));
      return path.relative(ROOT, f).split(path.sep).join('/');
    });
    const failures = await page.locator('.cr-card').evaluateAll((cards) => cards.flatMap((c, k) => [...c.querySelectorAll('.cr-lint-fail li')].map((x) => 'Slide ' + (k + 1) + ': ' + x.textContent)));
    const v = validateScriptText(JSON.stringify(saved.script), 'quote');
    run = { error: '', calls, ms: Date.now() - t0, format: saved.format, style: saved.style, quotes: saved.script.slides.map((s: { quote: string; by: string }) => ({ quote: s.quote, by: s.by })), warnings: v.warnings.map((w) => w.message), failures, files, message: (await page.getByTestId('progress').innerText()).trim() };
  }
  fs.writeFileSync(path.join(out, 'real-quote.json'), JSON.stringify(run, null, 2));
  expect(run.error).toBe('');
});

test('Step 9 Results section: the saved real runs and my findings', async () => {
  const f = path.join(OUT, 'runs.json');
  test.skip(!fs.existsSync(f), 'No saved real runs yet (run with REAL_GENERATE=1).');
  const saved = JSON.parse(fs.readFileSync(f, 'utf8')) as { machine: string; at: string; runs: Run[] };
  const findingsFile = path.join(ROOT, 'tests/image-engine/oneshot-findings.json');
  const findings: { title: string; tag: string; note: string }[] = fs.existsSync(findingsFile) ? JSON.parse(fs.readFileSync(findingsFile, 'utf8')) : [];
  const sec = (ms: number) => `${(ms / 1000).toFixed(0)} s`;
  const items: ResultsItem[] = saved.runs.map((r) => ({
    id: r.id,
    title: r.title,
    tag: r.error ? 'FAILED' : 'REAL',
    images: r.slideFiles.map((p, i) => ({ url: outUrl(p), label: `Slide ${i + 1}` })),
    error: r.error || undefined,
    checker: r.error ? undefined : { pass: r.phoneFailures.length === 0, reasons: r.phoneFailures },
    facts: [
      `writer: ${r.writerLabel.replace('Writer (dev label): ', '')}`,
      `text: ${r.inputChars} characters in, ${r.slides} slides out, style ${r.style}`,
      `time: script ready after ${sec(r.wallMsToScript)}, all slides drawn and checked after ${sec(r.wallMsToAllDrawn)}; writer calls: ${r.attempts} (${r.calls.map((c) => `${sec(c.ms)} status ${c.status}`).join(', ')})`,
      `validator warnings: ${r.warnings.length === 0 ? 'none' : r.warnings.join(' | ')}`,
      `message shown: ${r.progressMessage}`,
      `slides: ${r.headlines.join(' / ')}`,
      `script file: ${path.relative(ROOT, r.scriptFile).split(path.sep).join('/')}`,
    ],
  }));
  writeStepResults({
    id: 'step9',
    title: 'Step 9: One-shot carousel (real generations)',
    order: 9,
    intro: `Three real generations through the real Generate button and the dev writer (Claude Code on this computer), run ${saved.at.slice(0, 16).replace('T', ' ')} on ${saved.machine}. Texts are in sample-inputs/. One run each, so this shows what happened, not how reliable it is. Each slide below is its own file.`,
    groups: [
      { title: 'The three runs', items },
      { title: 'What is weak (found by opening the slides)', items: findings.map((x, i) => ({ id: `f${i}`, title: x.title, tag: x.tag, images: [], facts: [x.note] })) },
    ],
  });
});
