// Round AQ: where a highlight goes when the phrase as written told which words were meant. The writer's accent "a frame" on "3. Frame inside a frame" is drawn as "frame" (an
// accent never starts with an article), and the search for "frame" found the FIRST one. The phrase as written ("a frame") is now carried along: the highlight goes on "frame" inside
// the first place where "a frame" stands as whole words. No imports: the layout library, the stack measure and the engine all use it.

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The index in `text` of `phrase` inside the first whole-word match of `within` (case does not matter), or -1 when `within` is not in the text or does not hold the phrase.
 * Whitespace in `within` matches any whitespace, a no-break space included.
 */
export function accentWithinAt(text: string, phrase: string, within: string | undefined): number {
  const w = (within ?? '').trim();
  const p = phrase.trim();
  if (!w || !p || w.toLowerCase() === p.toLowerCase()) return -1;
  const m = new RegExp('(?<![\\p{L}\\p{N}])' + w.split(/\s+/).map(esc).join('\\s+') + '(?![\\p{L}\\p{N}])', 'iu').exec(text);
  if (!m) return -1;
  const inner = new RegExp('(?<![\\p{L}\\p{N}])' + p.split(/\s+/).map(esc).join('\\s+') + '(?![\\p{L}\\p{N}])', 'iu').exec(m[0]);
  return inner ? (m.index ?? 0) + (inner.index ?? 0) : -1;
}
