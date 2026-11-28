// The layout picker of a library slide (Round AL part 2: by PURPOSE). A grid of small pictures of THIS slide, one per purpose that fits ("Big statement", "Photo on the side",
// "Numbered step" ...), drawn by the code with the slide's own text and the deck's style; the slide's own layout comes first, marked "Now". "More like this" opens the other
// layouts of that purpose in the same place. Purposes with no layout that fits are listed under "Why not the others" with one plain reason each. Under the grid, "Adjust this
// layout": the layout's two looks as plain buttons, the colour block and the light/dark swap. One click draws this slide again in code (no model call; one undo step).
// Pictures are drawn when the picker scrolls into view, one after the other, and kept by slide content + style, so coming back to them costs nothing.
// Round AM: a layout that fits with a change (a number before the headline, a line left out, a photo another slide also shows) is a tile after the clean ones, marked with the change in
// plain words under it. A tile that leaves a line out asks first ("Use it" / "Keep my words"); the line stays with the slide, so another layout brings it back.
import { useEffect, useRef, useState } from 'react';
import { svgToPng } from '../reference/faithful';
import { PICTURE_THUMB_MAX, useLibraryVersion } from './photoLibrary';
import type { GalleryModel, PickChoice } from './designLibraryPick';
import type { LayoutId } from './layouts';
import { layoutDetail, looksOf, purposeGrid } from './layoutPurpose';
import { clip } from './designLibrary';

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
  /** 'layout': the purpose grid and "Adjust this layout". 'rewrite': the Rewrite text button and its optional hint (used in the Text tab). */
  section?: 'layout' | 'rewrite';
  model: GalleryModel | null;
  /** Draws one picture (no model call): the SVG of the layout in the variant with this slide's text. */
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
  const [open, setOpen] = useState<string | null>(null);
  /** Round AM: the tile that leaves a line out, waiting for "Use it" or "Keep my words". */
  const [ask, setAsk] = useState<{ layout: string; lines: string[] } | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const run = useRef(0);

  // draw the pictures only when the picker is on screen
  useEffect(() => {
    const el = root.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  // a tile shows the project's pictures: a picture added, replaced or re-cropped draws the tiles again
  const pics = useLibraryVersion();
  const sig = `${model?.signature ?? ''}|p${pics}`;
  const v = model?.variant ?? 0;
  // a layout whose picture the code could not draw (the text rules: sizes, margins, contrast) cannot work: its purpose takes the next layout, or goes under "Why not the others"
  const failed = new Set((model?.entries ?? []).map((e) => e.layout as string).filter((l) => urls[key(sig, l, v)] === null));
  const grid = model ? purposeGrid(model.entries, failed) : { tiles: [], off: [] };
  // the pictures to draw: the tile of every purpose, and the other layouts of the purpose that is open
  const shown = grid.tiles.flatMap((t) => [t.best, ...(open === t.purpose.id ? t.more : [])]);
  const want = shown.join(',');
  // a slide with new text, style or look closes "More like this" (and the question of a tile that leaves a line out)
  useEffect(() => { setOpen(null); setAsk(null); }, [sig]);
  useEffect(() => {
    if (!seen || !model) return;
    const id = ++run.current;
    const t0 = performance.now();
    setDone(null);
    const todo = shown;
    const have: Record<string, string | null> = {};
    for (const l of todo) { const k = key(sig, l, v); if (CACHE.has(k)) have[k] = CACHE.get(k)!; }
    setUrls((u) => ({ ...u, ...have }));
    (async () => {
      for (const l of todo) {
        if (id !== run.current) return;
        const k = key(sig, l, v);
        if (CACHE.has(k)) continue;
        let url: string | null = null;
        try {
          const svg = await drawRef.current(l as LayoutId, v);
          if (svg) url = URL.createObjectURL(await svgToPng(svg, THUMB_W, undefined, { pictureMax: PICTURE_THUMB_MAX }));
        } catch { url = null; }
        remember(k, url);
        if (id !== run.current) return;
        setUrls((u) => ({ ...u, [k]: url }));
      }
      if (id === run.current) setDone(Math.round(performance.now() - t0));
    })();
    return () => { run.current++; };
  }, [seen, sig, want]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (c: PickChoice) => {
    setAsk(null);
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
  const cur = model.entries.find((e) => e.current);
  const entryOf = (l: string) => model.entries.find((e) => e.layout === l);
  /** One picture of this slide in a layout: a click lays the slide out that way (Round AM: a layout that leaves a line out asks first). */
  const tile = (l: string, now: boolean, name: string, detail: string) => {
    const url = urls[key(sig, l, v)];
    const e = entryOf(l);
    const badges = e?.badges ?? [];
    const change = !now && e?.fit === 'change';
    const drops = change ? e?.change?.drops ?? [] : [];
    const click = () => (drops.length ? setAsk({ layout: l, lines: drops }) : void choose({ layout: l as LayoutId, variant: v, reuse: true }));
    return (
      <button type="button" className={`btn btn-outline btn-sm cr-lp-tile${change ? ' cr-lp-change' : ''}`} disabled={busy || now} aria-pressed={now} aria-haspopup={drops.length ? 'dialog' : undefined} aria-label={`${now ? 'Now: ' : 'Use '}${name}${detail ? ', ' + detail : ''}${badges.length ? '. ' + badges.join('. ') : ''}`} title={badges.length ? badges.join('. ') : undefined} data-testid={`gal-${l}`} data-state={now ? 'current' : 'ready'} data-fit={now ? 'clean' : e?.fit ?? 'clean'} onClick={click} style={{ outline: now ? '3px solid currentColor' : undefined, outlineOffset: -1 }}>
        {url ? <img src={url} alt="" style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: 4, display: 'block' }} /> : <span aria-hidden="true" className="small muted" style={{ width: '100%', aspectRatio: '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(128,128,128,.12)', borderRadius: 4 }}>{url === undefined ? '…' : '–'}</span>}
        <span className="small cr-lp-name">{now && <strong className="cr-lp-now">Now </strong>}{name}</span>
        {detail && <span className="small muted cr-lp-detail">{detail}</span>}
        {badges.map((b) => <span key={b} className="small cr-lp-badge">{b}</span>)}
      </button>
    );
  };
  const looks = cur ? looksOf(cur.layout) : null;
  return (
    <div ref={root} className="tn-field" data-testid={`gallery-${index}`} data-ready-ms={done ?? ''} data-signature={sig}>
      <h4 className="h4">Layouts</h4>
      <span className="small muted">Pick what this slide should do. Your words stay the same; no model call.</span>
      <div role="list" aria-label={`Layouts for slide ${index + 1}`} className="cr-lp-grid">
        {grid.tiles.map((t) => {
          const isOpen = open === t.purpose.id;
          return (
            <div key={t.purpose.id} role="listitem" className={`cr-lp-cell${isOpen ? ' cr-lp-open' : ''}`} data-testid={`purpose-${t.purpose.id}`} data-open={isOpen} data-fit={t.fit}>
              {isOpen && <div className="small cr-lp-group">{t.purpose.name}</div>}
              <div className={isOpen ? 'cr-lp-row' : undefined}>
                {[t.best, ...(isOpen ? t.more : [])].map((l) => (
                  <div key={l} data-testid={`gal-item-${l}`} data-enabled="true" data-current={l === cur?.layout} data-fit={l === cur?.layout ? 'clean' : entryOf(l)?.fit ?? 'clean'}>
                    {tile(l, l === cur?.layout, t.purpose.name, layoutDetail(l))}
                  </div>
                ))}
              </div>
              {t.more.length > 0 && (
                <button type="button" className="btn btn-outline btn-sm cr-lp-more" aria-expanded={isOpen} data-testid={`more-${t.purpose.id}`} onClick={() => setOpen(isOpen ? null : t.purpose.id)}>
                  {isOpen ? 'Fewer' : `More like this (${t.more.length})`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {ask && (
        <div role="alertdialog" aria-labelledby={`cr-lp-ask-${index}`} className="cr-lp-ask" data-testid={`fit-confirm-${index}`} ref={(el) => el?.scrollIntoView({ block: 'nearest' })}>
          <p className="small" id={`cr-lp-ask-${index}`}>
            This layout has no room for {ask.lines.map((t, k) => <span key={k}>{k > 0 ? ' or ' : ''}"{clip(t, 80)}"</span>)}. Use it anyway? Your words stay with the slide: another layout brings {ask.lines.length > 1 ? 'them' : 'it'} back.
          </p>
          <div className="row-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} data-testid="fit-use" onClick={() => void choose({ layout: ask.layout as LayoutId, variant: v, reuse: true })}>Use it</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} data-testid="fit-keep" autoFocus onClick={() => setAsk(null)}>Keep my words</button>
          </div>
        </div>
      )}
      {grid.off.length > 0 && (
        <details className="cr-lp-off" data-testid={`gallery-off-${index}`}>
          <summary className="small">Why not the others ({grid.off.length})</summary>
          <ul className="small muted" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {grid.off.map((o) => (
              <li key={o.purpose.id} data-testid={`purpose-off-${o.purpose.id}`}><strong>{o.purpose.name}:</strong> {o.reason}</li>
            ))}
          </ul>
        </details>
      )}
      <h4 className="h4">Adjust this layout</h4>
      <div className="cr-var" data-testid={`gallery-controls-${index}`}>
        {looks && (
          <div className="cr-var-group" role="group" aria-labelledby={`cr-var-look-${index}`} data-testid={`gallery-look-${index}`}>
            <span className="small muted cr-var-label" id={`cr-var-look-${index}`}>Arrangement</span>
            <div className="cr-var-buttons">
              {([0, 1] as const).map((k) => (
                <button key={k} type="button" className="btn btn-outline btn-sm cr-var-btn" disabled={busy || model.variant === k} aria-pressed={model.variant === k} data-testid={`look-${k}`} onClick={() => void choose({ variant: k })} style={{ outline: model.variant === k ? '2px solid currentColor' : undefined, outlineOffset: -1 }}>{looks[k]}</button>
              ))}
            </div>
          </div>
        )}
        {model.cuts.length > 1 && (
          <div className="cr-var-group" role="group" aria-labelledby={`cr-var-plane-${index}`} data-testid={`gallery-plane-${index}`}>
            <span className="small muted cr-var-label" id={`cr-var-plane-${index}`}>Colour block</span>
            <div className="cr-var-buttons">
              {model.cuts.map((c) => (
                <button key={c.id} type="button" className="btn btn-outline btn-sm cr-var-btn" disabled={busy || c.current} aria-pressed={c.current} data-testid={`gal-cut-${c.id}`} onClick={() => void choose({ cut: c.id })} style={{ outline: c.current ? '2px solid currentColor' : undefined, outlineOffset: -1 }}>{c.label}</button>
              ))}
            </div>
          </div>
        )}
        <div className="cr-var-group cr-var-colours" role="group" aria-labelledby={`cr-var-colours-${index}`} data-testid={`gallery-colours-${index}`}>
          <span className="small muted cr-var-label" id={`cr-var-colours-${index}`}>Colours</span>
          <div className="cr-var-buttons">
            <button type="button" className="btn btn-outline btn-sm cr-var-btn" disabled={busy} aria-pressed={!!model.invert} data-testid="gal-invert" onClick={() => void choose({ invert: model.invert ? false : 'full' })} style={{ outline: model.invert ? '2px solid currentColor' : undefined, outlineOffset: -1 }}>{model.invert ? 'Light and dark swapped (click to undo)' : 'Swap light and dark'}</button>
          </div>
        </div>
      </div>
      {msg && <span className="small" role="status">{msg}</span>}
    </div>
  );
}
