// The built-in "Pick a style" presets as library styles. A preset is a stored style (style.json); the layout library draws it from a pack made by packFromStyle (the first of
// each rhythm's grounds, the closing ground, case, weights, gradient and flavour from the style's "library" block) plus the marker or underline the preset's shape asks for.
// Nothing here reads the saved reference cache or the active reference: a preset is its own source. The person's toggles for a preset are kept under "preset:<name>".
import { isUserStyle } from '../reference/templates';
import { withOverrides } from '../reference/overrides';
import { packFromStyle, type StylePack } from '../reference/pack';
import { templateRoute } from './designLibrary';
import { styleByName } from './render';

export const presetKey = (name: string) => 'preset:' + name;

/** The library pack of a built-in preset, or null when the name is a saved reference template, the active reference, unknown, or the template route flag is on. */
export function presetPackFor(name: string, withSaved = true): StylePack | null {
  if (!name || name === 'mine-reference-active' || name.startsWith('mine-') || templateRoute() || isUserStyle(name)) return null;
  const st = styleByName(name);
  if (!st) return null;
  const base = packFromStyle(st.spec);
  const marker = st.spec.shape.marker;
  const pack: StylePack = { ...base, devices: { marker: marker === 'box', underline: marker === 'underline', profileHeader: false, slides: 1, counts: { marker: 0, profileHeader: 0, underline: 0 } } };
  return withSaved ? withOverrides(pack, presetKey(name)) : { ...pack, readKey: presetKey(name) };
}
