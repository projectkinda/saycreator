// Step 2. Runs the thumbnail composer and checker on the photos in test-images/ in real Chrome.
// Writes every option (including the ones that fail), phone-size copies, lint JSON and contact sheets.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrandInput, LintResult, Plan, RenderWarning, TextLayer, ThumbnailOption, ThumbnailRequest } from '../../src/image-engine/types';
import { validatePlan } from '../../src/image-engine/validate';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const IMAGES = path.join(ROOT, 'test-images');
const OUT = path.join(ROOT, 'out/image-engine/step2');

interface Case {
  file: string;
  title: string;
  aspects: ('16:9' | '9:16')[];
  note?: string;
}
const cases: Case[] = JSON.parse(fs.readFileSync(path.join(here, 'thumbnail-cases.json'), 'utf8'));
const present = cases.filter((c) => fs.existsSync(path.join(IMAGES, c.file)));

// Brand colours from the app's sample brand kit (the user's brand data, not the app's accent).
const brand: BrandInput = { primary: '#0F7B78', text: '#1A2226', background: '#F3F5F6', highlight: '#E8A33D', headlineFont: 'Schibsted Grotesk', bodyFont: 'Instrument Sans', handle: '@mayarao' };

type Option = { id: string; layout: string; plan: Plan; notes: string[]; lint: LintResult[]; renderWarnings: RenderWarning[]; png: string; phone: string };
type Checked = { ms: number; options: Option[] };

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const slug = (file: string) => file.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const url = (file: string) => '/test-images/' + encodeURIComponent(file);
const save = (rel: string, b64: string) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), Buffer.from(b64, 'base64'));
};

const summary: Record<string, unknown>[] = [];

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  expect(present.length, 'no test images found in test-images/').toBeGreaterThan(0);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
});
test.afterAll(() => {
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  const ids = ['words', 'readable', 'contrast', 'overlay', 'margins', 'resolution', 'crop', 'brightness', 'sharpness'];
  const rows = summary.map((r) => {
    const lint = r.lint as Record<string, boolean>;
    return `| ${r.image} | ${r.aspect} | ${r.layout} | ${ids.map((i) => (lint[i] ? 'ok' : '**FAIL**')).join(' | ')} |`;
  });
  fs.writeFileSync(path.join(OUT, 'summary.md'), ['| image | aspect | layout | ' + ids.join(' | ') + ' |', '|---|---|---|' + ids.map(() => '---').join('|') + '|', ...rows].join('\n'));
});

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

for (const c of present) {
  for (const aspect of c.aspects) {
    test(`${c.file} as ${aspect}: every option is drawn, phone-checked and saved`, async ({ page }) => {
      const info = await call<{ width: number; height: number }>(page, 'imageSize', url(c.file));
      const req: ThumbnailRequest = { source: { url: url(c.file), width: info.width, height: info.height }, title: c.title, aspect, brand };
      const r = await call<Checked>(page, 'checkThumb', req);
      const dir = `${slug(c.file)}/${aspect.replace(':', 'x')}`;
      expect(r.options.length).toBe(3);

      const [W, H] = aspect === '16:9' ? [1280, 720] : [1080, 1920];
      for (const o of r.options) {
        expect(validatePlan(o.plan), `${o.id} plan is valid`).toEqual([]);
        expect(o.plan.canvas).toMatchObject({ width: W, height: H });
        expect(o.lint.map((l) => l.id)).toEqual(['words', 'readable', 'contrast', 'overlay', 'margins', 'resolution', 'crop', 'brightness', 'sharpness']);
        for (const l of o.lint) expect(l.reason.length, `${o.id} ${l.id} has a plain reason`).toBeGreaterThan(10);
        save(`${dir}/${o.layout}.png`, o.png);
        save(`${dir}/${o.layout}-phone.png`, o.phone);
        fs.writeFileSync(path.join(OUT, dir, `${o.layout}.plan.json`), JSON.stringify(o.plan, null, 2));
        fs.writeFileSync(path.join(OUT, dir, `${o.layout}.lint.json`), JSON.stringify({ image: c.file, title: c.title, layout: o.layout, notes: o.notes, renderWarnings: o.renderWarnings, lint: o.lint }, null, 2));
        summary.push({ image: c.file, aspect, layout: o.layout, title: c.title, lint: Object.fromEntries(o.lint.map((l) => [l.id, l.pass])), failed: o.lint.filter((l) => !l.pass).map((l) => `${l.id}: ${l.reason}`), notes: o.notes, ms: r.ms });
      }

      const first = r.options[0].lint;
      const metric = (id: string) => first.find((l) => l.id === id)?.measured;
      const sheet = await call<string>(page, 'makeSheet', {
        sourceUrl: url(c.file),
        sourceLines: [`${c.file}`, `${info.width}x${info.height}px, title "${c.title}"`, `brightness ${metric('brightness')}, detail score ${metric('sharpness')}`, ...(c.note ? [c.note] : [])],
        tiles: r.options.map((o) => ({ title: o.layout, pass: o.lint.every((l) => l.pass), lines: [o.notes[0], ...o.lint.filter((l) => !l.pass).map((l) => `x ${l.reason}`)], b64: o.phone })),
      });
      save(`${slug(c.file)}-${aspect.replace(':', 'x')}-sheet.png`, sheet);
    });
  }
}

