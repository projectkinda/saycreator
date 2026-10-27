// Turning what the reader answers into a style that passes the style validator: the vocabulary the reader may use, the merge over a base
// style, the clean-up of references that cannot hold, and patches. Pure (no DOM, no network).
import { listElements } from '../image-engine/assets/library';
import { FONT_WEIGHTS } from '../image-engine/fonts';
import { VOCABULARY } from '../image-engine/styles/tags';
import { CASE_STYLES, CHROME_KINDS, ELEMENT_ZONES, LAYOUT_IDS, PALETTE_ROLES, SLIDE_TYPES, validateStyle, type SlideType, type StyleSpec } from '../image-engine/styles/format';
import { THUMB_LAYOUTS, TITLE_LOOKS } from '../image-engine/thumbnail/v2/spec';
import { FONT_FAMILIES } from '../image-engine/types';
import { FRAME_CHOICES, SHAPE_CHOICES } from '../carousel/photoChoices';
import { LEARN_SECTIONS, type LearnFrom, type Target } from './types';

type Bag = Record<string, unknown>;
const isObj = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** The tags a style's elements may use, as the validator knows them. */
const knownTags = () => new Set(listElements().flatMap((e) => e.tags.map((t) => t.toLowerCase())));

/** What the reader is allowed to say, as plain text for its prompt. Built from the same lists the validator uses, so it cannot drift. */
export function vocabularyText(): string {
  const fonts = FONT_FAMILIES.map((f) => `${f} (weights ${FONT_WEIGHTS[f].join(', ')})`).join('; ');
  return [
    'VOCABULARY. You may only use these. Anything else is rejected.',
    `- Fonts (only these two are bundled): ${fonts}. fonts = {"headline": family, "headlineWeight": n, "body": family, "bodyWeight": n, "strong": n}.`,
    `- Palettes: a map of names to palettes. Every palette has exactly these colours, each "#RRGGBB" ("bg" may also be {"type":"linear","angle":deg,"stops":[{"at":0,"color":"#..."},{"at":1,"color":"#..."}]}): ${PALETTE_ROLES.join(', ')}. text on bg and onAccent on accent need 4.5:1 contrast. "rhythm" is a list of palette names used slide after slide; "byType" maps a slide type to a palette name.`,
    '- type = font sizes in px on a 1080 wide slide, each 10 to 400: {"cover","headline","body","small","stat","quote","label"}. Keep body and small at 32 or more.',
    `- caseStyle: ${CASE_STYLES.join(' | ')}. headlineLineHeight 0.8 to 1.6. chrome: ${CHROME_KINDS.join(' | ')}.`,
    '- shape = {"radius","outline","stroke","hardShadow": numbers >= 0, "badge": circle|rounded|square, "marker": box|underline|brush (the highlight style), "sticker": pill|tag|burst, "decor": rings|orbs|blocks}.',
    '- spacing = {"margin" (48 or more), "gap", "section"} in px.',
    `- Slide types and their layouts: ${SLIDE_TYPES.map((t) => `${t}: ${LAYOUT_IDS[t].join(', ')}`).join('. ')}.`,
    '- layouts = {slideType: [rule, ...]}. Every slide type needs at least 2 rules using at least 2 different layouts; the last rule has no "when". A rule is {"use": layoutId, "when"?: {...}, "palette"?: paletteName, "params"?: {...}}.',
    '  "when" keys: indexMin, indexMax, headlineWordsMin, headlineWordsMax, bodyWordsMin, bodyWordsMax, itemsMin, itemsMax, valueCharsMax, quoteCharsMin (numbers), occurrence ("odd"|"even"), photo (true|false: the slide has a photo).',
    `  "params" keys you may use: treatment (a name in photo.treatments), bar ("none"|"last"|"all": the marker bar under headline words), kicker ("pill"|"label"|"sticker"), frame (${FRAME_CHOICES.map((f) => f.id).join('|')}), shape (${SHAPE_CHOICES.map((f) => f.id).join('|')}), field (true: soft colour field background), glass (true), pill (true), offset (true), ghost (true), button (true), side ("left"|"right"), at (0.3 to 0.7, where a split falls), badgeSize, numeralSize, ruleWidth (px), tilt (degrees), prefix (text), alt (a palette name). Do not use any "asset" params.`,
    '- photo (optional) = {"treatments": {name: [step, ...]}, "field": {"blobs":[{"x","y","r","color","alpha"?}],"blur","grain"}, "glass": {"fill":"rgba(...)","blur","radius","border"?}, "overlay": colour}. A step is one of: {"op":"grayscale","amount"?}, {"op":"duotone","dark","light"}, {"op":"halftone","cell","angle"?,"dark","light","contrast"?}, {"op":"grain","amount","size"?}, {"op":"levels","brightness"?,"contrast"?,"saturation"?} (each -1 to 1), {"op":"blur","radius"}, {"op":"tint","color","amount"}, {"op":"vignette","amount"}, {"op":"fade","from":"bottom|top|left|right","color","amount"}, {"op":"wash","color","amount"}. Colours may be "$accent", "$bg", "$text" (a colour of the slide\'s own palette).',
    `- elements (optional, small pictures placed around text) = {"density":{"min","max"},"gap"?,"rules":[{"tags":[words],"zone":${ELEMENT_ZONES.join('|')},"count":[a,b],"size":[small,big],"rotate"?:[a,b],"kinds"?:["icon"|"object"|"code"],"role"?:"frame"|"point"|"gap" (required when the tags are plain decoration)}]}. Tags come from: ${VOCABULARY.join(', ')}, and the decoration words arrow, burst, sparkle, squiggle, underline, circle, tape, star.`,
    `- thumbnail (optional, how the style looks as a thumbnail) = {"palette": name, "title": {"look": ${TITLE_LOOKS.join('|')}, "colour": role, "ground"?: role (needed for plate and outline), "weight"?: n, "case"?: "upper"|"sentence"}, "treatment"?: [steps], "layouts": [3 or more of ${THUMB_LAYOUTS.join(', ')}], "block"?: role, "scrim"?: "#RRGGBB" or "$role", "glass"?: bool, "elements"?: bool, "field"?: bool}. Roles are palette colour names.`,
    '- Backgrounds: a palette bg colour or gradient, photo.field blobs, glass cards. Highlight styles: shape.marker. Masks and frames: the frame and shape params above.',
  ].join('\n');
}

