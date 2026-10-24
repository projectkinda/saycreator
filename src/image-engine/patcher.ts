// Applies validated patches to a plan, atomically, and keeps undo/redo history with inverse patches.
import type { HistoryEntry, Layer, Op, Patch, PatchResult, Plan } from './types';
import { validatePlan } from './validate';

const MAX_OPS = 100;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const LOCKED = new Set(['id', 'kind']);

type Bag = Record<string, unknown>;

function getParent(root: Bag, segs: string[]): Bag | null {
  let cur: unknown = root;
  for (const s of segs.slice(0, -1)) {
    if (typeof cur !== 'object' || cur === null) return null;
    cur = (cur as Bag)[s];
  }
  return typeof cur === 'object' && cur !== null ? (cur as Bag) : null;
}

/** Checks the patch itself, before looking at the plan. */
function checkShape(patch: Patch): string[] {
  const r: string[] = [];
  if (!patch || typeof patch !== 'object') return ['The change is missing.'];
  if (!Number.isInteger(patch.baseRevision)) r.push('The change does not say which version it was written for.');
  if (typeof patch.label !== 'string' || patch.label.trim() === '') r.push('The change needs a short name, for example "Bigger title".');
  if (!Array.isArray(patch.ops) || patch.ops.length === 0) r.push('The change does not contain any steps.');
  else if (patch.ops.length > MAX_OPS) r.push(`A change can have at most ${MAX_OPS} steps (this one has ${patch.ops.length}).`);
  return r;
}

export function applyPatch(plan: Plan, patch: Patch): PatchResult {
  const shape = checkShape(patch);
  if (shape.length) return { ok: false, reasons: shape };
  if (patch.baseRevision !== plan.revision)
    return {
      ok: false,
      reasons: [`This change was made on version ${patch.baseRevision}, but the image is now on version ${plan.revision}. Reload the image and try again.`],
    };

  const next = structuredClone(plan);
  const inverse: Op[] = [];
  const reasons: string[] = [];
  const indexOf = (id: string) => next.layers.findIndex((l) => l.id === id);

  patch.ops.forEach((op, n) => {
    const step = `Step ${n + 1}`;
    if (reasons.length) return;
    switch (op.op) {
      case 'add': {
        const at = op.index ?? next.layers.length;
        if (!Number.isInteger(at) || at < 0 || at > next.layers.length)
          return void reasons.push(`${step}: there is no position ${String(op.index)} to add a layer at (there are ${next.layers.length} layers).`);
        if (!op.layer || typeof op.layer.id !== 'string') return void reasons.push(`${step}: the new layer has no id.`);
        if (indexOf(op.layer.id) !== -1) return void reasons.push(`${step}: a layer with the id "${op.layer.id}" already exists.`);
        next.layers.splice(at, 0, structuredClone(op.layer) as Layer);
        inverse.push({ op: 'remove', id: op.layer.id });
        return;
      }
      case 'remove': {
        const i = indexOf(op.id);
        if (i === -1) return void reasons.push(`${step}: there is no layer "${op.id}" to remove.`);
        const [gone] = next.layers.splice(i, 1);
        inverse.push({ op: 'add', layer: gone, index: i });
        return;
      }
      case 'move': {
        const i = indexOf(op.id);
        if (i === -1) return void reasons.push(`${step}: there is no layer "${op.id}" to move.`);
        if (!Number.isInteger(op.toIndex) || op.toIndex < 0 || op.toIndex > next.layers.length - 1)
          return void reasons.push(`${step}: layer "${op.id}" cannot move to position ${String(op.toIndex)} (positions are 0 to ${next.layers.length - 1}).`);
        const [item] = next.layers.splice(i, 1);
        next.layers.splice(op.toIndex, 0, item);
        inverse.push({ op: 'move', id: op.id, toIndex: i });
        return;
      }
      case 'set': {
        if (typeof op.path !== 'string' || op.path === '') return void reasons.push(`${step}: the step does not say what to change.`);
        const segs = op.path.split('.');
        if (segs.some((s) => s === '' || FORBIDDEN.has(s))) return void reasons.push(`${step}: "${op.path}" is not a valid property.`);
        let target: Bag | undefined;
        if (op.id === 'canvas') target = next.canvas as unknown as Bag;
        else target = next.layers.find((l) => l.id === op.id) as unknown as Bag | undefined;
        if (!target) return void reasons.push(`${step}: there is no layer "${op.id}".`);
        if (op.id !== 'canvas' && LOCKED.has(segs[0]))
          return void reasons.push(`${step}: a layer's ${segs[0]} cannot be changed. Remove it and add a new one instead.`);
        if (op.id === 'canvas' && !['width', 'height', 'background'].includes(segs[0]))
          return void reasons.push(`${step}: the canvas has no "${segs[0]}" to change.`);
        const parent = getParent(target, segs);
        if (!parent) return void reasons.push(`${step}: "${op.path}" cannot be set because "${segs.slice(0, -1).join('.')}" does not exist yet. Set it as a whole first.`);
        const key = segs[segs.length - 1];
        const before = parent[key];
        if (op.value === undefined) delete parent[key];
        else parent[key] = structuredClone(op.value);
        inverse.push({ op: 'set', id: op.id, path: op.path, value: before === undefined ? undefined : structuredClone(before) });
        return;
      }
      default:
        reasons.push(`${step}: "${String((op as { op?: unknown }).op)}" is not a step we know. Use add, set, remove or move.`);
    }
  });

  if (reasons.length) return { ok: false, reasons };
  next.revision = plan.revision + 1;
  const problems = validatePlan(next);
  if (problems.length) return { ok: false, reasons: problems };
  return {
    ok: true,
    plan: next,
    inverse: { baseRevision: next.revision, label: `Undo: ${patch.label}`, ops: inverse.reverse() },
  };
}

