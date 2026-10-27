// Images > Styles: the person's own templates (made from references), with rename, duplicate, delete, export and import, and the way into
// "New style from references". Templates also appear, tagged "Mine", in the style pickers for carousels and Make a thumbnail.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../useDocumentTitle';
import { downloadBlob } from '../carousel/export';
import { newProject } from '../carousel/doc';
import { loadSaved, readStore, STORE_KEY, writeStore } from '../carousel/useProject';
import { newThumbProject, parseSavedThumb } from '../thumbnail/doc';
import { THUMB_STORE_KEY } from '../thumbnail/useThumbProject';
import { deleteTemplate, duplicateTemplate, ensureTemplatesLoaded, exportTemplates, importTemplates, renameTemplate, targetWarning, templateProblem, templates, useTemplatesVersion, type Template } from './templates';
import { TARGET_LABEL } from './types';
import '../styles/carousel.css';
import '../styles/reference.css';

/** Makes a template the style of the saved carousel project (or of a fresh one), then opens the carousel screen. */
function useInCarousel(t: Template) {
  const saved = loadSaved(t.spec.name) ?? newProject(t.spec.name);
  saved.doc.style = t.spec.name;
  writeStore(STORE_KEY, JSON.stringify({ project: saved }));
}
function useInThumbnail(t: Template) {
  const saved = parseSavedThumb(readStore(THUMB_STORE_KEY)) ?? newThumbProject();
  saved.doc.style = t.spec.name;
  writeStore(THUMB_STORE_KEY, JSON.stringify({ project: saved }));
}

export default function StylesPage() {
  useDocumentTitle('Styles');
  useTemplatesVersion();
  const nav = useNavigate();
  useEffect(() => {
    void ensureTemplatesLoaded();
  }, []);
  const list = templates();
  const [message, setMessage] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (t: Template, use: 'carousel' | 'thumbnail') => {
    const w = targetWarning(t.spec.name, use);
    if (w && !window.confirm(`${w}\n\nUse it anyway?`)) return;
    if (use === 'carousel') useInCarousel(t);
    else useInThumbnail(t);
    nav(use === 'carousel' ? '/images/carousel' : '/images/thumbnail');
  };

  return (
    <div className="page cr-page rf-page">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Styles</h1>
          <p className="lead">Your own templates, made from references. They appear in the style pickers for carousels and thumbnails, tagged “Mine”.</p>
        </div>
        <div className="row-actions">
          <Link to="/images/styles/new" className="btn btn-primary btn-lg">New style from references</Link>
        </div>
      </header>

      <section className="card rf-sec" aria-labelledby="st-h">
        <div className="cr-toolbar">
          <h2 id="st-h" className="h3">Your templates</h2>
          <div className="row-actions">
            <button type="button" className="btn btn-outline btn-sm" disabled={list.length === 0} onClick={() => downloadBlob(exportTemplates(), 'style-templates.json')}>Export all</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>Import from a file</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              tabIndex={-1}
              aria-label="Choose a templates file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const r = await importTemplates(await f.text());
                setMessage(`${r.added.length} template${r.added.length === 1 ? '' : 's'} imported.${r.rejected.length ? ` Left out: ${r.rejected.join(' ')}` : ''}`);
              }}
            />
          </div>
        </div>
        {message && <p className="small" role="status">{message}</p>}
        {templateProblem() && <p className="small cr-problem" role="alert">{templateProblem()}</p>}
        {list.length === 0 && (
          <div className="card empty">
            <strong>No templates yet</strong>
            <span className="muted">Press “New style from references”, add a picture you like, and save what the app makes of it.</span>
          </div>
        )}
        <ul className="rf-templates" aria-label="Templates">
          {list.map((t) => (
            <li key={t.id} className="card rf-template" aria-label={`Template ${t.name}`}>
              {t.preview ? <img src={t.preview} alt={`Preview of ${t.name}`} /> : <span className="small muted">No preview</span>}
              <div className="rf-template-body">
                {renaming === t.id ? (
                  <label className="tn-field">
                    <span className="field-label">New name</span>
                    <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`New name for ${t.name}`} onKeyDown={(e) => { if (e.key === 'Enter') { void renameTemplate(t.id, draft); setRenaming(null); } }} />
                  </label>
                ) : (
                  <h3 className="h4">{t.name} <span className="chip chip-tag">Mine</span></h3>
                )}
                <p className="small muted">Made for {TARGET_LABEL[t.target].toLowerCase()}{t.singleImage ? '. Built from one image, so the other slide types are extrapolated.' : '.'}{t.missing?.length ? ` Could not draw: ${t.missing.slice(0, 4).join(', ')}.` : ''}</p>
                <div className="cr-photo-actions">
                  {renaming === t.id ? (
                    <>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => { void renameTemplate(t.id, draft); setRenaming(null); }}>Save name</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { setRenaming(t.id); setDraft(t.name); }} aria-label={`Rename ${t.name}`}>Rename</button>
                  )}
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void duplicateTemplate(t.id)} aria-label={`Duplicate ${t.name}`}>Duplicate</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => window.confirm(`Delete “${t.name}”? This cannot be undone.`) && void deleteTemplate(t.id)} aria-label={`Delete ${t.name}`}>Delete</button>
                </div>
                <div className="cr-photo-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => apply(t, 'carousel')} aria-label={`Use ${t.name} for a carousel`}>Use for a carousel</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => apply(t, 'thumbnail')} aria-label={`Use ${t.name} for a thumbnail`}>Use for a thumbnail</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
