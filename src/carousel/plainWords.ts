// Round 18: the person never reads a layout id ("phone-frame", "split-half", "title-over-photo"...). Ids stay in report.json; any message shown on the page goes through plainWords().
import { LAYOUT_IDS, layoutDef } from './layouts';

/** A layout, as a short phrase a person would say. Layouts not listed use their own label in lower case. */
const NAMES: Record<string, string> = {
  'phone-frame': 'a phone shape',
  'split-half': 'a split of picture and text',
  'title-over-photo': 'a headline over a picture',
  'photo-full-caption': 'a big picture with a caption panel',
  'photo-cover': 'a picture with a statement on it',
  'cover-art': 'a statement beside a picture',
  'headline-body-image': 'a text with a picture',
  'art-side-text': 'a picture beside the text',
  'list-beside-picture': 'a list beside a picture',
  'list-under-band': 'a list under a picture',
  'image-row': 'a row of pictures',
  'thumb-rows': 'a list with small pictures',
  'twin-photos': 'two pictures',
  'photo-grid': 'a grid of pictures',
  'do-dont': 'a do and do-not pair',
  'portrait-closing': 'a closing with a person',
};
const ids = [...(LAYOUT_IDS as string[])].sort((a, b) => b.length - a.length);
const nameOf = (id: string): string => NAMES[id] ?? (layoutDef(id as never)?.label ?? id.replace(/-/g, ' ')).toLowerCase();

/** The text with every layout id replaced by plain words ("phone-frame" -> "a phone shape"); a quoted id loses its quotes. */
export function plainWords(text: string): string {
  let out = text;
  for (const id of ids) {
    if (!out.includes(id)) continue;
    const esc = id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    out = out.replace(new RegExp(`["“']?(?<![\\w-])${esc}(?![\\w-])["”']?`, 'g'), nameOf(id));
  }
  return out;
}

/**
 * Round F: the line the person reads when the style's flavour moved some slides to other layouts. Slide numbers and the style's name, no layout id and no layout name:
 * "Slides 1 and 5 were laid out differently to fit Warm editorial collage."
 */
export function flavourLine(slides: number[], styleTitle?: string): string {
  const n = [...new Set(slides)].sort((a, b) => a - b);
  const list = n.length <= 1 ? String(n[0] ?? '') : n.length === 2 ? `${n[0]} and ${n[1]}` : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  return `${n.length === 1 ? 'Slide' : 'Slides'} ${list} ${n.length === 1 ? 'was' : 'were'} laid out differently to fit ${styleTitle?.trim() || 'this look'}. Undo takes back the whole carousel.`;
}

// ----- Round AL part 1: field ids and engine words in plain language (the Edit slides view). UI only: the writer prompt, LAYOUT_IDS and the menu never read these. -----

