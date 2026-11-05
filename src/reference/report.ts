// "Download report": a small report.json (no image data) and one compare.jpg (reference slides on top, generated slides below, numbered), both built when the person clicks
// and never stored. No model calls: the slides are composed and drawn again with the code only.
import type { Doc } from '../carousel/doc';
import { composeDoc, renderer, styleByName, type Rendered } from '../carousel/render';
import { loadSaved, timingTable } from '../live/jobs';
import { activeReference } from './active';
import { bitmapFromUrl } from './images';
import { layoutText } from '../image-engine/draw/text';
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
    designedCalls: o.doc.designed?.calls ?? null,
    designed: o.doc.designed ? { calls: o.doc.designed.calls, tokens: o.doc.designed.tokens ?? null, layouts: o.doc.designed.layouts ?? null, fallbacks: o.doc.designed.fallbacks, notes: o.doc.designed.notes, model: 'DRAW_MODEL, else CAROUSEL_MODEL, else sonnet (server setting)' } : null,
    slides: composed.slides.map((s, i) => ({
      number: i + 1,
      type: s.type,
      layout: s.layout,
      rule: s.rule,
      palette: s.palette,
      because: s.because,
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
