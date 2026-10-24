export function RenderPanel({
  failed,
  progress,
  error,
  onRetry,
}: {
  failed: boolean;
  progress: number;
  error?: string;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <section className="notice notice-error ws-notice" role="alert">
        <strong>The render did not finish</strong>
        <span>{error ?? 'Your footage is safe. Nothing was lost, try again.'}</span>
        <div className="notice-actions">
          <button type="button" className="btn btn-dark btn-sm" onClick={onRetry}>Retry the render</button>
        </div>
      </section>
    );
  }
  const pct = Math.round(progress * 100);
  return (
    <section className="card ws-card" role="status" aria-live="polite">
      <h2 className="h2">Making your edit</h2>
      <p className="muted small">This usually takes a minute. You can leave this page; it keeps going.</p>
      <div
        className="bar"
        role="progressbar"
        aria-label="Render progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="small">{pct}%</p>
    </section>
  );
}
