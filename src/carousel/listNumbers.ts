// Round AI: a numbered list in the person's text keeps its numbers on the slides. The writer may drop the "1." of an item ("Headlines are the person's words in order; you may drop words"),
// and the source checks read the text without list numbers, so nothing noticed a deck that showed "Shoot at golden hour" with no "1". This pass reads the numbered list from the text
// ("1. Shoot at golden hour. ..." one item per line, at least two items numbered in order) and puts each item's number on the slide whose headline is that item:
//   - listicle-numeral and step-numeral: their number field is set to the item's number;
//   - any other layout: "N." and a no-break space go in front of the headline (the number is the person's own, from the text), when the layout still takes the headline with it; otherwise the slide is left
//     as it is and the report says so.
// A slide whose headline already starts with its number, a slide with several items (stepper, numbered-list ...), the cover and the closing are left alone. Pure code: no model call; the
// words are the person's and every word is kept.
import { validateSlideContent, type Fields } from './layouts';
import { wordsOfText } from './sourceCheck';

/** One numbered item of the text: its number, its first sentence (the item's title) and all its words. */
export interface ListItem { n: number; title: string; titleWords: string[]; words: string[] }
const ITEM = /^[ \t]*(\d{1,2})[.)][ \t]+(.+)$/;
/** The numbered list of a text: lines "1. ...", "2. ..." numbered in order (at least two). Empty when there is none. */
export function numberedItems(text: string): ListItem[] {
  const out: ListItem[] = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const m = ITEM.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    // numbered in order: 1, 2, 3 ... (a second list starts again at 1)
    if (out.length && n !== out[out.length - 1].n + 1 && n !== 1) continue;
    if (n === 1 && out.length) { if (out.length >= 2) break; out.length = 0; }
    const body = m[2].trim();
    const title = (body.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? body).trim();
    out.push({ n, title, titleWords: wordsOfText(title), words: wordsOfText(body) });
  }
  return out.length >= 2 ? out : [];
}

/** The field that holds a slide's headline, by layout (the first one present). */
const HEAD_FIELDS = ['headline', 'title', 'heading', 'question'];
/** Layouts that show several items with their own numbers or bullets: left alone. */
const MANY = ['stepper', 'numbered-list', 'numbered-stagger', 'checklist', 'bullet-list', 'pill-stagger', 'card-grid', 'timeline', 'thumb-rows', 'list-under-band', 'list-beside-picture'];
/** The number field of a numeral layout. */
const NUMBER_FIELD: Record<string, string> = { 'listicle-numeral': 'numeral', 'step-numeral': 'step' };
/** A headline is an item when it holds at least this share of the item's title words, in order, and this share of its own words is from the item. */
export const ITEM_MATCH = 0.8;

const inOrder = (a: string[], b: string[]): number => {
  let k = 0;
  for (const w of b) if (k < a.length && a[k] === w) k++;
  return k;
};

interface Spec { layout: string; fields: Fields; accents?: string[] }
export interface ListNumberTrim { slide: number; field: string; from: string; to: string; max: number }

/** Puts each numbered item's number on its slide (see the top of the file). Returns the new slides and one report line per slide it changed or could not change. */
export function keepListNumbers<T extends Spec>(specs: T[], text: string): { specs: T[]; trims: ListNumberTrim[] } {
  const items = numberedItems(text);
  const trims: ListNumberTrim[] = [];
  if (!items.length || specs.length < 3) return { specs, trims };
  const used = new Set<number>();
  const out = specs.map((s, i) => {
    // the cover and the closing are not list items
    if (i === 0 || i === specs.length - 1 || MANY.includes(s.layout)) return s;
    const key = HEAD_FIELDS.find((k) => typeof s.fields[k] === 'string' && (s.fields[k] as string).trim());
    if (!key) return s;
    const head = String(s.fields[key]).trim();
    const hw = wordsOfText(head);
    if (!hw.length) return s;
    const item = items.find((it) => !used.has(it.n) && inOrder(it.titleWords, hw) >= Math.ceil(it.titleWords.length * ITEM_MATCH) && hw.filter((w) => it.words.includes(w)).length >= Math.ceil(hw.length * ITEM_MATCH));
    if (!item) return s;
    used.add(item.n);
    const numField = NUMBER_FIELD[s.layout];
    if (numField) {
      if (String(s.fields[numField] ?? '').trim() === String(item.n)) return s;
      trims.push({ slide: i + 1, field: 'list number', from: String(s.fields[numField] ?? ''), to: String(item.n), max: 0 });
      return { ...s, fields: { ...s.fields, [numField]: String(item.n) } };
    }
    // the headline already shows its number ("2. Look for reflections", "2 Look ...")
    if (new RegExp(`^\\s*${item.n}(?:[.)]|\\s)`).test(head)) return s;
    // a no-break space after the number: "5." never stands alone on a line above the item's words
    const next = `${item.n}. ${head}`;
    const fields = { ...s.fields, [key]: next } as Fields;
    if (!validateSlideContent(s.layout, fields).ok) {
      trims.push({ slide: i + 1, field: 'list number', from: head, to: '', max: item.n });
      return s;
    }
    trims.push({ slide: i + 1, field: 'list number', from: head, to: next, max: 0 });
    return { ...s, fields };
  });
  return { specs: out, trims };
}
