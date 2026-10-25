// Smart element placement, the reviewable half: which element tags a slide asks for, how an element's tags link to them,
// the planner interface a real model call fills later, and patches that change a slide's tags.
// Nothing here calls a model. For now the tags are written by hand into the sample scripts (element_tags per slide).
import type { CarouselScript, SlideScript } from '../carousel/types';

/** Concepts a planner can name, and the element tags each one links to. A tag that is not a concept links only to itself. */
export const CONCEPTS: Record<string, string[]> = {
  money: ['money', 'coin', 'coins', 'cash', 'dollar', 'euro', 'wallet', 'bank', 'price', 'currency', 'payment', 'finances', 'bag', 'money-bag'],
  growth: ['growth', 'chart', 'chart-increasing', 'trending', 'trending-up', 'graph', 'increase', 'rocket', 'analytics', 'bar-chart', 'stats'],
  warning: ['warning', 'alert', 'caution', 'danger', 'siren', 'exclamation', 'hazard', 'stop'],
  idea: ['idea', 'lightbulb', 'light-bulb', 'bulb', 'brain', 'thinking', 'bright', 'thought'],
  time: ['time', 'clock', 'alarm', 'hourglass', 'timer', 'watch', 'stopwatch', 'calendar', 'schedule', 'deadline'],
  people: ['people', 'person', 'team', 'users', 'user', 'group', 'community', 'handshake', 'family', 'audience'],
  message: ['message', 'chat', 'speech', 'comment', 'email', 'mail', 'envelope', 'inbox', 'reply', 'conversation', 'send'],
  target: ['target', 'goal', 'bullseye', 'dart', 'flag', 'trophy', 'medal', 'aim', 'focus'],
  proof: ['check', 'tick', 'verified', 'approved', 'badge', 'award', 'certificate', 'trophy', 'medal', 'done', 'success', 'checkmark'],
  search: ['search', 'magnifier', 'magnifying', 'find', 'zoom', 'discover', 'explore'],
  trust: ['trust', 'handshake', 'shield', 'lock', 'secure', 'safe', 'heart', 'protect'],
  launch: ['rocket', 'launch', 'start', 'flag', 'takeoff'],
  write: ['pencil', 'pen', 'edit', 'write', 'note', 'notes', 'document', 'writing', 'newspaper', 'memo', 'notebook', 'book'],
  profile: ['profile', 'id', 'card', 'avatar', 'photo', 'camera', 'portrait', 'identification'],
  quality: ['star', 'gem', 'diamond', 'crown', 'award', 'trophy'],
  love: ['heart', 'love', 'like', 'thumbs-up'],
  speed: ['fast', 'speed', 'lightning', 'zap', 'bolt', 'high-voltage', 'fire'],
  remote: ['home', 'house', 'laptop', 'computer', 'remote', 'desk', 'office'],
  learn: ['book', 'school', 'graduation', 'learn', 'education', 'study', 'library'],
  question: ['question', 'help', 'ask', 'thinking-face'],
  work: ['work', 'briefcase', 'job', 'office', 'handshake', 'toolbox'],
};

/** The concept names, for the planner. */
export const VOCABULARY = Object.keys(CONCEPTS);

/** Tags of pure decoration. An element with only these says nothing about the copy, so it is never "unrelated". */
export const NEUTRAL_TAGS = new Set([
  'arrow', 'arrows', 'squiggle', 'doodle', 'burst', 'sparkle', 'plus', 'asterisk', 'tape', 'blob', 'halftone', 'grain', 'texture', 'brush', 'zigzag', 'loop', 'circle', 'underline', 'curve', 'line',
  'shape', 'organic', 'paper', 'label', 'torn-paper', 'dots', 'noise', 'stroke', 'highlight', 'mark', 'sticker', 'hand-drawn', 'tag', 'star', 'sphere', 'cube', 'ball', 'box', 'ui', '3d',
]);
const CONCEPT_TAGS = new Set(Object.values(CONCEPTS).flat());

/** What an element's tags need to contain, to be linked to a set of slide tags. */
export function expandTags(slideTags: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of slideTags.map((x) => x.toLowerCase())) {
    out.add(t);
    for (const e of CONCEPTS[t] ?? []) out.add(e);
  }
  return out;
}

/** 0 when the element's tags have no link to the slide's tags; otherwise how many of them link. */
export function linkScore(slideTags: string[], elementTags: string[]): number {
  const want = expandTags(slideTags);
  return new Set(elementTags.map((t) => t.toLowerCase()).filter((t) => want.has(t))).size;
}

/** An element "says something" if it is a picture of a thing (icon or object) or a code shape named after a concept. */
export function isMeaningful(el: { kind: 'icon' | 'object' | 'code'; tags: string[] }): boolean {
  return el.kind !== 'code' || el.tags.some((t) => CONCEPT_TAGS.has(t.toLowerCase()) && !NEUTRAL_TAGS.has(t.toLowerCase()));
}

/** Plain problems with a slide's element tags. Empty means fine. */
export function checkElementTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return ['element_tags must be a list of 2 to 4 words.'];
  const r: string[] = [];
  if (tags.length < 2 || tags.length > 4) r.push(`element_tags must have 2 to 4 tags (it has ${tags.length}).`);
  for (const t of tags) if (typeof t !== 'string' || !/^[a-z][a-z0-9-]{1,23}$/.test(t)) r.push(`"${String(t)}" is not a tag: use one lower-case word (letters, digits or "-").`);
  if (new Set(tags).size !== tags.length) r.push('element_tags repeats a tag.');
  return r;
}

