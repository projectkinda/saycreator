import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { UploadProgress } from '../../components/UploadProgress';
import * as engine from '../../engine';
import { grad } from '../../format';

const COLOR_ROWS: { key: keyof engine.BrandColors; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'text', label: 'Text' },
  { key: 'background', label: 'Background' },
  { key: 'highlight', label: 'Highlight' },
];

type Editing = 'colors' | 'fonts' | 'handle' | null;
const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

export function BrandKitTab({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [kit, setKit] = useState<engine.BrandKit | null>(null);
  const [fonts, setFonts] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [colors, setColors] = useState<engine.BrandColors | null>(null);
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
    if (what === 'colors') setColors({ ...kit.colors });
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
    colors: editing === 'colors' && colors ? colors : kit.colors,
    fonts: editing === 'fonts' && fontDraft ? fontDraft : kit.fonts,
    handle: editing === 'handle' ? handle : kit.handle,
  };
  const colorsValid = colors ? Object.values(colors).every(isHex) : false;
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
        {/* Colors */}
        <section className="card ws-card" aria-labelledby="colors-h">
          <h2 id="colors-h" className="h3">Colors</h2>
          {editing !== 'colors' || !colors ? (
            <>
              <ul className="swatches">
                {COLOR_ROWS.map((c) => (
                  <li key={c.key} className="sw">
                    <i style={{ background: kit.colors[c.key] }} aria-hidden="true" />
                    <span>{c.label}</span>
                    <span className="small muted">{kit.colors[c.key]}</span>
                  </li>
                ))}
              </ul>
              <div><button type="button" className="btn btn-outline btn-sm" onClick={() => start('colors')}>Edit colors</button></div>
            </>
          ) : (
            <>
              <ul className="color-edit">
                {COLOR_ROWS.map((c) => (
                  <li key={c.key}>
                    <label className="field">
                      <span className="field-label">{c.label}</span>
                      <span className="color-pair">
                        <input
                          type="color"
                          aria-label={`${c.label} colour picker`}
                          value={safe(colors[c.key], '#000000')}
                          onChange={(e) => setColors({ ...colors, [c.key]: e.target.value.toUpperCase() })}
                        />
                        <input
                          type="text"
                          className="text-input"
                          value={colors[c.key]}
                          aria-invalid={!isHex(colors[c.key])}
                          spellCheck={false}
                          onChange={(e) => setColors({ ...colors, [c.key]: e.target.value })}
                        />
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {!colorsValid && <p className="small" role="status">Each colour needs six digits, like #1A2226.</p>}
              {errorBox}
              <div className="row-actions">
                <button type="button" className="btn btn-dark btn-sm" disabled={saving || !colorsValid} onClick={() => save({ colors }, 'Colors saved')}>
                  {saving ? 'Saving…' : 'Save colors'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={cancel}>Cancel</button>
              </div>
            </>
          )}
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
