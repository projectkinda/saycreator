// The script a carousel is made from: its format, a validator that explains problems in plain words and says where,
// the prompt that asks Claude (in any chat) to write one, and the interface for a future "Write it for me" backend.
// No network calls and no keys anywhere in this folder.
import type { CarouselScript, SlideScript } from '../image-engine/carousel/types';
import { VOCABULARY, checkElementTags } from '../image-engine/styles/tags';

export type Format = 'carousel' | 'quote';
/** How many slides a script may have. A carousel is usually 7; fewer or more is fine within these limits. */
export const SLIDE_RANGE: Record<Format, [number, number]> = { carousel: [3, 10], quote: [1, 7] };
export const FORMATS: { id: Format; label: string; note: string; ratio: string; width: number; height: number }[] = [
  { id: 'carousel', label: 'Carousel', note: '3 to 10 slides, usually 7, 4:5', ratio: '4:5', width: 1080, height: 1350 },
  { id: 'quote', label: 'Quote card', note: '1 to 7 square cards, 1:1', ratio: '1:1', width: 1080, height: 1080 },
];
export const formatOf = (f: Format) => FORMATS.find((x) => x.id === f)!;

export type SlideType = SlideScript['type'];
export interface FieldDef { key: string; label: string; kind: 'text' | 'area' | 'list' | 'number'; required: boolean; hint?: string }

/** The fields of each kind of slide, in the order they are edited. */
export const FIELDS: Record<SlideType, FieldDef[]> = {
  cover: [
    { key: 'kicker', label: 'Small line above', kind: 'text', required: false },
    { key: 'headline', label: 'Headline', kind: 'text', required: true },
    { key: 'sub', label: 'Line below', kind: 'area', required: false },
    { key: 'highlight', label: 'Highlighted words', kind: 'text', required: false, hint: 'Words from the headline to mark.' },
  ],
  content: [
    { key: 'headline', label: 'Headline', kind: 'text', required: true },
    { key: 'body', label: 'Body', kind: 'area', required: true },
    { key: 'highlight', label: 'Highlighted words', kind: 'text', required: false, hint: 'Words from the headline to mark.' },
  ],
  step: [
    { key: 'number', label: 'Step number', kind: 'number', required: true },
    { key: 'headline', label: 'Headline', kind: 'text', required: true },
    { key: 'body', label: 'Body', kind: 'area', required: true },
    { key: 'highlight', label: 'Highlighted words', kind: 'text', required: false, hint: 'Words from the headline to mark.' },
  ],
  stat: [
    { key: 'kicker', label: 'Small line above', kind: 'text', required: false },
    { key: 'value', label: 'Big number', kind: 'text', required: true, hint: 'A figure you can stand behind.' },
    { key: 'label', label: 'What the number means', kind: 'area', required: true },
    { key: 'note', label: 'Note', kind: 'text', required: false },
  ],
  checklist: [
    { key: 'headline', label: 'Headline', kind: 'text', required: true },
    { key: 'items', label: 'Items', kind: 'list', required: true, hint: 'One per line, 2 to 6.' },
    { key: 'highlight', label: 'Highlighted words', kind: 'text', required: false, hint: 'Words from the headline to mark.' },
  ],
  beforeafter: [
    { key: 'beforeLabel', label: 'First label', kind: 'text', required: true },
    { key: 'before', label: 'First text', kind: 'area', required: true },
    { key: 'afterLabel', label: 'Second label', kind: 'text', required: true },
    { key: 'after', label: 'Second text', kind: 'area', required: true },
  ],
  quote: [
    { key: 'quote', label: 'Quote', kind: 'area', required: true },
    { key: 'by', label: 'Said by', kind: 'text', required: true },
    { key: 'highlight', label: 'Highlighted words', kind: 'text', required: false, hint: 'Words from the quote to mark.' },
  ],
  closing: [
    { key: 'headline', label: 'Headline', kind: 'text', required: true },
    { key: 'cta', label: 'What to do next', kind: 'text', required: true },
    { key: 'highlight', label: 'Highlighted words', kind: 'text', required: false, hint: 'Words from the headline to mark.' },
  ],
};
export const SLIDE_TYPE_LIST = Object.keys(FIELDS) as SlideType[];
export const TYPE_LABEL: Record<SlideType, string> = { cover: 'Cover', content: 'Point', step: 'Step', stat: 'Number', checklist: 'Checklist', beforeafter: 'Myth and fact', quote: 'Quote', closing: 'Closing' };

