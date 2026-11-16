// Round M part 2: which sentences of the person's text are on no slide (measure only: the slides are never changed). The words are read the way the wording check reads them (report.ts re-exports
// these), so the two checks agree: wordingCheck finds words the slides ADD, this finds sentences the slides LEAVE OUT.

/** The words of a text, lower case, apostrophes made plain ("I’ll" and "I'll" are one word). */
export const wordsOfText = (t: string): string[] => (t.toLowerCase().replace(/[‘’]/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? []);

/** The visible words of a composed slide's layers: every text except the page counter, the swipe cue, the handle and decoration. */
export const visibleTextOf = (layers: unknown[]): string =>
  (layers as { kind?: string; visible?: boolean; id?: string; name?: string; role?: string; text?: string }[])
    .filter((l) => l.kind === 'text' && l.visible !== false && l.role !== 'decor' && !/recurring|^page|^swipe|^handle|^strip|^dots/.test(`${l.id ?? ''} ${l.name ?? ''}`) && (l.text ?? '').trim())
    .map((l) => l.text)
    .join(' ');

/** The sentences of a text: a list item is one, otherwise split after . ! ? or : (list numbers and bullets removed; empty pieces dropped). */
export function sentencesOf(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.replace(/^[ \t]*(?:\d{1,2}[.)]|[-*•])[ \t]+/, '').trim())
    .flatMap((line) => line.split(/(?<=[.!?:])\s+/))
    .map((s) => s.trim())
    .filter((s) => wordsOfText(s).length > 0);
}

/** How many words of `a` appear in `b` in the same order (the longest common run with gaps). */
function inOrder(a: string[], b: string[]): number {
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/** A sentence is on a slide when at least this share of its words appears on ONE slide, in order. */
export const ON_SLIDE_SHARE = 0.8;

/** Round R: the emoji of a text (an emoji with its variation selector, skin tone or joined parts is one), in order. */
export const EMOJI = /\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*/gu;
export const emojisOf = (t: string): string[] => t.match(EMOJI) ?? [];
/** Round R: each emoji of the text with the words just before it (up to 4), so a note can say where it stood. */
export function emojiPlaces(text: string): { emoji: string; after: string }[] {
  const out: { emoji: string; after: string }[] = [];
  for (const m of text.matchAll(EMOJI)) {
    const before = text.slice(0, m.index).split(/(?<=[.!?:\n])\s+/).pop() ?? '';
    out.push({ emoji: m[0], after: (before.match(/[\p{L}\p{N}'’-]+/gu) ?? []).slice(-4).join(' ') });
  }
  return out;
}

export interface SourceNotOnSlides {
  count: number;
  /** Of all the sentences of the text. */
  total: number;
  percentOfSentences: number;
  sentences: string[];
  /** Round R: the emoji of the text that no slide shows (the word check reads letters only, so an emoji is checked on its own), with the words before it. */
  emojis: { emoji: string; after: string }[];
}
/** The sentences of `source` that are on no slide. `slideTexts`: the visible words of each slide. */
export function sourceNotOnSlidesOf(source: string, slideTexts: string[]): SourceNotOnSlides {
  const sentences = sentencesOf(source);
  const slides = slideTexts.map(wordsOfText);
  const missing = sentences.filter((s) => {
    const ws = wordsOfText(s);
    return !slides.some((sw) => inOrder(ws, sw) >= Math.ceil(ws.length * ON_SLIDE_SHARE));
  });
  // each emoji of the text must be on a slide as often as the text has it
  const shown = slideTexts.flatMap(emojisOf);
  const emojis = emojiPlaces(source).filter((e) => { const k = shown.indexOf(e.emoji); if (k < 0) return true; shown.splice(k, 1); return false; });
  return { count: missing.length, total: sentences.length, percentOfSentences: sentences.length ? Math.round((missing.length / sentences.length) * 1000) / 10 : 0, sentences: missing, emojis };
}
