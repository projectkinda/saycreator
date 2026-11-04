// An ImageProvider makes a picture from a prompt, like the writer and the cutout provider: an interface, a fake for tests (a deterministic placeholder, no network),
// and a server one that goes through the dev route /__image (the key and model name live only in the server environment; the route is off without them).
export interface ImageProvider {
  id: string;
  label: string;
  available(): Promise<{ available: boolean; reason?: string }>;
  /** A picture for the prompt at about this size. Only the prompt text leaves the page. */
  generate(prompt: string, size: { w: number; h: number }, signal?: AbortSignal): Promise<Blob>;
}
export class ImageError extends Error {}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
/** The same prompt and size always give the same picture: a gradient and two soft shapes. */
export const fakeImageProvider: ImageProvider = {
  id: 'fake',
  label: 'Placeholder pictures (test)',
  available: async () => ({ available: true }),
  async generate(prompt, size) {
    const h = hash(prompt);
    const w = Math.max(64, Math.min(1024, Math.round(size.w)));
    const ht = Math.max(64, Math.min(1024, Math.round(size.h)));
    const c = new OffscreenCanvas(w, ht);
    const g = c.getContext('2d')!;
    const hue = h % 360;
    const grad = g.createLinearGradient(0, 0, w, ht);
    grad.addColorStop(0, `hsl(${hue} 55% 38%)`);
    grad.addColorStop(1, `hsl(${(hue + 50) % 360} 60% 62%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, ht);
    g.fillStyle = `hsla(${(hue + 180) % 360} 60% 70% / 0.55)`;
    g.beginPath();
    g.arc(w * (0.25 + ((h >> 3) % 50) / 100), ht * (0.3 + ((h >> 9) % 40) / 100), Math.min(w, ht) * 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `hsla(${(hue + 90) % 360} 50% 25% / 0.5)`;
    g.fillRect(0, ht * 0.7, w, ht * 0.3);
    return c.convertToBlob({ type: 'image/png' });
  },
};

export const serverImageProvider: ImageProvider = {
  id: 'server',
  label: 'Picture service (set up on the server)',
  async available() {
    try {
      const r = await fetch('/__image/status');
      if (!r.ok) return { available: false, reason: 'The picture route is not running.' };
      return (await r.json()) as { available: boolean; reason?: string };
    } catch {
      return { available: false, reason: 'The picture route is not reachable.' };
    }
  },
  async generate(prompt, size, signal) {
    const r = await fetch('/__image/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, w: size.w, h: size.h }), signal });
    if (!r.ok) throw new ImageError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `The picture service answered ${r.status}.`);
    return r.blob();
  },
};

let current: ImageProvider = serverImageProvider;
export const getImageProvider = () => current;
/** Tests swap in the fake one. */
export const setImageProvider = (p: ImageProvider) => {
  current = p;
};

const NOTICE = 'creator.imagePromptNotice';
/** The first use of a provider shows a notice that the prompt text is sent to it; this says whether it was accepted. */
export const noticeAccepted = () => {
  try {
    return localStorage.getItem(NOTICE) === '1';
  } catch {
    return false;
  }
};
export const acceptNotice = () => {
  try {
    localStorage.setItem(NOTICE, '1');
  } catch {
    /* not remembered */
  }
};
