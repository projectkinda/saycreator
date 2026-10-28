// "Why this slide": which style and layout were used and why, which checks passed or failed, and what the safety net changed.
import { useState } from 'react';
import type { CarouselLintResult } from '../image-engine/carousel/lint';
import type { StyledSlide } from '../image-engine/styles/compose';

export function WhyPopover({ slide, lint, repairs }: { slide: StyledSlide; lint?: CarouselLintResult[]; repairs?: string[] }) {
  const [open, setOpen] = useState(false);
  const failed = (lint ?? []).filter((l) => !l.pass);
  const passed = (lint ?? []).filter((l) => l.pass);
  return (
    <span className="why">
      <button type="button" className="btn btn-outline btn-sm" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>Why this slide</button>
      {open && (
        <div className="why-pop card" role="dialog" aria-label={`Why slide ${slide.id}`}>
          <p className="small"><b>Style:</b> {slide.style}. <b>Layout:</b> {slide.layout} (rule {slide.rule + 1} of the style’s rules for this kind of slide). <b>Palette:</b> {slide.palette}.</p>
          <p className="small"><b>Why this layout:</b> {slide.because}.</p>
          <p className="small"><b>Checks:</b> {lint ? `${passed.length} passed${failed.length ? `, ${failed.length} failed` : ''}.` : 'not run yet.'}</p>
          {lint && (
            <ul className="small why-list">
              {lint.map((l) => (
                <li key={l.id}>{l.pass ? (l.warn ? '△' : '✓') : '✗'} {l.label}: {l.reason}</li>
              ))}
            </ul>
          )}
          <p className="small"><b>What the safety net changed:</b> {repairs && repairs.length ? '' : 'nothing.'}</p>
          {repairs && repairs.length > 0 && <ul className="small why-list">{repairs.map((r) => <li key={r}>{r}</li>)}</ul>}
          {slide.notes.length > 0 && (
            <>
              <p className="small"><b>Notes from drawing it:</b></p>
              <ul className="small why-list">{slide.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </>
          )}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </span>
  );
}
