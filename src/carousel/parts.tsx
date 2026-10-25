// Small pieces of the carousel editor: one editable field, the tag chips, the phone-check badges.
import { useEffect, useId, useRef, useState } from 'react';
import { VOCABULARY } from '../image-engine/styles/tags';
import type { CarouselLintResult } from '../image-engine/carousel/lint';
import { patches, type DocPatch } from './doc';
import type { FieldDef } from './script';

export type Apply = (patch: DocPatch) => { ok: true } | { ok: false; reasons: string[] };

/** One field of one slide. Typing re-renders the slide a moment after you stop; a field that must not be empty says so. */
export function FieldEditor({ index, def, value, apply }: { index: number; def: FieldDef; value: unknown; apply: Apply }) {
  const id = useId();
  const asText = (v: unknown) => (Array.isArray(v) ? v.join('\n') : v === undefined || v === null ? '' : String(v));
  const [draft, setDraft] = useState(asText(value));
  const [problem, setProblem] = useState('');
  const pending = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  // Follow the document when it changes from outside (undo, redo, a new script), but never overwrite what is being typed.
  useEffect(() => {
    if (!dirty.current) setDraft(asText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => () => window.clearTimeout(pending.current), []);

  const parse = (text: string): unknown => {
    if (def.kind === 'list') return text.split('\n').map((x) => x.trim()).filter(Boolean);
    if (def.kind === 'number') return text.trim() === '' ? undefined : Number(text);
    return text.trim() === '' ? undefined : text;
  };
  const send = (text: string) => {
    dirty.current = false;
    const v = parse(text);
    if (JSON.stringify(v) === JSON.stringify(value) || (v === undefined && (value === undefined || value === ''))) {
      setProblem('');
      return;
    }
    const r = apply(patches.editField(index, def.key, def.label, v));
    setProblem(r.ok ? '' : r.reasons[0]);
  };
  const change = (text: string) => {
    setDraft(text);
    dirty.current = true;
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => send(text), 450);
  };
  const flush = () => {
    window.clearTimeout(pending.current);
    if (dirty.current) send(draft);
  };

  const common = { id, value: draft, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(e.target.value), onBlur: flush, 'aria-describedby': problem ? `${id}-err` : def.hint ? `${id}-hint` : undefined, 'aria-invalid': problem ? true : undefined };
  return (
    <div className="field cr-field">
      <label className="field-label" htmlFor={id}>
        {def.label}
        {def.required ? '' : ' (optional)'}
      </label>
      {def.kind === 'text' && <input type="text" className="cr-input" {...common} />}
      {def.kind === 'number' && <input type="number" min={1} max={99} className="cr-input cr-input-sm" {...common} />}
      {(def.kind === 'area' || def.kind === 'list') && <textarea rows={def.kind === 'list' ? 4 : 3} {...common} />}
      {def.hint && !problem && <span id={`${id}-hint`} className="small muted">{def.hint}</span>}
      {problem && <span id={`${id}-err`} className="small cr-problem" role="alert">{problem}</span>}
    </div>
  );
}

/** The 2 to 4 words pictures are chosen by. Remove one with its x, add one by typing and pressing Enter. */
export function TagEditor({ index, tags, apply }: { index: number; tags: string[]; apply: Apply }) {
  const id = useId();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const change = (next: string[], what: string) => {
    const r = apply(patches.editTags(index, next));
    setProblem(r.ok ? '' : r.reasons[0]);
    if (r.ok) setText('');
    return r.ok ? what : '';
  };
  const add = () => {
    const t = text.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!t) return;
    if (tags.includes(t)) return setProblem(`"${t}" is already one of the tags.`);
    change([...tags, t], 'added');
  };
  return (
    <div className="field cr-field">
      <span className="field-label" id={`${id}-l`}>Picture tags (2 to 4)</span>
      <ul className="cr-tags" aria-labelledby={`${id}-l`}>
        {tags.map((t) => (
          <li key={t} className="chip chip-tag">
            {t}
            <button type="button" className="cr-x" aria-label={`Remove tag ${t}`} onClick={() => change(tags.filter((x) => x !== t), 'removed')}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="cr-tag-add">
        <input
          type="text"
          className="cr-input"
          list={`${id}-v`}
          value={text}
          placeholder="Add a tag, for example money"
          aria-label="Add a picture tag"
          aria-describedby={problem ? `${id}-err` : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
        />
        <datalist id={`${id}-v`}>{VOCABULARY.map((v) => <option key={v} value={v} />)}</datalist>
        <button type="button" className="btn btn-outline btn-sm" onClick={add}>Add tag</button>
      </div>
      {problem && <span id={`${id}-err`} className="small cr-problem" role="alert">{problem}</span>}
    </div>
  );
}

/** The phone-size checks of one slide: a summary, the failures with their reasons, and every check on request. */
export function LintBadges({ lint }: { lint: CarouselLintResult[] | undefined }) {
  if (!lint) return <p className="small muted" role="status">Drawing…</p>;
  const failed = lint.filter((l) => !l.pass);
  return (
    <div className="cr-lint">
      <span className={`chip ${failed.length === 0 ? 'chip-ok' : 'chip-warn'}`}>{failed.length === 0 ? `Phone check: all ${lint.length} pass` : `Phone check: ${failed.length} to fix`}</span>
      {failed.length > 0 && (
        <ul className="cr-lint-fail small">
          {failed.map((f) => (
            <li key={f.id}>
              <strong>{f.label}:</strong> {f.reason}
            </li>
          ))}
        </ul>
      )}
      <details className="small">
        <summary>All checks</summary>
        <ul className="cr-lint-all">
          {lint.map((l) => (
            <li key={l.id}>
              <span aria-hidden="true">{l.pass ? '✓' : '✗'}</span> <span className="visually-hidden">{l.pass ? 'Pass' : 'Fail'}: </span>
              {l.label}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
