// The style file format (styles/<name>/style.json) and its validator. Every rejection is a sentence a person can act on.
// A style is a folder: style.json plus an assets/ folder of small SVG graphics. The engine reads styles only from these files.
import { contrast, parseColor } from '../lint/color';
import { FONT_WEIGHTS } from '../fonts';
import type { Palette, SlideScript, Theme } from '../carousel/types';
import { FONT_FAMILIES, type Treatment } from '../types';
import { isColor, validFill, validateTreatment } from '../validate';
import { resolveTreatments } from '../photo/resolve';

export type SlideType = SlideScript['type'];
export const SLIDE_TYPES: SlideType[] = ['cover', 'content', 'step', 'stat', 'checklist', 'beforeafter', 'quote', 'closing'];

/** Which layout variants exist for each slide type. A style picks from these by name. */
export const LAYOUT_IDS: Record<SlideType, string[]> = {
  cover: ['cover-stack', 'cover-top', 'cover-centre', 'cover-photo-full', 'cover-photo-shape', 'cover-photo-split'],
  content: ['content-stack', 'content-bar', 'content-columns', 'content-photo-frame', 'content-photo-strip'],
  step: ['step-badge', 'step-numeral', 'step-pill'],
  stat: ['stat-giant', 'stat-card', 'stat-photo'],
  checklist: ['checklist-icons', 'checklist-lines'],
  beforeafter: ['ba-split', 'ba-cards'],
  quote: ['quote-marks', 'quote-centre', 'quote-photo-blur'],
  closing: ['closing-button', 'closing-bar'],
};

export const PALETTE_ROLES = ['bg', 'text', 'muted', 'accent', 'onAccent', 'marker', 'onMarker', 'surface', 'onSurface', 'line'] as const;
export const WHEN_KEYS = ['indexMin', 'indexMax', 'headlineWordsMin', 'headlineWordsMax', 'bodyWordsMin', 'bodyWordsMax', 'itemsMin', 'itemsMax', 'valueCharsMax', 'quoteCharsMin', 'occurrence', 'photo'] as const;
export const CHROME_KINDS = ['dots-swipe', 'page-number', 'strip', 'none'] as const;
export const CASE_STYLES = ['upper', 'lower', 'sentence'] as const;

/** When a layout rule applies. Every key given must hold. A rule with no "when" always applies, so it goes last. */
export interface When {
  /** Position in the deck, counted from 0. */
  indexMin?: number;
  indexMax?: number;
  headlineWordsMin?: number;
  headlineWordsMax?: number;
  bodyWordsMin?: number;
  bodyWordsMax?: number;
  itemsMin?: number;
  itemsMax?: number;
  valueCharsMax?: number;
  quoteCharsMin?: number;
  /** The 1st, 3rd, 5th... or 2nd, 4th... slide of this type in the deck. */
  occurrence?: 'odd' | 'even';
  /** true: only when the slide has a photo (or a photo slot with a hint) or photos were given to the composer. false: only when it has none. */
  photo?: boolean;
}
export interface LayoutRule {
  use: string;
  when?: When;
  /** Palette name for this layout, otherwise the deck's rhythm decides. */
  palette?: string;
  params?: Record<string, string | number | boolean>;
}

export const ELEMENT_ZONES = ['free', 'near-headline', 'corner-tl', 'corner-tr', 'corner-bl', 'corner-br', 'bleed-top', 'bleed-bottom', 'bleed-right', 'texture'] as const;
export type ElementZone = (typeof ELEMENT_ZONES)[number];

