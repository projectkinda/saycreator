// Turns a layout plan into a finished slide by running the EXISTING pipeline: parsePack (the same sanitiser), clampSlots, fitSlots (type scale and floors),
// balanceVertical, resolveCollisions, finalGuards, packSlide (accent phrases with the contrast guard, marker) and stepperSvg. Nothing here re-implements fit, collision,
// balance or accent. New here: the cut (a plane the layout composes around, carrying part B of the layout), invert, density, the profile chrome.
import { loadFonts } from '../../image-engine/fonts';
import { layoutText } from '../../image-engine/draw/text';
import type { Layer } from '../../image-engine/types';
import { designKey, packSlide, parsePack, slotMetaOf, type SignatureDevices, type StylePack } from '../../reference/pack';
import { markerInk, type RLayer } from '../../reference/recreate';
import { resolveSvgTokens } from '../../reference/faithful';
import { balanceVertical, clampSlots, finalGuards, fitSlots, recurringLayers, recurringMarkup, resolveCollisions, stepperSvg } from '../designed';
import { avatarMarkup, chromeFor } from './chrome';
import { CUT_RATIO, RAKE, coloursFor, geometry, type Geometry, type Roles } from './cuts';
import { contrast, esc, setWeights } from './draw';
import { cutsOf, layoutDef } from './library';
import { validateSlideContent } from './pick';
import type { Cut, Cx, Fields, Gradient, LayoutStyle, Plan, PlaneTone, Slot } from './types';

export interface BuildOpts {
  handle: string;
  index: number;
  total: number;
  cut?: Cut;
  /** 'full' swaps field and plane colours (full-bleed accent when there is no plane); 'tint' moves the field to the surface colour. */
  invert?: false | 'full' | 'tint';
  /** 'statement' drops the secondary copy and sets the headline up to 232 px (statement, big-question, cta-button). */
  density?: 'normal' | 'statement';
  /** comparison: 'unequal' makes the second card loud and wider. */
  weight?: 'equal' | 'unequal';
  tone?: PlaneTone;
  /** The ground of the style's palette rhythm this slide takes (-1 = the closing ground); default: slide index mod the rhythm length. */
  ground?: number;
  /** Profile header: the name shown beside the avatar (default: made from the handle) and an optional picture (a data: URL is safest for PNG export). */
  name?: string;
  avatarUrl?: string;
}
export interface Built {
  ok: boolean;
  errors: string[];
  svg: string;
  layers: Layer[];
  notes: string[];
  /** The palette the engine drew the slide with: the roles on the surface the headline sits on (plus f* and p* roles for the field and the plane). */
  palette: Record<string, string>;
  fieldBg?: string;
  planeBg?: string;
  plan?: Plan;
  cut: Cut;
  field?: Geometry['field'];
  fieldBottom?: number;
  geometry?: Geometry;
  edgeDrawn?: boolean;
  /** The layout split into a field part and a plane part. */
  partitioned?: boolean;
}

const TOKENS = /\$(accentText|accentDisplay|onAccent|bg|text|muted|accent|surface)\b/g;
/** Points the role tokens of a markup at the roles of a surface ('f' field, 'p' plane): $text -> $fText ... */
const toward = (markup: string, surf: 'f' | 'p'): string => markup.replace(TOKENS, (_m, k: string) => '$' + surf + k[0].toUpperCase() + k.slice(1));

