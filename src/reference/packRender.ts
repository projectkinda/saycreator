// One small picture of a pack design for galleries, template previews and the pack sheet: the faithful drawing when the pack kept it, else the layers.
import { renderer } from '../carousel/render';
import { svgToPng } from './faithful';
import { packSlide, type StylePack } from './pack';

export async function packPicture(pack: StylePack, slideType: string, slide: Record<string, unknown>, width: number): Promise<Blob> {
  const r = packSlide(pack, slideType, slide, '@yourname');
  if (r.faithful) return svgToPng(r.faithful, width);
  return renderer.preview({ schema: 1, revision: 1, canvas: { width: pack.canvas.w, height: pack.canvas.h, background: pack.palette.bg ?? '#FFFFFF' }, layers: r.layers } as never, width / pack.canvas.w);
}
