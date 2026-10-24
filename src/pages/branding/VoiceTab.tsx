import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../AppContext';
import * as engine from '../../engine';

const SENTENCE_LABEL = ['', 'Very short sentences', 'Short sentences', 'Medium sentences', 'Long sentences', 'Very long sentences'];
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const quoted = (a: string[]) => (a.length ? a.map((w) => `“${w}”`).join(', ') : 'None yet');

export function VoiceTab() {
  const { brand } = useApp();
  const brandId = brand?.id;
  const [voice, setVoice] = useState<engine.VoiceProfile | null>(null);
  const [options, setOptions] = useState<engine.VoiceOptions | null>(null);
  const [failed, setFailed] = useState(false);
  const [paste, setPaste] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ tone: string[]; sentenceLength: number; use: string; avoid: string; emoji: engine.VoiceProfile['emoji'] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [announce, setAnnounce] = useState('');

  const load = useCallback(() => {
    if (!brandId) return;
    setFailed(false);
    Promise.all([engine.getVoice(brandId), engine.getVoiceOptions()])
      .then(([v, o]) => {
        setVoice(v);
        setOptions(o);
      })
      .catch(() => setFailed(true));
  }, [brandId]);
  useEffect(() => {
    load();
  }, [load]);

  if (failed)
    return (
      <div className="card empty" role="alert">
        <strong>We could not load your writing voice.</strong>
        <span className="muted">Nothing was lost. Check your connection and try again.</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
      </div>
    );
  if (!voice || !options) return <p className="muted" role="status">Loading your writing voice…</p>;

  const addPost = async () => {
    if (!brandId) return;
    setAdding(true);
    setAddError('');
    try {
      const v = await engine.addVoiceSample(brandId, paste);
      setVoice(v);
      setPaste('');
      setAnnounce(`Post added. We have learned from ${v.samples}.`);
    } catch (e) {
      setAddError((e as Error).message || 'We could not read that post. Try again.');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = () => {
    setSaveError('');
    setDraft({
      tone: [...voice.tone],
      sentenceLength: voice.sentenceLength,
      use: voice.wordsUse.join(', '),
      avoid: voice.wordsAvoid.join(', '),
      emoji: voice.emoji,
    });
    setEditing(true);
  };

  const save = async () => {
    if (!brandId || !draft) return;
    setSaving(true);
    setSaveError('');
    try {
      setVoice(
        await engine.updateVoice(brandId, {
          tone: draft.tone,
          sentenceLength: draft.sentenceLength as engine.VoiceProfile['sentenceLength'],
          wordsUse: list(draft.use),
          wordsAvoid: list(draft.avoid),
          emoji: draft.emoji,
        }),
      );
      setEditing(false);
      setAnnounce('Writing voice saved');
    } catch (e) {
      setSaveError((e as Error).message || 'That did not save. Nothing was changed.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTone = (t: string) =>
    draft && setDraft({ ...draft, tone: draft.tone.includes(t) ? draft.tone.filter((x) => x !== t) : [...draft.tone, t] });

  return (
    <div className="kit">
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>

      <section className="card ws-card" aria-labelledby="what-h">
        <h2 id="what-h" className="h3">What is “writing voice”?</h2>
        <p className="muted voice-what">
          It's how your words sound. When we write a LinkedIn post, X thread, caption, carousel or article from your video,
          we follow your voice, so it reads like you wrote it and not like generic AI. It doesn't change how your videos
          look or are cut (that's “Styles”, under Videos).
        </p>
      </section>

      <div className="two">
        <section className="card ws-card" aria-labelledby="teach-h">
          <h2 id="teach-h" className="h3">Teach us your voice</h2>
          <p className="small muted">
            Paste 2 or 3 posts you've written and liked. We pick up your sentence length, favourite words, how you open,
            and how you use emoji.
          </p>
          <label className="field">
            <span className="visually-hidden">Paste past posts</span>
            <textarea className="voice-paste" rows={5} value={paste} placeholder="Paste a past post here" onChange={(e) => setPaste(e.target.value)} />
          </label>
          {addError && (
            <div className="notice notice-warn" role="alert"><span>{addError}</span></div>
          )}
          <div className="row-actions">
            <button type="button" className="btn btn-dark btn-sm" disabled={adding || !paste.trim()} onClick={addPost}>
              {adding ? 'Reading it…' : 'Add post'}
            </button>
            <span className="small muted">{voice.samples === 0 ? 'None added yet' : `${voice.samples} added`}</span>
          </div>
        </section>

        <section className="card ws-card" aria-labelledby="picked-h">
          <h2 id="picked-h" className="h3">What we picked up</h2>
          {voice.samples === 0 && !editing && (
            <p className="small muted">Nothing yet. Add a post on the left and this fills in. Until then we write in a neutral voice.</p>
          )}
          {!editing || !draft ? (
            <>
              <dl className="kv">
                <dt className="label">Tone</dt>
                <dd className="chips-row">{voice.tone.map((t) => <span key={t} className="chip">{t}</span>)}</dd>
                <dt className="label">Sentences</dt>
                <dd>
                  <span className="meter" role="img" aria-label={SENTENCE_LABEL[voice.sentenceLength]}>
                    {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= voice.sentenceLength ? 'on' : ''} />)}
                  </span>
                  <span className="small muted"> {SENTENCE_LABEL[voice.sentenceLength]}</span>
                </dd>
                <dt className="label">Words you use</dt>
                <dd className="small">{quoted(voice.wordsUse)}</dd>
                <dt className="label">Words to avoid</dt>
                <dd className="small">{quoted(voice.wordsAvoid)}</dd>
                <dt className="label">Emoji</dt>
                <dd className="small">{voice.emoji}</dd>
              </dl>
              <div><button type="button" className="btn btn-outline btn-sm" onClick={startEdit}>Edit</button></div>
            </>
          ) : (
            <>
              <fieldset className="create-form">
                <legend className="field-label">Tone</legend>
                <div className="chip-group">
                  {options.tones.map((t) => (
                    <button key={t} type="button" className="chip-btn" aria-pressed={draft.tone.includes(t)} onClick={() => toggleTone(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="field">
                <span className="field-label">Sentences: {SENTENCE_LABEL[draft.sentenceLength]}</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={draft.sentenceLength}
                  aria-valuetext={SENTENCE_LABEL[draft.sentenceLength]}
                  onChange={(e) => setDraft({ ...draft, sentenceLength: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span className="field-label">Words you use (separate with commas)</span>
                <input type="text" className="text-input" value={draft.use} onChange={(e) => setDraft({ ...draft, use: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Words to avoid (separate with commas)</span>
                <input type="text" className="text-input" value={draft.avoid} onChange={(e) => setDraft({ ...draft, avoid: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Emoji</span>
                <select className="plain-select" value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value as engine.VoiceProfile['emoji'] })}>
                  {options.emoji.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              {saveError && (
                <div className="notice notice-error" role="alert"><strong>Not saved</strong><span>{saveError}</span></div>
              )}
              <div className="row-actions">
                <button type="button" className="btn btn-dark btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="card ws-card" aria-labelledby="try-h">
        <h2 id="try-h" className="h3">Try it</h2>
        <p className="small muted">The same point, written two ways.</p>
        <div className="two">
          <div>
            <span className="label">Generic</span>
            <p className="quote small">{voice.example.generic}</p>
          </div>
          <div>
            <span className="label">In your voice</span>
            <p className="quote small">{voice.example.yours}</p>
          </div>
        </div>
        {voice.samples < 2 && (
          <p className="small muted">This is a starting guess. Add 2 or 3 of your own posts for a closer match.</p>
        )}
      </section>
    </div>
  );
}
