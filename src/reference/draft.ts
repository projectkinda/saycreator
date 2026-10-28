// An instant draft from the measured numbers alone, with no model: the colours, the background, the margins, the size and place of the title, and the
// look of the photo where the code could tell. It uses the blank base and changes only what was measured, and it says which values those are.
import type { StyleSpec } from '../image-engine/styles/format';
import type { Treatment } from '../image-engine/types';
import { blankStyle } from './blank';
import type { Measured } from './types';

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** One value the draft took from the measurement, in words. */
export interface DraftValue {
  /** The spec path (the editor marks this value MEASURED). */
  path: string;
  text: string;
}

/** The photo treatment the measurement points to: black and white, contrast, halftone, a two-colour look, blur. */
function treatmentOf(m: Measured, dark: string, light: string): Treatment[] {
  const p = m.photo;
  if (!p.present) return [];
  const steps: Treatment[] = [];
  if (p.halftone) steps.push({ op: 'halftone', cell: 8, dark, light, contrast: 0.2 });
  else if (p.duotone) steps.push({ op: 'duotone', dark, light });
  else if (p.blackAndWhite) steps.push({ op: 'grayscale' });
  if (p.highContrast && !p.halftone) steps.push({ op: 'levels', contrast: 0.25 });
  if (p.blurred) steps.push({ op: 'blur', radius: 6 });
  return steps;
}

/** Which cover layout puts the title where the reference puts it (top, middle or bottom). */
function coverLayoutFor(place: string | null): string {
  if (!place) return 'cover-top';
  if (place.startsWith('top')) return 'cover-top';
  if (place.startsWith('middle') || place.startsWith('centre') || place.startsWith('center')) return 'cover-centre';
  return 'cover-stack';
}

/** The blank style with the first reference's measured values, and the list of what was measured. */
export function draftSpec(m: Measured): { spec: StyleSpec; values: DraftValue[] } {
  const s = blankStyle();
  const values: DraftValue[] = [];
  const p = s.palettes.plain as unknown as Record<string, unknown>;
  p.bg = m.background;
  values.push({ path: 'palettes.plain.bg', text: `background → ${m.background}` });
  if (m.textColour) {
    p.text = m.textColour;
    values.push({ path: 'palettes.plain.text', text: `text → ${m.textColour}` });
  }
  // The accent is the commonest colour that is neither the background nor the text.
  const accent = m.palette.find((c) => c.hex.toUpperCase() !== m.background.toUpperCase() && c.hex.toUpperCase() !== (m.textColour ?? '').toUpperCase());
  if (accent) {
    p.accent = accent.hex;
    p.marker = accent.hex;
    values.push({ path: 'palettes.plain.accent', text: `accent → ${accent.hex}` });
  }
  if (m.margins) {
    const margin = Math.round(clampN(Math.min(m.margins.left, m.margins.right) * 1080, 48, 200));
    s.spacing = { ...s.spacing, margin };
    values.push({ path: 'spacing.margin', text: `margin → ${margin} px` });
  }
  if (m.titleHeight) {
    const headline = Math.round(clampN(m.titleHeight * 1350 * 0.92, 32, 220));
    s.type = { ...s.type, headline, cover: Math.round(clampN(m.titleHeight * 1350 * 1.1, 32, 260)) };
    values.push({ path: 'type.headline', text: `title → ${headline} px` });
  }
  if (m.titlePlacement) {
    const use = coverLayoutFor(m.titlePlacement);
    const rules = s.layouts.cover.filter((r) => r.use !== use && r.use !== 'cover-top' && r.use !== 'cover-centre');
    s.layouts = { ...s.layouts, cover: [...rules.slice(0, 1), { use, when: { headlineWordsMax: 9 } }, ...rules.slice(1)] };
    values.push({ path: 'layouts.cover', text: `title place → ${m.titlePlacement} (${use})` });
  }
  const steps = treatmentOf(m, m.textColour ?? '#111111', m.background);
  if (steps.length) {
    s.photo = { ...(s.photo ?? { treatments: {} }), treatments: { ...(s.photo?.treatments ?? {}), plain: steps } };
    values.push({ path: 'photo.treatments.plain', text: `photo look → ${steps.map((t) => t.op).join(' + ')}` });
  }
  return { spec: s, values };
}
