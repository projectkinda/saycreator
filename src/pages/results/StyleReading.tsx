// Step 5, Phase 1: Style reading. The reference pictures sorted into clusters, with measured colours and a draft spec for each.
// Pictures can be moved between clusters here (saved to Reference carousels likes/clusters.json). Each cluster gets a verdict.
import { useCallback, useEffect, useState } from 'react';
import { Pic, Section, VerdictBox, useResults, type RecordBase } from './common';

interface Tagged {
  t: 'MEASURED' | 'GUESS';
  text: string;
}
interface Cluster {
  id: string;
  name: string;
  images: string[];
  why: string[];
  confidence: string;
  summary: string;
  spec: { palette: Tagged[]; type: Tagged[]; layouts: Record<string, Tagged[]>; graphics: Tagged[]; rhythm: Tagged[]; missingTools: string[] };
}
interface Unplaced {
  file: string;
  reason: string;
  between?: string[];
}
interface ClustersFile {
  note: string;
  dislikeFolder: string;
  images: Record<string, { format: string; description: string }>;
  clusters: Cluster[];
  unplaced: Unplaced[];
}
interface PerFile {
  file: string;
  slides: number;
  flat: number;
  hot: { hex: string; slides: number; onBlack: number; onWhite: number }[];
  palette: { hex: string; share: number }[];
}
interface Agg {
  slides: number;
  flatBackgroundSlides: number;
  photoLedSlides: number;
  darkBackgroundShare: number;
  aspectMedian: number;
  palette: { hex: string; share: number }[];
  hotColour: { hex: string; slides: number }[];
  perFile: PerFile[];
  contrast: { textVsOwnBackgroundMedian: number | null; textVsOwnBackgroundMin: number | null };
  margins: { measuredSlides: number; left: number | null; right: number | null; top: number | null; bottom: number | null };
  emptySpace: { median: number | null; min: number | null; max: number | null };
  bands: { tallestMedian: number | null; smallestMedian: number | null; tallestOverSmallestMedian: number | null };
  alignment: { left: number; centre: number; mixed: number; measuredSlides: number };
}
interface Data {
  clusters: ClustersFile | null;
  measurements: { generatedAt: string; files: Record<string, { width: number; height: number; method: string; slides: unknown[] }> } | null;
  aggregate: { clusters: Record<string, Agg> } | null;
  lastRun: number;
  folder: string;
}

const REF = '/Reference%20carousels%20likes/';
const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : `${Math.round(v * 100)}%`);
const VERDICT = [
  { value: 'right', label: 'right' },
  { value: 'partly', label: 'partly right' },
  { value: 'wrong', label: 'wrong' },
];

function Swatch({ hex, note }: { hex: string; note?: string }) {
  return (
    <span className="res-swatch">
      <span className="res-swatch-box" style={{ background: hex }} aria-hidden="true" />
      <code>{hex}</code>
      {note && <span className="small muted">{note}</span>}
    </span>
  );
}

function Tags({ items }: { items: Tagged[] }) {
  return (
    <ul className="res-tagged">
      {items.map((x, i) => (
        <li key={i}>
          <span className={x.t === 'MEASURED' ? 'chip chip-ok' : 'chip chip-warn'}>{x.t}</span> {x.text}
        </li>
      ))}
    </ul>
  );
}

