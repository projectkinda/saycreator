// The one file that knows about Fabric.js. Everything it draws comes from a validated plan.
import {
  Canvas,
  Ellipse,
  FabricImage,
  FabricText,
  FixedLayout,
  Gradient,
  Group,
  LayoutManager,
  Path,
  Point,
  Rect,
  Shadow,
  StaticCanvas,
  filters,
  loadSVGFromString,
  util,
  type FabricObject,
} from 'fabric';
import type { CanvasAdapter, ExportOptions } from './adapter';
import { getElementSvg } from './assets/library';
import { prepareElement } from './assets/svg-prepare';
import { clampRadius, containFit, coverCrop } from './draw/geometry';
import { SHAPE_PATHS, isPathShape } from './draw/shapes';
import { makeCanvas, renderField, renderObject, renderPhoto } from './draw/treat';
import { layoutText } from './draw/text';
import { FONT_WEIGHTS, loadFonts, nearestWeight } from './fonts';
import { applyPatch } from './patcher';
import type { ElementLayer, FieldLayer, Fill, GlassLayer, ImageLayer, Layer, PathLayer, Patch, PatchResult, Plan, RenderReport, RenderWarning, ShapeLayer, TextLayer } from './types';
import { validatePlan } from './validate';

interface Meta {
  layer: Layer;
  /** Extra room around the box so strokes never change the group's centre. */
  pad: number;
}

const CLEAR = 'rgba(0,0,0,0)';

