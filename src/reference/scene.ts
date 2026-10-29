// The holistic read. The reader sees the whole picture and describes the scene in our vocabulary: layers back to front (type, role, an approximate box with a
// confidence, how the text is treated), how they relate (shared edges, equal margins, focal point, reading order, size ranking) and what the canvas is. For a
// deck it also says what is constant across the slides. The code then snaps every described layer to the box it measured (so positions and sizes stay the
// code's), keeps what it could not measure as APPROX, drops measured noise the reader did not mention, and enforces the relationships. One call.
import { FREE_ROLES, MAX_PHOTOS, MAX_SLOTS, type FreeLayout, type FreeRole, type FreeSlot } from '../image-engine/styles/free-spec';
import { SLIDE_TYPES, type SlideType } from '../image-engine/styles/format';
import { GRAPHIC_LABELS, parseLabels, type Labels } from './labels';
import type { Detected } from './regions';
import type { ReaderImage, ReferenceReader } from './reader';
import { ReaderError } from './reader';
import type { MissingTool } from './types';

export const LAYER_TYPES = ['text', 'photo', 'shape', 'graphic'] as const;
export type LayerType = (typeof LAYER_TYPES)[number];
export const EDGES = ['left', 'right', 'centre', 'top', 'bottom'] as const;
export type Edge = (typeof EDGES)[number];
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneLayer {
  id: string;
  type: LayerType;
  role?: FreeRole;
  box: Box;
  confidence: number;
  treatment?: string;
  graphic?: string;
}
export interface Scene {
  slideType: SlideType;
  layers: SceneLayer[];
  sharedEdges: { edge: Edge; layers: string[] }[];
  equalMargins: string[][];
  focal?: string;
  readingOrder: string[];
  hierarchy: string[];
  canvas: { background?: string; margins?: number; grid?: string };
}
export interface DeckRead {
  margins?: number;
  header?: string;
  footer?: string;
  pageNumber?: string;
  repeatedMarks: string[];
  varies: string[];
}
export interface SceneAnswer {
  scenes: Scene[];
  deck: DeckRead | null;
  photoImages: string[];
  missing: MissingTool[];
  notes: string;
}

const fmt = (b: Box) => `x ${b.x}%, y ${b.y}%, ${b.w}% wide, ${b.h}% tall`;

export function buildScenePrompt(names: string[]): string {
  return [
    'You read reference slides as a designer would: you look at the WHOLE picture and describe the scene. You never write code, SVG, CSS or drawing instructions.',
    'Reply with ONE JSON object and nothing else (no code fence, no explanation). The code measures every box exactly afterwards and snaps your layers to what it measured, so your boxes only need to be approximate (percent of the picture), but say honestly how sure you are.',
    '',
    `The reference images are the files in the current folder (look at each with your Read tool): ${names.join(', ')}.`,
    '',
    'For each reference give a scene:',
    `- slide_type, one of: ${SLIDE_TYPES.join(', ')}.`,
    `- layers, BACK TO FRONT (the first is the furthest back). Each: {"id": "L1", "type": one of ${LAYER_TYPES.join('/')}, "box": {"x","y","w","h"} in percent of the picture, "confidence": 0 to 1, and:`,
    `    for text: "role" one of ${FREE_ROLES.join(', ')}, and "treatment" in a few words (for example "capitals, black outline", "highlight box behind one word", "circled word");`,
    `    for graphic: "graphic" one of ${GRAPHIC_LABELS.join(', ')} ("unknown" if none fits: a logo, an icon, a person, a doodle)}.`,
    '  A photo is a picture; a shape is a flat box, pill, circle or bar; a graphic is any other drawn mark. Do not list every letter or tiny speck: only the layers a person would move.',
    '- relationships: "shared_edges": [{"edge": one of ' + EDGES.join('/') + ', "layers": ["L1","L3"]}] for layers that line up; "equal_margins": [["L1","L2"]] for layers whose distance to the picture edge is the same; "focal": the id the eye goes to first; "reading_order": ids in the order they are read; "hierarchy": ids from the biggest-looking to the smallest.',
    '- canvas: {"background": "flat" | "gradient" | "photo" | "split", "margins": the usual outer margin in percent, "grid": a few words}.',
    '',
    'If there is more than one reference (a deck), also give "deck": {"margins": percent, "header": ..., "footer": ..., "page_number": where it sits, "repeated_marks": [...], "varies": [what changes from slide to slide]} describing what is CONSTANT across the slides and what is not.',
    'Also give "images_with_photos": the file names that contain a photograph, "missing": [{"tool": "what you see that a text-and-shapes toolbox cannot draw", "why": "..."}] and "notes" (one sentence).',
    '',
    'Reply with: {"scenes": [{"ref": 1, "slide_type": "cover", "layers": [...], "relationships": {...}, "canvas": {...}}, ...one per reference, in order], "deck": {...} or null, "images_with_photos": [...], "missing": [...], "notes": "..."}',
  ].join('\n');
}

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 40) : []);

