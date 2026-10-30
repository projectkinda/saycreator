import type { CaptureBeat } from './types';

const makeId = () => crypto.randomUUID();

export function beatsFromText(input: string): CaptureBeat[] {
  const blocks = input.trim().split(/\n\s*\n/).flatMap((block) => {
    const clean = block.trim();
    if (!clean) return [];
    return clean.length > 180 ? clean.split(/(?<=[.!?])\s+/) : [clean];
  });
  return blocks.filter(Boolean).map((text) => ({ id: makeId(), text }));
}

export function beatsFromWriterJson(input: string): CaptureBeat[] {
  const parsed: unknown = JSON.parse(input);
  const root = parsed as { beats?: unknown; script?: { beats?: unknown }; title?: unknown; slides?: unknown };
  const raw = root.beats ?? root.script?.beats;
  if (!Array.isArray(raw)) throw new Error('This JSON has no beats array. Paste plain text instead.');
  return raw.map((item, index) => {
    if (typeof item === 'string') return { id: makeId(), text: item };
    const beat = item as { text?: unknown; cue?: unknown; delivery?: unknown; note?: unknown };
    if (typeof beat.text !== 'string' || !beat.text.trim()) throw new Error(`Beat ${index + 1} needs text.`);
    return {
      id: makeId(),
      text: beat.text.trim(),
      cue: typeof (beat.cue ?? beat.delivery) === 'string' ? String(beat.cue ?? beat.delivery) : undefined,
      note: typeof beat.note === 'string' ? beat.note : undefined,
    };
  });
}
