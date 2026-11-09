// The Text tab of a library slide: the slide's own text fields (small line, headline, line below, ...) and its highlighted words.
// Typing waits a moment, then draws THIS slide again from its stored plan (no model call, one undo step). The editor works on the plan's layout fields, so the drawing, the stored plan
// and the script form of the slide all stay in step.
import { useEffect, useId, useRef, useState } from 'react';
import { layoutDef } from './layouts/library';
import type { Fields } from './layouts/types';
import { parseRef } from './layouts/images';

export interface TextSpec { layout: string; fields: Fields; accents: string[] }
/** A change to the slide's text: some fields (null removes an optional one) and/or the highlighted words. The page merges it into the latest plan, draws the slide again and says what happened ('' = fine). */
export interface TextDelta { fields?: Record<string, string | string[] | null>; accents?: string[] }
export type OnTextCommit = (delta: TextDelta) => Promise<string>;

/** A plain name for a layout field. */
export function fieldLabel(name: string, list: boolean): string {
  if (list) return /items|steps|bullets|callouts/i.test(name) ? 'List (one item per line)' : `${humanize(name)} (one per line)`;
  if (/^(kicker|lead|tag|leftLabel|rightLabel|label)$/i.test(name)) return 'Small line';
  if (/^(headline|title|question|heading|subject|quote|statement)$/i.test(name)) return 'Headline';
  if (/^(caption|line|subtitle|sub|subline|intro|note|source|author)$/i.test(name)) return 'Line below';
  if (/^(body|paragraph|p\d|pull|card|closing|leftText|rightText|wrong|right)$/i.test(name)) return /^p\d$/i.test(name) ? `Paragraph ${name.slice(1)}` : name === 'pull' ? 'Pull line' : 'Text';
  if (/^button\d?$/i.test(name)) return 'Button label';
  if (/^(number|numeral|step)$/i.test(name)) return 'Number';
  return humanize(name);
}
const humanize = (n: string) => n.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function Field({ id, label, value, multi, onCommit }: { id: string; label: string; value: string; multi: boolean; onCommit: (text: string) => Promise<string> }) {
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState('');
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { if (!dirty.current) setDraft(value); }, [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const send = async (text: string) => {
    dirty.current = false;
    if (text === value) return setProblem('');
    setProblem(await onCommit(text));
  };
  const change = (text: string) => {
    setDraft(text);
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void send(text), 450);
  };
  const common = { id, value: draft, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(e.target.value), onBlur: () => { window.clearTimeout(timer.current); if (dirty.current) void send(draft); } };
  return (
    <div className="field cr-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {multi ? <textarea rows={4} className="cr-wide" {...common} /> : <input type="text" className="cr-input cr-wide" {...common} />}
      {problem && <span className="small cr-problem" role="alert">{problem}</span>}
    </div>
  );
}

export function LibraryText({ index, spec, onCommit }: { index: number; spec: TextSpec; onCommit: OnTextCommit }) {
  const base = useId();
  const def = layoutDef(spec.layout);
  const fields = (def?.fields ?? []).filter((f) => !f.image && !parseRef(spec.fields[f.name]));
  const asText = (v: unknown) => (Array.isArray(v) ? v.join('\n') : typeof v === 'string' ? v : '');
  const commitField = (name: string, list: boolean, required: boolean) => async (text: string): Promise<string> => {
    const t = list ? text.split('\n').map((x) => x.trim()).filter(Boolean) : text.trim();
    if (required && (list ? (t as string[]).length === 0 : !t)) return 'This one cannot be empty.';
    const empty = list ? (t as string[]).length === 0 : !t;
    return onCommit({ fields: { [name]: empty ? null : (t as string | string[]) } });
  };
  return (
    <div className="cr-text-tab" data-testid={`text-tab-${index}`}>
      {fields.length === 0 && <p className="small muted">This layout has no text to edit.</p>}
      {fields.map((f) => {
        const list = !!f.list;
        const multi = list || f.max > 80;
        return <Field key={f.name} id={`${base}-${f.name}`} label={`${fieldLabel(f.name, list)}${f.required ? '' : ' (optional)'}`} value={asText(spec.fields[f.name])} multi={multi} onCommit={commitField(f.name, list, f.required)} />;
      })}
      <Field id={`${base}-accents`} label="Highlighted words (optional)" value={spec.accents.join(', ')} multi={false} onCommit={async (text) => onCommit({ accents: text.split(',').map((x) => x.trim()).filter(Boolean) })} />
      <span className="small muted">Words to highlight, separated by commas. They must appear in the text above.</span>
    </div>
  );
}