/** Checks the answer and clamps what is out of range (said in `problems`). An answer in the older labels shape is still accepted. */
export function parseScene(text: string, ids: { text: string[]; graphic: string[] }[]): { ok: true; answer: SceneAnswer | null; labels: Labels | null; problems: string[] } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    const m = /\{[\s\S]*\}/.exec(text);
    raw = JSON.parse(m ? m[0] : text);
  } catch {
    return { ok: false, errors: ['The answer was not JSON.'] };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, errors: ['The answer must be a JSON object.'] };
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.scenes)) {
    const l = parseLabels(text, ids);
    return l.ok ? { ok: true, answer: null, labels: l.labels, problems: l.problems } : { ok: false, errors: ['The answer has no "scenes".', ...l.errors] };
  }
  const problems: string[] = [];
  const scenes: Scene[] = [];
  for (const [si, s] of (r.scenes as unknown[]).entries()) {
    if (typeof s !== 'object' || s === null) continue;
    const o = s as Record<string, unknown>;
    const seen = new Set<string>();
    const layers: SceneLayer[] = [];
    for (const [li, l] of (Array.isArray(o.layers) ? o.layers : []).slice(0, 40).entries()) {
      const q = l as Record<string, unknown>;
      const id = typeof q?.id === 'string' && q.id ? q.id : `L${li + 1}`;
      const type = q?.type as LayerType;
      const b = q?.box as Record<string, unknown> | undefined;
      const box = b ? { x: num(b.x, 0, 100), y: num(b.y, 0, 100), w: num(b.w, 0, 100), h: num(b.h, 0, 100) } : null;
      if (!(LAYER_TYPES as readonly string[]).includes(type) || !box || box.x === null || box.y === null || box.w === null || box.h === null || seen.has(id)) {
        problems.push(`ref ${si + 1}: layer "${id}" was left out (needs a type from ${LAYER_TYPES.join(', ')}, a box in percent and its own id).`);
        continue;
      }
      seen.add(id);
      const role = (FREE_ROLES as readonly string[]).includes(q.role as string) ? (q.role as FreeRole) : undefined;
      if (type === 'text' && !role) problems.push(`ref ${si + 1}: text layer "${id}" has no valid role; it is read as body text.`);
      const graphic = (GRAPHIC_LABELS as readonly string[]).includes(q.graphic as string) ? (q.graphic as string) : undefined;
      layers.push({ id, type, role: type === 'text' ? (role ?? 'body') : undefined, box: { x: box.x, y: box.y, w: Math.min(box.w, 100 - box.x), h: Math.min(box.h, 100 - box.y) }, confidence: num(q.confidence, 0, 1) ?? 0.5, treatment: typeof q.treatment === 'string' ? q.treatment.slice(0, 80) : undefined, graphic });
    }
    const rel = (o.relationships ?? {}) as Record<string, unknown>;
    const known = (a: string[]) => a.filter((x) => seen.has(x));
    const canvas = (o.canvas ?? {}) as Record<string, unknown>;
    scenes.push({
      slideType: (SLIDE_TYPES as readonly string[]).includes(o.slide_type as string) ? (o.slide_type as SlideType) : si === 0 ? 'cover' : 'content',
      layers,
      sharedEdges: (Array.isArray(rel.shared_edges) ? rel.shared_edges : []).flatMap((e) => {
        const q = e as Record<string, unknown>;
        const ls = known(strs(q?.layers));
        return (EDGES as readonly string[]).includes(q?.edge as string) && ls.length >= 2 ? [{ edge: q.edge as Edge, layers: ls }] : [];
      }),
      equalMargins: (Array.isArray(rel.equal_margins) ? rel.equal_margins : []).map((g) => known(strs(g))).filter((g) => g.length >= 2),
      focal: typeof rel.focal === 'string' && seen.has(rel.focal) ? rel.focal : undefined,
      readingOrder: known(strs(rel.reading_order)),
      hierarchy: known(strs(rel.hierarchy)),
      canvas: { background: typeof canvas.background === 'string' ? canvas.background.slice(0, 20) : undefined, margins: num(canvas.margins, 0, 30) ?? undefined, grid: typeof canvas.grid === 'string' ? canvas.grid.slice(0, 60) : undefined },
    });
  }
  if (scenes.length === 0 || scenes.every((s) => s.layers.length === 0)) return { ok: false, errors: ['No scene had a usable layer.', ...problems.slice(0, 6)] };
  const dk = r.deck && typeof r.deck === 'object' ? (r.deck as Record<string, unknown>) : null;
  const deck: DeckRead | null = dk
    ? { margins: num(dk.margins, 0, 30) ?? undefined, header: typeof dk.header === 'string' ? dk.header.slice(0, 80) : undefined, footer: typeof dk.footer === 'string' ? dk.footer.slice(0, 80) : undefined, pageNumber: typeof dk.page_number === 'string' ? dk.page_number.slice(0, 60) : undefined, repeatedMarks: strs(dk.repeated_marks), varies: strs(dk.varies) }
    : null;
  const missing = (Array.isArray(r.missing) ? r.missing : []).flatMap((m) => (typeof m === 'object' && m !== null && typeof (m as { tool?: unknown }).tool === 'string' ? [{ tool: String((m as { tool: string }).tool).slice(0, 80), why: String((m as { why?: unknown }).why ?? '').slice(0, 160) }] : []));
  return { ok: true, labels: null, problems, answer: { scenes, deck, photoImages: strs(r.images_with_photos), missing, notes: typeof r.notes === 'string' ? r.notes.slice(0, 300) : '' } };
}

