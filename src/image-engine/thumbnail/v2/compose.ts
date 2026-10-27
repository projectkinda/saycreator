// Thumbnails, version 2: built on the carousel's toolbox (text, markers, photo treatments, glass, objects, elements) and on a style's
// "thumbnail" block. Every option is a plain plan, so it can be edited with patches. Needs the fonts loaded (text is measured).
// The subject is the person's pointer on the photo, not detection: the title, the elements and the object stay off it.
import { contrast, luminance, parseColor } from '../../lint/color';
import { buildText, ellipse, marker, rect, solidOf, TRANSPARENT, type Built } from '../../carousel/toolbox';
import type { Palette } from '../../carousel/types';
import { textInk } from '../../carousel/lint';
import type { Highlight, Layer, Plan, TextLayer, Treatment, ThumbnailAspect } from '../../types';
import { photoLayer } from '../../photo/frames';
import { objectLayer, type ObjectInput } from '../../photo/objects';
import type { PhotoInput } from '../../photo/zones';
import { resolveColor, resolveTreatments } from '../../photo/resolve';
import { asTheme } from '../../styles/compose';
import { placeElements } from '../../styles/elements';
import type { LoadedStyle } from '../../styles/load';
import { fitSubject, fitSubjectZoom, subjectRadius, type Box, type Pt, type SubjectPoint } from './subject';
import { THUMB_LAYOUTS, type ThumbLayoutId, type ThumbSpec } from './spec';

export const THUMB_SIZES = { '16:9': { width: 1280, height: 720 }, '9:16': { width: 1080, height: 1920 } } as const;

export interface ThumbRequest {
  aspect: ThumbnailAspect;
  /** Up to 4 words are expected; more are drawn and fail the title-length check. */
  title: string;
  /** The one word to stress. Left out: the last word. */
  emphasis?: string;
  photo: PhotoInput;
  /** Where the subject is on the photo (the person's pointer, or a guess). */
  subject: SubjectPoint;
  /** A transparent object picture, for the "object and title" layout. */
  object?: ObjectInput;
  /** A second photo (and its subject), for "before and after". */
  second?: { photo: PhotoInput; subject: SubjectPoint };
  /** A number to show big in the number badge. Left out: the first number in the title, if there is one. */
  badge?: string;
  /** The person's treatment for the photo, in place of the style's. An empty list leaves the photo as it is. */
  treatments?: Treatment[];
  /** Only these layouts (in this order), when the style and the pictures allow them. */
  layouts?: ThumbLayoutId[];
  /** Makes the picking of elements repeatable. */
  seed?: string;
}

export interface SubjectZone extends Pt {
  r: number;
  /** "photo" or "photo-after": the layer whose subject this is. */
  of: string;
}

export interface ThumbOption {
  id: string;
  layout: ThumbLayoutId;
  styleName: string;
  styleTitle: string;
  aspect: ThumbnailAspect;
  plan: Plan;
  titleLayerId: 'title';
  photoLayerId: 'photo';
  /** Where the subject(s) really ended up on the canvas, with the radius the title and elements keep clear of. */
  subjects: SubjectZone[];
  /** The photos' layer ids, so the checker can read each crop. */
  photoLayerIds: string[];
  elementsUsed: string[];
  notes: string[];
}

const NUMBER_RE = /^[+$€£]?\d[\d.,]*[%kKmMxX+]?$/;
/** The first number-looking word of a title, so a badge never shows a number the person did not write. */
export function numberIn(title: string): string | null {
  return title.trim().split(/\s+/).find((w) => NUMBER_RE.test(w)) ?? null;
}

interface Ctx {
  req: ThumbRequest;
  style: LoadedStyle;
  tb: ThumbSpec;
  pal: Palette;
  theme: ReturnType<typeof asTheme>;
  W: number;
  H: number;
  m: number;
  portrait: boolean;
  layers: Layer[];
  notes: string[];
  subjects: SubjectZone[];
  /** Areas elements must keep out of (besides text and containers, which they avoid anyway). */
  keep: Box[];
  treatments: Treatment[];
  scrim: string;
  /** The words of the title for this layout, and the word to stress. */
  text: string;
  emphasis: string | undefined;
  /** The "title" text layer once placed. */
  title?: TextLayer;
}

