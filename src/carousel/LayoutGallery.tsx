// The layout gallery of a library slide, in plain sight under the slide's picture. It lists EVERY layout of the registry (nothing is typed here per layout), each in both
// variants, drawn by the code with THIS slide's own text and the deck's style. A layout that cannot show the slide's text is greyed out with one line of reason and cannot
// be applied. One click draws this slide again in code (no model call; one undo step). The plane and colour options sit beside it as small controls.
// Thumbnails are drawn when the gallery scrolls into view, one after the other, and kept by slide content + style, so coming back to them costs nothing.
import { useEffect, useRef, useState } from 'react';
import { svgToPng } from '../reference/faithful';
import type { GalleryEntry, GalleryModel, PickChoice } from './designLibraryPick';
import type { LayoutId } from './layouts';

/** Pictures drawn so far, by slide content + style + layout + variant (null: the code could not draw it). Kept for the page's life, capped. */
const CACHE = new Map<string, string | null>();
const CAP = 600;
const remember = (k: string, v: string | null) => {
  if (CACHE.size >= CAP) {
    const first = CACHE.keys().next().value as string | undefined;
    if (first !== undefined) {
      const old = CACHE.get(first);
      if (old) URL.revokeObjectURL(old);
      CACHE.delete(first);
    }
  }
  CACHE.set(k, v);
};
export const galleryCacheSize = () => CACHE.size;

const THUMB_W = 220;
const key = (sig: string, layout: string, v: number) => `${sig}:${layout}:${v}`;

