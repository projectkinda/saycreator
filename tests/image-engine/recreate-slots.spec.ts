// What Recreate sends (one slide, never a flat piece), photo slots that survive into the carousel, gradient lines, and Make editable when the layers cannot be drawn.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fakeReader, makeReference, refineAnswer, ROOT } from './reference-helpers';

test.setTimeout(180_000);
const EXAMPLE = fs.readFileSync(path.join(ROOT, 'docs', 'recreate-example.svg'), 'utf8');

test('a slide-shaped picture is one slide; a sheet with gutters is split; a flat first piece falls back to the whole picture', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const { chooseSlide } = await import('/src/reference/slides.ts');
    // A picture with real content in a box: stripes and a block.
    const paint = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, flat: boolean) => {
      g.fillStyle = '#EFEAE4';
      g.fillRect(x, y, w, h);
      if (flat) return;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#222222' : '#E8501A';
        g.fillRect(x + 10, y + 20 + i * 40, w - 20 - i * 12, 22);
      }
    };
    const pxAt = (c: HTMLCanvasElement) => (size: number) => {
      const k = Math.min(1, size / Math.max(c.width, c.height));
      const s = document.createElement('canvas');
      s.width = Math.round(c.width * k);
      s.height = Math.round(c.height * k);
      s.getContext('2d')!.drawImage(c, 0, 0, s.width, s.height);
      const d = s.getContext('2d')!.getImageData(0, 0, s.width, s.height);
      return { p: { width: d.width, height: d.height, data: d.data }, k: 1 / k };
    };
    // 1. One 4:5 slide, with a plain band inside it that looks like a gutter.
    const one = document.createElement('canvas');
    one.width = 686;
    one.height = 857;
    paint(one.getContext('2d')!, 0, 0, 686, 857, false);
    one.getContext('2d')!.fillStyle = '#FFFFFF';
    one.getContext('2d')!.fillRect(340, 0, 14, 857);
    // 2. A 3 x 3 sheet of 4:5 slides with white gutters.
    const sheet = (flatFirst: boolean) => {
      const c = document.createElement('canvas');
      c.width = 3 * 300 + 4 * 40;
      c.height = 3 * 375 + 4 * 40;
      const g = c.getContext('2d')!;
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 9; i++) paint(g, 40 + (i % 3) * 340, 40 + Math.floor(i / 3) * 415, 300, 375, flatFirst && i === 0);
      return c;
    };
    const a = chooseSlide(pxAt(one), 'auto');
    const b = chooseSlide(pxAt(sheet(false)), 'auto');
    const c = chooseSlide(pxAt(sheet(true)), 'split');
    return { a, b, c };
  });
  expect(r.a.split, 'a slide-shaped picture is one slide').toBe(false);
  expect(r.a.rect).toBeNull();
  expect(r.b.split, 'a sheet with gutters is split').toBe(true);
  expect(r.b.rect!.width).toBeGreaterThan(250);
  expect(r.b.rect!.width).toBeLessThan(340);
  expect(r.c.split, 'a flat first piece is not sent').toBe(false);
  expect(r.c.rect).toBeNull();
  expect(r.c.why).toMatch(/flat/);
});

test('photo slots survive: kept with the result, a placeholder block in the layers, image layers once a picture is set; a gradient line no longer breaks the layers', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const R = await import('/src/reference/recreate.ts');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 686 857"><defs><linearGradient id="g"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#E8501A"/></linearGradient></defs>
      <rect width="686" height="857" fill="#F4EFE9"/>
      <rect data-image-slot="inset" data-mask="rounded" x="60" y="300" width="560" height="300" fill="#B9B2A8"/>
      <path d="M60 700 C 200 640 400 760 600 690" fill="none" stroke="url(#g)" stroke-width="12"/>
      <text x="60" y="120" font-size="64" font-family="Inter" data-role="title" fill="#111111">Hello there</text></svg>`;
    const a = await R.answerToLayers(svg, { w: 1080, h: 1350, ownRoles: [] });
    if (!a.ok) return { ok: false, reasons: a.reasons };
    const names = a.result.layers.map((l) => l.name);
    const withPic = R.applyPhotoSlots(a.result.layers, a.result.slots, { [a.result.slots[0].id]: [{ url: 'data:image/png;base64,AAAA' }] });
    const empty = R.applyPhotoSlots(a.result.layers, a.result.slots, { [a.result.slots[0].id]: [null] });
    const strokes = a.result.layers.filter((l) => l.kind === 'path').map((l) => (l as { stroke?: { color: string } }).stroke?.color);
    return { ok: true, slots: a.result.slots, names, kinds: withPic.map((l) => `${l.kind}:${l.name}`), emptyKinds: empty.map((l) => l.kind), notes: a.result.notes, strokes, svgHasSlotRect: /data-image-slot/.test(a.result.svg) };
  });
  expect(r.ok).toBe(true);
  expect(r.slots).toHaveLength(1);
  expect(r.slots![0]).toMatchObject({ kind: 'inset', mask: 'rounded', fit: 'cover' });
  expect(r.slots![0].w).toBeGreaterThan(800);
  expect(r.names!.some((n) => n.startsWith('photo-slot-imgslot-0'))).toBe(true);
  expect(r.kinds!.some((k) => k.startsWith('image:image-imgslot-0'))).toBe(true);
  expect(r.emptyKinds!.filter((k) => k === 'image')).toHaveLength(0);
  expect(r.svgHasSlotRect, 'the faithful picture holds the placeholder, not the rect').toBe(false);
  expect(r.strokes!.every((s) => typeof s === 'string' && /^(#|rgb|\$)/.test(s!)), 'a gradient line is one plain colour').toBe(true);
  expect(r.notes!.join(' ')).toMatch(/gradient/);
});

test('Make editable: when the layers cannot be drawn, the reason is said in the panel and the picture as drawn stays on screen', async ({ page }) => {
  await fakeReader(page, (kind: string) => (kind === 'refine' ? refineAnswer() : EXAMPLE));
  await page.addInitScript(() => localStorage.setItem('creator.devtools', '1')); // Match a reference is a developer tool since round 1
  await page.goto('/images/carousel');
  await page.getByText('Match a reference', { exact: true }).click();
  await page.getByLabel('Choose a picture to recreate').setInputFiles(await makeReference(page, { name: 'slide.jpg', kind: 'slide' }));
  await page.getByRole('button', { name: 'Recreate', exact: true }).click();
  await expect(page.getByTestId('recreate-status')).toContainText('compared and corrected once', { timeout: 120_000 });
  await page.evaluate(async () => {
    const { renderer } = await import('/src/carousel/render.ts');
    renderer.preview = async () => {
      throw new Error('This plan cannot be drawn: Layer "drawing": the stroke colour is not a colour.');
    };
  });
  await page.getByRole('button', { name: 'Make editable' }).click();
  await expect(page.getByTestId('recreate-status')).toContainText('Make editable stopped: Layer "drawing": the stroke colour is not a colour.');
  await expect(page.getByTestId('recreate-status')).toContainText('stays shown');
  await expect(page.getByAltText('The recreated slide')).toBeVisible();
  expect(await page.getByAltText('The recreated slide').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
  await expect(page.getByRole('button', { name: 'Make editable' }), 'it can be tried again').toBeVisible();
});
