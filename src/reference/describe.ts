// Describe the look: a short text description becomes a free layout (the same schema the reference reads use), in ONE model call; a follow-up in plain words
// becomes a small patch to that scene in ONE more small text call. Every answer is validated and clamped; what the toolbox cannot draw is listed, never faked.
import { useSyncExternalStore } from 'react';
import { FREE_ROLES, FREE_SHAPES, FREE_TREATMENTS, MAX_GRAPHICS, MAX_PHOTOS, MAX_SHAPES, MAX_SLOTS, type FreeBackground, type FreeBox, type FreeLayout, type FreePhoto, type FreeRole, type FreeTreatmentKind } from '../image-engine/styles/free-spec';
import { MARK_KINDS } from '../image-engine/styles/marks-spec';
import { SLIDE_TYPES, type StyleSpec } from '../image-engine/styles/format';
import { blankStyle } from './blank';
import { defaultThumbnail } from './spec';
import type { ReaderImage, ReferenceReader } from './reader';

/** Model calls the describe box may make in one session (a page load): one to describe, the rest for follow-ups. */
export const DESCRIBE_CAP = 3;
let used = 0;
const listeners = new Set<() => void>();
export const describeCalls = () => used;
const count = () => {
  used++;
  listeners.forEach((l) => l());
};
export const useDescribeCalls = () => useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), () => used);

export interface DLayer {
  id: string;
  type: 'text' | 'photo' | 'shape' | 'graphic';
  role?: FreeRole;
  box: FreeBox;
  colour?: string;
  align?: 'left' | 'centre' | 'right';
  anchor?: 'top' | 'middle' | 'bottom';
  lines?: number;
  size?: number;
  treatments?: FreeTreatmentKind[];
  shape?: (typeof FREE_SHAPES)[number];
  graphic?: string;
  angle?: number;
  photoShape?: FreePhoto['shape'];
}
export interface DScene {
  background: FreeBackground;
  layers: DLayer[];
  /** What the description asked for that the toolbox cannot draw. */
  couldNot: string[];
}

export const EXAMPLES = [
  'Big bold title on the left, my photo filling the right half, a yellow pill behind one word',
  'Dark background, huge centred title in capitals with an outline, a red arrow pointing down at it',
  'Photo across the whole top, a solid colour block under it with the title in white, small label above the title',
  'Clean light layout: title top left, a thin line under it, a sparkle in the corner',
];

const COMPACT = `Roles: ${FREE_ROLES.join(', ')}. Text treatments: ${FREE_TREATMENTS.join(', ')}. Shapes: ${FREE_SHAPES.join(', ')}. Marks (graphics): ${MARK_KINDS.join(', ')}. Photo shapes: rect, rounded, circle, full-bleed. Backgrounds: flat, gradient, split, photo.`;
const JSON_SHAPE = '{"background": {"kind": "flat|gradient|split|photo", "colours": ["#rrggbb", ...], "direction": "vertical|horizontal"}, "layers": [{"id": "L1", "type": "text", "role": "title", "box": {"x": 8, "y": 10, "w": 60, "h": 30}, "align": "left|centre|right", "anchor": "top|middle|bottom", "lines": 2, "size": 140, "colour": "#rrggbb", "treatments": ["caps"]}, {"id": "L2", "type": "shape", "shape": "pill", "box": {...}, "colour": "#rrggbb"}, {"id": "L3", "type": "graphic", "graphic": "arrow", "box": {...}, "colour": "#rrggbb", "angle": -20}, {"id": "L4", "type": "photo", "photoShape": "rect", "box": {...}}], "relationships": {"shared_edges": [{"edge": "left", "layers": ["L1","L2"]}]}, "could_not": ["..."]}';

export interface DescribeContext {
  canvas: { w: number; h: number };
  title: string;
  hasPhoto: boolean;
  hasCutout: boolean;
  hasReference: boolean;
}

