// Thumbnails, version 2: built on the carousel's toolbox (text, markers, photo treatments, glass, objects, elements) and on a style's
// "thumbnail" block. Every option is a plain plan, so it can be edited with patches. Needs the fonts loaded (text is measured).
// The subject is the person's pointer on the photo, not detection: the title, the elements and the object stay off it.
import { contrast, luminance, parseColor } from '../../lint/color';
import { buildText, ellipse, marker, rect, solidOf, TRANSPARENT, type Built } from '../../carousel/toolbox';
import type { Palette } from '../../carousel/types';
import { layerBox, textInk } from '../../carousel/lint';
import type { Highlight, Layer, Plan, TextLayer, Treatment, ThumbnailAspect } from '../../types';
import { photoLayer } from '../../photo/frames';
import { objectLayer, type ObjectInput } from '../../photo/objects';
import type { PhotoInput } from '../../photo/zones';
import { resolveColor, resolveTreatments } from '../../photo/resolve';
import { asTheme } from '../../styles/compose';
import { placeElements } from '../../styles/elements';
import type { LoadedStyle } from '../../styles/load';
import { circleTouchesBox, fitSubject, fitSubjectZoom, subjectRadius, type Box, type Pt, type SubjectPoint } from './subject';
import { CUTOUT_COMBOS, THUMB_LAYOUTS, type ThumbLayoutId, type ThumbSpec } from './spec';
import type { CutoutLook } from '../../cutout/look';
import { treatmentsOf, type Backdrop, type TitlePlace } from './backdrop';
import { drawMarks } from '../../styles/marks';
import type { MarkSpec } from '../../styles/marks-spec';

export const THUMB_SIZES = { '16:9': { width: 1280, height: 720 }, '9:16': { width: 1080, height: 1920 } } as const;

/** The object picture for a thumbnail, with how the person placed and dressed it, and a copy with an outline for the outline combination. */
export interface ThumbObject extends ObjectInput {
  look?: CutoutLook;
  outlinedSrc?: string;
}

/** A background behind the cutout; for the photo kind, the other photo. */
export interface ThumbBackdrop extends Backdrop {
  photo?: PhotoInput;
}

