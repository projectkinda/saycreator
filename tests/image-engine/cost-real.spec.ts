// REAL COST (skipped unless COST_RUN=1; started by `npm run cost:real`): the app's own path with the Anthropic Messages API ("api" provider, key in the untracked .env, read by
// the dev server only). Per reference (dark, light): the style is read ONCE (the reader), then 3 carousels are made from it (the writer). The server writes one line per API
// call to USAGE_LOG (model and token counts only); this spec writes a marker line before each phase so the script can total reader and writer apart.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.skip(!process.env.COST_RUN, 'real run only when COST_RUN=1 (npm run cost:real)');
test.setTimeout(90 * 60_000);
test.use({ viewport: { width: 1300, height: 1000 } });
const IMAGE = /\.(webp|jpe?g|png)$/i;
const OUT = path.resolve(process.cwd(), 'out/cost-real');

const RUNS = [
  {
    ref: 'dark',
    env: 'REF_DARK_DIR',
    handle: '@quick.flip',
    texts: [
      "Quick Flip is a Kickstarter project: a hoodie that flips into a backpack in 10 seconds. Slide the zip and bite the clasp, and the hoodie locks into a backpack. To flip it, zip the hood into the pocket, fold the sleeves behind you, then pull the straps and go. The shell is waterproof, it fits a 16-inch laptop, it is machine washable and it flips in 10 seconds. The team is raising $500,000 for 5% of the company and is open to 20 backers only. Early backers save 30%. One early backer said: \"I stopped carrying a bag the day this arrived.\"",
      'Most commuters carry a bag and wear a hoodie. Quick Flip is both. The hood zips into a pocket, the sleeves fold behind you and the straps pull out: ten seconds and the hoodie is a backpack. It fits a 16-inch laptop, the shell is waterproof and you can machine wash it. Backing opens on Kickstarter this month and early backers save 30%. Only 20 backers can join the raise of $500,000 for 5% of the company.',
      'Why we built Quick Flip. We were tired of choosing between a warm layer and a bag that fits a laptop, so we sewed the bag into the hood. We tested it for two years. Slide the zip, bite the clasp, and it locks. It flips in 10 seconds, stays waterproof and survives the washing machine. We are raising $500,000 for 5% of the company on Kickstarter, open to 20 backers. Early backers save 30%. Back Quick Flip today.',
    ],
  },
  {
    ref: 'light',
    env: 'REF_LIGHT_DIR',
    handle: '@harsh.parekh',
    texts: [
      'Accounts that fix their headline get about 3x more replies. Fix your profile in 15 minutes with three edits that make people stop scrolling and start replying. Step 1: rewrite your headline: skip the job title and say who you help and how. Step 2: lead with a result: open with one number or outcome, not a list of adjectives. Step 3: pin one proof post: feature your best post at the top, because people decide in seconds. Before you hit save, check that you have a clear, well-lit photo, a headline that names who you help, and current contact info. Save this and fix it tonight.',
      'Your profile is the first thing a client sees. Most profiles list a job title and a few adjectives, so nobody can tell who you help. Say who you help and how in the headline. Open with one number or outcome. Pin your best post at the top, because people decide in seconds. Use a clear, well-lit photo and keep your contact info current. Accounts that fix their headline get about 3x more replies, and the three edits take 15 minutes.',
      'Three profile mistakes that cost you replies. One: a headline that is only a job title. Two: a bio that opens with adjectives instead of a result. Three: no pinned proof post, so visitors scroll and leave. Fix them in 15 minutes: name who you help and how, lead with one number or outcome, and pin your best post at the top. Accounts that fix their headline get about 3x more replies. Save this and fix it tonight.',
    ],
  },
];

const mark = (ref: string, phase: 'read' | 'carousel', n?: number) => fs.appendFileSync(process.env.USAGE_LOG!, JSON.stringify({ marker: { ref, phase, ...(n ? { n } : {}) } }) + '\n');
const rowsOf = () => fs.readFileSync(process.env.USAGE_LOG!, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, any>);

