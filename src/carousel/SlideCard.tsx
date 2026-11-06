// One slide as a card: the picture, its phone checks, every field of its script, its tags, and the per-slide actions.
// Every action is a patch, so Undo and Redo cover all of them.
import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { ReplayButton } from '../live/Replay';
import { WhyPopover } from '../live/Why';
import { elementById, listElements, type ElementInfo } from '../image-engine/assets/library';
import type { SlideScript } from '../image-engine/carousel/types';
import type { StyledSlide } from '../image-engine/styles/compose';
import { linkScore } from '../image-engine/styles/tags';
import { patches } from './doc';
import { FieldEditor, LintBadges, TagEditor, type Apply } from './parts';
import { faithfulOf, type Rendered } from './render';
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

export function SlideCard({ index, count, slide, script, swaps, view, apply, onShuffle, onImageText, onRedesign, picker, onOpen, onDownload, deckLabel, photo, object, pictures, palette, hasPhotoStyle, addFiles }: {
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
  /** Shuffles the slide's pictures; false when no other choice fits. */
  onShuffle: () => boolean;
  /** "put X as the background here": makes an image request for this slide and says what it did. */
  onImageText?: (text: string) => string;
  /** Designed decks: a small model call for this slide's design; says what happened. */
  onRedesign?: (words: string) => Promise<string>;
  /** Library decks: the layout picker and Rewrite text (replaces the SVG Redesign). */
  picker?: React.ReactNode;
  onOpen: () => void;
  onDownload: () => void;
  deckLabel: string;
}) {
  const [elementsOpen, setElementsOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const run = (r: ReturnType<Apply>) => setProblem(r.ok ? '' : r.reasons[0]);
  const title = `Slide ${index + 1} of ${count}, ${TYPE_LABEL[script.type]}`;
  const [imgText, setImgText] = useState('');
  const [imgMsg, setImgMsg] = useState('');
  const [rdWords, setRdWords] = useState('');
  const [rdMsg, setRdMsg] = useState('');
  const [rdBusy, setRdBusy] = useState(false);
  const used = slide.elementsUsed;
  const rec = script as unknown as Record<string, unknown>;
  // Picture spots nothing fills are not drawn (not in the picture, not in the export); here, in the editor, they show as a dashed outline.
  const empties = (slide as unknown as { emptySlots?: { id: string; x: number; y: number; w: number; h: number }[] }).emptySlots ?? [];
  const fa = faithfulOf(slide);
  const cw = fa ? fa.canvas.w : slide.plan.canvas.width;
  const ch = fa ? fa.canvas.h : slide.plan.canvas.height;
  const emptyOverlay = empties.length ? (
    <span aria-hidden="true" data-testid="empty-slot-overlay" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}>
      {empties.map((e) => <span key={e.id} style={{ position: "absolute", left: (e.x / cw * 100) + "%", top: (e.y / ch * 100) + "%", width: (e.w / cw * 100) + "%", height: (e.h / ch * 100) + "%", border: "2px dashed #888", borderRadius: 6, boxSizing: "border-box" }} />)}
    </span>
  ) : null;

  return (
    <li className="card cr-card" aria-label={title} data-status={view?.status ?? "drawing"}>
      <div className="cr-pic">
        <button type="button" className="cr-pic-btn" style={{ position: "relative" }} onClick={onOpen} disabled={!view?.url} aria-label={`Open ${deckLabel} slide ${index + 1} full size`}>
          {emptyOverlay}{view?.url ? <img src={view.url} alt={`${deckLabel}, slide ${index + 1}: ${slide.type}, ${slide.layout} layout`} width={216} height={216 * (slide.plan.canvas.height / slide.plan.canvas.width)} /> : <span className="cr-pic-wait small muted" role="status">{view?.status === 'error' ? 'Could not draw this slide' : 'Drawing…'}</span>}
        </button>
        <LintBadges lint={view?.rendered?.lint} />
        {slide.notes
          .filter((n) => n.startsWith("Highlight '") || n.startsWith("This slide fell back"))
          .map((n) => (
            <p key={n} className="small cr-warn" role="status">
              <span aria-hidden="true">⚠ </span>
              {n}
            </p>
          ))}
        {faithfulOf(slide) && <p className="small muted" data-testid="faithful-note">Drawn as the pack's design was written. Checks that cannot run on it: {view?.rendered?.warnings?.length ? 'contrast over art, graphics crossing text, picture overlap' : 'see Make editable'}.</p>}
        {onImageText && (
          <label className="tn-field">
            <span className="field-label">Put a picture here</span>
            <input className="input" value={imgText} placeholder="put a sunrise as the background here" aria-label={`Picture for slide ${index + 1}`} onChange={(e) => setImgText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setImgMsg(onImageText(imgText)); setImgText(''); } }} />
            {imgMsg && <span className="small" role="status">{imgMsg}</span>}
          </label>
        )}
        {onRedesign && (
          <div className="tn-field" data-testid={`redesign-${index}`}>
            <span className="field-label">Redesign this slide: 1 Sonnet call, about 30 seconds (runs only when you press the button)</span>
            <input className="input" value={rdWords} disabled={rdBusy} placeholder="optional: bolder, with a clock icon" aria-label={`Words for redesigning slide ${index + 1}`} onChange={(e) => setRdWords(e.target.value)} />
            <button type="button" className="btn btn-outline btn-sm" disabled={rdBusy} onClick={async () => { setRdBusy(true); setRdMsg(''); setRdMsg(await onRedesign(rdWords)); setRdBusy(false); }}>
              {rdBusy ? 'Redesigning…' : 'Redesign this slide'}
            </button>
            {rdMsg && <span className="small" role="status">{rdMsg}</span>}
          </div>
        )}
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
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setProblem(onShuffle() ? '' : 'No other pictures fit this slide.')}>Shuffle elements</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => run(apply(patches.regenerate(index)))}>Regenerate from the plan</button>
          {faithfulOf(slide) && <button type="button" className="btn btn-outline btn-sm" onClick={() => run(apply(patches.makeEditable(index)))} title="This slide is drawn exactly as the pack's design was written. Making it editable turns it into layers; fine details may change.">Make editable</button>}
          <ReplayButton plan={slide.plan} label={`Slide ${index + 1}`} />
          <WhyPopover slide={slide} lint={view?.rendered?.lint} repairs={view?.rendered?.repairs} />
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
        {picker}
        {problem && <p className="small cr-problem" role="alert">{problem}</p>}
      </div>
    </li>
  );
}
