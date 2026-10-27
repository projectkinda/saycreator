// One slide as a card: the picture, its phone checks, every field of its script, its tags, and the per-slide actions.
// Every action is a patch, so Undo and Redo cover all of them.
import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { elementById, listElements, type ElementInfo } from '../image-engine/assets/library';
import type { SlideScript } from '../image-engine/carousel/types';
import type { StyledSlide } from '../image-engine/styles/compose';
import { linkScore } from '../image-engine/styles/tags';
import { patches } from './doc';
import { FieldEditor, LintBadges, TagEditor, type Apply } from './parts';
import type { Rendered } from './render';
import { FIELDS, TYPE_LABEL } from './script';
import type { Palette } from '../image-engine/carousel/types';
import type { ObjectChoice } from '../image-engine/photo/objects';
import { PhotoControls, type AddFiles } from './PhotoControls';
import type { PhotoChoice } from './photoChoices';
import type { PictureMeta } from './photoLibrary';

export interface SlideView {
  status: 'drawing' | 'ready' | 'error';
  rendered?: Rendered;
  url?: string;
  error?: string;
}

function Alternatives({ slide, info, used, onPick }: { slide: StyledSlide; info: ElementInfo; used: string[]; onPick: (id: string) => void }) {
  const tags = slide.elementTags ?? [];
  const options = useMemo(
    () =>
      listElements()
        .filter((e) => e.id !== info.id && e.kind === info.kind && !used.includes(e.id) && e.tags.some((t) => info.tags.includes(t)))
        .map((e) => ({ e, s: linkScore(tags, e.tags) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 30)
        .map((x) => x.e),
    [info, tags, used],
  );
  if (options.length === 0) return <span className="small muted">No similar element to swap to.</span>;
  return (
    <select className="plain-select cr-select" aria-label={`Swap ${info.name} for another element`} value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">Swap for…</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name} ({o.pack})</option>
      ))}
    </select>
  );
}

export function SlideCard({ index, count, slide, script, swaps, view, apply, onOpen, onDownload, deckLabel, photo, object, pictures, palette, hasPhotoStyle, addFiles }: {
  photo?: PhotoChoice;
  object?: ObjectChoice;
  pictures: PictureMeta[];
  palette: Palette;
  hasPhotoStyle: boolean;
  addFiles: AddFiles;
  index: number;
  count: number;
  slide: StyledSlide;
  script: SlideScript;
  /** The swaps already made on this slide (original id to chosen id). */
  swaps?: Record<string, string>;
  view: SlideView | undefined;
  apply: Apply;
  onOpen: () => void;
  onDownload: () => void;
  deckLabel: string;
}) {
  const [elementsOpen, setElementsOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const run = (r: ReturnType<Apply>) => setProblem(r.ok ? '' : r.reasons[0]);
  const title = `Slide ${index + 1} of ${count}, ${TYPE_LABEL[script.type]}`;
  const used = slide.elementsUsed;
  const rec = script as unknown as Record<string, unknown>;

  return (
    <li className="card cr-card" aria-label={title} data-status={view?.status ?? "drawing"}>
      <div className="cr-pic">
        <button type="button" className="cr-pic-btn" onClick={onOpen} disabled={!view?.url} aria-label={`Open ${deckLabel} slide ${index + 1} full size`}>
          {view?.url ? <img src={view.url} alt={`${deckLabel}, slide ${index + 1}: ${slide.type}, ${slide.layout} layout`} width={216} height={216 * (slide.plan.canvas.height / slide.plan.canvas.width)} /> : <span className="cr-pic-wait small muted" role="status">{view?.status === 'error' ? 'Could not draw this slide' : 'Drawing…'}</span>}
        </button>
        <LintBadges lint={view?.rendered?.lint} />
        {slide.notes
          .filter((n) => n.startsWith("Highlight '"))
          .map((n) => (
            <p key={n} className="small cr-warn" role="status">
              <span aria-hidden="true">⚠ </span>
              {n}
            </p>
          ))}
        {view?.error && <p className="small cr-problem" role="alert">{view.error}</p>}
      </div>
      <div className="cr-edit">
        <h3 className="h4 cr-title">
          <span className="chip">{index + 1}</span> {TYPE_LABEL[script.type]}
        </h3>
        {FIELDS[script.type].map((f) => (
          <FieldEditor key={f.key} index={index} def={f} value={rec[f.key]} apply={apply} />
        ))}
        <TagEditor index={index} tags={script.element_tags ?? []} apply={apply} />
        <PhotoControls index={index} slide={slide} script={script} choice={photo} object={object} pictures={pictures} palette={palette} hasPhotoStyle={hasPhotoStyle} apply={apply} addFiles={addFiles} />
        <div className="cr-actions">
          <label className="cr-inline">
            <span className="field-label">Layout</span>
            <select className="plain-select cr-select" value={slide.layout} onChange={(e) => run(apply(patches.layout(index, e.target.value)))}>
              {slide.layoutChoices.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => run(apply(patches.shuffle(index, Math.random().toString(36).slice(2, 7))))}>Shuffle elements</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => run(apply(patches.regenerate(index)))}>Regenerate from the plan</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onDownload} disabled={!view?.rendered}>
            <Icon name="upload" size={14} /> Download PNG
          </button>
        </div>
        <details className="cr-els" onToggle={(e) => setElementsOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="small">Elements on this slide ({used.length})</summary>
          {used.length === 0 && <p className="small muted">None were placed here. {slide.notes.find((n) => /links to this slide|No free space/.test(n)) ?? ''}</p>}
          {elementsOpen && (
            <ul className="cr-el-list">
              {used.map((id) => {
                const info = elementById(id);
                const link = slide.elementLinks?.find((l) => l.id === id);
                return (
                  <li key={id}>
                    <span className="small">
                      <strong>{info?.name ?? id}</strong> <span className="muted">({id}; {link?.related === true ? 'matches the tags' : link?.related === false ? 'does not match the tags' : 'decoration'})</span>
                    </span>
                    {info && <Alternatives slide={slide} info={info} used={used} onPick={(to) => run(apply(patches.swap(index, Object.entries(swaps ?? {}).find(([, v]) => v === id)?.[0] ?? id, to)))} />}
                  </li>
                );
              })}
            </ul>
          )}
        </details>
        {problem && <p className="small cr-problem" role="alert">{problem}</p>}
      </div>
    </li>
  );
}
