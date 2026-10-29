// Step 16a: Describe the look. A fake writer answers (no model): one call to describe, small calls to change, the cap of 3, undo, what cannot be drawn, save as a template.
import { expect, test } from '@playwright/test';
import { makePic } from './photos-app-helpers';
import { fakeReader, refineAnswer, storedTemplates } from './reference-helpers';
import { allDrawn, openThumb, photoInput, titleInput } from './thumbnail-app-helpers';

test.setTimeout(180_000);

const scene = JSON.stringify({
  background: { kind: 'flat', colours: ['#101820'] },
  layers: [
    { id: 'L1', type: 'photo', photoShape: 'rect', box: { x: 52, y: 8, w: 42, h: 84 } },
    { id: 'L2', type: 'shape', shape: 'pill', box: { x: 6, y: 12, w: 22, h: 7 }, colour: '#FFD400' },
    { id: 'L3', type: 'text', role: 'title', box: { x: 6, y: 24, w: 42, h: 46 }, align: 'left', anchor: 'middle', lines: 3, size: 150, colour: '#FFFFFF', treatments: ['caps'] },
    { id: 'L4', type: 'graphic', graphic: 'arrow', box: { x: 40, y: 72, w: 12, h: 12 }, colour: '#FF3B30', angle: -20 },
    { id: 'L5', type: 'graphic', graphic: 'laser-beam', box: { x: 10, y: 80, w: 10, h: 10 }, colour: '#FF3B30' },
  ],
  could_not: ['a chrome 3D logo'],
});
const answer = (kind: string, _n: number, prompt: string) => {
  if (kind === 'refine') return refineAnswer();
  if (prompt.includes('[describe:edit]')) return JSON.stringify({ patches: [{ op: 'set', id: 'L3', set: { size: 220, box: { x: 10 } } }, { op: 'set', id: 'NOPE', set: {} }], could_not: ['a glowing neon tube'] });
  return scene;
};

test('describe the look: one call draws it on the content, follow-ups are small and undoable, the cap is 3, the missing things are listed, and a template keeps no photo', async ({ page }) => {
  const rec = await fakeReader(page, answer);
  await openThumb(page);
  await photoInput(page).setInputFiles(await makePic(page, { name: 'subject.jpg', w: 1280, h: 720, hue: 30, mark: [0.5, 0.5] }));
  await titleInput(page).fill('Ride before sunrise');
  await allDrawn(page, 3);
  const box = page.getByLabel('Describe the look', { exact: true });
  await page.getByRole('button', { name: /^Example 1:/ }).click();
  await expect(box).not.toHaveValue('');
  const calls = page.getByRole('status', { name: 'Describe model calls' });
  await expect(calls).toHaveText('Model calls: 0 of 3');
  await page.getByRole('button', { name: 'Generate layout' }).click();
  await expect(calls).toHaveText('Model calls: 1 of 3', { timeout: 30_000 });
  expect(rec.reads).toHaveLength(1);
  expect(rec.reads[0].prompt).toContain('BACK TO FRONT');
  expect(rec.reads[0].prompt).toContain('Ride before sunrise');
  expect(rec.reads[0].images, 'no picture is sent without a reference').toHaveLength(0);
  // Drawn on the person's own content, as the first option.
  await expect(page.getByRole('img', { name: /Ride before sunrise.*Your described layout/ }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('group', { name: 'Reference' })).toContainText('Described layout');
  // What the toolbox cannot draw is listed, not faked: the writer's own list and the mark that is not in the toolbox.
  const missing = page.getByRole('status', { name: 'Could not draw' });
  await expect(missing).toContainText('a chrome 3D logo');
  await expect(missing).toContainText('laser-beam');
  // A follow-up in words: a small text call with the current scene, and it can be undone.
  await page.getByLabel('Change the layout in words').fill('title bigger and to the right');
  await page.getByRole('button', { name: 'Change it' }).click();
  await expect(calls).toHaveText('Model calls: 2 of 3', { timeout: 30_000 });
  expect(rec.reads[1].prompt).toContain('[describe:edit]');
  expect(rec.reads[1].prompt).toContain('title bigger and to the right');
  expect(rec.reads[1].images).toHaveLength(0);
  await expect(missing).toContainText('a glowing neon tube');
  await expect(page.getByRole('button', { name: 'Undo the change' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo the change' }).click();
  await expect(page.getByRole('button', { name: 'Undo the change' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Redo the change' })).toBeEnabled();
  // The third call is the last one.
  await page.getByLabel('Change the layout in words').fill('darker background');
  await page.getByRole('button', { name: 'Change it' }).click();
  await expect(calls).toHaveText('Model calls: 3 of 3', { timeout: 30_000 });
  await page.getByLabel('Change the layout in words').fill('one more');
  await expect(page.getByRole('button', { name: 'Change it' })).toBeDisabled();
  expect(rec.reads).toHaveLength(3);
  // Save: the layout only, and a title typed later refits with no call.
  await page.getByRole('button', { name: 'Save as template' }).click();
  await expect(page.getByTestId('describe-status')).toContainText('no photos');
  const stored = await storedTemplates(page);
  expect(stored).toHaveLength(1);
  const json = JSON.stringify(stored[0]);
  expect(json).not.toMatch(/blob:|data:image\/jpeg/);
  expect(json).toContain('"free"');
  expect(rec.reads).toHaveLength(3);
  // Removing the look goes back to the normal ones.
  await page.getByRole('button', { name: 'Remove the reference' }).click();
  await expect(page.getByRole('group', { name: 'Reference' })).toHaveCount(0);
});

test('the answer is validated and clamped: an unusable layer is left out, boxes stay inside the canvas, a bad colour is dropped', async ({ page }) => {
  await page.goto('/images/thumbnail');
  const r = await page.evaluate(async () => {
    const D = await import('/src/reference/describe.ts');
    const p = D.parseDescribe(JSON.stringify({ background: { kind: 'flat', colours: ['red'] }, layers: [{ id: 'A', type: 'text', role: 'title', box: { x: 90, y: -5, w: 60, h: 20 }, colour: 'nope', size: 9999 }, { id: 'B', type: 'blob', box: { x: 1, y: 1, w: 1, h: 1 } }] }));
    const bad = D.parseDescribe('not json');
    return { ok: p.ok, layer: p.ok ? p.scene.layers[0] : null, count: p.ok ? p.scene.layers.length : 0, bg: p.ok ? p.scene.background.colours : null, bad: bad.ok };
  });
  expect(r.ok).toBe(true);
  expect(r.count).toBe(1);
  expect(r.layer!.box).toEqual({ x: 90, y: 0, w: 10, h: 20 });
  expect(r.layer!.colour).toBeUndefined();
  expect(r.layer!.size).toBe(420);
  expect(r.bg).toEqual(['#FFFFFF']);
  expect(r.bad).toBe(false);
});
