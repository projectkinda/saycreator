// The style file format (styles/<name>/style.json) and its validator. Every rejection is a sentence a person can act on.
// A style is a folder: style.json plus an assets/ folder of small SVG graphics. The engine reads styles only from these files.
import { contrast, parseColor } from '../lint/color';
import { FONT_WEIGHTS } from '../fonts';
import type { Palette, SlideScript, Theme } from '../carousel/types';
import { FONT_FAMILIES } from '../types';
import { isColor, validFill } from '../validate';

export type SlideType = SlideScript['type'];
export const SLIDE_TYPES: SlideType[] = ['cover', 'content', 'step', 'stat', 'checklist', 'beforeafter', 'quote', 'closing'];

/** Which layout variants exist for each slide type. A style picks from these by name. */
export const LAYOUT_IDS: Record<SlideType, string[]> = {
  cover: ['cover-stack', 'cover-top', 'cover-centre'],
  content: ['content-stack', 'content-bar', 'content-columns'],
  step: ['step-badge', 'step-numeral', 'step-pill'],
  stat: ['stat-giant', 'stat-card'],
  checklist: ['checklist-icons', 'checklist-lines'],
  beforeafter: ['ba-split', 'ba-cards'],
  quote: ['quote-marks', 'quote-centre'],
  closing: ['closing-button', 'closing-bar'],
};

export const PALETTE_ROLES = ['bg', 'text', 'muted', 'accent', 'onAccent', 'marker', 'onMarker', 'surface', 'onSurface', 'line'] as const;
export const WHEN_KEYS = ['indexMin', 'indexMax', 'headlineWordsMin', 'headlineWordsMax', 'bodyWordsMin', 'bodyWordsMax', 'itemsMin', 'itemsMax', 'valueCharsMax', 'quoteCharsMin', 'occurrence'] as const;
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
}
export interface LayoutRule {
  use: string;
  when?: When;
  /** Palette name for this layout, otherwise the deck's rhythm decides. */
  palette?: string;
  params?: Record<string, string | number | boolean>;
}

export interface StyleSpec {
  schema: 1;
  /** Must equal the folder name. */
  name: string;
  title: string;
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
  shape: Theme['shape'];
  spacing: Theme['spacing'];
  chrome: (typeof CHROME_KINDS)[number];
  layouts: Record<SlideType, LayoutRule[]>;
  /** Asset name -> file inside this style's assets/ folder. */
  assets: Record<string, string>;
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
export function validateStyle(raw: unknown, folder: string): StyleCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(`Style "${folder}": ${m}`);
  if (!isObj(raw)) return { errors: [`Style "${folder}": style.json is not a JSON object.`], warnings };
  const s = raw as Record<string, unknown>;
  if (s.schema !== 1) err('"schema" must be 1.');
  if (s.name !== folder) err(`"name" is "${String(s.name)}" but the folder is called "${folder}". They must match.`);
  if (typeof s.title !== 'string' || !s.title.trim()) err('"title" is missing. It is the name people see.');
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
  else for (const k of ['cover', 'headline', 'body', 'small', 'stat', 'quote', 'label']) if (!num(t[k]) || (t[k] as number) < 10 || (t[k] as number) > 400) err(`type.${k} must be a number from 10 to 400.`);
  if (t && num(t.body) && t.body < 32) warnings.push(`type.body is ${t.body} px. The phone-size checker needs at least 32 px, so body text will fail the "size" check. Kept as written because the reference is like this.`);
  if (t && num(t.label) && t.label < 32) warnings.push(`type.label is ${t.label} px. The phone-size checker needs at least 32 px, so labels will fail the "size" check.`);
  if (!(CASE_STYLES as readonly string[]).includes(s.caseStyle as string)) err(`"caseStyle" must be one of ${CASE_STYLES.join(', ')}.`);
  if (!num(s.headlineLineHeight) || s.headlineLineHeight < 0.8 || s.headlineLineHeight > 1.6) err('"headlineLineHeight" must be a number from 0.8 to 1.6.');

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
              else if (k === 'occurrence' ? v !== 'odd' && v !== 'even' : !num(v)) err(`${where}.when.${k} has a wrong value.`);
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
  if (s.knownLintConflicts !== undefined && !(Array.isArray(s.knownLintConflicts) && s.knownLintConflicts.every((x) => typeof x === 'string'))) err('"knownLintConflicts" must be a list of sentences.');
  if (s.notReproduced !== undefined && !(Array.isArray(s.notReproduced) && s.notReproduced.every((x) => typeof x === 'string'))) err('"notReproduced" must be a list of sentences.');
  return { errors, warnings };
}

function lumOf(c: string) {
  const { rgb } = parseColor(c);
  const lin = (v: number) => ((v / 255) <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}
