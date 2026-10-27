// What the Results screen shares between its parts: the data the dev server hands out, and where the person is looking.
import { createContext, useContext } from 'react';
import type { StepManifest } from './Generic';

export interface StyleJson {
  name: string;
  title: string;
  description?: string;
  version: string;
  basedOn: { cluster: string; note: string };
  knownLintConflicts?: string[];
  notReproduced?: string[];
  photo?: unknown;
}
export interface RecSlide {
  style: string;
  script: string;
  scriptTitle: string;
  index: number;
  type: string;
  layout: string;
  rule: number;
  because: string;
  palette: string;
  notes: string[];
  pass: boolean;
  lint: { id: string; label: string; pass: boolean; reason: string }[];
  pngUrl: string;
  phoneUrl: string;
  planUrl: string;
}
export interface Clusters {
  images: Record<string, { format: string; description: string }>;
  clusters: { id: string; name: string; summary: string; images: string[] }[];
}
export interface RecData {
  slides: RecSlide[];
  styles: StyleJson[];
  clusters: Clusters | null;
  lastRun: number;
}
export interface LastRun {
  step1: number;
  step2: number;
  step3: number;
  step4: number;
  elements?: number;
  coverage?: number;
  generic: Record<string, number>;
}
export interface TestAsset {
  name: string;
  bytes: number;
  /** Where the dev server serves it (the server knows; the page never spells the private folder). */
  url: string;
}

export const VIEWS = ['overview', 'styles', 'slides', 'photo', 'thumbnails', 'cutouts', 'elements', 'coverage', 'checks'] as const;
export type View = (typeof VIEWS)[number];

export interface LabData {
  recreation: RecData | null;
  manifests: StepManifest[];
  last: LastRun;
  testAssets: TestAsset[];
  /** Which style and script the Slides view shows. */
  sel: { style: string; script: string };
  setSel: (s: { style: string; script: string }) => void;
  go: (v: View) => void;
}
export const LabDataContext = createContext<LabData | null>(null);
export const useLab = () => {
  const c = useContext(LabDataContext);
  if (!c) throw new Error('Results data is missing.');
  return c;
};

export const REF = '/Reference%20carousels%20likes/';
export const VERDICT_WORDS = ['matches', 'close', 'off', 'wrong'].map((v) => ({ value: v, label: v }));
/** "Step 10: Polish" is shown as "Polish": the screen is not organised by build step any more. */
export const plainTitle = (t: string) => t.replace(/^Step \d+( fix)?:\s*/i, '');

/** The photo styles' reference decks (the stored styles' come from clusters.json). */
export const PHOTO_STYLE_REFS: Record<string, string[]> = {
  'mono-poster': ['1f13499493341400cfc3fe6e05fe3d58.jpg', '44937935e682165c1f93e99a11a47123.jpg'],
  'film-paper': ['9897a861375e0f0abb77f9b7ac28febd.jpg', 'af4224d23eb688a8eb56abb9515b593e.jpg'],
  'glass-gradient': ['bf7d6a6e42c4742031644ad3118f8eb1.jpg', '1503c1de8dded2a7cbe333f061c7131a.jpg'],
};
export const PHOTO_STYLES = Object.keys(PHOTO_STYLE_REFS);

/** The three photo decks (made with test photos) are in the Step 11 results file; this finds the deck items of one style. */
export function photoDecks(manifests: StepManifest[], style: string) {
  const m = manifests.find((x) => x.file === 'step11.json');
  if (!m) return [];
  const out: { groupTitle: string; item: StepManifest['groups'][number]['items'][number]; deckId: string }[] = [];
  for (const g of m.groups)
    for (const it of g.items) if (it.id.startsWith(style + '-')) out.push({ groupTitle: g.title, item: it, deckId: it.id.slice(style.length + 1) });
  return out;
}

export interface PhotoSlide {
  n: number;
  label: string;
  url: string;
  failed: string[];
}
/** The slides of one photo-deck item (its pictures labelled "Slide n ..."), with what failed on each. */
export function parsePhotoSlides(item: StepManifest['groups'][number]['items'][number]): PhotoSlide[] {
  return item.images
    .filter((im) => /^Slide \d+/.test(im.label ?? ''))
    .map((im) => {
      const n = Number(/^Slide (\d+)/.exec(im.label ?? '')![1]);
      return { n, label: im.label ?? '', url: im.url, failed: (item.checker?.reasons ?? []).filter((r) => r.startsWith(`Slide ${n}:`)).map((r) => r.replace(/^Slide \d+:\s*/, '')) };
    });
}
