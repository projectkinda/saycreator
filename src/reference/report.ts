// "Download report": a small report.json (no image data) and one compare.jpg (reference slides on top, generated slides below, numbered), both built when the person clicks
// and never stored. No model calls: the slides are composed and drawn again with the code only.
import type { Doc } from '../carousel/doc';
import { composeDoc, renderer, styleByName, type Rendered } from '../carousel/render';
import { loadSaved, timingTable } from '../live/jobs';
import { activeReference } from './active';
import { bitmapFromUrl } from './images';
import { layoutText } from '../image-engine/draw/text';
import { pictureUseOf } from '../carousel/imagePlace';
import type { TextLayer } from '../image-engine/types';

export type SlideVerdict = 'good' | 'meh' | 'bad';
export interface ReportOptions {
  doc: Doc;
  includeRefs: boolean;
  verdicts: Record<number, SlideVerdict | undefined>;
  note: string;
}

const colourOf = (v: unknown): string => (typeof v === 'string' ? v : ((v as { stops?: { color: string }[] })?.stops?.[0]?.color ?? ''));

/** What was read from the references, in plain values: colours, fonts, layouts, the drawn boxes, and what the drawing could not make. */
export function readSummary(spec: Record<string, any> | undefined) {
  if (!spec) return null;
  const pal0 = Object.values((spec.palettes ?? {}) as Record<string, Record<string, unknown>>)[0] ?? {};
  const free = (spec.free ?? {}) as Record<string, { slots?: unknown[]; shapes?: unknown[]; photos?: unknown[]; background?: { kind?: string }; missing?: string[] }>;
  return {
    colours: Object.fromEntries(Object.entries(pal0).map(([k, v]) => [k, colourOf(v)]).filter(([, v]) => v)),
    fonts: spec.fonts ?? null,
    layouts: Object.fromEntries(Object.entries((spec.layouts ?? {}) as Record<string, { use: string }[]>).map(([t, r]) => [t, r.map((x) => x.use)])),
    graphics: Object.fromEntries(Object.entries(free).map(([t, f]) => [t, { textBoxes: f.slots?.length ?? 0, shapes: f.shapes?.length ?? 0, photoRegions: f.photos?.length ?? 0, background: f.background?.kind ?? null }])),
    skippedAsUnknown: [...new Set(Object.values(free).flatMap((f) => f.missing ?? []))],
  };
}

/** Role, final size and word count of each visible text layer of a slide (the size is the fitted one, as drawn). */
export function textSizesOf(layers: unknown[]): { role: string; size: number; words: number }[] {
  return (layers as { kind?: string; visible?: boolean; name?: string; text?: string; style?: { size: number } }[])
    .filter((l) => l.kind === 'text' && l.visible !== false && (l.text ?? '').trim())
    .map((l) => {
      let size = l.style?.size ?? 0;
      try {
        size = layoutText(l as unknown as TextLayer).size;
      } catch {
        /* fonts not ready: the design size */
      }
      return { role: l.name ?? '', size: Math.round(size), words: (l.text ?? '').trim().split(/\s+/).length };
    });
}

