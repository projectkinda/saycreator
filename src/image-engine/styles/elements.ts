// Places library elements (or, in a test render, the user's private test assets) on a finished slide, following the style's
// element rules: which tags, where, how many, how big, tinted how. Placement never covers text or content: it looks for free
// space around what is already there. Everything is repeatable: the same slide id gives the same placement.
import { layerBox, textInk, type Box } from '../carousel/lint';
import type { Palette } from '../carousel/types';
import { elementById, findElements, type ElementInfo } from '../assets/library';
import { shade } from '../assets/svg-prepare';
import { expandTags, isMeaningful, linkScore } from './tags';
import type { ElementLayer, ImageLayer, Layer, TextLayer } from '../types';
import type { ElementSpec } from './format';

export interface TestAsset {
  name: string;
  url: string;
  width: number;
  height: number;
  tags: string[];
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const overlaps = (a: Box, b: Box) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
const inflate = (b: Box, g: number): Box => ({ x: b.x - g, y: b.y - g, width: b.width + 2 * g, height: b.height + 2 * g });

/** The colour a token like "accent", "accent-dark" or "marker-light" stands for in a palette. */
export function tokenColour(pal: Palette, token: string, recolour?: Record<string, string>): string {
  const [role, variant] = token.split('-') as [keyof Palette, string | undefined];
  const mapped = (recolour?.[role] ?? role) as keyof Palette;
  const base = pal[mapped];
  const solid = typeof base === 'string' ? base : base.stops[0].color;
  return variant === 'dark' ? shade(solid, -0.28) : variant === 'light' ? shade(solid, 0.38) : solid;
}

export interface PlaceInput {
  spec: ElementSpec;
  pal: Palette;
  layers: Layer[];
  width: number;
  height: number;
  /** Slide type, so a style can leave some types alone. */
  type: string;
  /** Areas the layout keeps free (the split line and its arrow button). */
  keepClear?: Box[];
  /** The palette's name, so a rule can recolour differently per palette. */
  paletteName?: string;
  /** What the slide is about (2 to 4 tags). Rules with match "slide" use only elements linked to these. */
  slideTags?: string[];
  /** Place as if the slide had no tags (the old, random way). Only used to compare. */
  ignoreTags?: boolean;
  /** Elements the user swapped: when the engine would pick the key, it uses the value instead. */
  swaps?: Record<string, string>;
  /** Any text that identifies the slide (its id), so placement is repeatable. */
  seed: string;
  mode: 'shippable' | 'test';
  testAssets?: TestAsset[];
}
export interface Placed {
  layers: Layer[];
  /** Plain notes: what was placed, and what could not be. */
  notes: string[];
  /** The ids of library elements, or names of test assets, that were used. */
  used: string[];
  /** For each used element: whether it links to the slide's tags (null when it is plain decoration or the slide has no tags). */
  links?: { id: string; related: boolean | null; score: number }[];
}

export function placeElements(inp: PlaceInput): Placed {
  const { spec, pal, width: W, height: H } = inp;
  const notes: string[] = [];
  const used: string[] = [];
  const out: Layer[] = [];
  const links: NonNullable<Placed['links']> = [];
  const slideTags = inp.ignoreTags ? undefined : inp.slideTags;
  if (spec.types && !spec.types.includes(inp.type as never)) return { layers: out, notes: [`No elements on ${inp.type} slides in this style.`], used };
  const r = rng(hash(inp.seed));
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const gap = spec.gap ?? 28;

  // What is already on the slide: text ink and anything that is content or a container.
  const occupied: Box[] = [];
  const owner = new Map<Box, string>();
  const texts = new Map<string, { box: Box; lineStep: number; lastLine: { x: number; width: number } }>();
  let headline: Box | null = null;
  for (const l of inp.layers) {
    if (l.visible === false) continue;
    if (l.kind === 'text') {
      if (l.role === 'decor') continue;
      const ink = textInk(l as TextLayer);
      const b = ink.box;
      const inf = inflate(b, gap);
      occupied.push(inf);
      owner.set(inf, l.id);
      const last = ink.block.lines.filter((x) => x.text).pop();
      texts.set(l.id, { box: b, lineStep: ink.block.lineStep, lastLine: { x: l.x + (last?.x ?? 0), width: last?.width ?? b.width } });
      if (!headline && /^(headline|quote|label|value)$/.test(l.id)) headline = b;
    } else if (l.role === 'content' || l.role === 'container' || l.role === undefined) {
      if (l.id === 'bg') continue;
      occupied.push(inflate(layerBox(l), gap));
    } else if (l.role === 'decor' && !/^bg/.test(l.id)) {
      // The style's own decoration (corner marks, cards, shadows) also keeps its space, unless it is a full-slide background.
      const b = layerBox(l);
      if (b.width * b.height < 0.45 * W * H) occupied.push(inflate(b, gap * 0.4));
    }
  }

  const keep = new Set<Box>(inp.keepClear ?? []);
  for (const k of keep) occupied.push(k);
  const fullness = occupied.filter((o) => !(o.width >= W - 1)).reduce((n, o) => n + Math.max(0, Math.min(o.x + o.width, W) - Math.max(o.x, 0)) * Math.max(0, Math.min(o.y + o.height, H) - Math.max(o.y, 0)), 0) / (W * H);
  const target = Math.round(between(spec.density.min, spec.density.max + 0.999));
  const placed: Box[] = [];
  // A shadow or a sticker outline spreads past the element's box, so that space must be free too.
  const room = (b: Box, bleed: boolean, pad = 0, ignoreOwner?: string, tight = false) => {
    const vis: Box = bleed ? { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(W, b.x + b.width) - Math.max(0, b.x), height: Math.min(H, b.y + b.height) - Math.max(0, b.y) } : b;
    // The sticker outline and shadow grow the picture, so keep the grown shape inside the slide too.
    const grow = Math.min(pad, 24);
    if (!bleed && (b.x - grow < 8 || b.y - grow < 8 || b.x + b.width + grow > W - 8 || b.y + b.height + grow > H - 8)) return false;
    if (vis.width <= 0 || vis.height <= 0) return false;
    const probe = pad ? inflate(vis, pad) : vis;
    // A frame sits close to its text, so it is checked against the other text itself, not the clear space kept around it.
    return !occupied.some((o) => !(ignoreOwner && owner.get(o) === ignoreOwner) && overlaps(probe, tight && !keep.has(o) ? inflate(o, -gap + 18) : o)) && !placed.some((p) => overlaps(vis, p));
  };

  const candidatesFor = (zone: string, w: number, h: number): [number, number][] => {
    const tries: [number, number][] = [];
    const pick = (x0: number, x1: number, y0: number, y1: number, n: number) => {
      for (let i = 0; i < n; i++) tries.push([between(x0, x1), between(y0, y1)]);
    };
    if (zone === 'corner-tl') pick(8, W * 0.3, 8, H * 0.25, 70);
    else if (zone === 'corner-tr') pick(W * 0.65 - w, W - w - 8, 8, H * 0.25, 70);
    else if (zone === 'corner-bl') pick(8, W * 0.3, H * 0.65 - h, H - h - 8, 70);
    else if (zone === 'corner-br') pick(W * 0.65 - w, W - w - 8, H * 0.65 - h, H - h - 8, 70);
    else if (zone === 'near-headline' && headline) {
      const hb = headline;
      tries.push([hb.x + hb.width + gap * 0.5, hb.y + hb.height - h], [hb.x + hb.width - w, hb.y - h - gap], [hb.x, hb.y + hb.height + gap], [hb.x + hb.width + gap * 0.5, hb.y - h * 0.3], [hb.x - w - gap, hb.y + hb.height - h]);
      pick(hb.x - w, hb.x + hb.width, hb.y - h - gap * 2, hb.y + hb.height + gap * 2 + h, 40);
    } else if (zone === 'bleed-top') pick(-w * 0.3, W - w * 0.7, -h * 0.55, -h * 0.2, 40);
    else if (zone === 'bleed-bottom') pick(-w * 0.3, W - w * 0.7, H - h * 0.8, H - h * 0.45, 40);
    else if (zone === 'bleed-right') pick(W - w * 0.7, W - w * 0.35, 0, H - h, 40);
    else pick(8, W - w - 8, 8, H - h - 8, 120);
    return tries;
  };

  for (const rule of spec.rules) {
    if (out.length >= Math.min(target, spec.density.max)) break;
    const want = Math.round(between(rule.count[0], rule.count[1] + 0.999));
    for (let n = 0; n < want && out.length < Math.min(target, spec.density.max); n++) {
      const bleed = rule.zone.startsWith('bleed');
      let info: ElementInfo | null = null;
      let test: TestAsset | null = null;
      if (inp.mode === 'test') {
        const pool = inp.testAssets ?? [];
        const want = rule.match === 'slide' && slideTags ? expandTags(slideTags) : new Set(rule.tags);
        const tagged = pool.filter((t) => t.tags.some((x) => want.has(x)));
        if (rule.match === 'slide' && slideTags && tagged.length === 0) {
          notes.push(`No test picture is named for this slide's tags (${slideTags.join(', ')}), so none was placed.`);
          continue;
        }
        const from = tagged.length ? tagged : pool;
        if (!from.length) continue;
        test = from[Math.floor(r() * from.length)];
      } else {
        const bySlide = rule.match === 'slide' && !!slideTags;
        const found = findElements({ tags: bySlide ? [...expandTags(slideTags!)] : rule.tags, kinds: rule.kinds, texture: rule.zone === 'texture' || rule.tags.some((t) => ['halftone', 'grain', 'texture'].includes(t)) ? true : false });
        if (!found.length) {
          notes.push(bySlide ? `No element in the library links to this slide's tags (${slideTags!.join(', ')}), so none was placed instead of a random one.` : `No element in the library has any of the tags ${rule.tags.join(', ')}.`);
          continue;
        }
        // By slide: keep the best-linked ones, then pick among them (repeatably). Unrelated ones are never picked.
        // Never the same picture twice on one slide, so the second pick is the next best, not a repeat.
        const left = found.filter((e) => !used.includes(e.id));
        if (!left.length) {
          notes.push(`Every matching picture was already used on this slide, so none was repeated.`);
          continue;
        }
        let pool = left;
        if (bySlide) {
          const best = Math.max(...left.map((e) => linkScore(slideTags!, e.tags)));
          pool = left.filter((e) => linkScore(slideTags!, e.tags) === best);
        } else if (slideTags) {
          // A rule that picks among its own tags: when the slide has tags, take a linked one if there is one, else plain decoration.
          // A picture of a thing that has no link to the slide is never picked.
          const linked = left.filter((e) => isMeaningful(e) && linkScore(slideTags, e.tags) > 0);
          const plain = left.filter((e) => !isMeaningful(e));
          pool = linked.length ? linked : plain;
          if (!pool.length) {
            notes.push(`Every candidate for ${rule.tags.join(', ')} is a picture with no link to this slide's tags (${slideTags.join(', ')}), so none was placed.`);
            continue;
          }
        }
        info = pool[Math.floor(r() * pool.length)];
        const swapTo = inp.swaps?.[info.id] && elementById(inp.swaps[info.id]);
        if (swapTo) info = swapTo;
      }
      const size = between(rule.size[0], rule.size[1]);
      const aspect = test ? test.width / test.height : info!.width / info!.height;
      let w = aspect >= 1 ? size : size * aspect;
      let h = aspect >= 1 ? size / aspect : size;
      // Decoration needs a job. frame: a ring round the big number, a line under the headline. point: an arrow in the real gap
      // under the headline, pointing down at what follows. gap: only on a slide that has room, with extra clear space around it.
      let fixed: { x: number; y: number; rot: number; ignore?: string } | null = null;
      let rot: number | null = null;
      if (rule.role === 'frame') {
        const isRing = rule.tags.includes('circle') || (info?.tags ?? []).includes('circle');
        const tgt = isRing ? texts.get('value') : texts.get('headline') ?? texts.get('quote');
        if (!tgt) {
          notes.push(`No ${isRing ? 'ring' : 'underline'}: there is no ${isRing ? 'big number' : 'headline'} on this slide to frame.`);
          continue;
        }
        if (isRing) {
          const needW = tgt.box.width + 60;
          const needH = tgt.box.height + 30;
          w = Math.max(needW, needH * aspect);
          h = w / aspect;
          fixed = { x: tgt.box.x + tgt.box.width / 2 - w / 2, y: tgt.box.y + tgt.box.height / 2 - h / 2, rot: 0, ignore: 'value' };
        } else {
          w = Math.min(Math.max(tgt.lastLine.width * 0.9, 160), Math.min(rule.size[1] * 1.6, W - 2 * 76));
          h = w / aspect;
          fixed = { x: tgt.lastLine.x, y: tgt.box.y + tgt.box.height + 2, rot: 0, ignore: texts.has('headline') ? 'headline' : 'quote' };
        }
      } else if (rule.role === 'point') {
        const hb = texts.get('headline') ?? texts.get('quote');
        const below = [...texts.entries()].filter(([id, t]) => id !== 'headline' && id !== 'quote' && t.box.y > (hb ? hb.box.y + hb.box.height : H)).sort((a, b) => a[1].box.y - b[1].box.y)[0];
        if (!hb || !below) {
          notes.push('No arrow: there is nothing under the headline for it to point at.');
          continue;
        }
        const room0 = below[1].box.y - (hb.box.y + hb.box.height) - 2 * gap;
        if (room0 < 110) {
          notes.push('No arrow: the gap under the headline is too small.');
          continue;
        }
        // Turned to point down: the picture's width runs along the gap.
        w = Math.min(rule.size[1], room0);
        h = w / aspect;
        const vw = h;
        const cx = hb.box.x + Math.max(vw / 2 + 10, 90);
        const cy = hb.box.y + hb.box.height + gap + w / 2;
        fixed = { x: cx - w / 2, y: cy - h / 2, rot: 90 };
        rot = 90;
      } else if (rule.role === 'gap' && fullness > 0.5) {
        notes.push('No decoration: this slide is already full.');
        continue;
      }
      // A shadow spreads about a third of the picture's size, so big stickers need more clear space than small ones.
      const pad = (rule.shadow ? 40 + 0.3 * Math.max(w, h) : 0) + (rule.sticker && spec.sticker ? spec.sticker.width : 0) + (rule.role === 'gap' ? gap * 1.5 : 0);
      const visual = (x: number, y: number): Box => (rot === 90 ? { x: x + w / 2 - h / 2, y: y + h / 2 - w / 2, width: h, height: w } : { x, y, width: w, height: h });
      const spot = fixed ? (room(visual(fixed.x, fixed.y), false, 0, fixed.ignore, true) ? ([fixed.x, fixed.y] as [number, number]) : undefined) : candidatesFor(rule.zone, w, h).find(([x, y]) => room({ x, y, width: w, height: h }, bleed, pad));
      if (!spot) {
        notes.push(`No free space for ${test ? test.name : info!.id} (zone ${rule.zone}).`);
        continue;
      }
      // What is kept clear around this one for the next ones: its own box plus most of its shadow and sticker outline.
      placed.push(inflate(visual(spot[0], spot[1]), 10 + pad * 0.75));
      const common = { id: `el-${out.length + 1}`, role: 'decor' as const, x: Math.round(spot[0]), y: Math.round(spot[1]), width: Math.round(w), height: Math.round(h), rotation: fixed ? fixed.rot : rule.rotate ? Math.round(between(rule.rotate[0], rule.rotate[1])) : 0, opacity: rule.opacity ?? 1 };
      if (test) {
        const layer: ImageLayer = { ...common, name: `TEST ASSET: ${test.name}`, kind: 'image', src: test.url, fit: 'contain' };
        out.push(layer);
        used.push(test.name);
      } else {
        const colors: Record<string, string> = {};
        const swaps = (inp.paletteName && rule.recolourBy?.[inp.paletteName]) || rule.recolour;
        // Coloured objects (emoji-style pictures) keep their own colours unless the rule says "palette"; icons and drawn shapes take the palette.
        const own = rule.colour === 'original' || (rule.colour === undefined && info!.kind === 'object');
        if (!own) for (const [src, token] of Object.entries(info!.recolour)) colors[src] = tokenColour(pal, token, swaps);
        const layer: ElementLayer = { ...common, name: `Element: ${info!.id}`, kind: 'element', element: info!.id, ...(rule.tint ? { tint: tokenColour(pal, rule.tint, swaps) } : Object.keys(colors).length ? { colors } : {}) };
        if (rule.sticker && spec.sticker) layer.sticker = { color: tokenColour(pal, spec.sticker.color), width: spec.sticker.width };
        if (rule.shadow) layer.shadow = { color: 'rgba(0,0,0,0.35)', blur: 14, offsetX: 6, offsetY: 10 };
        out.push(layer);
        used.push(info!.id);
        links.push({ id: info!.id, related: inp.slideTags && isMeaningful(info!) ? linkScore(inp.slideTags, info!.tags) > 0 : null, score: inp.slideTags ? linkScore(inp.slideTags, info!.tags) : 0 });
      }
    }
  }
  if (out.length < spec.density.min) notes.push(`Only ${out.length} elements fit; the style asks for at least ${spec.density.min}.`);
  return { layers: out, notes, used, links };
}
