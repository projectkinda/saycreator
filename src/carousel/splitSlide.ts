// "Split into two slides": a slide of a library deck whose text is too long is cut in two at a sentence boundary near the middle. Every word is kept exactly as written and in order;
// nothing is trimmed, reworded or added. The first slide keeps the headline, the second has none. Pure code: the page redraws both slides with no model call.
import type { Fields } from './layouts';
import type { SlideSpec } from './designLibrary';

/** The text fields (in reading order) that carry a long text, for each layout that can be split; the headline field and the layout the halves use. */
const SPLITTABLE: Record<string, { body: string[]; head: string }> = {
  prose: { body: ['p1', 'p2', 'p3', 'pull', 'bullets'], head: 'heading' },
  'split-text': { body: ['paragraph'], head: 'headline' },
  'step-numeral': { body: ['body'], head: 'title' },
  'feature-slider': { body: ['body'], head: 'title' },
  'listicle-numeral': { body: ['body'], head: 'title' },
  'headline-body-image': { body: ['body'], head: 'headline' },
};
export const canSplitLayout = (layout: string): boolean => layout in SPLITTABLE;

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const CAPS = [300, 300, 260];

/** The cut points of a text, nearest the middle first: after a sentence end; else after a comma, semicolon or colon; else at a space (never inside a word). Each is an index into the text. */
function cutPoints(text: string): number[] {
  const kinds: RegExp[] = [/[.!?…]["”’')\]]*(?:\s+)/g, /[,;:]["”’')\]]*(?:\s+)/g, /\s+/g];
  const total = wordCount(text);
  for (const re of kinds) {
    const pts: number[] = [];
    for (const m of text.matchAll(re)) {
      const at = (m.index ?? 0) + m[0].length;
      if (at > 0 && at < text.length && text.slice(0, at).trim() && text.slice(at).trim()) pts.push(at);
    }
    if (pts.length) return pts.sort((a, b) => Math.abs(wordCount(text.slice(0, a)) - total / 2) - Math.abs(wordCount(text.slice(0, b)) - total / 2));
  }
  return [];
}

/** Paragraphs of a half: its own paragraph breaks, and a paragraph over its cap is cut again at sentence ends. Null when the words do not fit in three paragraphs. */
function paragraphsOf(text: string): string[] | null {
  const out: string[] = [];
  for (const para of text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
    let rest = para;
    while (rest) {
      const cap = CAPS[out.length];
      if (cap === undefined) return null;
      if (rest.length <= cap) {
        out.push(rest);
        break;
      }
      const at = cutPoints(rest).filter((p) => rest.slice(0, p).trim().length <= cap).sort((a, b) => b - a)[0];
      if (!at) return null;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
  }
  return out.length && out.length <= 3 ? out : null;
}

/** The two slides, or a plain reason. `fits` tells whether a slide spec can be drawn (its fields are inside their budgets). */
export function splitSpec(spec: SlideSpec, fits: (s: SlideSpec) => boolean): { ok: true; a: SlideSpec; b: SlideSpec } | { ok: false; reason: string } {
  const def = SPLITTABLE[spec.layout];
  if (!def) return { ok: false, reason: 'This layout cannot be split. Pick another layout, or shorten the text.' };
  const f = spec.fields as Record<string, string | string[] | undefined>;
  // the long text: the body fields in order, paragraph breaks kept as blank lines
  const parts = def.body.flatMap((k) => (Array.isArray(f[k]) ? (f[k] as string[]) : typeof f[k] === 'string' && (f[k] as string).trim() ? [f[k] as string] : []));
  const text = parts.map((p) => p.trim()).join('\n\n');
  if (wordCount(text) < 2) return { ok: false, reason: 'There is not enough text on this slide to split.' };
  const at = cutPoints(text)[0];
  if (!at) return { ok: false, reason: 'There is no place to split this text.' };
  const left = text.slice(0, at).trim();
  const right = text.slice(at).trim();
  const headline = String(f[def.head] ?? '').trim();
  const accentsIn = (t: string) => spec.accents.filter((p) => t.toLowerCase().includes(p.toLowerCase().replace(/[.,;:]+$/, '')));
  // second slide: the prose layout with no heading (nothing is invented)
  const pr = paragraphsOf(right);
  if (!pr) return { ok: false, reason: 'The second half cannot be laid out without cutting words.' };
  const b: SlideSpec = { layout: 'prose', fields: { p1: pr[0], ...(pr[1] ? { p2: pr[1] } : {}), ...(pr[2] ? { p3: pr[2] } : {}) } as Fields, accents: accentsIn(right) };
  // first slide: the same layout when the shorter text fits it, else prose with the headline
  const asSame = (): SlideSpec | null => {
    if (spec.layout === 'prose') return null;
    const body = def.body[0];
    const s: SlideSpec = { ...spec, fields: { ...spec.fields, [body]: left } as Fields, accents: accentsIn(headline + ' ' + left) };
    return fits(s) ? s : null;
  };
  const pl = paragraphsOf(left);
  const prose: SlideSpec | null = pl ? { layout: 'prose', fields: { ...(headline ? { heading: headline } : {}), ...(spec.layout === 'step-numeral' && f.step ? { num: String(f.step) } : {}), ...(spec.layout === 'prose' && f.num ? { num: String(f.num) } : {}), p1: pl[0], ...(pl[1] ? { p2: pl[1] } : {}), ...(pl[2] ? { p3: pl[2] } : {}) } as Fields, accents: accentsIn(headline + ' ' + left), ...(spec.pin ? { pin: spec.pin } : {}) } : null;
  const a = asSame() ?? prose;
  if (!a) return { ok: false, reason: 'The first half cannot be laid out without cutting words.' };
  return { ok: true, a, b };
}
