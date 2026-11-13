// Shared by the Photos-in-the-app specs: make pictures in the page (no private photos are used), open the editor with a script
// in a photo style, and read the saved project.
import { expect, type Page } from '@playwright/test';
import { enableDevTools, useOwnScript } from './ui';

export interface Pic {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A picture drawn in the page: a diagonal gradient with a mark at (mx, my) so a crop point can be checked. Returned as a file. */
export async function makePic(page: Page, o: { name: string; w: number; h: number; type?: 'image/jpeg' | 'image/png'; hue?: number; mark?: [number, number]; transparent?: boolean; busy?: boolean }): Promise<Pic> {
  const b64 = await page.evaluate(async ({ w, h, type, hue, mark, transparent, busy }) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    if (!transparent) {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `hsl(${hue}, 70%, 35%)`);
      grad.addColorStop(1, `hsl(${(hue + 80) % 360}, 80%, 70%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    } else {
      g.fillStyle = `hsl(${hue}, 80%, 55%)`;
      g.beginPath();
      g.arc(w / 2, h / 2, Math.min(w, h) * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    if (busy) {
      // Lots of small marks, so the file is as big as a real photo of that size would be.
      let seed = hue * 7 + w;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 6000; i++) {
        g.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 60%, ${20 + rnd() * 60}%, 0.55)`;
        const s = (0.004 + rnd() * 0.03) * Math.min(w, h);
        g.fillRect(rnd() * w, rnd() * h, s, s);
      }
    }
    if (mark) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(mark[0] * w, mark[1] * h, Math.min(w, h) * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    const blob: Blob = await new Promise((r) => c.toBlob((x) => r(x!), type, 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, { w: o.w, h: o.h, type: o.type ?? 'image/jpeg', hue: o.hue ?? 200, mark: o.mark ?? null, transparent: !!o.transparent, busy: !!o.busy });
  return { name: o.name, mimeType: o.type ?? 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

/** Puts an EXIF "Orientation = 6" (turn 90 degrees clockwise to view) into a JPEG, the way a phone held upright does. */
export function withExifOrientation6(jpeg: Buffer): Buffer {
  const payload = Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, 0, payload.length + 2]), payload]);
  return Buffer.concat([jpeg.subarray(0, 2), seg, jpeg.subarray(2)]);
}

export const openEditor = async (page: Page) => {
  await enableDevTools(page); // the older photo tools of a slide show with Developer tools on
  // the photo slots, hints and controls of a slide belong to the template route, which a built-in style uses only with this flag (as carousel-app does)
  await page.addInitScript(() => { try { localStorage.setItem('creator.templateRoute', '1'); } catch { /* storage blocked */ } });
  await page.goto('/images/carousel');
  await expect(page.getByRole('heading', { name: 'Make a carousel', exact: true })).toBeVisible();
};

/** A seven-slide script with a photo hint on slides 1, 3 and 5 (so those slides get a photo slot). */
export const photoScript = () => ({
  title: 'Photo test deck',
  brand: { handle: '@photo.test' },
  slides: [
    { type: 'cover', kicker: 'Test', headline: 'Photos that stay on your device', sub: 'A short line under it.', highlight: 'stay', element_tags: ['idea', 'time'], photo_hint: 'a city street at dusk' },
    { type: 'step', number: 1, headline: 'Add your own photo', body: 'Drop it on the slide.', element_tags: ['write', 'time'] },
    { type: 'content', headline: 'Treat it your way', body: 'Black and white, duotone or grain.', element_tags: ['idea', 'target'], photo_hint: 'one object on a plain table' },
    { type: 'checklist', headline: 'Before you post', items: ['Check the crop', 'Check the words', 'Download it'], element_tags: ['proof', 'target'] },
    { type: 'stat', kicker: 'On this device', value: '0', label: 'photos uploaded anywhere', note: 'They never leave the browser.', element_tags: ['growth', 'money'], photo_hint: 'a wide, calm landscape' },
    { type: 'quote', quote: 'Your photos are yours.', by: 'This page', element_tags: ['idea', 'write'] },
    { type: 'closing', headline: 'Make it yours', cta: 'Download the zip', element_tags: ['launch', 'love'] },
  ],
});

/** Opens the Advanced fold, pastes a script, uses it, and picks a style by its title. */
export async function useScriptInStyle(page: Page, script: unknown, styleTitle: string) {
  // Round C: the shared helper of ui.ts (the old "Advanced: write the script yourself" fold is gone)
  await useOwnScript(page, script, styleTitle, { goto: false });
  await allDrawn(page, 7);
}

/** Every slide has a thumbnail in the film strip (Round C: there is no card per slide any more: one slide is edited at a time, see showSlide). */
export const allDrawn = async (page: Page, count = 7) => {
  await expect(page.locator('.cr-film li')).toHaveCount(count, { timeout: 40_000 });
  await expect(page.locator('.cr-film img')).toHaveCount(count, { timeout: 60_000 });
};

/** Opens the Edit slides view on slide n (the card of that slide is then the only `.cr-card` on the page). */
export const showSlide = async (page: Page, n: number) => {
  const view = page.getByTestId('edit-view');
  if (!(await view.isVisible())) await page.getByTestId('edit-slides').click();
  await page.getByRole('button', { name: `Show slide ${n}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`^Edit slide ${n} of`) })).toBeVisible();
};

/** The card of the slide that is open in the Edit slides view (call showSlide first). */
export const card = (page: Page, _n: number) => page.locator('.cr-card');

/** The saved project (what a refresh will bring back). */
export const savedDoc = (page: Page) =>
  page.evaluate(() => {
    const t = localStorage.getItem('creator.carousel.project.v1');
    return t ? (JSON.parse(t).project.doc as { photos?: { id: string; name: string; width: number; height: number; kind: string }[]; choices: Record<string, { photo?: { id?: string | null; treatment?: string; focal?: { x: number; y: number }; frame?: string; shape?: string }; object?: { id: string; scale: number; fx: string } }> }) : null;
  });

/** Drops files on an element as if dragged from the desktop. */
export async function dropFiles(page: Page, selector: string, files: Pic[]) {
  const data = files.map((f) => ({ name: f.name, type: f.mimeType, b64: f.buffer.toString('base64') }));
  await page.evaluate(({ selector, data }) => {
    const dt = new DataTransfer();
    for (const f of data) {
      const bin = atob(f.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      dt.items.add(new File([bytes], f.name, { type: f.type }));
    }
    const el = document.querySelector(selector)!;
    el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, { selector, data });
}

type Doc = NonNullable<Awaited<ReturnType<typeof savedDoc>>>;
/** Waits until the saved project says so (a change has been made and written), then until every slide is drawn again. */
export async function whenSaved(page: Page, ok: (d: Doc) => boolean) {
  await expect.poll(async () => {
    const d = await savedDoc(page);
    try {
      return !!d && ok(d);
    } catch {
      return false;
    }
  }, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(150);
  await allDrawn(page, 7);
}

/** Drags one element onto another with the browser's own drag events (the same data travels from the start to the drop). */
export async function dragOnto(page: Page, from: string, to: string) {
  await page.evaluate(({ from, to }) => {
    const dt = new DataTransfer();
    const a = document.querySelector(from)!;
    const b = document.querySelector(to)!;
    a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    b.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    a.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  }, { from, to });
}
