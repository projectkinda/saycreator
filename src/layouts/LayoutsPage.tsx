// Images > Layouts: a gallery of designer layouts (a TEST SET), drawn as labelled boxes at their true shape. Filter, star, fit your own words and photo
// into one with no model, and save one as a template (kept with your current style, tagged "Mine").
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../useDocumentTitle';
import { carouselStyles } from '../carousel/render';
import { loadSaved } from '../carousel/useProject';
import { blankStyle, BLANK_NAME } from '../reference/blank';
import { defaultThumbnail } from '../reference/spec';
import { ensureTemplatesLoaded, saveTemplate, styleNameFor, useTemplatesVersion } from '../reference/templates';
import type { Target } from '../reference/types';
import { fitLayout, previewUrl, withLayout, type Fitted, type MyContent } from './fit';
import { LayoutDrawing } from './LayoutDrawing';
import { isFavourite, loadLayouts, toggleFavourite, useFavouritesVersion, type Loaded } from './store';
import { isCarouselShape, type GalleryLayout } from './types';
import '../styles/carousel.css';
import '../styles/reference.css';
import '../styles/layouts.css';

const PAGE = 48;
type Tried = { status: 'busy' } | { status: 'error'; message: string } | { status: 'done'; fitted: Fitted };

function readImage(file: File): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('That file could not be read as a picture.'));
    img.src = url;
  });
}

