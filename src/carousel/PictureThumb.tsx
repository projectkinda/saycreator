// Round 18: the thumbnail of a project picture (Content step and the Slides-step picker): at least 96 x 120 px, the picture's own shape (never squashed or cropped to a square), its number in a corner,
// its name as a tooltip, and a larger preview (about 280 px wide, with its name) while the pointer rests on it or a finger holds it.
import { useRef, useState, type ReactNode } from 'react';
import { urlOf, type PictureMeta } from './photoLibrary';

/** What a picture is called to the person: "Picture 3: style step" (or "Picture 3" without a name). */
export const pictureCaption = (p: { label?: string }, number: number): string => (p.label?.trim() ? `Picture ${number}: ${p.label.trim()}` : `Picture ${number}`);

/** The size of the thumbnail box: 120 px tall, as wide as the picture's shape asks (96 to 190 px); on a phone the box is half the row (CSS). */
const boxWidth = (p: { width: number; height: number }) => Math.round(Math.min(190, Math.max(96, (120 * p.width) / p.height)));

export function PictureThumb({ meta, number, badge, children }: { meta: PictureMeta; number: number; badge?: string; children?: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const hold = useRef<number | undefined>(undefined);
  const [pre, setPre] = useState<{ left: number; top: number } | null>(null);
  const url = urlOf(meta.id);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 296));
    // above the thumbnail when there is room (a tall preview is at most 380 px), otherwise below it
    const top = r.top > 400 ? Math.max(8, r.top - 8 - 380) : Math.min(r.bottom + 8, Math.max(8, window.innerHeight - 388));
    setPre({ left, top });
  };
  const hide = () => { window.clearTimeout(hold.current); setPre(null); };
  const caption = pictureCaption(meta, number);
  return (
    <span
      ref={ref}
      className="cr-thumb"
      style={{ ['--tw' as string]: `${boxWidth(meta)}px` }}
      title={caption}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onPointerDown={(e) => { if (e.pointerType === 'touch') { window.clearTimeout(hold.current); hold.current = window.setTimeout(show, 450); } }}
      onPointerUp={() => window.clearTimeout(hold.current)}
      onPointerCancel={hide}
    >
      <span className="cr-thumb-box" data-testid="thumb-box">
        {url ? <img src={url} alt="" draggable={false} /> : <span className="small">Not in storage</span>}
        <span className="cr-thumb-num" data-testid="thumb-num" aria-hidden="true">{number}</span>
      </span>
      {badge && <span className="cr-thumb-badge small" data-testid="thumb-badge">{badge}</span>}
      {children}
      {pre && url && (
        <span className="cr-thumb-pre" data-testid="thumb-preview" role="img" aria-label={caption} style={{ left: pre.left, top: pre.top }}>
          <img src={url} alt="" draggable={false} />
          <span className="small">{caption}</span>
        </span>
      )}
    </span>
  );
}