const tok = (pal: Palette, role: string): string => solidOf(pal[role as keyof Palette] as never);
const ON: Record<string, string> = { accent: 'onAccent', marker: 'onMarker', surface: 'onSurface' };
const rgba = (css: string, a: number) => {
  const { rgb } = parseColor(css);
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.round(a * 1000) / 1000})`;
};
const ratio = (a: string, b: string) => contrast(luminance(...parseColor(a).rgb), luminance(...parseColor(b).rgb));

/** The photo as a layer, cropped so the subject lands near `target` of its box. Records the subject's real place. */
function putPhoto(c: Ctx, id: string, photo: PhotoInput, subject: Pt, box: Box, target: Pt, treatments: Treatment[], zoom = false): Pt {
  // A photo that fills the canvas may be drawn a little bigger and slid, so the subject can land where the layout wants it.
  const z = zoom ? fitSubjectZoom(box, photo, subject, target) : null;
  const fit = z ?? fitSubject(box, photo, subject, target);
  if (z && z.zoom > 1) c.notes.push(`The photo is drawn ${Math.round((z.zoom - 1) * 100)}% bigger so the subject sits where this layout wants it.`);
  const at0 = z ? z.box : box;
  c.layers.push(photoLayer(id, at0.x, at0.y, at0.width, at0.height, { src: photo.src, focal: fit.focal, treatments: treatments.length ? treatments : undefined, ...(photo.synthetic ? { synthetic: true } : {}), width: photo.width, height: photo.height }, { name: id === 'photo' ? 'Photo' : 'Photo (after)', role: 'decor' }));
  c.subjects.push({ x: fit.at.x, y: fit.at.y, r: subjectRadius(c.W, c.H), of: id });
  c.keep.push({ x: fit.at.x - subjectRadius(c.W, c.H), y: fit.at.y - subjectRadius(c.W, c.H), width: 2 * subjectRadius(c.W, c.H), height: 2 * subjectRadius(c.W, c.H) });
  return fit.at;
}

interface TitleOpts {
  valign: 'top' | 'middle' | 'bottom';
  align?: 'left' | 'center';
  /** "photo": letters straight on a darkened photo, set the way the style says. "block": letters on a solid colour (a block, a plate). */
  on: 'photo' | 'block';
  /** The colour of the block the letters sit on (a palette role), when on is "block". */
  ground?: string;
  size?: number;
  minSize?: number;
  /** Put a plate behind the text (look "plate", or always on a busy photo). */
  forcePlate?: boolean;
  /** A fade of the scrim colour from this edge of the canvas, solid under the whole title and fading beyond it. */
  scrim?: 'top' | 'bottom' | 'left' | 'right';
  /** Something else the scrim must also cover (a badge), as a box. */
  scrimReach?: Box;
}

/** Sets the title: measures it, places it in the box, gives it the style's look, and adds what it needs behind it. */
function setTitle(c: Ctx, box: Box, o: TitleOpts): Box {
  const { style, tb, pal } = c;
  const look = o.on === 'block' ? 'plain' : o.forcePlate ? 'plate' : tb.title.look;
  const lh = Math.min(1.05, Math.max(0.95, style.spec.headlineLineHeight));
  const weight = tb.title.weight ?? style.spec.fonts.headlineWeight;
  const groundRole = o.on === 'block' ? (o.ground ?? tb.block ?? 'accent') : tb.title.ground ?? 'accent';
  const blockLetters = ON[groundRole] ?? 'text';
  const letter = o.on === 'block' ? tok(pal, blockLetters) : look === 'plate' ? tok(pal, ON[groundRole] ?? tb.title.colour) : tok(pal, tb.title.colour);
  const pad = look === 'plate' ? Math.round(c.m * 0.5) : 0;
  // An outline grows past the letters by half its width on every side: leave that room inside the box.
  const outlineRoom = look === 'outline' ? Math.round((o.size ?? (c.portrait ? 200 : 168)) * 0.06) : 0;
  const size0 = o.size ?? (c.portrait ? 200 : 168);
  const minSize = o.minSize ?? (c.portrait ? 84 : 84);
  const built: Built = buildText({ id: 'title', x: 0, y: 0, width: box.width - 2 * pad - 2 * outlineRoom, maxHeight: box.height - 2 * pad - 2 * outlineRoom, text: c.text, font: style.spec.fonts.headline, weight, size: size0, minSize, color: letter, lineHeight: lh, align: o.align ?? 'left', balance: true, upper: (tb.title.case ?? 'upper') === 'upper' });
  c.notes.push(...built.notes);
  const layer = built.layer;
  const th = built.height + 2 * pad;
  const tw = (o.align === 'center' ? built.width : Math.ceil(Math.max(...built.lines.map((l) => measure(layer, l, built.size))))) + 2 * pad;
  layer.x = o.align === 'center' ? Math.round(box.x + (box.width - built.width) / 2) : box.x + pad;
  layer.y = o.valign === 'top' ? box.y + pad : o.valign === 'bottom' ? box.y + box.height - th + pad : Math.round(box.y + (box.height - th) / 2 + pad);
  const behind: Layer[] = [];
  const emph = c.emphasis;
  if (look === 'plate') {
    const px = o.align === 'center' ? layer.x - pad : box.x;
    behind.push(rect('plate', 'container', px, layer.y - pad, tw, th, tok(pal, groundRole), { radius: Math.round(c.m * 0.35) }));
    if (emph) layer.highlight = invertBox(emph, tok(pal, blockLetters), tok(pal, groundRole));
  } else if (o.on === 'block') {
    if (emph) layer.highlight = invertBox(emph, letter, tok(pal, groundRole));
  } else if (look === 'marker') {
    const mk = emph ? marker(c.theme, pal, layer, [emph], 'title-mark') : { behind: [] as Layer[], highlight: undefined };
    if (mk.highlight) layer.highlight = mk.highlight;
    behind.push(...mk.behind);
  } else {
    if (look === 'outline') {
      const w = Math.round(built.size * 0.1);
      layer.style.stroke = { color: tok(pal, groundRole), width: w };
      layer.style.shadow = { color: 'rgba(0,0,0,0.45)', blur: 10, offsetX: 0, offsetY: 5 };
      layer.x += Math.ceil(w / 2) + outlineRoom;
      layer.y += Math.ceil(w / 2);
    }
    // The stressed word in the style's accent, when that reads against what is behind the letters.
    const behindCol = look === 'outline' ? tok(pal, groundRole) : tok(pal, 'bg');
    if (emph && ratio(tok(pal, 'accent'), behindCol) >= 4.5 && ratio(tok(pal, 'accent'), letter) >= 1.2) layer.highlight = { words: [emph], color: TRANSPARENT, textColor: tok(pal, 'accent'), paddingX: 0, paddingY: 0, radius: 0, onlyFirst: true };
    else if (emph) {
      // Otherwise a box in the marker colours, which are a pair chosen to read together.
      const mk = marker(c.theme, pal, layer, [emph], 'title-mark');
      if (mk.highlight) layer.highlight = mk.highlight;
      behind.push(...mk.behind);
    }
  }
  if (o.scrim && look !== 'plate') c.layers.push(scrimFor(c, o.scrim, { x: layer.x, y: layer.y, width: built.width, height: built.height }, o.scrimReach));
  c.layers.push(...behind, layer);
  c.title = layer;
  return textInk(layer).box;
}

/** A fade of the scrim colour from one edge, solid under the whole title (and anything in `reach`) and clear well beyond it. */
function scrimFor(c: Ctx, edge: 'top' | 'bottom' | 'left' | 'right', ink: Box, reach?: Box): Layer {
  const alpha = 0.8;
  const clear = rgba(c.scrim, 0);
  const solid = rgba(c.scrim, alpha);
  const { W, H } = c;
  const vertical = edge === 'top' || edge === 'bottom';
  const span = vertical ? H : W;
  // How far in from the named edge the solid part must reach.
  const covered = (b: Box) => (edge === 'bottom' ? H - b.y : edge === 'top' ? b.y + b.height : edge === 'right' ? W - b.x : b.x + b.width);
  const inkLen = vertical ? ink.height : ink.width;
  const need = Math.max(covered(ink) + inkLen * 0.12, reach ? covered(reach) : 0);
  const len = Math.min(span, Math.round(need + inkLen * 0.9 + span * 0.06));
  const solidAt = Math.min(0.98, need / len);
  // The gradient runs from the named edge inwards: solid there, clear at the far end.
  const stops = [{ at: 0, color: solid }, { at: solidAt, color: solid }, { at: 1, color: clear }];
  const angle = { bottom: 0, top: 180, right: 270, left: 90 }[edge];
  return rect('scrim', 'decor', edge === 'right' ? W - len : 0, edge === 'bottom' ? H - len : 0, vertical ? W : len, vertical ? len : H, { type: 'linear', angle, stops });
}

/** The measured width of one line (text layers do not carry it). */
function measure(layer: TextLayer, line: string, size: number): number {
  return textInk({ ...layer, text: line, style: { ...layer.style, size }, width: 100000, height: size * 2 }).box.width;
}

function invertBox(word: string, ink: string, fill: string): Highlight {
  return { words: [word], color: ink, textColor: fill, paddingX: 10, paddingY: 4, radius: 8, onlyFirst: true };
}

// ---------- the layouts ----------

type Layout = (c: Ctx) => void;

/** Safe room for words (platform controls stay clear): the right strip and the bottom caption area are left alone. */
const safe = (c: Ctx): Box => (c.portrait ? { x: c.m, y: c.m, width: Math.round(c.W * 0.78) - c.m, height: Math.round(c.H * 0.76) - c.m } : { x: c.m, y: c.m, width: Math.round(c.W * 0.78) - c.m, height: c.H - 2 * c.m });

const full = (c: Ctx): Box => ({ x: 0, y: 0, width: c.W, height: c.H });

/** Big title over the photo, above or below the subject (whichever side has more room). */
const titleOverPhoto: Layout = (c) => {
  const { H, m } = c;
  const s = safe(c);
  // The subject goes a little above or below the middle; the title takes the other side.
  const subjectLow = c.req.subject.y > 0.5;
  const at = putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), { x: 0.5, y: subjectLow ? 0.6 : 0.4 }, c.treatments, true);
  const top = at.y > H * 0.52;
  const r = subjectRadius(c.W, c.H);
  const free = top ? at.y - r - m : H - m - (at.y + r);
  const bandH = Math.max(Math.round(H * 0.2), Math.min(c.portrait ? Math.round(H * 0.28) : Math.round(H * 0.4), Math.round(free)));
  const box: Box = top ? { x: s.x, y: m, width: s.width, height: bandH } : { x: s.x, y: s.y + s.height - bandH, width: s.width, height: bandH };
  setTitle(c, box, { on: 'photo', valign: top ? 'top' : 'bottom', scrim: top ? 'top' : 'bottom' });
};

/** The subject on one side of the picture, the title on the other (the side with more room). A tall thumbnail puts the title under the subject. */
const faceLeft: Layout = (c) => {
  const { W, H, m } = c;
  const r = subjectRadius(W, H);
  if (c.portrait) {
    const at = putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), { x: 0.5, y: 0.3 }, c.treatments, true);
    const y0 = Math.min(Math.round(H * 0.5), Math.round(at.y + r + m * 0.5));
    const box: Box = { x: m, y: y0, width: Math.round(W * 0.78) - m, height: Math.max(Math.round(H * 0.2), Math.round(H * 0.76) - y0) };
    setTitle(c, box, { on: 'photo', valign: 'middle', scrim: 'bottom' });
    return;
  }
  const left = c.req.subject.x <= 0.5;
  const at = putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), { x: left ? 0.27 : 0.73, y: 0.5 }, c.treatments, true);
  // Whatever the photo allowed, the title takes the side with more free width.
  const freeRight = W - m - (at.x + r);
  const freeLeft = at.x - r - m;
  const right = freeRight >= freeLeft;
  const room = Math.max(freeRight, freeLeft);
  const tw = Math.min(Math.round(W * 0.5) - m, Math.round(room));
  const box: Box = right ? { x: W - m - tw, y: m, width: tw, height: H - 2 * m } : { x: m, y: m, width: tw, height: H - 2 * m };
  setTitle(c, box, { on: 'photo', valign: 'middle', scrim: right ? 'right' : 'left' });
};

/** The photo on one side, a block of the style's colour (or a glass card) on the other, with the title in it. */
const splitColour: Layout = (c) => {
  const { W, H, m } = c;
  const role = c.tb.block ?? 'accent';
  const block = tok(c.pal, role);
  if (c.portrait) {
    const ph = Math.round(H * 0.56);
    if (c.tb.glass) {
      putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), { x: 0.5, y: 0.3 }, c.treatments);
      c.layers.push(glass(c, 'block', 0, ph, W, H - ph));
      setTitle(c, { x: m, y: ph + m, width: Math.round(W * 0.78) - m, height: Math.round(H * 0.76) - ph - m }, { on: 'photo', valign: 'middle', forcePlate: false });
      return;
    }
    putPhoto(c, 'photo', c.req.photo, c.req.subject, { x: 0, y: 0, width: W, height: ph }, { x: 0.5, y: 0.5 }, c.treatments);
    c.layers.push(rect('block', 'decor', 0, ph, W, H - ph, block));
    setTitle(c, { x: m, y: ph + Math.round(m * 0.6), width: Math.round(W * 0.78) - m, height: Math.round(H * 0.76) - ph - Math.round(m * 0.6) }, { on: 'block', ground: role, valign: 'middle' });
    return;
  }
  const photoRight = c.req.subject.x > 0.5;
  const pw = Math.round(W * 0.54);
  const bx = photoRight ? 0 : pw;
  const bw = W - pw;
  const text: Box = { x: bx + m, y: m, width: bw - 2 * m, height: H - 2 * m };
  if (c.tb.glass) {
    putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), { x: photoRight ? 0.7 : 0.3, y: 0.5 }, c.treatments);
    c.layers.push(glass(c, 'block', bx, 0, bw, H));
    setTitle(c, text, { on: 'photo', valign: 'middle' });
    return;
  }
  putPhoto(c, 'photo', c.req.photo, c.req.subject, { x: photoRight ? bw : 0, y: 0, width: pw, height: H }, { x: 0.5, y: 0.5 }, c.treatments);
  c.layers.push(rect('block', 'decor', bx, 0, bw, H, block));
  setTitle(c, text, { on: 'block', ground: role, valign: 'middle' });
};

const glass = (c: Ctx, id: string, x: number, y: number, w: number, h: number): Layer => {
  const g = c.style.spec.photo?.glass ?? { fill: 'rgba(255,255,255,0.14)', blur: 28, radius: 36 };
  return { id, kind: 'glass', role: 'decor', x, y, width: w, height: h, rotation: 0, opacity: 1, fill: g.fill, blur: g.blur, radius: 0, ...(g.border ? { border: g.border } : {}) } as Layer;
};

/** A picture of an object (a transparent PNG) with the title beside it, on the photo blurred and darkened behind. */
const objectTitle: Layout = (c) => {
  const { W, H, m } = c;
  const o = c.req.object!;
  const back: Treatment[] = [...c.treatments, { op: 'blur', radius: 16 }, { op: 'wash', color: tok(c.pal, 'bg'), amount: 0.55 }];
  putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), { x: 0.5, y: 0.5 }, back);
  // The photo's own subject is not what this layout is about: the object is. The photo's circle is dropped.
  c.subjects.length = 0;
  c.keep.length = 0;
  const side = c.portrait ? Math.round(W * 0.62) : Math.round(H * 0.7);
  const cx = c.portrait ? W / 2 : Math.round(W * 0.72);
  const cy = c.portrait ? Math.round(H * 0.3) : Math.round(H * 0.5);
  const layer = objectLayer(W, H, { id: o.id, scale: side / (W * 0.5), rotation: 0, x: cx / W, y: cy / H, fx: 'glow' }, o, tok(c.pal, 'accent'));
  c.layers.push(layer);
  const r = Math.round(side / 2);
  c.subjects.push({ x: cx, y: cy, r: Math.min(subjectRadius(W, H) * 2, r), of: 'object' });
  c.keep.push({ x: cx - r, y: cy - r, width: 2 * r, height: 2 * r });
  const box: Box = c.portrait ? { x: m, y: Math.round(H * 0.52), width: Math.round(W * 0.78) - m, height: Math.round(H * 0.24) } : { x: m, y: m, width: Math.round(W * 0.46) - m, height: H - 2 * m };
  setTitle(c, box, { on: 'photo', valign: 'middle' });
};

/** A big number in a badge of the style's colour; the rest of the title beside or under it. The number is the one in the title. */
const numberBadge: Layout = (c) => {
  const { W, H, m } = c;
  const n = c.req.badge ?? numberIn(c.req.title)!;
  const rest = c.req.title.trim().split(/\s+/).filter((w, i, all) => !(w === n && all.indexOf(w) === i));
  c.text = rest.length ? rest.join(' ') : c.req.title.trim();
  const role = c.tb.block ?? 'accent';
  const d = c.portrait ? Math.round(W * 0.42) : Math.round(H * 0.5);
  const r = subjectRadius(W, H);
  const subjectRight = c.req.subject.x <= 0.5;
  const at = putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), c.portrait ? { x: 0.5, y: 0.66 } : { x: subjectRight ? 0.73 : 0.27, y: 0.5 }, c.treatments, true);
  // The badge and the title go on the side the subject is not on.
  const badgeLeft = c.portrait ? true : at.x > W / 2;
  const bx = badgeLeft ? m : W - m - d;
  const by = m;
  const room = badgeLeft ? at.x - r - 2 * m : W - m - (at.x + r) - m;
  const textW = c.portrait ? Math.round(W * 0.78) - m : Math.max(Math.round(W * 0.28), Math.min(Math.round(W * 0.5) - m, Math.round(room)));
  const ty = by + d + Math.round(m * 0.5);
  const box: Box = c.portrait ? { x: m, y: by + d + Math.round(m * 0.6), width: textW, height: Math.round(H * 0.3) } : { x: badgeLeft ? bx : W - m - textW, y: ty, width: textW, height: H - ty - m };
  c.layers.push(ellipse('badge', 'container', bx, by, d, d, tok(c.pal, role)));
  const fs = Math.round(d * (n.length > 3 ? 0.36 : n.length > 2 ? 0.46 : 0.6));
  const t = buildText({ id: 'badge-number', x: bx + Math.round(d * 0.06), y: 0, width: Math.round(d * 0.88), text: n, font: c.style.spec.fonts.headline, weight: c.tb.title.weight ?? c.style.spec.fonts.headlineWeight, size: fs, minSize: 40, color: tok(c.pal, ON[role] ?? 'text'), lineHeight: 1, align: 'center', balance: false });
  t.layer.y = Math.round(by + (d - t.height) / 2);
  c.layers.push(t.layer);
  setTitle(c, box, { on: 'photo', valign: 'top', scrim: c.portrait ? 'top' : badgeLeft ? 'left' : 'right', scrimReach: { x: bx, y: by, width: d, height: d } });
};

/** Two pictures side by side (or one above the other), BEFORE and AFTER, with the title on a plate across the join. */
const beforeAfter: Layout = (c) => {
  const { W, H, m } = c;
  const second = c.req.second!;
  const role = c.tb.block ?? 'accent';
  const gap = 10;
  const boxes: [Box, Box] = c.portrait ? [{ x: 0, y: 0, width: W, height: Math.round(H / 2) }, { x: 0, y: Math.round(H / 2), width: W, height: H - Math.round(H / 2) }] : [{ x: 0, y: 0, width: Math.round(W / 2), height: H }, { x: Math.round(W / 2), y: 0, width: W - Math.round(W / 2), height: H }];
  const target = c.portrait ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 0.38 };
  putPhoto(c, 'photo', c.req.photo, c.req.subject, boxes[0], target, c.treatments);
  putPhoto(c, 'photo-after', second.photo, second.subject, boxes[1], target, c.treatments);
  c.layers.push(c.portrait ? rect('join', 'decor', 0, boxes[1].y - gap / 2, W, gap, tok(c.pal, role)) : rect('join', 'decor', boxes[1].x - gap / 2, 0, gap, H, tok(c.pal, role)));
  const chip = (id: string, label: string, x: number, y: number) => {
    const fs = c.portrait ? 54 : 40;
    const t = buildText({ id: `${id}-label`, x: 0, y: 0, width: 600, text: label, font: c.style.spec.fonts.headline, weight: c.tb.title.weight ?? c.style.spec.fonts.headlineWeight, size: fs, color: tok(c.pal, ON[role] ?? 'text'), lineHeight: 1, balance: false });
    const tw = Math.ceil(measure(t.layer, label, fs));
    const px = Math.round(fs * 0.5);
    c.layers.push(rect(id, 'container', x, y, tw + 2 * px, Math.round(fs * 1.5), tok(c.pal, role), { radius: Math.round(fs * 0.3) }));
    t.layer.x = x + px;
    t.layer.y = y + Math.round(fs * 0.25);
    t.layer.width = tw + 2;
    c.layers.push(t.layer);
  };
  chip('chip-before', 'BEFORE', boxes[0].x + m, boxes[0].y + m);
  chip('chip-after', 'AFTER', boxes[1].x + m, boxes[1].y + m);
  // The title sits on a plate across the bottom (or across the join, on a tall one), so it reads over two different photos.
  const plateH = c.portrait ? Math.round(H * 0.12) : Math.round(H * 0.26);
  const box: Box = c.portrait ? { x: m, y: Math.round(H / 2 - plateH / 2), width: Math.round(W * 0.78) - m, height: plateH } : { x: m, y: H - m - plateH, width: Math.round(W * 0.78) - m, height: plateH };
  setTitle(c, box, { on: 'photo', valign: 'middle', forcePlate: true, size: c.portrait ? 120 : 110, minSize: 72, align: 'left' });
};

const LAYOUT_FN: Record<ThumbLayoutId, Layout> = {
  'face-left-title-right': faceLeft,
  'title-over-photo': titleOverPhoto,
  'split-colour': splitColour,
  'object-title': objectTitle,
  'number-badge': numberBadge,
  'before-after': beforeAfter,
};

/** Why a layout cannot be made from what the person gave, or null when it can. */
export function layoutUnavailable(layout: ThumbLayoutId, req: ThumbRequest): string | null {
  if (layout === 'object-title' && !req.object) return 'needs a transparent object picture';
  if (layout === 'number-badge' && !(req.badge ?? numberIn(req.title))) return 'needs a number in the title (it never makes one up)';
  if (layout === 'before-after' && !req.second) return 'needs a second photo';
  return null;
}

/** Up to 6 options for one picture and title in one style, one per layout the style suits and the pictures allow. */
export function composeThumbs(req: ThumbRequest, style: LoadedStyle): ThumbOption[] {
  const tb = style.spec.thumbnail;
  if (!tb) throw new Error(`The style "${style.spec.title}" has no thumbnail look.`);
  const text = req.title.trim().replace(/\s+/g, ' ');
  if (!text) throw new Error('A thumbnail needs a title.');
  const { width: W, height: H } = THUMB_SIZES[req.aspect];
  const pal = style.spec.palettes[tb.palette];
  const wanted = (req.layouts ?? tb.layouts).filter((l) => (THUMB_LAYOUTS as readonly string[]).includes(l));
  const out: ThumbOption[] = [];
  for (const layout of wanted) {
    if (out.length >= 6) break;
    if (layoutUnavailable(layout, req)) continue;
    const words = text.split(' ');
    const stressed = req.emphasis?.trim() || words[words.length - 1];
    const treat = resolveTreatments(req.treatments ?? tb.treatment ?? [], pal as unknown as Record<string, unknown>);
    const c: Ctx = {
      req, style, tb, pal, theme: asTheme(style.spec, pal), W, H, m: Math.round(Math.min(W, H) * 0.055), portrait: H > W, layers: [], notes: [], subjects: [], keep: [], treatments: treat,
      scrim: resolveColor(tb.scrim ?? '#000000', pal as unknown as Record<string, unknown>), text, emphasis: stressed,
    };
    c.layers.push(rect('bg', 'decor', 0, 0, W, H, pal.bg));
    LAYOUT_FN[layout](c);
    // Elements the style likes (stickers, arrows), kept off the subject and the words.
    let used: string[] = [];
    if (tb.elements && style.spec.elements) {
      const spec = { ...style.spec.elements, density: { min: 1, max: Math.min(2, style.spec.elements.density.max) } };
      const placed = placeElements({ spec, pal, layers: c.layers, width: W, height: H, type: 'cover', seed: `${req.seed ?? 'thumb'}|${layout}|${text}`, mode: 'shippable', paletteName: tb.palette, keepClear: c.keep as never });
      c.layers.push(...placed.layers);
      used = placed.used;
      c.notes.push(...placed.notes);
    }
    out.push({
      id: `${req.aspect.replace(':', 'x')}-${style.spec.name}-${layout}`,
      layout,
      styleName: style.spec.name,
      styleTitle: style.spec.title,
      aspect: req.aspect,
      plan: { schema: 1, revision: 1, canvas: { width: W, height: H, background: solidOf(pal.bg) }, layers: c.layers },
      titleLayerId: 'title',
      photoLayerId: 'photo',
      subjects: c.subjects,
      photoLayerIds: c.layers.filter((l) => l.kind === 'image' && /^photo/.test(l.id)).map((l) => l.id),
      elementsUsed: used,
      notes: c.notes,
    });
  }
  return out;
}
