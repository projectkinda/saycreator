import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { UploadProgress } from '../../components/UploadProgress';
import * as engine from '../../engine';
import { grad } from '../../format';

// Round J: the brand's colours are edited in ONE place, the "Brand colours" card above (main, second, extra); the kit's primary and highlight are those colours.
type Editing = 'fonts' | 'handle' | null;
const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

export function BrandKitTab({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [kit, setKit] = useState<engine.BrandKit | null>(null);
  const [fonts, setFonts] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [fontDraft, setFontDraft] = useState<engine.BrandKit['fonts'] | null>(null);
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [announce, setAnnounce] = useState('');

  const load = useCallback(() => {
    if (!brandId) return;
    setFailed(false);
    Promise.all([engine.getBrandKit(brandId), engine.listFonts()])
      .then(([k, f]) => {
        setKit(k);
        setFonts(f);
      })
      .catch(() => setFailed(true));
  }, [brandId]);
  useEffect(() => {
    load();
  }, [load]);

  const start = (what: Exclude<Editing, null>) => {
    if (!kit) return;
    setError('');
    setEditing(what);
    if (what === 'fonts') setFontDraft({ ...kit.fonts });
    if (what === 'handle') setHandle(kit.handle);
  };
  const cancel = () => {
    setEditing(null);
    setError('');
  };

  const save = async (patch: Parameters<typeof engine.updateBrandKit>[1], done: string) => {
    if (!brandId) return;
    setSaving(true);
    setError('');
    try {
      const res = await engine.updateBrandKit(brandId, patch);
      setKit(res.kit);
      setWarnings(res.warnings);
      setEditing(null);
      setAnnounce(done);
    } catch (e) {
      setError((e as Error).message || 'That did not save. Nothing was changed.');
    } finally {
      setSaving(false);
    }
  };

  if (failed)
    return (
      <div className="card empty" role="alert">
        <strong>We could not load your brand kit.</strong>
        <span className="muted">Nothing was lost. Check your connection and try again.</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
      </div>
    );
  if (!kit) return <p className="muted" role="status">Loading your brand kit…</p>;

  const live = {
    colors: kit.colors,
    fonts: editing === 'fonts' && fontDraft ? fontDraft : kit.fonts,
    handle: editing === 'handle' ? handle : kit.handle,
  };
  const slide: CSSProperties = { background: isHex(live.colors.background) ? live.colors.background : kit.colors.background, color: isHex(live.colors.text) ? live.colors.text : kit.colors.text };
  const safe = (c: string, fallback: string) => (isHex(c) ? c : fallback);
  const family = (f: string) => `'${f}', system-ui, sans-serif`;

  const errorBox = error && (
    <div className="notice notice-error" role="alert">
      <strong>Not saved</strong>
      <span>{error}</span>
    </div>
  );

  return (
    <div className="kit">
      <div className="brand-section-identity"><span>Visual kit for</span><strong>{brandName}</strong></div>
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>
      {warnings.length > 0 && (
        <div className="notice notice-warn" role="status">
          <strong>Saved, but worth a look</strong>
          {warnings.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
      )}

      <div className="two">
        {/* Colors: Round J, read-only here; edited in the Brand colours card */}
        <section className="card ws-card" aria-labelledby="colors-h" data-testid="kit-colours">
          <h2 id="colors-h" className="h3">Colors</h2>
          <ul className="swatches">
            {([['primary', 'Main colour'], ['highlight', 'Second colour']] as const).map(([k, label]) => (
              <li key={k} className="sw">
                <i style={{ background: kit.colors[k] }} aria-hidden="true" />
                <span>{label}</span>
                <span className="small muted">{kit.colors[k]}</span>
              </li>
            ))}
          </ul>
          <p className="small muted">Change your colours in Brand colours above. Text and background colours come from the style you pick for each carousel.</p>
        </section>

        {/* Fonts */}
        <section className="card ws-card" aria-labelledby="fonts-h">
          <h2 id="fonts-h" className="h3">Fonts</h2>
          {editing !== 'fonts' || !fontDraft ? (
            <>
              <dl className="kv">
                <dt className="label">Headlines</dt>
                <dd className="font-sample" style={{ fontFamily: family(kit.fonts.headline) }}>{kit.fonts.headline} Bold</dd>
                <dt className="label">Body</dt>
                <dd style={{ fontFamily: family(kit.fonts.body) }}>{kit.fonts.body} Regular</dd>
              </dl>
              <div><button type="button" className="btn btn-outline btn-sm" onClick={() => start('fonts')}>Change fonts</button></div>
            </>
          ) : (
            <>
              {(['headline', 'body'] as const).map((role) => (
                <label key={role} className="field">
                  <span className="field-label">{role === 'headline' ? 'Headlines' : 'Body'}</span>
                  <select className="plain-select" value={fontDraft[role]} onChange={(e) => setFontDraft({ ...fontDraft, [role]: e.target.value })}>
                    {fonts.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </label>
              ))}
              <p className="small muted">The preview on the right shows your choice. Fonts that are not installed in this browser show a stand-in.</p>
              {errorBox}
              <div className="row-actions">
                <button type="button" className="btn btn-dark btn-sm" disabled={saving} onClick={() => save({ fonts: fontDraft }, 'Fonts saved')}>
                  {saving ? 'Saving…' : 'Save fonts'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={cancel}>Cancel</button>
              </div>
            </>
          )}
        </section>

        {/* Logo and handle */}
        <section className="card ws-card" aria-labelledby="logo-h">
          <h2 id="logo-h" className="h3">Logo and handle</h2>
          <div className="logo-row">
            <div className="logo-box" style={grad(kit.logo.poster, 135)} role="img" aria-label={kit.logo.name} />
            <div className="logo-text">
              {editing === 'handle' ? (
                <label className="field">
                  <span className="field-label">Handle</span>
                  <input type="text" className="text-input" value={handle} spellCheck={false} onChange={(e) => setHandle(e.target.value)} />
                </label>
              ) : (
                <strong>{kit.handle}</strong>
              )}
              <span className="small muted">Shown on carousels and quote cards</span>
            </div>
          </div>
          {editing === 'handle' ? (
            <>
              {errorBox}
              <div className="row-actions">
                <button type="button" className="btn btn-dark btn-sm" disabled={saving || !handle.trim()} onClick={() => save({ handle }, 'Handle saved')}>
                  {saving ? 'Saving…' : 'Save handle'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={cancel}>Cancel</button>
              </div>
            </>
          ) : (
            <div className="row-actions">
              {brandId && (
                <UploadProgress
                  label="Replace logo"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  buttonClass="btn btn-outline btn-sm"
                  run={async (file, onProgress) => {
                    setKit(await engine.replaceLogo(brandId, file, onProgress));
                    setAnnounce('Logo replaced');
                  }}
                />
              )}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => start('handle')}>Edit handle</button>
            </div>
          )}
        </section>

        {/* Preview */}
        <section className="card ws-card" aria-labelledby="prev-h">
          <h2 id="prev-h" className="h3">Preview</h2>
          <div className="brand-slide" style={slide} role="img" aria-label="Sample carousel slide in your brand">
            <span className="slide-logo" style={grad(kit.logo.poster, 135)} aria-hidden="true" />
            <span className="slide-head" style={{ fontFamily: family(live.fonts.headline) }}>
              From 14 days <mark style={{ background: safe(live.colors.highlight, kit.colors.highlight), color: 'inherit' }}>to 3</mark>
            </span>
            <span className="slide-body" style={{ fontFamily: family(live.fonts.body) }}>What we changed first, and what we stopped doing.</span>
            <span className="slide-bar" style={{ background: safe(live.colors.primary, kit.colors.primary) }} aria-hidden="true" />
            <span className="slide-handle" style={{ fontFamily: family(live.fonts.body) }}>{live.handle}</span>
          </div>
          {editing && <p className="small muted">Showing your unsaved changes.</p>}
        </section>
      </div>
    </div>
  );
}
