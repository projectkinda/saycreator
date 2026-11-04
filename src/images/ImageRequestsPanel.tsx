// The pictures of a carousel or quote post: the list of image requests (what each slide's image slot should show), a thumbnail for each, Generate / Regenerate / Upload instead /
// Remove, Generate all with its count and estimate, a cap per carousel and a counter. Nothing is made unless the person clicks, and a made picture is cached, never remade silently.
// For a quote post whose pack has no square design it also offers "Make a square quote design" (one model call, estimate first).
import { useEffect, useMemo, useRef, useState } from 'react';
import { patches, type Doc } from '../carousel/doc';
import type { Apply } from '../carousel/parts';
import { packFor, parsePack, slotsFor, type StylePack } from '../reference/pack';
import { recreateFor } from '../reference/recreate';
import { detectReaders } from '../reference/reader';
import { callPack } from '../reference/pack';
import { templateOfStyle, updateTemplatePack } from '../reference/templates';
import { acceptNotice, getImageProvider, noticeAccepted } from './provider';
import { TREATMENT_IDS } from './slots';
import { callsUsed, ensureBaked, IMAGE_CAP, loadOriginal, planImageRequests, removeOriginal, saveOriginal, SECONDS_PER_IMAGE, useImagesVersion, type ImageRequest } from './store';

const SQUARE_SECONDS = 18;
export function buildSquarePrompt(pack: StylePack): string {
  const pal = Object.entries(pack.palette).map(([k, v]) => `${k} ${v}`).join(', ');
  return [
    '[pack:square] You design ONE square (1:1) quote post for a style pack, as a single SVG. Reply with the <svg> only (no code fence, no explanation).',
    `Use viewBox="0 0 1080 1080", data-type="quote" and data-format="square". Colours only as palette names (fill="$bg", "$text", "$accent" ...); the palette is: ${pal}. Fonts: headline ${pack.fonts.headline}, body ${pack.fonts.body}.`,
    'Text slots: <text> with data-role (title = the quote, caption = who said it), data-min-size (32 or more) and data-max-lines, holding sample words; the code wraps and fits the real words into them. Composed for a SQUARE, not a 4:5 slide scaled down.',
    'An image slot is allowed (a background or an inset portrait): <rect data-image-slot="background|inset|half-bleed|cutout" data-mask="rect|rounded|circle|arch|blob" data-fit="cover" data-scrim="0.4" x y width height/>. Never an <image> or any picture data. The first element is the full-size background <rect>.',
    'Allowed elements: svg, g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath, mask, pattern, text, tspan.',
  ].join('\n');
}