/** A short excerpt of a valid style, so the reader sees the exact shapes. */
export function exampleExcerpt(base: StyleSpec): string {
  const firstPal = Object.keys(base.palettes)[0];
  const cover = base.layouts.cover.map((r) => ({ ...r, params: r.params ? Object.fromEntries(Object.entries(r.params).filter(([k]) => !k.startsWith('asset') && k !== 'visual')) : undefined }));
  return JSON.stringify({ fonts: base.fonts, type: base.type, caseStyle: base.caseStyle, headlineLineHeight: base.headlineLineHeight, shape: base.shape, spacing: base.spacing, chrome: base.chrome, palettes: { [firstPal]: base.palettes[firstPal] }, rhythm: base.rhythm.slice(0, 2), layouts: { cover }, ...(base.photo ? { photo: { treatments: Object.fromEntries(Object.entries(base.photo.treatments).slice(0, 2)) } } : {}), ...(base.thumbnail ? { thumbnail: base.thumbnail } : {}) }, null, 1);
}

// ---------- building a style from the reader's answer ----------

const HEX = /^#[0-9a-fA-F]{6}$/;
const nearestWeight = (family: string, w: number) => {
  const list = FONT_WEIGHTS[family as keyof typeof FONT_WEIGHTS] ?? [400];
  return list.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
};

/** Overlays `over` on `base` one level down for the sections that are maps of named things. */
function mergeSection(key: string, base: unknown, over: unknown): unknown {
  if (!isObj(over)) return over;
  if (key === 'palettes') {
    const out: Bag = isObj(base) ? { ...base } : {};
    const fallback = isObj(base) ? (Object.values(base)[0] as Bag) : {};
    for (const [name, pal] of Object.entries(over)) if (isObj(pal)) out[name] = { ...(isObj(out[name]) ? out[name] : fallback), ...Object.fromEntries(Object.entries(pal).filter(([k, v]) => (k === 'bg' ? isObj(v) || (typeof v === 'string' && HEX.test(v)) : typeof v === 'string' && HEX.test(v)))) };
    return out;
  }
  if (key === 'layouts') {
    const out: Bag = isObj(base) ? { ...base } : {};
    for (const [t, rules] of Object.entries(over)) if (Array.isArray(rules) && rules.length) out[t] = rules;
    return out;
  }
  if (key === 'photo') {
    const b = isObj(base) ? base : {};
    return { ...b, ...over, treatments: { ...(isObj(b.treatments) ? b.treatments : {}), ...(isObj(over.treatments) ? over.treatments : {}) } };
  }
  if (key === 'thumbnail' || key === 'elements' || key === 'rhythm' || key === 'byType') return over;
  return { ...(isObj(base) ? base : {}), ...over };
}

