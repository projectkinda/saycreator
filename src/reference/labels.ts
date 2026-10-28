// The reader only LABELS. It is sent the picture with numbered boxes and the treatments the code detected, and it says what each box is: the role of
// each text box, what each unlabelled graphic is (from the toolbox's marks), how emphasis is shown. It is never asked for positions, sizes or fonts, and
// anything it says about those is ignored. One call; the answer is checked before it is used.
import { MARK_KINDS } from '../image-engine/styles/marks-spec';
import { FREE_ROLES, type FreeGraphic, type FreeLayout, type FreeRole } from '../image-engine/styles/free-spec';
import { SLIDE_TYPES, type SlideType } from '../image-engine/styles/format';
import type { Detected } from './regions';
import type { ReaderImage, ReferenceReader } from './reader';
import { ReaderError } from './reader';
import type { MissingTool } from './types';

/** The marks a graphic can be labelled as (shapes that need words, like stamps, are left to the person). */
export const GRAPHIC_LABELS = ['asterisk', 'sparkle', 'round-badge', 'starburst-badge', 'arrow', 'scribble-circle', 'tape', 'unknown'] as const;

const fmt = (b: { x: number; y: number; w: number; h: number }) => `x ${b.x}%, y ${b.y}%, ${b.w}% wide, ${b.h}% tall`;

/** The text sent with each reference: its numbered boxes and what was detected, in plain words. The ids carry the image number (r1T1 is box T1 of ref1.jpg). */
export function describeBoxes(d: Detected, n: number): string[] {
  const out: string[] = [];
  d.texts.forEach((t, i) => out.push(`r${n}T${i + 1} (text): ${fmt(t.box)}; ${t.lines.length} line${t.lines.length === 1 ? '' : 's'}, aligned ${t.align}, colour ${t.colour}${t.caps ? ', capitals' : ''}${t.treatments.length ? `; treatments seen: ${t.treatments.map((x) => x.detail).join('; ')}` : ''}`));
  d.photos.forEach((p, i) => out.push(`r${n}P${i + 1} (photo, ${p.shape}): ${fmt(p.box)}`));
  d.shapes.forEach((s, i) => out.push(`r${n}S${i + 1} (flat ${s.kind}, ${s.colour}): ${fmt(s.box)}${s.holds ? '; text sits on it' : ''}`));
  d.graphics.forEach((g, i) => out.push(`r${n}G${i + 1} (${g.kind === 'ring' ? 'a ring' : 'a graphic that is not text and not a photo'}, ${g.colour}): ${fmt(g.box)}`));
  return out;
}

/** The order the boxes were numbered in, so a label for r1T2 finds the second text block. */
export function idsOf(d: Detected, n: number) {
  return { text: d.texts.map((_, i) => `r${n}T${i + 1}`), graphic: d.graphics.map((_, i) => `r${n}G${i + 1}`) };
}

export function buildLabelPrompt(o: { ds: Detected[]; names: string[] }): string {
  return [
    'You label the parts of reference slides. The code has already found every box and measured its position, size, colour and text effects: you do NOT give positions, sizes, colours or fonts, and anything you say about them is ignored.',
    'You never write code, SVG, CSS or drawing instructions. Reply with ONE JSON object and nothing else (no code fence, no explanation).',
    '',
    'The reference images are the files in the current folder (look at each with your Read tool). Each shows its boxes drawn and numbered. The boxes:',
    ...o.ds.flatMap((d, i) => [`${o.names[i]}:`, ...describeBoxes(d, i + 1).map((l) => `  ${l}`)]),
    '',
    `Roles for text boxes: ${FREE_ROLES.join(', ')}. title is the main headline, subtitle the line that supports it, body running text, label a small tag or kicker, number a big figure or step number, button a call to action, decoration text used only as a pattern.`,
    `Kinds for graphics: ${GRAPHIC_LABELS.join(', ')}. Use "unknown" if it is none of these (for example a logo, an icon, a person, a doodle, a 3D object).`,
    `seen_slide_types: for each reference, the kind of slide it is, from: ${SLIDE_TYPES.join(', ')}.`,
    '',
    'Reply with this JSON:',
    '{"roles": {"r1T1": "title", ...for every text box}, "graphics": {"r1G1": "asterisk", ...for every graphic}, "emphasis": {"r1T1": "how emphasis is shown, in a few words"}, "seen_slide_types": ["cover", ...one per reference, in order], "images_with_photos": ["ref1.jpg" ...those that clearly show a photo, a person, a device or an object], "missing": [{"tool": "short name", "why": "one sentence"}], "notes": "one sentence on the look"}',
  ].join('\n');
}

export interface Labels {
  roles: Record<string, FreeRole>;
  graphics: Record<string, string>;
  emphasis: Record<string, string>;
  seenSlideTypes: SlideType[];
  photoImages: string[];
  missing: MissingTool[];
  notes: string;
}

