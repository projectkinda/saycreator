// The thumbnail title writer. It asks through the same provider interface as the script writer (detectProviders in carousel/writer.ts):
// the browser sends a prompt to this app's own server and gets text back. It never holds a key. Nothing here calls a model by itself.
import { WriterError, type WriteProvider } from '../carousel/writer';

export const TITLE_MAX_WORDS = 4;
export const TITLE_COUNT = { min: 3, max: 5 };
/** The longest text sent, in characters. Longer text is cut with a message, never silently. */
export const SOURCE_MAX_CHARS = 8000;

export interface TitleOption {
  title: string;
  /** One word of the title to stress. */
  emphasis: string;
}

const wordsOf = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const NUMBER_WORD = /\d/;

/** The prompt for the writer: what it gets, what it must return, and what it must not do. */
export function buildTitlePrompt(source: string, count = TITLE_COUNT.max): string {
  const text = source.trim().slice(0, SOURCE_MAX_CHARS);
  return [
    `Write ${count} different thumbnail titles for a video or post about the text between the markers.`,
    '',
    '<text>',
    text,
    '</text>',
    '',
    'Reply with ONE JSON object and nothing else (no code fence, no explanation):',
    '{"titles":[{"title":"Ride Before Sunrise","emphasis":"Sunrise"}]}',
    '',
    'Rules:',
    `- Each title has at most ${TITLE_MAX_WORDS} words. Short, concrete, easy to read on a phone at a glance.`,
    '- "emphasis" is exactly one word of that title: the one that should stand out.',
    '- Use only facts, claims and numbers that are in the text. Never invent a statistic, a number, a result, a name or a promise. If the text has no number, the title has no number.',
    '- No hashtags, emoji, quotation marks or full stops. No clickbait that the text does not back up.',
    '- The titles must differ from each other in wording, not only in order.',
  ].join('\n');
}

export interface ParsedTitles {
  options: TitleOption[];
  /** Plain words about every title that was dropped, and why. */
  dropped: string[];
}

/** Reads the writer's answer. A title is kept only if it is short enough, its emphasis word is in it, and it brings no number the text does not have. */
export function parseTitles(answer: string, source: string): ParsedTitles {
  const dropped: string[] = [];
  let raw: unknown;
  try {
    const t = answer.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    raw = JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t);
  } catch {
    return { options: [], dropped: ['The answer was not valid JSON.'] };
  }
  const list = (raw as { titles?: unknown })?.titles;
  if (!Array.isArray(list)) return { options: [], dropped: ['The answer has no "titles" list.'] };
  const sourceKeys = new Set(wordsOf(source).map(key));
  const options: TitleOption[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const t = typeof item === 'string' ? item : (item as { title?: unknown })?.title;
    const e = typeof item === 'string' ? undefined : (item as { emphasis?: unknown })?.emphasis;
    if (typeof t !== 'string' || !t.trim()) {
      dropped.push('A title was empty.');
      continue;
    }
    const title = t.trim().replace(/\s+/g, ' ').replace(/["“”.]+$/g, '');
    const ws = wordsOf(title);
    if (ws.length > TITLE_MAX_WORDS) {
      dropped.push(`"${title}" has ${ws.length} words (the limit is ${TITLE_MAX_WORDS}).`);
      continue;
    }
    const invented = ws.filter((w) => NUMBER_WORD.test(w) && !sourceKeys.has(key(w)));
    if (invented.length) {
      dropped.push(`"${title}" has the number ${invented[0]}, which is not in your text.`);
      continue;
    }
    if (seen.has(title.toLowerCase())) {
      dropped.push(`"${title}" appeared twice.`);
      continue;
    }
    const emphasis = typeof e === 'string' && ws.some((w) => key(w) === key(e)) ? ws.find((w) => key(w) === key(e as string))! : ws[ws.length - 1];
    seen.add(title.toLowerCase());
    options.push({ title, emphasis });
  }
  return { options: options.slice(0, TITLE_COUNT.max), dropped };
}

export interface TitleResult {
  options: TitleOption[];
  dropped: string[];
  attempts: 1 | 2;
  ms: number;
  provider: string;
}

/** Asks the writer for titles; if fewer than 3 are usable, asks once more with the reasons. Throws WriterError when nothing usable comes back. */
export async function generateTitles(source: string, p: WriteProvider, signal: AbortSignal): Promise<TitleResult> {
  const first = buildTitlePrompt(source);
  let a = await p.write(first, signal);
  let total = a.ms;
  let r = parseTitles(a.text, source);
  let attempts: 1 | 2 = 1;
  if (r.options.length < TITLE_COUNT.min) {
    attempts = 2;
    const retry = [first, '', 'Your previous answer was:', a.text.slice(0, 4000), '', `Only ${r.options.length} title(s) could be used, because:`, ...r.dropped.slice(0, 8).map((d) => `- ${d}`), '', `Answer again with ${TITLE_COUNT.max} titles that follow every rule.`].join('\n');
    a = await p.write(retry, signal);
    total += a.ms;
    r = parseTitles(a.text, source);
  }
  if (r.options.length === 0) throw new WriterError('invalid', 'The writer answered, but no title could be used. Type your own title instead.');
  return { options: r.options, dropped: r.dropped, attempts, ms: total, provider: p.id };
}