export interface Issue {
  severity: 'error' | 'warning';
  /** Where, for example "slides[2].headline" (slide numbers in the path start at 1 in the message, 0 in the path). */
  path: string;
  message: string;
}
export interface ScriptResult {
  /** The script with defaults filled in. Only present when there are no errors. */
  script?: CarouselScript;
  issues: Issue[];
  errors: Issue[];
  warnings: Issue[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const LIMITS = { headline: 100, body: 260, item: 90, items: [2, 6] as const };

/** Takes what people paste from a chat: strips a ```json fence and any text around the first { and the last }. */
export function cleanPaste(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

function lineCol(text: string, pos: number) {
  const before = text.slice(0, pos);
  return { line: before.split('\n').length, col: pos - before.lastIndexOf('\n') };
}

/** Parses pasted text. A JSON mistake says the line and column and what was probably meant. */
export function validateScriptText(text: string, format: Format): ScriptResult {
  const t = cleanPaste(text);
  if (t.trim() === '') return finish([{ severity: 'error', path: '', message: 'There is nothing to check yet. Paste the script Claude wrote.' }]);
  let raw: unknown;
  try {
    raw = JSON.parse(t);
  } catch (e) {
    const m = String((e as Error).message);
    const pos = Number(m.match(/position (\d+)/)?.[1]);
    const where = Number.isFinite(pos) ? lineCol(t, pos) : null;
    const near = Number.isFinite(pos) ? t.slice(Math.max(0, pos - 20), pos + 20).replace(/\s+/g, ' ') : '';
    const hint = /Unexpected token '?([^']*)'?/.test(m) || /Expected/.test(m) ? ' Common causes: a missing comma between two items, a missing quote, a trailing comma before } or ], or a line of text mixed into the JSON.' : /end of JSON|Unterminated/.test(m) ? ' The text stops early: part of the script is missing (check that you copied all of it).' : '';
    return finish([{ severity: 'error', path: '', message: `This is not valid JSON${where ? `: line ${where.line}, column ${where.col}, near "${near}"` : ''}.${hint}` }]);
  }
  return validateScript(raw, format);
}

