// Code-side variants for a repeated slide type inside ONE carousel (no model call): the 2nd, 3rd and 4th slide of a type look related to the 1st but not identical.
//   nth 0: the design as drawn.  nth 1: mirrored (text anchor and picture spot move to the other side).  nth 2: palette rhythm swap (page and panel colours trade places).  nth 3: both.
// A variant that would put text under 32 px or off the slide, or lower a contrast the design relies on, is declined: the design is used as drawn.
import { contrastRgb, parseColor } from '../image-engine/lint/color';
import type { ImageSlot } from '../images/slots';
import { parsePath, segsToD, transformSegs, type RLayer } from './recreate';
import type { PackType, StylePack } from './pack';

export type VariantKind = 'mirror' | 'palette';
export const variantKinds = (nth: number): VariantKind[] => (nth % 4 === 1 ? ['mirror'] : nth % 4 === 2 ? ['palette'] : nth % 4 === 3 ? ['mirror', 'palette'] : []);

const ratio = (a: string, b: string) => {
  try {
    return contrastRgb(parseColor(a).rgb, parseColor(b).rgb);
  } catch {
    return 0;
  }
};

/** Text stays on the slide and stays at 32 px or more. */
export function textSafe(layers: RLayer[], W: number): boolean {
  return layers.every((l) => l.kind !== 'text' || (l.x >= -0.5 && l.x + l.width <= W + 0.5 && (l.slot?.minSize ?? 32) >= 32));
}

function mirrorLayer(l: RLayer, W: number): RLayer {
  const x = W - l.x - l.width;
  const base = { ...l, x, rotation: -(l.rotation ?? 0) } as RLayer;
  if (l.kind === 'text') return { ...base, style: { ...l.style, align: l.style.align === 'left' ? 'right' : l.style.align === 'right' ? 'left' : l.style.align } } as RLayer;
  if (l.kind === 'path') return { ...base, d: segsToD(transformSegs(parsePath(l.d), [-1, 0, 0, 1, l.width, 0])) } as RLayer;
  return base;
}

/** The design's SVG with its drawing flipped (text-free top-level parts get a flip transform, picture markers move). Null when it cannot be done safely. */
function mirrorSvg(svg: string, W: number): string | null {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  const vbw = Number((root.getAttribute('viewBox') ?? `0 0 ${W} 1`).split(/\s+/)[2]) || W;
  for (const c of Array.from(root.children)) {
    const tag = c.nodeName.toLowerCase();
    if (tag === 'defs' || tag === 'style') continue;
    if (c.hasAttribute('data-image-slot')) {
      const x = Number(c.getAttribute('x') ?? 0);
      const w = Number(c.getAttribute('width') ?? 0);
      c.setAttribute('x', String(vbw - x - w));
      continue;
    }
    const hasText = tag === 'text' || !!c.querySelector('text');
    if (hasText) {
      // A group that mixes text with drawing cannot be flipped without flipping the letters: no variant.
      if (tag !== 'text' && c.querySelector('path,circle,ellipse,rect,polygon,polyline,line')) return null;
      continue;
    }
    c.setAttribute('transform', `translate(${vbw},0) scale(-1,1) ${c.getAttribute('transform') ?? ''}`.trim());
  }
  return new XMLSerializer().serializeToString(root);
}

function mirrorDesign(pack: StylePack, used: PackType | 'base'): StylePack | null {
  const layers = pack.designs[used];
  if (!layers) return null;
  const W = pack.canvas.w;
  const mirrored = layers.map((l) => mirrorLayer(l, W));
  if (!textSafe(layers, W) || !textSafe(mirrored, W)) return null;
  let svgs = pack.svgs;
  if (pack.svgs?.[used]) {
    const s = mirrorSvg(pack.svgs[used]!, W);
    if (!s) return null;
    svgs = { ...pack.svgs, [used]: s };
  }
  const slots = pack.imageSlots?.[used];
  const moved: ImageSlot[] | undefined = slots?.map((s) => (s.kind === 'background' ? s : { ...s, x: W - s.x - s.w }));
  return { ...pack, designs: { ...pack.designs, [used]: mirrored }, ...(svgs ? { svgs } : {}), ...(moved ? { imageSlots: { ...pack.imageSlots, [used]: moved } } : {}) };
}

/** Page and panel colours trade places when text, muted text and accent all keep their contrast on the new page colour. Null otherwise. */
function swapPalette(pack: StylePack): StylePack | null {
  const { bg, surface, text, muted, accent } = pack.palette;
  if (!bg || !surface || !text || bg.toUpperCase() === surface.toUpperCase()) return null;
  if (ratio(bg, surface) < 1.1) return null;
  if (ratio(text, surface) < 4.5) return null;
  if (muted && ratio(muted, surface) < 3) return null;
  if (accent && ratio(accent, surface) < 3) return null;
  return { ...pack, palette: { ...pack.palette, bg: surface, surface: bg } };
}

export function variantPack(pack: StylePack, used: PackType | 'base', nth: number): { pack: StylePack; done: VariantKind[] } {
  let p = pack;
  const done: VariantKind[] = [];
  for (const k of variantKinds(nth)) {
    const next = k === 'mirror' ? mirrorDesign(p, used) : swapPalette(p);
    if (next) {
      p = next;
      done.push(k);
    }
  }
  return { pack: p, done };
}