export function buildDescribePrompt(description: string, x: DescribeContext, skeleton: DScene | null): string {
  return [
    '[describe:new] You design the layout of one slide or thumbnail from a short description. You never write code, SVG or CSS. Reply with ONE JSON object and nothing else.',
    `The canvas is ${x.canvas.w} x ${x.canvas.h} px. All boxes are percent of the canvas: x, y, w, h. Layers go BACK TO FRONT (the first is furthest back).`,
    `The person's own title is "${x.title.slice(0, 80) || '(not typed yet)'}": you do not write words, text layers only say where words go and how they look. The person ${x.hasPhoto ? 'has' : 'has no'} photo and ${x.hasCutout ? 'has' : 'has no'} cutout (a subject with its background removed); ${x.hasReference ? 'a reference picture is attached: take its look as context' : 'no reference picture is attached'}.`,
    `The toolbox: ${COMPACT}`,
    `Limits: at most ${MAX_SLOTS} text layers, ${MAX_SHAPES} shapes, ${MAX_GRAPHICS} graphics, ${MAX_PHOTOS} photos. Keep the title big enough to read on a phone and give text high contrast against what is behind it.`,
    'If the description asks for something the toolbox cannot draw (3D, a particular logo, a font, a texture, a hand-drawn doodle), do NOT fake it: put it in "could_not" as a short phrase.',
    `Reply with this JSON: ${JSON_SHAPE}`,
    skeleton ? `Start from this skeleton and change it to fit the description: ${JSON.stringify({ background: skeleton.background, layers: skeleton.layers })}` : '',
    `Description: "${description.slice(0, 400)}"`,
  ].filter(Boolean).join('\n');
}

export function buildEditPrompt(instruction: string, scene: DScene, x: DescribeContext): string {
  return [
    '[describe:edit] You change a slide layout in small steps. You never write code. Reply with ONE JSON object and nothing else.',
    `The canvas is ${x.canvas.w} x ${x.canvas.h} px; boxes are percent of the canvas. The toolbox: ${COMPACT}`,
    `The current layout: ${JSON.stringify({ background: scene.background, layers: scene.layers })}`,
    `The person says: "${instruction.slice(0, 300)}"`,
    'Reply with only the changes: {"patches": [{"op": "set", "id": "L1", "set": {any fields of that layer}}, {"op": "add", "layer": {a new layer, same fields as above}}, {"op": "remove", "id": "L3"}, {"op": "background", "background": {"kind": ..., "colours": [...]}}], "could_not": ["anything asked that the toolbox cannot draw"]}',
  ].join('\n');
}

// ----- validation -----

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const hex = (v: unknown): string | undefined => (typeof v === 'string' && HEX.test(v) ? v : undefined);

