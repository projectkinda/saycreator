// Step 13: the new thumbnail checks each shown failing on a deliberately bad variant, the style block's validation, which options exist
// and why, the subject pointer, and edits as patches. Runs after thumbnails-v2.spec.ts (which clears the output folder).
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { LintResult, Plan } from '../../src/image-engine/types';
import { NEW_CHECKS, OUT, STYLES, call, run, save, url, type RunOption } from './thumbnails-v2-helpers';

const RIDER = 'GCKR3575.JPG';
const BAD = 'bad-variants';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/image-engine/harness/index.html');
  await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
});

type Opt = { plan: Plan; subjects: { x: number; y: number; r: number; of: string }[] };

test('each new check fails on a deliberately bad variant, for the right reason, and passes on the good one', async ({ page }) => {
  test.setTimeout(120_000);
  const r = await run(page, { style: 'hot-flat', photoUrl: url(RIDER), title: 'Ride Before Sunrise', aspect: '16:9', layouts: ['title-over-photo'] });
  const good = r.options[0];
  expect(good.lint.filter((l) => NEW_CHECKS.includes(l.id) && !l.pass), 'the good variant passes the new checks').toEqual([]);
  save(`${BAD}/good.png`, good.png);
  fs.writeFileSync(path.join(OUT, BAD, 'good.json'), JSON.stringify({ lint: good.lint }, null, 2));
  const pictures = { photo: url(RIDER) };
  const checkBad = async (name: string, edit: (o: Opt) => Opt) => {
    const bad = edit(structuredClone(good.option as Opt));
    const [res] = await call<{ id: string; lint: LintResult[]; png: string }[]>(page, 'thumbV2Check', [bad], pictures);
    save(`${BAD}/${name}.png`, res.png);
    fs.writeFileSync(path.join(OUT, BAD, `${name}.json`), JSON.stringify({ lint: res.lint }, null, 2));
    return res.lint;
  };

  // 1. The title moved onto the subject pointer.
  const onSubject = await checkBad('title-on-subject', (o) => {
    const s = o.subjects[0];
    const t = o.plan.layers.find((l) => l.id === 'title')!;
    t.x = Math.round(s.x - t.width / 2);
    t.y = Math.round(s.y - 40);
    return o;
  });
  const subj = onSubject.find((l) => l.id === 'subject')!;
  expect(subj.pass).toBe(false);
  expect(subj.reason).toContain('The title runs over the point marked as the subject');

  // 2. An object (a picture the person added) dropped on the title.
  const covers = await checkBad('object-covers-title', (o) => {
    const t = o.plan.layers.find((l) => l.id === 'title')!;
    const photo = o.plan.layers.find((l) => l.id === 'photo') as { src: string };
    o.plan.layers.push({ id: 'object', name: 'Object', kind: 'image', role: 'decor', x: t.x, y: t.y, width: 260, height: 260, rotation: 0, opacity: 1, src: photo.src, fit: 'contain' } as never);
    return o;
  });
  const ov = covers.find((l) => l.id === 'overlap')!;
  expect(ov.pass).toBe(false);
  expect(ov.reason).toContain('object covers part of the title');

  // 3. The crop puts the subject at the very edge of its picture.
  const atEdge = await checkBad('subject-at-edge', (o) => {
    o.subjects[0] = { ...o.subjects[0], x: 6, y: 360 };
    return o;
  });
  const fo = atEdge.find((l) => l.id === 'focal')!;
  expect(fo.pass).toBe(false);
  expect(fo.reason).toContain('sits at the very edge of its picture');
});