export interface SceneRead {
  answer: SceneAnswer | null;
  labels: Labels | null;
  problems: string[];
  ms: number;
  attempts: 1 | 2;
}

/** One call to the reader with the plain pictures. A second try is made once if the answer cannot be used, and counts as a call. */
export async function readScene(o: { reader: ReferenceReader; ds: Detected[]; names: string[]; images: ReaderImage[]; signal: AbortSignal }): Promise<SceneRead> {
  const ids = o.ds.map((d, i) => ({ text: d.texts.map((_, k) => `r${i + 1}T${k + 1}`), graphic: d.graphics.map((_, k) => `r${i + 1}G${k + 1}`) }));
  const prompt = buildScenePrompt(o.names);
  let a = await o.reader.read({ prompt, images: o.images }, o.signal);
  let total = a.ms;
  let p = parseScene(a.text, ids);
  let attempts: 1 | 2 = 1;
  if (!p.ok) {
    attempts = 2;
    a = await o.reader.read({ prompt: [prompt, '', 'Your previous answer was:', a.text.slice(0, 4000), '', 'It cannot be used, for these reasons:', ...p.errors.map((e) => `- ${e}`), '', 'Answer again with ONE JSON object that fixes this.'].join('\n'), images: o.images }, o.signal);
    total += a.ms;
    p = parseScene(a.text, ids);
  }
  if (!p.ok) throw new ReaderError('invalid', 'The reader answered twice, but neither answer could be used as labels or as a scene.', p.errors);
  return { answer: p.answer, labels: p.labels, problems: p.problems, ms: total, attempts };
}

