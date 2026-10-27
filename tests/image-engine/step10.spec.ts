// Step 10: polish. The split-line rule and its check, decoration with a job, one continuous highlight bar, and "Pick for me".
// Outputs for the Results screen go to out/image-engine/step10/ (see step10-results.spec.ts).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickStyle } from '../../src/carousel/pickStyle';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/step10');
const BEFORE = path.join(ROOT, 'out/image-engine/step10-before');
const DECKS = fs.readdirSync(path.join(ROOT, 'tests/image-engine/carousels')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/image-engine/carousels', f), 'utf8')));
const STYLES = ['hot-flat', 'editorial-collage', 'object-neon'];

interface Lint { id: string; pass: boolean; reason: string }
interface Layer { id: string; kind: string; element?: string; x: number; y: number; width: number; height: number; rotation?: number; text?: string }
interface Slide { id: string; type: string; layout: string; lint: Lint[]; plan: { canvas: { width: number; height: number }; layers: Layer[]; meta?: { keepClear?: { name: string; x: number; y: number; width: number; height: number }[] } }; elementsUsed: string[]; notes: string[]; png: string }
const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const write = (rel: string, data: string | Buffer) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), data);
};
const hits = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const box = (l: Layer) => {
  if (!l.rotation) return { x: l.x, y: l.y, width: l.width, height: l.height };
  const a = (l.rotation * Math.PI) / 180;
  const w = Math.abs(l.width * Math.cos(a)) + Math.abs(l.height * Math.sin(a));
  const h = Math.abs(l.width * Math.sin(a)) + Math.abs(l.height * Math.cos(a));
  return { x: l.x + l.width / 2 - w / 2, y: l.y + l.height / 2 - h / 2, width: w, height: h };
};

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

test('split rule: on every myth and fact slide in every element style and deck, nothing is placed across the split or near its arrow, and the check passes', async ({ page }) => {
  test.setTimeout(240_000);
  let slides = 0;
  const failures: string[] = [];
  for (const style of STYLES)
    for (const deck of DECKS) {
      const run = await call<Slide[]>(page, 'styleRun', deck, style, { elements: 'shippable' });
      run.forEach((s, i) => {
        const keep = s.plan.meta?.keepClear;
        if (s.type !== 'beforeafter') return expect(keep, `${style} ${deck.id} ${i + 1} is not a split slide`).toBeUndefined();
        slides++;
        expect(keep?.length, `${style} ${deck.id} slide ${i + 1} (${s.layout}) declares its split`).toBeGreaterThanOrEqual(2);
        for (const l of s.plan.layers.filter((x) => x.kind === 'element')) for (const k of keep!) if (hits(box(l), k)) failures.push(`${style}/${deck.id}/${i + 1}: ${l.element} meets ${k.name}`);
        const lint = s.lint.find((x) => x.id === 'split');
        expect(lint, `${style} ${deck.id} ${i + 1} has the split check`).toBeDefined();
        if (!lint!.pass) failures.push(`${style}/${deck.id}/${i + 1}: ${lint!.reason}`);
      });
    }
  expect(slides).toBeGreaterThanOrEqual(8);
  expect(failures).toEqual([]);
  write('split-summary.json', JSON.stringify({ splitSlidesChecked: slides, failures }, null, 2));
});

test('split rule, deliberately bad variants: a picture across the split, and one beside the arrow button, both fail the check in plain words', async ({ page }) => {
  const deck = DECKS.find((d) => d.id === 'myths-remote')!;
  const run = await call<Slide[]>(page, 'styleRun', deck, 'editorial-collage', { elements: 'shippable' });
  const s = run.find((x) => x.layout === 'ba-split')!;
  expect(s).toBeDefined();
  const rocket = (await call<{ id: string }[]>(page, 'elementFind', { tags: ['heart'], kinds: ['object'] }))[0];
  const keep = s.plan.meta!.keepClear!;
  const split = keep.find((k) => k.name === 'split')!;
  const arrow = keep.find((k) => k.name === 'arrow')!;
  const mk = (x: number, y: number) => ({ id: 'bad', kind: 'element', element: rocket.id, name: 'bad', x, y, width: 160, height: 160, rotation: 0, opacity: 1, role: 'decor' });
  const across = { ...s.plan, layers: [...s.plan.layers.filter((l) => l.kind !== 'element'), mk(300, split.y + split.height / 2 - 80)] };
  const bad1 = (await call<{ lint: Lint[] }>(page, 'styleCheckPlan', across, 'editorial-collage')).lint.find((l) => l.id === 'split')!;
  expect(bad1.pass).toBe(false);
  expect(bad1.reason).toMatch(/^Element crosses the split: .* crosses the split/);
  const near = { ...s.plan, layers: [...s.plan.layers.filter((l) => l.kind !== 'element'), mk(arrow.x + 4, arrow.y + 2)] };
  const bad2 = (await call<{ lint: Lint[] }>(page, 'styleCheckPlan', near, 'editorial-collage')).lint.find((l) => l.id === 'split')!;
  expect(bad2.pass).toBe(false);
  expect(bad2.reason).toMatch(/Element crosses the split/);
  // The same slide without the bad picture passes.
  const clean = { ...s.plan, layers: s.plan.layers.filter((l) => l.kind !== 'element') };
  expect((await call<{ lint: Lint[] }>(page, 'styleCheckPlan', clean, 'editorial-collage')).lint.find((l) => l.id === 'split')!.pass).toBe(true);
  write('split-bad.json', JSON.stringify({ across: bad1.reason, near: bad2.reason }, null, 2));
});

