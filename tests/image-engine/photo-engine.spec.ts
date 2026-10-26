// Step 11: the photo pieces, tested on their own (no private photos needed): where words go, what a plan may say about photos,
// the new script fields, the style rules, drawing that is repeatable, and patches and undo on a photo plan.
import { expect, test, type Page } from '@playwright/test';
import zlib from 'node:zlib';
import { buildWritePrompt } from '../../src/carousel/writerPrompt';
import { exampleScript, scriptPrompt, validateScriptText } from '../../src/carousel/script';
import { bandOf, overlayAlpha, pickBand, textBackdrop, type PhotoStats } from '../../src/image-engine/photo/zones';
import { resolveTreatments } from '../../src/image-engine/photo/resolve';
import type { Patch, Plan } from '../../src/image-engine/types';

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

/** A small valid PNG with a gradient (so treatments have something to change), as a data address. Made here, so no private picture is needed. */
function gradientPng(w: number, h: number): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4);
    for (let x = 0; x < w; x++) { const o = 1 + x * 4; row[o] = Math.round((x / w) * 255); row[o + 1] = Math.round((y / h) * 255); row[o + 2] = 120; row[o + 3] = 255; }
    rows.push(row);
  }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}

const photoPlan = (layer: Record<string, unknown>): Plan => ({
  schema: 1,
  revision: 1,
  canvas: { width: 600, height: 750, background: '#101010' },
  layers: [{ id: 'photo', kind: 'image', role: 'decor', x: 0, y: 0, width: 600, height: 750, rotation: 0, opacity: 1, src: gradientPng(60, 75), fit: 'cover', ...layer } as never],
});

test.describe('where words go on a photo (no browser)', () => {
  // 6 columns by 4 rows: a bright, busy top half and a dark, calm bottom half.
  const stats: PhotoStats = { cols: 6, rows: 4, lum: [...Array(12).fill(0.85), ...Array(12).fill(0.12)], detail: [...Array(12).fill(0.8), ...Array(12).fill(0.05)] };

  test('the calm, dark part is picked for the words, and it needs no overlay for light words', () => {
    const p = pickBand(stats, 0.4, ['top', 'bottom']);
    expect(p.where).toBe('bottom');
    expect(textBackdrop(p.band, 0.97, 0)).toEqual({ kind: 'none', alpha: 0 });
  });

  test('over a bright busy part, light words get an overlay strong enough for the contrast, or a plate when no overlay could', () => {
    const top = bandOf(stats, 0, 0.4);
    const a = overlayAlpha(top.p98, 0.97, 0, 5);
    expect(a).not.toBeNull();
    expect(a!).toBeGreaterThan(0.4);
    // The numbers: after the overlay the ratio really is at least the target.
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const blended = lin(top.p98 * (1 - a!));
    expect((lin(0.97) + 0.05) / (blended + 0.05)).toBeGreaterThanOrEqual(5);
    expect(['overlay', 'plate']).toContain(textBackdrop(top, 0.97, 0).kind);
    // Mid-grey words on a mid-grey photo cannot be fixed with a dark overlay (it would only make both dark), so a plate is asked for.
    expect(overlayAlpha(0.4, 0.4, 0, 5)).toBeNull();
    expect(textBackdrop({ mean: 0.4, p90: 0.4, p98: 0.4, detail: 0 }, 0.4, 0).kind).toBe('plate');
    // Dark words on a bright photo are already fine.
    expect(overlayAlpha(0.95, 0.15, 0, 5)).toBe(0);
  });

  test('a photo with no numbers is treated as mid-bright and busy, never as safe', () => {
    expect(textBackdrop(bandOf(undefined, 0.6, 1), 0.97, 0).kind).not.toBe('none');
  });

  test('a style colour such as "$accent" means the slide palette\'s colour, and nothing else changes', () => {
    const out = resolveTreatments([{ op: 'duotone', dark: '$bg', light: '$accent' }, { op: 'grain', amount: 0.2 }], { bg: '#102030', accent: '#ffcc00' });
    expect(out).toEqual([{ op: 'duotone', dark: '#102030', light: '#ffcc00' }, { op: 'grain', amount: 0.2 }]);
  });
});

