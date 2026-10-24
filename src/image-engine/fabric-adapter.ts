// The one file that knows about Fabric.js. Everything it draws comes from a validated plan.
import {
  Canvas,
  Ellipse,
  FabricImage,
  FabricText,
  FixedLayout,
  Group,
  LayoutManager,
  Point,
  Rect,
  Shadow,
  StaticCanvas,
  filters,
  type FabricObject,
} from 'fabric';
import type { CanvasAdapter, ExportOptions } from './adapter';
import { clampRadius, containFit, coverCrop } from './draw/geometry';
import { layoutText } from './draw/text';
import { FONT_WEIGHTS, loadFonts, nearestWeight } from './fonts';
import { applyPatch } from './patcher';
import type { ImageLayer, Layer, Patch, PatchResult, Plan, RenderReport, RenderWarning, ShapeLayer, TextLayer } from './types';
import { validatePlan } from './validate';

interface Meta {
  layer: Layer;
  /** Extra room around the box so strokes never change the group's centre. */
  pad: number;
}

const CLEAR = 'rgba(0,0,0,0)';

export class FabricAdapter implements CanvasAdapter {
  private canvas: Canvas | StaticCanvas | null = null;
  private current: Plan | null = null;
  private report: RenderReport | null = null;
  private meta = new WeakMap<object, Meta>();
  private images = new Map<string, Promise<HTMLImageElement>>();
  private patchHandlers = new Set<(p: Patch) => void>();
  private selectHandlers = new Set<(id: string | null) => void>();
  private host: HTMLElement | null = null;
  private suppressSelect = false;

  get plan() {
    return this.current;
  }
  get lastReport() {
    return this.report;
  }

  async mount(el: HTMLElement | null): Promise<void> {
    await loadFonts();
    const element = document.createElement('canvas');
    if (el) {
      const c = new Canvas(element, { enableRetinaScaling: false, preserveObjectStacking: true, selection: false });
      c.on('object:modified', (e) => e.target && this.proposeFromTransform(e.target));
      c.on('selection:created', (e) => this.emitSelect(e.selected?.[0]));
      c.on('selection:updated', (e) => this.emitSelect(e.selected?.[0]));
      c.on('selection:cleared', () => this.emitSelect(undefined));
      el.appendChild(c.wrapperEl);
      this.host = el;
      this.canvas = c;
    } else {
      // Never attached to the page: this is the "headless" path used for exports and checks.
      this.canvas = new StaticCanvas(element, { enableRetinaScaling: false, renderOnAddRemove: false });
    }
  }

  onPatchRequest(handler: (p: Patch) => void) {
    this.patchHandlers.add(handler);
    return () => this.patchHandlers.delete(handler);
  }
  onSelect(handler: (id: string | null) => void) {
    this.selectHandlers.add(handler);
    return () => this.selectHandlers.delete(handler);
  }

  select(layerId: string | null) {
    const c = this.canvas;
    if (!(c instanceof Canvas)) return;
    this.suppressSelect = true;
    if (layerId === null) c.discardActiveObject();
    else {
      const obj = c.getObjects().find((o) => this.meta.get(o)?.layer.id === layerId);
      if (obj) c.setActiveObject(obj);
    }
    this.suppressSelect = false;
    c.requestRenderAll();
  }

  private emitSelect(obj: FabricObject | undefined) {
    if (this.suppressSelect) return;
    const id = obj ? (this.meta.get(obj)?.layer.id ?? null) : null;
    this.selectHandlers.forEach((h) => h(id));
  }

  /** A drag, resize or rotate becomes a patch proposal. Nothing is changed here. */
  private proposeFromTransform(target: FabricObject) {
    const m = this.meta.get(target);
    if (!m || !this.current) return;
    const { layer, pad } = m;
    const c = target.getCenterPoint();
    const w = (target.width - 2 * pad) * target.scaleX;
    const h = (target.height - 2 * pad) * target.scaleY;
    const next = {
      x: Math.round(c.x - w / 2),
      y: Math.round(c.y - h / 2),
      width: Math.round(w),
      height: Math.round(h),
      rotation: Math.round((((target.angle % 360) + 360) % 360) * 10) / 10,
    };
    const moved = next.x !== Math.round(layer.x) || next.y !== Math.round(layer.y);
    const resized = next.width !== Math.round(layer.width) || next.height !== Math.round(layer.height);
    const turned = Math.abs(next.rotation - (((layer.rotation % 360) + 360) % 360)) >= 0.1;
    const ops: Patch['ops'] = [];
    if (moved) ops.push({ op: 'set', id: layer.id, path: 'x', value: next.x }, { op: 'set', id: layer.id, path: 'y', value: next.y });
    if (resized) ops.push({ op: 'set', id: layer.id, path: 'width', value: next.width }, { op: 'set', id: layer.id, path: 'height', value: next.height });
    if (turned) ops.push({ op: 'set', id: layer.id, path: 'rotation', value: next.rotation });
    if (ops.length === 0) return;
    const label = [moved && 'Move', resized && 'Resize', turned && 'Rotate'].filter(Boolean).join(' and ');
    const patch: Patch = { baseRevision: this.current.revision, label, ops };
    this.patchHandlers.forEach((h) => h(patch));
  }

