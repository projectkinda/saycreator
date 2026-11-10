// The closing call to action, read from the SOURCE text: what the person actually asks the reader to do ("Comment "brain" and I'll send you the document"), a short button label built from the
// action's own words, and the rule that a sub line may only use words that are in the source. Pure functions, no model call, no drawing.

/** The longest button label the closing layout takes (its own field limit). */
export const ACTION_LABEL_MAX = 24;

const PAD = new Set(['a', 'an', 'the', 'to', 'of', 'and', 'or', 'for', 'in', 'on', 'at', 'is', 'are', 'was', 'be', 'it', 'its', 'this', 'that', 'these', 'those', 'with', 'you', 'your', 'my', 'me', 'our', 'we', 'us', 'i', 'from', 'by', 'as', 'so', 'if', 'then', 'not', 'no', 'do', 'will', 'can', 'now', 'here', 'below', 'today', 'post']);
/** Words that may stand in a button label or a sub line without being in the text (small function words): they carry no offer, link or number. */
export const isFunctionWord = (w: string): boolean => PAD.has(w);

/** Lower-case word forms for comparing a line with the text: no apostrophes, a plural "s" dropped. */
export function wordsOf(t: string): string[] {
  return (t.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) ?? []).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** Every word of the line is in the source text (or is a small function word). An empty line is fine. */
export function inSource(line: string, source: string): boolean {
  const have = new Set(wordsOf(source));
  return wordsOf(line).every((w) => PAD.has(w) || have.has(w));
}

