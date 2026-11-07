// Moving a slide's text between layouts: the text is MAPPED (never invented). Used by the layout picker and by the preset flavour pass.
import type { Look } from './designed';
import { LAYOUT_IDS, layoutDef, validateSlideContent, type Fields, type LayoutId } from './layouts';
import type { SlideSpec } from './designLibrary';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** The text of a slide by meaning, whatever layout holds it. */
interface Canon {
  head: string;
  kicker: string;
  sub: string;
  body: string;
  number: string;
  label: string;
  bar: string;
  quote: string;
  author: string;
  button: string;
  items: string[];
  lines: string[];
  numbers: string[];
  labels: string[];
  /** Layouts whose fields cannot be mapped (a comparison keeps its four texts): only the same layout takes them. */
  own?: { layout: string; fields: Fields };
}
const txt = (f: Fields, k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '');
const lst = (f: Fields, k: string) => (Array.isArray(f[k]) ? (f[k] as string[]).map((x) => x.trim()).filter(Boolean) : []);
const empty = (): Canon => ({ head: '', kicker: '', sub: '', body: '', number: '', label: '', bar: '', quote: '', author: '', button: '', items: [], lines: [], numbers: [], labels: [] });

export function toCanon(layout: string, f: Fields): Canon {
  const c = empty();
  switch (layout) {
    case 'statement': return { ...c, head: txt(f, 'headline'), kicker: txt(f, 'kicker'), sub: txt(f, 'caption') };
    case 'lead-statement': return { ...c, kicker: txt(f, 'lead'), head: txt(f, 'headline') };
    case 'big-question': return { ...c, head: txt(f, 'question'), sub: txt(f, 'line') };
    case 'photo-led': return { ...c, head: txt(f, 'headline'), kicker: txt(f, 'kicker') };
    case 'split-text': return { ...c, head: txt(f, 'headline'), body: txt(f, 'paragraph') };
    case 'big-stat': return { ...c, number: txt(f, 'number'), label: txt(f, 'label'), sub: txt(f, 'source') };
    case 'stat-bar': return { ...c, number: txt(f, 'number'), label: txt(f, 'label'), bar: txt(f, 'bar'), sub: txt(f, 'note') };
    case 'stepper': return { ...c, head: txt(f, 'title'), items: lst(f, 'steps') };
    case 'step-numeral': return { ...c, number: txt(f, 'step'), head: txt(f, 'title'), body: txt(f, 'body') };
    case 'listicle-numeral': return { ...c, number: txt(f, 'numeral'), head: txt(f, 'title'), body: txt(f, 'body') };
    case 'checklist': case 'numbered-list': return { ...c, head: txt(f, 'title'), items: lst(f, 'items') };
    case 'quote': return { ...c, quote: txt(f, 'quote'), author: txt(f, 'author'), head: txt(f, 'quote'), sub: txt(f, 'author') };
    case 'cta-button': return { ...c, head: txt(f, 'headline'), button: txt(f, 'button'), sub: txt(f, 'sub') };
    case 'feature-slider': return { ...c, head: txt(f, 'title'), body: txt(f, 'body'), own: { layout, fields: f } };
    case 'card-grid': return { ...c, head: txt(f, 'title'), items: lst(f, 'cardTitles'), lines: lst(f, 'cardLines') };
    case 'stat-grid': return { ...c, head: txt(f, 'title'), numbers: lst(f, 'numbers'), labels: lst(f, 'labels') };
    case 'timeline': return { ...c, head: txt(f, 'title'), labels: lst(f, 'labels'), items: lst(f, 'events') };
    case 'spotlight': return { ...c, head: txt(f, 'subject'), items: lst(f, 'callouts') };
    case 'comparison': return { ...c, head: txt(f, 'title'), own: { layout, fields: f } };
    default: return c;
  }
}
const put = (o: Fields, k: string, v: string | string[]) => {
  if (Array.isArray(v) ? v.length : v) o[k] = v;
};
/** The fields a layout would get from the text, or null when the text does not have what the layout needs (nothing is made up to fill it). */
export function fromCanon(layout: string, c: Canon, hasPhoto: boolean): Fields | null {
  const o: Fields = {};
  const head = c.head || c.quote;
  switch (layout) {
    case 'statement': put(o, 'headline', head); put(o, 'kicker', c.kicker); put(o, 'caption', c.sub || (words(c.body) <= 10 ? c.body : '')); break;
    case 'lead-statement': put(o, 'lead', c.kicker || c.sub); put(o, 'headline', head); break;
    case 'big-question': put(o, 'question', head); put(o, 'line', c.sub); break;
    case 'photo-led': if (!hasPhoto) return null; put(o, 'headline', head); put(o, 'kicker', c.kicker); break;
    case 'split-text': put(o, 'headline', head); put(o, 'paragraph', c.body || c.sub); break;
    case 'big-stat': put(o, 'number', c.number); put(o, 'label', c.label); put(o, 'source', c.sub); break;
    case 'stat-bar': if (!c.bar) return null; put(o, 'number', c.number); put(o, 'label', c.label); put(o, 'bar', c.bar); put(o, 'note', c.sub); break;
    case 'stepper': put(o, 'title', head); put(o, 'steps', c.items); break;
    case 'step-numeral': put(o, 'step', c.number); put(o, 'title', head); put(o, 'body', c.body || c.sub); break;
    case 'listicle-numeral': put(o, 'numeral', c.number); put(o, 'title', head); put(o, 'body', c.body || c.sub); break;
    case 'checklist': case 'numbered-list': put(o, 'title', head); put(o, 'items', c.items); break;
    case 'quote': put(o, 'quote', c.quote || head); put(o, 'author', c.author || c.sub); break;
    case 'cta-button': if (!c.button) return null; put(o, 'headline', head); put(o, 'button', c.button); put(o, 'sub', c.sub); break;
    case 'card-grid': if (!c.lines.length) return null; put(o, 'title', head); put(o, 'cardTitles', c.items); put(o, 'cardLines', c.lines); break;
    case 'stat-grid': if (!c.numbers.length) return null; put(o, 'title', head); put(o, 'numbers', c.numbers); put(o, 'labels', c.labels); break;
    case 'timeline': if (!c.labels.length || !c.items.length) return null; put(o, 'title', head); put(o, 'labels', c.labels); put(o, 'events', c.items); break;
    case 'spotlight': put(o, 'subject', head); put(o, 'callouts', c.items); break;
    case 'feature-slider': case 'comparison': return c.own?.layout === layout ? { ...c.own.fields } : null;
    default: return null;
  }
  return o;
}