export function cleanLayer(raw: unknown, taken: Set<string>, problems: string[], couldNot: string[]): DLayer | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as DLayer['type'];
  const b = r.box as Record<string, unknown> | undefined;
  const box = b ? { x: num(b.x, 0, 100), y: num(b.y, 0, 100), w: num(b.w, 1, 100), h: num(b.h, 1, 100) } : null;
  let id = typeof r.id === 'string' && r.id ? r.id.slice(0, 20) : '';
  if (!['text', 'photo', 'shape', 'graphic'].includes(type) || !box || box.x === null || box.y === null || box.w === null || box.h === null) {
    problems.push(`A layer${id ? ` "${id}"` : ''} was left out: it needs a type (text, photo, shape, graphic) and a box in percent.`);
    return null;
  }
  if (!id || taken.has(id)) id = `L${taken.size + 1}x${Math.floor(Math.random() * 90 + 10)}`;
  taken.add(id);
  const L: DLayer = { id, type, box: { x: box.x, y: box.y, w: Math.min(box.w, 100 - box.x), h: Math.min(box.h, 100 - box.y) }, colour: hex(r.colour) };
  if (typeof r.angle === 'number') L.angle = num(r.angle, -180, 180) ?? undefined;
  if (type === 'text') {
    L.role = (FREE_ROLES as readonly string[]).includes(r.role as string) ? (r.role as FreeRole) : 'body';
    L.align = r.align === 'centre' || r.align === 'center' ? 'centre' : r.align === 'right' ? 'right' : 'left';
    L.anchor = r.anchor === 'top' || r.anchor === 'bottom' ? r.anchor : 'middle';
    L.lines = Math.round(num(r.lines, 1, 6) ?? 2);
    L.size = num(r.size, 32, 420) ?? undefined;
    L.treatments = (Array.isArray(r.treatments) ? r.treatments : []).filter((t): t is FreeTreatmentKind => (FREE_TREATMENTS as readonly string[]).includes(t as string));
  } else if (type === 'shape') {
    L.shape = (FREE_SHAPES as readonly string[]).includes(r.shape as string) ? (r.shape as DLayer['shape']) : 'rect';
  } else if (type === 'graphic') {
    if (!(MARK_KINDS as readonly string[]).includes(r.graphic as string)) {
      couldNot.push(`a "${String(r.graphic ?? 'graphic').slice(0, 30)}" mark (the toolbox has: ${MARK_KINDS.slice(0, 8).join(', ')}, ...)`);
      taken.delete(id);
      return null;
    }
    L.graphic = r.graphic as string;
  } else {
    L.photoShape = ['rect', 'rounded', 'circle', 'full-bleed'].includes(r.photoShape as string) ? (r.photoShape as FreePhoto['shape']) : 'rect';
  }
  return L;
}

function cleanBackground(raw: unknown, problems: string[]): FreeBackground {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const colours = (Array.isArray(r.colours) ? r.colours : []).map(hex).filter((c): c is string => !!c).slice(0, 2);
  const kind = ['flat', 'gradient', 'split', 'photo'].includes(r.kind as string) ? (r.kind as FreeBackground['kind']) : 'flat';
  if (!colours.length) {
    problems.push('The background had no usable colour, so it is white.');
    colours.push('#FFFFFF');
  }
  if ((kind === 'gradient' || kind === 'split') && colours.length < 2) colours.push(colours[0]);
  return { kind, colours, ...(r.direction === 'horizontal' ? { direction: 'horizontal' as const } : {}) };
}

/** Lines that share an edge within 3.5% sit on it exactly. */
function snapEdges(layers: DLayer[], groups: unknown) {
  for (const g of Array.isArray(groups) ? groups : []) {
    const q = g as { edge?: string; layers?: unknown };
    const ls = (Array.isArray(q.layers) ? q.layers : []).map((id) => layers.find((l) => l.id === id)).filter((l): l is DLayer => !!l);
    if (ls.length < 2) continue;
    const e = q.edge;
    const val = (l: DLayer) => (e === 'left' ? l.box.x : e === 'right' ? l.box.x + l.box.w : e === 'centre' ? l.box.x + l.box.w / 2 : e === 'top' ? l.box.y : l.box.y + l.box.h);
    if (!['left', 'right', 'centre', 'top', 'bottom'].includes(e ?? '')) continue;
    const vs = ls.map(val);
    if (Math.max(...vs) - Math.min(...vs) > 3.5) continue;
    const at = [...vs].sort((a, b) => a - b)[Math.floor(vs.length / 2)];
    for (const l of ls) {
      if (e === 'left') l.box.x = at;
      else if (e === 'right') l.box.x = at - l.box.w;
      else if (e === 'centre') l.box.x = at - l.box.w / 2;
      else if (e === 'top') l.box.y = at;
      else l.box.y = at - l.box.h;
    }
  }
}

