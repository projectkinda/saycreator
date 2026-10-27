// Marks (badges, stamps, shapes, textures) drawn in code: each kind is drawn on a slide in real Chrome and its layers checked, the style
// validator's messages for bad marks are checked, and a contact sheet of every kind is saved for looking at.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './reference-helpers';

const OUT = path.join(ROOT, 'out/image-engine/marks');
test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
});

const SHEETS: { name: string; marks: Record<string, unknown>[] }[] = [
  {
    name: 'shapes-a',
    marks: [
      { kind: 'asterisk', zone: 'top-left', size: 150, colour: 'accent', points: 8 },
      { kind: 'sparkle', zone: 'top-right', size: 150, colour: 'accent' },
      { kind: 'round-badge', zone: 'bottom-right', size: 260, colour: 'accent', text: 'NEW', rotate: 10 },
      { kind: 'outline-button', zone: 'bottom-left', size: 420, colour: 'text', text: 'Read more' },
    ],
  },
  {
    name: 'shapes-b',
    marks: [
      { kind: 'starburst-badge', zone: 'top-right', size: 300, colour: 'accent', text: '50% OFF', points: 18, rotate: 12 },
      { kind: 'circular-text', zone: 'bottom-left', size: 330, colour: 'text', text: 'Made in code' },
      { kind: 'stamp', zone: 'centre', size: 520, colour: 'accent', text: 'APPROVED' },
    ],
  },
  {
    name: 'shapes-c',
    marks: [
      { kind: 'ticket', zone: 'top-left', size: 520, colour: 'accent', colour2: 'onAccent', text: 'ADMIT ONE' },
      { kind: 'label', zone: 'bottom-right', size: 440, colour: 'text', colour2: 'bg', text: 'Limited' },
      { kind: 'arrow', zone: 'bottom-left', size: 360, colour: 'text', rotate: 8 },
      { kind: 'scribble-circle', zone: 'centre', size: 520, colour: 'accent' },
      { kind: 'tape', zone: 'top-right', size: 260, colour: 'accent', rotate: 25 },
    ],
  },
  {
    name: 'textures-a',
    marks: [
      { kind: 'halftone-field', zone: 'top', size: 36, colour: 'accent', opacity: 0.9 },
      { kind: 'dot-grid', zone: 'bottom-right', size: 34, colour: 'text', opacity: 0.4 },
      { kind: 'stripes', zone: 'bottom-left', size: 40, colour: 'accent', rotate: 45, opacity: 0.5 },
    ],
  },
  {
    name: 'textures-b',
    marks: [
      { kind: 'grain', zone: 'full', size: 10, colour: 'text', opacity: 0.35 },
      { kind: 'text-rows', zone: 'top', size: 64, colour: 'accent', text: 'Say more', opacity: 0.5 },
      { kind: 'ribbon', zone: 'bottom', size: 110, colour: 'accent', colour2: 'onAccent', text: 'Fresh drop', rotate: -6 },
    ],
  },
  {
    name: 'two-tone',
    marks: [{ kind: 'two-tone-text', zone: 'top-left', size: 120, colour: 'text', colour2: 'accent', lines: ['SOCIAL MEDIA', 'MADE SIMPLE'] }],
  },
];

