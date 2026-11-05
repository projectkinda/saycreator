// Per slide: the reference next to the drawn recreation, with what the read said about it, so the person can judge by eye. Failed slides are named with the reason.
import { resolveSvgTokens } from './faithful';
import { downloadBlob } from '../carousel/export';
import { failureLines, type WholeReadReport } from './wholeRead';

const svgUrl = (svg: string, palette: Record<string, string>) => {
  try {
    return `data:image/svg+xml;utf8,${encodeURIComponent(resolveSvgTokens(svg, palette))}`;
  } catch {
    return '';
  }
};

export function WholeReadPanel({ report, refs, svgs, palette }: { report: WholeReadReport; refs: Record<string, string>; svgs: Record<string, string>; palette: Record<string, string> }) {
  return (
    <section className="card rf-sec" aria-label="Slides read whole" data-testid="whole-read">
      <h3 className="h4">Slides read whole</h3>
      <p className="small muted">{report.slides.length - report.failed} of {report.slides.length} slides read, {report.distinctCompositions} distinct composition{report.distinctCompositions === 1 ? '' : 's'}. Left: the reference. Right: the drawing.</p>
      {report.failed > 0 && (
        <ul role="alert" className="small cr-warn" data-testid="whole-failures" style={{ whiteSpace: 'pre-wrap' }}>
          {failureLines(report).map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
      <div className="row-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadBlob(new Blob([JSON.stringify({ kind: 'say-creator-report', createdAt: new Date().toISOString(), wholeRead: report }, null, 2)], { type: 'application/json' }), 'report.json')}>Download report</button>
      </div>
      <ol style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 16 }}>
        {report.slides.map((s) => (
          <li key={s.file} data-testid="whole-slide">
            <p className="small"><strong>{s.file}</strong>: {s.ok ? `${s.typeRead}, ${s.slots} text slots, ${s.imageSlots} picture spots${s.cantDraw ? `, ${s.cantDraw} could not be drawn` : ''}, ${s.seconds}s` : `NOT READ: ${s.reasons.join(' ') || 'unknown reason'}`}</p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {refs[s.file] && <img src={refs[s.file]} alt={`Reference ${s.file}`} style={{ width: '48%', height: 'auto' }} />}
              {s.ok && svgs[s.file] && <img src={svgUrl(svgs[s.file], palette)} alt={`Drawing of ${s.file}`} style={{ width: '48%', height: 'auto' }} />}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
