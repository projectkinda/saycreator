// Ready-made slide text: one block per slide, split by blank lines or "---". When the text is like that, the slides are made from it as they are
// (no writer call at all) and drawn by the layout library (libraryFromScript.ts). Ordinary prose (long paragraphs) is not taken for slides.
import type { CarouselScript } from '../image-engine/carousel/types';
import { validateScript, type Format } from './script';

/** The blocks of the text when it looks like ready slide text (3 to 10 blocks; with blank lines only, every block short), else null. */
export function slideBlocks(text: string): string[] | null {
  const t = text.replace(/\r\n/g, '\n').trim();
  if (!t) return null;
  const explicit = /^[ \t]*---+[ \t]*$/m.test(t);
  const blocks = (explicit ? t.split(/^[ \t]*---+[ \t]*$/m) : t.split(/\n[ \t]*\n/)).map((b) => b.trim()).filter(Boolean);
  if (blocks.length < 3 || blocks.length > 10) return null;
  if (!explicit && blocks.some((b) => b.length > 240)) return null;
  return blocks;
}

const lines = (b: string) => b.split('\n').map((l) => l.trim()).filter(Boolean);
const bullet = /^([-*•]|\d{1,2}[.)])\s+/;
const numbered = /^\d{1,2}[.)]\s+/;
const wordsOf = (t: string) => t.split(/\s+/).filter(Boolean).length;
/** Sentences of one paragraph (a sentence ends at . ! or ? followed by a space and a capital letter, a digit or a quote). */
export const sentencesOf = (t: string): string[] => t.trim().split(/(?<=[.!?])\s+(?=["“'(]?[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);

/**
 * One paragraph as a headline and a body, never both with the same words: a block of ONE sentence, or of 12 words or fewer, is the headline alone; a longer block has its first sentence as the
 * headline and the other sentences as the body.
 */
export function headAndBody(text: string): { head: string; body: string } {
  const t = text.replace(/\s+/g, ' ').trim();
  const ss = sentencesOf(t);
  if (ss.length < 2 || wordsOf(t) <= 12) return { head: t, body: '' };
  return { head: ss[0], body: ss.slice(1).join(' ') };
}

/** **words** typed in the text mark a highlight; the markers are taken out of the words. */
function unmark(b: string): { text: string; marks: string[] } {
  const marks: string[] = [];
  const text = b.replace(/\*\*([^*\n]+?)\*\*/g, (_m, w: string) => { marks.push(w.trim()); return w; });
  return { text, marks };
}

interface Unit { block: string; marks: string[]; lead?: string }

/**
 * The script for those blocks: first is the cover, last the closing, numbered ones steps, a list (bulleted or numbered, with its lead-in line) a checklist, the rest points. The words are the person's
 * own and each is used once: a paragraph is the headline or the body, never both (see headAndBody). A lead-in block that ends with a colon goes with the list block after it.
 */
export function scriptFromBlocks(blocks: string[], format: Format, handle: string): { script?: CarouselScript; errors: string[] } {
  const h = handle || '@yourname';
  const cleaned = blocks.map(unmark);
  // a lead-in ("... Here's how it works:") directly before a block that is only a list goes with that list
  const units: Unit[] = [];
  cleaned.forEach((c, i) => {
    const ls = lines(c.text);
    const listOnly = ls.length >= 2 && ls.every((l) => bullet.test(l));
    const prev = units[units.length - 1];
    if (format !== 'quote' && listOnly && prev && units.length >= 1 && !prev.lead && /:\s*$/.test(prev.block) && lines(prev.block).length === 1 && !bullet.test(prev.block) && !(units.length === 1 && i - 1 === 0)) {
      units[units.length - 1] = { block: c.text, marks: [...prev.marks, ...c.marks], lead: prev.block };
    } else units.push({ block: c.text, marks: c.marks });
  });
  const last = units.length - 1;
  const slides = units.map((u, i) => {
    const ls = lines(u.block);
    const mark = (head: string) => { const m = u.marks.find((x) => head.toLowerCase().includes(x.toLowerCase())); return m ? { highlight: m } : {}; };
    if (format === 'quote') return { type: 'quote', quote: ls.join(' ').replace(/^["“]|["”]$/g, ''), by: h === '@yourname' ? '' : h };
    // a list: the lines before the first item (or the lead-in block) are its headline, every item is kept, the digits or dashes are taken out
    const first = ls.findIndex((l) => bullet.test(l));
    if (i > 0 && i < last + 0 && first >= 0 && ls.slice(first).every((l) => bullet.test(l)) && ls.length - first >= 2) {
      const items = ls.slice(first).map((l) => l.replace(bullet, '').trim());
      const lead = (u.lead ? u.lead : ls.slice(0, first).join(' ')).replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim();
      const head = lead || (ls.slice(first).every((l) => numbered.test(l)) ? 'Steps' : 'Key points');
      return { type: 'checklist', headline: head, items, ...mark(head) };
    }
    if (i === 0) {
      if (ls.length >= 2) return { type: 'cover', headline: ls[0], sub: ls.slice(1).join(' '), ...mark(ls[0]) };
      const hb = headAndBody(ls[0] ?? u.block);
      return { type: 'cover', headline: hb.head, ...(hb.body ? { sub: hb.body } : {}), ...mark(hb.head) };
    }
    if (i === last) {
      if (ls.length >= 2) return { type: 'closing', headline: ls[0], cta: ls.slice(1).join(' '), ...mark(ls[0]) };
      const hb = headAndBody(ls[0] ?? u.block);
      return { type: 'closing', headline: hb.head, cta: hb.body || hb.head, ...mark(hb.head) };
    }
    const n = /^(\d{1,2})[.)]\s+(.*)$/.exec(ls[0]);
    if (n) {
      const rest = ls.slice(1).join(' ');
      return { type: 'step', number: Number(n[1]), headline: n[2], ...(rest ? { body: rest } : { headlineOnly: true }), ...mark(n[2]) };
    }
    if (ls.length >= 2) return { type: 'content', headline: ls[0], body: ls.slice(1).join(' '), ...mark(ls[0]) };
    const hb = headAndBody(ls[0] ?? u.block);
    return { type: 'content', headline: hb.head, ...(hb.body ? { body: hb.body } : { headlineOnly: true }), ...mark(hb.head) };
  });
  const title = (lines(cleaned[0].text)[0] ?? 'My slides').split(/\s+/).slice(0, 6).join(' ');
  const r = validateScript({ title, brand: { handle: h }, slides }, format);
  return r.script ? { script: r.script, errors: [] } : { errors: r.errors.map((e) => e.message) };
}