export interface LayoutOption {
  layout: LayoutId;
  /** The REQUIRED text of the slide that this layout would not show (empty: nothing core is lost). */
  droppedCore: string[];
  /** The slide's fields in this layout (without accents). */
  fields: Fields;
  /** The texts of the slide this layout would not show. */
  dropped: string[];
  current: boolean;
}
export const flat = (f: Fields): string[] => Object.entries(f).filter(([k]) => k !== 'accent').flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map((x) => String(x).trim()).filter(Boolean);

/** Every layout that can take this slide's text, the slide's own layout first. */
export const layoutOptions = (spec: SlideSpec, look: Look): LayoutOption[] => layoutOptionsFor(spec, look);
/** `joinStat`: a stat slide (number + label) may become a headline "10 seconds to flip it" (used by the flavour pass; the picker offers what it always offered). */
export function layoutOptionsFor(spec: SlideSpec, look: Look, o: { joinStat?: boolean } = {}): LayoutOption[] {
  const own = Object.fromEntries(Object.entries(spec.fields).filter(([k]) => k !== 'accent')) as Fields;
  const c = toCanon(spec.layout, own);
  if (o.joinStat && !c.head && c.number && c.label) c.head = c.number + ' ' + c.label;
  const have = flat(own);
  const core = (layoutDef(spec.layout)?.fields ?? []).filter((f) => f.required).flatMap((f) => (Array.isArray(own[f.name]) ? (own[f.name] as string[]) : [String(own[f.name] ?? '')])).map((x) => x.trim()).filter(Boolean);
  const out: LayoutOption[] = [{ layout: spec.layout as LayoutId, fields: own, dropped: [], droppedCore: [], current: true }];
  for (const id of LAYOUT_IDS) {
    if (id === spec.layout) continue;
    const f = fromCanon(id, c, !!look.hasPhoto);
    if (!f || !validateSlideContent(id, f).ok) continue;
    const shown = flat(f);
    const lost = (t: string) => !shown.some((u) => u === t || u.includes(t));
    // a layout that would not show all the slide's required text (a stepper's steps, a stat's number) is never offered: only optional lines may be left out
    if (core.some(lost)) continue;
    out.push({ layout: id, fields: f, dropped: have.filter(lost), droppedCore: [], current: false });
  }
  return out;
}
const CANON_WORDS: Record<string, string> = { head: 'a headline', kicker: 'a lead-in line', sub: 'a second line', body: 'a paragraph', number: 'a number', label: 'a label', bar: 'a bar value', quote: 'a quote', author: 'an author', button: 'a button text', items: 'a list of items', lines: 'card lines', numbers: 'numbers', labels: 'labels' };
const clipText = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
/**
 * Why each layout that layoutOptions() does NOT offer cannot take this slide, in one plain line (a layout id to a reason). Driven by the registry: the layouts come
 * from LAYOUT_IDS and the reason from asking fromCanon / validateSlideContent, so a layout added later gets its reason with no per-layout code.
 */