export interface ThumbRequest {
  /** What is behind a cutout (the cutout layouts only). Left out: the style's own, then a blurred copy of the photo. */
  backdrop?: ThumbBackdrop;
  /** A palette of the style, in place of the thumbnail's own. */
  palette?: string;
  /** Where the title goes in the cutout layouts. */
  titlePlace?: TitlePlace;
  aspect: ThumbnailAspect;
  /** Up to 4 words are expected; more are drawn and fail the title-length check. */
  title: string;
  /** The one word to stress. Left out: the last word. */
  emphasis?: string;
  photo: PhotoInput;
  /** Where the subject is on the photo (the person's pointer, or a guess). */
  subject: SubjectPoint;
  /** A transparent object picture, for the "object and title" layout. */
  object?: ThumbObject;
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
  // A box behind the stressed word reaches up and down; the lines need room so it never touches the letters of the line above (the tail of a Q, the foot of an R).
  const lh = c.emphasis ? 1.16 : Math.min(1.05, Math.max(0.95, style.spec.headlineLineHeight));
  const weight = tb.title.weight ?? style.spec.fonts.headlineWeight;
  const groundRole = o.on === 'block' ? (o.ground ?? tb.block ?? 'accent') : tb.title.ground ?? 'accent';
  const blockLetters = ON[groundRole] ?? 'text';
  const letter = o.on === 'block' ? tok(pal, blockLetters) : look === 'plate' ? tok(pal, ON[groundRole] ?? tb.title.colour) : tok(pal, tb.title.colour);
  const pad = look === 'plate' ? Math.round(c.m * 0.5) : 0;
  // An outline grows past the letters by half its width on every side: leave that room inside the box.
  const outlineRoom = look === 'outline' ? Math.round((o.size ?? (c.portrait ? 200 : 168)) * 0.045) : 0;
  const size0 = o.size ?? (c.portrait ? 200 : 168);
  const minSize = o.minSize ?? (c.portrait ? 84 : 84);
  const built: Built = buildText({ id: 'title', x: 0, y: 0, width: box.width - 2 * pad - 2 * outlineRoom, maxHeight: box.height - 2 * pad - 2 * outlineRoom, text: c.text, font: style.spec.fonts.headline, weight, size: size0, minSize, color: letter, lineHeight: lh, align: o.align ?? 'left', balance: true, upper: (tb.title.case ?? 'upper') === 'upper' });
  c.notes.push(...built.notes);
  const layer = built.layer;
  const th = built.height + 2 * pad;
  const tw = (o.align === 'center' ? built.width : Math.ceil(Math.max(...built.lines.map((l) => measure(layer, l, built.size))))) + 2 * pad;
  layer.x = o.align === 'center' ? Math.round(box.x + (box.width - built.width) / 2) : box.x + pad;
  layer.y = o.valign === 'top' ? box.y + pad + outlineRoom : o.valign === 'bottom' ? box.y + box.height - th + pad - outlineRoom : Math.round(box.y + (box.height - th) / 2 + pad);
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
      const w = Math.round(built.size * 0.07);
      layer.style.stroke = { color: tok(pal, groundRole), width: w };
      layer.style.shadow = { color: 'rgba(0,0,0,0.45)', blur: 10, offsetX: 0, offsetY: 5 };
      layer.x += outlineRoom;
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
    const ph = Math.round(H * 0.46);
    if (c.tb.glass) {
      putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), { x: 0.5, y: 0.3 }, c.treatments, true);
      // A glass card floating over the photo, in the area above the platform's own caption, with the title large inside it.
      const card: Box = { x: m, y: Math.round(H * 0.47), width: W - 2 * m, height: Math.round(H * 0.29) };
      const p = Math.round(m * 0.7);
      c.layers.push(...glassCard(c, card));
      setTitle(c, { x: card.x + p, y: card.y + p, width: Math.round(W * 0.56), height: card.height - 2 * p }, { on: 'photo', valign: 'middle' });
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
    const at = putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), { x: photoRight ? 0.7 : 0.3, y: 0.5 }, c.treatments, true);
    // The glass card goes on the side the subject is not on.
    const gx = at.x > W / 2 ? 0 : pw;
    const card: Box = { x: gx === 0 ? m : W - m - bw, y: m, width: bw - m, height: H - 2 * m };
    const p = Math.round(m * 0.8);
    c.layers.push(...glassCard(c, card));
    setTitle(c, { x: card.x + p, y: card.y + p, width: card.width - 2 * p, height: card.height - 2 * p }, { on: 'photo', valign: 'middle' });
    return;
  }
  putPhoto(c, 'photo', c.req.photo, c.req.subject, { x: photoRight ? bw : 0, y: 0, width: pw, height: H }, { x: 0.5, y: 0.5 }, c.treatments);
  c.layers.push(rect('block', 'decor', bx, 0, bw, H, block));
  setTitle(c, text, { on: 'block', ground: role, valign: 'middle' });
};

/** A rounded glass card with a dark tint under it, so the letters on it have something to stand on. */
const glassCard = (c: Ctx, b: Box): Layer[] => {
  const g = c.style.spec.photo?.glass ?? { fill: 'rgba(255,255,255,0.14)', blur: 28, radius: 36 };
  return [
    rect('block-tint', 'decor', b.x, b.y, b.width, b.height, rgba(c.scrim, 0.55), { radius: g.radius }),
    { id: 'block', kind: 'glass', role: 'decor', x: b.x, y: b.y, width: b.width, height: b.height, rotation: 0, opacity: 1, fill: g.fill, blur: g.blur, radius: g.radius, ...(g.border ? { border: g.border } : {}) } as Layer,
  ];
};

/** A picture of an object (a transparent PNG) with the title beside it, on the photo blurred and darkened behind. */
const objectTitle: Layout = (c) => {
  const { W, H, m } = c;
  const o = c.req.object!;
  // The photo's own subject is not what this layout is about: the object is. The photo's circle is dropped.
  c.subjects.length = 0;
  c.keep.length = 0;
  const side = c.portrait ? Math.round(W * 0.62) : Math.round(H * 0.7);
  const cx = c.portrait ? W / 2 : Math.round(W * 0.72);
  const cy = c.portrait ? Math.round(H * 0.3) : Math.round(H * 0.5);
  drawBackdrop(c, { cx, cy });
  const lk = o.look ?? {};
  const layer = objectLayer(W, H, { id: o.id, scale: lk.scale ?? side / (W * 0.5), rotation: lk.tilt ?? 0, x: lk.x ?? cx / W, y: lk.y ?? cy / H, fx: lk.fx ?? 'glow' }, { ...o, src: objSrc(c, o) }, glowOf(c));
  c.layers.push(layer);
  const r = Math.round(side / 2);
  c.subjects.push({ x: cx, y: cy, r: Math.min(subjectRadius(W, H) * 2, r), of: 'object' });
  c.keep.push({ x: cx - r, y: cy - r, width: 2 * r, height: 2 * r });
  const box: Box = c.portrait ? { x: m, y: Math.round(H * 0.52), width: Math.round(W * 0.78) - m, height: Math.round(H * 0.24) } : { x: m, y: m, width: Math.round(W * 0.46) - m, height: H - 2 * m };
  setTitle(c, placeTitle(c, box), { on: 'photo', valign: 'middle', ...plateOpt(c) });
  // The title behind the subject: the subject's layer goes after the title's.
  if (lk.textBehind) {
    const at = c.layers.findIndex((l) => l.id === layer.id);
    if (at >= 0) c.layers.push(...c.layers.splice(at, 1));
  }
};