const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((s) => s.slice(0, 120)).slice(0, 8) : []);
const parseJson = (text: string): Record<string, unknown> | null => {
  try {
    const m = /\{[\s\S]*\}/.exec(text);
    const o = JSON.parse(m ? m[0] : text);
    return typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export function parseDescribe(text: string): { ok: true; scene: DScene; problems: string[] } | { ok: false; errors: string[] } {
  const r = parseJson(text);
  if (!r || !Array.isArray(r.layers)) return { ok: false, errors: ['The answer was not a layout (JSON with "layers").'] };
  const problems: string[] = [];
  const couldNot = strs(r.could_not);
  const taken = new Set<string>();
  const layers: DLayer[] = [];
  for (const l of r.layers.slice(0, 40)) {
    const c = cleanLayer(l, taken, problems, couldNot);
    if (c) layers.push(c);
  }
  if (layers.length === 0) return { ok: false, errors: ['No layer in the answer could be used.', ...problems.slice(0, 4)] };
  snapEdges(layers, (r.relationships as { shared_edges?: unknown } | undefined)?.shared_edges);
  const background = cleanBackground(r.background, problems);
  // A photo background is the photo filling the canvas.
  return { ok: true, scene: { background, layers, couldNot }, problems };
}

export type DPatch = { op: 'set'; id: string; set: Record<string, unknown> } | { op: 'add'; layer: unknown } | { op: 'remove'; id: string } | { op: 'background'; background: unknown };

export function parseEdit(text: string): { ok: true; patches: DPatch[]; couldNot: string[] } | { ok: false; errors: string[] } {
  const r = parseJson(text);
  if (!r || !Array.isArray(r.patches)) return { ok: false, errors: ['The answer was not a list of changes (JSON with "patches").'] };
  const patches = r.patches.flatMap((p): DPatch[] => {
    const q = p as Record<string, unknown>;
    if (q?.op === 'set' && typeof q.id === 'string' && typeof q.set === 'object' && q.set) return [{ op: 'set', id: q.id, set: q.set as Record<string, unknown> }];
    if (q?.op === 'add' && q.layer) return [{ op: 'add', layer: q.layer }];
    if (q?.op === 'remove' && typeof q.id === 'string') return [{ op: 'remove', id: q.id }];
    if (q?.op === 'background' && q.background) return [{ op: 'background', background: q.background }];
    return [];
  });
  return { ok: true, patches: patches.slice(0, 12), couldNot: strs(r.could_not) };
}

/** Applies the changes to a scene (a new scene; the old one stays for Undo). Every changed layer is validated again. */
export function applyEdit(scene: DScene, patches: DPatch[], couldNot: string[]): { scene: DScene; problems: string[] } {
  const problems: string[] = [];
  const cn = [...scene.couldNot, ...couldNot];
  let layers = scene.layers.map((l) => ({ ...l, box: { ...l.box } }));
  let background = scene.background;
  const taken = new Set(layers.map((l) => l.id));
  for (const p of patches) {
    if (p.op === 'remove') layers = layers.filter((l) => l.id !== p.id);
    else if (p.op === 'background') background = cleanBackground({ ...background, ...(p.background as object) }, problems);
    else if (p.op === 'add') {
      const c = cleanLayer(p.layer, taken, problems, cn);
      if (c) layers.push(c);
    } else {
      const i = layers.findIndex((l) => l.id === p.id);
      if (i < 0) {
        problems.push(`There is no layer "${p.id}" to change.`);
        continue;
      }
      const old = layers[i];
      const merged = { ...old, ...p.set, box: { ...old.box, ...((p.set.box as object) ?? {}) }, id: old.id, type: old.type };
      const t = new Set(taken);
      t.delete(old.id);
      const c = cleanLayer(merged, t, problems, cn);
      if (c) layers[i] = c;
    }
  }
  return { scene: { background, layers: layers.slice(0, 30), couldNot: [...new Set(cn)].slice(0, 10) }, problems };
}

// ----- the scene as a free layout and as a style -----

const SIZE: Record<FreeRole, number> = { title: 140, number: 200, subtitle: 72, body: 52, label: 40, button: 52, decoration: 60 };

export function sceneToFree(s: DScene): FreeLayout {
  const text = s.layers.filter((l) => l.type === 'text').slice(0, MAX_SLOTS);
  const bg: FreeLayout['background'] = s.background.kind === 'photo' ? { kind: 'flat', colours: [s.background.colours[0] ?? '#FFFFFF'] } : s.background;
  const photos = s.layers.filter((l) => l.type === 'photo').map((l) => ({ id: l.id, box: l.box, shape: l.photoShape ?? 'rect' }));
  if (s.background.kind === 'photo' && !photos.some((p) => p.shape === 'full-bleed')) photos.unshift({ id: 'bgphoto', box: { x: 0, y: 0, w: 100, h: 100 }, shape: 'full-bleed' });
  return {
    background: bg,
    photos: photos.slice(0, MAX_PHOTOS),
    shapes: s.layers.filter((l) => l.type === 'shape').slice(0, MAX_SHAPES).map((l) => ({ id: l.id, kind: l.shape ?? 'rect', box: l.box, colour: l.colour ?? '#888888', ...(l.angle ? { angle: l.angle } : {}) })),
    graphics: s.layers.filter((l) => l.type === 'graphic').slice(0, MAX_GRAPHICS).map((l) => ({ id: l.id, kind: l.graphic!, box: l.box, colour: l.colour ?? '#111111', ...(l.angle ? { angle: l.angle } : {}) })),
    slots: text.map((l) => ({
      id: l.id,
      role: l.role ?? 'body',
      box: l.box,
      align: l.align ?? 'left',
      maxLines: l.lines ?? 2,
      anchor: l.anchor ?? 'middle',
      sizePx: l.size ?? SIZE[l.role ?? 'body'],
      ...(l.colour ? { colour: l.colour } : {}),
      treatments: (l.treatments ?? []).map((kind) => (kind === 'tilt' ? { kind, angle: -6 } : { kind })),
    })),
    missing: s.couldNot,
  };
}

/** A stored layout from the gallery as a scene, to start from. */
export function freeToScene(f: FreeLayout): DScene {
  const layers: DLayer[] = [
    ...f.photos.map((p): DLayer => ({ id: p.id, type: 'photo', box: p.box, photoShape: p.shape })),
    ...f.shapes.map((p): DLayer => ({ id: p.id, type: 'shape', box: p.box, shape: p.kind, colour: p.colour })),
    ...f.graphics.map((p): DLayer => ({ id: p.id, type: 'graphic', box: p.box, graphic: p.kind, colour: p.colour })),
    ...f.slots.map((p): DLayer => ({ id: p.id, type: 'text', role: p.role, box: p.box, align: p.align, anchor: p.anchor, lines: p.maxLines, size: p.sizePx, colour: p.colour, treatments: p.treatments.filter((t) => !t.off).map((t) => t.kind) })),
  ];
  return { background: f.background.kind === 'photo' ? { kind: 'flat', colours: f.background.colours } : f.background, layers, couldNot: [] };
}

/** The style that draws the scene: the plain style with this layout on every slide type (a thumbnail also gets its own look block). */
export function specFromFree(free: FreeLayout, target: 'thumbnail' | 'carousel'): StyleSpec {
  const base = blankStyle();
  const spec = { ...base, name: 'described', title: 'Described layout', free: Object.fromEntries(SLIDE_TYPES.map((t) => [t, free])) } as StyleSpec;
  return target === 'thumbnail' ? { ...spec, thumbnail: defaultThumbnail(spec) } : spec;
}

// ----- the calls -----

export class CapReached extends Error {}

/** One text call. Counts against the session's cap before it is made. */
export async function callDescribe(reader: ReferenceReader, prompt: string, images: ReaderImage[], signal: AbortSignal): Promise<string> {
  if (used >= DESCRIBE_CAP) throw new CapReached(`The limit of ${DESCRIBE_CAP} model calls for describing is reached in this session. Reload the page to start over, or change the layout by hand.`);
  count();
  return (await reader.read({ prompt, images }, signal)).text;
}
