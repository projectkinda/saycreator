// Turning what the reader answers into a style that passes the style validator: the vocabulary the reader may use, the merge over a base
// style, the clean-up of references that cannot hold, and patches. Pure (no DOM, no network).
import { listElements } from '../image-engine/assets/library';
import { FONT_WEIGHTS } from '../image-engine/fonts';
import { VOCABULARY } from '../image-engine/styles/tags';
import { CASE_STYLES, CHROME_KINDS, ELEMENT_ZONES, LAYOUT_IDS, PALETTE_ROLES, SLIDE_TYPES, validateStyle, type SlideType, type StyleSpec } from '../image-engine/styles/format';
import { THUMB_LAYOUTS, TITLE_LOOKS } from '../image-engine/thumbnail/v2/spec';
import { MARK_KINDS, MARK_ZONES, MAX_MARKS, TEXTURE_MARKS } from '../image-engine/styles/marks-spec';
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
  const LOOK: Record<string, string> = {
    'Schibsted Grotesk': 'heavy bold grotesque, the usual headline face',
    'Instrument Sans': 'plain humanist sans for body text',
    'Hanken Grotesk': 'light to medium neo-grotesk (300 is a thin, airy headline)',
    'Space Mono': 'typewriter-style monospace for labels and code-like text',
    'Instrument Serif Italic': 'high-contrast italic serif, one weight, for an accent word or line',
    'Bebas Neue': 'tall condensed all-caps display face, one weight',
    'Caveat Brush': 'hand-drawn brush script, one weight',
  };
  const fonts = FONT_FAMILIES.map((f) => `${f} (${LOOK[f] ?? 'a bundled font'}; weights ${FONT_WEIGHTS[f].join(', ')})`).join('; ');
  return [
    'VOCABULARY. You may only use these. Anything else is rejected.',
    `- Fonts (only these are bundled; any other font is rejected): ${fonts}. fonts = {"headline": family, "headlineWeight": n, "body": family, "bodyWeight": n, "strong": n}.`,
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
    `- marks (optional, up to ${MAX_MARKS}: shapes and textures drawn in code, no pictures) = [{"kind": ${MARK_KINDS.join('|')}, "zone": ${MARK_ZONES.join('|')}, "size": px, "colour": role, "colour2"?: role, "text"?: words, "lines"?: [short lines], "rotate"?: -90 to 90, "points"?: 4 to 24, "opacity"?: 0.05 to 1, "bleed"?: bool, "font"?: "headline"|"body", "types"?: [slide types]}]. Shapes: asterisk, sparkle (size = width), round-badge and starburst-badge (size = diameter, text inside), circular-text (a ring of words, size = diameter), stamp (outlined box with words), ticket and label (words on a shape), outline-button (words and an arrow), arrow (curved), scribble-circle (a hand-drawn loop, put it over a word), ribbon (a band across the slide, size = its height), tape (a strip), two-tone-text (lines alternately in colour and colour2, size = text size). Textures: dot-grid and halftone-field (size = distance between dots; the zone is the area; halftone fades out away from the zone), stripes (size = distance between stripes, rotate = their angle), grain (size = speck spacing), text-rows (rows of repeated words, size = text size). Textures sit under the words, shapes over them. There is no gradient text.`,
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
  if (key === 'thumbnail' || key === 'elements' || key === 'marks' || key === 'rhythm' || key === 'byType') return over;
  return { ...(isObj(base) ? base : {}), ...over };
}

export interface AssembleOptions {
  /** Receives a plain sentence for every value that had to be moved to what the toolbox supports. */
  notes?: string[];
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
  return cleanSpec(spec as unknown as StyleSpec, o.target, o.notes);
}

