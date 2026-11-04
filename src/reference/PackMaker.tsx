// "Make the rest of the set" / "Make a pack from this description": one model call returns several SVG slide designs (a style pack), shown side by side, checked for
// distinct compositions, saved as a template. Applying a pack to a script is code only. The estimate is shown before anything is sent.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { packPicture } from './packRender';
import { blankStyle } from './blank';
import { setActiveReference } from './active';
import { readerImageOf } from './images';
import { buildPackPrompt, callPack, distinctCheck, hasTextSlots, PACK_CAP, PACK_TYPES, parsePack, type PackType, type StylePack } from './pack';
import { detectReaders, type ReferenceReader } from './reader';
import type { RLayer } from './recreate';
import { saveTemplate, styleNameFor } from './templates';

/** Pack calls in this session (a page load). */
let used = 0;
const ls = new Set<() => void>();
const usePackCalls = () => useSyncExternalStore((l) => (ls.add(l), () => void ls.delete(l)), () => used);
const SECONDS_PER_DESIGN = 18;

export const SAMPLES: Record<PackType, Record<string, unknown>> = {
  cover: { type: 'cover', kicker: 'Example', headline: 'A headline that makes people stop', sub: 'And a line that makes them read on' },
  step: { type: 'step', number: 2, headline: 'Do the small thing first', body: 'Start with the step that takes five minutes. Momentum does the rest.' },
  content: { type: 'content', headline: 'Why it works', body: 'People finish what they have already started. Make the first move tiny and the rest follows.' },
  list: { type: 'checklist', headline: 'Before you post', items: ['Read it out loud', 'Cut one sentence', 'Check the first line', 'Add one example'] },
  stat: { type: 'stat', kicker: 'The numbers', value: '87%', label: 'of people skim', note: 'before they read a word' },
  quote: { type: 'quote', quote: 'Clear beats clever, every single time.', by: 'An editor' },
  cta: { type: 'closing', headline: 'Save this for later', cta: 'Follow for more' },
};
const blobUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); });
export async function packThumbs(pack: StylePack, scale = 0.22): Promise<{ type: string; url: string; blob: Blob }[]> {
  const out: { type: string; url: string; blob: Blob }[] = [];
  for (const type of Object.keys(pack.designs).filter((k) => k !== 'base')) {
    const s = SAMPLES[type as PackType] ?? SAMPLES.content;
    const blob = await packPicture(pack, String(s.type), s, Math.round(pack.canvas.w * scale));
    out.push({ type, url: URL.createObjectURL(blob), blob });
  }
  return out;
}