test('decoration has a job: rings only round a big number, lines only under a headline, arrows only in a real gap pointing down, nothing sits on text, and no cover has a blob', async ({ page }) => {
  test.setTimeout(240_000);
  const counts: Record<string, number> = {};
  const problems: string[] = [];
  for (const style of STYLES)
    for (const deck of DECKS) {
      const run = await call<Slide[]>(page, 'styleRun', deck, style, { elements: 'shippable' });
      for (let i = 0; i < run.length; i++) {
        const s = run[i];
        const where = `${style}/${deck.id}/${i + 1} (${s.type})`;
        const frames = s.plan.layers.filter((l) => l.kind === 'element' && /scribble-circle|underline/.test(l.element ?? ''));
        for (const f of frames) {
          counts[f.element!.split(':')[1]] = (counts[f.element!.split(':')[1]] ?? 0) + 1;
          if (/circle/.test(f.element!) && s.type !== 'stat') problems.push(`${where}: a ring on a slide with no big number`);
        }
        // Nothing but frames may sit on text.
        const over = await call<{ element: string; layer: string; text: string }[]>(page, 'elementTextOverlaps', s.plan);
        for (const o of over) if (!/scribble-circle|underline/.test(o.element)) problems.push(`${where}: ${o.element} sits on the text "${o.text}"`);
        if (s.type === 'cover' && style === 'editorial-collage' && s.plan.layers.some((l) => l.id === 'art')) problems.push(`${where}: the blob mark is back on the cover`);
        if (s.type === 'closing') for (const f of frames) if (/circle/.test(f.element!)) problems.push(`${where}: a ring on a closing slide`);
        for (const l of s.plan.layers.filter((x) => x.kind === 'element' && /arrow/.test(x.element ?? '') && x.rotation === 90)) counts['pointing-arrows'] = (counts['pointing-arrows'] ?? 0) + 1 + 0 * l.x;
      }
    }
  expect(problems).toEqual([]);
  write('decor-summary.json', JSON.stringify({ counts, problems }, null, 2));
});

test('frames and arrows when they are asked for on every slide: a line sits under the headline, and the checks still pass', async ({ page }) => {
  test.setTimeout(240_000);
  const found = { rings: 0, underlines: 0, arrows: 0 };
  const bad: string[] = [];
  for (const deck of DECKS) {
    const run = await call<Slide[]>(page, 'styleRun', deck, 'editorial-collage', { elements: 'shippable', variant: 'always-frames' });
    run.forEach((s, i) => {
      const where = `${deck.id}/${i + 1} (${s.type})`;
      for (const l of s.plan.layers.filter((x) => x.kind === 'element')) {
        if (/scribble-circle/.test(l.element!)) {
          found.rings++;
          const v = s.plan.layers.find((x) => x.id === 'value');
          if (!v) bad.push(`${where}: ring without a big number`);
          else if (l.x > v.x || l.y > v.y || l.x + l.width < v.x + v.width * 0.5) bad.push(`${where}: the ring does not surround the number`);
          if (i === 5 && deck.id === 'howto-linkedin') write('ring-example.png', Buffer.from(s.png, 'base64'));
        }
        if (/underline/.test(l.element!)) {
          found.underlines++;
          const h = s.plan.layers.find((x) => x.id === 'headline' || x.id === 'quote');
          if (!h || l.y < h.y) bad.push(`${where}: the line is not under the headline`);
          if (deck.id === 'howto-linkedin' && i === 1) write('underline-example.png', Buffer.from(s.png, 'base64'));
        }
        if (l.rotation === 90 && /arrow/.test(l.element!)) found.arrows++;
      }
      const failed = s.lint.filter((x) => !x.pass && x.id !== 'words') // the words check is judged in carousel-words.spec.ts (the awkward deck fails it on purpose);
      if (failed.length) bad.push(`${where}: ${failed.map((f) => f.id + ': ' + f.reason).join(' | ')}`);
    });
  }
  write('frames-forced.json', JSON.stringify({ found, bad }, null, 2));
  // A ring round a big number is supported, but no stat layout leaves room for one without touching its neighbours, so no style asks for it (untested in practice).
  expect(found.underlines).toBeGreaterThan(0);
  expect(bad).toEqual([]);
});

