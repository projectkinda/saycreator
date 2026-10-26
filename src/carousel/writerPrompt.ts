// The prompt a writer (a model) is given to turn the person's text into a carousel script. Pure text: nothing here calls anything.
import { VOCABULARY } from '../image-engine/styles/tags';
import type { Tone } from './doc';
import { EXAMPLE, EXAMPLE_QUOTE, SLIDE_RANGE, type Format } from './script';

/** The longest text accepted, in characters (about 2,000 words). Longer text is refused with a message, never cut silently. */
export const MAX_CHARS = 12000;
export const MIN_CHARS = 40;

export const TONES: { id: Tone; label: string; how: string }[] = [
  { id: 'clear', label: 'Clear', how: 'plain, calm, specific; no hype' },
  { id: 'bold', label: 'Bold', how: 'short, punchy, confident; strong verbs' },
  { id: 'friendly', label: 'Friendly', how: 'warm and conversational, like talking to a colleague' },
  { id: 'expert', label: 'Expert', how: 'precise and authoritative, with the right terms' },
];

export interface WriteRequest {
  text: string;
  /** How many slides were asked for. */
  slides: number;
  tone: Tone;
  format: Format;
  /** "auto": the writer also picks a style from `styles`. */
  styleChoice: 'auto' | string;
  /** `description` is the style's own one-line description (style.json). */
  styles: { name: string; title: string; description?: string }[];
}

/** Why a text cannot be sent yet, in plain words, or null when it can. */
export function textProblem(text: string): string | null {
  const t = text.trim();
  if (t.length < MIN_CHARS) return `Write or paste a bit more (at least ${MIN_CHARS} characters) so there is something to turn into slides.`;
  if (t.length > MAX_CHARS) return `This text is ${t.length.toLocaleString('en')} characters. The limit is ${MAX_CHARS.toLocaleString('en')} (about 2,000 words). Nothing was cut: shorten it, or paste the part you want as slides.`;
  return null;
}

export function buildWritePrompt(req: WriteRequest): string {
  const quote = req.format === 'quote';
  const [lo, hi] = SLIDE_RANGE[req.format];
  const n = Math.min(hi, Math.max(lo, req.slides));
  const tone = TONES.find((t) => t.id === req.tone)!;
  const auto = req.styleChoice === 'auto';
  return [
    `Turn the text between the markers into ${quote ? `a set of ${n} quote cards` : `a ${n}-slide carousel`}.`,
    '',
    '<text>',
    req.text.trim(),
    '</text>',
    '',
    'Reply with ONE JSON object and nothing else (no code fence, no explanation). Format:',
    '',
    JSON.stringify(quote ? EXAMPLE_QUOTE : EXAMPLE, null, 2),
    '',
    'Rules:',
    '- Facts: use only facts, claims and numbers that are in the text. Never invent statistics, names, quotes, dates or results. If a slide would want a number the text does not give, either leave that slide out or use a clearly marked placeholder: "value": "X" with "note": "Placeholder: use your own number".',
    quote ? `- Write exactly ${n} quote cards, every one of type "quote": one sentence from the text (shortened if needed, at most 20 words, no new words in the quote), and "by" saying who said it as the text says; if the text does not say, use the author or brand as "by": "From the text".` : `- Write ${n} slides. The first is a strong "cover" (a hook in at most 8 words). The last is a "closing" with a call to action in "cta". In between use "step", "content", "checklist", "stat" or "beforeafter" as the content calls for. Use "quote" only for words that are in the text.`,
    `- One idea per slide. Short copy that fits: headline at most 60 characters, body at most 160, "sub" at most 90, checklist items at most 50 characters and 3 to 5 of them, "kicker" at most 24, stat "value" at most 8 characters.`,
    `- Tone: ${tone.label} (${tone.how}).`,
    '- Every slide has "element_tags": 2 to 4 single lower-case words for the pictures that fit what that slide says. Use words from this list: ' + VOCABULARY.join(', ') + '.',
    '- "photo_hint" is optional: a few words (at most 12) describing the photo that would suit the slide, for example "a person at a desk, morning light". Add it on slides where a photo would help (the cover, a quote, a stat); leave it out otherwise. Never describe real, named people.',
    '- "highlight" is optional: 1 to 3 words copied exactly from that slide\'s headline (or quote).',
    '- Plain, specific language. No hashtags, no emoji, no links.',
    `- If the text is too short or thin to make ${n} different slides, write fewer (at least ${lo}) and add a top-level "note" saying so in one sentence. Never pad.`,
    auto ? `- Also add a top-level "style" set to the one of these that suits the text and tone best: ${req.styles.map((s) => `"${s.name}" (${s.description ?? s.title})`).join('; ')}. Do not always choose the same one: match the topic and tone.` : '',
    '- Include a short top-level "title" (at most 6 words) that names the topic.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** The second try: the first answer and what was wrong with it, in plain words. */
export function buildRetryPrompt(first: string, previous: string, problems: string[]): string {
  return [first, '', 'Your previous answer was:', previous.slice(0, 6000), '', 'It cannot be used, for these reasons:', ...problems.slice(0, 12).map((p) => `- ${p}`), '', 'Reply again with the corrected JSON object only (the complete script, no code fence, no explanation).'].join('\n');
}