const counted = (list: GalleryLayout[], key: (l: GalleryLayout) => string) => {
  const m = new Map<string, number>();
  for (const l of list) m.set(key(l), (m.get(key(l)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const CATEGORY_WORDS = (c: string) => c.replace(/([A-Z])/g, ' $1').toLowerCase();

export default function LayoutsPage() {
  useDocumentTitle('Layouts');
  useFavouritesVersion();
  useTemplatesVersion();
  const [state, setState] = useState<{ data: Loaded | null; reason: string } | null>(null);
  useEffect(() => {
    void ensureTemplatesLoaded();
    void loadLayouts().then(setState);
  }, []);

  // ---- the person's content and style ----
  const [content, setContent] = useState<MyContent>({ title: 'Your headline goes here', sub: '', label: '', body: '', photo: null });
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const styles = carouselStyles();
  const current = useMemo(() => loadSaved(BLANK_NAME)?.doc.style ?? '', []);
  const [styleName, setStyleName] = useState(current && styles.some((s) => s.spec.name === current) ? current : BLANK_NAME);
  const styleSpec = () => (styleName === BLANK_NAME ? blankStyle() : (styles.find((s) => s.spec.name === styleName)?.spec ?? blankStyle()));

  // ---- filters ----
  const [format, setFormat] = useState('');
  const [category, setCategory] = useState('');
  const [shape, setShape] = useState('');
  const [texts, setTexts] = useState('');
  const [photo, setPhoto] = useState('');
  const [query, setQuery] = useState('');
  const [onlyStars, setOnlyStars] = useState(false);
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [format, category, shape, texts, photo, query, onlyStars]);

  const all = state?.data?.layouts ?? [];
  const list = all.filter((l) => {
    if (format && l.format !== format) return false;
    if (category && l.category !== category) return false;
    if (shape && l.ratio !== shape) return false;
    if (texts && Math.min(l.textCount, 6) !== Number(texts)) return false;
    if (photo === 'with' && !l.photoCount) return false;
    if (photo === 'without' && l.photoCount) return false;
    if (onlyStars && !isFavourite(l.id)) return false;
    const q = query.trim().toLowerCase();
    if (q && !`${l.format} ${l.category} ${CATEGORY_WORDS(l.category)} ${l.keywords.join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // ---- trying and saving ----
  const [tried, setTried] = useState<Record<string, Tried>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const set = (id: string, t: Tried) => setTried((p) => ({ ...p, [id]: t }));
  const tryIt = async (l: GalleryLayout) => {
    set(l.id, { status: 'busy' });
    try {
      set(l.id, { status: 'done', fitted: await fitLayout({ layout: l, style: styleSpec(), content }) });
    } catch (e) {
      set(l.id, { status: 'error', message: (e as Error).message });
    }
  };
  const saveIt = async (l: GalleryLayout, f: Fitted) => {
    const base = styleSpec();
    const name = `${l.format} layout ${l.id.slice(3, 7)}`;
    const carousel = isCarouselShape(l);
    const target: Target = l.ratio === '16:9' ? 'thumbnail' : 'carousel';
    // Only the carousel's own shape (4:5) can be stored in a style without stretching it; any other shape is kept in the template, not applied.
    const spec = { ...(carousel ? withLayout(base, l) : base), name: styleNameFor(name) };
    if (target === 'thumbnail' && !spec.thumbnail) spec.thumbnail = defaultThumbnail(spec);
    const missing = carousel ? l.free.missing : [`the ${l.ratio} layout is kept but not applied: carousels are 4:5 and the thumbnail maker uses its own layouts`];
    await saveTemplate({ name, target, spec, preview: await previewUrl(f), missing: (missing ?? []).slice(0, 4), layoutKept: carousel ? undefined : { id: l.id, ratio: l.ratio, w: l.w, h: l.h, free: l.free } });
    setSaved((p) => ({ ...p, [l.id]: carousel ? `Saved as “${name}”. Your carousel covers use this layout in your style.` : `Saved as “${name}” with your style. This layout is ${l.ratio}; carousels are 4:5 and the thumbnail maker draws its own layouts, so the layout is kept inside the template but not applied, and nothing is stretched.` }));
  };

  const formats = counted(all, (l) => l.format);
  const categories = counted(all, (l) => l.category);
  const shapes = counted(all, (l) => l.ratio);

  return (
    <div className="page cr-page rf-page lg-page">
      <header className="page-header">
        <div className="page-header-text">
          <p className="small"><Link to="/images">← Images</Link></p>
          <h1 className="page-title">Layouts</h1>
          <p className="lead">Layouts made by designers, kept as boxes only: where the title, the other text and the photo go, and how big. Fit your own words into one, or save one as a template.</p>
        </div>
      </header>

      <p className="lg-test-banner" role="note"><strong>TEST DATA: Crello, not shippable until licences are checked.</strong> This set is read from a local file by the development server. It is not part of the app, and a build fails if it ends up in one.</p>

      {state === null && <p role="status">Loading the layouts…</p>}
      {state && !state.data && <div className="card empty"><strong>No layouts to show</strong><span className="muted">{state.reason}</span></div>}

      {state?.data && (
        <>
          <section className="card rf-sec" aria-labelledby="lg-content-h">
            <h2 id="lg-content-h" className="h3">Your content</h2>
            <div className="lg-content">
              <label className="tn-field"><span className="field-label">Title</span><input className="input" value={content.title} onChange={(e) => setContent({ ...content, title: e.target.value })} /></label>
              <label className="tn-field"><span className="field-label">Subtitle (optional)</span><input className="input" value={content.sub} onChange={(e) => setContent({ ...content, sub: e.target.value })} /></label>
              <label className="tn-field"><span className="field-label">Small label (optional)</span><input className="input" value={content.label} onChange={(e) => setContent({ ...content, label: e.target.value })} /></label>
              <label className="tn-field"><span className="field-label">Body text (optional)</span><input className="input" value={content.body} onChange={(e) => setContent({ ...content, body: e.target.value })} /></label>
              <div className="tn-field">
                <span className="field-label">Photo (optional)</span>
                <div className="cr-photo-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{content.photo ? 'Change photo' : 'Add a photo'}</button>
                  {content.photo && <button type="button" className="btn btn-outline btn-sm" onClick={() => setContent({ ...content, photo: null })}>Remove</button>}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  tabIndex={-1}
                  aria-label="Choose a photo"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    try {
                      setPhotoError('');
                      setContent({ ...content, photo: await readImage(f) });
                    } catch (err) {
                      setPhotoError((err as Error).message);
                    }
                  }}
                />
                {photoError && <span className="small cr-problem" role="alert">{photoError}</span>}
                {content.photo && <img className="lg-photo-thumb" src={content.photo.url} alt="Your photo" />}
              </div>
              <label className="tn-field">
                <span className="field-label">Style</span>
                <select className="input" value={styleName} onChange={(e) => setStyleName(e.target.value)} aria-label="Style for the preview">
                  <option value={BLANK_NAME}>Plain white (the layout alone)</option>
                  {styles.map((s) => <option key={s.spec.name} value={s.spec.name}>{s.spec.title}{s.spec.name === current ? ' (your current carousel style)' : ''}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="card rf-sec" aria-labelledby="lg-filter-h">
            <h2 id="lg-filter-h" className="h3">Find a layout</h2>
            <div className="lg-filters">
              <label className="tn-field"><span className="field-label">Format</span>
                <select className="input" value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Format"><option value="">All formats</option>{formats.map(([f, n]) => <option key={f} value={f}>{f} ({n})</option>)}</select></label>
              <label className="tn-field"><span className="field-label">Shape</span>
                <select className="input" value={shape} onChange={(e) => setShape(e.target.value)} aria-label="Shape"><option value="">All shapes</option>{shapes.map(([f, n]) => <option key={f} value={f}>{f} ({n})</option>)}</select></label>
              <label className="tn-field"><span className="field-label">Category</span>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"><option value="">All categories</option>{categories.map(([f, n]) => <option key={f} value={f}>{CATEGORY_WORDS(f)} ({n})</option>)}</select></label>
              <label className="tn-field"><span className="field-label">Text blocks</span>
                <select className="input" value={texts} onChange={(e) => setTexts(e.target.value)} aria-label="Text blocks"><option value="">Any number</option>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n === 6 ? '6 or more' : n}</option>)}</select></label>
              <label className="tn-field"><span className="field-label">Photo</span>
                <select className="input" value={photo} onChange={(e) => setPhoto(e.target.value)} aria-label="Photo"><option value="">With or without</option><option value="with">Has a photo</option><option value="without">No photo</option></select></label>
              <label className="tn-field"><span className="field-label">Search keywords</span><input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="sale, travel, food…" aria-label="Search keywords" /></label>
              <label className="lg-check"><input type="checkbox" checked={onlyStars} onChange={(e) => setOnlyStars(e.target.checked)} /> Starred only</label>
            </div>
            <p className="small muted" role="status">Showing {Math.min(shown, list.length)} of {list.length} layouts ({all.length} in the set; {state.data.file.chosen} were picked and {state.data.file.chosen - state.data.file.afterDedupe} near-copies folded away).{state.data.rejected.length ? ` ${state.data.rejected.length} left out because they failed the layout checks.` : ''}</p>
          </section>

          {list.length === 0 && <div className="card empty"><strong>No layout matches</strong><span className="muted">Loosen a filter.</span></div>}
          <ul className="lg-grid" aria-label="Layouts">
            {list.slice(0, shown).map((l) => {
              const t = tried[l.id];
              const star = isFavourite(l.id);
              return (
                <li key={l.id} className="card lg-card" aria-label={`Layout ${l.id}`}>
                  <div className="lg-frames">
                    <LayoutDrawing layout={l} />
                    {t?.status === 'done' && <img className="lg-fitted" src={t.fitted.url} alt={`Your content in layout ${l.id}`} style={{ aspectRatio: `${l.w} / ${l.h}` }} />}
                  </div>
                  <div className="lg-meta">
                    <span className="small"><strong>{l.format}</strong> · {l.ratio} · {l.textCount} text{l.textCount === 1 ? '' : ' blocks'} · {l.photoCount ? `${l.photoCount} photo${l.photoCount === 1 ? '' : 's'}` : 'no photo'}{l.similar ? ` · ${l.similar} like it folded in` : ''}</span>
                    <button type="button" className={`lg-star${star ? ' on' : ''}`} aria-pressed={star} aria-label={`${star ? 'Remove the star from' : 'Star'} layout ${l.id}`} onClick={() => toggleFavourite(l.id)}>{star ? '★' : '☆'}</button>
                  </div>
                  <p className="small muted lg-cat">{CATEGORY_WORDS(l.category)}{l.keywords.length ? ` · ${l.keywords.slice(0, 4).join(', ')}` : ''}</p>
                  <div className="cr-photo-actions">
                    <Link to="/images/thumbnail" className="btn btn-outline btn-sm" onClick={() => { try { sessionStorage.setItem('creator.skeleton', l.id); } catch { /* not remembered */ } }} aria-label={`Use layout ${l.id} as a starting layout in Describe the look`}>Use as a starting layout</Link>
                    <button type="button" className="btn btn-outline btn-sm" disabled={t?.status === 'busy'} onClick={() => void tryIt(l)} aria-label={`Try layout ${l.id} with my content`}>{t?.status === 'busy' ? 'Fitting…' : t?.status === 'done' ? 'Try again' : 'Try with my content'}</button>
                    {t?.status === 'done' && <button type="button" className="btn btn-outline btn-sm" onClick={() => void saveIt(l, t.fitted)} aria-label={`Save layout ${l.id} as a template`}>Save as template</button>}
                  </div>
                  {t?.status === 'error' && <p className="small cr-problem" role="alert">{t.message}</p>}
                  {t?.status === 'done' && <p className={`small ${t.fitted.fits ? 'muted' : 'cr-problem'}`} role="status">{t.fitted.fits ? 'Fits.' : 'Does not fit cleanly.'} {t.fitted.notes.join(' ')}</p>}
                  {saved[l.id] && <p className="small" role="status">{saved[l.id]} <Link to="/images/styles">See your templates</Link>.</p>}
                </li>
              );
            })}
          </ul>
          {list.length > shown && <div className="row-actions"><button type="button" className="btn btn-outline btn-lg" onClick={() => setShown((s) => s + PAGE)}>Show more ({list.length - shown} left)</button></div>}
        </>
      )}
    </div>
  );
}
