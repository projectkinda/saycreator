// The chrome drawn by the code at fixed places on every slide: profile header (avatar about 72 px, name with a tick, handle) or a small handle, page counter, swipe cue.
// A style's devices (reference/deco.ts) change it: a page index at the top right, a three-part header row, a brand footer row, a contact block on the last slide.
// Colours are the field's roles ($fText ...), so the chrome keeps its contrast whichever surface carries the headline. All text is at least 32 px.
import { measureWidth } from '../../image-engine/draw/text';
import type { FontFamily } from '../../image-engine/types';
import type { Deco } from '../../reference/deco';
import { profileName, titleCaseName, type Recurring } from '../designed';
import { brandOf, siteText } from './devices';

/** The text cut with an ellipsis so it is at most maxW wide at the given size. */
function cut(text: string, font: FontFamily, size: number, weight: number, maxW: number): string {
  if (measureWidth(text, font, weight, size) <= maxW) return text;
  let t = text;
  while (t.length > 3 && measureWidth(t + '…', font, weight, size) > maxW) t = t.slice(0, -1);
  return t.replace(/[.\s_-]+$/, '') + '…';
}
const GAP = 40;

export function chromeFor(o: { handle: string; name?: string; index: number; total: number; profile: boolean; font: FontFamily; deco?: Deco; /** The website set in the profile / brand settings; none set: no website line. */ site?: string }): Recurring[] {
  const base = { size: 36, font: '', weight: 500, fill: '$fMuted' };
  const out: Recurring[] = [];
  const handle = o.handle || '@yourname';
  const d = o.deco ?? {};
  const last = o.index === o.total - 1;
  const small = { ...base, size: 36 };
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
    // handle | page | site: the page counter stays in the middle; a long handle is cut with an ellipsis, and the site (the least important) is left out when it would crowd the counter
    const page = o.index + 1 + ' / ' + o.total;
    const pageW = measureWidth(page, o.font, 500, 36);
    const hText = cut(handle, o.font, 36, 500, 540 - pageW / 2 - GAP - 48);
    out.push({ ...small, x: 48, y: 92, anchor: 'start', text: hText });
    out.push({ ...small, x: 540, y: 92, anchor: 'middle', text: page });
    const site = siteText(o.site);
    if (site && measureWidth(site, o.font, 500, 36) <= 1032 - (540 + pageW / 2 + GAP)) out.push({ ...small, x: 1032, y: 92, anchor: 'end', text: site });
  } else if (!foot) out.push({ ...base, x: 48, y: 92, anchor: 'start', text: handle });
  if (d.pageIndex && !row) out.push({ ...small, x: 1032, y: 92, anchor: 'end', text: String(o.index + 1).padStart(2, '0') });
  if (foot && d.contactClosing && last) {
    out.push({ ...small, x: 110, y: 1236, anchor: 'start', text: handle });
    if (siteText(o.site)) out.push({ ...small, x: 110, y: 1288, anchor: 'start', text: siteText(o.site) });
    out.push({ ...small, weight: 600, fill: '$fText', x: 1032, y: 1288, anchor: 'end', text: brandOf(handle) });
  } else if (foot) {
    // handle | site | brand: the brand (right) and the handle (left) stay; a long handle is cut with an ellipsis; the site in the middle moves into the free gap or, when it does not fit, is left out
    const brand = cut(brandOf(handle), o.font, 36, 600, 300);
    const brandW = measureWidth(brand, o.font, 600, 36);
    // the footer logo (a star) sits left of the brand: 24 px gap and 32 px wide, as devices.ts draws it
    const brandZone = Math.max(brandW, brand.length * 36 * 0.58) + 24 + 32;
    const hText = cut(handle, o.font, 36, 500, 1032 - 48 - brandZone - 2 * GAP - 120);
    const hW = measureWidth(hText, o.font, 500, 36);
    out.push({ ...small, x: 48, y: 1288, anchor: 'start', text: hText });
    out.push({ ...small, weight: 600, fill: '$fText', x: 1032, y: 1288, anchor: 'end', text: brand });
    const site = siteText(o.site);
    const siteW = site ? measureWidth(site, o.font, 500, 36) : 0;
    const free0 = 48 + hW + GAP, free1 = 1032 - brandZone - GAP;
    if (site && siteW <= free1 - free0) out.push({ ...small, x: Math.round(Math.min(Math.max(540, free0 + siteW / 2), free1 - siteW / 2)), y: 1288, anchor: 'middle', text: site });
  } else {
    if (!d.pageIndex && !row) out.push({ ...base, x: 48, y: 1288, anchor: 'start', text: o.index + 1 + ' / ' + o.total });
    if (o.index < o.total - 1) out.push({ ...base, x: 1032, y: 1288, anchor: 'end', text: 'swipe →' });
  }
  return out;
}

/** The avatar picture (an optional data: URL or image link), clipped to the avatar circle and drawn over the placeholder. */
export const avatarMarkup = (url: string): string =>
  `<defs><clipPath id="avatarclip"><circle cx="84" cy="96" r="36"/></clipPath></defs><image href="${url.replace(/"/g, '&quot;')}" x="48" y="60" width="72" height="72" clip-path="url(#avatarclip)" preserveAspectRatio="xMidYMid slice"/>`;
