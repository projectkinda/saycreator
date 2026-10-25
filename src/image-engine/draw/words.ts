// ONE way to compare words, used everywhere a highlighted word is matched against the text of a slide: the plan validator, the
// layout that draws the bars, the marker, the keep-together step, and the script checker. Matching both sides through the same
// function is what makes "5,000", "$5,000," and "99.9%" work: before, one side split the text on punctuation and the other kept it.

/** Straight and curly apostrophes (and their look-alikes) are the same letter; so are the different hyphens. */
const APOSTROPHES = /[‘’‛ʼ`´′]/g;
const HYPHENS = /[‐‑‒]/g;

/**
 * The comparison form of a word: lower-case, letters, numbers, apostrophes and hyphens kept, everything else removed.
 *   "$5,000," -> "5000"   "99.9%" -> "999"   "3.5x" -> "35x"   "e-mail." -> "e-mail"   "It’s" -> "it's"
 * Hyphens and apostrophes at the very start or end are dropped (a quote mark, a dash), so '"word"' matches "word".
 * An empty result means the word is only punctuation.
 */
export function wordKey(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(APOSTROPHES, "'")
    .replace(HYPHENS, '-')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]/gu, '')
    .replace(/^['-]+|['-]+$/g, '');
}

/** The comparison forms of every word in a text (split on any white space, no-break spaces too), punctuation-only words left out. */
export function wordKeys(text: string): string[] {
  return text
    .split(/\s+/)
    .map(wordKey)
    .filter((k) => k !== '');
}

/**
 * Which of the highlight words are in the text. A word counts as found when its comparison form is one of the text's.
 * `missing` keeps the words as the person wrote them, for a plain warning.
 */
export function findHighlight(text: string, words: string[]): { found: string[]; missing: string[] } {
  const have = new Set(wordKeys(text));
  const found: string[] = [];
  const missing: string[] = [];
  for (const w of words) (wordKey(w) !== '' && have.has(wordKey(w)) ? found : missing).push(w);
  return { found, missing };
}

/** The plain sentence shown on a slide card when a highlight is not in its text. */
export const missingHighlightNote = (w: string) => `Highlight '${w}' not found; drawn without it.`;