/** CSS-style angle to the two ends of an SVG gradient line through the middle of the slide. */
const gradientSvg = (g: Gradient): string => {
  const a = (g.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const f = (n: number) => Math.round(n * 1000) / 1000;
  return '<defs><linearGradient id="bgg" x1="' + f(0.5 - dx / 2) + '" y1="' + f(0.5 - dy / 2) + '" x2="' + f(0.5 + dx / 2) + '" y2="' + f(0.5 + dy / 2) + '">' + g.stops.map((s) => '<stop offset="' + s.at + '" stop-color="' + s.color + '"/>').join('') + '</linearGradient></defs><rect id="bg" width="1080" height="1350" fill="url(#bgg)"/>';
};
const background = (st: LayoutStyle): string => {
  if (st.background === 'gradient' && st.gradient) return gradientSvg(st.gradient);
  const base = '<rect id="bg" width="1080" height="1350" fill="$bg"/>';
  if (st.background === 'glow') return base + '<defs><radialGradient id="glow" cx="0.5" cy="0.36" r="0.75"><stop offset="0" stop-color="$accent" stop-opacity="0.22"/><stop offset="1" stop-color="$accent" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="1350" fill="url(#glow)"/>';
  if (st.background === 'grid') {
    let d = '';
    for (let x = 90; x < 1080; x += 90) d += `M ${x} 0 L ${x} 1350 `;
    for (let y = 90; y < 1350; y += 90) d += `M 0 ${y} L 1080 ${y} `;
    return base + `<path d="${d.trim()}" fill="none" stroke="$muted" stroke-opacity="0.16" stroke-width="2"/>`;
  }
  return base;
};
const slotSvg = (s: Slot, fill: string): string =>
  `<g><text data-role="${s.role}" data-min-size="${s.min}" data-max-lines="${s.lines}" x="${s.align === 'center' ? Math.round(s.x + s.w / 2) : s.x}" y="${Math.round(s.y + s.size * 0.82)}" font-family="${s.font}" font-size="${s.size}" font-weight="${s.weight}" fill="${fill}"${s.align === 'center' ? ' text-anchor="middle"' : ''}>${esc(s.text.split('\n')[0].slice(0, 40) || s.role)}</text></g>`;

export const paletteOf = (st: LayoutStyle): Record<string, string> => {
  const p = st.palette;
  const up = (c: string) => c.toUpperCase();
  const base = { bg: up(p.bg), text: up(p.text), muted: up(p.muted), accent: up(p.accent), surface: up(p.surface) };
  return { ...base, onAccent: up(p.onAccent ?? markerInk(base, base.accent)) };
};
const rolesOf = (r: Roles, p: 'f' | 'p'): Record<string, string> => ({ [p + 'Bg']: r.bg, [p + 'Text']: r.text, [p + 'Muted']: r.muted, [p + 'Accent']: r.accent, [p + 'Surface']: r.surface, [p + 'OnAccent']: r.onAccent, [p + 'AccentText']: r.accentText, [p + 'AccentDisplay']: r.accentDisplay });

/** Builds one slide: layout id + variant + fields + style (+ cut, invert, density) -> finished SVG and layers. No model call. */
/** The style of slide i: with a palette rhythm, ground i mod n replaces the palette (and a gradient over it). */
export function groundOf(st: LayoutStyle, index: number, ground?: number): LayoutStyle {
  const r = st.rhythm;
  if (!r || r.length < 2) return st;
  const gi = ground ?? index;
  const g = gi < 0 && st.closing ? st.closing : r[((gi % r.length) + r.length) % r.length];
  const { gradient, ...pal } = g;
  return { ...st, palette: pal, background: gradient ? 'gradient' : st.background === 'gradient' ? 'flat' : st.background, gradient };
}
const HEADLINE_FIELDS = new Set(['headline', 'title', 'question', 'quote', 'subject']);
/** Case transform of the headline fields (and the accent phrases): not kickers, captions, body, handles or counters. */
/** Brands that keep their spelling under a case transform (case-insensitive match, put back to this spelling). */
export const BRANDS = ['Kickstarter', 'YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'iPhone', 'iOS', 'AI'];
const mixedCase = (w: string) => w !== w.toLowerCase() && w !== w.toUpperCase() && w !== w[0].toUpperCase() + w.slice(1).toLowerCase();
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * After the transform, words that must keep their written case are put back: the style's own list and the built-in brands (a canonical spelling: "Kickstarter"), and the words of
 * the carousel's handle / name wherever the slide's text wrote them (their spelling as written: "Quick Flip"). Under upper case only the mixed-case brands (iPhone, YouTube, iOS)
 * are kept: a plain name in capitals is already as written.
 */
export function restoreBrands(orig: string, out: string, mode: 'upper' | 'lower', canon: string[], written: string[]): string {
  if (orig.length !== out.length) return out;
  let res = out;
  const put = (at: number, text: string) => {
    res = res.slice(0, at) + text + res.slice(at + text.length);
  };
  for (const w of canon) {
    if (mode === 'upper' && !mixedCase(w)) continue;
    for (const m of orig.matchAll(new RegExp('(?<![\\p{L}\\p{N}])' + reEsc(w) + '(?![\\p{L}\\p{N}])', 'giu'))) put(m.index ?? 0, w);
  }
  if (mode === 'lower') {
    const set = new Set(written.map((w) => w.toLowerCase()));
    for (const w of written)
      for (const m of orig.matchAll(new RegExp('(?<![\\p{L}\\p{N}])' + reEsc(w) + '(?![\\p{L}\\p{N}])', 'giu'))) {
        if (m[0] === m[0].toLowerCase()) continue;
        const at = m.index ?? 0;
        // a capital at the start of a sentence is not a brand mark, unless the next word is also a word of the name ("Quick Flip")
        const sentenceStart = at === 0 || /[.!?]\s*$/.test(orig.slice(0, at));
        const next = /^\s+([\p{L}\p{N}]+)/u.exec(orig.slice(at + m[0].length))?.[1]?.toLowerCase();
        if (!sentenceStart || (next && set.has(next))) put(at, m[0]);
      }
  }
  return res;
}
/** The words of a handle ("@quick.flip" -> quick, flip) that can be a brand name (3 letters or more). */
export const handleWords = (handle: string): string[] => handle.replace(/^@/, '').split(/[._\-\s]+/).filter((w) => w.length >= 3);
export function caseFields(f: Fields, mode: LayoutStyle['caseStyle'], ex: { canon?: string[]; written?: string[] } = {}): Fields {
  if (!mode || mode === 'none') return f;
  const canon = [...new Set([...(ex.canon ?? []), ...BRANDS])];
  const t = (x: string) => restoreBrands(x, mode === 'upper' ? x.toLocaleUpperCase() : x.toLocaleLowerCase(), mode, canon, ex.written ?? []);
  const out: Fields = { ...f };
  for (const [k, v] of Object.entries(f)) if (HEADLINE_FIELDS.has(k) && typeof v === 'string') out[k] = t(v);
  if (Array.isArray(f.accent)) out.accent = f.accent.map(t);
  else if (typeof f.accent === 'string') out.accent = t(f.accent);
  return out;
}
export async function buildSlide(layoutId: string, variant: 0 | 1, fields0: Fields, st00: LayoutStyle, o: BuildOpts): Promise<Built> {
  const st0 = groundOf(st00, o.index, o.ground);
  const fields = caseFields(fields0, st0.caseStyle, { canon: st0.caseExceptions, written: handleWords(o.handle ?? '') });
  const cut = o.cut ?? 'plain';
  // the planner reads the style's weights while it plans (a plan is synchronous)
  const planWith = (variant2: 0 | 1, style: LayoutStyle, cx: Cx) => {
    setWeights(style.weights);
    try {
      return def.plan(fields, variant2, style, cx);
    } finally {
      setWeights(null);
    }
  };
  // Shapes: subtle = a thinner, surface-toned plane; bold = a thicker accent plane
  const pk = st0.planeStrength === 'subtle' ? 0.8 : st0.planeStrength === 'bold' ? 1.18 : 1;
  const colours = coloursFor(paletteOf(st0), { tone: o.tone ?? (st0.planeStrength === 'subtle' ? 'surface' : undefined), invert: o.invert, tints: !((st0.rhythm?.length ?? 0) > 1) });
  const { F, P } = colours;
  // layouts see the style as drawn on the field (an inverted slide has other roles)
  const st: LayoutStyle = { ...st0, background: o.invert && st0.background === 'gradient' ? 'flat' : st0.background, accentStyle: F.accent === F.text || contrast(F.accentInk ?? F.accent, F.bg) < 4.5 ? 'marker' : st0.accentStyle, palette: { bg: F.bg, text: F.text, muted: F.muted, accent: F.accent, surface: F.surface, onAccent: F.onAccent } };
  const fail = (errors: string[]): Built => ({ ok: false, errors, svg: '', layers: [], notes: [], palette: { ...F }, cut });
  const v = validateSlideContent(layoutId, fields);
  if (!v.ok) return fail(v.errors);
  const def = layoutDef(layoutId)!;
  if (!cutsOf(layoutId).includes(cut)) return fail([`${layoutId} does not support the cut "${cut}" (it supports ${cutsOf(layoutId).join(', ')}).`]);
  await loadFonts();
  const mkCx = (field: Cx['field'], extra: Partial<Cx> = {}): Cx => ({ cut, field, density: o.density ?? 'normal', weight: o.weight ?? 'equal', ...extra });
  const side = { x0: 48, w: 978, y0: 190, y1: 1190 };
  let g!: Geometry;
  let plan!: Plan;
  let partitioned = false;
  // The plane without a part B takes a thin slab; a tall layout gets a thinner one until its content fits.
  const thin = (noPart: boolean) => {
    const ratios = cut === 'edge-v' ? [(CUT_RATIO[cut] * pk), 0.26] : [(CUT_RATIO[cut] * pk), (CUT_RATIO[cut] * pk) - 0.07, (CUT_RATIO[cut] * pk) - 0.13, 0.12];
    g = geometry(cut, ratios[0]);
    plan = planWith(variant, st, mkCx(g.field, { noPart }));
    for (const r of ratios.slice(1)) {
      if (plan.span <= g.field.y1 - g.field.y0 - 4) break;
      g = geometry(cut, r);
      plan = planWith(variant, st, mkCx(g.field, { noPart }));
    }
  };
  if (cut === 'plain') {
    g = geometry('plain');
    plan = planWith(variant, st, mkCx(g.field));
  } else if (cut === 'edge-v') thin(true);
  else {
    // Part B (the second half of the layout) goes on the plane: measure both halves, then set the plane so B starts just inside it.
    const p1 = planWith(variant, st, mkCx(side));
    const hA = p1.parts?.hA ?? 0;
    const hB = p1.parts?.hB ?? 0;
    if (hA > 20 && hB > 20) {
      const rake = RAKE[cut];
      const T = Math.min(Math.round(1350 * (1 - (CUT_RATIO[cut] * pk))), 1190 - hB - 48 - rake);
      if (T - 24 - 190 >= hA) {
        g = geometry(cut, 0, T);
        plan = planWith(variant, st, mkCx({ ...side, y1: T - 24 }, { partTop: T + 48 + rake, k: p1.k }));
        partitioned = true;
      }
    }
    if (!partitioned) thin(true);
  }
  const key = designKey(plan.type);
  const slots = [...plan.slots].sort((a, b) => a.y - b.y || a.x - b.x);
  // Rows (several body slots) take the slide's items in reading order.
  const bodySlots = slots.filter((s) => s.role === 'body');
  const slide: Record<string, unknown> = { ...plan.slide };
  if (bodySlots.length >= 2) slide.items = bodySlots.map((s) => s.text);
  // The surface the headline sits on decides the engine's palette (accent phrases are guarded against it); the other surface's tokens point at its own roles.
  const S: 'f' | 'p' = slots.find((s) => s.role === 'title')?.plane ? 'p' : 'f';
  const palette: Record<string, string> = { ...(S === 'p' ? P : F), ...rolesOf(F, 'f'), ...rolesOf(P, 'p'), plane: P.bg, planeInk: P.text };
  const on = (markup: string, surf: 'f' | 'p') => (surf === S ? markup : toward(markup, surf));
  const stepper = plan.stepper ? on(stepperSvg(plan.stepper.steps, plan.stepper.current, plan.stepper.bounds).replace(/Instrument Sans/g, st.fonts.body), plan.stepperPlane ? 'p' : 'f') : '';
  const photo = plan.photo ? on(`<rect data-image-slot="inset" data-mask="rect" data-fit="cover" x="${plan.photo.x}" y="${plan.photo.y}" width="${plan.photo.w}" height="${plan.photo.h}" fill="$surface"/>`, 'f') : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="${key}" data-layout="${layoutId}" data-palette='${JSON.stringify(palette)}'>${on(background(st), 'f')}${g.plane(colours.edge)}${on(plan.shapes, 'f')}${on(plan.planeShapes, 'p')}${photo}${slots.map((s) => slotSvg(s, on(s.fill, s.plane ? 'p' : 'f'))).join('')}${stepper}</svg>`;
  const parsed = await parsePack(svg, layoutId + ' ' + variant, palette);
  if (!parsed.ok) return fail(parsed.reasons);
  // The layout's own measured boxes replace the boxes the parser guessed from the sample words.
  let k = 0;
  const layers = (parsed.pack.designs[key] ?? []).map((l): RLayer => {
    if (l.kind !== 'text') return l;
    const s = slots[k++];
    if (!s) return l;
    return { ...l, x: s.x, y: s.y, width: s.w, height: s.h, text: s.text, style: { ...l.style, size: s.size, weight: s.weight, align: s.align, valign: s.valign ?? 'top', lineHeight: s.lh }, slot: { minSize: s.min, maxLines: s.lines, maxSize: Math.max(s.size, s.min) }, autoFit: { minSize: Math.min(s.min, s.size) } } as RLayer;
  });
  const devices = { ...st.devices, slides: 1, counts: { marker: 0, profileHeader: 0, underline: 0 } } as SignatureDevices;
  let pack: StylePack = { ...parsed.pack, palette, fonts: { headline: st.fonts.headline, body: st.fonts.body }, devices, designs: { ...parsed.pack.designs, [key]: layers }, slotMeta: { ...parsed.pack.slotMeta, [key]: slotMetaOf(layers) } };
  const notes: string[] = [];
  const problems: string[] = [];
  if (!partitioned && cut !== 'plain' && plan.span > g.field.y1 - g.field.y0 + 6) problems.push(`the content is ${Math.round(plan.span)} px tall and the free field above the ${cut} plane is ${Math.round(g.field.y1 - g.field.y0)} px.`);
  // The existing fit, balance, collision and final checks, in the order the Designed mode runs them.
  const fitted = fitSlots(clampSlots(pack, key), key, slide, o.handle, plan.fitAs);
  problems.push(...fitted.problems);
  notes.push(...fitted.notes);
  pack = fitted.pack;
  // Statement density: the engine's headline cap is 150 px; the planned larger size (up to 232) is put back after the fit.
  const big = slots.find((s) => s.role === 'title' && s.size > 150);
  if (big) {
    const ls = (pack.designs[key] ?? []).map((l) => (l.kind === 'text' && l.name === 'title' ? ({ ...l, x: big.x, width: big.w, height: big.h, style: { ...l.style, size: big.size, lineHeight: big.lh }, slot: { ...l.slot, minSize: 72, maxSize: big.size }, autoFit: { minSize: 72 } } as RLayer) : l));
    pack = { ...pack, designs: { ...pack.designs, [key]: ls }, slotMeta: { ...pack.slotMeta, [key]: slotMetaOf(ls) } };
    notes.push(`statement density: the headline is set at ${big.size} px.`);
  }
  const balanced = plan.noBalance || cut !== 'plain' ? pack : balanceVertical(pack, key, slide, o.handle, plan.fitAs);
  const col = resolveCollisions(balanced, key, slide, o.handle, plan.fitAs);
  problems.push(...col.problems);
  notes.push(...col.notes);
  problems.push(...finalGuards(col.pack, key, slide, o.handle));
  pack = col.pack;
  // The accent phrase of a big headline (96 px and up) is set in the display accent, a smaller one in the small-text accent.
  {
    const tl = (pack.designs[key] ?? []).find((l) => l.kind === 'text' && l.name === 'title') as { style?: { size: number } } | undefined;
    const roles = S === 'p' ? P : F;
    const ink = tl?.style && tl.style.size >= 96 ? roles.accentDisplay : roles.accentInk;
    const pal = { ...pack.palette };
    if (ink && ink.toUpperCase() !== roles.accent.toUpperCase()) pal.accentInk = ink;
    else delete pal.accentInk;
    pack = { ...pack, palette: pal };
  }
  const r = packSlide(pack, plan.type, slide, o.handle);
  if (!r.faithful) return fail(['the drawing could not be made: ' + r.notes.join(' ')]);
  notes.push(...r.notes);
  // The chrome (profile header, counter, swipe cue) uses the field's roles; an item on the plane takes the plane's ink, one that straddles the plane edge an ink that reads on both.
  const rec = chromeFor({ handle: o.handle, name: o.name, index: o.index, total: o.total, profile: !!st.devices.profileHeader, font: st.fonts.body }).map((c) => {
    if (c.shape) return c;
    const w = c.text.length * c.size * 0.58;
    const x0 = c.anchor === 'end' ? c.x - w : c.anchor === 'middle' ? c.x - w / 2 : c.x;
    const pts = [[x0, c.y - c.size * 0.8], [x0 + w, c.y - c.size * 0.8], [x0, c.y + c.size * 0.2], [x0 + w, c.y + c.size * 0.2]].filter(([px, py]) => g.on(px, py)).length;
    if (pts === 0) return c;
    if (pts === 4) return { ...c, fill: '$pText' };
    const best = [F.text, F.bg, F.muted, P.text].reduce((m, x) => (Math.min(contrast(x, P.bg), contrast(x, F.bg)) > Math.min(contrast(m, P.bg), contrast(m, F.bg)) ? x : m));
    return { ...c, fill: best };
  });
  let done = r.faithful.replace(/<\/svg>\s*$/i, () => resolveSvgTokens(recurringMarkup(rec, pack), palette) + (o.avatarUrl && st.devices.profileHeader ? avatarMarkup(o.avatarUrl) : '') + '</svg>');
  if (plan.bleedLeft) {
    // The giant numeral bleeds off the left edge: drawn further left (the checks still see it inside the margin).
    const doc = new DOMParser().parseFromString(done, 'image/svg+xml');
    doc.querySelectorAll('text').forEach((t) => {
      if (Number(t.getAttribute('font-size')) >= 300) t.querySelectorAll('tspan').forEach((s) => s.setAttribute('x', String(Number(s.getAttribute('x')) - plan.bleedLeft!)));
    });
    done = new XMLSerializer().serializeToString(doc.documentElement);
  }
  // A plane that holds no text and no shape (this layout does not carry content on a plane, or the content did not reach it) is an empty coloured band: the slide is drawn plain instead.
  if (cut !== 'plain') {
    const items = [...r.layers].filter((l) => l.kind !== 'image' && !/background/.test(String(l.name)) && l.height < 700 && (l.kind !== 'text' || (l as unknown as { text?: string }).text));
    const carries = items.some((l) => {
      const hh = l.kind === 'text' ? layoutText(l as never).height : l.height;
      return g.on(l.x + l.width / 2, l.y + hh / 2);
    });
    if (!carries) {
      const plain = await buildSlide(layoutId, variant, fields0, st00, { ...o, cut: 'plain' });
      plain.notes.push(`The ${cut} plane would hold no content, so the slide is drawn with no plane.`);
      return plain;
    }
  }
  return { ok: problems.length === 0, errors: problems, svg: done, layers: [...r.layers, ...recurringLayers(rec, pack, 'c' + o.index)], notes, palette, fieldBg: F.bg, planeBg: P.bg, plan, cut, field: g.field, fieldBottom: partitioned ? 1210 : g.fieldBottom, geometry: g, edgeDrawn: colours.edge, partitioned };
}