/** Checks the answer. Unknown ids and values are dropped (said in `problems`); an answer that is not usable at all fails. */
export function parseLabels(text: string, ids: { text: string[]; graphic: string[] }[]): { ok: true; labels: Labels; problems: string[] } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    const m = /\{[\s\S]*\}/.exec(text);
    raw = JSON.parse(m ? m[0] : text);
  } catch {
    return { ok: false, errors: ['The answer was not JSON.'] };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, errors: ['The answer must be a JSON object.'] };
  const r = raw as Record<string, unknown>;
  const problems: string[] = [];
  const allText = new Set(ids.flatMap((i) => i.text));
  const allGraphic = new Set(ids.flatMap((i) => i.graphic));
  const roles: Record<string, FreeRole> = {};
  for (const [k, v] of Object.entries((r.roles as Record<string, unknown>) ?? {})) {
    if (!allText.has(k)) problems.push(`"${k}" is not a text box.`);
    else if (!(FREE_ROLES as readonly string[]).includes(v as string)) problems.push(`"${String(v)}" is not a role (${FREE_ROLES.join(', ')}).`);
    else roles[k] = v as FreeRole;
  }
  const graphics: Record<string, string> = {};
  for (const [k, v] of Object.entries((r.graphics as Record<string, unknown>) ?? {})) {
    if (!allGraphic.has(k)) problems.push(`"${k}" is not a graphic.`);
    else if (!(GRAPHIC_LABELS as readonly string[]).includes(v as string)) problems.push(`"${String(v)}" is not a graphic kind the toolbox draws.`);
    else graphics[k] = v as string;
  }
  if (Object.keys(roles).length === 0 && allText.size > 0) return { ok: false, errors: ['No text box was given a valid role.', ...problems.slice(0, 6)] };
  const emphasis: Record<string, string> = {};
  for (const [k, v] of Object.entries((r.emphasis as Record<string, unknown>) ?? {})) if (typeof v === 'string' && allText.has(k)) emphasis[k] = v.slice(0, 80);
  const seen = (Array.isArray(r.seen_slide_types) ? r.seen_slide_types : []).filter((t): t is SlideType => (SLIDE_TYPES as string[]).includes(t as string));
  const photos = (Array.isArray(r.images_with_photos) ? r.images_with_photos : []).filter((x): x is string => typeof x === 'string');
  const missing = (Array.isArray(r.missing) ? r.missing : []).flatMap((m) => (typeof m === 'object' && m !== null && typeof (m as { tool?: unknown }).tool === 'string' ? [{ tool: String((m as { tool: string }).tool).slice(0, 80), why: String((m as { why?: unknown }).why ?? '').slice(0, 200) }] : []));
  return { ok: true, problems, labels: { roles, graphics, emphasis, seenSlideTypes: seen, photoImages: photos, missing, notes: typeof r.notes === 'string' ? r.notes.slice(0, 300) : '' } };
}

/** One call to the reader. A second try is made once if the answer cannot be used, and counts as a call. */
export async function labelReference(o: { reader: ReferenceReader; ds: Detected[]; names: string[]; images: ReaderImage[]; signal: AbortSignal }): Promise<{ labels: Labels; problems: string[]; ms: number; attempts: 1 | 2 }> {
  const ids = o.ds.map((d, i) => idsOf(d, i + 1));
  const prompt = buildLabelPrompt({ ds: o.ds, names: o.names });
  let a = await o.reader.read({ prompt, images: o.images }, o.signal);
  let total = a.ms;
  let p = parseLabels(a.text, ids);
  let attempts: 1 | 2 = 1;
  if (!p.ok) {
    attempts = 2;
    a = await o.reader.read({ prompt: [prompt, '', 'Your previous answer was:', a.text.slice(0, 4000), '', 'It cannot be used, for these reasons:', ...p.errors.map((e) => `- ${e}`), '', 'Answer again with ONE JSON object that fixes this.'].join('\n'), images: o.images }, o.signal);
    total += a.ms;
    p = parseLabels(a.text, ids);
  }
  if (!p.ok) throw new ReaderError('invalid', 'The reader answered twice, but neither answer could be used as labels.', p.errors);
  return { labels: p.labels, problems: p.problems, ms: total, attempts };
}

/** Puts the labels on the free layout of reference `n` (1-based): roles on the slots, and the labelled graphics as marks the toolbox draws. */
export function applyLabels(free: FreeLayout, d: Detected, n: number, labels: Labels, colourOf: (g: { colour: string }) => string = (g) => g.colour): { free: FreeLayout; unidentified: string[] } {
  const slots = free.slots.map((s) => {
    const i = d.texts.findIndex((t) => t.id === s.id);
    const role = i >= 0 ? labels.roles[`r${n}T${i + 1}`] : undefined;
    return role ? { ...s, role } : s;
  });
  const graphics: FreeGraphic[] = [];
  const unidentified: string[] = [];
  d.graphics.forEach((g, i) => {
    if (g.kind === 'ring') return;
    const kind = labels.graphics[`r${n}G${i + 1}`];
    if (kind && kind !== 'unknown' && (MARK_KINDS as readonly string[]).includes(kind)) graphics.push({ id: g.id, kind, box: g.box, colour: colourOf(g) });
    else unidentified.push(`graphic ${g.id} (${fmt(g.box)}): the reader could not name it as a mark the toolbox has`);
  });
  const missing = [...(free.missing ?? []).filter((m) => !/not identified yet/.test(m)), ...unidentified];
  return { free: { ...free, slots, graphics, missing: [...new Set(missing)] }, unidentified };
}
