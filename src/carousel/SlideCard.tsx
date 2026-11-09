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
import { SlotPanel, type OnSlotChange, type SlotView } from './PictureSlots';
import { LibraryText, type OnTextCommit, type TextSpec } from './TextTab';

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

export type EditTab = 'layout' | 'text' | 'pictures' | 'fine';
const TABS: { id: EditTab; label: string }[] = [
  { id: 'layout', label: 'Layout' },
  { id: 'text', label: 'Text' },
  { id: 'pictures', label: 'Pictures' },
  { id: 'fine', label: 'Fine-tune' },
];

/** The editor of ONE slide, as four tabs: Layout | Text | Pictures | Fine-tune. There is no second preview here: the big preview and the thumbnail strip stay on the left. */
export function SlideCard({ index, count, slide, script, swaps, view, apply, onShuffle, onImageText, onRedesign, layoutTab, rewriteBox, libraryText, onTextCommit, unusedBox, fineTuneBox, tab, onTab, devTools, openSlot, onOpenSlot, picturesState, onAddPicture, ownNote, onSplit, pictureSlots, onSlotChange, picturesUsedElsewhere, onDownload, deckLabel, photo, object, pictures, palette, hasPhotoStyle, addFiles }: {
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
  /** Designed decks (older route): a small model call for this slide's design; says what happened. */
  onRedesign?: (words: string) => Promise<string>;
  /** Library decks: the layout choices with the Variations (plane, colours). */
  layoutTab?: React.ReactNode;
  /** Library decks: the Rewrite text button (the one small model call). */
  rewriteBox?: React.ReactNode;
  /** Library decks: this slide's plan text, edited in the Text tab. */
  libraryText?: TextSpec;
  onTextCommit?: OnTextCommit;
  /** The unused-pictures tray (library decks). */
  unusedBox?: React.ReactNode;
  /** The Detected style toggles for the whole deck. */
  fineTuneBox?: React.ReactNode;
  tab: EditTab;
  onTab: (t: EditTab) => void;
  /** Developer tools are on: the older tools show even on a library deck. */
  devTools: boolean;
  /** The picture slot whose controls are open (a tap on the preview opens it too). */
  openSlot: string | null;
  onOpenSlot: (field: string | null) => void;
  /** A slide with too many words: cuts it in two at a sentence end (every word kept); says what happened. */
  onSplit?: () => Promise<string>;
  /** A pasted script: a line about this slide (it uses the simple layout, or its text is too long for any layout). */
  ownNote?: { kind: 'info' | 'warn'; text: string };
  /** 'none': the project has no pictures; 'free': there are unused ones; 'used': all are on other slides. */
  picturesState: 'none' | 'free' | 'used';
  /** Library slide without a picture slot: moves it to a picture layout of its own meaning and puts an unused picture in; says what happened. */
  onAddPicture?: () => Promise<string>;
  /** Library slides with pictures: the picture slots (tap one to replace, remove, move or zoom it). */
  pictureSlots?: SlotView[];
  onSlotChange?: OnSlotChange;
  /** The ids of the project pictures other slides use (they are not offered as a replacement here). */
  picturesUsedElsewhere?: Set<string>;
  onDownload: () => void;
  deckLabel: string;
}) {
  const [elementsOpen, setElementsOpen] = useState(false);
  const [splitMsg, setSplitMsg] = useState('');
  const [splitBusy, setSplitBusy] = useState(false);
  const tooManyWords = !!view?.rendered?.lint.some((l) => l.id === 'words' && !l.pass);
  const [addMsg, setAddMsg] = useState('');
  const [addBusy, setAddBusy] = useState(false);
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
  const isLibrary = !!layoutTab;
  const oldTools = devTools || !isLibrary;
  const open = pictureSlots?.find((s) => s.field === openSlot);

  const layout = (
    <>
      {layoutTab}
      {!isLibrary && (
        <label className="cr-inline">
          <span className="field-label">Layout</span>
          <select className="plain-select cr-select" value={slide.layout} onChange={(e) => run(apply(patches.layout(index, e.target.value)))}>
            {slide.layoutChoices.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
      )}
    </>
  );
  const text = (
    <>
      {libraryText && onTextCommit ? <LibraryText index={index} spec={libraryText} onCommit={onTextCommit} /> : FIELDS[script.type].map((f) => <FieldEditor key={f.key} index={index} def={f} value={rec[f.key]} apply={apply} />)}
      {rewriteBox}
    </>
  );
  const picturesTab = (
    <>
      {pictureSlots?.length && onSlotChange ? (
        <div className="tn-field">
          <span className="field-label">Picture slots on this slide</span>
          <div className="row-actions" role="group" aria-label={`Picture slots of slide ${index + 1}`}>
            {pictureSlots.map((sl) => (
              <button key={sl.field} type="button" className="btn btn-outline btn-sm" data-testid={`slot-tab-${index}-${sl.n}`} aria-label={`Edit picture ${sl.n} on slide ${index + 1}`} aria-expanded={openSlot === sl.field} onClick={() => onOpenSlot(openSlot === sl.field ? null : sl.field)}>
                Picture {sl.n}
              </button>
            ))}
          </div>
          {open && onSlotChange ? <SlotPanel index={index} slot={open} pictures={pictures} usedElsewhere={picturesUsedElsewhere ?? new Set()} onChange={onSlotChange} onClose={() => onOpenSlot(null)} /> : null}
        </div>
      ) : (
        isLibrary && (
          <div className="tn-field" data-testid="add-picture">
            {picturesState === 'none' && <p className="small muted">This slide has no picture. Add pictures in step 1, then come back here.</p>}
            {picturesState === 'used' && <p className="small muted">This slide has no picture, and every one of your pictures is already used on another slide.</p>}
            {picturesState === 'free' && onAddPicture && (
              <>
                <p className="small muted">This slide has no picture. This picks a picture layout that suits what the slide says and puts one of your unused pictures in it.</p>
                <div className="row-actions">
                  <button type="button" className="btn btn-dark btn-sm" disabled={addBusy} onClick={async () => { setAddBusy(true); setAddMsg(''); setAddMsg(await onAddPicture()); setAddBusy(false); }}>{addBusy ? 'Working…' : 'Add a picture to this slide'}</button>
                </div>
                {addMsg && <span className="small" role="status">{addMsg}</span>}
              </>
            )}
          </div>
        )
      )}
      {unusedBox}
      {onImageText && (devTools || !isLibrary) && (
        <label className="tn-field">
          <span className="field-label">Put a picture here</span>
          <input className="cr-input cr-wide" value={imgText} placeholder="put a sunrise as the background here" aria-label={`Picture for slide ${index + 1}`} onChange={(e) => setImgText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setImgMsg(onImageText(imgText)); setImgText(''); } }} />
          {imgMsg && <span className="small" role="status">{imgMsg}</span>}
        </label>
      )}
      {(devTools || !isLibrary) && <TagEditor index={index} tags={script.element_tags ?? []} apply={apply} />}
      <PhotoControls index={index} slide={slide} script={script} choice={photo} object={object} pictures={pictures} palette={palette} hasPhotoStyle={hasPhotoStyle} apply={apply} addFiles={addFiles} />
    </>
  );
  const fine = (
    <>
      <h4 className="h4" data-testid="fine-scope">Applies to all slides</h4>
      {fineTuneBox}
      {oldTools && (
        <div className="cr-oldtools" data-testid="old-tools">
          <h4 className="h4">{isLibrary ? 'Developer tools for this slide' : 'More tools for this slide'}</h4>
          <div className="cr-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setProblem(onShuffle() ? '' : 'No other pictures fit this slide.')}>Shuffle elements</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => run(apply(patches.regenerate(index)))}>Regenerate from the plan</button>
            {faithfulOf(slide) && <button type="button" className="btn btn-outline btn-sm" onClick={() => run(apply(patches.makeEditable(index)))} title="This slide is drawn exactly as the pack's design was written. Making it editable turns it into layers; fine details may change.">Make editable</button>}
            <ReplayButton plan={slide.plan} label={`Slide ${index + 1}`} />
            <WhyPopover slide={slide} lint={view?.rendered?.lint} repairs={view?.rendered?.repairs} />
          </div>
          {faithfulOf(slide) && devTools && <p className="small muted" data-testid="faithful-note">Drawn as the pack's design was written. Checks that cannot run on it: {view?.rendered?.warnings?.length ? 'contrast over art, graphics crossing text, picture overlap' : 'see Make editable'}.</p>}
          {onRedesign && (
            <div className="tn-field" data-testid={`redesign-${index}`}>
              <span className="field-label">Redesign this slide: 1 Sonnet call, about 30 seconds (runs only when you press the button)</span>
              <input className="cr-input cr-wide" value={rdWords} disabled={rdBusy} placeholder="optional: bolder, with a clock icon" aria-label={`Words for redesigning slide ${index + 1}`} onChange={(e) => setRdWords(e.target.value)} />
              <button type="button" className="btn btn-outline btn-sm" disabled={rdBusy} onClick={async () => { setRdBusy(true); setRdMsg(''); setRdMsg(await onRedesign(rdWords)); setRdBusy(false); }}>
                {rdBusy ? 'Redesigning…' : 'Redesign this slide'}
              </button>
              {rdMsg && <span className="small" role="status">{rdMsg}</span>}
            </div>
          )}
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
        </div>
      )}
    </>
  );
  const panels: Record<EditTab, React.ReactNode> = { layout, text, pictures: picturesTab, fine };

  return (
    <li className="card cr-card cr-card-tabs" aria-label={title} data-status={view?.status ?? 'drawing'}>
      <div className="cr-card-head">
        <h3 className="h4 cr-title">
          <span className="chip">{index + 1}</span> {TYPE_LABEL[script.type]}
        </h3>
        <LintBadges lint={view?.rendered?.lint} />
        {slide.notes
          .filter((n) => n.startsWith("Highlight '") || n.startsWith('This slide fell back'))
          .map((n) => (
            <p key={n} className="small cr-warn" role="status">
              <span aria-hidden="true">⚠ </span>
              {n}
            </p>
          ))}
        {tooManyWords && onSplit && (
          <div className="cr-split" data-testid="split-box">
            <button type="button" className="btn btn-dark btn-sm" disabled={splitBusy} data-testid="split-slide" onClick={async () => { setSplitBusy(true); setSplitMsg(''); setSplitMsg(await onSplit()); setSplitBusy(false); }}>{splitBusy ? 'Splitting…' : 'Split into two slides'}</button>
            <span className="small muted"> Cuts this slide in two at a sentence end. Every word is kept, in order.</span>
          </div>
        )}
        {splitMsg && <p className="small" role="status" data-testid="split-msg">{splitMsg}</p>}
        {ownNote && <p className={`small ${ownNote.kind === 'warn' ? 'cr-warn' : 'muted'}`} role="status" data-testid="own-note">{ownNote.kind === 'warn' && <span aria-hidden="true">⚠ </span>}{ownNote.text}</p>}
        {view?.error && <p className="small cr-problem" role="alert">{view.error}</p>}
      </div>
      <div className="cr-tabs" role="tablist" aria-label={`Edit slide ${index + 1}`}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`cr-tab-${t.id}`} className="cr-tab" aria-selected={tab === t.id} aria-controls="cr-tabpanel" tabIndex={tab === t.id ? 0 : -1} data-testid={`tab-${t.id}`} onClick={() => onTab(t.id)}
            onKeyDown={(e) => {
              const at = TABS.findIndex((x) => x.id === tab);
              if (e.key === 'ArrowRight') onTab(TABS[(at + 1) % TABS.length].id);
              if (e.key === 'ArrowLeft') onTab(TABS[(at + TABS.length - 1) % TABS.length].id);
            }}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="cr-edit cr-tabpanel" role="tabpanel" id="cr-tabpanel" aria-labelledby={`cr-tab-${tab}`}>
        {panels[tab]}
        {problem && <p className="small cr-problem" role="alert">{problem}</p>}
      </div>
      <div className="cr-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={onDownload} disabled={!view?.rendered} aria-label={`Download PNG of ${deckLabel} slide ${index + 1}`}>
          <Icon name="upload" size={14} /> Download PNG
        </button>
      </div>
    </li>
  );
}