test('every kind draws in real Chrome, with layers of the kinds the engine knows', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/images');
  const report = await page.evaluate(async (sheets) => {
    const { blankStyle } = await import('/src/reference/blank.ts');
    const { composeStyled } = await import('/src/image-engine/styles/compose.ts');
    const { loadFonts } = await import('/src/image-engine/fonts.ts');
    const { validateStyle } = await import('/src/image-engine/styles/format.ts');
    const { renderer } = await import('/src/carousel/render.ts');
    const { EXAMPLE } = await import('/src/carousel/script.ts');
    await loadFonts();
    const out: { name: string; errors: string[]; layers: number; kinds: string[]; png: string; notes: string[] }[] = [];
    for (const sh of sheets) {
      const spec = { ...blankStyle(), marks: sh.marks } as never;
      const v = validateStyle(spec, 'blank', undefined as never);
      const slides = composeStyled(EXAMPLE as never, { spec, assets: {}, warnings: [] } as never, { width: 1080, height: 1350, handle: '@yourname' }, false);
      const s = slides[0];
      const r = await renderer.render(s, 72);
      const buf = new Uint8Array(await r.png.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      out.push({ name: sh.name, errors: v.errors, layers: s.plan.layers.filter((l: { id: string }) => l.id.startsWith('mark')).length, kinds: [...new Set(s.plan.layers.map((l: { kind: string }) => l.kind))], png: btoa(bin), notes: s.notes });
    }
    return out;
  }, SHEETS as never);
  for (const r of report) {
    fs.writeFileSync(path.join(OUT, `${r.name}.png`), Buffer.from(r.png, 'base64'));
    expect(r.errors, `${r.name} validates`).toEqual([]);
    expect(r.notes.filter((n) => /could not be drawn/.test(n)), `${r.name} draws`).toEqual([]);
    expect(r.layers, `${r.name} has mark layers`).toBeGreaterThanOrEqual(2);
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(report.map((r) => ({ name: r.name, layers: r.layers, kinds: r.kinds })), null, 2));
});

test('the validator says in plain words what is wrong with a mark', async ({ page }) => {
  await page.goto('/images');
  const errors = await page.evaluate(async () => {
    const { blankStyle } = await import('/src/reference/blank.ts');
    const { validateStyle } = await import('/src/image-engine/styles/format.ts');
    const bad = [
      { kind: 'unicorn', zone: 'top', size: 100, colour: 'accent' },
      { kind: 'stamp', zone: 'nowhere', size: 5000, colour: 'pink' },
      { kind: 'ticket', zone: 'top', size: 300, colour: 'accent' },
      { kind: 'two-tone-text', zone: 'top', size: 100, colour: 'text' },
      { kind: 'asterisk', zone: 'top', size: 100, colour: 'accent', points: 3, rotate: 300 },
    ];
    return validateStyle({ ...blankStyle(), marks: bad } as never, 'blank', undefined as never).errors;
  });
  const all = errors.join('\n');
  expect(all).toContain('Kinds:');
  expect(all).toContain('Zones:');
  expect(all).toContain('size must be a number from 40 to 1600');
  expect(all).toContain('palette colour name');
  expect(all).toContain('(ticket) needs "text"');
  expect(all).toContain('needs "lines"');
  expect(all).toContain('points must be a whole number from 4 to 24');
  expect(all).toContain('rotate must be -90 to 90');
});

test('the reader\'s marks are cleaned: unknown kinds dropped, sizes moved into range, each said in words', async ({ page }) => {
  await page.goto('/images');
  const r = await page.evaluate(async () => {
    const { blankStyle } = await import('/src/reference/blank.ts');
    const { cleanSpec } = await import('/src/reference/spec.ts');
    const notes: string[] = [];
    const spec = cleanSpec({ ...blankStyle(), marks: [{ kind: 'unicorn', zone: 'top', size: 100, colour: 'accent' }, { kind: 'stamp', zone: 'centre', size: 5000, colour: 'accent', text: 'OK' }, { kind: 'ticket', zone: 'top', size: 300, colour: 'accent' }] } as never, 'carousel', notes);
    return { marks: (spec as { marks?: { kind: string; size: number }[] }).marks, notes };
  });
  expect(r.marks).toEqual([expect.objectContaining({ kind: 'stamp', size: 1600 })]);
  expect(r.notes.join(' ')).toContain('unicorn');
  expect(r.notes.join(' ')).toContain('lowered to 1600');
  expect(r.notes.join(' ')).toContain('ticket mark has no words');
});