interface Entry {
  label: string;
  forward: Op[];
  inverse: Op[];
}

/** The current plan plus undo and redo, built only from patches. */
export class History {
  private current: Plan;
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private revisions: number[] = [];

  constructor(initial: Plan) {
    const problems = validatePlan(initial);
    if (problems.length) throw new Error(`The starting plan is not valid: ${problems.join(' ')}`);
    this.current = structuredClone(initial);
  }

  get plan(): Plan {
    return this.current;
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }

  apply(patch: Patch): PatchResult {
    const res = applyPatch(this.current, patch);
    if (!res.ok) return res;
    this.current = res.plan;
    this.undoStack.push({ label: patch.label, forward: patch.ops, inverse: res.inverse.ops });
    this.revisions.push(res.plan.revision);
    this.redoStack = [];
    return res;
  }

  undo(): PatchResult | null {
    const e = this.undoStack[this.undoStack.length - 1];
    if (!e) return null;
    const res = applyPatch(this.current, { baseRevision: this.current.revision, label: `Undo: ${e.label}`, ops: e.inverse });
    if (!res.ok) return res;
    this.undoStack.pop();
    this.revisions.pop();
    this.current = res.plan;
    this.redoStack.push(e);
    return res;
  }

  redo(): PatchResult | null {
    const e = this.redoStack[this.redoStack.length - 1];
    if (!e) return null;
    const res = applyPatch(this.current, { baseRevision: this.current.revision, label: e.label, ops: e.forward });
    if (!res.ok) return res;
    this.redoStack.pop();
    this.current = res.plan;
    this.undoStack.push(e);
    this.revisions.push(res.plan.revision);
    return res;
  }

  /** What has been done, oldest first, plus what could be redone. */
  entries(): { done: HistoryEntry[]; undone: string[] } {
    return {
      done: this.undoStack.map((e, i) => ({ label: e.label, revision: this.revisions[i] })),
      undone: [...this.redoStack].reverse().map((e) => e.label),
    };
  }
}
