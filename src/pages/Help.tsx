import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Tabs, tabPanelProps } from '../components/Tabs';
import { parseDay, today } from '../dates';
import * as engine from '../engine';
import { useDocumentTitle } from '../useDocumentTitle';

const TABS = [
  { id: 'guides', label: 'Guides' },
  { id: 'contact', label: 'Contact us' },
  { id: 'new', label: "What's new" },
];

function Guides({ goContact }: { goContact: () => void }) {
  const [data, setData] = useState<{ topics: string[]; guides: engine.Guide[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('All');

  const load = useCallback(() => {
    setFailed(false);
    engine.listGuides().then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.guides ?? []).filter(
      (g) =>
        (topic === 'All' || g.topic === topic) &&
        (!q || `${g.title} ${g.summary} ${g.steps.join(' ')}`.toLowerCase().includes(q)),
    );
  }, [data, query, topic]);

  if (failed)
    return (
      <div className="card empty" role="alert">
        <strong>We could not load the guides.</strong>
        <span className="muted">Check your connection and try again, or contact us.</span>
        <div className="row-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={goContact}>Contact us</button>
        </div>
      </div>
    );
  if (!data) return <p className="muted" role="status">Loading the guides…</p>;

  return (
    <>
      <div className="filters">
        <label className="search-field">
          <Icon name="search" size={16} strokeWidth={2} />
          <span className="visually-hidden">Search the guides</span>
          <input type="search" placeholder="Search the guides" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <div role="group" aria-label="Filter guides by topic" className="chip-group">
        {['All', ...data.topics].map((t) => (
          <button key={t} type="button" className="chip-btn" aria-pressed={topic === t} onClick={() => setTopic(t)}>
            {t}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card empty" role="status">
          <strong>No guide matches</strong>
          <span className="muted">Try a different word, or ask us directly.</span>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setQuery('');
                setTopic('All');
              }}
            >
              Clear search
            </button>
            <button type="button" className="btn btn-dark btn-sm" onClick={goContact}>Contact us</button>
          </div>
        </div>
      ) : (
        <ul className="guide-list" aria-label={`${shown.length} guides`}>
          {shown.map((g) => (
            <li key={g.id} className="card">
              <details className="guide" open={query.trim() !== '' && shown.length === 1}>
                <summary>
                  <span className="guide-title">{g.title}</span>
                  <span className="small muted">{g.summary}</span>
                </summary>
                <div className="guide-body">
                  <ol>
                    {g.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <div>
                    <Link to={g.link.to} className="btn btn-outline btn-sm">{g.link.label}</Link>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Contact() {
  const [info, setInfo] = useState<engine.SupportInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [topic, setTopic] = useState<engine.SupportTopic>('question');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ reference: string; replyTime: string } | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    engine.getSupportInfo().then(setInfo).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      setSent(await engine.sendSupportMessage({ topic, message, replyTo }));
    } catch (err) {
      setError((err as Error).message || 'We could not send that. Your message is still here, try again.');
    } finally {
      setSending(false);
    }
  };

  if (failed)
    return (
      <div className="card empty" role="alert">
        <strong>We could not load the contact form.</strong>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
      </div>
    );
  if (!info) return <p className="muted" role="status">Loading…</p>;

  if (sent)
    return (
      <section className="card ws-card contact-card" aria-labelledby="sent-h">
        <div className="notice notice-ok" role="status">
          <strong id="sent-h">Message sent</strong>
          <span>
            Thank you. Your reference is <b>{sent.reference}</b>. We reply {sent.replyTime}, to {replyTo.trim()}.
          </span>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              setSent(null);
              setMessage('');
            }}
          >
            Send another message
          </button>
        </div>
      </section>
    );

  return (
    <form className="card ws-card contact-card" onSubmit={submit} noValidate>
      <h2 className="h3">Talk to a person</h2>
      <p className="small muted">We reply {info.replyTime}. If it is about a video that failed, say which one.</p>
      <label className="field">
        <span className="field-label">What is it about?</span>
        <select className="plain-select" value={topic} onChange={(e) => setTopic(e.target.value as engine.SupportTopic)}>
          {info.topics.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Your message</span>
        <textarea className="voice-paste" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Where should we reply?</span>
        <input type="email" className="text-input" autoComplete="email" placeholder="you@example.com" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
      </label>
      {error && (
        <div className="notice notice-error" role="alert">
          <strong>Not sent</strong>
          <span>{error}</span>
        </div>
      )}
      <div className="row-actions">
        <button type="submit" className="btn btn-dark btn-lg" disabled={sending || !message.trim() || !replyTo.trim()}>
          {sending ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  );
}

function WhatsNew() {
  const [notes, setNotes] = useState<engine.ReleaseNote[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    engine.listReleaseNotes().then(setNotes).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (failed)
    return (
      <div className="card empty" role="alert">
        <strong>We could not load what's new.</strong>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
      </div>
    );
  if (!notes) return <p className="muted" role="status">Loading…</p>;
  if (notes.length === 0)
    return (
      <div className="card empty">
        <strong>Nothing new yet</strong>
        <span className="muted">When we ship something, it will be listed here with the date.</span>
      </div>
    );

  const isNew = (d: string) => (parseDay(today()).getTime() - parseDay(d).getTime()) / 86400000 <= 14;

  return (
    <ol className="notes-feed">
      {notes.map((n) => (
        <li key={n.id} className="card ws-card">
          <div className="open-head">
            <h2 className="h3">{n.title}</h2>
            {isNew(n.date) && <span className="chip chip-ok">New</span>}
          </div>
          <time className="small muted" dateTime={n.date}>
            {parseDay(n.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </time>
          <ul className="notes-items">
            {n.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export default function Help() {
  useDocumentTitle('Help');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = raw === 'contact' || raw === 'new' ? raw : 'guides';
  const setTab = (t: string) => setParams(t === 'guides' ? {} : { tab: t }, { replace: true });

  return (
    <div className="page page-tight">
      <header>
        <h1 className="page-title">Help</h1>
        <p className="lead">Guides, a way to reach us, and what's new.</p>
      </header>
      <Tabs label="Help sections" idPrefix="help" tabs={TABS} value={tab} onChange={setTab} />
      <div {...tabPanelProps('help', tab)} className="panel">
        {tab === 'guides' && <Guides goContact={() => setTab('contact')} />}
        {tab === 'contact' && <Contact />}
        {tab === 'new' && <WhatsNew />}
      </div>
    </div>
  );
}
