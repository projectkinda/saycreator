// Ready-made slide text: one block per slide, split by blank lines or "---". When the text is like that, the slides are made from it as they are
// (no writer call at all). Ordinary prose (long paragraphs) is not taken for slides.
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

/** The script for those blocks: first is the cover, last the closing, numbered ones steps, bulleted ones checklists, the rest points. The words are the person's own. */
export function scriptFromBlocks(blocks: string[], format: Format, handle: string): { script?: CarouselScript; errors: string[] } {
  const h = handle || '@yourname';
  const last = blocks.length - 1;
  const slides = blocks.map((b, i) => {
    const ls = lines(b);
    const first = ls[0] ?? b;
    const rest = ls.slice(1).join(' ');
    if (format === 'quote') return { type: 'quote', quote: ls.join(' ').replace(/^["“]|["”]$/g, ''), by: h === '@yourname' ? 'From the text' : h };
    if (i === 0) return { type: 'cover', headline: first, ...(rest ? { sub: rest } : {}) };
    if (i === last) return { type: 'closing', headline: first, cta: rest || first };
    const items = ls.slice(1).filter((l) => bullet.test(l)).map((l) => l.replace(bullet, ''));
    if (items.length >= 2 && items.length === ls.length - 1) return { type: 'checklist', headline: first, items };
    const n = /^(\d{1,2})[.)]\s+(.*)$/.exec(first);
    if (n) return { type: 'step', number: Number(n[1]), headline: n[2], body: rest || n[2] };
    return { type: 'content', headline: first, body: rest || first };
  });
  const title = (lines(blocks[0])[0] ?? 'My slides').split(/\s+/).slice(0, 6).join(' ');
  const r = validateScript({ title, brand: { handle: h }, slides }, format);
  return r.script ? { script: r.script, errors: [] } : { errors: r.errors.map((e) => e.message) };
}