// ----- reconcile with what the code measured -----

export interface ReconLayer {
  /** The reader's id, or "m:<id>" for a measured box the reader did not mention but that is clearly text. */
  id: string;
  type: LayerType;
  role?: FreeRole;
  graphic?: string;
  /** The id in the detection (text1, photo1...), or null for a layer the code could not find. */
  measured: string | null;
  box: Box;
  /** True when no measured box matched: the reader's approximate box is kept. */
  approx: boolean;
  /** Back to front, 1 is the furthest back. */
  order: number;
  confidence: number;
  treatment?: string;
}
export interface Guide {
  axis: 'x' | 'y';
  edge: Edge | 'margin';
  at: number;
  layers: string[];
  /** False when the layers were too far apart to be the same line, so nothing was moved. */
  enforced: boolean;
}
export interface ReconScene {
  ref: number;
  slideType: SlideType;
  layers: ReconLayer[];
  guides: Guide[];
  focal?: string;
  readingOrder: string[];
  hierarchy: string[];
  canvas: Scene['canvas'];
  dropped: string[];
}

const iou = (a: Box, b: Box) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / (a.w * a.h + b.w * b.h - w * h);
};
const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
/** How much of the smaller box lies inside the other (1: one is inside the other). */
const inter = (a: Box, b: Box) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const contained = (a: Box, b: Box) => inter(a, b) / Math.max(0.01, Math.min(a.w * a.h, b.w * b.h));
const score = (a: Box, b: Box) => {
  const ca = centre(a);
  const cb = centre(b);
  const dist = Math.hypot(ca.x - cb.x, ca.y - cb.y);
  const cont = contained(a, b);
  return iou(a, b) + (dist < 18 ? 0.5 * (1 - dist / 18) : 0) + (cont >= 0.6 ? 0.3 * cont : 0);
};
const SNAP = 3.5;
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/** Matches the described layers to the measured boxes, snaps them, drops measured noise, and enforces the relationships. */
export function reconcile(scene: Scene, d: Detected, ref: number, margin?: number): ReconScene {
  const pool: { id: string; type: LayerType; box: Box; keep: boolean }[] = [
    ...d.texts.map((t) => ({ id: t.id, type: 'text' as const, box: t.box, keep: t.box.h >= 1.5 && t.box.w >= 8 })),
    ...d.photos.map((p) => ({ id: p.id, type: 'photo' as const, box: p.box, keep: true })),
    ...d.shapes.map((s) => ({ id: s.id, type: 'shape' as const, box: s.box, keep: true })),
    ...d.graphics.map((g) => ({ id: g.id, type: 'graphic' as const, box: g.box, keep: true })),
  ];
  const used = new Set<string>();
  const order = new Map(scene.layers.map((l, i) => [l.id, i + 1]));
  const layers: ReconLayer[] = [];
  for (const l of [...scene.layers].sort((a, b) => b.confidence - a.confidence)) {
    let best: (typeof pool)[number] | null = null;
    let bs = 0.12;
    for (const m of pool) {
      if (m.type !== l.type || used.has(m.id)) continue;
      const s = score(l.box, m.box);
      if (s > bs) {
        bs = s;
        best = m;
      }
    }
    if (best) used.add(best.id);
    layers.push({ id: l.id, type: l.type, role: l.role, graphic: l.graphic, measured: best?.id ?? null, box: best ? { ...best.box } : { ...l.box }, approx: !best, order: order.get(l.id)!, confidence: l.confidence, treatment: l.treatment });
  }
  const dropped: string[] = [];
  let extra = scene.layers.length;
  for (const m of pool) {
    if (used.has(m.id)) continue;
    // Only a measured TEXT box can be noise the reader left out; a shape, photo or graphic stays unless a described layer of about its size covers it.
    const covered = m.type !== 'text' && scene.layers.some((l) => l.box.w * l.box.h <= 3 * m.box.w * m.box.h && inter(l.box, m.box) >= 0.6 * m.box.w * m.box.h);
    if (m.keep && !covered) layers.push({ id: `m:${m.id}`, type: m.type, measured: m.id, box: { ...m.box }, approx: false, order: ++extra, confidence: 0.4 });
    else dropped.push(m.id);
  }
  layers.sort((a, b) => a.order - b.order);
  const byId = new Map(layers.map((l) => [l.id, l]));
  const guides: Guide[] = [];
  const edgeOf = (b: Box, e: Edge) => (e === 'left' ? b.x : e === 'right' ? b.x + b.w : e === 'centre' ? b.x + b.w / 2 : e === 'top' ? b.y : b.y + b.h);
  const setEdge = (l: ReconLayer, e: Edge, v: number) => {
    if (e === 'left') l.box.x = v;
    else if (e === 'right') l.box.x = v - l.box.w;
    else if (e === 'centre') l.box.x = v - l.box.w / 2;
    else if (e === 'top') l.box.y = v;
    else l.box.y = v - l.box.h;
  };
  const line = (ids: string[], e: Edge | 'margin', axis: 'x' | 'y') => {
    const ls = ids.map((i) => byId.get(i)).filter((x): x is ReconLayer => !!x);
    if (ls.length < 2) return;
    const edge: Edge = e === 'margin' ? 'left' : e;
    const vals = ls.map((l) => edgeOf(l.box, edge));
    const at = median(vals);
    const ok = Math.max(...vals) - Math.min(...vals) <= SNAP;
    if (ok) ls.forEach((l) => setEdge(l, edge, at));
    guides.push({ axis, edge: e, at: Math.round(at * 10) / 10, layers: ls.map((l) => l.id), enforced: ok });
  };
  for (const g of scene.sharedEdges) line(g.layers, g.edge, g.edge === 'top' || g.edge === 'bottom' ? 'y' : 'x');
  for (const g of scene.equalMargins) line(g, 'margin', 'x');
  // The deck's constant margin: layers that start near it start on it.
  if (margin !== undefined) {
    const near = layers.filter((l) => l.type !== 'graphic' && Math.abs(l.box.x - margin) <= SNAP && l.box.x !== margin);
    if (near.length) {
      near.forEach((l) => (l.box.x = margin));
      guides.push({ axis: 'x', edge: 'margin', at: margin, layers: near.map((l) => l.id), enforced: true });
    }
  }
  return { ref, slideType: scene.slideType, layers, guides, focal: scene.focal, readingOrder: scene.readingOrder, hierarchy: scene.hierarchy, canvas: scene.canvas, dropped };
}