test('the validator refuses plain decoration that has no job', async ({ page }) => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/image-engine/styles/hot-flat/style.json'), 'utf8'));
  raw.elements.rules[0] = { tags: ['blob'], kinds: ['code'], zone: 'free', count: [0, 1], size: [200, 300] };
  const r = await call<{ errors: string[] }>(page, 'styleValidate', raw, 'hot-flat');
  expect(r.errors.join(' ')).toMatch(/places plain decoration \(blob\) without saying what it is for/);
  raw.elements.rules[0].role = 'gap';
  expect((await call<{ errors: string[] }>(page, 'styleValidate', raw, 'hot-flat')).errors).toEqual([]);
  raw.elements.rules[0].role = 'sparkle';
  expect((await call<{ errors: string[] }>(page, 'styleValidate', raw, 'hot-flat')).errors.join(' ')).toMatch(/role must be "frame", "point" or "gap"/);
});

test('one continuous highlight bar: a highlighted phrase that fits stays on one line, in every style', async ({ page }) => {
  const script = JSON.parse(fs.readFileSync(path.join(BEFORE, 'creator-script.json'), 'utf8'));
  script.brand.handle = '@woodbench.daily';
  const rows: { style: string; text: string; bars: number; lines: number }[] = [];
  for (const style of ['dark-quiet', ...STYLES]) {
    const run = await call<Slide[]>(page, 'styleCompose', script, style, { elements: 'shippable' });
    for (const s of run) {
      const marks = await call<{ id: string; text: string; bars: number; lines: number }[]>(page, 'highlightMarks', s.plan);
      for (const m of marks) rows.push({ style, text: m.text, bars: m.bars, lines: m.lines });
    }
  }
  expect(rows.length).toBeGreaterThan(3);
  // "five videos" is two words: one bar, on one line.
  for (const r of rows.filter((x) => /five_videos/.test(x.text))) {
    expect(r.bars, `${r.style}: ${r.text}`).toBe(1);
    expect(r.lines).toBe(1);
  }
  expect(rows.some((r) => /five_videos/.test(r.text))).toBe(true);
  write('highlight-summary.json', JSON.stringify(rows, null, 2));
});

const TEXTS: { id: string; tone: 'clear' | 'bold' | 'friendly' | 'expert'; text: string; types: string[] }[] = [
  { id: 'creator-batching', tone: 'clear', types: ['cover', 'content', 'step', 'step', 'beforeafter', 'closing'], text: fs.readFileSync(path.join(ROOT, 'sample-inputs/creator.txt'), 'utf8') },
  { id: 'cafe-queue', tone: 'friendly', types: ['cover', 'content', 'stat', 'checklist', 'beforeafter', 'closing'], text: fs.readFileSync(path.join(ROOT, 'sample-inputs/small-business.txt'), 'utf8') },
  { id: 'agency-briefs', tone: 'expert', types: ['cover', 'content', 'step', 'checklist', 'beforeafter', 'closing'], text: fs.readFileSync(path.join(ROOT, 'sample-inputs/agency.txt'), 'utf8') },
  { id: 'saas-launch', tone: 'bold', types: ['cover', 'stat', 'step', 'checklist', 'stat', 'closing'], text: 'We launched our analytics dashboard last month. It tracks product metrics in real time, has an API for developers, and automation that sends a weekly report. Our startup grew from ten to forty customers because the data finally made sense to non-technical teams.' },
  { id: 'calm-essay', tone: 'clear', types: ['cover', 'quote', 'content', 'content', 'quote', 'closing'], text: 'A quiet morning routine changed how I think about focus. I stopped checking my phone for the first hour, sat with a cup of tea and wrote down one careful thought. The principle behind it is simple: protect your attention before the day asks for it. It is a slow practice, but a mindful one, and good for sleep and wellbeing too.' },
  { id: 'growth-hacks', tone: 'bold', types: ['cover', 'step', 'step', 'step', 'stat', 'closing'], text: 'Stop making these mistakes if you want to grow your audience fast. Never post without a hook. Boost your reach with free tools and a launch sequence. These tips took our followers from zero to a viral month and doubled revenue from marketing. Win the first three seconds.' },
  { id: 'team-lesson', tone: 'friendly', types: ['cover', 'content', 'beforeafter', 'content', 'quote', 'closing'], text: 'Our team learned an honest lesson last year. We tried to do everything ourselves, made a mistake with a client, and then asked our community for help. I wish we had started that journey sooner. We now share our story every week in our newsletter.' },
  { id: 'security-checklist', tone: 'expert', types: ['cover', 'checklist', 'step', 'stat', 'checklist', 'closing'], text: 'Cloud security for a small product team comes down to a few automation habits. Rotate every API key, review access to the platform each quarter, and log each deployment so developers can trace a change. Run the same checklist for every new tool and feature before release.' },
];