test.describe('the script and the writer prompt (no browser)', () => {
  test('a slide may carry a photo and a photo hint; a hint that is too long or not text is refused in plain words', () => {
    const s = exampleScript('carousel');
    const ok = JSON.parse(s) as { slides: Record<string, unknown>[] };
    ok.slides[0].photo_hint = 'a city street at dusk';
    ok.slides[1].photo = 'balcony';
    const good = validateScriptText(JSON.stringify(ok), 'carousel');
    expect(good.errors).toEqual([]);
    expect(good.warnings.some((i) => /photo/.test(i.message) && /ignored/.test(i.message))).toBe(false);
    ok.slides[0].photo_hint = 'x'.repeat(95);
    ok.slides[1].photo = 7;
    const bad = validateScriptText(JSON.stringify(ok), 'carousel');
    const msgs = bad.errors.map((i) => i.message).join(' | ');
    expect(msgs).toMatch(/photo_hint.*90 characters/);
    expect(msgs).toMatch(/photo.*name of one of your photos/);
  });

  test('both prompts tell the writer about the optional photo_hint', () => {
    expect(scriptPrompt('anything', 'carousel')).toMatch(/photo_hint/);
    const p = buildWritePrompt({ text: 'A text that is long enough to write a short carousel about growing a following.', slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'auto', styles: [{ name: 'a', title: 'A' }] });
    expect(p).toMatch(/photo_hint/);
    expect(p).toMatch(/optional/);
  });
});

