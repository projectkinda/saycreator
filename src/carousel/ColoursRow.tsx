// Round H part C: the "Colours" row of the Style step: the style's own colours, the person's brands, one "Add brand" button (and "Edit brand" only while a brand is in use), and the ready-made colour combinations.
// Choosing one redraws the carousel (the caller does that: no model call). Words: Main colour, Second colour, Extra colour, Brand, Colours.
import { COLOUR_COMBINATIONS } from '../image-engine/styles/colourCombinations';
import type { SavedBrand } from './brandStore';
import { schemeOfBrand, schemeOfCombo, type ColourScheme } from './colourSchemes';

const Swatches = ({ colours }: { colours: string[] }) => (
  <span className="cr-swatches" aria-hidden="true">{colours.map((c, i) => <span key={i} className="cr-sw" style={{ background: c }} />)}</span>
);

export function ColoursRow({ scheme, brands, disabled, onChoose, onAdd, onEdit }: {
  /** The scheme in use (a brand's current colours already resolved); null: the style's own colours. */
  scheme: ColourScheme | null;
  brands: SavedBrand[];
  /** A style that is not a built-in one keeps its own colours. */
  disabled?: boolean;
  onChoose: (s: ColourScheme | null) => void;
  onAdd: (opener: HTMLElement) => void;
  onEdit: (b: SavedBrand, opener: HTMLElement) => void;
}) {
  const on = (kind: 'brand' | 'combo', id: string) => scheme?.kind === kind && scheme.id === id;
  const sel = scheme?.kind === 'brand' ? brands.find((b) => b.id === scheme.id) ?? null : null;
  return (
    <section className="cr-colours" aria-labelledby="cr-colours-h" data-testid="colours-row">
      <h3 id="cr-colours-h" className="h4">Colours</h3>
      {disabled && <p className="small muted">This style keeps its own colours. Pick one of the built-in styles to use a brand.</p>}
      <div role="radiogroup" aria-label="Brand" className="cr-brand-list">
        <button type="button" role="radio" aria-checked={!scheme} className="cr-opt" disabled={disabled} onClick={() => onChoose(null)} data-testid="brand-opt-own">
          <span>Style&rsquo;s own colours</span>
        </button>
        {scheme?.kind === 'brand' && !brands.some((b) => b.id === scheme.id) && (
          <button type="button" role="radio" aria-checked="true" className="cr-opt" disabled data-testid="brand-opt-removed">
            <Swatches colours={scheme.colours} />
            <span>{scheme.name || 'Your colours'} (removed brand)</span>
          </button>
        )}
        {brands.map((b) => (
          <button key={b.id} type="button" role="radio" aria-checked={on('brand', b.id)} className="cr-opt" disabled={disabled} onClick={() => onChoose(schemeOfBrand(b))} data-testid={`brand-opt-${b.id}`}>
            <Swatches colours={b.colours} />
            <span>{b.name}</span>
          </button>
        ))}
      </div>
      <div className="row-actions cr-colours-actions">
        <button type="button" className="btn btn-outline" disabled={disabled} onClick={(e) => onAdd(e.currentTarget)} data-testid="brand-add">Add brand</button>
        {sel && <button type="button" className="btn btn-outline" disabled={disabled} onClick={(e) => onEdit(sel, e.currentTarget)} data-testid="brand-edit">Edit brand</button>}
      </div>
      <h4 id="cr-combos-h" className="small cr-combos-h">Ready-made colours</h4>
      <div role="radiogroup" aria-labelledby="cr-combos-h" className="cr-brand-list cr-combos" data-testid="combo-list">
        {COLOUR_COMBINATIONS.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={on('combo', c.id)} className="cr-opt" disabled={disabled} onClick={() => { const s = schemeOfCombo(c.id); if (s) onChoose(s); }} data-testid={`combo-${c.id}`}>
            <Swatches colours={c.colours} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