const finish = (issues: Issue[], script?: CarouselScript): ScriptResult => {
  const errors = issues.filter((i) => i.severity === 'error');
  return { issues, errors, warnings: issues.filter((i) => i.severity === 'warning'), ...(errors.length === 0 && script ? { script } : {}) };
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'carousel';
export { slug };

/** Checks a parsed script and fills in defaults (id, title, handle). */
export function validateScript(raw: unknown, format: Format): ScriptResult {
  const issues: Issue[] = [];
  const err = (path: string, message: string) => issues.push({ severity: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ severity: 'warning', path, message });
  if (!isObj(raw)) {
    err('', 'The script must be a JSON object that starts with { and has a "slides" list.');
    return finish(issues);
  }
  if (raw.title !== undefined && typeof raw.title !== 'string') err('title', '"title" must be text.');
  if (raw.brand !== undefined && !(isObj(raw.brand) && (raw.brand.handle === undefined || typeof raw.brand.handle === 'string'))) err('brand', '"brand" must look like {"handle": "@yourname"}.');
  const slides = raw.slides;
  if (!Array.isArray(slides)) {
    err('slides', 'The script has no "slides" list. It needs "slides": [ ... ].');
    return finish(issues);
  }
  const [lo, hi] = SLIDE_RANGE[format];
  if (slides.length < lo || slides.length > hi) err('slides', format === 'carousel' ? `A carousel needs ${lo} to ${hi} slides (7 is usual). This script has ${slides.length}.` : `Quote cards come in sets of ${lo} to ${hi}. This script has ${slides.length}.`);
  slides.forEach((s, i) => {
    const at = (k: string) => `slides[${i}]${k ? '.' + k : ''}`;
    const n = `Slide ${i + 1}`;
    if (!isObj(s)) return err(at(''), `${n} must be an object like {"type": "cover", "headline": "..."}.`);
    const type = s.type as SlideType;
    if (typeof type !== 'string' || !(type in FIELDS)) return err(at('type'), `${n} has the type "${String(s.type)}". Use one of: ${SLIDE_TYPE_LIST.join(', ')}.`);
    if (format === 'quote' && type !== 'quote') err(at('type'), `${n} is a "${type}" slide, but quote cards are made only of "quote" slides.`);
    for (const f of FIELDS[type]) {
      const v = s[f.key];
      const label = `${n} "${f.key}"`;
      if (v === undefined || v === null || v === '') {
        if (f.required) err(at(f.key), `${label} is missing. ${f.label} is required on a ${type} slide.`);
        continue;
      }
      if (f.kind === 'list') {
        if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && x.trim() !== '')) err(at(f.key), `${label} must be a list of text items, for example ["one", "two"].`);
        else {
          if (v.length < LIMITS.items[0] || v.length > LIMITS.items[1]) err(at(f.key), `${label} needs ${LIMITS.items[0]} to ${LIMITS.items[1]} items (it has ${v.length}).`);
          (v as string[]).forEach((x, j) => x.length > LIMITS.item && warn(at(`${f.key}[${j}]`), `${n} item ${j + 1} is ${x.length} characters; more than ${LIMITS.item} will shrink the text.`));
        }
      } else if (f.kind === 'number') {
        if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 99) err(at(f.key), `${label} must be a whole number from 1 to 99 (it is ${JSON.stringify(v)}).`);
      } else if (typeof v !== 'string') err(at(f.key), `${label} must be text (it is ${Array.isArray(v) ? 'a list' : typeof v}). Put it in quotes.`);
      else {
        const max = f.key === 'headline' || f.key === 'quote' ? LIMITS.headline * (f.key === 'quote' ? 1.6 : 1) : f.kind === 'area' ? LIMITS.body : 160;
        if (v.length > max) warn(at(f.key), `${n} "${f.key}" is ${v.length} characters. Over ${Math.round(max)} usually shrinks the text below phone size: shorten it.`);
      }
    }
    if (type === 'stat' && typeof s.value === 'string' && s.value.length > 8) warn(at('value'), `${n} number "${s.value}" is long. Big numbers are best at 8 characters or fewer (like 3x, 42%, 5 min); longer ones wrap onto two lines and fail the one-word-last-line check.`);
    const known = new Set(['type', 'element_tags', ...FIELDS[type].map((f) => f.key)]);
    for (const k of Object.keys(s)) if (!known.has(k)) warn(at(k), `${n} has "${k}", which a ${type} slide does not use. It is ignored.`);
    const hl = s.highlight;
    const src = (s.headline ?? s.quote) as unknown;
    if (typeof hl === 'string' && hl && typeof src === 'string' && !src.toLowerCase().includes(hl.toLowerCase())) warn(at('highlight'), `${n} highlights "${hl}", which is not in its ${s.headline !== undefined ? 'headline' : 'quote'}, so nothing will be marked.`);
    if (s.element_tags === undefined) warn(at('element_tags'), `${n} has no "element_tags", so pictures cannot follow what it says. Add 2 to 4 words, for example ["money", "growth"].`);
    else for (const m of checkElementTags(s.element_tags)) err(at('element_tags'), `${n}: ${m}`);
  });
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Untitled carousel';
  const handle = isObj(raw.brand) && typeof raw.brand.handle === 'string' && raw.brand.handle.trim() ? raw.brand.handle.trim() : '@yourname';
  const script = { id: typeof raw.id === 'string' && raw.id ? slug(raw.id) : slug(title), title, aspect: '4:5', brand: { handle }, slides: slides as SlideScript[] } as CarouselScript;
  return finish(issues, script);
}

/** Issues under one path prefix, for showing next to a field. */
export const issuesFor = (issues: Issue[], prefix: string) => issues.filter((i) => i.path === prefix || i.path.startsWith(prefix + '.') || i.path.startsWith(prefix + '['));

// ---- the prompt people copy into a Claude chat ----

export const EXAMPLE = {
  title: 'Short name of this carousel',
  brand: { handle: '@yourname' },
  slides: [
    { type: 'cover', kicker: 'Small line above', headline: 'The big promise in under ten words', sub: 'One line that makes people swipe.', highlight: 'big promise', element_tags: ['idea', 'launch'] },
    { type: 'step', number: 1, headline: 'First thing to do', body: 'One or two short sentences.', highlight: 'First', element_tags: ['write', 'time'] },
    { type: 'content', headline: 'A point worth making', body: 'One or two short sentences.', element_tags: ['people', 'message'] },
    { type: 'checklist', headline: 'Before you start', items: ['Short item', 'Short item', 'Short item'], element_tags: ['proof', 'target'] },
    { type: 'stat', kicker: 'Why it matters', value: '3x', label: 'what the number means, in one line', note: 'Source or "placeholder: use your own number"', element_tags: ['growth', 'money'] },
    { type: 'beforeafter', beforeLabel: 'Myth', before: 'What people believe.', afterLabel: 'Fact', after: 'What is true.', element_tags: ['warning', 'idea'] },
    { type: 'closing', headline: 'Save this for later', cta: 'Follow for more', element_tags: ['launch', 'love'] },
  ],
};
export const EXAMPLE_QUOTE = { title: 'Short name of this set', brand: { handle: '@yourname' }, slides: [{ type: 'quote', quote: 'One sentence worth remembering.', by: 'Who said it', highlight: 'worth remembering', element_tags: ['idea', 'write'] }] };

