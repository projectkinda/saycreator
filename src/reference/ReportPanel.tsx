// "Download report": a slide-by-slide verdict, a note, and two files (report.json and compare.jpg). Used on the carousel page and on the Results screen (which reads the saved project).
import { useState } from 'react';
import { downloadBlob } from '../carousel/export';
import { emptyDoc, type Doc } from '../carousel/doc';
import { loadSaved } from '../carousel/useProject';
import { activeReference } from './active';
import { buildReport, type SlideVerdict } from './report';

const WORDS: SlideVerdict[] = ['good', 'meh', 'bad'];

export function ReportPanel({ doc }: { doc?: Doc }) {
  const [includeRefs, setIncludeRefs] = useState(true);
  const [verdicts, setVerdicts] = useState<Record<number, SlideVerdict | undefined>>({});
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const source = doc ?? loadSaved('editorial-collage')?.doc ?? emptyDoc('editorial-collage');
  const count = source.script?.slides.length ?? 0;
  const hasRefs = (activeReference()?.report?.thumbs.length ?? 0) > 0;

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setMsg('Building the report…');
    try {
      const r = await buildReport({ doc: source, includeRefs, verdicts, note });
      downloadBlob(new Blob([r.json], { type: 'application/json' }), 'report.json');
      if (r.compare) downloadBlob(r.compare, 'compare.jpg');
      setMsg(`Downloaded report.json (${Math.round(r.json.length / 100) / 10} KB)${r.compare ? ` and compare.jpg (${Math.round(r.compare.size / 1000)} KB)` : ''}. No model was called.`);
    } catch (e) {
      setMsg(`The report could not be built: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card rf-sec" aria-label="Report">
      <h3 className="h4">Report</h3>
      <p className="small muted">Two files, built when you click and never stored: report.json (names, what was read, the checks for every slide, your verdicts) and compare.jpg (reference slides on top, generated slides below).</p>
      {count > 0 && (
        <ol className="rf-others" aria-label="Verdict for each slide" style={{ listStyle: 'none', padding: 0 }}>
          {Array.from({ length: count }, (_, i) => (
            <li key={i} role="group" aria-label={`Verdict for slide ${i + 1}`}>
              <span className="small">Slide {i + 1}</span>{' '}
              {WORDS.map((w) => (
                <button key={w} type="button" className="btn btn-outline btn-sm" aria-pressed={verdicts[i] === w} onClick={() => setVerdicts((v) => ({ ...v, [i]: v[i] === w ? undefined : w }))}>{w}</button>
              ))}
            </li>
          ))}
        </ol>
      )}
      <label className="tn-field">
        <span className="field-label">What I wanted / what's wrong</span>
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-label="What I wanted / what's wrong" />
      </label>
      <label className="small">
        <input type="checkbox" checked={includeRefs} onChange={(e) => setIncludeRefs(e.target.checked)} aria-label="Include my reference pictures" /> Include my reference pictures{hasRefs ? '' : ' (none are loaded)'}
      </label>
      <div className="row-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void download()} disabled={busy}>{busy ? 'Building…' : 'Download report'}</button>
      </div>
      {msg && <p className="small" role="status" aria-live="polite" data-testid="report-status">{msg}</p>}
    </section>
  );
}
