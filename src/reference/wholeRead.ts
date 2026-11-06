// "Read references", the default route: every reference slide is looked at WHOLE by a strong vision model (one call per slide, 3 at a time, 12 slides at most) and drawn
// as its own SVG layout. The measuring code (regions.ts) does not set boxes, sizes or colours here; it is only a checker afterwards (textOverlap). A slide whose read fails
// is reported (which slide, why) and is NOT filled in from a measured draft.
import { buildRecreatePrompt } from './recreate';
import { INVENTORY_RULES, PACK_TYPES, SIZE, parsePack, sameComposition, slotBoxes, signatureDevices, stripInventory, styleBriefOf, type PackType, type PackVariant, type StylePack } from './pack';
import type { ReaderImage, ReferenceReader } from './reader';

export const READ_MAX = 12;
export const READ_PARALLEL = 3;
export const MIN_LONG_SIDE = 1800;
export const READ_MODEL = 'sonnet (the server uses READER_DRAW_MODEL when it is set)';

export interface WholeSlideIn {
  /** The reference file's name (or "name (slide 2)" for a piece of a real mosaic). */
  name: string;
  image: ReaderImage;
}
export interface SlideReport {
  file: string;
  typeRead: PackType | null;
  model: string;
  seconds: number;
  ok: boolean;
  /** The reader's yes/no answers about the devices on this slide. */
  devices?: NonNullable<PackVariant['devices']>;
  /** Why the read failed or the SVG was refused, in plain words. */
  reasons: string[];
  /** What the sanitiser left out or changed. */
  sanitiser: string[];
  slots: number;
  imageSlots: number;
  cantDraw: number;
  /** Share (0 to 1) of the drawn text boxes' area that the detector also found text in. Null when no detection was given. */
  textOverlap?: number | null;
}
export interface WholeReadReport {
  route: 'whole-slide';
  slides: SlideReport[];
  palette: Record<string, string>;
  fonts: { headline: string; body: string } | null;
  distinctCompositions: number;
  failed: number;
}
export interface WholeReadResult {
  pack: StylePack | null;
  report: WholeReadReport;
  /** The sanitised SVG of each slide read, by file (for the side-by-side view). */
  svgByFile: Record<string, string>;
}

/** One line per failed slide: the file and its real reason (server error text, HTTP status, or the sanitiser's reasons). */
export const failureLines = (r: { slides: Pick<SlideReport, 'file' | 'ok' | 'reasons'>[] }): string[] => r.slides.filter((s) => !s.ok).map((s) => `${s.file}: ${s.reasons.join(' ').replace(/\s+/g, ' ').trim() || 'failed with no reason given'}`);

/** Four yes/no checks about one slide, each with a one-line definition, answered first so the same picture gets the same answer every time. */
export const DEVICE_CHECKS = 'DEVICE CHECKS: start your answer with ONE line <devices>marker=yes|no underline=yes|no profile=yes|no shapes=yes|no</devices>, then the <inventory> block, then the <svg>. Answer yes ONLY if you can see it: marker = a filled colour box behind part of a text line (like a highlighter bar); underline = a thin accent-coloured line directly under the last block of text; profile = a small round picture or avatar with a name or handle beside it, near the top; shapes = a filled colour block that touches a slide edge and takes at least 14% of the slide. Then draw exactly what you answered: yes means the drawing HAS that device (a marker is a <rect> in the accent colour behind those words; a profile is a circle with its name text beside it), no means it does NOT.';
export function buildWholeSlidePrompt(): string {
  return [
    buildRecreatePrompt({ w: SIZE.w, h: SIZE.h, ownRoles: [] }).replace('[recreate:new]', '[whole-slide:new]'),
    INVENTORY_RULES,
    `This is ONE reference slide, shown whole at full resolution. Draw it as ONE <svg viewBox="0 0 ${SIZE.w} ${SIZE.h}"> (after the <inventory> block), with data-type on the <svg> root: one of ${PACK_TYPES.join(' | ')} (the kind of slide it is).`,
    'The <svg> also has data-palette=\'{"bg":"#...","text":"#...","accent":"#...","accent2":"#...","surface":"#...","muted":"#..."}\' with the reference\'s REAL colours; "accent" is the reference\'s real accent colour (a red accent is red, never dark grey). In the drawing use colours ONLY as palette names (fill="$accent"), never hex.',
    'Text slots: every text is a <text> with data-role (kicker, tag, title, body, caption, number), data-min-size (32 or more) and data-max-lines. Image slots (data-image-slot) only for real photographs.',
    DEVICE_CHECKS,
    'NEVER approximate non-photo art (3D shapes, glows, blobs, illustrations, icons, logos) with a plain <rect>: draw it with paths, circles, ellipses, gradients, or, when you cannot, add data-cant-draw="what it is" to a <g> or shape at its place.',
  ].join('\n');
}