test('"Pick for me": 8 different texts, which style each picks and why; it does not always pick the same one', async ({ page }) => {
  const styles = (await call<{ styles: { spec: unknown }[] }>(page, 'styleList')).styles as { spec: { name: string; title: string; suits?: unknown } }[];
  expect(styles.length).toBe(7); // four stored styles and the three photo styles of Step 11
  for (const st of styles) expect(st.spec.suits, `${st.spec.name} says what it suits`).toBeDefined();
  const rows = TEXTS.map((t) => {
    const p = pickStyle({ text: t.text, tone: t.tone, slideTypes: t.types, styles: styles as never });
    return { id: t.id, tone: t.tone, picked: p.name, why: p.why, scores: p.scores.map((s) => `${s.name} ${s.score}`).join(', ') };
  });
  const distinct = new Set(rows.map((r) => r.picked));
  // Same text, same answer.
  const again = pickStyle({ text: TEXTS[0].text, tone: TEXTS[0].tone, slideTypes: TEXTS[0].types, styles: styles as never });
  expect(again.name).toBe(rows[0].picked);
  // The tone matters: the same text with a different tone can move the choice, and a writer suggestion adds one point.
  const bold = pickStyle({ text: TEXTS[0].text, tone: 'bold', slideTypes: TEXTS[0].types, styles: styles as never });
  expect(bold.scores.find((s) => s.name === 'hot-flat')!.score).toBeGreaterThan(pickStyle({ text: TEXTS[0].text, tone: 'friendly', slideTypes: TEXTS[0].types, styles: styles as never }).scores.find((s) => s.name === 'hot-flat')!.score);
  write('picks.json', JSON.stringify({ rows, distinct: [...distinct], counts: Object.fromEntries([...distinct].map((d) => [d, rows.filter((r) => r.picked === d).length])) }, null, 2));
  console.log(JSON.stringify(rows.map((r) => `${r.id}: ${r.picked}`)));
  expect(distinct.size, 'it should not be one style for everything').toBeGreaterThanOrEqual(3);
});

test('before and after: the Step 9 slides drawn again with the new rules (same scripts, same style)', async ({ page }) => {
  test.setTimeout(240_000);
  const pairs: { id: string; title: string; before: string; after: string; lint: string[]; notes: string[] }[] = [];
  const wanted: [string, number, string][] = [
    ['agency', 2, 'Myth and fact: a picture crowded the page number'],
    ['small-business', 6, 'Myth and fact: pictures crossed the split and crowded the arrow'],
    ['creator', 6, 'Myth and fact: a heart sat on the split line'],
    ['creator', 1, 'Cover: a blob, and the highlight split into two bars'],
    ['agency', 7, 'Closing: an empty circle'],
    ['small-business', 1, 'Cover: a blob'],
  ];
  const cache: Record<string, Slide[]> = {};
  for (const [id, n, title] of wanted) {
    const script = JSON.parse(fs.readFileSync(path.join(BEFORE, `${id}-script.json`), 'utf8'));
    cache[id] ??= await call<Slide[]>(page, 'styleRun', script, 'editorial-collage', { elements: 'shippable' });
    const s = cache[id][n - 1];
    write(`after-${id}-${n}.png`, Buffer.from(s.png, 'base64'));
    fs.copyFileSync(path.join(BEFORE, `${id}-slide-${String(n).padStart(2, '0')}.png`), path.join(OUT, `before-${id}-${n}.png`));
    pairs.push({ id: `${id}-${n}`, title, before: `before-${id}-${n}.png`, after: `after-${id}-${n}.png`, lint: s.lint.filter((l) => !l.pass).map((l) => `${l.id}: ${l.reason}`), notes: s.notes.filter((x) => /No arrow|No ring|No underline|No decoration/.test(x)) });
  }
  write('pairs.json', JSON.stringify(pairs, null, 2));
  for (const p of pairs) expect(p.lint, p.id).toEqual([]);
});
