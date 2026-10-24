// Pure logic (validator, patcher, history). Runs in Node because it touches no DOM.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { History, applyPatch } from '../../src/image-engine/patcher';
import type { Plan, TextLayer } from '../../src/image-engine/types';
import { validatePlan } from '../../src/image-engine/validate';

const load = (name: string): Plan => JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'plans', name), 'utf8'));
const quote = () => load('quote-card.plan.json');
const slide = () => load('carousel-slide.plan.json');

test.describe('validator', () => {
  test('the two sample plans are valid', () => {
    expect(validatePlan(quote())).toEqual([]);
    expect(validatePlan(slide())).toEqual([]);
  });

  test('rejections are sentences a person can act on', () => {
    const p = quote();
    p.canvas.width = 10;
    (p.layers[0] as TextLayer).style.font = 'Comic Sans' as never;
    p.layers[0].opacity = 2;
    p.layers[1].id = 'quote';
    const text = validatePlan(p).join(' ');
    expect(text).toContain('Canvas width must be a whole number from 64 to 4096');
    expect(text).toContain('"Comic Sans" is not available');
    expect(text).toContain('opacity must be between 0 and 1');
    expect(text).toContain('Two layers share the id "quote"');
  });

  test('highlight words must be in the text, filters only on images, empty text refused', () => {
    const p = quote();
    (p.layers[0] as TextLayer).highlight!.words = ['missing'];
    (p.layers[2] as unknown as { filters: unknown }).filters = { blur: 3 };
    (p.layers[3] as TextLayer).text = '   ';
    const text = validatePlan(p).join(' ');
    expect(text).toContain('the highlighted word "missing" is not in the text');
    expect(text).toContain('filters only work on image layers');
    expect(text).toContain('the text is empty');
  });
});

test.describe('patcher', () => {
  const resize = (rev: number) => ({ baseRevision: rev, label: 'Bigger quote', ops: [{ op: 'set' as const, id: 'quote', path: 'style.size', value: 90 }] });

  test('applies, bumps the revision, and returns an inverse that restores the plan', () => {
    const p = quote();
    const r = applyPatch(p, resize(1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.revision).toBe(2);
    expect((r.plan.layers[0] as TextLayer).style.size).toBe(90);
    expect((p.layers[0] as TextLayer).style.size).toBe(116); // input never mutated
    const back = applyPatch(r.plan, r.inverse);
    expect(back.ok).toBe(true);
    if (back.ok) expect({ ...back.plan, revision: 1 }).toEqual(p);
  });

  test('a patch written for an older version is refused, in plain words', () => {
    const r = applyPatch(quote(), resize(7));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0]).toMatch(/version 7.*version 1/);
  });

  test('atomic: if one step is bad, nothing is applied', () => {
    const p = quote();
    const r = applyPatch(p, {
      baseRevision: 1,
      label: 'Half good',
      ops: [
        { op: 'set', id: 'quote', path: 'style.size', value: 80 },
        { op: 'remove', id: 'does-not-exist' },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0]).toContain('there is no layer "does-not-exist" to remove');
    expect((p.layers[0] as TextLayer).style.size).toBe(116);
  });

  test('the resulting plan is validated, so a bad value is caught', () => {
    const r = applyPatch(quote(), { baseRevision: 1, label: 'Too see-through', ops: [{ op: 'set', id: 'quote', path: 'opacity', value: 5 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(' ')).toContain('opacity must be between 0 and 1');
  });

  test('refuses unsafe or impossible paths', () => {
    const bad = (id: string, path: string, value: unknown) => applyPatch(quote(), { baseRevision: 1, label: 'x', ops: [{ op: 'set', id, path, value }] });
    const proto = bad('quote', '__proto__.polluted', 1);
    expect(proto.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const kind = bad('quote', 'kind', 'shape');
    expect(!kind.ok && kind.reasons[0]).toContain("cannot be changed");
    const noParent = bad('quote', 'style.stroke.width', 4);
    expect(!noParent.ok && noParent.reasons[0]).toContain('does not exist yet');
    const canvas = bad('canvas', 'layers', []);
    expect(!canvas.ok && canvas.reasons[0]).toContain('canvas has no "layers"');
  });

  test('add, move and remove all invert exactly', () => {
    const h = new History(quote());
    const before = structuredClone(h.plan);
    const badge = { id: 'badge', kind: 'shape', x: 800, y: 80, width: 120, height: 120, rotation: 0, opacity: 1, shape: 'ellipse', fill: '#E8A33D' } as const;
    expect(h.apply({ baseRevision: 1, label: 'Add badge', ops: [{ op: 'add', layer: badge, index: 1 }] }).ok).toBe(true);
    expect(h.apply({ baseRevision: 2, label: 'Badge to front', ops: [{ op: 'move', id: 'badge', toIndex: 4 }] }).ok).toBe(true);
    expect(h.apply({ baseRevision: 3, label: 'Remove rule', ops: [{ op: 'remove', id: 'rule' }] }).ok).toBe(true);
    expect(h.plan.layers.map((l) => l.id)).toEqual(['quote', 'attribution', 'handle', 'badge']);
    h.undo();
    h.undo();
    h.undo();
    expect({ ...h.plan, revision: 1 }).toEqual(before);
    expect(h.plan.revision).toBe(7); // every apply, undo and redo moves the revision forward
    h.redo();
    h.redo();
    h.redo();
    expect(h.plan.layers.map((l) => l.id)).toEqual(['quote', 'attribution', 'handle', 'badge']);
  });

  test('history keeps labels, and a new change clears redo', () => {
    const h = new History(quote());
    h.apply({ baseRevision: 1, label: 'One', ops: [{ op: 'set', id: 'quote', path: 'style.size', value: 100 }] });
    h.apply({ baseRevision: 2, label: 'Two', ops: [{ op: 'set', id: 'quote', path: 'style.size', value: 90 }] });
    h.undo();
    expect(h.entries()).toEqual({ done: [{ label: 'One', revision: 2 }], undone: ['Two'] });
    expect(h.canRedo).toBe(true);
    h.apply({ baseRevision: h.plan.revision, label: 'Three', ops: [{ op: 'set', id: 'quote', path: 'style.size', value: 70 }] });
    expect(h.canRedo).toBe(false);
    expect(h.entries().done.map((e) => e.label)).toEqual(['One', 'Three']);
  });

  test('undo and redo with nothing to do return null', () => {
    const h = new History(quote());
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });
});