export function scriptPrompt(topic: string, format: Format): string {
  const t = topic.trim() || '(write your topic here)';
  const quote = format === 'quote';
  return [
    `Write the script for ${quote ? 'a set of quote cards' : 'a 7-slide Instagram/LinkedIn carousel'} about this topic:`,
    '',
    t,
    '',
    'Reply with ONE JSON object in a single code block, nothing else. It must follow this format exactly:',
    '',
    JSON.stringify(quote ? EXAMPLE_QUOTE : EXAMPLE, null, 2),
    '',
    'Rules:',
    quote ? '- 1 to 5 slides, every one of type "quote". Each quote is one sentence of at most 20 words.' : '- Exactly 7 slides. The first is "cover", the last is "closing". The slide types you can use are: cover, content, step, checklist, stat, beforeafter, quote, closing. Use each type only when it helps; you do not have to use them all.',
    '- Short copy. Headlines at most 8 words. Body at most 2 short sentences. Checklist items at most 10 words, 3 to 5 items.',
    '- One idea per slide. No filler slides.',
    '- Every slide has "element_tags": 2 to 4 single lower-case words for pictures that match what the slide says. Prefer these words: ' + VOCABULARY.join(', ') + '.',
    '- "highlight" is optional: 1 to 3 words copied exactly from the headline (or quote).',
    '- A "stat" slide needs a "value" such as "3x" or "42%". Do not invent figures. Use a number from the topic above; if there is none, leave the stat slide out, or put "placeholder: use your own number" in "note".',
    '- Plain, specific language. No hashtags, no emoji, no links.',
  ].join('\n');
}

// The writers (where a script comes from when the person presses Generate) are in writer.ts.

/** A small example so the editor can be tried without writing anything. */
export function exampleScript(format: Format): string {
  if (format === 'quote') {
    return JSON.stringify(
      {
        title: 'Three lines worth keeping',
        brand: { handle: '@yourname' },
        slides: [
          { type: 'quote', quote: 'Ship the small thing today and the big thing will follow.', by: 'Someone who did', highlight: 'small thing', element_tags: ['launch', 'idea'] },
          { type: 'quote', quote: 'Clear beats clever, every single time.', by: 'An editor', highlight: 'Clear', element_tags: ['write', 'target'] },
          { type: 'quote', quote: 'Good process is just kindness written down.', by: 'A manager', highlight: 'kindness', element_tags: ['people', 'love'] },
        ],
      },
      null,
      2,
    );
  }
  return JSON.stringify(
    {
      title: 'Fix your profile in 15 minutes',
      brand: { handle: '@yourname' },
      slides: [
        { type: 'cover', kicker: 'Profile, fixed', headline: 'Fix your profile in 15 minutes', sub: 'Three edits that make people stop scrolling and start replying.', highlight: '15 minutes', element_tags: ['profile', 'time'] },
        { type: 'step', number: 1, headline: 'Rewrite your headline', body: 'Skip the job title. Say who you help and how.', element_tags: ['profile', 'write'] },
        { type: 'step', number: 2, headline: 'Lead with a result', body: 'Open with one number or outcome, not a list of adjectives.', element_tags: ['growth', 'write'] },
        { type: 'step', number: 3, headline: 'Pin one proof post', body: 'Feature your best post at the top. People decide in seconds.', highlight: 'proof', element_tags: ['proof', 'search'] },
        { type: 'checklist', headline: 'Before you hit save', items: ['Clear, well-lit photo', 'Headline names who you help', 'Contact info is current'], highlight: 'save', element_tags: ['proof', 'profile'] },
        { type: 'stat', kicker: 'Why bother', value: '3x', label: 'more replies when your headline says who you help', note: 'Placeholder: use your own number', element_tags: ['growth', 'message'] },
        { type: 'closing', headline: 'Save this and fix it tonight', cta: 'Follow for weekly posts', highlight: 'tonight', element_tags: ['time', 'launch'] },
      ],
    },
    null,
    2,
  );
}
