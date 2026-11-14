// Round H part D (Round I part C: nine now, see the list): ready-made colour combinations (1 to 3 colours each), none tied to a style. They go through the same brand code as a person's own brand (applyBrand), so every one
// is checked on all 15 styles by tests/image-engine/brand-palette.spec.ts: add one here and that test checks it.
export interface ColourCombination {
  id: string;
  /** Plain words for the person. */
  name: string;
  /** Main, second and extra colour as #rrggbb. */
  colours: string[];
}

export const COLOUR_COMBINATIONS: ColourCombination[] = [
  { id: 'ocean-amber', name: 'Ocean and amber', colours: ['#0b3c5d', '#f2a900'] },
  { id: 'ink-paper', name: 'Ink and paper', colours: ['#1a1a1a', '#f5f1e8'] },
  { id: 'berry-gold', name: 'Berry and gold', colours: ['#8e1b4f', '#e9b44c'] },
  { id: 'forest-cream', name: 'Forest and cream', colours: ['#1f4d3a', '#f3ebd8', '#c8553d'] },
  { id: 'sunrise', name: 'Sunrise', colours: ['#f4553f', '#ffc857'] },
  { id: 'midnight-violet', name: 'Midnight violet', colours: ['#1b1340', '#8b7cff', '#35e0c4'] },
  // Round I: three with a vivid, mid-tone main colour replace Sky and sand and Quiet stone, which looked like the dark ones on dark slides
  { id: 'teal-coral', name: 'Teal and coral', colours: ['#0f9b8e', '#ff6b5b'] },
  { id: 'blue-lime', name: 'Blue and lime', colours: ['#2557d6', '#c6f432'] },
  { id: 'pink-mint', name: 'Pink and mint', colours: ['#ff4f9a', '#8fe3c0'] },
];
