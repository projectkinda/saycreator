// A pasted script (the app's own JSON: a title and slides with a type and fields) drawn by the LAYOUT LIBRARY, with no model call.
// The slide types are mapped to library layouts by code, from the words of the script only: nothing is added (no text, button, link or handle) and nothing is cut. The rest of the
// pipeline is the one written decks use: the preset's flavour, the rhythm of variants and cuts, the picture placement. If a slide has more text than any fitting layout can show, the
// whole script is NOT converted and the page falls back to the older template route (the reason is returned, for the report).
import type { CarouselScript, SlideScript } from '../image-engine/carousel/types';
import { designLibraryDeck, slideProblems, type CtaCtx, type OwnScript, type SlideSpec } from './designLibrary';
import type { Designed, Look } from './designed';
import { accentsIn } from './layoutMap';
import type { Fields } from './layouts';
import { sourceAction } from './closingAction';
import { TYPE_LABEL } from './script';
import type { GenerateResult, WriteProvider } from './writer';

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL_LIKE = /(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|org|net|io|co|app|dev|me|ai|uk|in|us)\b(?:\/\S*)?/i;
const PHONE = /\+?\d[\d\s().-]{7,}\d/;
const HANDLE = /(?:^|\s)@[\w.]{2,}/;
/** A contact detail (an email, a link, a phone number, a handle) rather than an action phrase. */
export const isContact = (t: string): boolean => EMAIL.test(t) || URL_LIKE.test(t) || PHONE.test(t) || HANDLE.test(t);

/** Splits a paragraph into up to three, at sentence ends, each within its budget (300, 300, 260). Null when it does not fit. */
function paragraphs(text: string): string[] | null {
  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const caps = [300, 300, 260];
  const out: string[] = [];
  let cur = '';
  for (const sentence of sentences) {
    const next = cur ? cur + ' ' + sentence : sentence;
    if (next.length <= caps[out.length]) cur = next;
    else {
      if (!cur || out.length >= 2) return null;
      out.push(cur);
      cur = sentence;
      if (cur.length > caps[out.length]) return null;
    }
  }
  if (cur) out.push(cur);
  return out.length && out.length <= 3 ? out : null;
}

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * The last resort for a slide whose text is longer than its own layout's budgets: the "prose" layout (a heading, up to three paragraphs, bullets). The slide's words go in, in their
 * order, nothing added and nothing cut (a long paragraph is split at sentence ends).
 */
function proseCandidate(s: SlideScript): SlideSpec | null {
  const r = s as unknown as Rec;
  let heading = '';
  let num = '';
  let pieces: string[] = [];
  let bullets: string[] = [];
  switch (s.type) {
    case 'cover': pieces = [str(r.kicker), str(r.headline), str(r.sub)]; break;
    case 'content': heading = str(r.headline); pieces = [str(r.body)]; break;
    case 'step': heading = str(r.headline); num = String(Math.round(Number(r.number)) || 1); pieces = [str(r.body)]; break;
    case 'stat': heading = str(r.value); pieces = [str(r.kicker), str(r.label), str(r.note)]; break;
    case 'checklist': heading = str(r.headline); bullets = Array.isArray(r.items) ? (r.items as unknown[]).map(str).filter(Boolean) : []; break;
    case 'beforeafter': pieces = [`${str(r.beforeLabel)}: ${str(r.before)}`, `${str(r.afterLabel)}: ${str(r.after)}`]; break;
    case 'quote': pieces = [str(r.quote), str(r.by)]; break;
    default: return null;
  }
  pieces = pieces.filter(Boolean);
  if (heading.length > 60) { pieces.unshift(heading); heading = ''; }
  const caps = [300, 300, 260];
  const paras: string[] = [];
  for (const piece of pieces) {
    const cap = caps[paras.length];
    if (cap === undefined) return null;
    if (piece.length <= cap) paras.push(piece);
    else {
      const split = paragraphs(piece);
      if (!split || paras.length + split.length > 3) return null;
      paras.push(...split);
    }
  }
  if (!paras.length && bullets.length) { paras.push(heading); heading = ''; }
  if (!paras.length) return null;
  const fields: Fields = { p1: paras[0], ...(heading ? { heading } : {}), ...(num ? { num } : {}), ...(paras[1] ? { p2: paras[1] } : {}), ...(paras[2] ? { p3: paras[2] } : {}), ...(bullets.length >= 2 && bullets.length <= 4 ? { bullets } : {}) } as Fields;
  if (bullets.length && !(bullets.length >= 2 && bullets.length <= 4)) return null;
  const hl = str(r.highlight);
  return { layout: 'prose', fields, accents: hl ? accentsIn([hl], fields).slice(0, 3) : [] };
}