const mostCommon = <T,>(xs: T[]): T | undefined => {
  const n = new Map<string, { v: T; c: number }>();
  for (const v of xs) {
    const k = JSON.stringify(v);
    n.set(k, { v, c: (n.get(k)?.c ?? 0) + 1 });
  }
  return [...n.values()].sort((a, b) => b.c - a.c)[0]?.v;
};

type Box = [number, number, number, number];
/** The checker: how much of the drawn text boxes' area lies over text the detector found (boxes as shares 0 to 1; percent boxes are scaled). Not used to set anything. */
export function textOverlap(drawn: Box[], found: Box[]): number | null {
  if (!drawn.length) return null;
  const s = found.some((b) => b.some((v) => v > 1.5)) ? 0.01 : 1;
  const f = found.map((b) => b.map((v) => v * s) as Box);
  let area = 0;
  let hit = 0;
  for (const [x, y, w, h] of drawn) {
    area += w * h;
    let got = 0;
    for (const [fx, fy, fw, fh] of f) got += Math.max(0, Math.min(x + w, fx + fw) - Math.max(x, fx)) * Math.max(0, Math.min(y + h, fy + fh) - Math.max(y, fy));
    hit += Math.min(got, w * h);
  }
  return area ? Math.round((hit / area) * 100) / 100 : null;
}

