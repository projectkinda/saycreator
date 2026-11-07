// The chrome drawn by the code at fixed places on every slide: profile header (avatar about 72 px, name with a tick, handle) or a small handle, page counter, swipe cue.
// A style's devices (reference/deco.ts) change it: a page index at the top right, a three-part header row, a brand footer row, a contact block on the last slide.
// Colours are the field's roles ($fText ...), so the chrome keeps its contrast whichever surface carries the headline. All text is at least 32 px.
import { measureWidth } from '../../image-engine/draw/text';
import type { FontFamily } from '../../image-engine/types';
import type { Deco } from '../../reference/deco';
import { profileName, titleCaseName, type Recurring } from '../designed';
import { brandOf, siteOf } from './devices';

export function chromeFor(o: { handle: string; name?: string; index: number; total: number; profile: boolean; font: FontFamily; deco?: Deco }): Recurring[] {
  const base = { size: 36, font: '', weight: 500, fill: '$fMuted' };
  const out: Recurring[] = [];
  const handle = o.handle || '@yourname';
  const d = o.deco ?? {};
  const last = o.index === o.total - 1;
  const small = { ...base, size: 34 };
  const row = !!d.headerRow;
  const foot = !!d.footerRow || (!!d.contactClosing && last);
  if (o.profile) {
    const name = o.name ? titleCaseName(o.name) : profileName(handle);
    const nameW = measureWidth(name, o.font, 700, 40);
    out.push({ ...base, shape: 'avatar', x: 84, y: 96, size: 36, fill: '$fMuted', anchor: 'start', text: '' });
    out.push({ ...base, x: 140, y: 92, size: 40, weight: 700, fill: '$fText', anchor: 'start', text: name });
    out.push({ ...base, shape: 'tick', x: Math.round(140 + nameW + 24), y: 78, size: 13, fill: '$fAccent', anchor: 'start', text: '' });
    out.push({ ...base, x: 140, y: 139, anchor: 'start', text: handle });
  } else if (row) {
    out.push({ ...small, x: 48, y: 92, anchor: 'start', text: handle });
    out.push({ ...small, x: 540, y: 92, anchor: 'middle', text: o.index + 1 + ' / ' + o.total });
    out.push({ ...small, x: 1032, y: 92, anchor: 'end', text: siteOf(handle) });
  } else if (!foot) out.push({ ...base, x: 48, y: 92, anchor: 'start', text: handle });
  if (d.pageIndex && !row) out.push({ ...small, x: 1032, y: 92, anchor: 'end', text: String(o.index + 1).padStart(2, '0') });
  if (foot && d.contactClosing && last) {
    out.push({ ...small, x: 110, y: 1236, anchor: 'start', text: handle });
    out.push({ ...small, x: 110, y: 1288, anchor: 'start', text: siteOf(handle) });
    out.push({ ...small, weight: 600, fill: '$fText', x: 1032, y: 1288, anchor: 'end', text: brandOf(handle) });
  } else if (foot) {
    out.push({ ...small, x: 48, y: 1288, anchor: 'start', text: handle });
    out.push({ ...small, x: 540, y: 1288, anchor: 'middle', text: siteOf(handle) });
    out.push({ ...small, weight: 600, fill: '$fText', x: 1032, y: 1288, anchor: 'end', text: brandOf(handle) });
  } else {
    if (!d.pageIndex && !row) out.push({ ...base, x: 48, y: 1288, anchor: 'start', text: o.index + 1 + ' / ' + o.total });
    if (o.index < o.total - 1) out.push({ ...base, x: 1032, y: 1288, anchor: 'end', text: 'swipe →' });
  }
  return out;
}

/** The avatar picture (an optional data: URL or image link), clipped to the avatar circle and drawn over the placeholder. */
export const avatarMarkup = (url: string): string =>
  `<defs><clipPath id="avatarclip"><circle cx="84" cy="96" r="36"/></clipPath></defs><image href="${url.replace(/"/g, '&quot;')}" x="48" y="60" width="72" height="72" clip-path="url(#avatarclip)" preserveAspectRatio="xMidYMid slice"/>`;