test('real cost: reader once and 3 carousels per reference, with the API provider', async ({ page }) => {
  expect(process.env.USAGE_LOG, 'USAGE_LOG is set by npm run cost:real').toBeTruthy();
  fs.mkdirSync(OUT, { recursive: true });
  page.on('dialog', (d) => void d.accept());
  // the API provider must be on (the key is in the server's .env); the key itself is never read here
  for (const route of ['/api/carousel/status', '/api/reference/status']) {
    const j = (await (await page.request.get(route)).json()) as { available?: boolean; reason?: string };
    expect(j.available, `${route}: the API provider is off (${j.reason ?? 'no reason given'}). Put ANTHROPIC_API_KEY in the untracked .env and start again.`).toBe(true);
  }
  const apiReads: string[] = [];
  const apiWrites: string[] = [];
  const devCli: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'POST') return;
    if (r.url().includes('/api/reference/read')) apiReads.push(r.url());
    if (r.url().includes('/api/carousel/write')) apiWrites.push(r.url());
    if (/\/__(reference|carousel)\//.test(r.url())) devCli.push(r.url());
  });
  const proj = () => page.evaluate(() => {
    try {
      const d = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as { project?: { doc?: { designed?: { library?: { calls: number; tokens: { input: number; output: number } | null; layouts: string[]; seconds: number } } } } }).project?.doc?.designed?.library;
      return d ? JSON.stringify({ calls: d.calls, tokens: d.tokens, layouts: d.layouts, seconds: d.seconds }) : '';
    } catch {
      return '';
    }
  });
  const summary: unknown[] = [];
  await page.goto('/images/carousel');
  for (const run of RUNS) {
    const refDir = process.env[run.env];
    expect(refDir && fs.existsSync(refDir), `${run.env} is not set or the folder is missing`).toBeTruthy();
    const files = fs.readdirSync(refDir!).filter((f) => IMAGE.test(f)).sort().slice(0, 10).map((f) => path.join(refDir!, f));
    expect(files.length).toBeGreaterThanOrEqual(5);
    await page.reload();
    await page.getByRole('button', { name: /^New style/ }).click();
    await page.getByLabel('Choose reference images or a PDF').setInputFiles(files);
    await expect(page.getByTestId('quick-count')).toContainText(`${files.length} picture`, { timeout: 60_000 });
    mark(run.ref, 'read');
    const r0 = apiReads.length;
    await page.getByRole('button', { name: 'Read it' }).click();
    await Promise.race([page.getByTestId('quick-saved').waitFor({ timeout: 35 * 60_000 }), page.getByRole('alert').first().waitFor({ timeout: 35 * 60_000 })]);
    expect(await page.getByRole('alert').allInnerTexts().then((a) => a.filter((x) => !/would not save/.test(x))), `${run.ref}: the read ended without an alert`).toEqual([]);
    const readRequests = apiReads.length - r0;
    expect(readRequests, `${run.ref}: the reader was asked`).toBeGreaterThan(0);
    const handleField = page.getByLabel(/handle/i).first();
    for (const [k, text] of run.texts.entries()) {
      const n = k + 1;
      mark(run.ref, 'carousel', n);
      const w0 = apiWrites.length;
      const before = await proj();
      await page.getByLabel('Your text or topic').fill(text);
      if (await handleField.count()) await handleField.fill(run.handle).catch(() => undefined);
      await page.getByRole('button', { name: 'Make carousel', exact: true }).click();
      await expect.poll(async () => { const p = await proj(); return p !== '' && p !== before; }, { timeout: 15 * 60_000, intervals: [2000] }).toBe(true);
      await expect(page.locator('.cr-pic img')).toHaveCount(7, { timeout: 5 * 60_000 });
      await expect(page.locator('.cr-card').getByText(/^Phone check:/)).toHaveCount(7, { timeout: 180_000 });
      const lib = JSON.parse(await proj()) as { calls: number; tokens: { input: number; output: number } | null; layouts: string[] };
      const sheet = await page.locator('.cr-pic img').evaluateAll(async (els) => {
        const bmps = await Promise.all((els as HTMLImageElement[]).map(async (im) => createImageBitmap(await (await fetch(im.src)).blob())));
        const c = document.createElement('canvas');
        c.width = bmps.length * 210 + 10;
        c.height = 285;
        const g = c.getContext('2d')!;
        g.fillStyle = '#888';
        g.fillRect(0, 0, c.width, c.height);
        bmps.forEach((b, i) => g.drawImage(b, 10 + i * 210, 10, 200, 265));
        return c.toDataURL('image/png').split(',')[1];
      });
      fs.writeFileSync(path.join(OUT, `${run.ref}-${n}-sheet.png`), Buffer.from(sheet, 'base64'));
      summary.push({ ref: run.ref, n, writerRequests: apiWrites.length - w0, appCalls: lib.calls, appTokens: lib.tokens, layouts: lib.layouts });
    }
    summary.push({ ref: run.ref, readerRequests: readRequests });
  }
  expect(devCli, 'the dev-cli routes must not be used in a cost run').toEqual([]);
  // the log: reader and writer rows exist, and the app's own writer token count equals the API's for each carousel
  const rows = rowsOf();
  const api = rows.filter((r) => !r.marker);
  expect(api.filter((r) => r.route === 'reader').length, 'the log has reader calls (is USAGE_LOG on the server that served the page?)').toBeGreaterThan(0);
  expect(api.filter((r) => r.route === 'writer').length, 'the log has writer calls').toBeGreaterThan(0);
  let ctx: { ref: string; n?: number } | null = null;
  const perCarousel = new Map<string, { input: number; output: number }>();
  for (const r of rows) {
    if (r.marker) { ctx = r.marker; continue; }
    if (r.route !== 'writer' || !ctx?.n) continue;
    const k = `${ctx.ref}-${ctx.n}`;
    const t = perCarousel.get(k) ?? { input: 0, output: 0 };
    t.input += r.input;
    t.output += r.output;
    perCarousel.set(k, t);
  }
  for (const s of summary as { ref: string; n?: number; appTokens?: { input: number; output: number } | null }[]) {
    if (!s.n) continue;
    expect(s.appTokens, `${s.ref}-${s.n}: the app's report carries the API's token counts`).toEqual(perCarousel.get(`${s.ref}-${s.n}`));
  }
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(summary, null, 2));
});