export function LayoutGallery({ index, model, draw, onChoose, onRewrite, section = 'layout' }: {
  index: number;
  /** 'layout': the layout choices and the Variations (plane, colours). 'rewrite': the Rewrite text button and its optional hint (used in the Text tab). */
  section?: 'layout' | 'rewrite';
  model: GalleryModel | null;
  /** Draws one tile (no model call): the SVG of the layout in the variant with this slide's text. */
  draw: (layout: LayoutId, variant: 0 | 1) => Promise<string | null>;
  /** Draws the slide again with the choice; says what happened. */
  onChoose: (c: PickChoice) => Promise<string>;
  /** One small model call for this slide; says what happened. */
  onRewrite: (words: string) => Promise<string>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [done, setDone] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState('');
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const run = useRef(0);

  // draw the pictures only when the gallery is on screen
  useEffect(() => {
    const el = root.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const sig = model?.signature ?? '';
  useEffect(() => {
    if (!seen || !model) return;
    const id = ++run.current;
    const t0 = performance.now();
    setDone(null);
    const todo = model.entries.filter((e) => e.enabled).flatMap((e) => ([0, 1] as const).map((v) => ({ e, v })));
    // what the cache already holds is shown at once
    const have: Record<string, string | null> = {};
    for (const { e, v } of todo) { const k = key(sig, e.layout, v); if (CACHE.has(k)) have[k] = CACHE.get(k)!; }
    setUrls(have);
    (async () => {
      for (const { e, v } of todo) {
        if (id !== run.current) return;
        const k = key(sig, e.layout, v);
        if (CACHE.has(k)) continue;
        let url: string | null = null;
        try {
          const svg = await drawRef.current(e.layout, v);
          if (svg) url = URL.createObjectURL(await svgToPng(svg, THUMB_W));
        } catch { url = null; }
        remember(k, url);
        if (id !== run.current) return;
        setUrls((u) => ({ ...u, [k]: url }));
      }
      if (id === run.current) setDone(Math.round(performance.now() - t0));
    })();
    return () => { run.current++; };
  }, [seen, sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (c: PickChoice) => {
    setBusy(true);
    setMsg('');
    setMsg(await onChoose(c));
    setBusy(false);
  };
  if (!model) return null;
  if (section === 'rewrite')
    return (
      <div className="tn-field" data-testid={`rewrite-${index}`}>
        <span className="field-label">Rewrite text: 1 small model call for this slide only, same layout</span>
        <input className="cr-input cr-wide" value={words} disabled={busy} placeholder="optional hint: shorter, punchier" aria-label={`Words for rewriting slide ${index + 1}`} onChange={(e) => setWords(e.target.value)} />
        <div className="row-actions"><button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={async () => { setBusy(true); setMsg(''); setMsg(await onRewrite(words)); setBusy(false); }}>{busy ? 'Working…' : 'Rewrite text'}</button></div>
        {msg && <span className="small" role="status">{msg}</span>}
      </div>
    );
  const tile = (e: GalleryEntry, v: 0 | 1) => {
    const now = e.current && model.variant === v;
    const url = urls[key(sig, e.layout, v)];
    const label = `${e.label}, ${e.variants[v]}`;
    return (
      <button key={v} type="button" className="btn btn-outline btn-sm" disabled={busy || now} aria-pressed={now} aria-label={`${now ? 'Current: ' : 'Use '}${label}`} title={e.reason ? `${label}. ${e.reason}` : label} data-testid={`gal-${e.layout}-${v}`} data-state={now ? 'current' : 'ready'} onClick={() => void choose(e.current ? { variant: v } : { layout: e.layout, variant: v })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: 4, width: 128, opacity: 1, outline: now ? '3px solid currentColor' : undefined, outlineOffset: -1 }}>
        {url ? <img src={url} alt="" width={118} height={148} style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }} /> : <span aria-hidden="true" className="small muted" style={{ width: 118, height: 148, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(128,128,128,.12)', borderRadius: 4 }}>{url === undefined ? '…' : '–'}</span>}
        <span className="small" style={{ fontSize: 11, lineHeight: 1.2, whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'center', width: '100%', minHeight: 26 }}>{e.variants[v]}{now ? ' (now)' : ''}</span>
      </button>
    );
  };
  return (
    <div ref={root} className="tn-field" data-testid={`gallery-${index}`} data-ready-ms={done ?? ''} data-signature={sig}>
      <h4 className="h4">Layouts</h4>
      <span className="small muted">Click one to redraw this slide (drawn by the code, no model call).</span>
      <div role="list" aria-label={`Layouts for slide ${index + 1}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto', padding: '2px 2px 6px' }}>
        {model.entries.map((e) => (
          <div key={e.layout} role="listitem" data-testid={`gal-item-${e.layout}`} data-enabled={e.enabled} data-current={e.current} style={{ opacity: e.enabled ? 1 : 0.55 }}>
            {e.enabled ? (
              <>
                <div className="small" style={{ fontWeight: 600, marginBottom: 3 }}>{e.label}{e.current ? ' — this slide now' : ''}</div>
                <div style={{ display: 'flex', gap: 6 }}>{tile(e, 0)}{tile(e, 1)}</div>
                {e.reason && <div className="small muted" style={{ fontSize: 11 }}>{e.reason}</div>}
              </>
            ) : (
              <button type="button" className="btn btn-outline btn-sm" disabled aria-disabled="true" aria-label={`${e.label} cannot be used: ${e.reason}`} data-testid={`gal-${e.layout}-off`} data-state="off" style={{ textAlign: 'left', whiteSpace: 'normal', width: '100%', padding: '4px 8px', display: 'block' }}>
                <span className="small" style={{ fontWeight: 600, fontSize: 12 }}>{e.label}</span>
                <span className="small" style={{ fontSize: 11, display: 'block', lineHeight: 1.25 }}>{e.reason}</span>
              </button>
            )}
          </div>
        ))}
      </div>
      <h4 className="h4">Variations</h4>
      <div className="cr-actions" data-testid={`gallery-controls-${index}`} style={{ gap: 6 }}>
        <span className="small muted">Plane</span>
        {model.cuts.map((c) => (
          <button key={c.id} type="button" className="btn btn-outline btn-sm" disabled={busy || c.current} aria-pressed={c.current} data-testid={`gal-cut-${c.id}`} onClick={() => void choose({ cut: c.id })} style={{ padding: '2px 8px', fontSize: 12, outline: c.current ? '2px solid currentColor' : undefined, outlineOffset: -1 }}>{c.label}</button>
        ))}
        <span className="small muted" style={{ marginLeft: 6 }}>Colours</span>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} aria-pressed={!!model.invert} data-testid="gal-invert" onClick={() => void choose({ invert: model.invert ? false : 'full' })} style={{ padding: '2px 8px', fontSize: 12, outline: model.invert ? '2px solid currentColor' : undefined, outlineOffset: -1 }}>{model.invert ? 'Inverted (click for normal)' : 'Invert'}</button>
      </div>
      {msg && <span className="small" role="status">{msg}</span>}
    </div>
  );
}
