// The faithful view: the SVG the model drew, as written (made safe), with the slide's words in its text slots laid out by the same slot logic the engine uses. It is
// shown inline (so the bundled fonts apply) and rasterised with the fonts inside it for exports and previews. The editable layers are the other view.
import type { TextLayer } from '../image-engine/types';
import { fontFaceCss, loadFonts } from '../image-engine/fonts';
import { layoutText } from '../image-engine/draw/text';
import { parseTransform } from './recreate';

type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const inv = (m: Mat): Mat => {
  const d = m[0] * m[3] - m[1] * m[2] || 1;
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
};

/** The clean SVG with the filled text slots laid out in it and the hidden pieces removed. `slots` and `hidden` come from fillRecreate; sizes are those of the 1080 px slide. */
export function faithfulSvg(svg: string, W: number, slots: { layer: TextLayer; srcAll: number[] }[], hidden: number[]): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const all = Array.from(root.querySelectorAll('*'));
  const vb = (root.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number);
  const s = W / vb[2];
  const base: Mat = [s, 0, 0, s, -vb[0] * s, -vb[1] * s];
  const ctm = (el: Element): Mat => {
    const chain: Element[] = [];
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) chain.unshift(e);
    return chain.reduce((m, e) => mul(m, parseTransform(e.getAttribute('transform'))), base);
  };
  for (const { layer, srcAll } of slots) {
    const els = srcAll.map((i) => all[i]).filter(Boolean) as Element[];
    if (els.length === 0) continue;
    const first = els[0];
    els.slice(1).forEach((e) => e.parentNode?.removeChild(e));
    if (layer.visible === false) {
      first.parentNode?.removeChild(first);
      continue;
    }
    const b = layoutText(layer);
    const m = ctm(first);
    const im = inv(m);
    const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    first.removeAttribute('x');
    first.removeAttribute('y');
    first.removeAttribute('textLength');
    first.removeAttribute('lengthAdjust');
    first.removeAttribute('text-anchor');
    first.setAttribute('font-size', String(Math.round((b.size / k) * 100) / 100));
    first.textContent = '';
    for (const line of b.lines) {
      const px = layer.x + line.x;
      const py = layer.y + line.y + b.size * 0.82;
      const x = im[0] * px + im[2] * py + im[4];
      const y = im[1] * px + im[3] * py + im[5];
      const t = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      t.setAttribute('x', String(Math.round(x * 100) / 100));
      t.setAttribute('y', String(Math.round(y * 100) / 100));
      t.textContent = line.text;
      first.appendChild(t);
    }
  }
  for (const i of hidden) all[i]?.parentNode?.removeChild(all[i]);
  return new XMLSerializer().serializeToString(root);
}

/** The faithful SVG as a PNG (the bundled fonts are inside the picture, so it draws the same everywhere). `width` is the PNG width in px. */
export async function svgToPng(svg: string, width: number): Promise<Blob> {
  await loadFonts();
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const vb = (root.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number);
  const height = Math.round((width * vb[3]) / vb[2]);
  const families = [...new Set(Array.from(root.querySelectorAll('[font-family]')).map((e) => e.getAttribute('font-family')!))];
  const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = await fontFaceCss(families);
  root.insertBefore(style, root.firstChild);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = new OffscreenCanvas(width, height);
    c.getContext('2d')!.drawImage(img, 0, 0, width, height);
    return await c.convertToBlob({ type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