export async function readWholeSlides(o: { reader: ReferenceReader; slides: WholeSlideIn[]; signal: AbortSignal; name?: string; /** Detected text boxes per slide (shares), only for the overlap check. */ detectedText?: (Box[] | null)[]; onProgress?: (done: number, total: number) => void }): Promise<WholeReadResult> {
  const slides = o.slides.slice(0, READ_MAX);
  const prompt = buildWholeSlidePrompt();
  const parsed: ({ type: PackType; v: PackVariant; pack: StylePack } | null)[] = slides.map(() => null);
  const reports: SlideReport[] = slides.map((s) => ({ file: s.name, typeRead: null, model: READ_MODEL, seconds: 0, ok: false, reasons: [], sanitiser: [], slots: 0, imageSlots: 0, cantDraw: 0 }));
  let next = 0;
  let done = 0;
  const one = async (i: number) => {
    const r = reports[i];
    const t0 = Date.now();
    try {
      const { text } = await o.reader.read({ role: 'draw', pin: true, prompt, images: [slides[i].image] }, o.signal);
      r.seconds = Math.round((Date.now() - t0) / 100) / 10;
      r.cantDraw = (text.match(/data-cant-draw\s*=/gi) ?? []).length;
      const dm = /<devices>([\s\S]*?)<\/devices>/i.exec(text)?.[1] ?? '';
      const yn = (k: string) => {
        const m = new RegExp('\\b' + k + '\\s*=\\s*(yes|no)\\b', 'i').exec(dm);
        return m ? m[1].toLowerCase() === 'yes' : undefined;
      };
      const ans = dm ? { marker: yn('marker'), underline: yn('underline'), profileHeader: yn('profile'), planes: yn('shapes') } : undefined;
      if (ans) r.devices = ans;
      const body = stripInventory(text);
      const first = /<svg[\s\S]*?<\/svg>/i.exec(body)?.[0];
      const a = await parsePack(first ?? body, o.name ?? 'Pack from references');
      if (!a.ok) {
        r.reasons = /(couldn.t|could not|can.t|cannot|unable to|don.t|do not) (find|see|open|locate|access)|no (image|picture|file)|doesn.t exist|does not exist/i.test(text) ? ['The image did not reach the model.', ...a.reasons] : a.reasons;
        return;
      }
      const type = (Object.keys(a.pack.designs)[0] ?? null) as PackType | null;
      if (!type || !a.pack.svgs?.[type]) {
        r.reasons = ['The answer had no usable slide design.'];
        return;
      }
      r.ok = true;
      r.typeRead = type;
      r.sanitiser = [...a.problems, ...a.pack.notes];
      r.slots = a.pack.slotMeta?.[type]?.length ?? 0;
      r.imageSlots = a.pack.imageSlots?.[type]?.length ?? 0;
      parsed[i] = { type, pack: a.pack, v: { svg: a.pack.svgs[type]!, layers: a.pack.designs[type]!, imageSlots: a.pack.imageSlots?.[type] ?? [], slotMeta: a.pack.slotMeta?.[type] ?? [], fromFile: slides[i].name, ...(ans ? { devices: ans } : {}) } };
      const det = o.detectedText?.[i];
      if (det) r.textOverlap = textOverlap(a.pack.slotMeta?.[type]?.map((m) => [m.x / SIZE.w, m.y / SIZE.h, m.w / SIZE.w, m.h / SIZE.h] as Box) ?? [], det);
    } catch (e) {
      r.seconds = Math.round((Date.now() - t0) / 100) / 10;
      const kind = (e as { kind?: string })?.kind;
      const more = ((e as { problems?: string[] })?.problems ?? []).slice(0, 3);
      r.reasons = [`${kind ? `${kind}: ` : ''}${e instanceof Error && e.message ? e.message : 'The read failed with no message.'}`, ...more];
    } finally {
      o.onProgress?.(++done, slides.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_PARALLEL, slides.length) }, async () => {
    while (next < slides.length && !o.signal.aborted) await one(next++);
  }));

  // The real reasons go to the browser console and to the dev server terminal, not only to the screen.
  for (const l of failureLines({ slides: reports })) {
    console.error(`[whole-read] ${l}`);
    try {
      void fetch('/__reference/log', { method: 'POST', body: l.slice(0, 600) }).catch(() => undefined);
    } catch {
      /* no dev server log */
    }
  }
  const ok = parsed.filter((p): p is NonNullable<typeof p> => !!p);
  const svgByFile = Object.fromEntries(ok.map((p) => [p.v.fromFile, p.v.svg]));
  const failed = reports.filter((r) => !r.ok).length;
  if (!ok.length) return { pack: null, report: { route: 'whole-slide', slides: reports, palette: {}, fonts: null, distinctCompositions: 0, failed }, svgByFile };

  const keys = [...new Set(ok.flatMap((p) => Object.keys(p.pack.palette)))];
  const palette = Object.fromEntries(keys.map((k) => [k, mostCommon(ok.map((p) => p.pack.palette[k]).filter(Boolean))!]));
  const fonts = { headline: mostCommon(ok.map((p) => p.pack.fonts.headline))!, body: mostCommon(ok.map((p) => p.pack.fonts.body))! };
  const variants: NonNullable<StylePack['variants']> = {};
  for (const p of ok) (variants[p.type] ??= []).push(p.v);
  const designs: StylePack['designs'] = {};
  const svgs: NonNullable<StylePack['svgs']> = {};
  const imageSlots: NonNullable<StylePack['imageSlots']> = {};
  const slotMeta: NonNullable<StylePack['slotMeta']> = {};
  for (const t of PACK_TYPES) {
    const v = variants[t]?.[0];
    if (!v) continue;
    designs[t] = v.layers;
    svgs[t] = v.svg;
    slotMeta[t] = v.slotMeta;
    if (v.imageSlots.length) imageSlots[t] = v.imageSlots;
  }
  const reps: Box[][] = [];
  for (const p of ok) {
    const b = slotBoxes(p.v.layers, { w: SIZE.w, h: SIZE.h });
    if (!reps.some((r) => sameComposition(r, b))) reps.push(b);
  }
  const pack: StylePack = { name: o.name ?? 'Pack from references', palette, fonts, motifs: [], designs, svgs, slotMeta, ...(Object.keys(imageSlots).length ? { imageSlots } : {}), variants, canvas: { ...SIZE }, notes: [`Read whole: ${ok.length} of ${slides.length} slides, ${reps.length} distinct composition${reps.length === 1 ? '' : 's'}.`, ...reports.filter((r) => !r.ok).map((r) => `${r.file}: not read (${r.reasons.join(' ')})`)] };
  pack.devices = signatureDevices(pack);
  pack.brief = styleBriefOf(pack);
  return { pack, report: { route: 'whole-slide', slides: reports, palette, fonts, distinctCompositions: reps.length, failed }, svgByFile };
}