/** The words of a text, lower case, apostrophes made plain ("I’ll" and "I'll" are one word). */
export const wordsOfText = (t: string): string[] => (t.toLowerCase().replace(/[\u2018\u2019]/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? []);
/**
 * The wording check (measure only: the slides are never changed): every visible word of every slide is compared with the words of the source text. `wordsNotInSource` are the words the slides show
 * that the text does not have, `slidesWithChangedWording` the slide numbers (1-based) that show at least one, `matchPercent` the share of visible words that are in the source.
 */
export function wordingCheckOf(source: string, slideTexts: string[]): { totalWords: number; matchPercent: number | null; wordsNotInSource: string[]; slidesWithChangedWording: number[]; perSlide: { slide: number; words: number; notInSource: string[] }[] } {
  const have = new Set(wordsOfText(source));
  let total = 0;
  let match = 0;
  const notIn: string[] = [];
  const changed: number[] = [];
  const perSlide = slideTexts.map((t, i) => {
    const ws = wordsOfText(t);
    const miss = ws.filter((w) => !have.has(w));
    total += ws.length;
    match += ws.length - miss.length;
    miss.forEach((w) => !notIn.includes(w) && notIn.push(w));
    if (miss.length) changed.push(i + 1);
    return { slide: i + 1, words: ws.length, notInSource: [...new Set(miss)] };
  });
  return { totalWords: total, matchPercent: total && have.size ? Math.round((match / total) * 1000) / 10 : null, wordsNotInSource: notIn, slidesWithChangedWording: changed, perSlide };
}
/** Fields that are not words of the text: a button (an action, checked by the closing rule), numerals and positions, pictures, the accent list. */
const NOT_WORDS = new Set(['button', 'button1', 'button2', 'step', 'num', 'numeral', 'number', 'numbers', 'position', 'bar', 'accent', 'url', 'brand', 'current']);
/**
 * Phrase level (Round 13, measure only): for every slide field (kicker, headline, caption, sub, a card, each list item ...), whether its words, in order, are a CONTIGUOUS run of the source text
 * (case, punctuation, list numbers ignored). A field that is not (a kicker or a headline the writer made up, a reordered sentence) is listed with its slide and field name.
 */
export function fieldsNotInSourceOf(source: string, specs: { fields: Record<string, unknown> }[]): { slide: number; field: string; text: string }[] {
  const src = wordsOfText(source.replace(/^[ \t]*(?:\d{1,2}[.)]|[-*\u2022])[ \t]+/gm, ''));
  const contiguous = (ws: string[]) => {
    if (!ws.length) return true;
    for (let i = 0; i + ws.length <= src.length; i++) {
      let k = 0;
      while (k < ws.length && src[i + k] === ws[k]) k++;
      if (k === ws.length) return true;
    }
    return false;
  };
  const out: { slide: number; field: string; text: string }[] = [];
  specs.forEach((sp, i) => {
    for (const [k, v] of Object.entries(sp.fields ?? {})) {
      if (NOT_WORDS.has(k) || /^image\d?$/.test(k)) continue;
      for (const t of Array.isArray(v) ? v : [v]) {
        if (typeof t !== 'string' || !t.trim()) continue;
        const ws = wordsOfText(t);
        if (!ws.length || ws.every((w) => /^\d+$/.test(w))) continue;
        if (!contiguous(ws)) out.push({ slide: i + 1, field: k, text: t.trim() });
      }
    }
  });
  return out;
}
/** The visible words of a composed slide's layers: every text except the page counter, the swipe cue, the handle and decoration. */
export const visibleTextOf = (layers: unknown[]): string =>
  (layers as { kind?: string; visible?: boolean; id?: string; name?: string; role?: string; text?: string }[])
    .filter((l) => l.kind === 'text' && l.visible !== false && l.role !== 'decor' && !/recurring|^page|^swipe|^handle|^strip|^dots/.test(`${l.id ?? ''} ${l.name ?? ''}`) && (l.text ?? '').trim())
    .map((l) => l.text)
    .join(' ');

/** The library layout slide i was drawn with, when the layout library drew that slide (else null: the old route's own layout and rule are reported). */
export function libraryLayoutOf(doc: Doc, i: number): string | null {
  const d = doc.designed;
  if (!d?.library || !d.slides?.[String(i)]) return null;
  return d.library.layouts?.[i] ?? d.layouts?.[String(i)] ?? null;
}

