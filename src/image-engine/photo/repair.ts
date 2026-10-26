// Words over a photo must reach the phone-size contrast. The composer places them where the photo is calm and adds the overlay its
// numbers say is needed; this is the safety net after drawing: when the check still says "contrast", it adds or strengthens an
// overlay, and as a last step a solid plate behind the words, instead of leaving the slide failed. Browser only (it draws and checks).
import type { FabricAdapter } from '../fabric-adapter';
import { checkSlidePlan, type CheckedSlide } from '../carousel/check';
import { layerBox, textInk } from '../carousel/lint';
import { rect, solidOf } from '../carousel/toolbox';
import type { ComposedSlide } from '../carousel/types';
import type { Layer, Plan, TextLayer } from '../types';

const GUARD = 'photo-guard';
/** What each attempt does: first the composer's own soft overlay is made stronger (it sits where the words are), then a whole-photo overlay, then plates. */
const STEPS: { scrim?: number; overlay?: number }[] = [{ scrim: 0.6 }, { scrim: 0.85, overlay: 0.2 }, { scrim: 0.9, overlay: 0.45 }, { scrim: 0.95, overlay: 0.7 }];

/** The same overlay with its strongest part set to at least `alpha`. */
function strengthen(plan: Plan, id: string, alpha: number): Plan {
  return {
    ...plan,
    layers: plan.layers.map((l) => {
      if (l.id !== id || l.kind !== 'shape' || typeof l.fill === 'string') return l;
      const stops = l.fill.stops.map((st) => {
        const m = st.color.match(/rgba((d+),(d+),(d+),([d.]+))/);
        return m && Number(m[4]) > 0 ? { ...st, color: `rgba(${m[1]},${m[2]},${m[3]},${Math.max(Number(m[4]), alpha)})` } : st;
      });
      return { ...l, fill: { ...l.fill, stops } };
    }),
  };
}

/** A picture that fills (nearly) the whole slide: the photo the words sit on. */
function backdropIndex(plan: Plan): number {
  const { width, height } = plan.canvas;
  let at = -1;
  plan.layers.forEach((l, i) => {
    if (l.kind === 'image' && l.width >= width * 0.9 && l.height >= height * 0.9) at = i;
  });
  return at;
}

function withOverlay(plan: Plan, alpha: number): Plan {
  const at = backdropIndex(plan);
  if (at < 0) return plan;
  const { width, height } = plan.canvas;
  const guard = rect(GUARD, 'decor', 0, 0, width, height, `rgba(0,0,0,${alpha})`);
  const layers = plan.layers.filter((l) => l.id !== GUARD);
  // The overlay goes above the photo and the composer's own scrim or plate, and below every word and shape that follows.
  let ins = layers.findIndex((l) => l.id === plan.layers[at].id) + 1;
  while (layers[ins] && (layers[ins].id === 'photo-scrim' || layers[ins].id === 'photo-plate' || layers[ins].id === 'chrome-scrim')) ins++;
  layers.splice(ins, 0, guard);
  return { ...plan, layers };
}

/** A solid plate behind every block of words (a last resort). */
function withPlates(plan: Plan): Plan {
  const at = backdropIndex(plan);
  if (at < 0) return plan;
  const bg = solidOf(plan.canvas.background);
  const layers = plan.layers.filter((l) => !l.id.startsWith('photo-guard-plate'));
  const texts = layers.filter((l): l is TextLayer => l.kind === 'text' && l.role !== 'decor' && l.visible !== false);
  if (texts.length === 0) return plan;
  const pad = 28;
  const plates: Layer[] = texts.map((t, i) => {
    const b = textInk(t).box;
    return rect(`photo-guard-plate-${i + 1}`, 'decor', Math.max(0, b.x - pad), Math.max(0, b.y - pad / 2), Math.min(plan.canvas.width, b.width + pad * 2), b.height + pad, bg.startsWith('#') ? bg : '#000000', { opacity: 0.94 });
  });
  // The plates go straight above the photo (and the overlays already there), so nothing drawn later is covered by them.
  let ins = layers.findIndex((l) => l.id === plan.layers[at].id) + 1;
  while (layers[ins] && (layers[ins].id === 'photo-scrim' || layers[ins].id === 'photo-plate' || layers[ins].id === GUARD || layers[ins].id === 'chrome-scrim')) ins++;
  layers.splice(ins, 0, ...plates);
  return { ...plan, layers };
}

export interface RepairedSlide extends CheckedSlide {
  /** What was added to make the words readable, in plain words (empty when nothing was needed). */
  repairs: string[];
}

/** Draws and checks the slide; while "contrast" fails and the slide has a full photo behind its words, strengthens what is under them. */
export async function checkWithRepair(adapter: FabricAdapter, slide: ComposedSlide, margin: number): Promise<RepairedSlide> {
  let current = slide;
  let result = await checkSlidePlan(adapter, current, margin);
  const repairs: string[] = [];
  const failsContrast = (r: CheckedSlide) => r.failed.some((f) => f.id === 'contrast');
  for (let i = 0; i < STEPS.length + 1 && failsContrast(result) && backdropIndex(current.plan) >= 0; i++) {
    let plan = current.plan;
    if (i < STEPS.length) {
      const st = STEPS[i];
      if (st.scrim !== undefined) plan = strengthen(strengthen(plan, 'photo-scrim', st.scrim), 'chrome-scrim', st.scrim);
      if (st.overlay !== undefined) plan = withOverlay(plan, st.overlay);
      if (st.overlay === undefined && !current.plan.layers.some((l) => l.id === 'photo-scrim' || l.id === 'chrome-scrim')) plan = withOverlay(plan, 0.3);
    } else plan = withPlates(plan);
    repairs.push(i < STEPS.length ? `The words did not reach 4.5:1 on the photo, so the dark overlay under them was made stronger${STEPS[i].overlay ? ` and a ${Math.round(STEPS[i].overlay! * 100)}% overlay was added over the whole photo` : ''}.` : 'Even a strong overlay was not enough, so a solid plate was put behind the words.');
    current = { ...current, plan: { ...plan, revision: plan.revision + 1 }, notes: [...current.notes, repairs[repairs.length - 1]] };
    result = await checkSlidePlan(adapter, current, margin);
  }
  return { ...result, repairs };
}

export { layerBox };
