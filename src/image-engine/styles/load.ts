// Loads every style folder under src/image-engine/styles/<name>/ (style.json plus assets/*.svg).
// A new style is added by adding a folder. A folder that fails validation is reported, not loaded.
import { parseSvg, type SvgAsset } from './svg';
import { validateStyle, type StyleSpec } from './format';
import { listElements } from '../assets/library';

const jsons = import.meta.glob('./*/style.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const svgs = import.meta.glob('./*/assets/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

export interface LoadedStyle {
  spec: StyleSpec;
  assets: Record<string, SvgAsset>;
  warnings: string[];
}
export interface StyleProblem {
  folder: string;
  messages: string[];
}

export function loadStyles(): { styles: LoadedStyle[]; problems: StyleProblem[] } {
  const knownTags = new Set(listElements().flatMap((e) => e.tags.map((t) => t.toLowerCase())));
  const styles: LoadedStyle[] = [];
  const problems: StyleProblem[] = [];
  for (const [file, raw] of Object.entries(jsons)) {
    const folder = file.split('/')[1];
    const { errors, warnings } = validateStyle(raw, folder, knownTags);
    const spec = raw as StyleSpec;
    const assets: Record<string, SvgAsset> = {};
    if (errors.length === 0) {
      for (const [name, rel] of Object.entries(spec.assets)) {
        const text = svgs[`./${folder}/${rel}`];
        if (text === undefined) {
          errors.push(`Style "${folder}": assets.${name} points to "${rel}", but that file is not in the style's folder.`);
          continue;
        }
        const r = parseSvg(name, text);
        if (r.asset) assets[name] = r.asset;
        else errors.push(...r.errors.map((m) => `Style "${folder}": ${m}`));
      }
    }
    if (errors.length) problems.push({ folder, messages: errors });
    else styles.push({ spec, assets, warnings });
  }
  styles.sort((a, b) => a.spec.name.localeCompare(b.spec.name));
  return { styles, problems };
}
