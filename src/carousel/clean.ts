// Words in a script that are notes to the person, not slide text: "Placeholder: ...", "Note: ...", "TODO ...", or a whole field inside [square brackets].
// They are never drawn on a slide; the deck card lists them so the person can edit them.
import type { CarouselScript } from '../image-engine/carousel/types';
import { FIELDS, type SlideType } from './script';

export const isPlaceholderText = (s: string) => /^\s*(placeholder\b|note\s*:|todo\b)/i.test(s) || /^\s*\[[^\]]*\]\s*$/.test(s);

export interface Flag {
  /** Slide index, 0 for the first. */
  slide: number;
  field: string;
  label: string;
  text: string;
}

/** The script without those words (a required field becomes empty, an optional one is left out), and what was left out. */
export function cleanScript(script: CarouselScript): { script: CarouselScript; flags: Flag[] } {
  const flags: Flag[] = [];
  const slides = script.slides.map((s, i) => {
    const out: Record<string, unknown> = { ...(s as unknown as Record<string, unknown>) };
    const defs = FIELDS[out.type as SlideType] ?? [];
    for (const d of defs) {
      const v = out[d.key];
      if (typeof v === 'string' && isPlaceholderText(v)) {
        flags.push({ slide: i, field: d.key, label: d.label, text: v });
        // A required field cannot be empty (the plan will not draw an empty text), so it holds an invisible zero-width space.
        if (d.required) out[d.key] = '​';
        else delete out[d.key];
      } else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        const keep = (v as string[]).filter((x) => !isPlaceholderText(x));
        (v as string[]).forEach((x) => isPlaceholderText(x) && flags.push({ slide: i, field: d.key, label: d.label, text: x }));
        if (keep.length !== v.length) out[d.key] = keep;
      }
    }
    return out;
  });
  return flags.length ? { script: { ...script, slides: slides as unknown as CarouselScript['slides'] }, flags } : { script, flags };
}