export async function buildReport(o: ReportOptions): Promise<{ json: string; compare: Blob | null; slides: number }> {
  const composed = composeDoc(o.doc);
  const rendered: Rendered[] = [];
  for (const s of composed.slides) rendered.push(await renderer.render(s, composed.margin));
  const act = activeReference();
  const spec = (act?.spec ?? styleByName(o.doc.style)?.spec) as Record<string, any> | undefined;
  const job = await loadSaved()
    .then((j) => j.find((x) => x.cost) ?? j[0])
    .catch(() => undefined);
  const report = {
    kind: 'say-creator-report',
    createdAt: new Date().toISOString(),
    style: o.doc.style,
    format: o.doc.format,
    referenceFiles: (act?.report?.files ?? []).map((f) => ({ name: f.name, bytes: f.bytes ?? null, width: f.width, height: f.height })),
    read: readSummary(spec),
    wholeRead: act?.whole ?? null,
    model: job
      ? { job: job.title, calls: job.cost?.calls ?? null, pictures: job.cost?.images ?? null, seconds: Math.round((((job.endedAt ?? job.startedAt) - job.startedAt) / 1000) * 10) / 10, stages: timingTable(job).map((r) => ({ stage: r.stage, seconds: r.seconds })), fromCache: !!job.cached }
      : { calls: null, seconds: null, note: 'No job has been run in this browser yet.' },
    route: o.doc.route?.route ?? (o.doc.designed ? 'designed' : 'pack'),
    /** The text the person typed, as the writer received it. */
    sourceText: o.doc.topic ?? '',
    /** Round 13: the project's pictures and what became of them in the final deck. */
    pictures: o.doc.designed?.library?.plan?.specs ? pictureUseOf(o.doc.designed.library.plan.specs, (o.doc.photos ?? []).filter((p) => p.kind === 'photo').map((p) => ({ id: p.id, width: p.width, height: p.height, ...(p.content ? { content: p.content } : {}) }))) : null,
    /** Round 12: every visible word of every slide compared with the source text (measure only, nothing is changed). */
    wordingCheck: { ...wordingCheckOf(o.doc.topic ?? '', composed.slides.map((s) => visibleTextOf((s as unknown as { plan?: { layers?: unknown[] } }).plan?.layers ?? []))), fieldsNotInSource: o.doc.designed?.library?.plan?.specs ? fieldsNotInSourceOf(o.doc.topic ?? '', o.doc.designed.library.plan.specs as { fields: Record<string, unknown> }[]) : [] },
    routeReason: o.doc.route?.reason ?? (o.doc.designed ? 'Designed slides are present (the route was not recorded).' : 'No route was recorded for this project: the style templates are assumed to have filled the slides.'),
    designedCalls: o.doc.designed?.calls ?? null,
    designed: o.doc.designed ? { calls: o.doc.designed.calls, tokens: o.doc.designed.tokens ?? null, layouts: o.doc.designed.layouts ?? null, fallbacks: o.doc.designed.fallbacks, notes: o.doc.designed.notes, requestBytes: o.doc.designed.requestBytes ?? null, library: o.doc.designed.library ?? null, model: 'DRAW_MODEL, else CAROUSEL_MODEL, else sonnet (server setting)' } : o.doc.route?.error ? { failed: true, error: o.doc.route.error, requestBytes: o.doc.route.requestBytes ?? null } : null,
    slides: composed.slides.map((s, i) => ({
      number: i + 1,
      type: s.type,
      // a deck the layout library drew: the library layout each slide really uses, and none of the old route's rule / because / palette lines (they describe a drawing that did not happen)
      ...(libraryLayoutOf(o.doc, i)
        ? { layout: libraryLayoutOf(o.doc, i), drawnBy: 'layout library' }
        : { layout: s.layout, rule: s.rule, palette: s.palette, because: s.because }),
      notes: ((s as unknown as { notes?: string[] }).notes ?? []).slice(0, 6),
      checks: rendered[i].lint.map((l) => ({ id: l.id, label: l.label, pass: l.pass, ...(l.warn ? { warn: true } : {}), reason: l.reason, ...(l.measured !== undefined ? { measured: l.measured, limit: l.limit } : {}) })),
      failedChecks: rendered[i].lint.filter((l) => !l.pass).map((l) => l.id),
      warnings: rendered[i].warnings.slice(0, 6),
      repairs: rendered[i].repairs,
      /** The final text sizes: each visible text layer's role, final size (px, as fitted) and words. */
      textSizes: textSizesOf((s as unknown as { plan?: { layers?: unknown[] } }).plan?.layers ?? []),
      words: textSizesOf((s as unknown as { plan?: { layers?: unknown[] } }).plan?.layers ?? []).reduce((a, t) => a + t.words, 0),
      verdict: o.verdicts[i] ?? null,
    })),
    whatIWantedAndWhatsWrong: o.note.trim(),
  };
  const refs = o.includeRefs ? (act?.report?.thumbs ?? []) : [];
  const compare = rendered.length || refs.length ? await compareImage(refs, rendered.map((r) => r.png)) : null;
  return { json: JSON.stringify(report, null, 2), compare, slides: rendered.length };
}

/** One picture about 1600 px wide: the reference slides on top (R1, R2...), the generated slides below (1, 2...), up to 6 to a row. Nothing is stored. */
export async function compareImage(refUrls: string[], generated: Blob[]): Promise<Blob> {
  const W = 1600;
  const gap = 16;
  const label = 34;
  const per = 6;
  const sets: { name: string; bms: ImageBitmap[]; tag: string }[] = [];
  if (refUrls.length) sets.push({ name: 'Reference', bms: await Promise.all(refUrls.map((u) => bitmapFromUrl(u))), tag: 'R' });
  if (generated.length) sets.push({ name: 'Generated', bms: await Promise.all(generated.map((b) => createImageBitmap(b))), tag: '' });
  const cols = Math.min(per, Math.max(1, ...sets.map((s) => s.bms.length)));
  const cw = Math.floor((W - gap * (cols + 1)) / cols);
  // Row heights: the tallest picture of a row, scaled to the cell width.
  const rows: { set: number; items: ImageBitmap[]; h: number; start: number }[] = [];
  sets.forEach((s, si) => {
    for (let i = 0; i < s.bms.length; i += cols) {
      const items = s.bms.slice(i, i + cols);
      rows.push({ set: si, items, start: i, h: Math.round(Math.max(...items.map((b) => (b.height / b.width) * cw))) });
    }
  });
  const head = 40;
  const H = rows.reduce((a, r, i) => a + r.h + label + gap + (i === 0 || rows[i - 1].set !== r.set ? head : 0), gap);
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, W, H);
  let y = gap;
  rows.forEach((r, ri) => {
    if (ri === 0 || rows[ri - 1].set !== r.set) {
      g.fillStyle = '#111';
      g.font = 'bold 26px sans-serif';
      g.fillText(sets[r.set].name, gap, y + 28);
      y += head;
    }
    r.items.forEach((b, i) => {
      const x = gap + i * (cw + gap);
      const h = Math.round((b.height / b.width) * cw);
      g.fillStyle = '#111';
      g.font = 'bold 22px sans-serif';
      g.fillText(`${sets[r.set].tag}${r.start + i + 1}`, x, y + 24);
      g.drawImage(b, x, y + label, cw, h);
    });
    y += r.h + label + gap;
  });
  sets.forEach((s) => s.bms.forEach((b) => b.close()));
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
}