export default function StyleReading({ refreshKey, onRefreshed }: { refreshKey: number; onRefreshed: () => void }) {
  const { records, setRecord, addExport } = useResults();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    setBusy(true);
    fetch('/__lab/style').then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => { setBusy(false); onRefreshed(); });
  }, [onRefreshed]);
  useEffect(refresh, [refresh, refreshKey]);

  const cf = data?.clusters;
  useEffect(() => {
    if (cf) addExport('styleReading', { clusters: cf.clusters.map((c) => ({ id: c.id, name: c.name, images: c.images })), unplaced: cf.unplaced.map((u) => u.file) });
  }, [cf, addExport]);

  const move = async (file: string, to: string) => {
    if (!cf) return;
    setError('');
    const clusters = cf.clusters.map((c) => ({ id: c.id, images: c.images.filter((f) => f !== file) }));
    let unplaced = cf.unplaced.filter((u) => u.file !== file);
    const prior = cf.unplaced.find((u) => u.file === file);
    if (to === 'unplaced') unplaced = [...unplaced, prior ?? { file, reason: 'Moved here by you. No reason written yet.' }];
    else clusters.find((c) => c.id === to)?.images.push(file);
    const res = await fetch('/__lab/clusters', { method: 'POST', body: JSON.stringify({ clusters, unplaced }) });
    if (!res.ok) setError((await res.json().catch(() => ({ error: 'Could not save.' }))).error);
    refresh();
  };

  const where = (file: string) => cf?.clusters.find((c) => c.images.includes(file))?.id ?? 'unplaced';
  const info = (file: string) => cf?.images[file];
  const dims = (file: string) => data?.measurements?.files[file];

  const imageCard = (file: string, n?: number) => (
    <figure key={file} className="res-mosaic">
      <Pic src={REF + encodeURIComponent(file)} alt={`Reference sheet: ${info(file)?.description ?? file}`} />
      <figcaption className="small">
        <b>{n ? `Picture ${n}. ` : ''}{info(file)?.format ?? 'unknown format'}</b>
        <br />
        {info(file)?.description}
        <br />
        <span className="muted">
          {dims(file) ? `${dims(file)!.slides.length} slides cut out, ` : ''}
          <a href={`/out/image-engine/style/overlay-${file.replace(/\.[^.]+$/, '')}.jpg`} target="_blank" rel="noreferrer">how I cut it</a>
        </span>
      </figcaption>
      <label className="small res-move">
        Cluster{' '}
        <select value={where(file)} onChange={(e) => move(file, e.target.value)} aria-label={`Move ${file} to another cluster`}>
          {cf?.clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="unplaced">Unplaced</option>
        </select>
      </label>
    </figure>
  );

  return (
    <Section id="style-reading" title="Step 5: Style reading" lastRun={data?.lastRun ?? null} onRefresh={refresh} busy={busy} intro={`Phase 1 of style learning: I looked at every picture in "${data?.folder ?? 'Reference carousels likes'}", sorted them into clusters and wrote a draft style for each. Nothing is built from them yet. MEASURED means computed from pixels in code; GUESS means my reading. No text, logos, faces or brand names are copied from the pictures.`}>
      {data === null && <p role="status">Loading…</p>}
      {data && !cf && <p className="lab-err">No clusters.json found in the reference folder.</p>}
      {cf && (
        <>
          <div className="res-banner" role="note">
            Every file is a <b>mosaic</b> of several slides, so I cut each one into slides first ({Object.values(data!.measurements?.files ?? {}).reduce((n, f) => n + f.slides.length, 0)} slides from {cf.clusters.reduce((n, c) => n + c.images.length, 0) + cf.unplaced.length} files) and measured those. {cf.dislikeFolder}.
            Move a picture with its dropdown and it is saved to <code>clusters.json</code>; the cluster text I wrote stays as it is, so tell me if a move changes what a cluster means.
          </div>
          {error && <p className="lab-err" role="alert">{error}</p>}

          {cf.clusters.map((c, ci) => {
            const agg = data!.aggregate?.clusters[c.id];
            const key = `style-reading|cluster|${c.id}`;
            const base: RecordBase = { key, step: 'style-reading', kind: 'style-cluster', image: c.name, option: 'cluster reading' };
            return (
              <article key={c.id} className="res-source res-cluster" aria-label={`Cluster ${c.name}`}>
                <h3 className="h3">Cluster {ci + 1}: {c.name}</h3>
                <p className="small"><b>Why these belong together.</b> {c.why.join(' ')}</p>
                <p className="small"><b>How sure I am.</b> {c.confidence}</p>
                <blockquote className="res-summary">{c.summary}</blockquote>

                <div className="res-mosaics">{c.images.map((f, i) => imageCard(f, i + 1))}</div>
                {c.images.length === 0 && <p className="lab-dim">No pictures in this cluster any more.</p>}

                {agg && (
                  <>
                    <h4>Colours <span className="chip chip-ok">MEASURED</span></h4>
                    <p className="small muted">Each deck's own colours (largest shares of its slides), then the cluster's merged palette. The pixel count can miss accents smaller than about 1% of a slide.</p>
                    {agg.perFile.map((f, fi) => (
                      <div key={f.file} className="res-swatches">
                        <span className="small muted res-swatch-label">Picture {fi + 1}</span>
                        {f.palette.slice(0, 6).map((p) => <Swatch key={p.hex} hex={p.hex} note={`${Math.round(p.share * 100)}%`} />)}
                        {f.hot.slice(0, 2).map((h) => <Swatch key={'h' + h.hex} hex={h.hex} note={`hot colour: ${h.onBlack}:1 on black, ${h.onWhite}:1 on white`} />)}
                      </div>
                    ))}
                    <div className="res-swatches">
                      <span className="small muted res-swatch-label"><b>Cluster palette</b></span>
                      {agg.palette.slice(0, 8).map((p) => <Swatch key={p.hex} hex={p.hex} note={`${Math.round(p.share * 100)}%`} />)}
                    </div>
                    <table className="res-table">
                      <tbody>
                        <tr><th scope="row">Slides measured</th><td>{agg.slides} ({agg.flatBackgroundSlides} with a plain background, {agg.photoLedSlides} photo-led); median shape {agg.aspectMedian} wide per tall; dark background on {pct(agg.darkBackgroundShare)}</td></tr>
                        <tr><th scope="row">Text contrast</th><td>median {agg.contrast.textVsOwnBackgroundMedian}:1, lowest {agg.contrast.textVsOwnBackgroundMin}:1 (text colour against its own slide background)</td></tr>
                        <tr><th scope="row">Margins</th><td>left {pct(agg.margins.left)}, right {pct(agg.margins.right)}, top {pct(agg.margins.top)}, bottom {pct(agg.margins.bottom)} of the slide (median of {agg.margins.measuredSlides} plain-background slides)</td></tr>
                        <tr><th scope="row">Empty space</th><td>median {pct(agg.emptySpace.median)} (range {pct(agg.emptySpace.min)} to {pct(agg.emptySpace.max)})</td></tr>
                        <tr><th scope="row">Text bands</th><td>tallest {pct(agg.bands.tallestMedian)} of slide height, smallest {pct(agg.bands.smallestMedian)}, ratio {agg.bands.tallestOverSmallestMedian} (band heights, not font sizes)</td></tr>
                        <tr><th scope="row">Alignment</th><td>{agg.alignment.left} left, {agg.alignment.centre} centred, {agg.alignment.mixed} mixed of {agg.alignment.measuredSlides}</td></tr>
                      </tbody>
                    </table>
                  </>
                )}

                <details className="res-details">
                  <summary>Draft style spec (palette, type, layouts, graphics, rhythm)</summary>
                  <h4>Palette</h4><Tags items={c.spec.palette} />
                  <h4>Type</h4><Tags items={c.spec.type} />
                  <h4>Layout per slide type seen</h4>
                  {Object.entries(c.spec.layouts).map(([k, v]) => (
                    <div key={k}><b className="small">{k}</b><Tags items={v} /></div>
                  ))}
                  <h4>Graphic vocabulary</h4><Tags items={c.spec.graphics} />
                  <h4>Rhythm</h4><Tags items={c.spec.rhythm} />
                </details>

                <h4>Missing tools</h4>
                <p className="small muted">What our toolbox cannot draw yet, for this style.</p>
                <ul className="res-missing">{c.spec.missingTools.map((m) => <li key={m}>{m}</li>)}</ul>

                <VerdictBox label={`cluster ${c.name}`} options={VERDICT} rec={records[key]} onChange={(v, r) => setRecord(base, v, r)} />
              </article>
            );
          })}

          <article className="res-source res-cluster" aria-label="Unplaced pictures">
            <h3 className="h3">Unplaced ({cf.unplaced.length})</h3>
            <p className="small muted">Pictures that fit no cluster, or sit between two. I did not force them in.</p>
            {cf.unplaced.length === 0 && <p className="lab-dim">Nothing is unplaced.</p>}
            {cf.unplaced.map((u) => (
              <div key={u.file} className="res-mosaics">
                {imageCard(u.file)}
                <p className="small"><b>Why it is not placed.</b> {u.reason}</p>
              </div>
            ))}
          </article>
        </>
      )}
    </Section>
  );
}