/** The labels the rest of the flow uses, from the reconciled scenes (the role of each measured text box, the kind of each measured graphic). */
export function labelsOf(answer: SceneAnswer, recs: ReconScene[]): Labels {
  const roles: Record<string, FreeRole> = {};
  const graphics: Record<string, string> = {};
  const emphasis: Record<string, string> = {};
  recs.forEach((rec, ri) => {
    for (const l of rec.layers) {
      if (!l.measured) continue;
      const k = (kind: 'T' | 'G') => `r${ri + 1}${kind}${Number(l.measured!.replace(/\D/g, ''))}`;
      if (l.type === 'text' && l.role) roles[k('T')] = l.role;
      if (l.type === 'text' && l.treatment) emphasis[k('T')] = l.treatment;
      if (l.type === 'graphic' && l.graphic) graphics[k('G')] = l.graphic;
    }
  });
  return { roles, graphics, emphasis, seenSlideTypes: recs.map((r) => r.slideType), photoImages: answer.photoImages, missing: answer.missing, notes: answer.notes };
}

/**
 * Builds the layout from the scene: the measured slots, photos and shapes moved to their snapped places, noise removed, in reading order, and what could not
 * be measured added at the reader's approximate place (APPROX). Sizes stay the measured ones.
 */
export function applyScene(free: FreeLayout, d: Detected, rec: ReconScene): FreeLayout {
  const byMeasured = new Map(rec.layers.filter((l) => l.measured).map((l) => [l.measured!, l]));
  const orig = new Map<string, Box>([...d.texts.map((t) => [t.id, t.box] as const), ...d.photos.map((p) => [p.id, p.box] as const), ...d.shapes.map((s) => [s.id, s.box] as const)]);
  const shift = <T extends { id: string; box: Box }>(it: T): T => {
    const l = byMeasured.get(it.id);
    const o = orig.get(it.id);
    if (!l || !o) return it;
    return { ...it, box: { ...it.box, x: Math.round((it.box.x + l.box.x - o.x) * 10) / 10, y: Math.round((it.box.y + l.box.y - o.y) * 10) / 10 } };
  };
  const rank = (id: string) => {
    const l = byMeasured.get(id);
    const i = l ? rec.readingOrder.indexOf(l.id) : -1;
    return i < 0 ? 999 : i;
  };
  const droppedIds = new Set(rec.dropped);
  let slots = free.slots.filter((s) => !droppedIds.has(s.id)).map(shift);
  slots = [...slots].sort((a, b) => rank(a.id) - rank(b.id));
  const photos = free.photos.filter((p) => !droppedIds.has(p.id)).map(shift);
  const shapes = free.shapes.filter((s) => !droppedIds.has(s.id)).map(shift);
  const missing = [...(free.missing ?? [])];
  const template: FreeSlot | undefined = slots[0];
  let n = 0;
  for (const l of rec.layers.filter((x) => x.approx)) {
    if (l.type === 'text' && template && slots.length < MAX_SLOTS) {
      const lines = Math.max(1, Math.min(6, Math.round(l.box.h / 4)));
      slots.push({ ...template, id: `approx${++n}`, role: l.role ?? 'body', box: l.box, maxLines: lines, sizePx: Math.max(32, Math.round(((l.box.h / 100) * 1350) / lines / 1.25)), treatments: [] });
    } else if (l.type === 'photo' && photos.some((p) => inter(l.box, p.box) >= 0.5 * l.box.w * l.box.h)) continue;
    else if (l.type === 'photo' && photos.length < MAX_PHOTOS) photos.push({ id: `approx${++n}`, box: l.box, shape: 'rect' });
    else missing.push(`${l.type} ${l.id} (${l.role ?? l.graphic ?? 'no role'}) was described by the reader but not measured: APPROX at ${fmt(l.box)}, not drawn`);
  }
  return { ...free, slots, photos, shapes, missing: [...new Set(missing)] };
}

/** Moves the layers that share a line with a moved layer by the same amount, so an edit keeps the relationships (unless the person breaks them). */
export function keepRelations(rec: ReconScene, movedSlot: string, dx: number, dy: number): Map<string, { dx: number; dy: number }> {
  const out = new Map<string, { dx: number; dy: number }>();
  const l = rec.layers.find((x) => x.measured === movedSlot);
  if (!l) return out;
  for (const g of rec.guides) {
    if (!g.enforced || !g.layers.includes(l.id)) continue;
    for (const id of g.layers) {
      const o = rec.layers.find((x) => x.id === id);
      if (!o?.measured || o.id === l.id) continue;
      const cur = out.get(o.measured) ?? { dx: 0, dy: 0 };
      out.set(o.measured, g.axis === 'x' ? { dx, dy: cur.dy } : { dx: cur.dx, dy });
    }
  }
  return out;
}
