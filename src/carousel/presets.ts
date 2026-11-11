// The built-in "Pick a style" presets as library styles. A preset is a stored style (style.json); the layout library draws it from a pack made by packFromStyle (the first of
// each rhythm's grounds, the closing ground, case, weights, gradient and flavour from the style's "library" block) plus the marker or underline the preset's shape asks for.
// Nothing here reads the saved reference cache or the active reference: a preset is its own source. The person's toggles for a preset are kept under "preset:<name>".
import { isUserStyle } from '../reference/templates';
import { withOverrides } from '../reference/overrides';
import { packFromStyle, type StylePack } from '../reference/pack';
import { drawOne, styleFromPack, templateRoute } from './designLibrary';
import { coverKeyOf, flavourPass } from './flavour';
import { styleByName } from './render';

export const presetKey = (name: string) => 'preset:' + name;

/** The library pack of a built-in preset, or null when the name is a saved reference template, the active reference, unknown, or the template route flag is on. */
export function presetPackFor(name: string, withSaved = true): StylePack | null {
  if (!name || name === 'mine-reference-active' || name.startsWith('mine-') || templateRoute() || isUserStyle(name)) return null;
  const st = styleByName(name);
  if (!st) return null;
  const base = packFromStyle(st.spec);
  const marker = st.spec.shape.marker;
  const pack: StylePack = { ...base, devices: { marker: marker === 'box', underline: marker === 'underline', profileHeader: !!st.spec.library?.devices?.profileHeader, slides: 1, counts: { marker: 0, profileHeader: 0, underline: 0 } } };
  return withSaved ? withOverrides(pack, presetKey(name)) : { ...pack, readKey: presetKey(name) };
}

/** The cover of a built-in preset drawn by the layout library (the route the deck itself uses), as an SVG; null for a style that is not a built-in preset. No model call. */
export async function presetThumbSvg(name: string): Promise<string | null> {
  const pack = presetPackFor(name, false);
  if (!pack) return null;
  const { style } = styleFromPack(pack);
  // the cover the style gives a deck of this sample (the same rule as a real deck: one of the style's own covers, chosen from the deck and the style name), so the cards no longer all show the same cover
  // the sample the signature cover can show: the word cover has no kicker and no caption, the stacked cover a headline of 2 to 4 words
  const sig = pack.look?.coverLayouts?.signature;
  const fields: Record<string, string> = sig === 'cover-word' ? { headline: 'Make people stop' } : sig === 'lead-statement' ? { kicker: 'Example', headline: 'A headline that makes people stop' } : sig === 'statement-stacked' ? { headline: 'Make people stop', caption: 'And a line that makes them swipe.' } : { kicker: 'Example', headline: 'A headline that makes people stop', caption: 'And a line that makes them swipe.' };
  const sample = { layout: 'statement', fields, accents: ['stop'] };
  const fp = pack.look?.flavour ? flavourPass([sample], style, { pack, brief: '', hasPhoto: false, images: [], site: '', signatureCover: true }, name, coverKeyOf('Example', [sample], name)) : null;
  const cover: import('./designLibrary').SlideSpec = fp?.specs[0] ?? sample;
  const d = await drawOne(cover, (cover.pin?.variant ?? style.flavour?.coverVariant ?? 0) as 0 | 1, style, { handle: '@yourname', index: 0, total: 6, cut: 'plain', invert: false, density: 'normal' });
  return d.built ? d.built.svg : null;
}
