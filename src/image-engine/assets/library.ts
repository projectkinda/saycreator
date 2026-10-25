// The element library: icons and objects from permissively licensed packs (fetched by `npm run fetch:assets`, never committed)
// plus elements drawn in code (always there). Every element has an id, tags and a recolour map.
import { CODE_ELEMENTS, codeElementSvg } from './code-elements';

export interface ElementInfo {
  /** For example "lucide:arrow-right" or "code:squiggle:2". */
  id: string;
  pack: string;
  name: string;
  tags: string[];
  kind: 'icon' | 'object' | 'code';
  width: number;
  height: number;
  /** Suggested recolouring: each source colour (or token) and the palette role it plays. */
  recolour: Record<string, string>;
  /** The roles used, for example ["accent", "text"]. */
  slots: string[];
  texture?: boolean;
}
export interface PackInfo {
  id: string;
  label: string;
  licence: string;
  source: string;
  version: string;
  licenceUrl: string;
  attribution: string;
  count: number;
  kind: ElementInfo['kind'];
}

const indexFiles = import.meta.glob('./packs/index.json', { eager: true, import: 'default' }) as Record<string, { packs: PackInfo[]; elements: ElementInfo[] }>;
const svgLoaders = import.meta.glob('./packs/*.svgs.json', { import: 'default' }) as Record<string, () => Promise<Record<string, string>>>;
const fetched = Object.values(indexFiles)[0] ?? { packs: [], elements: [] };

const codeInfos: ElementInfo[] = CODE_ELEMENTS.flatMap((d) =>
  Array.from({ length: d.seeds }, (_, i) => ({
    id: `code:${d.name}:${i + 1}`,
    pack: 'code',
    name: d.seeds > 1 ? `${d.name} ${i + 1}` : d.name,
    tags: d.tags,
    kind: 'code' as const,
    width: d.width,
    height: d.height,
    recolour: Object.fromEntries(d.slots.map((s) => [s, s])),
    slots: d.slots,
    ...(d.texture ? { texture: true } : {}),
  })),
);

export const CODE_PACK: PackInfo = {
  id: 'code',
  label: 'Drawn in code',
  licence: 'Ours (no third-party material)',
  source: 'src/image-engine/assets/code-elements.ts',
  version: 'in the repository',
  licenceUrl: 'src/image-engine/assets/code-elements.ts',
  attribution: 'None needed.',
  count: codeInfos.length,
  kind: 'code',
};

/** Every element the engine can place: the fetched packs (if `npm run fetch:assets` was run) and the code-drawn ones. */
export function listElements(): ElementInfo[] {
  return [...codeInfos, ...fetched.elements];
}
export function listPacks(): PackInfo[] {
  return [CODE_PACK, ...fetched.packs];
}
export const elementById = (id: string) => listElements().find((e) => e.id === id);

export interface FindOptions {
  /** Elements that have any of these tags. */
  tags: string[];
  kinds?: ElementInfo['kind'][];
  packs?: string[];
  texture?: boolean;
}
export function findElements(o: FindOptions): ElementInfo[] {
  const want = new Set(o.tags.map((t) => t.toLowerCase()));
  return listElements().filter(
    (e) => e.tags.some((t) => want.has(t.toLowerCase())) && (!o.kinds || o.kinds.includes(e.kind)) && (!o.packs || o.packs.includes(e.pack)) && (o.texture === undefined || !!e.texture === o.texture),
  );
}

const packCache = new Map<string, Promise<Record<string, string>>>();
/** The SVG text of an element, or null if the library has no such element. */
export async function getElementSvg(id: string): Promise<string | null> {
  if (id.startsWith('code:')) return codeElementSvg(id);
  const pack = id.split(':')[0];
  const loader = svgLoaders[`./packs/${pack}.svgs.json`];
  if (!loader) return null;
  let p = packCache.get(pack);
  if (!p) packCache.set(pack, (p = loader()));
  return (await p)[id.slice(pack.length + 1)] ?? null;
}
