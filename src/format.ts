import type { CSSProperties } from 'react';
import type { Gradient, Project } from './engine';

export const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

export const grad = (g: Gradient, angle = 160): CSSProperties => ({
  background: `linear-gradient(${angle}deg, ${g.from}, ${g.to})`,
});

export const isLandscape = (p: Project) => !!p.resolution && p.resolution.width > p.resolution.height;