/** One kind of element a style likes: which tags, where, how many, how big, how coloured. */
/** Tags of pictures that mean nothing by themselves. A rule made only of these must say what the decoration is for. */
export const DECOR_TAGS = new Set(['blob', 'doodle', 'squiggle', 'zigzag', 'brush', 'loop', 'circle', 'underline', 'scribble', 'halftone', 'texture', 'tape', 'arrow', 'plus', 'asterisk', 'sparkle', 'burst', 'shape', 'organic', 'stroke', 'grain', 'noise']);
export interface ElementRule {
  /** The element is picked from library elements that have any of these tags (for example "arrow", "star"). */
  tags: string[];
  zone: ElementZone;
  /** How many of this kind, as [fewest, most]. */
  count: [number, number];
  /** Longest side in px on the 1080 wide slide, as [smallest, biggest]. */
  size: [number, number];
  /** Tilt in degrees, as [least, most]. */
  rotate?: [number, number];
  /** Restrict to icons, coloured objects, or elements drawn in code. */
  kinds?: ('icon' | 'object' | 'code')[];
  /** What decoration is for (required when every tag is plain decoration): "frame" a ring round the big number or a line under the headline, "point" an arrow in the gap under the headline pointing down at what follows, "gap" fill real empty space (only on a slide that has room, with extra clear space around it). */
  role?: 'frame' | 'point' | 'gap';
  /** "slide": pick by what the slide is about (its element_tags): only elements linked to those tags, or none. Without it the pick is among the rule's own tags. */
  match?: 'slide';
  /** Swap one palette role for another when colouring, for example {"accent": "marker"}. */
  recolour?: Record<string, string>;
  /** Like recolour, but for one palette, by its name: {"hot": {"accent": "bg"}}. Wins over recolour for that palette. */
  recolourBy?: Record<string, Record<string, string>>;
  /** "original" keeps the element's own colours; "palette" recolours it to the style. Default: original for coloured objects, palette for everything else. */
  colour?: 'original' | 'palette';
  /** Make it one flat colour: a palette role name. */
  tint?: string;
  sticker?: boolean;
  shadow?: boolean;
  opacity?: number;
}
/** What a style does with illustrative elements. A style with no "elements" never gets any. */
export interface ElementSpec {
  /** Elements per slide, as fewest and most. */
  density: { min: number; max: number };
  /** Clear space kept around text and other content, px. */
  gap?: number;
  /** Slide types that get elements. All of them if left out. */
  types?: SlideType[];
  /** The die-cut outline used by rules with "sticker": true. */
  sticker?: { color: string; width: number };
  rules: ElementRule[];
}

/** How a style treats photos. Colours may be "$accent", "$bg", "$text"... (any palette colour name), meaning that colour of the slide's own palette. */
export interface FieldSpec {
  blobs: { x: number; y: number; r: number; color: string; alpha?: number }[];
  blur: number;
  grain: number;
}

export interface PhotoSpec {
  /** Named lists of treatments, applied in order. A layout rule names one with params.treatment. */
  treatments: Record<string, Treatment[]>;
  /** The soft colour field used behind slides whose layout rule says params.field is true. Blob places are shares of the slide. */
  field?: FieldSpec;
  /** Fields for particular palettes, by palette name (a field that is right on a dark slide is often too strong on a light one). */
  fields?: Record<string, FieldSpec>;
  /** The glass card look. */
  glass?: { fill: string; blur: number; radius: number; border?: { color: string; width: number }; shadow?: { color: string; blur: number; offsetX: number; offsetY: number } };
  /** Colour of the overlay under words on a photo. Default black. */
  overlay?: string;
}

