// "Redesign this slide" for a deck the layout library drew: thumbnails of every layout that can take the slide's text, and of its plane (cut) options. A click draws the slide
// again in code from the stored plan: no model call. "Rewrite text" is the one small model call: new text for the same layout, this slide only.
import { useEffect, useRef, useState } from 'react';
import { svgToPng } from '../reference/faithful';
import type { PickChoice, PickTile } from './designLibraryPick';

type Shown = PickTile & { url: string };
const GROUPS: { kind: PickTile['kind'][]; title: string }[] = [
  { kind: ['layout'], title: 'Layouts that can take this text' },
  { kind: ['cut', 'variant', 'invert'], title: 'Planes and colours of this layout' },
];

export function LayoutPicker({ index, load, onChoose, onRewrite }: {
  index: number;
  /** Draws the options (no model); calls onTile as each is ready. */
  load: (onTile: (t: PickTile) => void) => Promise<void>;
  /** Draws the slide again with the choice; says what happened. */
  onChoose: (c: PickChoice) => Promise<string>;
  /** One small model call for this slide; says what happened. */
  onRewrite: (words: string) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [tiles, setTiles] = useState<Shown[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState('');
  const run = useRef(0);
  const urls = useRef<string[]>([]);

  const fill = async () => {
    const id = ++run.current;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    setTiles([]);
    setLoading(true);
    try {
      await load(async (t) => {
        if (id !== run.current) return;
        const png = await svgToPng(t.svg, 220);
        if (id !== run.current) return;
        const url = URL.createObjectURL(png);
        urls.current.push(url);
        setTiles((a) => [...a, { ...t, url }]);
      });
    } catch (e) {
      if (id === run.current) setMsg('Could not draw the options: ' + (e as Error).message);
    } finally {
      if (id === run.current) setLoading(false);
    }
  };
  useEffect(() => () => {
    run.current++;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const choose = async (c: PickChoice) => {
    setBusy(true);
    setMsg('');
    setMsg(await onChoose(c));
    setBusy(false);
    void fill();
  };

  return (
    <details className="tn-field" data-testid={`picker-${index}`} open={open} onToggle={(e) => { const o = (e.target as HTMLDetailsElement).open; setOpen(o); if (o && !tiles.length && !loading) void fill(); }}>
      <summary className="field-label">Redesign this slide: pick a layout (drawn by the code, no model call)</summary>
      {loading && tiles.length === 0 && <p className="small muted" role="status">Drawing the options…</p>}
      {GROUPS.map((g) => {
        const list = tiles.filter((t) => g.kind.includes(t.kind));
        if (!list.length) return null;
        return (
          <div key={g.title}>
            <span className="small muted">{g.title}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '6px 0 10px' }}>
              {list.map((t) => (
                <button key={t.kind + t.id} type="button" className="btn btn-outline btn-sm" disabled={busy || t.current} aria-pressed={t.current} aria-label={`${t.current ? 'Current: ' : 'Use '}${t.label}`} title={t.note ?? t.label} data-testid={`pick-${t.kind}-${t.id}`} onClick={() => void choose(t.choice)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 6, width: 124, outline: t.current ? '2px solid currentColor' : undefined }}>
                  <img src={t.url} alt="" width={108} height={135} style={{ objectFit: 'cover', borderRadius: 4 }} />
                  <span className="small">{t.label}{t.current ? ' (now)' : ''}</span>
                  {t.note && <span className="small muted" style={{ fontSize: 11, lineHeight: 1.2, whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center' }}>{t.note}</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {loading && tiles.length > 0 && <p className="small muted" role="status">Drawing more options…</p>}
      <div className="tn-field" data-testid={`rewrite-${index}`}>
        <span className="field-label">Rewrite text: 1 small model call for this slide only, same layout</span>
        <input className="input" value={words} disabled={busy} placeholder="optional: shorter, punchier" aria-label={`Words for rewriting slide ${index + 1}`} onChange={(e) => setWords(e.target.value)} />
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={async () => { setBusy(true); setMsg(''); setMsg(await onRewrite(words)); setBusy(false); void fill(); }}>{busy ? 'Working…' : 'Rewrite text'}</button>
      </div>
      {msg && <span className="small" role="status">{msg}</span>}
    </details>
  );
}