export function PackMaker({ kind, description, reference, first }: { kind: 'reference' | 'description'; description?: string; reference?: { url: string } | null; first?: { svg?: string; layers: RLayer[] } | null }) {
  const calls = usePackCalls();
  const [readers, setReaders] = useState<ReferenceReader[] | null>(null);
  const [size, setSize] = useState<'quick' | 'full'>('quick');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pack, setPack] = useState<StylePack | null>(null);
  const [thumbs, setThumbs] = useState<{ type: string; url: string; blob: Blob }[]>([]);
  const [name, setName] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let live = true;
    void detectReaders().then((r) => live && setReaders(r));
    return () => {
      live = false;
    };
  }, []);
  const types: PackType[] = size === 'quick' ? ['cover', 'content'] : [...PACK_TYPES];
  const noReader = !readers?.length;
  const needs = kind === 'description' ? !!description?.trim() : !!reference;

  const make = async () => {
    if (busy || noReader || !needs || used >= PACK_CAP) return;
    setBusy(true);
    setMsg(`Designing ${types.length} slide types…`);
    abort.current = new AbortController();
    used++;
    ls.forEach((l) => l());
    const t0 = performance.now();
    try {
      const images = kind === 'reference' && reference ? [readerImageOf(reference.url, 'reference.jpg')] : [];
      const text = await callPack(readers![0], buildPackPrompt({ kind, types, description, firstSvg: first?.svg }), images, abort.current.signal);
      const r = await parsePack(text, name.trim() || (kind === 'description' ? `Pack: ${(description ?? '').slice(0, 24)}` : 'Pack from a reference'));
      if (!r.ok) {
        setMsg(`The designs could not be used: ${r.reasons.join(' ')}`);
        return;
      }
      // Every design needs text slots: the ones that came without are asked for once more.
      let pk = r.pack;
      let retried = '';
      const missing = types.filter((t) => !pk.designs[t]);
      if (missing.length && used < PACK_CAP) {
        setMsg(`${missing.join(', ')} had no text slots: asking once more…`);
        used++;
        ls.forEach((l) => l());
        retried = missing.join(', ');
        const again = await callPack(readers![0], buildPackPrompt({ kind, types: missing, description, firstSvg: first?.svg, retry: `no text slots (<text> with data-role) in: ${missing.join(', ')}` }), images, abort.current.signal);
        const r2 = await parsePack(again, pk.name, pk.palette);
        if (r2.ok) pk = { ...pk, designs: { ...pk.designs, ...r2.pack.designs }, notes: [...pk.notes, ...r2.pack.notes] };
      }
      // The first slide of a reference is only kept as the base design when it has text slots of its own.
      const baseOk = !!first?.layers && hasTextSlots(first.layers);
      const p = { ...pk, ...(baseOk ? { designs: { ...pk.designs, base: first!.layers }, ...(first!.svg ? { svgs: { ...pk.svgs, base: first!.svg } } : {}) } : {}), notes: [...pk.notes, ...(first && !baseOk ? ['The first slide has no text slots, so it is not kept as a fallback design.'] : [])] };
      setPack(p);
      setThumbs(await packThumbs(p));
      setName(p.name);
      setActiveReference({ spec: { ...blankStyle(), name: 'pack', title: 'Style pack' }, thumb: '', learn: 'everything', target: 'carousel', ratioNote: null, photoRegion: null, source: 'pack', pack: p });
      setMsg(`${Object.keys(p.designs).filter((k) => k !== 'base').length} slide designs made${retried ? ` (asked once more for ${retried})` : ''} in ${Math.round((performance.now() - t0) / 1000)} s.${r.problems.length ? ` ${r.problems.slice(0, 2).join(' ')}` : ''}`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!pack) return;
    const title = name.trim() || pack.name;
    const preview = thumbs[0] ? await blobUrl(thumbs[0].blob) : '';
    await saveTemplate({ name: title, target: 'carousel', spec: { ...blankStyle(), name: styleNameFor(title), title }, preview, pack: { ...pack, name: title } });
    setMsg(`Saved “${title}” as a template with the Mine tag: ${Object.keys(pack.designs).length} designs, no pictures. Applying it to a script uses no model call.`);
  };
  const check = pack ? distinctCheck(pack) : null;

  return (
    <div className="rf-pack" role="group" aria-label={kind === 'reference' ? 'Make the rest of the set' : 'Make a pack from the description'}>
      <h4 className="h4">{kind === 'reference' ? 'Make the rest of the set' : 'Make a style pack from this description'}</h4>
      <div className="tn-field" role="radiogroup" aria-label="Pack size">
        <button type="button" role="radio" aria-checked={size === 'quick'} className="chip-btn" onClick={() => setSize('quick')}>Quick (cover and one content slide)</button>
        <button type="button" role="radio" aria-checked={size === 'full'} className="chip-btn" onClick={() => setSize('full')}>Full set (7 slide types)</button>
      </div>
      <p className="small muted" role="status" aria-label="Pack estimate">Estimate: 1 model call (2 if a design comes without text), about {types.length * SECONDS_PER_DESIGN} s, {types.length} designs ({types.join(', ')}). Pack calls used: {calls} of {PACK_CAP}.</p>
      <div className="row-actions">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || noReader || !needs || calls >= PACK_CAP} onClick={() => void make()}>{busy ? 'Working…' : 'Make the set'}</button>
        {busy && <button type="button" className="btn btn-outline btn-sm" onClick={() => abort.current?.abort()}>Cancel</button>}
      </div>
      {msg && <p className="small" role="status" aria-live="polite" data-testid="pack-status">{msg}</p>}
      {pack && (
        <>
          <ol className="cr-film rf-pack-sheet" aria-label="Pack slide types">
            {thumbs.map((t) => (
              <li key={t.type} aria-label={`Design ${t.type}`}>
                <img src={t.url} alt={`${t.type} design`} width={110} />
                <span className="small">{t.type}</span>
              </li>
            ))}
          </ol>
          {check && !check.ok && <p className="small cr-warn" role="status">These slide types share a composition (same text places): {check.alike.map((a) => a.join(' and ')).join('; ')}. Make the set again, or change them by hand.</p>}
          {pack.notes.length > 0 && <p className="small muted">{pack.notes.slice(0, 3).join(' ')}</p>}
          <div className="row-actions">
            <label className="tn-field"><span className="field-label">Name of the pack</span><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Name of the pack" /></label>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void save()}>Save pack as template</button>
          </div>
        </>
      )}
    </div>
  );
}