const STOP = new Set(['below', 'now', 'here', 'on', 'and', 'if', 'to', 'your', 'a', 'the', 'with', 'in', 'this', 'me', 'us', 'down', 'what', 'how', 'why', 'which', 'who', 'when', 'any', 'all', 'anything', 'something', 'about', 'whether', 'for', 'at', 'or', 'then', 'so', 'it', 'that', 'my', 'our', 'out', 'back', 'later', 'too', 'also', 'more', 'one', 'two', 'anytime', 'today', 'directly', 'please', 'first', 'soon', 'again', 'instead', 'but', 'because', 'when', 'once', 'i']);
const Q = '["“‘\']';
const Q2 = '["”’\']';
const clean = (s: string) => s.replace(/^["“‘']+|["”’']+$/g, '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A keyword the person asks for: quoted, or in capitals, or (for comment) a plain word that is not a filler. */
function keywordAfter(rest: string, loose: boolean): string | null {
  const m = new RegExp(`^[\\s:,-]*(?:(?:the\\s+)?(?:word|keyword)\\s+|with\\s+)?(?:${Q}([A-Za-z][\\w-]{1,19})${Q2}|([A-Z][A-Z0-9-]{1,19})\\b|([A-Za-z][\\w-]{1,19})\\b)`).exec(rest);
  if (!m) return null;
  const quoted = m[1];
  const caps = m[2];
  const plain = m[3];
  if (quoted) return clean(quoted);
  if (caps && !STOP.has(caps.toLowerCase())) return caps;
  if (loose && plain && !STOP.has(plain.toLowerCase())) return plain;
  return null;
}

interface Found { label: string; at: number }
const ok = (label: string) => label.length <= ACTION_LABEL_MAX && label.split(/\s+/).length <= 4;
const DELIVERABLE = '(?:guide|checklist|template|templates|document|doc|ebook|e-book|playbook|cheat ?sheet|list|pdf|course|kit|report|toolkit|workbook|plan|script|swipe file|cheatsheet|notes)';

/** The last call to action the text asks for, as a short button label built from its own words (at most 24 characters), or null when the text asks for none. */
export function sourceAction(raw: string): { label: string } | null {
  // line breaks inside a sentence do not matter ("comment brain,\n\nand I'll send you ...")
  const text = raw.replace(/\s+/g, ' ').trim();
  // a call to action lives in the last few sentences: the unclear forms (follow, save, share, a plain keyword ...) count only there; the unmistakable ones (DM me, link in bio, sign up, book a call ...) count anywhere
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [text];
  const tailStart = text.length - sentences.slice(-3).join('').length;
  const found: Found[] = [];
  const add = (index: number, label: string) => { if (label && ok(label)) found.push({ label, at: index }); };
  let m: RegExpExecArray | null;
  // an action is something the person asks the reader to do: it opens a sentence or follows "please", "and", "then" ... ("his comment" is not a call to action)
  // ("if you want to build your own, comment brain": the clause before the comma is the condition, the action follows it)
  const imperative = (i: number) => {
    const before = text.slice(Math.max(0, i - 14), i);
    if (/(?:^|[.!?:;"“(]\s*|\b(?:please|just|and|then|or|also|now|to|simply|so|you can|you should|you could|feel free to)\s+)$/i.test(before)) return true;
    if (!/,\s*$/.test(before)) return false;
    const sentenceStart = Math.max(text.lastIndexOf('. ', i), text.lastIndexOf('! ', i), text.lastIndexOf('? ', i)) + 1;
    return /\b(?:if|when|want|wanna|ready|interested|like)\b/i.test(text.slice(sentenceStart, i));
  };
  // strong = unmistakable wherever it stands; the others count only in the last sentences
  const each = (re: RegExp, fn: (m: RegExpExecArray) => void, free = false, strong = false) => { re.lastIndex = 0; while ((m = re.exec(text))) if ((strong || m.index >= tailStart) && (free || imperative(m.index))) fn(m); };
  // "comment brain", "comment brain,", "comment the word brain", "comment BRAIN below", "comment "brain"": the keyword follows (a plain word is fine in the last sentences)
  each(/\bcomment\b/gi, (x) => {
    const rest = text.slice(x.index + x[0].length);
    const kw = keywordAfter(rest, true);
    // a quoted or capitalised keyword is unmistakable anywhere; a plain word, or no keyword, only in the last sentences
    const marked = kw ? keywordAfter(rest, false) !== null : false;
    if (x.index < tailStart && !marked) return;
    if (kw) return add(x.index, `Comment ${kw}`);
    add(x.index, 'Comment below');
  }, false, true);
  // "drop brain in the comments", "type brain and I will send it": a keyword to write, in the last sentences
  each(/\b(drop|type)\s+(?:the\s+(?:word|keyword)\s+)?(?:["“‘']([A-Za-z][\w-]{1,19})["”’']|([A-Za-z][\w-]{1,19}))(?=\s*(?:,|\.|!|and\b|in\b|below\b|$))/gi, (x) => {
    const kw = x[2] ?? x[3];
    if (STOP.has(kw.toLowerCase()) || /^(?:me|it|us|them|this|that|him|her)$/i.test(kw)) return;
    add(x.index, `${cap(x[1].toLowerCase())} ${kw}`);
  });
  each(/\b(?:dm|message)\s+me\b/gi, (x) => {
    const kw = keywordAfter(text.slice(x.index + x[0].length), true);
    add(x.index, kw ? `DM me ${kw}` : 'DM me');
  }, true, true);
  each(/\breply\b/gi, (x) => {
    const kw = keywordAfter(text.slice(x.index + x[0].length), false);
    add(x.index, kw ? `Reply ${kw}` : 'Reply to me');
  });
  each(/\bsend me\b/gi, (x) => add(x.index, 'Message me'), true);
  each(/\blink in (?:my )?bio\b/gi, (x) => add(x.index, 'Tap link in bio'), true, true);
  each(/\blink (?:is )?below\b|\blink in the (?:comments|description)\b/gi, (x) => add(x.index, /below/i.test(x[0]) ? 'Tap the link below' : 'Tap the link'), true, true);
  each(/\bsign ?up\b/gi, (x) => add(x.index, 'Sign up now'), false, true);
  each(/\bsubscribe\b/gi, (x) => add(x.index, 'Subscribe now'), false, true);
  each(/\bfollow\s+(@[\w.]{2,30}|me\b|us\b|along\b|for\b|my\b)/gi, (x) => add(x.index, /^@/.test(x[1]) ? `Follow ${x[1]}` : /^for$/i.test(x[1]) ? 'Follow for more' : /^us$/i.test(x[1]) ? 'Follow us' : 'Follow me'));
  each(/\bsave (?:this|it)\b/gi, (x) => add(x.index, 'Save this post'));
  each(/\bshare (?:this|it)\b/gi, (x) => add(x.index, 'Share this post'));
  each(new RegExp(`\\bdownload\\s+(?:the|my|our|your|a|this)\\s+(${DELIVERABLE})\\b`, 'gi'), (x) => add(x.index, `Download the ${x[1].toLowerCase()}`), false, true);
  each(/\bdownload\b(?!\s+(?:the|my|our|your|a|this)\s+\w)/gi, (x) => add(x.index, 'Download now'));
  each(/\bbook\s+(a|an|your|the)\s+([a-z]+(?:\s+[a-z]+)?)/gi, (x) => {
    const two = x[2].split(/\s+/);
    const noun = two.length === 2 && /^(?:free|quick|short|strategy|discovery|demo|intro)$/i.test(two[0]) ? x[2] : two[0];
    add(x.index, `Book ${x[1].toLowerCase()} ${noun.toLowerCase()}`);
  }, false, true);
  each(/\bjoin\s+(us\b|(?:the|my|our)\s+[a-z]+)/gi, (x) => add(x.index, `Join ${x[1].toLowerCase()}`));
  each(/\bclick\s+(?:the\s+)?(link|button|here)\b/gi, (x) => add(x.index, x[1].toLowerCase() === 'here' ? 'Click here' : `Click the ${x[1].toLowerCase()}`));
  each(/\btap\s+(?:the\s+)?(link|button|here)\b/gi, (x) => add(x.index, x[1].toLowerCase() === 'here' ? 'Tap here' : `Tap the ${x[1].toLowerCase()}`));
  each(/\bvisit\s+((?:https?:\/\/|www\.)?[a-z0-9-]+\.[a-z]{2,}[^\s]*)/gi, (x) => add(x.index, `Visit ${x[1].replace(/[.,;:!?)]+$/, '')}`), false, true);
  each(/\btry (?:it|this)\b(\s+(?:for )?free)?/gi, (x) => add(x.index, x[1] ? 'Try it free' : 'Try it now'));
  each(new RegExp(`\\bget\\s+(?:the|my|our|your|a)\\s+(${DELIVERABLE})\\b`, 'gi'), (x) => add(x.index, `Get the ${x[1].toLowerCase()}`), false, true);
  if (!found.length) return null;
  found.sort((a, b) => a.at - b.at);
  return { label: found[found.length - 1].label };
}

/** Whether the text asks the reader to do something (a phrase action; contact details and links are checked by the caller). */
export const hasPhraseAction = (text: string): boolean => sourceAction(text) !== null;

/** A button label that is a real action from the source: its words are in the text (or small function words). */
export const labelFromSource = (label: string, source: string): boolean => !!label.trim() && inSource(label, source);

export { cap as capitalise };

const ACTION_START = new Set(['comment', 'dm', 'message', 'reply', 'type', 'drop', 'follow', 'save', 'share', 'download', 'book', 'join', 'sign', 'subscribe', 'click', 'tap', 'visit', 'try', 'get', 'send', 'grab', 'tag']);
/**
 * A closing button the writer took straight from the source: an action verb first, and its words stand in the text in that order ("Comment brain" for "... comment brain, and I'll send you ...").
 * Such a closing is faithful to the source and is never overridden.
 */
export function labelIsSourcePhrase(label: string, source: string): boolean {
  const w = wordsOf(label);
  if (w.length < 2 || w.length > 4 || !ACTION_START.has(w[0])) return false;
  const s = wordsOf(source);
  for (let i = 0; i + w.length <= s.length; i++) if (w.every((x, k) => s[i + k] === x)) return true;
  return false;
}
