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
