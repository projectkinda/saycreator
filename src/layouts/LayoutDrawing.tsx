// A layout drawn as labelled boxes at its true aspect ratio: the coloured background, photo regions, flat shapes, and text slots with their role,
// size and the number of lines (as bars the height of the type). No picture, no words: only the layout.
import type { FreeBox, FreeShape } from '../image-engine/styles/free-spec';
import type { GalleryLayout } from './types';

const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function LayoutDrawing({ layout, label }: { layout: GalleryLayout; label?: string }) {
  const { free, w, h } = layout;
  const VW = 1000;
  const VH = Math.round((1000 * h) / w);
  const X = (v: number) => (v / 100) * VW;
  const Y = (v: number) => (v / 100) * VH;
  const bg = free.background.colours[0] ?? '#EEEEEE';
  const ink = lum(bg) > 0.5 ? '#111111' : '#FFFFFF';
  const box = (b: FreeBox) => ({ x: X(b.x), y: Y(b.y), width: X(b.w), height: Y(b.h) });
  const shape = (s: FreeShape) => {
    const b = box(s.box);
    const common = { fill: s.kind === 'ring' ? 'none' : s.colour, stroke: s.kind === 'ring' ? s.colour : 'none', strokeWidth: s.kind === 'ring' ? Math.max(4, b.width * 0.06) : 0, transform: s.angle ? `rotate(${s.angle} ${b.x + b.width / 2} ${b.y + b.height / 2})` : undefined };
    if (s.kind === 'circle' || s.kind === 'ring') return <ellipse key={s.id} cx={b.x + b.width / 2} cy={b.y + b.height / 2} rx={b.width / 2} ry={b.height / 2} {...common} />;
    const r = s.kind === 'pill' ? Math.min(b.width, b.height) / 2 : s.kind === 'rounded' ? Math.min(b.width, b.height) * 0.15 : 0;
    return <rect key={s.id} {...b} rx={r} {...common} />;
  };
  return (
    <svg className="lg-drawing" viewBox={`0 0 ${VW} ${VH}`} style={{ aspectRatio: `${w} / ${h}` }} role="img" aria-label={label ?? `Layout, ${layout.ratio}, ${layout.textCount} text blocks, ${layout.photoCount} photos`}>
      <defs>
        <pattern id={`ph-${layout.id}`} width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="24" height="24" fill="#9AA4B2" />
          <rect width="12" height="24" fill="#AEB7C4" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={VW} height={VH} fill={bg} />
      {free.photos.map((p) => {
        const b = box(p.box);
        return (
          <g key={p.id}>
            {p.shape === 'circle' ? <ellipse cx={b.x + b.width / 2} cy={b.y + b.height / 2} rx={b.width / 2} ry={b.height / 2} fill={`url(#ph-${layout.id})`} stroke="#44546A" strokeWidth="3" /> : <rect {...b} rx={p.shape === 'rounded' ? Math.min(b.width, b.height) * 0.08 : 0} fill={`url(#ph-${layout.id})`} stroke="#44546A" strokeWidth="3" />}
            <text x={b.x + 14} y={b.y + 44} fontSize="40" fontWeight="700" fill="#1F2A3A">{p.shape === 'full-bleed' ? 'photo (whole canvas)' : 'photo'}</text>
          </g>
        );
      })}
      {free.shapes.map(shape)}
      {free.slots.map((s) => {
        const b = box(s.box);
        const lineH = Math.max(6, (s.sizePx / 1350) * VH);
        const lines = Math.min(s.maxLines, Math.max(1, Math.floor(b.height / (lineH * 1.15))));
        const col = s.colour ?? ink;
        const tilt = s.treatments.find((t) => t.kind === 'tilt')?.angle;
        const startY = b.y + (b.height - lines * lineH * 1.15) / 2;
        return (
          <g key={s.id} transform={tilt ? `rotate(${tilt} ${b.x + b.width / 2} ${b.y + b.height / 2})` : undefined}>
            <rect {...b} fill="none" stroke={ink} strokeOpacity="0.7" strokeWidth="2.5" strokeDasharray="10 7" />
            {Array.from({ length: lines }, (_, i) => {
              const bw = b.width * (i === lines - 1 && lines > 1 ? 0.6 : 0.96);
              const bx = s.align === 'centre' ? b.x + (b.width - bw) / 2 : s.align === 'right' ? b.x + b.width - bw : b.x;
              return <rect key={i} x={bx} y={startY + i * lineH * 1.15 + lineH * 0.1} width={bw} height={lineH * 0.8} rx={lineH * 0.15} fill={col} fillOpacity="0.85" stroke={ink} strokeOpacity="0.25" strokeWidth="1.5" />;
            })}
            <g>
              <rect x={b.x} y={Math.max(0, b.y - 44)} width={12 + 21 * (s.role.length + 5)} height="44" fill={ink} fillOpacity="0.85" />
              <text x={b.x + 6} y={Math.max(0, b.y - 44) + 33} fontSize="34" fontWeight="700" fill={lum(bg) > 0.5 ? '#FFFFFF' : '#111111'}>{s.role} {Math.round((s.sizePx / 1350) * 100)}%</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
