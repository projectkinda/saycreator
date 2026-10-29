// Step 14g: the holistic read. The parsing, the snapping to measured boxes, the dropping of noise, the APPROX layers and the relationships are tested
// on a made-up detection and a made-up answer. No reader, no model.
import { expect, test } from '@playwright/test';

test('a scene answer is validated, snapped to the measured boxes, noise dropped, relationships enforced', async ({ page }) => {
  await page.goto('/images/styles/new');
  const r = await page.evaluate(async () => {
    const S = await import('/src/reference/scene.ts');
    const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
    const t = (id: string, b: ReturnType<typeof box>) => ({ id, box: b, lines: [{}], align: 'left', colour: '#111', fontPx: 60, weight: 700, treatments: [], caps: false });
    const d = {
      texts: [t('text1', box(8, 10, 60, 12)), t('text2', box(9.5, 40, 50, 6)), t('text3', box(30, 95, 3, 0.8))],
      photos: [{ id: 'photo1', box: box(5, 55, 90, 35), shape: 'rect' }],
      shapes: [],
      graphics: [{ id: 'graphic1', box: box(80, 5, 10, 8), colour: '#f00', kind: 'mark' }],
    } as never;
    const answer = {
      scenes: [{
        ref: 1, slide_type: 'cover',
        layers: [
          { id: 'L1', type: 'photo', box: box(6, 54, 88, 36), confidence: 0.9 },
          { id: 'L2', type: 'text', role: 'title', box: box(7, 9, 62, 13), confidence: 0.9, treatment: 'capitals' },
          { id: 'L3', type: 'text', role: 'subtitle', box: box(8, 41, 50, 6), confidence: 0.8 },
          { id: 'L4', type: 'text', role: 'label', box: box(60, 70, 20, 4), confidence: 0.4 },
          { id: 'L5', type: 'graphic', graphic: 'asterisk', box: box(79, 6, 10, 8), confidence: 0.8 },
          { id: 'BAD', type: 'blob', box: box(1, 1, 1, 1), confidence: 1 },
        ],
        relationships: { shared_edges: [{ edge: 'left', layers: ['L2', 'L3'] }], reading_order: ['L2', 'L3'], hierarchy: ['L2', 'L3'], focal: 'L2' },
        canvas: { background: 'flat', margins: 8 },
      }],
      deck: { margins: 8, repeated_marks: ['asterisk'], varies: ['photo'] },
      images_with_photos: ['ref1.jpg'], missing: [], notes: 'x',
    };
    const p = S.parseScene(JSON.stringify(answer), [{ text: ['r1T1', 'r1T2', 'r1T3'], graphic: ['r1G1'] }]);
    if (!p.ok || !p.answer) return { parsed: false };
    const rec = S.reconcile(p.answer.scenes[0], d, 1, 8);
    const by = (id: string) => rec.layers.find((l: { id: string }) => l.id === id);
    const old = S.parseScene(JSON.stringify({ roles: { r1T1: 'title' } }), [{ text: ['r1T1'], graphic: [] }]);
    return {
      parsed: true,
      problems: p.problems,
      title: by('L2'), subtitle: by('L3'), approx: by('L4'), photo: by('L1'),
      dropped: rec.dropped,
      guides: rec.guides.map((g: { edge: string; at: number; enforced: boolean }) => [g.edge, g.at, g.enforced]),
      labels: S.labelsOf(p.answer, [rec]).roles,
      legacy: old.ok && !!old.labels,
    };
  });
  expect(r.parsed).toBe(true);
  expect(r.problems?.join(' ')).toContain('BAD');
  // Snapped to the measured box (not the reader's approximate one).
  expect(r.title).toMatchObject({ measured: 'text1', approx: false });
  expect(r.photo).toMatchObject({ measured: 'photo1', approx: false });
  // Shared left edge: 8 and 9.5 are the same line, so both sit on one x. The deck margin is 8.
  expect(r.title!.box.x).toBe(r.subtitle!.box.x);
  expect(r.guides.some((g: [string, number, boolean]) => g[0] === 'left' && g[2])).toBe(true);
  // A described layer with no measured box keeps its approximate box and is marked APPROX.
  expect(r.approx).toMatchObject({ approx: true, measured: null });
  expect(r.approx!.box).toEqual({ x: 60, y: 70, w: 20, h: 4 });
  // A tiny measured text the reader did not mention is dropped as noise.
  expect(r.dropped).toContain('text3');
  expect(r.labels).toMatchObject({ r1T1: 'title', r1T2: 'subtitle' });
  expect(r.legacy, 'the older labels answer still works').toBe(true);
});

test('read mode toggle: whole picture first, the other way costs one more call, and switching back re-applies the cached read with no call', async ({ page }) => {
  const { fakeReader, labelsAnswer, makeReference, openStyleFromReferences, refInput, refineAnswer } = await import('./reference-helpers');
  const rec = await fakeReader(page, (kind: string, _n: number, prompt: string) => (kind === 'refine' ? refineAnswer() : labelsAnswer(prompt)));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark.jpg', kind: 'slide' }));
  const mode = page.getByRole('radiogroup', { name: 'Read mode' });
  await expect(mode.getByRole('radio', { name: /^Whole picture/ })).toHaveAttribute('aria-checked', 'true');
  const calls = page.getByRole('status', { name: 'Model calls' });
  const done = () => expect(page.getByRole('heading', { name: '5. How close it got' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/^Instant draft:/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Read references' }).click();
  await done();
  await expect(calls).toContainText('Model calls: 1 of 2');
  expect(rec.reads[0].prompt).toContain('describe the scene');
  // The other way has not been read: switching only says so, and costs nothing.
  await mode.getByRole('radio', { name: /^Labels/ }).click();
  await expect(page.getByText('Not read this way yet')).toBeVisible();
  await expect(calls).toContainText('Model calls: 1 of 2');
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect.poll(() => rec.reads.length, { timeout: 120_000 }).toBe(2);
  await done();
  expect(rec.reads).toHaveLength(2);
  expect(rec.reads[1].prompt).toContain('You label the parts of reference slides');
  // Both were read: switching back re-applies the cached read, no new call.
  await mode.getByRole('radio', { name: /^Whole picture/ }).click();
  await expect(page.getByRole('status', { name: 'Model calls' })).toContainText('Model calls: 0 of 2');
  await page.waitForTimeout(1500);
  expect(rec.reads).toHaveLength(2);
  expect(await page.evaluate(() => localStorage.getItem('creator.readMode'))).toBe('scene');
});