export interface StyleSpec {
  schema: 1;
  /** Must equal the folder name. */
  name: string;
  title: string;
  /** One line saying what the style is for. Shown to the writer and used when "Pick for me" chooses a style. */
  description?: string;
  /** What the style suits, for "Pick for me": tones, words that show up in the text, slide types. */
  suits?: { tones?: string[]; keywords?: string[]; slideTypes?: SlideType[] };
  version: string;
  basedOn: { cluster: string; note: string };
  palettes: Record<string, Palette>;
  /** Palette names, used in turn from slide to slide. */
  rhythm: string[];
  /** Palette for a slide type regardless of the rhythm. */
  byType?: Partial<Record<SlideType, string>>;
  fonts: Theme['fonts'];
  type: Theme['type'] & { label: number };
  caseStyle: (typeof CASE_STYLES)[number];
  headlineLineHeight: number;
  /** Line height of body text, 1.0 to 2.0. Default 1.3. */
  bodyLineHeight?: number;
  shape: Theme['shape'];
  spacing: Theme['spacing'];
  chrome: (typeof CHROME_KINDS)[number];
  layouts: Record<SlideType, LayoutRule[]>;
  /** Asset name -> file inside this style's assets/ folder. */
  assets: Record<string, string>;
  /** Illustrative elements (arrows, stickers, doodles...) this style uses, where, and how many. Optional. */
  elements?: ElementSpec;
  /** Photo treatments, colour fields and glass for styles that use photos. Optional. */
  photo?: PhotoSpec;
  /** Places where this style's own look breaks our phone-size rules, written down instead of changed. */
  knownLintConflicts?: string[];
  /** What the reference had that this style does not reproduce, and why. */
  notReproduced?: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface StyleCheck {
  errors: string[];
  warnings: string[];
}

/** Checks a style.json (already parsed). `folder` is the folder name the file was found in. */
export function validateStyle(raw: unknown, folder: string, knownTags?: Set<string>): StyleCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(`Style "${folder}": ${m}`);
  if (!isObj(raw)) return { errors: [`Style "${folder}": style.json is not a JSON object.`], warnings };
  const s = raw as Record<string, unknown>;
  if (s.schema !== 1) err('"schema" must be 1.');
  if (s.name !== folder) err(`"name" is "${String(s.name)}" but the folder is called "${folder}". They must match.`);
  if (typeof s.title !== 'string' || !s.title.trim()) err('"title" is missing. It is the name people see.');
  if (s.description !== undefined && (typeof s.description !== 'string' || s.description.length < 10 || s.description.length > 140)) err('"description" must be one line of 10 to 140 characters saying what the style is for.');
  if (s.description === undefined) warnings.push('"description" is missing. Without it "Pick for me" and the writer only have the title to go on.');
  if (s.suits !== undefined) {
    const su = s.suits as Record<string, unknown>;
    const strs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() !== '');
    if (!isObj(su) || (su.tones !== undefined && !strs(su.tones)) || (su.keywords !== undefined && !strs(su.keywords)) || (su.slideTypes !== undefined && !(strs(su.slideTypes) && (su.slideTypes as string[]).every((t) => (SLIDE_TYPES as string[]).includes(t))))) err('"suits" must look like {"tones": ["bold"], "keywords": ["launch"], "slideTypes": ["stat"]}, with slide types from ' + SLIDE_TYPES.join(', ') + '.');
  }
  if (typeof s.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(s.version)) err('"version" must look like 1.0.0.');
  if (!isObj(s.basedOn) || typeof s.basedOn.cluster !== 'string' || typeof s.basedOn.note !== 'string') err('"basedOn" needs a "cluster" and a "note" saying which reading this style comes from.');

  // palettes
  const pals = isObj(s.palettes) ? s.palettes : null;
  if (!pals || Object.keys(pals).length === 0) err('"palettes" is missing. Give at least one named palette (for example "dark" and "light").');
  else
    for (const [pn, p] of Object.entries(pals)) {
      if (!isObj(p)) {
        err(`palette "${pn}" must be an object of colours.`);
        continue;
      }
      for (const role of PALETTE_ROLES) {
        if (p[role] === undefined) err(`palette "${pn}" has no "${role}" colour.`);
        else if (role === 'bg') {
          const e: string[] = [];
          validFill(p.bg, `palette "${pn}" bg`, e);
          e.forEach(err);
        } else if (!isColor(p[role])) err(`palette "${pn}": "${role}" is "${String(p[role])}", which is not a colour. Use #RRGGBB.`);
      }
      for (const k of Object.keys(p)) if (!(PALETTE_ROLES as readonly string[]).includes(k)) err(`palette "${pn}" has an unknown colour name "${k}". Allowed: ${PALETTE_ROLES.join(', ')}.`);
      // Contrast notes. These are warnings: the style may choose them on purpose, but the checker will fail them.
      if (isColor(p.text) && isColor(p.bg as string)) {
        const bgc = typeof p.bg === 'string' ? p.bg : (p.bg as { stops: { color: string }[] }).stops[0].color;
        const pairs: [string, string, string][] = [['text', 'bg', bgc], ['muted', 'bg', bgc]];
        for (const [a, b, bc] of pairs) {
          const av = p[a];
          if (isColor(av)) {
            const r = contrast(lumOf(av), lumOf(bc));
            if (r < 4.5) warnings.push(`palette "${pn}": ${a} on ${b} is only ${r.toFixed(1)}:1. The phone-size checker needs 4.5:1, so words in this colour will fail it.`);
          }
        }
        if (isColor(p.onAccent) && isColor(p.accent)) {
          const r = contrast(lumOf(p.onAccent), lumOf(p.accent));
          if (r < 4.5) warnings.push(`palette "${pn}": text on accent is only ${r.toFixed(1)}:1.`);
        }
        if (isColor(p.onMarker) && isColor(p.marker)) {
          const r = contrast(lumOf(p.onMarker), lumOf(p.marker));
          if (r < 4.5) warnings.push(`palette "${pn}": text on marker is only ${r.toFixed(1)}:1.`);
        }
      }
    }
  const palNames = pals ? Object.keys(pals) : [];
  if (!Array.isArray(s.rhythm) || s.rhythm.length === 0) err('"rhythm" must list palette names, for example ["dark", "light"].');
  else for (const r of s.rhythm) if (!palNames.includes(r as string)) err(`"rhythm" uses the palette "${String(r)}", which is not in "palettes" (${palNames.join(', ')}).`);
  if (s.byType !== undefined) {
    if (!isObj(s.byType)) err('"byType" must be an object like {"closing": "dark"}.');
    else
      for (const [t, pn] of Object.entries(s.byType)) {
        if (!(SLIDE_TYPES as string[]).includes(t)) err(`"byType" has "${t}", which is not a slide type (${SLIDE_TYPES.join(', ')}).`);
        if (!palNames.includes(pn as string)) err(`"byType.${t}" uses the palette "${String(pn)}", which does not exist.`);
      }
  }

  // fonts and sizes
  const f = isObj(s.fonts) ? s.fonts : null;
  if (!f) err('"fonts" is missing.');
  else {
    for (const k of ['headline', 'body'] as const) {
      if (!(FONT_FAMILIES as readonly string[]).includes(f[k] as string)) err(`fonts.${k} is "${String(f[k])}". Only the bundled fonts can be used: ${FONT_FAMILIES.join(', ')}.`);
    }
    for (const [k, fk] of [['headlineWeight', 'headline'], ['bodyWeight', 'body'], ['strong', 'body']] as const) {
      const fam = f[fk] as keyof typeof FONT_WEIGHTS;
      if (!num(f[k])) err(`fonts.${k} must be a number.`);
      else if (FONT_WEIGHTS[fam] && !FONT_WEIGHTS[fam].includes(f[k] as number)) err(`fonts.${k} is ${f[k]}, but ${fam} is bundled only in weights ${FONT_WEIGHTS[fam].join(', ')}. Any other weight would be faked by the browser.`);
    }
  }
  const t = isObj(s.type) ? s.type : null;
  if (!t) err('"type" is missing. It holds the font sizes in px on the 1080 wide slide.');
  else {
    for (const k of ['cover', 'headline', 'body', 'small', 'stat', 'quote', 'label']) if (!num(t[k]) || (t[k] as number) < 10 || (t[k] as number) > 400) err(`type.${k} must be a number from 10 to 400.`);
    for (const k of ['note', 'byline']) if (t[k] !== undefined && (!num(t[k]) || (t[k] as number) < 10 || (t[k] as number) > 400)) err(`type.${k} must be a number from 10 to 400 (or left out).`);
  }
  // Any text size under the checker's minimum is caught here, when the style is added, not when someone previews it.
  const WHERE: Record<string, string> = { cover: 'cover headlines', headline: 'headlines', body: 'body text', small: 'small text', stat: 'big numbers', quote: 'quotes', label: 'labels and page numbers', note: 'the line under a big number', byline: 'the name under a quote' };
  // note and byline may be left out: then they are body - 4 and body - 6, and that is what is checked.
  const effective: Record<string, unknown> = { ...t, note: t?.note ?? (num(t?.body) ? t.body - 4 : undefined), byline: t?.byline ?? (num(t?.body) ? t.body - 6 : undefined) };
  for (const [k, where] of Object.entries(WHERE)) {
    const v = effective[k];
    if (num(v) && v < 32) warnings.push(`type.${k} is ${v} px. The phone-size checker needs at least 32 px, so ${where} will fail the "size" check on every slide that has them. Raise it, or keep it on purpose and say so under "knownLintConflicts".`);
  }
  if (!(CASE_STYLES as readonly string[]).includes(s.caseStyle as string)) err(`"caseStyle" must be one of ${CASE_STYLES.join(', ')}.`);
  if (!num(s.headlineLineHeight) || s.headlineLineHeight < 0.8 || s.headlineLineHeight > 1.6) err('"headlineLineHeight" must be a number from 0.8 to 1.6.');
  if (s.bodyLineHeight !== undefined && (!num(s.bodyLineHeight) || s.bodyLineHeight < 1 || s.bodyLineHeight > 2)) err('"bodyLineHeight" must be a number from 1.0 to 2.0 (or left out for 1.3).');

  const sh = isObj(s.shape) ? s.shape : null;
  if (!sh) err('"shape" is missing.');
  else {
    for (const k of ['radius', 'outline', 'stroke', 'hardShadow']) if (!num(sh[k]) || (sh[k] as number) < 0) err(`shape.${k} must be a number, 0 or more.`);
    const enums: Record<string, string[]> = { badge: ['circle', 'rounded', 'square'], marker: ['box', 'underline', 'brush'], sticker: ['pill', 'tag', 'burst'], decor: ['rings', 'orbs', 'blocks'] };
    for (const [k, ok] of Object.entries(enums)) if (!ok.includes(sh[k] as string)) err(`shape.${k} must be one of ${ok.join(', ')}.`);
  }
  const sp = isObj(s.spacing) ? s.spacing : null;
  if (!sp) err('"spacing" is missing.');
  else for (const k of ['margin', 'gap', 'section']) if (!num(sp[k]) || (sp[k] as number) < 0) err(`spacing.${k} must be a number, 0 or more.`);
  if (sp && num(sp.margin) && sp.margin < 48) err(`spacing.margin is ${sp.margin}. Anything under 48 px is too close to the edge for the checker.`);
  if (!(CHROME_KINDS as readonly string[]).includes(s.chrome as string)) err(`"chrome" must be one of ${CHROME_KINDS.join(', ')}.`);

  // assets
  const assets = isObj(s.assets) ? (s.assets as Record<string, unknown>) : null;
  if (!assets) err('"assets" is missing. Use {} if the style has no SVG graphics.');
  else
    for (const [n, p] of Object.entries(assets)) {
      if (typeof p !== 'string' || !/^assets\/[A-Za-z0-9._-]+\.svg$/.test(p)) err(`assets.${n} must be a path like "assets/${n}.svg".`);
    }

  // layouts
  const lay = isObj(s.layouts) ? s.layouts : null;
  if (!lay) err('"layouts" is missing.');
  else
    for (const type of SLIDE_TYPES) {
      const rules = lay[type];
      if (!Array.isArray(rules)) {
        err(`layouts.${type} is missing. Every slide type needs a list of at least 2 layout rules.`);
        continue;
      }
      if (rules.length < 2) err(`layouts.${type} has ${rules.length} rule. A style needs at least 2 distinct layouts for every slide type.`);
      const used = new Set<string>();
      rules.forEach((r: unknown, i: number) => {
        const where = `layouts.${type}[${i}]`;
        if (!isObj(r)) return err(`${where} must be an object with a "use".`);
        if (typeof r.use !== 'string' || !LAYOUT_IDS[type].includes(r.use)) err(`${where}.use is "${String(r.use)}". Layouts for ${type}: ${LAYOUT_IDS[type].join(', ')}.`);
        else used.add(r.use);
        if (r.palette !== undefined && !palNames.includes(r.palette as string)) err(`${where}.palette "${String(r.palette)}" is not in "palettes".`);
        if (r.when !== undefined) {
          if (!isObj(r.when)) err(`${where}.when must be an object.`);
          else
            for (const [k, v] of Object.entries(r.when)) {
              if (!(WHEN_KEYS as readonly string[]).includes(k)) err(`${where}.when has "${k}", which is not a condition. Allowed: ${WHEN_KEYS.join(', ')}.`);
              else if (k === 'occurrence' ? v !== 'odd' && v !== 'even' : k === 'photo' ? typeof v !== 'boolean' : !num(v)) err(`${where}.when.${k} has a wrong value.`);
            }
        }
        if (r.params !== undefined && isObj(r.params))
          for (const [k, v] of Object.entries(r.params)) {
            if (k.startsWith('asset') && typeof v === 'string' && assets && !(v in assets)) err(`${where}.params.${k} uses the asset "${v}", which is not listed in "assets".`);
          }
      });
      if (used.size < 2) err(`layouts.${type} uses only ${used.size} different layout. A style needs at least 2 distinct layouts for every slide type.`);
      if (rules.length && isObj(rules[rules.length - 1]) && (rules[rules.length - 1] as Record<string, unknown>).when !== undefined) err(`The last rule of layouts.${type} has a "when", so a slide that matches no rule would have no layout. Remove the "when" from the last rule.`);
    }
  // elements
  if (s.elements !== undefined) {
    const el = s.elements;
    const roles = PALETTE_ROLES as readonly string[];
    const pair = (v: unknown, lo: number, hi: number): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((x) => num(x) && x >= lo && x <= hi) && v[0] <= v[1];
    if (!isObj(el)) err('"elements" must be an object with "density" and "rules".');
    else {
      const d = el.density as { min?: unknown; max?: unknown } | undefined;
      if (!d || !num(d.min) || !num(d.max) || d.min < 0 || d.max > 8 || d.min > d.max) err('elements.density must be {"min": n, "max": m} with 0 <= min <= max <= 8, elements per slide.');
      if (el.gap !== undefined && (!num(el.gap) || el.gap < 0 || el.gap > 200)) err('elements.gap must be a number from 0 to 200 (px of clear space around text).');
      if (el.types !== undefined && !(Array.isArray(el.types) && el.types.every((t) => (SLIDE_TYPES as string[]).includes(t as string)))) err(`elements.types must be a list of slide types (${SLIDE_TYPES.join(', ')}).`);
      if (el.sticker !== undefined) {
        const st = el.sticker as { color?: unknown; width?: unknown };
        if (!isObj(st) || !roles.includes(st.color as string) || !num(st.width) || st.width < 0 || st.width > 60) err('elements.sticker must be {"color": a palette role, "width": 0 to 60}.');
      }
      if (!Array.isArray(el.rules) || el.rules.length === 0) err('elements.rules needs at least one rule, for example {"tags": ["arrow"], "zone": "near-headline", "count": [0, 1], "size": [140, 260]}.');
      else
        el.rules.forEach((r: unknown, i: number) => {
          const w = `elements.rules[${i}]`;
          if (!isObj(r)) return err(`${w} must be an object.`);
          if (!Array.isArray(r.tags) || r.tags.length === 0 || !r.tags.every((t) => typeof t === 'string' && t.trim() !== '')) err(`${w}.tags must be a list of tag words, for example ["arrow", "star"].`);
          else if (knownTags) {
            const none = (r.tags as string[]).filter((t) => !knownTags.has(t.toLowerCase()));
            if (none.length === r.tags.length) warnings.push(`${w}: none of the tags ${(r.tags as string[]).join(', ')} match any element in the library, so this rule places nothing.`);
          }
          if (!(ELEMENT_ZONES as readonly string[]).includes(r.zone as string)) err(`${w}.zone is "${String(r.zone)}". Zones: ${ELEMENT_ZONES.join(', ')}.`);
          if (!pair(r.count, 0, 4)) err(`${w}.count must be [fewest, most] with both from 0 to 4.`);
          if (!pair(r.size, 40, 900)) err(`${w}.size must be [smallest, biggest] px, from 40 to 900.`);
          if (r.rotate !== undefined && !pair(r.rotate, -90, 90)) err(`${w}.rotate must be [least, most] degrees, from -90 to 90.`);
          if (r.kinds !== undefined && !(Array.isArray(r.kinds) && r.kinds.every((k) => ['icon', 'object', 'code'].includes(k as string)))) err(`${w}.kinds must be a list of icon, object, code.`);
          if (r.colour !== undefined && r.colour !== 'original' && r.colour !== 'palette') err(`${w}.colour must be "original" or "palette".`);
          if (r.tint !== undefined && !roles.includes(r.tint as string)) err(`${w}.tint "${String(r.tint)}" is not a palette role (${roles.join(', ')}).`);
          if (r.recolour !== undefined) {
            if (!isObj(r.recolour) || !Object.entries(r.recolour).every(([k, v]) => roles.includes(k) && roles.includes(v as string))) err(`${w}.recolour must swap palette roles, for example {"accent": "marker"}.`);
          }
          if (r.role !== undefined && !['frame', 'point', 'gap'].includes(r.role as string)) err(`${w}.role must be "frame", "point" or "gap" (or left out for pictures of things).`);
          if (r.role === undefined && Array.isArray(r.tags) && r.tags.length > 0 && (r.tags as unknown[]).every((t) => typeof t === 'string' && DECOR_TAGS.has(t.toLowerCase())) && !(Array.isArray(r.kinds) && r.kinds.includes('object'))) err(`${w} places plain decoration (${(r.tags as string[]).join(', ')}) without saying what it is for. Add "role": "frame" (a ring round a number, a line under the headline), "point" (an arrow pointing at what follows) or "gap" (fills real empty space).`);
          if (r.match !== undefined && r.match !== 'slide') err(`${w}.match must be "slide" (or left out).`);
          if (r.recolourBy !== undefined) {
            const ok = isObj(r.recolourBy) && Object.entries(r.recolourBy).every(([pn, m]) => palNames.includes(pn) && isObj(m) && Object.entries(m).every(([k, v]) => roles.includes(k) && roles.includes(v as string)));
            if (!ok) err(`${w}.recolourBy must map a palette name to role swaps, for example {"hot": {"accent": "bg"}}.`);
          }
          if (r.opacity !== undefined && (!num(r.opacity) || r.opacity < 0.05 || r.opacity > 1)) err(`${w}.opacity must be from 0.05 to 1.`);
        });
    }
  }
  if (s.photo !== undefined) {
    const ph = s.photo;
    if (!isObj(ph) || !isObj(ph.treatments) || Object.keys(ph.treatments).length === 0) err('"photo" needs "treatments": named lists of photo treatments, for example {"mono": [{"op": "grayscale"}]}.');
    else {
      for (const [tn, list] of Object.entries(ph.treatments)) {
        if (!Array.isArray(list) || list.length > 12) {
          err(`photo.treatments.${tn} must be a list of at most 12 steps.`);
          continue;
        }
        for (const t of list as unknown as Record<string, unknown>[])
          for (const v of Object.values(t ?? {})) if (typeof v === 'string' && v.startsWith('$') && !(PALETTE_ROLES as readonly string[]).includes(v.slice(1))) err(`photo.treatments.${tn} uses the colour "${v}", which is not a palette colour name (${PALETTE_ROLES.join(', ')}).`);
        for (const pn of palNames) {
          const resolved = resolveTreatments(list as Treatment[], (pals as Record<string, Record<string, unknown>>)[pn]);
          resolved.forEach((t, i) => {
            const e: string[] = [];
            validateTreatment(t, `photo.treatments.${tn}[${i}] (palette ${pn})`, e);
            e.forEach(err);
          });
        }
      }
      const rules = lay ? Object.values(lay).flat() : [];
      for (const r of rules as { use?: string; params?: Record<string, unknown> }[]) {
        const tn = r?.params?.treatment;
        if (typeof tn === 'string' && !(tn in (ph.treatments as object))) err(`A layout asks for the treatment "${tn}", which is not in photo.treatments (${Object.keys(ph.treatments as object).join(', ')}).`);
      }
    }
    const tok = (v: unknown, where: string) => {
      if (typeof v !== 'string') return err(`${where} must be a colour.`);
      if (v.startsWith('$')) {
        if (!(PALETTE_ROLES as readonly string[]).includes(v.slice(1))) err(`${where} is "${v}", which is not a palette colour name (${PALETTE_ROLES.join(', ')}).`);
      } else if (!isColor(v)) err(`${where} is "${v}", which is not a colour.`);
    };
    const checkField = (f0: unknown, where: string) => {
      const f = f0 as { blobs?: unknown; blur?: unknown; grain?: unknown };
      if (!isObj(f) || !Array.isArray(f.blobs) || f.blobs.length > 12 || !num(f.blur) || f.blur < 0 || f.blur > 400 || !num(f.grain) || f.grain < 0 || f.grain > 1) err(`${where} must be {"blobs": [...] (at most 12), "blur": 0 to 400, "grain": 0 to 1}.`);
      else (f.blobs as { x: unknown; y: unknown; r: unknown; color: unknown; alpha?: unknown }[]).forEach((b, i) => {
        tok(b.color, `${where}.blobs[${i}].color`);
        if (![b.x, b.y, b.r].every(num) || (b.alpha !== undefined && !num(b.alpha))) err(`${where}.blobs[${i}] needs numbers x, y, r (shares of the slide width) and optionally alpha.`);
      });
    };
    if (isObj(ph) && ph.field !== undefined) checkField(ph.field, 'photo.field');
    if (isObj(ph) && ph.fields !== undefined) {
      if (!isObj(ph.fields)) err('photo.fields must map palette names to fields.');
      else for (const [pn, f] of Object.entries(ph.fields)) {
        if (!palNames.includes(pn)) err(`photo.fields has "${pn}", which is not a palette.`);
        checkField(f, `photo.fields.${pn}`);
      }
    }
    if (isObj(ph) && ph.glass !== undefined) {
      const g = ph.glass as { fill?: unknown; blur?: unknown; radius?: unknown; border?: { color?: unknown; width?: unknown } };
      if (!isObj(g) || !isColor(g.fill) || !num(g.blur) || !num(g.radius)) err('photo.glass must be {"fill": a colour (with its see-through amount, for example rgba(255,255,255,0.14)), "blur": px, "radius": px}.');
      else if (g.border && (!isColor(g.border.color) || !num(g.border.width))) err('photo.glass.border must be {"color", "width"}.');
    }
    if (isObj(ph) && ph.overlay !== undefined) tok(ph.overlay, 'photo.overlay');
  }
  if (s.knownLintConflicts !== undefined && !(Array.isArray(s.knownLintConflicts) && s.knownLintConflicts.every((x) => typeof x === 'string'))) err('"knownLintConflicts" must be a list of sentences.');
  if (s.notReproduced !== undefined && !(Array.isArray(s.notReproduced) && s.notReproduced.every((x) => typeof x === 'string'))) err('"notReproduced" must be a list of sentences.');
  return { errors, warnings };
}

function lumOf(c: string) {
  const { rgb } = parseColor(c);
  const lin = (v: number) => ((v / 255) <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}
