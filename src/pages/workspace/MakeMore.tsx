import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as engine from '../../engine';
import { grad } from '../../format';

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function statusChip(item: engine.MakeMoreItem, making: boolean) {
  if (making) return <span className="chip">Making…</span>;
  if (item.status === 'ready') return <span className="chip chip-ok">Ready</span>;
  if (item.status === 'needs-review') return <span className="chip chip-warn">Needs review</span>;
  if (item.status === 'found') return <span className="chip">{item.badge ?? 'Found'}</span>;
  return <span className="chip">Not made</span>;
}

export function MakeMore({ project }: { project: engine.Project }) {
  const id = project.id;
  const [items, setItems] = useState<engine.MakeMoreItem[] | null>(null);
  const [made, setMade] = useState<engine.MadeItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [making, setMaking] = useState<engine.TextKind | null>(null);
  const [error, setError] = useState<{ kind: engine.TextKind; message: string } | null>(null);
  const [open, setOpen] = useState<engine.TextAsset | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState('');
  const openRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([engine.getMakeMore(id), engine.listMadeFromVideo(id)])
      .then(([a, b]) => {
        setItems(a);
        setMade(b);
      })
      .catch(() => setFailed(true));
  }, [id]);
  useEffect(load, [load]);

  useEffect(() => {
    if (open) openRef.current?.focus();
  }, [open]);

  const make = async (kind: engine.TextKind) => {
    setMaking(kind);
    setError(null);
    try {
      await engine.generateText(id, kind);
      load();
    } catch (e) {
      setError({ kind, message: (e as Error).message });
    } finally {
      setMaking(null);
    }
  };

  const openAsset = async (kind: engine.TextKind) => {
    const a = await engine.getTextAsset(id, kind);
    if (a) setOpen(a);
  };

  const approve = async (kind: engine.TextKind) => {
    const a = await engine.approveText(id, kind);
    setOpen(a);
    load();
  };

  const copy = async (key: string, text: string) => {
    setCopyFailed(false);
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } else {
      setCopyFailed(true);
    }
  };

  const copyKind = async (kind: engine.TextKind) => {
    const a = await engine.getTextAsset(id, kind);
    if (a) copy(a.id, [a.body, ...(a.parts ?? [])].join('\n'));
  };

  const addToCalendar = async (itemId: string) => {
    setScheduling(itemId);
    setCalendarError('');
    try {
      await engine.addToCalendar(id, itemId);
      load();
    } catch (e) {
      setCalendarError((e as Error).message);
    } finally {
      setScheduling(null);
    }
  };

  if (failed)
    return (
      <div className="card empty" role="alert">
        <strong>We could not load this.</strong>
        <span className="muted">Nothing was lost. Try again.</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
      </div>
    );
  if (!items || !made) return <p className="muted" role="status">Loading…</p>;

  const madeFor = (kind: engine.TextKind) => made.find((m) => m.kind === kind);

  return (
    <div className="more">
      <div>
        <h2 className="h3">One video, a week of content</h2>
        <p className="muted more-intro">
          Choose what to make from “{project.title}”. Everything is written from what you said in the video, in your
          voice.
        </p>
        <ol className="flow">
          <li><b>1</b> Choose what to make</li>
          <li><b>2</b> Review and edit</li>
          <li><b>3</b> Add to your calendar</li>
        </ol>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          <strong>Could not make it</strong>
          <span>{error.message}</span>
          <div className="notice-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => make(error.kind)}>Try again</button>
          </div>
        </div>
      )}
      {copyFailed && (
        <div className="notice notice-warn" role="alert">
          <span>We could not copy it. Open it and select the text to copy it yourself.</span>
        </div>
      )}
      {calendarError && (
        <div className="notice notice-error" role="alert">
          <strong>Could not add it to your calendar</strong>
          <span>{calendarError}</span>
        </div>
      )}

      <ul className="grid grid-three">
        {items.map((item) => {
          const m = madeFor(item.kind);
          const isMaking = making === item.kind;
          return (
            <li key={item.kind} className="card make-card">
              <div className="make-head">
                <h3 className="card-title">{item.title}</h3>
                {statusChip(item, isMaking)}
              </div>
              <p className="small muted make-what">{item.description}</p>
              <div className="make-foot">
                {(item.status === 'not-made' || item.status === 'found') && (
                  <>
                    {item.credits && <span className="mini">{item.credits} credits</span>}
                    <button type="button" className="btn btn-dark btn-sm" disabled={!!making} onClick={() => make(item.kind)}>
                      {isMaking ? 'Making…' : item.kind === 'clips' ? 'Make clips' : 'Make it'}
                    </button>
                  </>
                )}
                {item.status === 'needs-review' && (
                  <button type="button" className="btn btn-dark btn-sm" onClick={() => openAsset(item.kind)}>
                    Review
                  </button>
                )}
                {item.status === 'ready' && (
                  <>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => openAsset(item.kind)}>
                      Open
                    </button>
                    {m && (
                      m.scheduled ? (
                        <Link to="/calendar" className="btn btn-outline btn-sm">On calendar</Link>
                      ) : (
                        <button type="button" className="btn btn-outline btn-sm" disabled={scheduling === m.id} onClick={() => addToCalendar(m.id)}>
                          {scheduling === m.id ? 'Adding…' : 'Add to calendar'}
                        </button>
                      )
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {open && (
        <section className="card ws-card open-asset" aria-labelledby="open-h">
          <div className="open-head">
            <h2 id="open-h" className="h3" tabIndex={-1} ref={openRef}>{open.title}</h2>
            {open.status === 'needs-review' && <span className="chip chip-warn">Needs review</span>}
          </div>
          {open.status === 'needs-review' && (
            <p className="small">One number on slide 5 needs your confirmation: “3 days”. Is that right?</p>
          )}
          <p className="open-body">{open.body}</p>
          {open.parts && (
            <ol className="open-parts">
              {open.parts.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          )}
          <div className="row-actions">
            {open.status === 'needs-review' && (
              <button type="button" className="btn btn-dark btn-sm" onClick={() => approve(open.kind)}>
                Yes, that's right
              </button>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => copy(open.id, [open.body, ...(open.parts ?? [])].join('\n'))}>
              {copied === open.id ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="made-h">
        <h2 id="made-h" className="h2 made-title">Made from this video</h2>
        {made.length === 0 ? (
          <div className="card empty">
            <strong>Nothing yet</strong>
            <span className="muted">Choose something above. What you make shows up here, with where it stands.</span>
          </div>
        ) : (
          <ul className="card made-list">
            {made.map((m) => (
              <li key={m.id} className="made-item">
                <div className="made-thumb" style={m.poster ? grad(m.poster, 135) : undefined} aria-hidden="true">
                  {!m.poster && <span>Aa</span>}
                </div>
                <div className="made-text">
                  <strong>{m.title}</strong>
                  <div className="small muted">{m.detail}</div>
                </div>
                <span className={`chip ${m.status === 'ready' ? 'chip-ok' : 'chip-warn'}`}>
                  {m.status === 'ready' ? 'Ready' : 'Needs review'}
                </span>
                <div className="made-actions">
                  {m.type === 'text' && m.kind && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => copyKind(m.kind!)}>
                      {copied === m.id ? 'Copied' : 'Copy'}
                    </button>
                  )}
                  {m.type !== 'thumbnail' &&
                    (m.scheduled ? (
                      <Link to="/calendar" className="btn btn-outline btn-sm">On calendar</Link>
                    ) : (
                      <button type="button" className="btn btn-outline btn-sm" disabled={scheduling === m.id || m.status !== 'ready'} onClick={() => addToCalendar(m.id)}>
                        {scheduling === m.id ? 'Adding…' : 'Add to calendar'}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