/** A big number in a badge of the style's colour; the rest of the title beside or under it. The number is the one in the title. */
const numberBadge: Layout = (c) => {
  const { W, H, m } = c;
  const n = c.req.badge ?? numberIn(c.req.title)!;
  const rest = c.req.title.trim().split(/\s+/).filter((w, i, all) => !(w === n && all.indexOf(w) === i));
  c.text = rest.length ? rest.join(' ') : c.req.title.trim();
  const role = c.tb.block ?? 'accent';
  // A tall thumbnail: a subject high in the photo goes on top with the badge and title below it, side by side; a low one goes under them.
  const subjectTop = c.portrait && c.req.subject.y < 0.5;
  const d = c.portrait ? Math.round(W * (subjectTop ? 0.3 : 0.42)) : Math.round(H * 0.5);
  const r = subjectRadius(W, H);
  const subjectRight = c.req.subject.x <= 0.5;
  const at = putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), c.portrait ? { x: 0.5, y: subjectTop ? 0.3 : 0.66 } : { x: subjectRight ? 0.73 : 0.27, y: 0.5 }, c.treatments, true);
  // The badge and the title go on the side the subject is not on.
  const badgeLeft = c.portrait ? true : at.x > W / 2;
  const bx = badgeLeft ? m : W - m - d;
  const by = subjectTop ? Math.max(Math.round(H * 0.46), Math.round(at.y + r + m * 0.5)) : m;
  const room = badgeLeft ? at.x - r - 2 * m : W - m - (at.x + r) - m;
  const textW = c.portrait ? Math.round(W * 0.78) - m : Math.max(Math.round(W * 0.28), Math.min(Math.round(W * 0.5) - m, Math.round(room)));
  const ty = by + d + Math.round(m * 0.5);
  const sideX = bx + d + Math.round(m * 0.6);
  const box: Box = subjectTop ? { x: sideX, y: by, width: Math.round(W * 0.78) - sideX, height: Math.max(Math.round(H * 0.16), Math.round(H * 0.76) - by) } : c.portrait ? { x: m, y: by + d + Math.round(m * 0.6), width: textW, height: Math.round(H * 0.3) } : { x: badgeLeft ? bx : W - m - textW, y: ty, width: textW, height: Math.min(H - ty - m, Math.round(H * 0.84) - ty) };
  setTitle(c, box, { on: 'photo', valign: subjectTop ? 'middle' : 'top', scrim: subjectTop ? 'bottom' : c.portrait ? 'top' : badgeLeft ? 'left' : 'right', scrimReach: { x: bx, y: by, width: d, height: d } });
  c.layers.push(ellipse('badge', 'container', bx, by, d, d, tok(c.pal, role)));
  const fs = Math.round(d * (n.length > 3 ? 0.36 : n.length > 2 ? 0.46 : 0.6));
  const t = buildText({ id: 'badge-number', x: bx + Math.round(d * 0.06), y: 0, width: Math.round(d * 0.88), text: n, font: c.style.spec.fonts.headline, weight: c.tb.title.weight ?? c.style.spec.fonts.headlineWeight, size: fs, minSize: 40, color: tok(c.pal, ON[role] ?? 'text'), lineHeight: 1, align: 'center', balance: false });
  t.layer.y = Math.round(by + (d - t.height) / 2);
  c.layers.push(t.layer);
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

