// "Pick for me": choose a style from the tone, the topic words and the slide types, with a score for each style and a plain reason.
// Each style says what it suits in its own style.json (description and suits). The score is simple on purpose and the keyword
// lists are hand-written for the four styles that exist: it is a guess about taste, not something measured.
import type { LoadedStyle } from '../image-engine/styles/load';
import type { Tone } from './doc';

export interface StyleScore {
  name: string;
  title: string;
  score: number;
  /** The reasons, in words, that earned the score. */
  reasons: string[];
}
export interface StylePick {
  name: string;
  title: string;
  /** One sentence for the person. */
  why: string;
  scores: StyleScore[];
}

const WORD = /[\p{L}\p{N}']+/gu;
const words = (text: string) => new Set((text.toLowerCase().match(WORD) ?? []).map((w) => w.replace(/^'+|'+$/g, '')));

/** A small stable number from the text, used only to break a tie, so the same text always gets the same style. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function pickStyle(input: { text: string; tone: Tone; slideTypes: string[]; styles: LoadedStyle[]; writerSuggestion?: string | null }): StylePick {
  const w = words(input.text);
  const scores: StyleScore[] = input.styles.map((st) => {
    const su = st.spec.suits ?? {};
    const reasons: string[] = [];
    let score = 0;
    if (su.tones?.includes(input.tone)) {
      score += 3;
      reasons.push(`it suits a ${input.tone} tone`);
    }
    const hits = (su.keywords ?? []).filter((k) => w.has(k.toLowerCase()));
    if (hits.length) {
      const pts = Math.min(4, hits.length);
      score += pts;
      reasons.push(`the text has words it suits (${hits.slice(0, 4).join(', ')})`);
    }
    const typeHits = input.slideTypes.filter((t) => (su.slideTypes ?? []).includes(t as never)).length;
    if (typeHits) {
      score += Math.min(2, typeHits * 0.5);
      reasons.push(`${typeHits} of its slides are types it handles well`);
    }
    if (input.writerSuggestion === st.spec.name) {
      score += 1;
      reasons.push('the writer suggested it');
    }
    return { name: st.spec.name, title: st.spec.title, score, reasons };
  });
  // Highest score; a tie (within half a point) is broken by the text itself, so a style is not always first by name.
  const top = Math.max(...scores.map((s) => s.score));
  const close = scores.filter((s) => s.score >= top - 0.5);
  const chosen = close[hash(input.text) % close.length];
  const why = chosen.reasons.length ? `${chosen.title}: ${chosen.reasons.join('; ')}.` : `${chosen.title}: no style stood out, so one was chosen from the text.`;
  return { name: chosen.name, title: chosen.title, why, scores };
}
