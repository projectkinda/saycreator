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

export interface FaithfulSlot {
  layer: TextLayer;
  srcAll: number[];
  /** More columns of the same slot (a long list set in two). */
  more?: TextLayer[];
}

/** Palette names ("$accent") in the SVG become the pack's colours. */
export const resolveSvgTokens = (svg: string, palette: Record<string, string>) => svg.replace(/\$([A-Za-z][A-Za-z0-9]*)/g, (m, n: string) => palette[n] ?? m);

/** The clean SVG with the filled text slots laid out in it and the hidden pieces removed. `slots` and `hidden` come from fillRecreate; sizes are those of the 1080 px slide. */
export function faithfulSvg(svg: string, W: number, slots: FaithfulSlot[], hidden: number[]): string {
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
  const fill = (el: Element, layer: TextLayer) => {
    const b = layoutText(layer);
    const m = ctm(el);
    const im = inv(m);
    const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    el.removeAttribute('x');
    el.removeAttribute('y');
    el.removeAttribute('textLength');
    el.removeAttribute('lengthAdjust');
    el.removeAttribute('text-anchor');
    el.setAttribute('font-size', String(Math.round((b.size / k) * 100) / 100));
    el.textContent = '';
    for (const line of b.lines) {
      const px = layer.x + line.x;
      const py = layer.y + line.y + b.size * 0.82;
      const x = im[0] * px + im[2] * py + im[4];
      const y = im[1] * px + im[3] * py + im[5];
      const t = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      t.setAttribute('x', String(Math.round(x * 100) / 100));
      t.setAttribute('y', String(Math.round(y * 100) / 100));
      t.textContent = line.text;
      el.appendChild(t);
    }
  };
  for (const { layer, srcAll, more } of slots) {
    const els = srcAll.map((i) => all[i]).filter(Boolean) as Element[];
    if (els.length === 0) continue;
    const first = els[0];
    els.slice(1).forEach((e) => e.parentNode?.removeChild(e));
    if (layer.visible === false) {
      first.parentNode?.removeChild(first);
      continue;
    }
    const clones = (more ?? []).map((l) => ({ l, el: first.cloneNode(false) as Element }));
    clones.forEach((c) => first.parentNode?.insertBefore(c.el, first.nextSibling));
    fill(first, layer);
    clones.forEach((c) => fill(c.el, c.l));
  }
  for (const i of hidden) all[i]?.parentNode?.removeChild(all[i]);
  return new XMLSerializer().serializeToString(root);
}

/**
 * The faithful SVG as a PNG (the bundled fonts are inside the picture, so it draws the same everywhere). `width` is the PNG width in px.
 * `fit`: the PNG has another shape than the picture (a 4:5 design on a square card): the picture is scaled to fit whole and centred on the background colour.
 */
export async function svgToPng(svg: string, width: number, fit?: { w: number; h: number; bg: string }): Promise<Blob> {
  await loadFonts();
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const vb = (root.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number);
  const outH = fit ? Math.round((width * fit.h) / fit.w) : Math.round((width * vb[3]) / vb[2]);
  const k = fit ? Math.min(width / vb[2], outH / vb[3]) : width / vb[2];
  const sw = Math.round(vb[2] * k);
  const sh = Math.round(vb[3] * k);
  const families = [...new Set(Array.from(root.querySelectorAll('[font-family]')).map((e) => e.getAttribute('font-family')!))];
  const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = await fontFaceCss(families);
  root.insertBefore(style, root.firstChild);
  root.setAttribute('width', String(sw));
  root.setAttribute('height', String(sh));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = new OffscreenCanvas(width, outH);
    const g = c.getContext('2d')!;
    if (fit) {
      g.fillStyle = fit.bg;
      g.fillRect(0, 0, width, outH);
    }
    g.drawImage(img, Math.round((width - sw) / 2), Math.round((outH - sh) / 2), sw, sh);
    return await c.convertToBlob({ type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
