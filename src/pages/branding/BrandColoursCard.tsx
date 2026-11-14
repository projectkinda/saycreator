// Round I: the brand's colours (main, second, extra) on the Branding page. They are saved with the brand (the one list in workspace.ts), so they survive a reload and are the same colours the Style step of the
// carousel maker uses. Each field saves as soon as it holds a colour (or is emptied).
import { useEffect, useState } from 'react';
import { normaliseHex, type BrandWorkspace } from './workspace';

const LABELS = ['Main colour', 'Second colour', 'Extra colour'];
const NOT_A_COLOUR = 'That is not a colour. Try something like #14213D.';

export function BrandColoursCard({ brand, update }: { brand: BrandWorkspace; update: (patch: Partial<BrandWorkspace>) => void }) {
  const stored = brand.colours ?? [];
  const [texts, setTexts] = useState<string[]>(['', '', '']);
  const [bad, setBad] = useState<boolean[]>([false, false, false]);
  useEffect(() => { setTexts([stored[0] ?? '', stored[1] ?? '', stored[2] ?? '']); setBad([false, false, false]); }, [brand.id, stored.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: string[]) => {
    const flags = next.map((t) => t.trim() !== '' && !normaliseHex(t));
    setBad(flags);
    if (flags.some(Boolean)) return;
    const hexes = next.map((t) => normaliseHex(t));
    // the main colour is the first; a second or extra colour without a main one is not kept
    const list = hexes[0] ? hexes.filter((h): h is string => !!h) : [];
    update({ colours: list.length ? list : undefined });
  };
  const set = (i: number, v: string, now = false) => {
    const next = texts.map((t, k) => (k === i ? v : t));
    setTexts(next);
    if (now) commit(next);
  };
  return (
    <section className="card ws-card" aria-labelledby="brand-colours-h" data-testid="brand-colours-card">
      <h2 id="brand-colours-h" className="h3">Brand colours</h2>
      <p className="small muted">The colours the carousel maker uses for {brand.name}. One to three: a main colour, and a second and an extra one if you like.</p>
      <ul className="color-edit">
        {LABELS.map((label, i) => (
          <li key={label}>
            <label className="field">
              <span>{label}{i === 0 ? '' : ' (optional)'}</span>
              <span className="color-pair">
                <input type="color" aria-label={`${label}: pick a colour`} value={normaliseHex(texts[i]) ?? '#000000'} onChange={(e) => set(i, e.target.value.toLowerCase(), true)} data-testid={`bc-swatch-${i}`} />
                <input className="input" type="text" spellCheck={false} autoComplete="off" placeholder="#14213D" value={texts[i]} aria-invalid={bad[i]} onChange={(e) => set(i, e.target.value)} onBlur={() => commit(texts)} data-testid={`bc-hex-${i}`} />
              </span>
            </label>
            {bad[i] && <p className="small" role="alert">{NOT_A_COLOUR}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