/** The layouts a script slide can take, best first. Every candidate uses only the slide's own words. */
function candidates(s: SlideScript): SlideSpec[] {
  const prose = proseCandidate(s);
  const list = ownCandidates(s);
  return prose && !list.some((c) => c.layout === 'prose') ? [...list, prose] : list;
}
function ownCandidates(s: SlideScript): SlideSpec[] {
  const r = s as unknown as Rec;
  const hl = str(r.highlight);
  const mk = (layout: string, fields: Fields): SlideSpec => ({ layout, fields, accents: hl ? accentsIn([hl], fields).slice(0, 3) : [] });
  const compact = (f: Record<string, string | string[] | undefined>): Fields => Object.fromEntries(Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length : !!v))) as Fields;
  switch (s.type) {
    case 'cover':
      return [mk('statement', compact({ headline: str(r.headline), kicker: str(r.kicker), caption: str(r.sub) }))];
    case 'content': {
      const body = str(r.body);
      // a headline alone (no body): a statement, nothing else is drawn
      if (!body) return [mk('statement', compact({ headline: str(r.headline) })), mk('statement-card', compact({ headline: str(r.headline) }))];
      const ps = paragraphs(body);
      return [
        mk('split-text', compact({ headline: str(r.headline), paragraph: body })),
        mk('headline-card', compact({ headline: str(r.headline), card: body })),
        ...(ps ? [mk('prose', compact({ heading: str(r.headline), p1: ps[0], p2: ps[1], p3: ps[2] }))] : []),
      ];
    }
    case 'step':
      // a step with no body keeps its words as a statement (the step number is a counter, not a word)
      if (!str(r.body)) return [mk('statement', compact({ headline: str(r.headline) }))];
      return [mk('step-numeral', compact({ step: String(Math.round(Number(r.number)) || 1), title: str(r.headline), body: str(r.body) }))];
    case 'stat':
      // the stat layouts have no small line above the number: a stat that has one goes to the prose layout, so no word is lost
      if (str(r.kicker)) return [];
      return [
        mk('big-stat', compact({ number: str(r.value), label: str(r.label), source: str(r.note) })),
        mk('stat-bar', compact({ number: str(r.value), label: str(r.label), bar: '50', note: str(r.note) })),
      ];
    case 'checklist': {
      const items = Array.isArray(r.items) ? (r.items as unknown[]).map(str).filter(Boolean) : [];
      // a lead-in longer than the checklist titles (40 characters) takes the pill list (headline up to 50), the items are the same
      return [...['checklist', 'numbered-list', 'bullet-list'].map((l) => mk(l, compact({ title: str(r.headline), items }))), mk('pill-stagger', compact({ headline: str(r.headline), items }))];
    }
    case 'beforeafter':
      return [mk('comparison', compact({ leftLabel: str(r.beforeLabel), leftText: str(r.before), rightLabel: str(r.afterLabel), rightText: str(r.after) }))];
    case 'quote':
      return [mk('quote', compact({ quote: str(r.quote), author: str(r.by) }))];
    case 'closing': {
      const headline = str(r.headline);
      const cta = str(r.cta) === str(r.headline) ? '' : str(r.cta); // one paragraph is never drawn twice (a headline that is also the cta stays the headline)
      const parts = cta.split(/\s*(?:[,;·|\n]|\s\/\s)\s*/).map((x) => x.trim()).filter(Boolean);
      const contacts = parts.filter(isContact);
      const out: SlideSpec[] = [];
      // contact details (two or more) -> a contact closing; a real action phrase -> a call-to-action button; otherwise a plain statement card with the words as they are
      if (contacts.length >= 2 && contacts.length === parts.length) out.push(mk('contact-closing', compact({ headline, contacts })));
      if (cta && !isContact(cta)) out.push(mk('cta-button', compact({ headline, button: cta })));
      // a long call to action that names a real action ("Comment "slides" and I'll send you the link."): the button is the action's own words, the rest of that sentence (source words) goes under the headline
      const act = cta && !isContact(cta) && cta.length > 24 ? sourceAction(cta) : null;
      if (act) {
        const after = cta.replace(/^[\s\S]*["”]\s*(?:and\b|then\b|,|-|–|—)?\s*/i, '').trim();
        out.push(mk('cta-button', compact({ headline, button: act.label, sub: after && after !== cta && after.length <= 60 ? after : '' })));
        out.push(mk('cta-button', compact({ headline, button: act.label })));
      }
      out.push(mk('statement-card', compact({ headline, caption: cta })));
      out.push(mk('statement', compact({ headline, caption: cta })));
      return out;
    }
    default:
      return [];
  }
}

/**
 * One script slide as the plan of a library slide. Never fails: the nearest layout that fits (the simple "prose" layout for a long text) or, when none fits, the slide's natural layout with
 * its words kept exactly as written (`keepAsWritten`): the code never trims or rewrites the person's words.
 */
export function specFromSlide(s: SlideScript, _i: number, look: Look, ctx: CtaCtx, avoid: string[] = []): { spec: SlideSpec; mark: 'simple' | 'kept' | null; why: string } {
  const list = candidates(s);
  let first = '';
  let again: { spec: SlideSpec; mark: 'simple' | 'kept' | null; why: string } | null = null;
  for (const [k, spec] of list.entries()) {
    const problems = slideProblems(spec, look, ctx);
    if (!problems.length) {
      const got = { spec, mark: (spec.layout === 'prose' && k > 0 ? 'simple' : null) as 'simple' | null, why: '' };
      // the layout of the slide before (or one used twice already) is the last choice: the deck's rotation would only replace it
      if (!avoid.includes(spec.layout)) return got;
      again ||= got;
      continue;
    }
    first ||= problems[0];
  }
  if (again) return again;
  const natural: SlideSpec = list[0] ?? { layout: 'statement', fields: { headline: scriptText({ slides: [s] } as unknown as CarouselScript).slice(0, 4000) } as Fields, accents: [] };
  return { spec: { ...natural, keepAsWritten: true }, mark: 'kept', why: `Slide ${_i + 1} (${TYPE_LABEL[s.type]}) has more or longer text than the library layouts can show${first ? `: ${first}` : ''}` };
}

/** The words of a script, for the style pick. */
export const scriptText = (script: CarouselScript): string =>
  script.slides.map((s) => Object.values(s as unknown as Rec).flat().filter((v) => typeof v === 'string' && v.length > 3).join('. ')).join('\n');

const STUB: WriteProvider = { id: 'dev-cli', label: 'Your pasted script', write: async () => { throw new Error('A pasted script is never sent to a writer.'); } } as unknown as WriteProvider;

export type FromScript = { ok: true; script: CarouselScript; designed: Designed; result: GenerateResult } | { ok: false; reason: string };

/** Draws a pasted script with the layout library (zero model calls). */
export async function libraryDeckFromScript(script: CarouselScript, look: Look, handle: string): Promise<FromScript> {
  const text = scriptText(script);
  const ctx: CtaCtx = { handle, text };
  const specs: SlideSpec[] = [];
  const marks: ('simple' | 'kept' | null)[] = [];
  for (const [i, s] of script.slides.entries()) {
    const count = (id: string) => specs.filter((x) => x.layout === id).length;
    const avoid = [specs[specs.length - 1]?.layout, ...['split-text', 'headline-card', 'prose', 'statement', 'checklist', 'numbered-list', 'pill-stagger'].filter((id) => count(id) >= 2)].filter(Boolean) as string[];
    const r = specFromSlide(s, i, look, ctx, avoid);
    specs.push(r.spec);
    marks.push(r.mark);
  }
  const own: OwnScript = { title: script.title, specs, script, marks };
  try {
    const req = { text, slides: script.slides.length, tone: 'clear', format: 'carousel', styleChoice: 'auto', styles: [] } as never;
    const out = await designLibraryDeck(req, look, handle, STUB, new AbortController().signal, () => undefined, own);
    if (out.designed.calls !== 0) return { ok: false, reason: 'the drawing asked for a model call, which a pasted script never does' };
    return { ok: true, script: out.script, designed: out.designed, result: out };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