/** A plan fill as something Fabric can paint. Gradient coordinates are pixels inside the object, CSS angle convention. */
function paint(fill: Fill, w: number, h: number) {
  if (typeof fill === 'string') return fill;
  const a = (fill.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return new Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: { x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half },
    colorStops: fill.stops.map((s) => ({ offset: s.at, color: s.color })),
  });
}

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
    const built = await Promise.all(plan.layers.map((l) => (l.visible === false || l.kind === 'glass' ? null : this.build(l, warnings))));

    const activeId = canvas instanceof Canvas ? this.meta.get(canvas.getActiveObject() ?? {})?.layer.id : undefined;
    this.suppressSelect = true;
    canvas.clear();
    canvas.setDimensions({ width: plan.canvas.width, height: plan.canvas.height });
    canvas.backgroundColor = plan.canvas.background;
    for (let i = 0; i < built.length; i++) {
      const l = plan.layers[i];
      if (l.kind === 'glass' && l.visible !== false) {
        // A glass card blurs what is drawn so far, so the picture so far is taken first.
        canvas.renderAll();
        const behind = canvas.toCanvasElement(1);
        const obj = await this.build(l, warnings, behind);
        if (obj) canvas.add(obj);
      } else if (built[i]) canvas.add(built[i]!);
    }
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

  private async build(layer: Layer, warnings: RenderWarning[], behind?: HTMLCanvasElement): Promise<FabricObject | null> {
    const pad = layer.kind === 'text' ? Math.ceil(layer.style.stroke?.width ?? 0) + 2 : layer.kind === 'shape' || layer.kind === 'path' ? Math.ceil(layer.stroke?.width ?? 0) : 0;
    const w = layer.width;
    const h = layer.height;
    // An invisible box the size of the layer (plus pad) fixes the group's size and centre.
    const box = new Rect({ left: 0, top: 0, width: w + 2 * pad, height: h + 2 * pad, fill: CLEAR, strokeWidth: 0, selectable: false });
    const parts: FabricObject[] = [box];

    if (layer.kind === 'image') {
      const part = await this.buildImage(layer, pad, warnings);
      if (part) parts.push(part);
    } else if (layer.kind === 'shape') parts.push(this.buildShape(layer, pad));
    else if (layer.kind === 'path') parts.push(this.buildPath(layer, pad));
    else if (layer.kind === 'element') parts.push(...(await this.buildElement(layer, pad, warnings)));
    else if (layer.kind === 'field') parts.push(this.buildField(layer, pad));
    else if (layer.kind === 'glass') parts.push(...this.buildGlass(layer, pad, behind));
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
    if (m.shape === 'pill') {
      const r = Math.min(w, h) / 2;
      return new Rect({ width: w, height: h, rx: r, ry: r, originX: 'center', originY: 'center' });
    }
    if (isPathShape(m.shape)) {
      // The shape is drawn in a 0 to 100 box, then stretched to the layer's box.
      const p = new Path(SHAPE_PATHS[m.shape], { originX: 'center', originY: 'center', objectCaching: false });
      p.set({ scaleX: w / p.width, scaleY: h / p.height, left: 0, top: 0 });
      return p;
    }
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
    const sh = layer.shadow ? new Shadow({ color: layer.shadow.color, blur: layer.shadow.blur, offsetX: layer.shadow.offsetX, offsetY: layer.shadow.offsetY }) : undefined;
    if (layer.object) {
      // A transparent object with its own shadow, reflection or glow, drawn at the size of its box.
      img = new FabricImage(renderObject(el, layer.width, layer.height, layer.object), { left: pad, top: pad });
      if (sh) img.shadow = sh;
      return img;
    }
    if (layer.treatments && layer.treatments.length > 0) {
      // Treated in the browser at the box's own pixel size, so the treatment never changes the box.
      img = new FabricImage(renderPhoto(el, layer.width, layer.height, layer.fit, layer.focal, layer.treatments), { left: pad, top: pad, scaleX: layer.width / Math.round(layer.width), scaleY: layer.height / Math.round(layer.height) });
      if (sh) img.shadow = sh;
      return img;
    }
    if (layer.fit === 'cover') {
      const c = coverCrop(nw, nh, layer.width, layer.height, layer.focal);
      img = new FabricImage(el, { left: pad, top: pad, cropX: c.sx, cropY: c.sy, width: c.sw, height: c.sh, scaleX: layer.width / c.sw, scaleY: layer.height / c.sh });
    } else {
      const f = containFit(nw, nh, layer.width, layer.height);
      img = new FabricImage(el, { left: pad + f.x, top: pad + f.y, scaleX: f.width / nw, scaleY: f.height / nh });
    }
    if (sh) img.shadow = sh;
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

  private buildField(layer: FieldLayer, pad: number): FabricObject {
    return new FabricImage(renderField(layer.width, layer.height, layer.base, layer.blobs, layer.blur, layer.grain, layer.seed), { left: pad, top: pad });
  }

  /** A glass card: the picture behind it, blurred and clipped to a rounded box, then a translucent fill and a soft border. */
  private buildGlass(layer: GlassLayer, pad: number, behind?: HTMLCanvasElement): FabricObject[] {
    const w = Math.round(layer.width);
    const h = Math.round(layer.height);
    const r = clampRadius(layer.radius, w, h);
    const out: FabricObject[] = [];
    if (behind) {
      // Blur the whole picture so far (a little bigger, so the edges stay solid), then cut out this card's part of it.
      const blurred = makeCanvas(behind.width, behind.height);
      const bg = blurred.getContext('2d')!;
      bg.filter = `blur(${layer.blur}px)`;
      bg.drawImage(behind, 0, 0);
      const card = makeCanvas(w, h);
      const g = card.getContext('2d')!;
      g.drawImage(blurred, -layer.x, -layer.y);
      const img = new FabricImage(card, { left: pad, top: pad });
      img.clipPath = new Rect({ width: w, height: h, rx: r, ry: r, originX: 'center', originY: 'center' });
      if (layer.shadow) img.shadow = new Shadow({ color: layer.shadow.color, blur: layer.shadow.blur, offsetX: layer.shadow.offsetX, offsetY: layer.shadow.offsetY });
      out.push(img);
    }
    const bw = layer.border?.width ?? 0;
    out.push(new Rect({ left: pad + bw / 2, top: pad + bw / 2, width: w - bw, height: h - bw, rx: r, ry: r, fill: layer.fill, stroke: layer.border?.color, strokeWidth: bw }));
    return out;
  }

  private buildShape(layer: ShapeLayer, pad: number): FabricObject {
    const sw = layer.stroke?.width ?? 0;
    const common = { left: pad + sw / 2, top: pad + sw / 2, fill: paint(layer.fill, layer.width - sw, layer.height - sw), stroke: layer.stroke?.color, strokeWidth: sw, ...(layer.shadow ? { shadow: new Shadow({ color: layer.shadow.color, blur: layer.shadow.blur, offsetX: layer.shadow.offsetX, offsetY: layer.shadow.offsetY }) } : {}) };
    if (layer.shape === 'ellipse') return new Ellipse({ ...common, rx: (layer.width - sw) / 2, ry: (layer.height - sw) / 2 });
    const r = clampRadius(layer.radius, layer.width, layer.height);
    return new Rect({ ...common, width: layer.width - sw, height: layer.height - sw, rx: r, ry: r });
  }

  /** An element from the library: recoloured SVG, fitted inside the box, with an optional sticker outline and shadow. */
  private async buildElement(layer: ElementLayer, pad: number, warnings: RenderWarning[]): Promise<FabricObject[]> {
    const svg = await getElementSvg(layer.element);
    if (!svg) {
      warnings.push({ layerId: layer.id, code: 'element-missing', message: `The element "${layer.element}" is not in the library. Run npm run fetch:assets if it comes from a pack.` });
      return [];
    }
    const prepared = prepareElement(svg, { colors: layer.colors, tint: layer.tint, sticker: layer.sticker });
    const fit = async (text: string): Promise<FabricObject> => {
      const parsed = await loadSVGFromString(text);
      const obj = util.groupSVGElements(parsed.objects.filter(Boolean) as FabricObject[], parsed.options) as FabricObject;
      const w = obj.width || 1;
      const h = obj.height || 1;
      const k = Math.min(layer.width / w, layer.height / h);
      obj.set({ originX: 'left', originY: 'top', scaleX: k * (layer.flipX ? -1 : 1), scaleY: k, left: pad + (layer.width - w * k) / 2 + (layer.flipX ? w * k : 0), top: pad + (layer.height - h * k) / 2 });
      return obj;
    };
    const out: FabricObject[] = [];
    const sh = layer.shadow ? new Shadow({ color: layer.shadow.color, blur: layer.shadow.blur, offsetX: layer.shadow.offsetX, offsetY: layer.shadow.offsetY }) : undefined;
    if (prepared.under) {
      const under = await fit(prepared.under);
      if (sh) under.shadow = sh;
      out.push(under);
    }
    const main = await fit(prepared.main);
    if (sh && !prepared.under) main.shadow = sh;
    out.push(main);
    return out;
  }

  private buildPath(layer: PathLayer, pad: number): FabricObject {
    const st = layer.stroke;
    const p = new Path(layer.d, {
      originX: 'left',
      originY: 'top',
      fill: layer.fill ?? CLEAR,
      stroke: st?.color,
      strokeWidth: st?.width ?? 0,
      strokeLineCap: st?.cap ?? 'round',
      strokeLineJoin: st?.join ?? 'round',
      objectCaching: false,
    });
    // Fabric starts a path at the top-left of its points; keep the plan's meaning: coordinates are inside the box.
    // Fabric centres a path on its own points, so the top-left of the points is the centre of the path minus half its size.
    const minX = p.pathOffset.x - p.width / 2;
    const minY = p.pathOffset.y - p.height / 2;
    p.set({ left: pad + minX, top: pad + minY });
    return p;
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
          const mh = hl.hugLine ? Math.max(block.lineStep, block.size * 1.02) : block.size * 1.2 + 2 * hl.paddingY;
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
