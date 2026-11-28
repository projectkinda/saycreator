// Round AQ: the second writer call (the retry) redoes only the slides the code could not use, and its answer replaces those slides whole. A real deck lost two tips that way: asked for
// "slide 3" and "slide 5" (the cover counted), the answer held the words of list items 3 and 5, so tips 2 and 4 were on no slide and tips 3 and 5 showed twice. This guard accepts a redone
// slide only when its words are the words of the slide it replaces: cuts are allowed, a word the old slide does not have is not (nothing invented, nothing from another slide); with
// "Keep every sentence" on, every sentence of the text the old slide showed must still be on it. Pure code: no model call.
import { sourceNotOnSlidesOf, wordsOfText } from './sourceCheck';
import type { Fields } from './layouts';

/** A picture field (image, image2 ...): never text. Kept here (not imported from layouts/images) so this module loads on its own. */
const isImageKey = (k: string) => /^image\d?$/.test(k);

/** The words a slide shows, from its fields (no picture field, no accent list, no picture reference). */
export function slideTextOf(fields: Fields): string {
  return Object.entries(fields)
    .filter(([k]) => !isImageKey(k) && k !== 'accent')
    .flatMap(([, v]) => (Array.isArray(v) ? v : [v]))
    .map((x) => String(x ?? '').trim())
    .filter((x) => x && !x.startsWith('picture:'))
    .join('\n');
}

export interface RetryCheck {
  ok: boolean;
  /** Why the redone slide was refused (plain words), when it was. */
  why?: string;
}

/**
 * Does the redone slide keep the replaced slide's words? Every word of the new slide must be a word of the old one, as often as the old one has it (a cut is fine); the new slide must show
 * something; with `keepSentences`, each sentence of `source` that was on the old slide is still on the new one (the same 80%-in-order rule as the sentences notice).
 */
export function retryKeepsWords(oldFields: Fields, newFields: Fields, source: string, keepSentences: boolean): RetryCheck {
  const oldText = slideTextOf(oldFields);
  const newText = slideTextOf(newFields);
  const newWords = wordsOfText(newText);
  if (!newWords.length) return { ok: false, why: 'the answer had no words for it' };
  const have = new Map<string, number>();
  for (const w of wordsOfText(oldText)) have.set(w, (have.get(w) ?? 0) + 1);
  const foreign: string[] = [];
  for (const w of newWords) {
    const n = have.get(w) ?? 0;
    if (n > 0) have.set(w, n - 1);
    else foreign.push(w);
  }
  if (foreign.length) return { ok: false, why: `the answer gave it words the slide did not have ("${[...new Set(foreign)].slice(0, 6).join('", "')}")` };
  if (keepSentences && source.trim()) {
    const before = new Set(sourceNotOnSlidesOf(source, [oldText]).sentences);
    const lost = sourceNotOnSlidesOf(source, [newText]).sentences.filter((s) => !before.has(s));
    if (lost.length) return { ok: false, why: `the answer left out ${lost.length === 1 ? 'a sentence' : `${lost.length} sentences`} of your text ("${lost[0].slice(0, 60)}")` };
  }
  return { ok: true };
}
