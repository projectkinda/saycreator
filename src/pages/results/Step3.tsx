// Step 3: carousels. The same slides, checker results and verdict boxes as before, now inside the shared section.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pic, Section, VerdictBox, useResults, type RecordBase } from './common';

interface CarouselSlide {
  script: string;
  scriptTitle?: string;
  theme: string;
  index: number;
  type: string;
  notes?: string[];
  lint: { id: string; label: string; pass: boolean; reason: string }[];
  variant?: string;
  pngUrl: string;
}

export default function Step3({ lastRun, refreshKey, onRefreshed }: { lastRun: number; refreshKey: number; onRefreshed: () => void }) {
  const { records, setRecord } = useResults();
  const [slides, setSlides] = useState<CarouselSlide[] | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    setBusy(true);
    fetch('/__lab/carousels').then((r) => r.json()).then(setSlides).catch(() => setSlides([])).finally(() => { setBusy(false); onRefreshed(); });
  }, [onRefreshed]);
  useEffect(refresh, [refresh, refreshKey]);

  const badSlides = useMemo(() => (slides ?? []).filter((s) => s.theme === 'bad'), [slides]);
  const carouselGroups = useMemo(() => {
    const m = new Map<string, Map<string, CarouselSlide[]>>();
    for (const s of (slides ?? []).filter((x) => x.theme !== 'bad')) {
      const t = m.get(s.script) ?? new Map<string, CarouselSlide[]>();
      t.set(s.theme, [...(t.get(s.theme) ?? []), s].sort((a, b) => a.index - b.index));
      m.set(s.script, t);
    }
    return [...m.entries()].map(([k, t]) => [k, [...t.entries()]] as const);
  }, [slides]);

  return (
    <Section id="step3" title="Step 3: Carousels" lastRun={lastRun} onRefresh={refresh} busy={busy} intro="Each script is drawn in three themes from the same words. The checker's PASS or FAIL is on every slide; give your own verdict under it. The last group is broken on purpose, one check each.">
      {slides === null && <p role="status">Loading…</p>}
      {slides?.length === 0 && <p className="lab-err">No Step 3 outputs found. Run <code>npm run test:image</code> first.</p>}
      {carouselGroups.map(([script, themes]) => (
        <div key={script} className="lab-thumb-group">
          <h3>{themes[0][1][0].scriptTitle ?? script}</h3>
          {themes.map(([theme, list]) => (
            <div key={theme} className="lab-car-row">
              <h4>{theme[0].toUpperCase() + theme.slice(1)}{list.every((s) => s.lint.every((x) => x.pass)) ? ' · all 7 pass' : ' · ' + list.filter((s) => s.lint.some((x) => !x.pass)).length + ' slide(s) fail'}</h4>
              <div className="lab-slides">
                {list.map((s) => {
                  const failed = s.lint.filter((x) => !x.pass);
                  const key = 'carousel|' + script + '|' + theme + '|' + s.index;
                  const base: RecordBase = { key, step: 'step3', kind: 'carousel', image: s.scriptTitle ?? script, option: theme + ' slide ' + s.index + ' (' + s.type + ')', checker: { pass: failed.length === 0, failed: failed.map((f) => ({ id: f.id, reason: f.reason })) } };
                  const rec = records[key];
                  const disagree = rec?.verdict && ((failed.length === 0 && rec.verdict === 'bad') || (failed.length > 0 && rec.verdict === 'good'));
                  return (
                    <div key={key} className={'lab-slide' + (disagree ? ' disagree' : '')}>
                      <Pic src={s.pngUrl} alt={theme + ' slide ' + s.index + ', ' + s.type + ', of ' + (s.scriptTitle ?? script)} />
                      <p><b>{s.index}. {s.type}</b> <span className={failed.length ? 'chk-fail' : 'chk-pass'}>{failed.length ? 'FAIL (' + failed.length + ')' : 'PASS'}</span></p>
                      {failed.length > 0 && <ul className="lab-fails">{failed.map((f) => <li key={f.id}>{f.reason}</li>)}</ul>}
                      <VerdictBox label={theme + ' slide ' + s.index + ' of ' + (s.scriptTitle ?? script)} rec={rec} onChange={(vv, r) => setRecord(base, vv, r)} />
                      {disagree && <p className="lab-disagree">You and the checker disagree here.</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
      {badSlides.length > 0 && (
        <div className="lab-thumb-group">
          <h3>Broken on purpose (one check each)</h3>
          <div className="lab-slides">
            {badSlides.map((s) => {
              const failed = s.lint.filter((x) => !x.pass);
              return (
                <div key={s.variant} className="lab-slide">
                  <Pic src={s.pngUrl} alt={'Broken on purpose: ' + s.variant} />
                  <p><b>{s.variant}</b> <span className="chk-fail">FAIL ({failed.length})</span></p>
                  <ul className="lab-fails">{failed.map((f) => <li key={f.id}>{f.reason}</li>)}</ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}
