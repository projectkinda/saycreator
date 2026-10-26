// The treatment gallery: one of the user's photos under every treatment, mask, frame, background and object effect. Each item is
// its own plan (so each is editable like any slide). Pure (no browser): the spec renders them.
import { chipCards, laptopFrame, phoneFrame, photoLayer, polaroid, strip, ticket, blockOffset, type PhotoRef } from '../../src/image-engine/photo/frames';
import type { FieldLayer, GlassLayer, Layer, Mask, Plan, Treatment } from '../../src/image-engine/types';

export interface GalleryItem {
  id: string;
  group: 'Treatments' | 'Masks' | 'Frames' | 'Backgrounds' | 'Objects';
  title: string;
  /** One line saying what to look at. */
  note: string;
  plan: Plan;
  /** True when the item uses the stand-in object, not a real picture of the person's. */
  synthetic?: boolean;
}

const W = 1080;
const H = 1350;
const plan = (bg: string, layers: Layer[]): Plan => ({ schema: 1, revision: 1, canvas: { width: W, height: H, background: bg }, layers });
const base = { rotation: 0, opacity: 1 } as const;

const field = (id: string, base_: string, blobs: FieldLayer['blobs'], blur: number, grain: number, seed: number): FieldLayer => ({ id, kind: 'field', role: 'decor', x: 0, y: 0, width: W, height: H, ...base, base: base_, blobs, blur, grain, seed });
const glass = (id: string, x: number, y: number, w: number, h: number, fill = 'rgba(255,255,255,0.16)'): GlassLayer => ({ id, kind: 'glass', role: 'container', x, y, width: w, height: h, ...base, fill, blur: 30, radius: 44, border: { color: 'rgba(255,255,255,0.45)', width: 2 }, shadow: { color: 'rgba(0,0,0,0.25)', blur: 40, offsetX: 0, offsetY: 20 } });