/** The effective background recipe: the person's, then the style's, then nothing (a blurred copy of the photo, as before). */
const backdropOf = (c: Ctx): ThumbBackdrop | undefined => c.req.backdrop ?? (c.tb.cutout?.backdrop as ThumbBackdrop | undefined);
const place = (c: Ctx): TitlePlace | undefined => c.req.titlePlace ?? c.tb.cutout?.titlePlace;
/** A colour: hex, or a palette name like "$accent". */
const col = (c: Ctx, v: string | undefined, dflt: string) => resolveColor(v ?? dflt, c.pal as unknown as Record<string, unknown>);
/** The title safety net: on a background that is not a darkened photo the title goes on a plate, so it is readable whatever is behind it. */
const plateNeeded = (bd: ThumbBackdrop | undefined) => !!bd && (bd.kind === 'colour' || bd.kind === 'gradient' || bd.kind === 'pattern' || bd.kind === 'block' || (bd.kind === 'photo' && !bd.treat?.darken));
const plateOpt = (c: Ctx): { forcePlate?: true } => (plateNeeded(backdropOf(c)) ? { forcePlate: true } : {});
/** The colour of the background, for the glow when the subject is matched to it (null for a photo). */
const backdropColour = (c: Ctx): string | null => {
  const bd = backdropOf(c);
  if (!bd) return null;
  if (bd.kind === 'colour' || bd.kind === 'block' || bd.kind === 'gradient' || bd.kind === 'pattern') return col(c, bd.colour, '$accent');
  return col(c, '$bg', '$bg');
};
const glowOf = (c: Ctx): string => (backdropOf(c)?.match ? backdropColour(c) : null) ?? tok(c.pal, 'accent');
/** The cutout picture to use: with the outline when the style asks for it. */
const objSrc = (c: Ctx, o: ThumbObject) => (c.tb.cutout?.look?.outline ? (o.outlinedSrc ?? o.src) : o.src);

/** The title box where the person or the style wants it, or the layout's own. */
function placeTitle(c: Ctx, own: Box): Box {
  const p = place(c);
  const { W, H, m } = c;
  if (!p) return own;
  if (p === 'left') return c.portrait ? { x: m, y: m, width: W - 2 * m, height: Math.round(H * 0.34) } : { x: m, y: m, width: Math.round(W * 0.44) - m, height: H - 2 * m };
  if (p === 'right') return c.portrait ? { x: m, y: Math.round(H * 0.62), width: W - 2 * m, height: Math.round(H * 0.3) } : { x: Math.round(W * 0.56), y: m, width: Math.round(W * 0.44) - m, height: H - 2 * m };
  if (p === 'top') return { x: m, y: m, width: W - 2 * m, height: Math.round(H * (c.portrait ? 0.26 : 0.3)) };
  if (p === 'bottom') return { x: m, y: Math.round(H * (c.portrait ? 0.7 : 0.66)), width: W - 2 * m, height: Math.round(H * (c.portrait ? 0.24 : 0.3)) };
  return { x: Math.round(W * 0.1), y: Math.round(H * 0.3), width: Math.round(W * 0.8), height: Math.round(H * 0.4) };
}