export function ImageRequestsPanel({ doc, apply }: { doc: Doc; apply: Apply }) {
  useImagesVersion();
  const pack = packFor(doc.style);
  // A recreated slide has image slots too (its photo regions), the same on every slide.
  const rec = pack ? null : recreateFor(doc.style);
  const palette = pack?.palette ?? rec?.palette;
  const square = doc.format === 'quote';
  const list = useMemo(() => doc.imageRequests ?? [], [doc.imageRequests]);
  const latest = useRef(list);
  latest.current = list;
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [accepted, setAccepted] = useState(noticeAccepted());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<{ available: boolean; reason?: string } | null>(null);
  const slotsOfSlide = (i: number) => (pack && doc.script?.slides[i] ? slotsFor(pack, doc.script.slides[i].type, square) : rec && doc.script?.slides[i] ? (rec.slots ?? []) : []);
  useEffect(() => {
    void getImageProvider().available().then(setProvider);
  }, []);
  // Bake the pictures to their slots (and again after a treatment or focal change) so the slides can draw them.
  useEffect(() => {
    if (palette && list.length) void ensureBaked(list, slotsOfSlide, palette);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, pack, rec, doc.format]);
  // Thumbnails of the originals.
  useEffect(() => {
    let live = true;
    const made: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      for (const r of list)
        if (r.source) {
          const b = await loadOriginal(r.id);
          if (b) made.push((next[r.id] = URL.createObjectURL(b)));
        }
      if (live) setThumbs(next);
    })();
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [list]);

  const set = (next: ImageRequest[], label?: string) => {
    latest.current = next;
    apply(patches.setImageRequests(next, label));
  };
  const update = (id: string, p: Partial<ImageRequest>, label?: string) => set(latest.current.map((r) => (r.id === id ? { ...r, ...p } : r)), label);

  if (!pack && !rec?.slots?.length) return <p className="small muted" data-testid="images-note">Image slots need a style pack or a recreated look with photo regions. Rebuild a style as a pack (Styles) or make one from a reference or a description.</p>;
  const slotCount = doc.script ? doc.script.slides.reduce((n, _s, i) => n + slotsOfSlide(i).length, 0) : 0;
  const used = callsUsed(list);
  const open = list.filter((r) => !r.source);
  const noSquare = !!pack && square && !pack.square;

  const generate = async (r: ImageRequest) => {
    if (callsUsed(latest.current) >= IMAGE_CAP) return setMsg(`The limit of ${IMAGE_CAP} generated pictures for this ${square ? 'post' : 'carousel'} is reached. Upload a picture instead.`);
    setBusy(r.id);
    try {
      const slot = slotsOfSlide(r.slide).find((s) => s.kind === r.kind);
      const blob = await getImageProvider().generate(r.prompt, { w: slot?.w ?? 1024, h: slot?.h ?? 1024 });
      await saveOriginal(r.id, blob);
      const cur = latest.current.find((x) => x.id === r.id);
      update(r.id, { source: 'generated', generations: (cur?.generations ?? 0) + 1 }, `Generate a picture for slide ${r.slide + 1}`);
      setMsg('');
    } catch (e) {
      setMsg(`The picture could not be made: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };
  const generateAll = async () => {
    for (const r of latest.current.filter((x) => !x.source)) {
      if (callsUsed(latest.current) >= IMAGE_CAP) break;
      await generate(r);
    }
  };
  const upload = async (r: ImageRequest, f: File | undefined) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) return setMsg('That file is not a picture.');
    await saveOriginal(r.id, f);
    update(r.id, { source: 'uploaded' }, `Use your own picture on slide ${r.slide + 1}`);
  };
  const remove = async (r: ImageRequest) => {
    await removeOriginal(r.id);
    set(latest.current.filter((x) => x.id !== r.id), `Remove the picture request on slide ${r.slide + 1}`);
  };
  const suggest = () => {
    if (!doc.script || !palette) return;
    const plan = planImageRequests(doc.script as never, (type) => (pack ? slotsFor(pack, type, square) : (rec?.slots ?? [])), palette);
    if (plan.length === 0) return setMsg('None of this style’s slide designs has an image slot.');
    set([...latest.current.filter((r) => r.source), ...plan], 'Suggest pictures');
    setMsg(`${plan.length} picture request${plan.length === 1 ? '' : 's'} made. Nothing is generated until you click Generate.`);
  };
  const makeSquare = async () => {
    const tpl = templateOfStyle(doc.style);
    if (!tpl?.pack) return setMsg('Save the pack as a template first, then make its square quote design.');
    setBusy('square');
    try {
      if (!pack) throw new Error('This look is not a pack.');
      const reader = (await detectReaders())[0];
      if (!reader) throw new Error('No model is set up to draw it.');
      const text = await callPack(reader, buildSquarePrompt(pack), [], new AbortController().signal);
      const first = Object.entries(pack.palette).length ? ` data-palette='${JSON.stringify(pack.palette)}'` : '';
      const r = await parsePack(text.replace('<svg', `<svg${first}`), pack.name);
      if (!r.ok || !r.pack.square) throw new Error(r.ok ? 'The answer had no square quote design.' : r.reasons.join(' '));
      await updateTemplatePack(tpl.id, { ...tpl.pack, square: r.pack.square });
      setMsg('The square quote design is added to the pack.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="rf-pack" aria-label="Pictures for the image slots" data-testid="image-requests">
      <h4 className="h4">Pictures for the image slots</h4>
      {noSquare && (
        <div role="status" data-testid="square-missing">
          <p className="small cr-warn">This pack has no square quote design, so the quote post is the 4:5 design scaled to fit. </p>
          <button type="button" className="btn btn-outline btn-sm" disabled={!!busy} onClick={() => void makeSquare()}>Make a square quote design</button>
          <span className="small muted"> Estimate: 1 model call, about {SQUARE_SECONDS} s.</span>
        </div>
      )}
      {!accepted && (
        <div className="small" role="note" data-testid="image-notice">
          <p>When you generate a picture, the prompt text shown below is sent to the picture provider. Your script, your photos and your name are not. Prompts are short mood and colour words.</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { acceptNotice(); setAccepted(true); }}>OK, I understand</button>
        </div>
      )}
      {provider && !provider.available && <p className="small muted" role="status">{provider.reason ?? 'Picture generation is off. You can still upload your own pictures.'}</p>}
      <p className="small muted" role="status" aria-label="Picture counter">{slotCount} image slot{slotCount === 1 ? '' : 's'} in this {square ? 'post' : 'carousel'}. Generated {used} of {IMAGE_CAP} allowed.</p>
      <div className="row-actions">
        <button type="button" className="btn btn-outline btn-sm" disabled={!doc.script || slotCount === 0} onClick={suggest}>Suggest pictures</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={!accepted || open.length === 0 || !!busy || used >= IMAGE_CAP || provider?.available === false} onClick={() => void generateAll()}>
          Generate all ({Math.min(open.length, Math.max(0, IMAGE_CAP - used))} image{Math.min(open.length, Math.max(0, IMAGE_CAP - used)) === 1 ? '' : 's'}, about {Math.min(open.length, Math.max(0, IMAGE_CAP - used)) * SECONDS_PER_IMAGE} s)
        </button>
      </div>
      {msg && <p className="small" role="status" aria-live="polite" data-testid="images-status">{msg}</p>}
      <ul className="cr-film" aria-label="Image requests">
        {list.map((r) => (
          <li key={r.id} aria-label={`Image for slide ${r.slide + 1}`} data-testid="image-request">
            <div
              className="cr-thumb"
              role="img"
              aria-label={r.alt}
              style={{ width: 96, height: 96, background: thumbs[r.id] ? `url(${thumbs[r.id]}) ${(r.focal?.x ?? 0.5) * 100}% ${(r.focal?.y ?? 0.5) * 100}% / cover` : 'var(--surface, #eee)', cursor: r.source ? 'crosshair' : 'default' }}
              onPointerDown={(e) => {
                if (!r.source) return;
                const box = e.currentTarget.getBoundingClientRect();
                update(r.id, { focal: { x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) } }, `Move the focus of the picture on slide ${r.slide + 1}`);
              }}
            />
            <span className="small">Slide {r.slide + 1} · {r.kind}</span>
            <label className="tn-field"><span className="field-label">Prompt</span><input className="input" value={r.prompt} maxLength={300} onChange={(e) => update(r.id, { prompt: e.target.value })} aria-label={`Prompt for slide ${r.slide + 1}`} /></label>
            <label className="tn-field"><span className="field-label">Alt text</span><input className="input" value={r.alt} maxLength={200} onChange={(e) => update(r.id, { alt: e.target.value })} aria-label={`Alt text for slide ${r.slide + 1}`} /></label>
            <div className="row-actions" role="group" aria-label="Treatments">
              {TREATMENT_IDS.map((t) => (
                <button key={t.id} type="button" className="chip-btn" aria-pressed={!!r.treatments?.includes(t.id)} onClick={() => update(r.id, { treatments: r.treatments?.includes(t.id) ? r.treatments.filter((x) => x !== t.id) : [...(r.treatments ?? []), t.id] })}>{t.label}</button>
              ))}
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-outline btn-sm" disabled={!accepted || !!busy || provider?.available === false || used >= IMAGE_CAP} onClick={() => void generate(r)}>{busy === r.id ? 'Working…' : r.source === 'generated' ? 'Regenerate' : 'Generate'}</button>
              <label className="btn btn-outline btn-sm">
                Upload instead
                <input type="file" accept="image/*" hidden aria-label={`Upload a picture for slide ${r.slide + 1}`} onChange={(e) => void upload(r, e.target.files?.[0])} />
              </label>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void remove(r)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
