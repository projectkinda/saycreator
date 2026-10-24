// Composes a carousel, draws every slide, and checks each on a phone-size copy. Browser only.
import { FabricAdapter } from '../fabric-adapter';
import { loadFonts } from '../fonts';
import type { Pixels } from '../lint/metrics';
import type { Plan, RenderReport } from '../types';
import { composeCarousel } from './compose';
import { lintSlide, type CarouselLintResult } from './lint';
import { TRANSPARENT } from './toolbox';
import type { CarouselScript, ComposedSlide, Theme } from './types';

/** The width of the "phone" copy used for every check. */
export const CAROUSEL_PHONE_WIDTH = 320;

export interface CheckedSlide {
  slide: ComposedSlide;
  png: Blob;
  phonePng: Blob;
  lint: CarouselLintResult[];
  failed: CarouselLintResult[];
  render: RenderReport;
}

async function blobPixels(blob: Blob): Promise<Pixels> {
  const bm = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bm.width, bm.height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bm, 0, 0);
  const d = ctx.getImageData(0, 0, bm.width, bm.height);
  bm.close();
  return d;
}

/** The same plan with every word invisible (highlight boxes and markers stay): what the words sit on. */
export function withoutWords(plan: Plan): Plan {
  return {
    ...plan,
    layers: plan.layers.map((l) =>
      l.kind === 'text' ? { ...l, style: { ...l.style, color: TRANSPARENT, stroke: undefined, shadow: undefined }, highlight: l.highlight ? { ...l.highlight, textColor: TRANSPARENT } : undefined } : l,
    ),
  };
}

/** Draws and checks one slide plan. Works for plans that were edited by patches, too. */
export async function checkSlidePlan(adapter: FabricAdapter, slide: ComposedSlide, margin: number): Promise<CheckedSlide> {
  const plan = slide.plan;
  const scale = CAROUSEL_PHONE_WIDTH / plan.canvas.width;
  const render = await adapter.render(plan);
  const png = await adapter.export({ format: 'png', scale: 1 });
  const phonePng = await adapter.export({ format: 'png', scale });
  await adapter.render(withoutWords(plan));
  const phoneBackground = await blobPixels(await adapter.export({ format: 'png', scale }));
  const lint = lintSlide({ plan, margin, phoneBackground, phoneScale: scale });
  return { slide, png, phonePng, lint, failed: lint.filter((r) => !r.pass), render };
}

/** Composes one script in one theme, draws all seven slides and checks each. */
export async function checkCarousel(script: CarouselScript, theme: Theme): Promise<CheckedSlide[]> {
  await loadFonts();
  const slides = composeCarousel(script, theme);
  const adapter = new FabricAdapter();
  await adapter.mount(null);
  try {
    const out: CheckedSlide[] = [];
    for (const s of slides) out.push(await checkSlidePlan(adapter, s, theme.spacing.margin));
    return out;
  } finally {
    adapter.dispose();
  }
}
