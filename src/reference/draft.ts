// A quick draft from the measured numbers alone (colours, margins, rough title size), drawn before the reader has said anything, so the Live view
// has a picture within about two seconds. The reader's result replaces it. It uses the blank base and changes only what was measured.
import type { StyleSpec } from '../image-engine/styles/format';
import { blankStyle } from './blank';
import type { Measured } from './types';

const hex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The blank style with the first reference's measured background, text colour, accent, margin and title size. */
export function draftSpec(m: Measured): StyleSpec {
  const s = blankStyle();
  const p = s.palettes.plain as unknown as Record<string, unknown>;
  const bg = m.background;
  p.bg = bg;
  p.text = m.textColour ?? p.text;
  // The accent is the commonest colour that is neither the background nor the text.
  const accent = m.palette.find((c) => c.hex.toUpperCase() !== bg.toUpperCase() && c.hex.toUpperCase() !== (m.textColour ?? '').toUpperCase());
  if (accent) {
    p.accent = accent.hex;
    p.marker = accent.hex;
  }
  if (m.margins) s.spacing = { ...s.spacing, margin: Math.round(clampN(Math.min(m.margins.left, m.margins.right) * 1080, 48, 200)) };
  // The tallest line, as a share of the frame's height, is about the size of the biggest type.
  if (m.titleHeight) s.type = { ...s.type, headline: Math.round(clampN(m.titleHeight * 1350 * 0.92, 32, 220)), cover: Math.round(clampN(m.titleHeight * 1350 * 1.1, 32, 260)) };
  void hex;
  return s;
}
