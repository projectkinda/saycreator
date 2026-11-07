// The detected style devices as toggles: Highlight marker, Underline, Profile header, a switch for each generic device of a preset (reference/deco.ts), Shapes (Off / Subtle / Bold). A change draws the deck again from its stored plan (no model
// call) and is stored with the style (not in the read cache), so reading the same pictures again keeps it.
import { useActiveReference } from '../reference/active';
import type { StyleOverrides, StylePack } from '../reference/pack';
import { applyOverrides, styleFromPack } from './designLibrary';
import { DECO_LABELS, decoOn, type DecoSwitch } from '../reference/deco';

export function DetectedStyleBox({ onChange, hasDeck, pack: given }: { onChange: (ov: StyleOverrides | null) => void; hasDeck: boolean; /** A built-in preset's pack: it wins over the active reference (the style chosen last is the one in use). */ pack?: StylePack | null }) {
  const { active } = useActiveReference();
  const pack = given ?? active?.pack;
  if (!pack) return null;
  const detected = styleFromPack({ ...pack, overrides: undefined }).style;
  const ov: StyleOverrides = pack.overrides ?? {};
  const now = applyOverrides(detected, ov).style;
  const shapes: 'off' | 'subtle' | 'bold' = !now.devices.planes ? 'off' : now.planeStrength === 'subtle' ? 'subtle' : 'bold';
  const set = (patch: Partial<StyleOverrides>) => onChange({ ...ov, ...patch });
  const yn = (b: boolean) => (b ? 'yes' : 'no');
  const toggle = (label: string, key: 'marker' | 'underline' | 'profileHeader', value: boolean, was: boolean) => (
    <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="checkbox" aria-label={label} checked={value} onChange={(e) => set({ [key]: e.target.checked })} />
      <span>{label}</span>
      <span className="muted">(detected: {yn(was)}{ov[key] !== undefined && ov[key] !== was ? ', changed by you' : ''})</span>
    </label>
  );
  return (
    <section className="card ws-card" role="group" aria-label="Detected style" data-testid="detected-style" style={{ marginTop: 12 }}>
      <h3 className="h4">Detected style</h3>
      <p className="small muted">{hasDeck ? 'Flip any of these and the slides are drawn again from the same plan: no model call.' : 'These apply the next time you make a carousel.'}</p>
      {toggle('Highlight marker', 'marker', now.devices.marker, detected.devices.marker)}
      {toggle('Underline', 'underline', now.devices.underline, detected.devices.underline)}
      {toggle('Profile header', 'profileHeader', now.devices.profileHeader, detected.devices.profileHeader)}
      {decoOn(detected.deco).map((k: DecoSwitch) => (
        <label key={k} className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }} data-testid={'deco-' + k}>
          <input type="checkbox" aria-label={DECO_LABELS[k]} checked={ov.deco?.[k] !== false} onChange={(e) => set({ deco: { ...ov.deco, [k]: e.target.checked } })} />
          <span>{DECO_LABELS[k]}</span>
          <span className="muted">(this style: yes{ov.deco?.[k] === false ? ', switched off by you' : ''})</span>
        </label>
      ))}
      <div role="radiogroup" aria-label="Shapes" className="chip-group" style={{ marginTop: 6 }}>
        <span className="small">Shapes</span>
        {(['off', 'subtle', 'bold'] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={shapes === s} aria-label={'Shapes: ' + s} className="chip-btn" aria-pressed={shapes === s} onClick={() => set({ shapes: s })}>{s[0].toUpperCase() + s.slice(1)}</button>
        ))}
        <span className="small muted">(detected: {detected.devices.planes ? 'bold' : 'off'})</span>
      </div>
      {Object.keys(ov).length > 0 && <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={() => onChange(null)}>Reset to detected</button>}
    </section>
  );
}
