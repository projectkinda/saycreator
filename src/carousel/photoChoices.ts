// The choices a person can make about a slide's photo, and what each one means for the engine. Pure (no DOM).
import type { Treatment } from '../image-engine/types';

export const TREATMENT_CHOICES = [
  { id: 'style', label: 'Style’s own look' },
  { id: 'none', label: 'None' },
  { id: 'bw', label: 'Black and white' },
  { id: 'duotone', label: 'Duotone' },
  { id: 'halftone', label: 'Halftone' },
  { id: 'grain', label: 'Grain' },
  { id: 'blur', label: 'Blur' },
  { id: 'tint', label: 'Tint' },
] as const;
export type TreatmentChoice = (typeof TREATMENT_CHOICES)[number]['id'];
export const isTreatmentChoice = (v: unknown): v is TreatmentChoice => TREATMENT_CHOICES.some((t) => t.id === v);

/** The treatment list for a choice, or undefined to leave the style's own look. Colours written "$accent" mean the slide's own palette. */
export function treatmentsFor(choice: TreatmentChoice | undefined): Treatment[] | undefined {
  switch (choice) {
    case undefined:
    case 'style':
      return undefined;
    case 'none':
      return [];
    case 'bw':
      return [{ op: 'grayscale' }, { op: 'levels', contrast: 0.15 }];
    case 'duotone':
      return [{ op: 'duotone', dark: '#101010', light: '$accent' }];
    case 'halftone':
      return [{ op: 'grayscale' }, { op: 'halftone', cell: 12, angle: 45, dark: '#141414', light: '#f4f1ea', contrast: 1 }];
    case 'grain':
      return [{ op: 'grain', amount: 0.18, size: 1, seed: 5 }];
    case 'blur':
      return [{ op: 'blur', radius: 14 }];
    case 'tint':
      return [{ op: 'tint', color: '$accent', amount: 0.35 }];
  }
}

/** Frames the content-photo-frame layout knows. */
export const FRAME_CHOICES = [
  { id: 'plain', label: 'Plain' },
  { id: 'phone', label: 'Phone' },
  { id: 'laptop', label: 'Laptop' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'ticket', label: 'Ticket' },
  { id: 'offset', label: 'Colour block' },
  { id: 'glass', label: 'Glass card' },
] as const;
/** Shapes the cover-photo-shape layout knows. */
export const SHAPE_CHOICES = [
  { id: 'roundRect', label: 'Rounded' },
  { id: 'ellipse', label: 'Circle' },
  { id: 'pill', label: 'Pill' },
  { id: 'arch', label: 'Arch' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'flower', label: 'Flower' },
  { id: 'blob', label: 'Blob' },
  { id: 'starburst', label: 'Starburst' },
] as const;

/** What the person has chosen for one slide's photo (kept in the project, under the slide's choices). */
export interface PhotoChoice {
  /** A photo by id; null leaves the slot empty on purpose; missing lets the composer fill it in turn. */
  id?: string | null;
  treatment?: TreatmentChoice;
  focal?: { x: number; y: number };
  frame?: string;
  shape?: string;
}