export interface AssembleOptions {
  /** The sections the references allow the style to take (see LEARN_SECTIONS). Others keep the base style's values. */
  sections: string[];
  /** The unique style name (also its folder name for validation), for example "mine-bold-poster-ab12". */
  name: string;
  title: string;
  target: Target;
  /** A sentence of where it came from. */
  note: string;
}

/** The style the reader described, laid over the base style, cleaned so every reference inside it holds. */
export function assembleSpec(base: StyleSpec, answer: Bag, o: AssembleOptions): StyleSpec {
  const spec = clone(base) as unknown as Bag;
  for (const key of o.sections) if (answer[key] !== undefined) spec[key] = mergeSection(key, spec[key], answer[key]);
  spec.schema = 1;
  spec.name = o.name;
  spec.title = o.title;
  spec.version = '1.0.0';
  spec.basedOn = { cluster: 'your references', note: o.note };
  spec.assets = {};
  delete spec.knownLintConflicts;
  delete spec.notReproduced;
  if (typeof answer.description === 'string' && o.sections.includes('description') && answer.description.length >= 10) spec.description = answer.description.slice(0, 140);
  else spec.description = (typeof base.description === 'string' ? base.description : 'A style made from your own references.').slice(0, 140);
  return cleanSpec(spec as unknown as StyleSpec, o.target);
}

/** Makes every cross-reference hold: palette names, treatment names, assets, weights, ranges. Never invents content. */
export function cleanSpec(s: StyleSpec, target: Target): StyleSpec {
  const spec = clone(s) as unknown as Bag & { palettes: Record<string, Bag>; layouts: Record<string, Bag[]> };
  const pals = isObj(spec.palettes) ? spec.palettes : {};
  const names = Object.keys(pals);
  const f = spec.fonts as Bag;
  if (isObj(f)) {
    if (!(FONT_FAMILIES as readonly string[]).includes(f.headline as string)) f.headline = FONT_FAMILIES[0];
    if (!(FONT_FAMILIES as readonly string[]).includes(f.body as string)) f.body = FONT_FAMILIES[1];
    f.headlineWeight = nearestWeight(f.headline as string, Number(f.headlineWeight) || 700);
    f.bodyWeight = nearestWeight(f.body as string, Number(f.bodyWeight) || 500);
    f.strong = nearestWeight(f.body as string, Number(f.strong) || 600);
  }
  if (isObj(spec.type)) for (const k of Object.keys(spec.type)) if (typeof spec.type[k] === 'number') spec.type[k] = Math.min(400, Math.max(10, spec.type[k] as number));
  if (isObj(spec.spacing) && typeof spec.spacing.margin === 'number') spec.spacing.margin = Math.max(48, spec.spacing.margin);
  if (typeof spec.headlineLineHeight === 'number') spec.headlineLineHeight = Math.min(1.6, Math.max(0.8, spec.headlineLineHeight));
  if (Array.isArray(spec.rhythm)) spec.rhythm = (spec.rhythm as string[]).filter((n) => names.includes(n));
  if (!Array.isArray(spec.rhythm) || spec.rhythm.length === 0) spec.rhythm = names.slice(0, 2);
  if (isObj(spec.byType)) spec.byType = Object.fromEntries(Object.entries(spec.byType).filter(([t, n]) => (SLIDE_TYPES as string[]).includes(t) && names.includes(n as string)));
  const photo = isObj(spec.photo) ? spec.photo : null;
  const treatmentNames = photo && isObj(photo.treatments) ? Object.keys(photo.treatments) : [];
  for (const t of Object.keys(spec.layouts ?? {})) {
    if (!(SLIDE_TYPES as string[]).includes(t)) {
      delete spec.layouts[t];
      continue;
    }
    spec.layouts[t] = (spec.layouts[t] as Bag[])
      .filter((r) => isObj(r) && (LAYOUT_IDS[t as SlideType] as string[]).includes(r.use as string))
      .map((r) => {
        const rule: Bag = { ...r };
        if (typeof rule.palette === 'string' && !names.includes(rule.palette)) delete rule.palette;
        if (isObj(rule.params)) {
          const p: Bag = {};
          for (const [k, v] of Object.entries(rule.params)) {
            if (k.startsWith('asset')) continue;
            if (k === 'visual' && v === 'asset') continue;
            if (k === 'treatment' && !treatmentNames.includes(v as string)) continue;
            if (k === 'alt' && !names.includes(v as string)) continue;
            p[k] = v;
          }
          rule.params = p;
        }
        return rule;
      });
    // The last rule is the fallback: no condition.
    const rules = spec.layouts[t] as Bag[];
    if (rules.length) delete (rules[rules.length - 1] as Bag).when;
  }
  if (target === 'carousel') delete spec.thumbnail;
  else if (isObj(spec.thumbnail)) {
    const tb = spec.thumbnail;
    if (!names.includes(tb.palette as string)) tb.palette = names[0];
    if (Array.isArray(tb.layouts)) tb.layouts = [...new Set((tb.layouts as string[]).filter((l) => (THUMB_LAYOUTS as readonly string[]).includes(l)))];
    if (!Array.isArray(tb.layouts) || (tb.layouts as string[]).length < 3) tb.layouts = ['title-over-photo', 'face-left-title-right', 'split-colour'];
    const roleOk = (r: unknown) => typeof r === 'string' && (PALETTE_ROLES as readonly string[]).includes(r);
    if (isObj(tb.title)) {
      if (!roleOk(tb.title.colour)) tb.title.colour = 'text';
      if ((tb.title.look === 'plate' || tb.title.look === 'outline') && !roleOk(tb.title.ground)) tb.title.ground = tb.title.look === 'plate' ? 'accent' : 'bg';
      if (tb.title.weight !== undefined && isObj(f)) tb.title.weight = nearestWeight(f.headline as string, Number(tb.title.weight));
    }
    if (tb.block !== undefined && !roleOk(tb.block)) delete tb.block;
    if (tb.elements === true && !isObj(spec.elements)) tb.elements = false;
    if (tb.field === true && !(photo && (photo.field || photo.fields))) tb.field = false;
    if (typeof tb.scrim === 'string' && !(HEX.test(tb.scrim) || (tb.scrim.startsWith('$') && roleOk(tb.scrim.slice(1))))) delete tb.scrim;
  }
  return spec as unknown as StyleSpec;
}

