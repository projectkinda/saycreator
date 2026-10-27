// Step 2: thumbnails and checks. Per source picture: the original and every option at phone size, with the checker's answer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { checkThumbnails, type BrandInput } from '../../image-engine';
import { CheckLine, Pic, Section, VerdictBox, testImageUrl, useResults, type RecordBase } from './common';

interface Thumb {
  image: string;
  aspect: string;
  layout: string;
  title: string;
  pngUrl: string;
  phoneUrl: string;
  notes: string[];
  lint: { id: string; label: string; pass: boolean; reason: string }[];
}
export interface Upload {
  name: string;
  url: string;
  bytes: number;
}
interface LiveOption {
  layout: string;
  pngUrl: string;
  phoneUrl: string;
  lint: Thumb['lint'];
}

const BRAND: BrandInput = { primary: '#0F7B78', text: '#1A2226', background: '#F3F5F6', highlight: '#E8A33D', headlineFont: 'Schibsted Grotesk', bodyFont: 'Instrument Sans', handle: '@mayarao' };

function Option({ img, layout, aspect, pngUrl, phoneUrl, lint, notes, step }: { img: string; layout: string; aspect: string; pngUrl: string; phoneUrl: string; lint: Thumb['lint']; notes?: string[]; step: string }) {
  const { records, setRecord } = useResults();
  const failed = lint.filter((l) => !l.pass);
  const key = `${step}|${img}|${aspect}|${layout}`;
  const base: RecordBase = { key, step, kind: 'thumbnail', image: img, option: `${aspect} ${layout}`, checker: { pass: failed.length === 0, failed: failed.map((f) => ({ id: f.id, reason: f.reason })) } };
  const rec = records[key];
  const disagree = rec?.verdict && ((failed.length === 0 && rec.verdict === 'bad') || (failed.length > 0 && rec.verdict === 'good'));
  return (
    <div className={`lab-thumb res-opt${disagree ? ' disagree' : ''}`}>
      <Pic src={phoneUrl} full={pngUrl} alt={`${layout} option for ${img} at phone size`} />
      <p><b>{layout}</b></p>
      <CheckLine failed={failed} />
      {notes && notes.length > 0 && <p className="small muted">{notes.join(' ')}</p>}
      <VerdictBox label={`${layout} for ${img}`} k={base.key} rec={rec} onChange={(v, r) => setRecord(base, v, r)} />
      {disagree && <p className="lab-disagree">You and the checker disagree here.</p>}
    </div>
  );
}

export default function Step2({ lastRun, refreshKey, onRefreshed, uploads }: { lastRun: number; refreshKey: number; onRefreshed: () => void; uploads: Upload[] }) {
  const [thumbs, setThumbs] = useState<Thumb[] | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    setBusy(true);
    fetch('/__lab/thumbnails').then((r) => r.json()).then(setThumbs).catch(() => setThumbs([])).finally(() => { setBusy(false); onRefreshed(); });
  }, [onRefreshed]);
  useEffect(refresh, [refresh, refreshKey]);

  const groups = useMemo(() => {
    const m = new Map<string, Map<string, Thumb[]>>();
    for (const t of thumbs ?? []) {
      const a = m.get(t.image) ?? new Map<string, Thumb[]>();
      a.set(t.aspect, [...(a.get(t.aspect) ?? []), t]);
      m.set(t.image, a);
    }
    return [...m.entries()];
  }, [thumbs]);

  // Your own pictures, checked live in this browser.
  const [pick, setPick] = useState('');
  const [title, setTitle] = useState('Make It Count');
  const [aspect, setAspect] = useState<'16:9' | '9:16'>('16:9');
  const [live, setLive] = useState<Record<string, { aspect: string; title: string; options: LiveOption[] } | { error: string } | 'running'>>({});
  const chosen = uploads.find((u) => u.name === pick) ?? uploads[0];
  const runLive = async () => {
    if (!chosen) return;
    setLive((l) => ({ ...l, [chosen.name]: 'running' }));
    try {
      const out = await checkThumbnails({ source: { url: chosen.url, width: 0, height: 0 }, title, aspect, brand: BRAND });
      setLive((l) => ({
        ...l,
        [chosen.name]: { aspect, title, options: out.map((o) => ({ layout: o.option.layout, pngUrl: URL.createObjectURL(o.png), phoneUrl: URL.createObjectURL(o.phonePng), lint: o.lint })) },
      }));
    } catch (e) {
      setLive((l) => ({ ...l, [chosen.name]: { error: e instanceof Error ? e.message : String(e) } }));
    }
  };
  const liveResult = chosen ? live[chosen.name] : undefined;

  return (
    <Section id="step2" title="Thumbnail options and their checks" lastRun={lastRun} onRefresh={refresh} busy={busy} intro="Each picture with every option at phone size (320 px wide). Click a picture for full size. The checker's PASS or FAIL and its reasons are under each one.">
      {thumbs === null && <p role="status">Loading…</p>}
      {thumbs?.length === 0 && <p className="lab-err">No Step 2 outputs found. Run <code>npm run test:image</code> first.</p>}
      {groups.map(([image, aspects]) => (
        <div key={image} className="res-source" aria-label={`Source picture ${image}`}>
          <h3 className="h3">{image}</h3>
          {[...aspects.entries()].map(([asp, list]) => (
            <div key={asp} className="res-aspect">
              <div className="res-orig">
                <Pic src={testImageUrl(image)} alt={`Original ${image}`} className="res-orig-pic" />
                <p className="small muted">Original<br />{asp}, title “{list[0].title}”</p>
              </div>
              <div className="lab-thumbs res-opts">
                {list.map((t) => (
                  <Option key={t.layout} img={image} layout={t.layout} aspect={asp} pngUrl={t.pngUrl} phoneUrl={t.phoneUrl} lint={t.lint} notes={t.notes} step="step2" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="res-source res-try" aria-label="Try your own picture">
        <h3 className="h3">Try your own picture</h3>
        {uploads.length === 0 ? (
          <p className="small muted">Add a picture with “Add pictures” at the top of this page, then make thumbnails from it here. Your pictures stay in this browser tab and are not saved.</p>
        ) : (
          <>
            <div className="lab-row">
              <label>Picture <select value={chosen?.name} onChange={(e) => setPick(e.target.value)}>{uploads.map((u) => <option key={u.name}>{u.name}</option>)}</select></label>
              <label>Title <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
              <label>Shape <select value={aspect} onChange={(e) => setAspect(e.target.value as typeof aspect)}><option>16:9</option><option>9:16</option></select></label>
              <button type="button" className="btn btn-dark btn-sm" onClick={runLive} disabled={liveResult === 'running' || !title.trim()}>Make thumbnails</button>
            </div>
            {liveResult === 'running' && <p role="status">Drawing and checking…</p>}
            {liveResult && typeof liveResult === 'object' && 'error' in liveResult && <p className="lab-err" role="alert">{liveResult.error}</p>}
            {chosen && liveResult && typeof liveResult === 'object' && 'options' in liveResult && (
              <div className="res-aspect">
                <div className="res-orig">
                  <Pic src={chosen.url} alt={`Original ${chosen.name}`} className="res-orig-pic" />
                  <p className="small muted">Original<br />{liveResult.aspect}, title “{liveResult.title}”</p>
                </div>
                <div className="lab-thumbs res-opts">
                  {liveResult.options.map((o) => (
                    <Option key={o.layout} img={chosen.name} layout={o.layout} aspect={liveResult.aspect} pngUrl={o.pngUrl} phoneUrl={o.phoneUrl} lint={o.lint} step="step2-upload" />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