test('letters that lose their shape fail "Letters keep their shape": the film look with lime letters over a lime box on tight lines, where the tail of the Q sinks into the box', async ({ page }) => {
  test.setTimeout(120_000);
  const photo = 'GHWd3WIW0AICE11.jpg';
  const r = await run(page, { style: 'film-paper', photoUrl: url(photo), title: 'The Quiet Genius', subject: { x: 0.5, y: 0.34 }, aspect: '16:9', layouts: ['face-left-title-right'] });
  const good = r.options[0];
  const legible = (l: LintResult[]) => l.find((x) => x.id === 'legible')!;
  expect(legible(good.lint).pass, 'the stored film look keeps every letter whole').toBe(true);
  save(`${BAD}/legible-good.png`, good.png);
  const bad = structuredClone(good.option) as { plan: Plan };
  const t = bad.plan.layers.find((l) => l.id === 'title') as { style: { lineHeight: number; color: string }; highlight: { color: string } };
  // The old look: lines set tight, letters the same lime as the box behind the next line.
  t.style.lineHeight = 1.0;
  t.style.color = t.highlight.color;
  const [res] = await call<{ lint: LintResult[]; png: string }[]>(page, 'thumbV2Check', [bad], { photo: url(photo) });
  save(`${BAD}/letters-lose-shape.png`, res.png);
  fs.writeFileSync(path.join(OUT, BAD, 'letters-lose-shape.json'), JSON.stringify({ lint: res.lint }, null, 2));
  fs.writeFileSync(path.join(OUT, BAD, 'legible-good.json'), JSON.stringify({ lint: good.lint }, null, 2));
  const l = legible(res.lint);
  expect(l.pass).toBe(false);
  expect(l.reason).toContain('A letter in “QUIET” runs into something of its own colour');
  expect(l.reason).toContain('like the tail of a Q');
});

test('the thumbnail block of a style file is validated, and every rejection is a sentence a person can act on', async ({ page }) => {
  const list = await call<{ styles: { spec: Record<string, unknown> }[]; problems: unknown[] }>(page, 'styleList');
  expect(list.problems, 'no stored style is rejected').toEqual([]);
  const withBlock = list.styles.filter((s) => s.spec.thumbnail);
  expect(withBlock.map((s) => s.spec.name as string).sort()).toEqual([...STYLES].sort());
  const base = structuredClone(list.styles.find((s) => s.spec.name === 'hot-flat')!.spec);
  const errorsFor = async (edit: (t: Record<string, unknown>, s: Record<string, unknown>) => void) => {
    const s = structuredClone(base);
    edit(s.thumbnail as Record<string, unknown>, s);
    return (await call<{ errors: string[] }>(page, 'styleValidate', s, 'hot-flat')).errors.join(' ');
  };
  expect(await errorsFor(() => undefined)).toBe('');
  expect(await errorsFor((t) => (t.palette = 'neon'))).toContain('thumbnail.palette is "neon", which is not in "palettes"');
  expect(await errorsFor((t) => (t.layouts = ['title-over-photo', 'split-colour']))).toContain('thumbnail.layouts must list 3 or more different layouts');
  expect(await errorsFor((t) => (t.layouts = ['title-over-photo', 'split-colour', 'carousel']))).toContain('thumbnail.layouts must list 3 or more different layouts');
  expect(await errorsFor((t) => ((t.title as Record<string, unknown>).look = 'neon-glow'))).toContain('thumbnail.title.look is "neon-glow"');
  expect(await errorsFor((t) => delete (t.title as Record<string, unknown>).ground)).toContain('needs "ground"');
  expect(await errorsFor((t) => ((t.title as Record<string, unknown>).colour = 'purple'))).toContain('thumbnail.title.colour is "purple", which is not a palette colour name');
  expect(await errorsFor((t) => ((t.title as Record<string, unknown>).weight = 450))).toContain('is bundled only in weights');
  expect(await errorsFor((t) => (t.scrim = 'black'))).toContain('thumbnail.scrim must be a colour');
  expect(await errorsFor((t) => (t.treatment = [{ op: 'blur', radius: 9999 }]))).toContain('thumbnail.treatment[0]');
  expect(await errorsFor((t, s) => { t.elements = true; delete s.elements; })).toContain('the style has no "elements" to place');
  expect(await errorsFor((t) => (t.field = true))).toContain('the style has no photo.field to use');
});

