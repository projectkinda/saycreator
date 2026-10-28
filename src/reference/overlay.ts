// The reference with its detected boxes drawn on and numbered, as the picture the reader is sent (it labels boxes, so it must see them).
import { bitmapFromUrl, dataUrlOf } from './images';
import type { ReaderImage } from './reader';
import type { Detected } from './regions';
import { speed } from './speed';

/** A JPEG of the reference at the reader size, with every detected box outlined and numbered the way the labels prompt numbers them. */
export async function overlayImage(url: string, d: Detected, n: number, name: string): Promise<ReaderImage> {
  const bm = await bitmapFromUrl(url);
  const k = Math.min(1, speed.itemPx / Math.max(bm.width, bm.height));
  const c = new OffscreenCanvas(Math.round(bm.width * k), Math.round(bm.height * k));
  const g = c.getContext('2d')!;
  g.drawImage(bm, 0, 0, c.width, c.height);
  bm.close();
  const draw = (b: { x: number; y: number; w: number; h: number }, col: string, label: string) => {
    const x = (b.x / 100) * c.width;
    const y = (b.y / 100) * c.height;
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.strokeRect(x, y, (b.w / 100) * c.width, (b.h / 100) * c.height);
    g.font = 'bold 18px sans-serif';
    const w = g.measureText(label).width + 8;
    g.fillStyle = col;
    g.fillRect(x, Math.max(0, y - 22), w, 22);
    g.fillStyle = '#ffffff';
    g.fillText(label, x + 4, Math.max(16, y - 5));
  };
  d.texts.forEach((t, i) => draw(t.box, '#d62828', `r${n}T${i + 1}`));
  d.photos.forEach((p, i) => draw(p.box, '#2a9d34', `r${n}P${i + 1}`));
  d.shapes.forEach((s, i) => draw(s.box, '#1d4ed8', `r${n}S${i + 1}`));
  d.graphics.forEach((gr, i) => draw(gr.box, '#c026d3', `r${n}G${i + 1}`));
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  const url2 = await dataUrlOf(blob);
  return { name, mime: 'image/jpeg', base64: url2.split(',')[1] };
}