/** A plain name for a layout field, as the Text tab labels it ("Headline", "Line below", "Number" ...). */
export function fieldLabel(name: string, list: boolean): string {
  if (list) return /items|steps|bullets|callouts/i.test(name) ? 'List (one item per line)' : `${humanize(name)} (one per line)`;
  if (/^(kicker|lead|tag|leftLabel|rightLabel|label)$/i.test(name)) return 'Small line';
  if (/^(headline|title|question|heading|subject|quote|statement)$/i.test(name)) return 'Headline';
  if (/^(caption|line|line2|subtitle|sub|subline|intro|note|source|author)$/i.test(name)) return 'Line below';
  if (/^(body|paragraph|p\d|pull|card|closing|leftText|rightText|wrong|right)$/i.test(name)) return /^p\d$/i.test(name) ? `Paragraph ${name.slice(1)}` : name === 'pull' ? 'Pull line' : 'Text';
  if (/^button\d?$/i.test(name)) return 'Button label';
  if (/^(number|numeral|step|num)$/i.test(name)) return 'Number';
  return humanize(name);
}
const humanize = (n: string) => n.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** The field as part of a sentence: "a headline", "a small line above the headline", "a list" ... */
export function fieldPhrase(layout: string, name: string): string {
  const list = !!layoutDef(layout)?.fields.find((f) => f.name === name)?.list;
  if (list) return /^(numbers)$/i.test(name) ? 'numbers' : /^(labels)$/i.test(name) ? 'labels for the items' : /^(cardLines)$/i.test(name) ? 'a line for each card' : 'a list';
  const l = fieldLabel(name, false);
  if (l === 'Small line') return 'a small line above the headline';
  if (l === 'Headline') return name === 'question' ? 'a question' : name === 'quote' ? 'a quote' : 'a headline';
  if (l === 'Line below') return name === 'author' ? 'an author' : 'a line below the headline';
  if (l === 'Text') return 'a paragraph';
  if (l === 'Button label') return 'a button';
  if (l === 'Number') return 'a number';
  if (/^Paragraph/.test(l) || l === 'Pull line') return 'a paragraph';
  return 'a ' + l.toLowerCase();
}
/** The field as the subject of a sentence: "The headline", "The small line" ... */
const fieldSubject = (layout: string, name: string): string => {
  const p = fieldPhrase(layout, name);
  return p.replace(/^(a|an) /, 'The ').replace(/^numbers$/, 'The numbers').replace(/^labels/, 'The labels').replace(/^The small line above the headline$/, 'The small line');
};

/** A slide check message of validateSlideContent ('split-half: "body" is 80 characters; the most is 60. Shorten it.') in plain words: no layout id, no field id. */
export function plainProblem(msg: string, layout0?: string): string {
  const m0 = /^([\w-]+): (.*)$/.exec(msg);
  const layout = layout0 ?? (m0 && layoutDef(m0[1]) ? m0[1] : '');
  const s = m0 && layoutDef(m0[1]) ? m0[2] : msg;
  let m: RegExpExecArray | null;
  if ((m = /^"(\w+)" is (\d+) characters; the most is (\d+)/.exec(s))) return `${fieldSubject(layout, m[1])} is ${m[2]} letters long; this layout holds ${m[3]}.`;
  if ((m = /^"(\w+)" item (\d+) is (\d+) characters; the most is (\d+)/.exec(s))) return `Item ${m[2]} of the list is ${m[3]} letters long; this layout holds ${m[4]}.`;
  if ((m = /^"(\w+)" has (\d+) words; the most is (\d+)/.exec(s))) return `${fieldSubject(layout, m[1])} has ${m[2]} words; this layout holds ${m[3]}.`;
  if ((m = /^"(\w+)" needs (\d+) to (\d+) items \(got (\d+)\)/.exec(s))) return `The list has ${m[4]} ${m[4] === '1' ? 'item' : 'items'}; this layout takes ${m[2]} to ${m[3]}.`;
  if ((m = /^"(\w+)" is required/.exec(s))) return `Needs ${fieldPhrase(layout, m[1])}, which this slide does not have.`;
  if ((m = /^"step" must be a number from 1 to 9/.exec(s))) return 'The number must be a single digit from 1 to 9.';
  if ((m = /^"(\w+)" must be a whole number from 0 to 100/.exec(s))) return `${fieldSubject(layout, m[1])} must be a whole number from 0 to 100.`;
  if ((m = /^"accent" takes at most 3 phrases/.exec(s))) return 'At most 3 highlighted phrases.';
  // anything else: keep the sentence, drop quoted field ids
  return s.replace(/"(\w+)"/g, (_, k: string) => (layout ? fieldPhrase(layout, k) : 'a text'));
}


/** The colour block shapes (the "cut" of a slide, called "plane" before Round AL). */
export const BLOCK_LABEL: Record<string, string> = { plain: 'No block', 'edge-h': 'Block at the bottom', 'edge-v': 'Block at the side', angle: 'Angled block', curve: 'Curved block' };


/** A variant's name as the tile shows it: the engine word "kicker" is the small line above the headline. */
export const plainVariant = (v: string): string => v.replace(/\bkicker\b/gi, 'small line');