test('known hard cases are caught for the right reason', async () => {
  const find = (file: string, aspect = '16:9') => summary.filter((s) => s.image === file && s.aspect === aspect);
  const failsOn = (rows: Record<string, unknown>[], id: string) => rows.every((r) => (r.lint as Record<string, boolean>)[id] === false);
  const dark = find('wallpaperflare.com_wallpaper.jpg');
  if (dark.length) {
    expect(failsOn(dark, 'words')).toBe(true); // five-word title
    expect(failsOn(dark, 'brightness')).toBe(true); // very dark picture
  }
  // 736px-wide photo: stretched too far to fill the full width, fine for the narrower side panel.
  const small = find('GHWd3WIW0AICE11.jpg');
  if (small.length) {
    expect(small.filter((r) => r.layout !== 'panel').every((r) => (r.lint as Record<string, boolean>).resolution === false)).toBe(true);
    expect(small.find((r) => r.layout === 'panel')!.lint).toMatchObject({ resolution: true });
  }
});

test('a tall photo cropped wide loses the subject, and the crop check says so', async () => {
  const rows = summary.filter((r) => r.image === 'wp13065863-mahesh-babu-guntur-kaaram-wallpapers.jpg' && r.aspect === '16:9');
  if (!rows.length) return;
  const crop = (layout: string) => (rows.find((r) => r.layout === layout)!.lint as Record<string, boolean>).crop;
  expect(crop('plate')).toBe(false); // full-width crop of a 1807x2560 photo keeps about 40%
  expect(crop('outline')).toBe(false);
  expect(crop('panel')).toBe(true); // the narrower picture area keeps more
});

test('each check can fail on its own, for the right reason', async ({ page }) => {
  const c = present.find((x) => x.file === 'wp13337965-guntur-kaaram-wallpapers.jpg') ?? present[0];
  const info = await call<{ width: number; height: number }>(page, 'imageSize', url(c.file));
  const req: ThumbnailRequest = { source: { url: url(c.file), width: info.width, height: info.height }, title: 'Calm Before The Storm', aspect: '16:9', brand };
  const base = (await call<Checked>(page, 'checkThumb', { ...req, layouts: ['outline'] })).options[0];
  const baseOption: ThumbnailOption = { id: 'base', layout: 'outline', plan: base.plan, titleLayerId: 'title', photoLayerId: 'photo', notes: [] };
  expect(base.lint.filter((l) => !l.pass).map((l) => l.id), 'the unmodified option passes everything').toEqual([]);

  const mutate = (fn: (title: TextLayer, plan: Plan) => void): ThumbnailOption => {
    const plan = structuredClone(base.plan);
    plan.layers = plan.layers.filter((l) => !l.id.startsWith('scrim')); // bare picture behind the words
    fn(plan.layers.find((l) => l.id === 'title') as TextLayer, plan);
    return { ...baseOption, plan };
  };
  const run = async (name: string, opt: ThumbnailOption) => {
    const r = await call<{ lint: LintResult[]; phone: string }>(page, 'checkCustom', req, opt);
    save(`bad-variants/${name}-phone.png`, r.phone);
    fs.writeFileSync(path.join(OUT, 'bad-variants', `${name}.lint.json`), JSON.stringify(r.lint, null, 2));
    return r.lint;
  };
  fs.mkdirSync(path.join(OUT, 'bad-variants'), { recursive: true });
  const failing = (l: LintResult[]) => l.filter((x) => !x.pass).map((x) => x.id);

  const low = await run('low-contrast', mutate((t) => { t.style.stroke = undefined; t.style.shadow = undefined; t.style.color = '#C9B8A8'; }));
  expect(failing(low)).toContain('contrast');
  expect(failing(low)).not.toContain('words');
  expect(low.find((l) => l.id === 'contrast')!.reason).toMatch(/reaches 4[.]5:1/);

  const tiny = await run('too-small', mutate((t) => { t.style.size = 40; t.style.stroke = { color: '#0B0F12', width: 4 }; }));
  expect(failing(tiny)).toContain('readable');
  expect(tiny.find((l) => l.id === 'readable')!.reason).toMatch(/only [0-9]+px tall/);

  const corner = await run('under-duration-badge', mutate((t) => { Object.assign(t, { x: 640, y: 540, width: 600, height: 140 }); t.style.align = 'right'; t.style.size = 60; t.style.stroke = { color: '#0B0F12', width: 6 }; }));
  expect(failing(corner)).toContain('overlay');
  expect(corner.find((l) => l.id === 'overlay')!.reason).toMatch(/video length badge/);

  const edge = await run('against-the-edge', mutate((t) => { t.x = 3; }));
  expect(failing(edge)).toContain('margins');
  expect(edge.find((l) => l.id === 'margins')!.reason).toMatch(/from the left edge/);

  const long = await run('six-words', mutate((t) => { t.text = 'CALM BEFORE THE STORM IS HERE'; }));
  expect(failing(long)).toContain('words');
  expect(long.find((l) => l.id === 'words')!.reason).toMatch(/6 words/);
});