/** The thumbnail block a style gets when a thumbnail target was asked for and the reader gave none: plain and safe, from the first palette. */
export function defaultThumbnail(spec: StyleSpec): NonNullable<StyleSpec['thumbnail']> {
  const palette = Object.keys(spec.palettes)[0];
  return { palette, title: { look: 'plain', colour: 'text' }, layouts: ['title-over-photo', 'face-left-title-right', 'split-colour'], block: 'accent', scrim: '$bg' };
}

/** The style validator's verdict on a spec, in plain sentences. */
export function checkSpec(spec: StyleSpec): { errors: string[]; warnings: string[] } {
  return validateStyle(spec, spec.name, knownTags());
}

/** The sections a set of "learn from" choices allows. */
export function sectionsFor(choices: LearnFrom[]): string[] {
  return [...new Set(choices.flatMap((c) => LEARN_SECTIONS[c]))];
}

// ---------- patches ----------

export interface SpecPatch {
  /** A dotted path into the style, for example "type.headline" or "palettes.ink.bg". */
  path: string;
  value: unknown;
}
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype', 'name', 'schema', 'assets', 'version', 'basedOn']);

/** Sets values at paths. Refuses paths that could harm the object. Returns the new spec (cleaned) and what was refused. */
export function applyPatches(spec: StyleSpec, patches: SpecPatch[], target: Target): { spec: StyleSpec; refused: string[] } {
  const next = clone(spec) as unknown as Bag;
  const refused: string[] = [];
  for (const p of patches) {
    const keys = String(p.path).split('.').filter(Boolean);
    if (keys.length === 0 || keys.some((k) => FORBIDDEN.has(k))) {
      refused.push(`${p.path}: not a place a style can be changed`);
      continue;
    }
    let cur: Bag = next;
    let ok = true;
    for (const k of keys.slice(0, -1)) {
      if (!isObj(cur[k]) && !Array.isArray(cur[k])) {
        if (cur[k] === undefined) cur[k] = {};
        else {
          ok = false;
          break;
        }
      }
      cur = cur[k] as Bag;
    }
    if (!ok) {
      refused.push(`${p.path}: the path does not exist`);
      continue;
    }
    const last = keys[keys.length - 1];
    if (p.value === null) delete cur[last];
    else cur[last] = p.value;
  }
  return { spec: cleanSpec(next as unknown as StyleSpec, target), refused };
}
