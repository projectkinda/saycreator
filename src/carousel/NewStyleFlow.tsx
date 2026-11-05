// "New style": the only place a drawing-model (Sonnet) call is made for a whole look. Two ways: from a reference picture (the existing reference panel)
// or from a description of the look (the Designed code: one call). The cost is shown first and the person confirms. The result is saved as a style,
// selected, and the page goes back to the normal flow. A style is never made by itself.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CarouselScript } from '../image-engine/carousel/types';
import { saveLook } from './DesignedCard';
import { runDesign } from './MakeIt';
import type { WriteProvider } from './writer';
import { textProblem, type WriteRequest } from './writerPrompt';
import type { Tone } from './doc';

/** What the one call is given when the text box has no usable text yet: only the look matters then. */
const SAMPLE = 'Three small habits make a profile easier to trust. Write a clear headline that says who you help. Pin one post that proves it. Keep your contact line up to date. Then ask people to follow for weekly posts.';
export const NEW_STYLE_COST = '1 Sonnet call, about 1 minute';
export const REFERENCE_COST = 'a few Sonnet calls (read, draw, one fix), about 2 minutes';

export function NewStyleFlow({ text, tone, slides, handle, provider, reference, onCreated, onClose }: {
  text: string;
  tone: Tone;
  slides: number;
  handle: string;
  provider: WriteProvider | null;
  reference: ReactNode;
  onCreated: (r: { name: string; title: string; script: CarouselScript | null }) => void;
  onClose: () => void;
}) {
  const [way, setWay] = useState<'description' | 'reference'>('description');
  const [desc, setDesc] = useState('');
  const [step, setStep] = useState<'idle' | 'confirm' | 'running'>('idle');
  const [msg, setMsg] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const root = useRef<HTMLElement>(null);
  // Opening the panel brings it into view, so it is clear where the new-style flow went.
  useEffect(() => { root.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, []);
  const own = !textProblem(text);
  const run = async () => {
    if (!provider) return setMsg('No writer is available on this server, so no style can be made.');
    setStep('running');
    setMsg('');
    ctl.current = new AbortController();
    const req: WriteRequest = { text: own ? text : SAMPLE, slides: own ? Math.min(10, Math.max(3, slides)) : 5, tone, format: 'carousel', styleChoice: 'auto', styles: [] };
    const r = await runDesign(req, { pack: null, brief: desc }, handle, provider, ctl.current.signal, () => undefined);
    ctl.current = null;
    if (!r.ok) {
      setStep('idle');
      return setMsg(r.state.message ?? 'The style could not be made.');
    }
    const title = desc.trim().split(/\s+/).slice(0, 4).join(' ') || 'New style';
    const saved = await saveLook(r.designed, r.result.script, title);
    if (!saved) {
      setStep('idle');
      return setMsg('The designer\'s slides could not be used, so no style was saved. Try describing the look a little differently.');
    }
    setStep('idle');
    setMsg(`Saved “${title}” as a style (${saved.designs} designs) and selected it.`);
    onCreated({ name: saved.name, title, script: own ? r.result.script : null });
  };
  return (
    <section ref={root} className="card ws-card ns-flow" aria-label="New style" data-testid="new-style">
      <div className="row-actions">
        <h2 className="h3">New style</h2>
        <button type="button" className="btn btn-outline btn-sm cr-quiet" onClick={onClose}>Close</button>
      </div>
      <div role="group" aria-label="How to make the style" className="chip-group">
        <button type="button" className="chip-btn" aria-pressed={way === 'description'} disabled={step === 'running'} onClick={() => setWay('description')}>From a description</button>
        <button type="button" className="chip-btn" aria-pressed={way === 'reference'} disabled={step === 'running'} onClick={() => setWay('reference')}>From a reference picture</button>
      </div>
      {way === 'description' ? (
        <div className="create-form">
          <label className="field">
            <span className="field-label">Describe the look</span>
            <input className="input" value={desc} maxLength={300} disabled={step === 'running'} placeholder="for example: warm paper, big serif headlines, hand-drawn arrows" onChange={(e) => { setDesc(e.target.value); setStep('idle'); }} />
          </label>
          <p className="small muted" data-testid="new-style-cost">Cost: {NEW_STYLE_COST}. {own ? 'Your text above is used as the sample.' : 'A short sample text is used, because your text box is empty.'}</p>
          {step === 'idle' && <button type="button" className="btn btn-dark" disabled={!desc.trim()} onClick={() => setStep('confirm')}>Make the style</button>}
          {step === 'confirm' && (
            <div className="notice notice-warn" role="alertdialog" aria-label="Confirm the drawing-model call">
              <strong>This makes one style with {NEW_STYLE_COST}. Go ahead?</strong>
              <div className="row-actions">
                <button type="button" className="btn btn-dark" onClick={() => void run()}>Confirm and make the style</button>
                <button type="button" className="btn btn-outline" onClick={() => setStep('idle')}>Cancel</button>
              </div>
            </div>
          )}
          {step === 'running' && <p className="small" role="status">Making the style… <button type="button" className="btn btn-outline btn-sm" onClick={() => ctl.current?.abort()}>Cancel</button></p>}
        </div>
      ) : (
        <div className="create-form">
          <p className="small muted" data-testid="new-style-cost">Cost: {REFERENCE_COST}. Nothing runs until you press the button in the panel below.</p>
          {reference}
        </div>
      )}
      {msg && <p className="small" role="status" data-testid="new-style-msg">{msg}</p>}
    </section>
  );
}