export function buildGallery(photo: string, object: string): GalleryItem[] {
  const ref = (t: Treatment[] = []): PhotoRef => ({ src: photo, focal: { x: 0.5, y: 0.55 }, treatments: t });
  const full = (id: string, t: Treatment[]): Layer => photoLayer(id, 0, 0, W, H, ref(t), { name: 'Photo' });
  const items: GalleryItem[] = [];
  const treat = (id: string, title: string, note: string, t: Treatment[]) => items.push({ id: `treatment-${id}`, group: 'Treatments', title, note, plan: plan('#111111', [full('photo', t)]) });
  treat('original', 'No treatment', 'The photo as it is, cropped to 4:5.', []);
  treat('grayscale', 'Grayscale', 'All colour removed.', [{ op: 'grayscale' }]);
  treat('duotone', 'Duotone', 'Dark tones become one palette colour, light tones another.', [{ op: 'duotone', dark: '#1b1033', light: '#ffb56b' }]);
  treat('halftone', 'Halftone', 'The photo as printed dots, like the newsprint look in the references.', [{ op: 'halftone', cell: 14, angle: 45, dark: '#141311', light: '#f2efe4', contrast: 1.2 }]);
  treat('grain', 'Film grain', 'Fine noise over the photo.', [{ op: 'grain', amount: 0.5, size: 2, seed: 7 }]);
  treat('levels', 'Brightness and contrast', 'Brighter, punchier, a little less colour.', [{ op: 'levels', brightness: 0.08, contrast: 0.35, saturation: -0.25 }]);
  treat('blur', 'Gaussian blur', 'Soft focus, for a photo that sits behind words.', [{ op: 'blur', radius: 18 }]);
  treat('motion', 'Motion blur', 'Smeared along one direction (here, sideways).', [{ op: 'motionBlur', length: 70, angle: 0 }]);
  treat('tint', 'Tint', 'A colour laid over the photo.', [{ op: 'tint', color: '#ff6a2b', amount: 0.4 }]);
  treat('vignette', 'Vignette', 'Dark edges, bright middle.', [{ op: 'vignette', amount: 0.75 }]);
  treat('fade', 'Dark fade from the bottom', 'A gradient up from the bottom edge, for words that sit low.', [{ op: 'fade', from: 'bottom', color: '#000000', amount: 0.92, start: 0.4 }]);
  treat('wash', 'Colour wash', 'One flat colour over the whole photo.', [{ op: 'wash', color: '#1b1033', amount: 0.5 }]);
  treat('film', 'Several together: film look', 'Grayscale, grain and a bottom fade, in that order (a treatment list is applied in order).', [{ op: 'levels', contrast: 0.2, saturation: -0.55 }, { op: 'tint', color: '#d9a35b', amount: 0.14 }, { op: 'grain', amount: 0.4, size: 2, seed: 3 }, { op: 'vignette', amount: 0.5 }, { op: 'fade', from: 'bottom', color: '#0c0b09', amount: 0.85, start: 0.5 }]);

  const mask = (id: string, title: string, m: Mask, w = 760, h = 760) =>
    items.push({ id: `mask-${id}`, group: 'Masks', title, note: 'The photo cut to this shape (the plan keeps the mask, so it can be changed with a patch).', plan: plan('#efe9dc', [photoLayer('photo', (W - w) / 2, (H - h) / 2, w, h, ref(), { mask: m, name: `Photo in ${title}` })]) });
  mask('round-rect', 'Rounded rectangle', { shape: 'roundRect', radius: 56 });
  mask('circle', 'Circle', { shape: 'ellipse' });
  mask('pill', 'Pill', { shape: 'pill' }, 880, 520);
  mask('arch', 'Arch', { shape: 'arch' }, 680, 860);
  mask('diamond', 'Diamond', { shape: 'diamond' });
  mask('flower', 'Flower', { shape: 'flower' });
  mask('blob', 'Blob', { shape: 'blob' });
  mask('starburst', 'Starburst', { shape: 'starburst' });

  const warm = field('field', '#f6efe6', [{ x: 0.2, y: 0.15, r: 0.5, color: '#ff7a3d', alpha: 0.9 }, { x: 0.85, y: 0.7, r: 0.55, color: '#ffb48a', alpha: 0.9 }], 120, 0.08, 11);
  const ph = phoneFrame('phone', 330, 190, 420, ref());
  items.push({ id: 'frame-phone', group: 'Frames', title: 'Phone frame', note: 'A phone body (dark, rounded) with the photo as its screen, on a soft field.', plan: plan('#f6efe6', [warm, ...ph.layers]) });
  const lp = laptopFrame('laptop', 90, 420, 900, ref());
  items.push({ id: 'frame-laptop', group: 'Frames', title: 'Laptop frame', note: 'A laptop lid and base with the photo as its screen.', plan: plan('#f6efe6', [warm, ...lp.layers]) });
  const po = polaroid('pol', 190, 250, 700, ref(), { rotation: -5 });
  items.push({ id: 'frame-polaroid', group: 'Frames', title: 'Polaroid', note: 'A white card with a thick bottom margin and a slight tilt, with a soft shadow.', plan: plan('#2a2723', po.layers) });
  items.push({ id: 'frame-ticket', group: 'Frames', title: 'Ticket', note: 'A card with a bite out of each side and a tear line; the photo sits in the main part.', plan: plan('#1d1b18', [...ticket('tk', 70, 380, 940, 540, { fill: '#f1ece0', background: '#1d1b18', line: '#9b9588', tearAt: 0.72 }), photoLayer('photo', 100, 410, 640, 480, ref(), { mask: { shape: 'roundRect', radius: 18 } })]) });
  items.push({ id: 'frame-strip', group: 'Frames', title: '3-up photo strip', note: 'Three photos side by side with small gaps (here the same photo, cropped three ways).', plan: plan('#efe9dc', strip('strip', 70, 300, 940, 750, 16, [{ ...ref(), focal: { x: 0.2, y: 0.5 } }, { ...ref(), focal: { x: 0.5, y: 0.5 } }, { ...ref(), focal: { x: 0.8, y: 0.5 } }])) });
  items.push({ id: 'frame-offset', group: 'Frames', title: 'Photo with an offset colour block', note: 'A flat colour block behind the photo, shifted down and right like a printed offset.', plan: plan('#efe9dc', blockOffset('ob', 110, 250, 800, 820, ref(), { block: '#ff5a2b', dx: 36, dy: 36 })) });
  const chips = chipCards('chip', 90, 880, [{ text: 'Real stories', rotation: -4, width: 380 }, { text: 'Real growth', rotation: 3, width: 370 }, { text: 'Save for later', rotation: -2, width: 430 }], { card: '#fbfaf5', ink: '#141311', font: 'Schibsted Grotesk', weight: 700 });
  items.push({ id: 'frame-chips', group: 'Frames', title: 'Tilted white chip cards', note: 'Small white cards with a line of words each, tilted a little, drawn in code on top of a photo.', plan: plan('#111111', [full('photo', [{ op: 'fade', from: 'bottom', color: '#000000', amount: 0.6, start: 0.4 }]), ...chips.layers]) });

  items.push({ id: 'bg-field-warm', group: 'Backgrounds', title: 'Blurred gradient field, warm', note: 'Soft colour blobs on a light base with a little grain.', plan: plan('#f6efe6', [warm]) });
  items.push({ id: 'bg-field-dark', group: 'Backgrounds', title: 'Blurred gradient field, dark', note: 'The same idea on near-black, in oranges.', plan: plan('#0d0b0a', [field('field', '#0d0b0a', [{ x: 0.5, y: 0.2, r: 0.5, color: '#ff6a1f', alpha: 1 }, { x: 0.1, y: 0.8, r: 0.45, color: '#7a2a0a', alpha: 1 }, { x: 0.95, y: 0.9, r: 0.4, color: '#ffae5a', alpha: 0.8 }], 130, 0.1, 5)]) });
  items.push({ id: 'bg-glow', group: 'Backgrounds', title: 'Glow', note: 'One big soft blob of light on a dark base.', plan: plan('#0b0a12', [field('field', '#0b0a12', [{ x: 0.5, y: 0.55, r: 0.38, color: '#8f6bff', alpha: 1 }, { x: 0.5, y: 0.55, r: 0.18, color: '#e5dcff', alpha: 0.9 }], 150, 0.05, 2)]) });
  items.push({ id: 'bg-glass-field', group: 'Backgrounds', title: 'Glass card over a field', note: 'A translucent card that blurs the colours behind it, with a soft border and rounded corners.', plan: plan('#0d0b0a', [field('field', '#0d0b0a', [{ x: 0.3, y: 0.3, r: 0.45, color: '#ff6a1f', alpha: 1 }, { x: 0.8, y: 0.7, r: 0.4, color: '#ffae5a', alpha: 0.9 }], 90, 0.08, 9), glass('glass', 110, 470, 860, 420)]) });
  items.push({ id: 'bg-glass-photo', group: 'Backgrounds', title: 'Glass card over a photo', note: 'The same card over the photo: the photo shows through, blurred.', plan: plan('#111111', [full('photo', []), glass('glass', 110, 700, 860, 440)]) });

  const obj = (id: string, title: string, note: string, fx: NonNullable<import('../../src/image-engine/types').ImageLayer['object']>, rot = 0, size = 560) =>
    items.push({ id: `object-${id}`, group: 'Objects', title, note: `${note} (STAND-IN object drawn in code, not a real cutout: no transparent pictures were supplied.)`, synthetic: true, plan: plan('#1a1a1f', [{ id: 'object', kind: 'image', name: 'Object (synthetic stand-in)', role: 'decor', x: (W - size) / 2, y: 330, width: size, height: size, rotation: rot, opacity: 1, src: object, fit: 'contain', object: fx, synthetic: true }]) });
  obj('contact', 'Soft contact shadow', 'A shadow flattened under the object, like it stands on a floor.', { shadow: 'contact' });
  obj('reflection', 'Floor reflection', 'A faded mirror image under the object.', { reflection: 0.45 });
  obj('glow', 'Glow', 'A coloured halo behind the object.', { glow: { color: '#a46bff', blur: 80, amount: 0.8 } });
  obj('rotated', 'Scale and rotation', 'The same object, smaller and turned, with a drop shadow.', { shadow: 'drop' }, 18, 420);
  return items;
}