export function layoutRefusals(spec: SlideSpec, look: Look): Record<string, string> {
  const offered = new Set(layoutOptionsFor(spec, look).map((o) => o.layout as string));
  const own = Object.fromEntries(Object.entries(spec.fields).filter(([k]) => k !== 'accent')) as Fields;
  const c = toCanon(spec.layout, own);
  const out: Record<string, string> = {};
  for (const id of LAYOUT_IDS) {
    if (offered.has(id)) continue;
    const f = fromCanon(id, c, !!look.hasPhoto);
    if (!f) {
      if (!look.hasPhoto && fromCanon(id, c, true)) {
        out[id] = 'Needs a picture, and this deck has none.';
        continue;
      }
      // what is missing: add the kinds of text one by one until the layout can take them
      const base = c as unknown as Record<string, string | string[]>;
      const withKeys = (ks: string[]) => ({ ...base, ...Object.fromEntries(ks.map((k) => [k, Array.isArray(base[k]) ? ['x'] : 'x'])) }) as unknown as Canon;
      const empties = Object.keys(CANON_WORDS).filter((k) => !(Array.isArray(base[k]) ? base[k].length : base[k]));
      let need = empties.filter((k) => fromCanon(id, withKeys([k]), true)).slice(0, 1);
      if (!need.length) {
        need = [...empties];
        if (fromCanon(id, withKeys(need), true)) need = need.filter((k) => { const rest = need.filter((x) => x !== k); return !fromCanon(id, withKeys(rest), true); });
        else need = [];
      }
      out[id] = need.length ? `Needs ${need.map((k) => CANON_WORDS[k]).join(' and ')}, which this slide does not have.` : 'Only its own layout can draw this text.';
      continue;
    }
    const v = validateSlideContent(id, f);
    if (!v.ok) {
      const req = /"(\w+)" is required/.exec(v.errors[0]);
      out[id] = req ? `Needs "${req[1]}" text, which this slide does not have.` : `The text is over this layout's limit: ${clipText(v.errors[0].replace(/^[\w-]+: /, ''), 70)}`;
      continue;
    }
    const core = (layoutDef(spec.layout)?.fields ?? []).filter((x) => x.required).flatMap((x) => (Array.isArray(own[x.name]) ? (own[x.name] as string[]) : [String(own[x.name] ?? '')])).map((x) => x.trim()).filter(Boolean);
    const shown = flat(f);
    const lost = core.find((t) => !shown.some((u) => u === t || u.includes(t)));
    out[id] = lost ? `Would leave out "${clipText(lost, 28)}".` : 'This slide\'s text does not fit this layout.';
  }
  return out;
}
/** The accent phrases that still stand in the new text. */
export const accentsIn = (accents: string[], f: Fields): string[] => {
  const t = flat(f).join(' \n ').toLowerCase();
  return accents.filter((a) => t.includes(a.toLowerCase()));
};