test.describe('plans and styles (in the browser)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/image-engine/harness/index.html');
    await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
    await call(page, 'loadFonts');
  });

  test('the plan checker takes every treatment, mask and the new layers, and refuses bad values with a sentence', async ({ page }) => {
    const good = photoPlan({ mask: { shape: 'flower' }, treatments: [{ op: 'grayscale' }, { op: 'duotone', dark: '#112233', light: '#ffeecc' }, { op: 'halftone', cell: 12, dark: '#000000', light: '#ffffff' }, { op: 'grain', amount: 0.3 }, { op: 'levels', brightness: 0.1 }, { op: 'blur', radius: 8 }, { op: 'motionBlur', length: 40, angle: 10 }, { op: 'tint', color: '#ff0000', amount: 0.2 }, { op: 'vignette', amount: 0.4 }, { op: 'fade', from: 'bottom', color: '#000000', amount: 0.8 }, { op: 'wash', color: '#222222', amount: 0.3 }] });
    good.layers.push({ id: 'f', kind: 'field', role: 'decor', x: 0, y: 0, width: 600, height: 750, rotation: 0, opacity: 1, base: '#ffffff', blobs: [{ x: 0.5, y: 0.5, r: 0.4, color: '#ff8800', alpha: 0.8 }], blur: 80, grain: 0.1, seed: 3 } as never);
    good.layers.push({ id: 'g', kind: 'glass', role: 'container', x: 50, y: 50, width: 300, height: 200, rotation: 0, opacity: 1, fill: 'rgba(255,255,255,0.2)', blur: 20, radius: 30 } as never);
    expect(await call<string[]>(page, 'validate', good)).toEqual([]);
    const bad = photoPlan({ mask: { shape: 'hexagon' }, treatments: [{ op: 'sparkle' }, { op: 'blur', radius: 999 }, { op: 'duotone', dark: 'nope', light: '#fff' }] });
    bad.layers.push({ id: 'g', kind: 'glass', role: 'container', x: 0, y: 0, width: 100, height: 100, rotation: 12, opacity: 1, fill: '#fff', blur: 20, radius: 10 } as never);
    bad.layers.push({ id: 'o', kind: 'image', role: 'decor', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, src: 'x.png', fit: 'cover', object: { shadow: 'contact' } } as never);
    const errors = (await call<string[]>(page, 'validate', bad)).join(' | ');
    expect(errors).toMatch(/mask shape must be one of/);
    expect(errors).toMatch(/must be one of grayscale, duotone/);
    expect(errors).toMatch(/blur radius/);
    expect(errors).toMatch(/dark colour is not a colour/);
    expect(errors).toMatch(/cannot be rotated/);
    expect(errors).toMatch(/object picture needs fit "contain"/);
  });

  test('a style with a photo block is checked: unknown treatment names, unknown colour names and a non-yes/no photo condition are refused', async ({ page }) => {
    const base = await call<{ styles: { spec: Record<string, unknown> }[] }>(page, 'styleList');
    const mono = JSON.parse(JSON.stringify(base.styles.find((s) => (s.spec as { name: string }).name === 'mono-poster')!.spec)) as { photo: { treatments: Record<string, unknown[]>; overlay?: string }; layouts: { cover: { params?: Record<string, unknown>; when?: Record<string, unknown> }[] }; name: string };
    expect((await call<{ errors: string[] }>(page, 'styleValidate', mono, 'mono-poster')).errors).toEqual([]);
    const a = JSON.parse(JSON.stringify(mono));
    a.layouts.cover[0].params.treatment = 'sepia';
    expect((await call<{ errors: string[] }>(page, 'styleValidate', a, 'mono-poster')).errors.join(' ')).toMatch(/treatment "sepia", which is not in photo.treatments/);
    const b = JSON.parse(JSON.stringify(mono));
    b.photo.treatments.mono = [{ op: 'duotone', dark: '$nothing', light: '#ffffff' }];
    expect((await call<{ errors: string[] }>(page, 'styleValidate', b, 'mono-poster')).errors.join(' ')).toMatch(/"\$nothing", which is not a palette colour name/);
    const c = JSON.parse(JSON.stringify(mono));
    c.layouts.cover[0].when.photo = 'yes';
    expect((await call<{ errors: string[] }>(page, 'styleValidate', c, 'mono-poster')).errors.join(' ')).toMatch(/when\.photo has a wrong value/);
    const d = JSON.parse(JSON.stringify(mono));
    d.photo.overlay = '$wrong';
    expect((await call<{ errors: string[] }>(page, 'styleValidate', d, 'mono-poster')).errors.join(' ')).toMatch(/not a palette colour name/);
  });

  test('a treated photo draws the same every time (seeded grain), keeps its box, and a mask changes the corners and not the size', async ({ page }) => {
    const plan = photoPlan({ treatments: [{ op: 'grayscale' }, { op: 'grain', amount: 0.4, size: 1, seed: 5 }, { op: 'vignette', amount: 0.5 }] });
    const a = await call<{ b64: string; width: number; height: number; report: { warnings: unknown[] } }>(page, 'renderPlan', plan);
    const b = await call<{ b64: string }>(page, 'renderPlan', plan);
    expect(a.b64).toBe(b.b64);
    expect([a.width, a.height]).toEqual([600, 750]);
    expect(a.report.warnings).toEqual([]);
    const plain = await call<{ b64: string }>(page, 'renderPlan', photoPlan({}));
    expect(plain.b64).not.toBe(a.b64);
    // A circle mask: the middle shows the photo, the corner shows the background.
    const px = await call<number[][]>(page, 'pixels', photoPlan({ mask: { shape: 'ellipse' } }), [[300, 375], [4, 4]]);
    expect(px[1].slice(0, 3)).toEqual([16, 16, 16]);
    expect(px[0][3]).toBe(255);
    expect(px[0].slice(0, 3)).not.toEqual([16, 16, 16]);
  });

  test('a glass card blurs what is behind it: a hard edge behind the card is soft inside it, and sharp outside it', async ({ page }) => {
    const plan: Plan = { schema: 1, revision: 1, canvas: { width: 400, height: 400, background: '#000000' }, layers: [{ id: 'half', kind: 'shape', role: 'decor', x: 0, y: 0, width: 200, height: 400, rotation: 0, opacity: 1, shape: 'rect', fill: '#ffffff' } as never, { id: 'g', kind: 'glass', role: 'container', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, fill: 'rgba(0,0,0,0)', blur: 30, radius: 0 } as never] };
    const px = await call<number[][]>(page, 'pixels', plan, [[195, 50], [205, 50], [195, 200], [205, 200]]);
    expect(px[0][0]).toBe(255); // outside the card, still sharp
    expect(px[1][0]).toBe(0);
    expect(px[2][0]).toBeLessThan(250); // inside the card, softened
    expect(px[3][0]).toBeGreaterThan(5);
  });

  test('patches change a photo\'s treatment and mask, and undo gives back the same picture byte for byte', async ({ page }) => {
    const plan = photoPlan({});
    const patch: Patch = { baseRevision: 1, label: 'Duotone and a pill', ops: [{ op: 'set', id: 'photo', path: 'treatments', value: [{ op: 'duotone', dark: '#101830', light: '#ffd9a0' }] }, { op: 'set', id: 'photo', path: 'mask', value: { shape: 'pill' } }] };
    const c = await call<{ shots: Record<string, string>; ok: boolean[]; planAfterUndoEqualsBefore: boolean }>(page, 'patchCycle', plan, patch);
    expect(c.ok).toEqual([true, true, true]);
    expect(c.shots.after).not.toBe(c.shots.before);
    expect(c.shots.undone).toBe(c.shots.before);
    expect(c.shots.redone).toBe(c.shots.after);
    expect(c.planAfterUndoEqualsBefore).toBe(true);
    // And a patch that would make the plan invalid is refused.
    const res = await call<{ ok: boolean; reasons?: string[] }>(page, 'patchPlan', plan, { baseRevision: 1, label: 'Bad', ops: [{ op: 'set', id: 'photo', path: 'treatments', value: [{ op: 'blur', radius: 5000 }] }] });
    expect(res.ok).toBe(false);
  });
});