/** What sits behind the cutout. `at` is where the subject will be, for the colour block it overlaps. */
function drawBackdrop(c: Ctx, at: { cx: number; cy: number }) {
  const { W, H } = c;
  const bd = backdropOf(c);
  const raw = c.pal as unknown as Record<string, unknown>;
  const usePhoto = (photo: PhotoInput, focal: Pt, list: Treatment[], id: string) => putPhoto(c, id, photo, focal, full(c), { x: 0.5, y: 0.5 }, resolveTreatments(list, raw));
  if (!bd || bd.kind === 'blur' || (bd.kind === 'photo' && !bd.photo)) {
    // A blurred, darkened copy of the original photo (the layouts' own look unless the person chose treatments).
    const list: Treatment[] = bd?.treat ? treatmentsOf({ blur: true, ...bd.treat }) : [{ op: 'blur', radius: 16 }, { op: 'wash', color: tok(c.pal, 'bg'), amount: 0.55 }];
    putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), { x: 0.5, y: 0.5 }, [...c.treatments, ...resolveTreatments(list, raw)]);
    return;
  }
  if (bd.kind === 'photo') {
    usePhoto(bd.photo!, bd.focal ?? { x: 0.5, y: 0.5 }, treatmentsOf(bd.treat), 'photo-backdrop');
    return;
  }
  // The plain backgrounds cover the whole photo, which is still the first layer: the checker reads its pixels and its box.
  putPhoto(c, 'photo', c.req.photo, c.req.subject, full(c), { x: 0.5, y: 0.5 }, []);
  if (bd.kind === 'colour') c.layers.push(rect('backdrop', 'decor', 0, 0, W, H, col(c, bd.colour, '$accent')));
  else if (bd.kind === 'gradient') c.layers.push(rect('backdrop', 'decor', 0, 0, W, H, { type: 'linear', angle: bd.angle ?? 160, stops: [{ at: 0, color: col(c, bd.colour, '$bg') }, { at: 1, color: col(c, bd.to, '$accent') }] }));
  else if (bd.kind === 'pattern') {
    c.layers.push(rect('backdrop', 'decor', 0, 0, W, H, col(c, bd.colour, '$bg')));
    const kind = ({ halftone: 'halftone-field', dots: 'dot-grid', stripes: 'stripes', grain: 'grain' } as const)[bd.pattern ?? 'halftone'];
    const mark: MarkSpec = { kind, zone: 'full', size: { 'halftone-field': 34, 'dot-grid': 30, stripes: 44, grain: 12 }[kind], colour: col(c, bd.ink, '$accent'), opacity: 0.5, ...(kind === 'stripes' ? { rotate: 35 } : {}) };
    c.layers.push(...drawMarks([mark], { theme: c.theme, pal: c.pal, W, H, M: c.m, top: c.m, bottom: H - c.m, type: 'cover', seed: `backdrop|${kind}` }).under);
  } else {
    // A colour block with the subject overlapping it: a band behind the subject, wider than the subject's middle but not its edges.
    c.layers.push(rect('backdrop', 'decor', 0, 0, W, H, tok(c.pal, 'bg')));
    const band = c.portrait ? { x: 0, y: Math.round(at.cy - H * 0.17), w: W, h: Math.round(H * 0.34) } : { x: Math.round(at.cx - W * 0.17), y: Math.round(H * 0.06), w: Math.round(W * 0.34), h: Math.round(H * 0.88) };
    c.layers.push(rect('backdrop-block', 'decor', band.x, band.y, band.w, band.h, col(c, bd.colour, '$accent')));
  }
}

/** The cutout where the person put it, or where the combination wants it. */
function placedObject(c: Ctx, o: ThumbObject, own: { cx: number; cy: number; side: number }, fx: 'none' | 'contact' | 'drop' | 'glow', src = objSrc(c, o)) {
  const { W, H } = c;
  const lk = o.look ?? {};
  const scale = lk.scale ?? own.side / (W * 0.5);
  const cx = (lk.x ?? own.cx / W) * W;
  const cy = (lk.y ?? own.cy / H) * H;
  const layer = objectLayer(W, H, { id: o.id, scale, rotation: lk.tilt ?? 0, x: cx / W, y: cy / H, fx: lk.fx ?? c.tb.cutout?.look?.fx ?? fx }, { ...o, src }, glowOf(c));
  return { layer, cx, cy, r: Math.round((W * 0.5 * scale) / 2) };
}
const keepObject = (c: Ctx, p: { cx: number; cy: number; r: number }) => {
  c.subjects.push({ x: p.cx, y: p.cy, r: Math.min(subjectRadius(c.W, c.H) * 2, p.r), of: 'object' });
  c.keep.push({ x: p.cx - p.r, y: p.cy - p.r, width: 2 * p.r, height: 2 * p.r });
};
const clearSubjects = (c: Ctx) => {
  c.subjects.length = 0;
  c.keep.length = 0;
};