test('a layout that needs something the person did not give is left out; the number badge never makes up a number', async ({ page }) => {
  test.setTimeout(120_000);
  const layouts = async (args: Record<string, unknown>) => (await run(page, { photoUrl: url(RIDER), aspect: '16:9', ...args })).options.map((o) => o.layout);
  expect(await layouts({ style: 'hot-flat', title: 'Ride Before Sunrise' })).toEqual(['title-over-photo', 'face-left-title-right', 'split-colour']);
  const withNumber = await run(page, { photoUrl: url(RIDER), aspect: '16:9', style: 'hot-flat', title: '3 Rides Before Sunrise' });
  const badge = withNumber.options.find((o) => o.layout === 'number-badge')!;
  expect(badge).toBeTruthy();
  const words = badge.plan.layers.filter((l) => l.kind === 'text').map((l) => (l as { text: string }).text);
  expect(words).toContain('3');
  expect(words.join(' ')).not.toMatch(/\b[0-24-9]\b/);
  const objectUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 400;
    const g = c.getContext('2d')!;
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.arc(200, 200, 150, 0, Math.PI * 2);
    g.fill();
    return c.toDataURL('image/png');
  });
  expect(await layouts({ style: 'object-neon', title: 'Ride Before Sunrise', objectUrl })).toContain('object-title');
  expect(await layouts({ style: 'mono-poster', title: 'Ride Before Sunrise' })).not.toContain('before-after');
  expect(await layouts({ style: 'mono-poster', title: 'Ride Before Sunrise', secondUrl: url('GHWd3WIW0AICE11.jpg') })).toContain('before-after');
});

test('moving the subject pointer moves the crop, and the title goes to the other side and keeps off it', async ({ page }) => {
  test.setTimeout(120_000);
  const photoUrl = url('wp13337965-guntur-kaaram-wallpapers.jpg');
  const args = { style: 'mono-poster', photoUrl, title: 'Calm Before Storm', aspect: '16:9', layouts: ['face-left-title-right'] };
  const left = await run(page, { ...args, subject: { x: 0.2, y: 0.45 } });
  const right = await run(page, { ...args, subject: { x: 0.85, y: 0.45 } });
  const subjectX = (o: RunOption) => o.subjects[0].x;
  expect(subjectX(left.options[0])).toBeLessThan(subjectX(right.options[0]));
  for (const r of [left, right]) expect(r.options[0].lint.find((l) => l.id === 'subject')!.pass).toBe(true);
  const titleX = (o: RunOption) => (o.plan.layers.find((l) => l.id === 'title') as { x: number }).x;
  expect(titleX(left.options[0])).toBeGreaterThan(titleX(right.options[0]));
  save('subject/left.png', left.options[0].png);
  save('subject/right.png', right.options[0].png);
});

test('an option is a plan: a patch changes the title, and undo and redo bring it back', async ({ page }) => {
  const r = await run(page, { style: 'hot-flat', photoUrl: url(RIDER), title: 'Ride Before Sunrise', aspect: '16:9', layouts: ['split-colour'] });
  const plan = r.options[0].plan;
  const first = await call<{ ok: boolean; reasons?: string[] }>(page, 'patchPlan', plan, { baseRevision: plan.revision, label: 'Shorter title', ops: [{ op: 'set', id: 'title', path: 'text', value: 'EARLY SUNRISE' }] });
  expect(first.reasons ?? [], 'the patch is accepted').toEqual([]);
  const res = await call<{ ok: (boolean | undefined)[]; planAfterUndoEqualsBefore: boolean }>(page, 'patchCycle', plan, { baseRevision: plan.revision, label: 'Shorter title', ops: [{ op: 'set', id: 'title', path: 'text', value: 'EARLY SUNRISE' }] });
  expect(res.ok).toEqual([true, true, true]);
  expect(res.planAfterUndoEqualsBefore).toBe(true);
});