  async applyPatch(patch: Patch): Promise<PatchResult> {
    if (!this.current) return { ok: false, reasons: ['Nothing is drawn yet. Call render first.'] };
    const res = applyPatch(this.current, patch);
    if (res.ok) await this.render(res.plan);
    return res;
  }

  async render(plan: Plan): Promise<RenderReport> {
    const problems = validatePlan(plan);
    if (problems.length) throw new Error(`This plan cannot be drawn: ${problems.join(' ')}`);
    if (!this.canvas) throw new Error('Call mount() before render().');
    await loadFonts();

    const canvas = this.canvas;
    const warnings: RenderWarning[] = [];
    const built = await Promise.all(plan.layers.map((l) => (l.visible === false ? null : this.build(l, warnings))));

    const activeId = canvas instanceof Canvas ? this.meta.get(canvas.getActiveObject() ?? {})?.layer.id : undefined;
    this.suppressSelect = true;
    canvas.clear();
    canvas.setDimensions({ width: plan.canvas.width, height: plan.canvas.height });
    canvas.backgroundColor = plan.canvas.background;
    for (const obj of built) if (obj) canvas.add(obj);
    this.suppressSelect = false;
    canvas.renderAll();
    this.current = structuredClone(plan);
    if (activeId) this.select(activeId);

    this.report = { ok: warnings.length === 0, warnings };
    return this.report;
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    let p = this.images.get(src);
    if (!p) {
      p = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`The image "${src.slice(0, 60)}" could not be loaded.`));
        img.src = src;
      });
      p.catch(() => this.images.delete(src));
      this.images.set(src, p);
    }
    return p;
  }

  private async build(layer: Layer, warnings: RenderWarning[]): Promise<FabricObject | null> {
    const pad = layer.kind === 'text' ? Math.ceil(layer.style.stroke?.width ?? 0) + 2 : layer.kind === 'shape' ? Math.ceil(layer.stroke?.width ?? 0) : 0;
    const w = layer.width;
    const h = layer.height;
    // An invisible box the size of the layer (plus pad) fixes the group's size and centre.
    const box = new Rect({ left: 0, top: 0, width: w + 2 * pad, height: h + 2 * pad, fill: CLEAR, strokeWidth: 0, selectable: false });
    const parts: FabricObject[] = [box];

    if (layer.kind === 'image') {
      const part = await this.buildImage(layer, pad, warnings);
      if (part) parts.push(part);
    } else if (layer.kind === 'shape') parts.push(this.buildShape(layer, pad));
    else parts.push(...this.buildText(layer, pad, warnings));

    // Fixed size: the group is exactly the box (plus pad), so children can never move its centre.
    const gw = w + 2 * pad;
    const gh = h + 2 * pad;
    // Where each part wants its top-left corner, in box coordinates (Fabric re-centres children when it builds a group).
    const wanted = parts.map((part) => [part, part.left ?? 0, part.top ?? 0] as const);
    const group = new Group(parts, {
      layoutManager: new LayoutManager(new FixedLayout()),
      width: gw,
      height: gh,
      subTargetCheck: false,
      interactive: false,
      objectCaching: false,
    });
    for (const [part, left, top] of wanted) part.setRelativeXY(new Point(left - gw / 2, top - gh / 2), 'left', 'top');
    group.setPositionByOrigin(new Point(layer.x + w / 2, layer.y + h / 2), 'center', 'center');
    group.set({ angle: layer.rotation, opacity: layer.opacity });
    if (layer.kind === 'text') group.set({ lockScalingX: true, lockScalingY: true });
    if (layer.mask) group.clipPath = this.buildMask(layer, w, h);
    group.setCoords();
    this.meta.set(group, { layer, pad });
    return group;
  }

  private buildMask(layer: Layer, w: number, h: number): FabricObject {
    const m = layer.mask!;
    if (m.shape === 'ellipse') return new Ellipse({ rx: w / 2, ry: h / 2, originX: 'center', originY: 'center' });
    const r = m.shape === 'roundRect' ? clampRadius(m.radius, w, h) : 0;
    return new Rect({ width: w, height: h, rx: r, ry: r, originX: 'center', originY: 'center' });
  }

  private async buildImage(layer: ImageLayer, pad: number, warnings: RenderWarning[]): Promise<FabricObject | null> {
    let el: HTMLImageElement;
    try {
      el = await this.loadImage(layer.src);
    } catch (e) {
      warnings.push({ layerId: layer.id, code: 'image-failed', message: (e as Error).message });
      return null;
    }
    const nw = el.naturalWidth || el.width;
    const nh = el.naturalHeight || el.height;
    let img: FabricImage;
    if (layer.fit === 'cover') {
      const c = coverCrop(nw, nh, layer.width, layer.height, layer.focal);
      img = new FabricImage(el, { left: pad, top: pad, cropX: c.sx, cropY: c.sy, width: c.sw, height: c.sh, scaleX: layer.width / c.sw, scaleY: layer.height / c.sh });
    } else {
      const f = containFit(nw, nh, layer.width, layer.height);
      img = new FabricImage(el, { left: pad + f.x, top: pad + f.y, scaleX: f.width / nw, scaleY: f.height / nh });
    }
    const f = layer.filters;
    if (f) {
      const list = [];
      if (f.brightness) list.push(new filters.Brightness({ brightness: f.brightness }));
      if (f.contrast) list.push(new filters.Contrast({ contrast: f.contrast }));
      if (f.saturation) list.push(new filters.Saturation({ saturation: f.saturation }));
      // Fabric's blur is a fraction of the larger side, so convert from px at final size.
      if (f.blur) list.push(new filters.Blur({ blur: Math.min(1, f.blur / Math.max(layer.width, layer.height)) }));
      img.filters = list;
      img.applyFilters();
    }
    return img;
  }

  private buildShape(layer: ShapeLayer, pad: number): FabricObject {
    const sw = layer.stroke?.width ?? 0;
    const common = { left: pad + sw / 2, top: pad + sw / 2, fill: layer.fill, stroke: layer.stroke?.color, strokeWidth: sw };
    if (layer.shape === 'ellipse') return new Ellipse({ ...common, rx: (layer.width - sw) / 2, ry: (layer.height - sw) / 2 });
    const r = clampRadius(layer.radius, layer.width, layer.height);
    return new Rect({ ...common, width: layer.width - sw, height: layer.height - sw, rx: r, ry: r });
  }

  private buildText(layer: TextLayer, pad: number, warnings: RenderWarning[]): FabricObject[] {
    const s = layer.style;
    if (!FONT_WEIGHTS[s.font].includes(s.weight))
      warnings.push({
        layerId: layer.id,
        code: 'font-missing',
        message: `${s.font} is not bundled in weight ${s.weight}. It is drawn as ${nearestWeight(s.font, s.weight)}.`,
      });
    const block = layoutText(layer);
    if (!block.fits)
      warnings.push({
        layerId: layer.id,
        code: 'text-overflow',
        message:
          block.why === 'word-too-wide'
            ? `A word in "${layer.text.slice(0, 30)}" is wider than its box at ${block.size}px. Widen the box or shorten the word.`
            : `The text does not fit its box${layer.autoFit ? ` even at the smallest size (${block.size}px)` : ` at ${block.size}px`}. Make the box taller, shorten the text, or lower the size.`,
      });

    const out: FabricObject[] = [];
    const hl = layer.highlight;
    const make = (text: string, left: number, top: number, fill: string) =>
      new FabricText(text, {
        left,
        top,
        originX: 'left',
        originY: 'top',
        fontFamily: s.font,
        fontWeight: nearestWeight(s.font, s.weight),
        fontSize: block.size,
        fill,
        lineHeight: 1,
        stroke: s.stroke?.color,
        strokeWidth: s.stroke?.width ?? 0,
        strokeLineJoin: 'round',
        paintFirst: 'stroke',
        shadow: s.shadow ? new Shadow({ color: s.shadow.color, blur: s.shadow.blur, offsetX: s.shadow.offsetX, offsetY: s.shadow.offsetY }) : undefined,
      });

    for (const line of block.lines) {
      const probe = make(line.text || ' ', 0, 0, s.color);
      const top = pad + line.y + (block.lineStep - probe.height) / 2;
      if (hl) {
        for (const m of line.marks) {
          const mh = block.size * 1.2 + 2 * hl.paddingY;
          out.push(
            new Rect({
              left: pad + m.x - hl.paddingX,
              top: top + probe.height / 2 - mh / 2,
              width: m.width + 2 * hl.paddingX,
              height: mh,
              rx: hl.radius,
              ry: hl.radius,
              fill: hl.color,
            }),
          );
        }
        // Per word, so highlighted words can use their own text colour.
        for (const word of line.words) out.push(make(word.text, pad + word.x, top, word.highlighted && hl.textColor ? hl.textColor : s.color));
      } else if (line.text) out.push(make(line.text, pad + line.x, top, s.color));
    }
    return out;
  }

  /** Fits the on-screen size of an editable canvas to a width, without changing the real size. */
  fitDisplay(width: number) {
    const c = this.canvas;
    if (!(c instanceof Canvas) || !this.current) return;
    const ratio = this.current.canvas.height / this.current.canvas.width;
    c.setDimensions({ width: `${width}px`, height: `${width * ratio}px` }, { cssOnly: true });
  }

  async export(opts: ExportOptions): Promise<Blob> {
    if (!this.canvas) throw new Error('Nothing to export: call mount() and render() first.');
    const el = this.canvas.toCanvasElement(opts.scale);
    const mime = opts.format === 'png' ? 'image/png' : 'image/jpeg';
    return new Promise((resolve, reject) =>
      el.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode the image.'))), mime, opts.quality),
    );
  }

  dispose() {
    this.canvas?.dispose();
    this.host?.replaceChildren();
    this.canvas = null;
    this.current = null;
    this.images.clear();
  }
}