/** Makes every cross-reference hold: palette names, treatment names, assets, weights, ranges. Never invents content. */
export function cleanSpec(s: StyleSpec, target: Target, notes?: string[]): StyleSpec {
  const spec = clone(s) as unknown as Bag & { palettes: Record<string, Bag>; layouts: Record<string, Bag[]> };
  const pals = isObj(spec.palettes) ? spec.palettes : {};
  const names = Object.keys(pals);
  const f = spec.fonts as Bag;
  // Every value the toolbox cannot honour is moved to the nearest one it can, and said in plain words (the closeness panel shows the list).
  const say = (m: string) => notes?.push(m);
  const roleName = (v: unknown) => typeof v === 'string' && (PALETTE_ROLES as readonly string[]).includes(v);
  const clampTo = (obj: Bag, key: string, lo: number, hi: number, name: string, why: string) => {
    const v = obj[key];
    if (typeof v !== 'number') return;
    const to = Math.min(hi, Math.max(lo, v));
    if (to !== v) {
      say(`${name} was ${v}, ${to > v ? 'raised' : 'lowered'} to ${to} (${why}).`);
      obj[key] = to;
    }
  };
  if (isObj(f)) {
    for (const k of ['headline', 'body'] as const) {
      if (!(FONT_FAMILIES as readonly string[]).includes(f[k] as string)) {
        say(`fonts.${k} "${String(f[k])}" is not a bundled font, so ${FONT_FAMILIES[k === 'headline' ? 0 : 1]} is used.`);
        f[k] = FONT_FAMILIES[k === 'headline' ? 0 : 1];
      }
    }
    for (const [k, fam, d] of [['headlineWeight', 'headline', 700], ['bodyWeight', 'body', 500], ['strong', 'body', 600]] as const) {
      const want = Number(f[k]) || d;
      const got = nearestWeight(f[fam] as string, want);
      if (got !== want) say(`fonts.${k} ${want} is not bundled for ${String(f[fam])}; ${got} is used.`);
      f[k] = got;
    }
  }
  if (isObj(spec.type)) for (const k of Object.keys(spec.type)) clampTo(spec.type, k, 32, 400, `type.${k}`, 'text under 32 px is too small to read on a phone');
  if (isObj(spec.spacing)) clampTo(spec.spacing, 'margin', 48, 300, 'spacing.margin', 'anything under 48 px is too close to the edge for the phone-size checker');
  // Corner radii, outlines and shadows have limits the drawing enforces (a marker's corner is a third of the radius and may not pass 100).
  if (isObj(spec.shape)) for (const [k, max] of [['radius', 120], ['outline', 24], ['stroke', 40], ['hardShadow', 40]] as const) clampTo(spec.shape, k, 0, max, `shape.${k}`, 'the most the drawing allows');
  if (isObj(spec.spacing)) for (const k of ['gap', 'section']) clampTo(spec.spacing, k, 0, 300, `spacing.${k}`, 'the most the layouts allow');
  clampTo(spec as unknown as Bag, 'headlineLineHeight', 0.8, 1.6, 'headlineLineHeight', 'the range the layouts allow');
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
  if (spec.marks !== undefined) {
    // Marks the drawing cannot make are dropped, and sizes are moved into range; each change is said in plain words.
    const list = Array.isArray(spec.marks) ? (spec.marks as Bag[]) : [];
    const kept: Bag[] = [];
    for (const raw of list) {
      if (!isObj(raw)) continue;
      const m: Bag = { ...raw };
      const kind = String(m.kind);
      if (!(MARK_KINDS as readonly string[]).includes(kind)) {
        say(`A mark of kind "${kind}" is not one the toolbox draws, so it was left out.`);
        continue;
      }
      if (!(MARK_ZONES as readonly string[]).includes(m.zone as string)) m.zone = 'top-right';
      if (!roleName(m.colour)) m.colour = 'accent';
      if (m.colour2 !== undefined && !roleName(m.colour2)) delete m.colour2;
      const tex = (TEXTURE_MARKS as readonly string[]).includes(kind);
      clampTo(m, 'size', tex ? 6 : 40, kind === 'text-rows' || kind === 'two-tone-text' ? 400 : 1600, `The ${kind} mark's size`, 'the range the drawing supports');
      if (typeof m.size !== 'number') m.size = tex ? 24 : 240;
      if (m.rotate !== undefined) clampTo(m, 'rotate', -90, 90, `The ${kind} mark's angle`, 'the range the drawing supports');
      if (m.points !== undefined) {
        m.points = Math.round(Math.min(24, Math.max(4, Number(m.points) || 8)));
      }
      if (m.opacity !== undefined) clampTo(m, 'opacity', 0.05, 1, `The ${kind} mark's opacity`, 'the range the drawing supports');
      if (typeof m.text === 'string') m.text = m.text.slice(0, 40);
      if (Array.isArray(m.lines)) m.lines = (m.lines as unknown[]).filter((l) => typeof l === 'string' && l.trim()).map((l) => String(l).slice(0, 24)).slice(0, 4);
      if (m.types !== undefined) m.types = Array.isArray(m.types) ? (m.types as string[]).filter((t) => (SLIDE_TYPES as string[]).includes(t)) : undefined;
      if (m.types === undefined || (m.types as string[]).length === 0) delete m.types;
      if (['circular-text', 'stamp', 'ticket', 'label', 'outline-button', 'text-rows'].includes(kind) && !(typeof m.text === 'string' && m.text.trim())) {
        say(`The ${kind} mark has no words, so it was left out.`);
        continue;
      }
      if (kind === 'two-tone-text' && !(Array.isArray(m.lines) && m.lines.length)) {
        say('The two-tone text mark has no lines, so it was left out.');
        continue;
      }
      kept.push(m);
    }
    if (kept.length > MAX_MARKS) say(`Only ${MAX_MARKS} marks fit in one style; the rest were left out.`);
    if (kept.length) spec.marks = kept.slice(0, MAX_MARKS);
    else delete spec.marks;
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
export function applyPatches(spec: StyleSpec, patches: SpecPatch[], target: Target, notes?: string[]): { spec: StyleSpec; refused: string[] } {
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
  return { spec: cleanSpec(next as unknown as StyleSpec, target, notes), refused };
}