/** Ready combination 1: the subject with an outline and a glow, the title beside it. */
const comboOutlineGlow: Layout = (c) => {
  const { W, H, m } = c;
  const o = c.req.object!;
  clearSubjects(c);
  const side = c.portrait ? Math.round(W * 0.72) : Math.round(H * 0.84);
  const own = { cx: c.portrait ? W / 2 : Math.round(W * 0.7), cy: c.portrait ? Math.round(H * 0.32) : Math.round(H * 0.5), side };
  drawBackdrop(c, own);
  const p = placedObject(c, o, own, 'glow', o.outlinedSrc ?? o.src);
  c.layers.push(p.layer);
  keepObject(c, p);
  const box: Box = c.portrait ? { x: m, y: Math.round(H * 0.56), width: W - 2 * m, height: Math.round(H * 0.22) } : { x: m, y: m, width: Math.round(W * 0.44) - m, height: H - 2 * m };
  setTitle(c, placeTitle(c, box), { on: 'photo', valign: 'middle', ...plateOpt(c) });
};
/** Ready combination 2: a big title across the thumbnail with the subject in front of it. */
const comboOverText: Layout = (c) => {
  const { W, H, m } = c;
  const o = c.req.object!;
  clearSubjects(c);
  const own = { cx: W / 2, cy: Math.round(H * (c.portrait ? 0.7 : 0.64)), side: Math.round(c.portrait ? W * 0.8 : H * 0.92) };
  drawBackdrop(c, own);
  const p0 = place(c);
  const top = p0 === 'top' ? 0.04 : p0 === 'bottom' ? (c.portrait ? 0.3 : 0.28) : 0.08;
  setTitle(c, { x: m, y: Math.round(H * top), width: W - 2 * m, height: Math.round(H * (c.portrait ? 0.46 : 0.66)) }, { on: 'photo', valign: 'middle', align: 'center', size: c.portrait ? 200 : 240, minSize: 90, ...plateOpt(c) });
  const p = placedObject(c, o, own, 'contact');
  c.layers.push(p.layer);
  keepObject(c, p);
};
/** Ready combination 3: the subject on a block of the style's colour, the title on the other side. */
const comboOnBlock: Layout = (c) => {
  const { W, H, m } = c;
  const o = c.req.object!;
  clearSubjects(c);
  const role = c.tb.block ?? 'accent';
  const b: Box = c.portrait ? { x: 0, y: Math.round(H * 0.42), width: W, height: H - Math.round(H * 0.42) } : { x: Math.round(W * 0.5), y: 0, width: W - Math.round(W * 0.5), height: H };
  const own = { cx: b.x + b.width / 2, cy: b.y + b.height / 2, side: Math.round(Math.min(b.width, b.height) * 0.92) };
  const bd = backdropOf(c);
  // The person's own background replaces the blurred photo; the colour block is always there unless the background is itself a block.
  drawBackdrop(c, own);
  if (bd?.kind !== 'block') c.layers.push(rect('block', 'decor', b.x, b.y, b.width, b.height, tok(c.pal, role)));
  const p = placedObject(c, o, own, 'drop');
  c.layers.push(p.layer);
  keepObject(c, p);
  const box: Box = c.portrait ? { x: m, y: m, width: W - 2 * m, height: Math.round(H * 0.36) } : { x: m, y: m, width: Math.round(W * 0.46) - m, height: H - 2 * m };
  setTitle(c, placeTitle(c, box), { on: 'photo', valign: 'middle', ...plateOpt(c) });
};

const LAYOUT_FN: Record<ThumbLayoutId, Layout> = {
  'face-left-title-right': faceLeft,
  'title-over-photo': titleOverPhoto,
  'split-colour': splitColour,
  'object-title': objectTitle,
  'number-badge': numberBadge,
  'before-after': beforeAfter,
  'cutout-outline-glow': comboOutlineGlow,
  'cutout-over-text': comboOverText,
  'cutout-on-block': comboOnBlock,
};

/** Why a layout cannot be made from what the person gave, or null when it can. */
export function layoutUnavailable(layout: ThumbLayoutId, req: ThumbRequest): string | null {
  if ((layout === 'object-title' || (CUTOUT_COMBOS as readonly string[]).includes(layout)) && !req.object) return 'needs a transparent object picture';
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
  const palName = req.palette && style.spec.palettes[req.palette] ? req.palette : req.object && tb.cutout?.palette && style.spec.palettes[tb.cutout.palette] ? tb.cutout.palette : tb.palette;
  const pal = style.spec.palettes[palName];
  // With an object, the three ready cutout combinations are offered whatever the style lists.
  const wanted = [...new Set([...(req.layouts ?? tb.layouts), ...(!req.layouts && req.object ? CUTOUT_COMBOS : [])])].filter((l) => (THUMB_LAYOUTS as readonly string[]).includes(l));
  const out: ThumbOption[] = [];
  for (const layout of wanted) {
    if (out.length >= 9) break;
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
      // An element made of several pieces (tape, a pair of arrows) is kept only if no piece touches a subject.
      const family = (id: string) => id.replace(/:\d+$/, '');
      const bad = new Set(placed.layers.filter((l) => c.subjects.some((z) => z.of !== 'object' && circleTouchesBox(z, layerBox(l)))).map((l) => family(l.id)));
      if (bad.size) c.notes.push('An element was left out because it would have covered the subject.');
      c.layers.push(...placed.layers.filter((l) => !bad.has(family(l.id))));
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
