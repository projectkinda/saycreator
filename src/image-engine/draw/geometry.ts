// Pure geometry helpers. No DOM, no Fabric.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The part of the source image to keep so that it fills the box with no distortion.
 * `focal` (0 to 1 on each axis) says where the crop should sit when the image is bigger than needed.
 */
export function coverCrop(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
  focal: { x: number; y: number } = { x: 0.5, y: 0.5 },
): { sx: number; sy: number; sw: number; sh: number } {
  const boxRatio = boxW / boxH;
  const srcRatio = srcW / srcH;
  let sw = srcW;
  let sh = srcH;
  if (srcRatio > boxRatio) sw = srcH * boxRatio;
  else sh = srcW / boxRatio;
  const sx = Math.min(Math.max(focal.x * srcW - sw / 2, 0), srcW - sw);
  const sy = Math.min(Math.max(focal.y * srcH - sh / 2, 0), srcH - sh);
  return { sx, sy, sw, sh };
}

/** The largest copy of the source that fits inside the box, centred. */
export function containFit(srcW: number, srcH: number, boxW: number, boxH: number): Rect {
  const s = Math.min(boxW / srcW, boxH / srcH);
  const width = srcW * s;
  const height = srcH * s;
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height };
}

/** A corner radius that cannot be bigger than half the shorter side. */
export function clampRadius(radius: number | undefined, w: number, h: number): number {
  return Math.max(0, Math.min(radius ?? 0, Math.min(w, h) / 2));
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Box for a logo: scaled to `height` (keeping its shape), `margin` px in from the chosen corner.
 */
export function placeLogo(
  canvas: { width: number; height: number },
  logo: { width: number; height: number },
  corner: Corner,
  margin: number,
  height: number,
): Rect {
  const width = (logo.width / logo.height) * height;
  const x = corner.endsWith('left') ? margin : canvas.width - margin - width;
  const y = corner.startsWith('top') ? margin : canvas.height - margin - height;
  return { x, y, width, height };
}