// ---- the planner interface (a real model call fills this later) ----

export interface SlideBrief {
  /** 1-based. */
  index: number;
  count: number;
  type: SlideScript['type'];
  /** What the slide is for, in words: "hook", "step", "proof number", "call to action"... */
  role: string;
  /** Every word on the slide, in reading order. */
  copy: string;
  /** The concept names that link to library elements. A planner may also use any other single word. */
  vocabulary: string[];
}
export interface ElementPlanner {
  name: string;
  /** 2 to 4 tags for one slide. */
  pickTags(brief: SlideBrief): string[] | Promise<string[]>;
}

const ROLE: Record<SlideScript['type'], string> = {
  cover: 'hook', content: 'point', step: 'step', stat: 'proof number', checklist: 'checklist', beforeafter: 'myth versus fact', quote: 'quote', closing: 'call to action',
};
const words = (s: SlideScript): string[] => {
  const a = s as unknown as Record<string, unknown>;
  return Object.entries(a)
    .filter(([k]) => k !== 'type' && k !== 'element_tags' && k !== 'number' && k !== 'highlight')
    .flatMap(([, v]) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []));
};
export function briefOf(slide: SlideScript, index: number, count: number): SlideBrief {
  return { index: index + 1, count, type: slide.type, role: ROLE[slide.type], copy: words(slide).join(' / '), vocabulary: VOCABULARY };
}

/** The text a real model would be given for one slide. Not sent anywhere in this repository. */
export function plannerPrompt(b: SlideBrief): string {
  return [
    `Slide ${b.index} of ${b.count}. Role: ${b.role}.`,
    `Copy: ${b.copy}`,
    `Pick 2 to 4 tags for pictures that match what this slide says (not decoration). Prefer these words: ${b.vocabulary.join(', ')}. Another single lower-case word is allowed.`,
    'Answer with a JSON list of tags, for example ["money", "growth"].',
  ].join('\n');
}

/** Reads the tags written into the script by hand (element_tags). Stands in for a model call. */
export const scriptPlanner: ElementPlanner = {
  name: 'tags written into the script',
  pickTags() {
    throw new Error('scriptPlanner reads element_tags straight from the script; use planTags(script, scriptPlanner).');
  },
};

/** Asks a planner for every slide's tags and checks them. With `scriptPlanner`, returns what the script already says. */
export async function planTags(script: Pick<CarouselScript, 'slides'>, planner: ElementPlanner): Promise<string[][]> {
  const out: string[][] = [];
  for (let i = 0; i < script.slides.length; i++) {
    const s = script.slides[i];
    const tags = planner === scriptPlanner ? (s.element_tags ?? []) : await planner.pickTags(briefOf(s, i, script.slides.length));
    const bad = checkElementTags(tags);
    if (bad.length) throw new Error(`Slide ${i + 1}: ${bad.join(' ')}`);
    out.push(tags.map((t) => t.toLowerCase()));
  }
  return out;
}

// ---- patches that change a slide's tags (reviewable, with undo) ----

export interface TagPatch {
  label: string;
  /** Each change replaces one slide's tags. `slide` is 1-based. */
  changes: { slide: number; tags: string[] }[];
}
export type TagPatchResult<T> = { ok: true; script: T; inverse: TagPatch } | { ok: false; reasons: string[] };

/** Applies a tag patch to a script without changing the original. Returns the inverse patch, so undo is another patch. */
export function applyTagPatch<T extends Pick<CarouselScript, 'slides'>>(script: T, patch: TagPatch): TagPatchResult<T> {
  const reasons: string[] = [];
  if (!patch || typeof patch.label !== 'string' || patch.label.trim() === '') reasons.push('The change needs a short name, for example "Money, not rocket".');
  if (!patch || !Array.isArray(patch.changes) || patch.changes.length === 0) reasons.push('The change does not contain any steps.');
  if (reasons.length) return { ok: false, reasons };
  const next = structuredClone(script);
  const inverse: TagPatch = { label: `Undo: ${patch.label}`, changes: [] };
  patch.changes.forEach((c, n) => {
    const step = `Step ${n + 1}`;
    if (!Number.isInteger(c.slide) || c.slide < 1 || c.slide > next.slides.length) return void reasons.push(`${step}: there is no slide ${String(c.slide)} (the script has ${next.slides.length}).`);
    // An empty list takes the tags off the slide (that is also how undo restores a slide that had none).
    if (!Array.isArray(c.tags) || c.tags.length > 0) for (const p of checkElementTags(c.tags)) reasons.push(`${step}: ${p}`);
    inverse.changes.unshift({ slide: c.slide, tags: [...(next.slides[c.slide - 1].element_tags ?? [])] });
    if (Array.isArray(c.tags) && c.tags.length === 0) delete next.slides[c.slide - 1].element_tags;
    else if (Array.isArray(c.tags)) next.slides[c.slide - 1].element_tags = c.tags.map((t) => String(t).toLowerCase());
  });
  return reasons.length ? { ok: false, reasons } : { ok: true, script: next, inverse };
}
