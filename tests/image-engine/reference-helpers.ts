// Shared by the style-from-references app specs: pictures drawn in the page to use as references, a fake reader (a stand-in for the server's
// reader routes: it answers with the text a test gives it and records what it was sent), and the saved templates read back.
import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
export const REF_OUT = path.join(ROOT, 'out/image-engine/reference-app');

export interface RefFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A reference picture drawn in the page: one slide, or a collage of slides with gutters. */
export async function makeReference(page: Page, o: { name: string; kind: 'slide' | 'collage' | 'stripes'; cols?: number; rows?: number; cell?: [number, number]; gap?: [number, number]; margin?: number; gutter?: string; bg?: string; ink?: string }): Promise<RefFile> {
  const b64 = await page.evaluate((o) => {
    const COLOURS = ['#f4efe6', '#101010', '#d9381e', '#e8e04a', '#2b5a8a', '#7a3cff', '#f2f2f2', '#1d6b4f', '#f0b27a', '#303030', '#aac8e8', '#fafafa'];
    const slide = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, ink: string, k: number) => {
      g.fillStyle = bg;
      g.fillRect(x, y, w, h);
      g.fillStyle = ink;
      g.font = `800 ${Math.round(h * 0.11)}px sans-serif`;
      g.textBaseline = 'top';
      g.fillText('BIG IDEA', x + w * 0.08, y + h * (0.2 + (k % 3) * 0.06), w * 0.8);
      g.font = `500 ${Math.round(h * 0.035)}px sans-serif`;
      g.fillText('One short line that explains it', x + w * 0.08, y + h * 0.45, w * 0.8);
      g.fillStyle = COLOURS[(k + 3) % COLOURS.length];
      g.fillRect(x + w * 0.55, y + h * 0.7, w * 0.3, h * 0.15);
    };
    let W: number;
    let H: number;
    const [cw, ch] = o.cell ?? [540, 675];
    const cols = o.cols ?? 1;
    const rows = o.rows ?? 1;
    const [gx, gy] = o.gap ?? [0, 0];
    const m = o.margin ?? 0;
    if (o.kind === 'collage') {
      W = m * 2 + cols * cw + (cols - 1) * gx;
      H = m * 2 + rows * ch + (rows - 1) * gy;
    } else {
      W = cw;
      H = ch;
    }
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = o.kind === 'collage' ? o.gutter ?? '#ffffff' : o.bg ?? '#101010';
    g.fillRect(0, 0, W, H);
    if (o.kind === 'collage') {
      for (let r = 0; r < rows; r++)
        for (let q = 0; q < cols; q++) {
          const k = r * cols + q;
          slide(g, m + q * (cw + gx), m + r * (ch + gy), cw, ch, COLOURS[k % COLOURS.length], k % 2 ? '#ffffff' : '#101010', k);
        }
    } else {
      slide(g, 0, 0, W, H, o.bg ?? '#101010', o.ink ?? '#f5efe4', 1);
      if (o.kind === 'stripes') {
        // Two plain vertical stripes that look like gutters, on one slide.
        g.fillStyle = '#ffffff';
        g.fillRect(Math.round(W / 3), 0, 6, H);
        g.fillRect(Math.round((2 * W) / 3), 0, 6, H);
      }
    }
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, o);
  return { name: o.name, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

const pal = (bg: string, text: string, accent: string, onAccent = '#ffffff') => ({ bg, text, muted: '#555555', accent, onAccent, marker: accent, onMarker: '#000000', surface: '#eeeeee', onSurface: '#111111', line: '#111111' });

/** A valid answer to "Read references": a few sections of a style, what was seen, and what could not be drawn. */
export function readAnswer(o: { accent?: string; layouts?: boolean; photo?: boolean; thumbnail?: boolean; seen?: string[]; extra?: Record<string, unknown>; photoImages?: string[]; missing?: { tool: string; why: string; images?: string[] }[] } = {}) {
  const style: Record<string, unknown> = {
    palettes: { ink: pal('#101010', '#f5f5f5', o.accent ?? '#ff4b1f'), paper: pal('#f4efe6', '#101010', '#c42a08') },
    rhythm: ['ink', 'paper'],
    fonts: { headline: 'Instrument Sans', headlineWeight: 700, body: 'Instrument Sans', bodyWeight: 500, strong: 600 },
    type: { cover: 150, headline: 108, body: 44, small: 34, stat: 340, quote: 84, label: 32 },
    caseStyle: 'upper',
    shape: { radius: 0, outline: 4, stroke: 8, hardShadow: 0, badge: 'square', marker: 'box', sticker: 'tag', decor: 'blocks' },
    spacing: { margin: 72, gap: 24, section: 48 },
    chrome: 'strip',
    description: 'Heavy caps on dark and paper with one hot red-orange, read from your references.',
  };
  if (o.layouts !== false) style.layouts = { cover: [{ use: 'cover-top', when: { headlineWordsMax: 7 } }, { use: 'cover-stack' }] };
  if (o.photo) style.photo = { treatments: { mono: [{ op: 'grayscale' }, { op: 'levels', contrast: 0.25 }] } };
  if (o.thumbnail) style.thumbnail = { palette: 'ink', title: { look: 'plain', colour: 'text' }, layouts: ['title-over-photo', 'face-left-title-right', 'split-colour'], block: 'accent', scrim: '$bg' };
  Object.assign(style, o.extra ?? {});
  return JSON.stringify({ style, seen_slide_types: o.seen ?? ['cover'], ...(o.photoImages ? { images_with_photos: o.photoImages } : {}), missing_tools: o.missing ?? [{ tool: '3D renders', why: 'The reference has a glossy 3D object; we can only draw flat shapes and pictures from the library.', images: ['ref1.jpg'] }, { tool: 'Fonts we do not bundle', why: 'The reference uses a condensed grotesque; we only have two families.' }], notes: 'Heavy caps, one hot accent, flat shapes.' });
}

/** A valid labels answer (the default read): the first text box is the title, the rest body text, and graphics are called asterisks. The ids are read from the prompt. */
export function labelsAnswer(prompt: string, o: { seen?: string[]; photoImages?: string[] } = {}) {
  const text = [...new Set(prompt.match(/r\d+T\d+/g) ?? [])];
  const graphics = [...new Set(prompt.match(/r\d+G\d+/g) ?? [])];
  return JSON.stringify({ roles: Object.fromEntries(text.map((id, i) => [id, i === 0 ? 'title' : i === 1 ? 'subtitle' : 'body'])), graphics: Object.fromEntries(graphics.map((id) => [id, 'asterisk'])), emphasis: {}, seen_slide_types: o.seen ?? ['cover'], images_with_photos: o.photoImages ?? [], missing: [{ tool: 'Device mockups', why: 'The reference shows a phone.' }], notes: 'Plain slide with a big title.' });
}

/** A valid answer to a refinement round. */
export function refineAnswer(o: { patches?: { path: string; value: unknown }[]; score?: number; stop?: boolean } = {}) {
  return JSON.stringify({ patches: o.patches ?? [], judgement: { score: o.score ?? 60, matched: ['dark ground', 'heavy caps'], approximated: ['accent colour'], missing: ['the 3D object'] }, stop: o.stop ?? false });
}

export interface FakeReader {
  reads: { prompt: string; images: { name: string }[] }[];
  refines: { prompt: string; images: { name: string }[] }[];
}

/**
 * Stands in for the server's reader: the status route says it is there, the read route answers with what the test says.
 * `reply` gets the kind of call ("read", "retry" when it carries a previous answer, or "refine") and the nth call of that kind.
 */
export async function fakeReader(page: Page, reply: (kind: 'read' | 'retry' | 'refine', n: number, prompt: string) => string | { status: number; body: unknown }, opts: { delayMs?: number } = {}): Promise<FakeReader> {
  const rec: FakeReader = { reads: [], refines: [] };
  const counts = { read: 0, retry: 0, refine: 0 };
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/__reference/read', async (r) => {
    const body = JSON.parse(r.request().postData() ?? '{}') as { prompt: string; images: { name: string }[] };
    const refine = body.prompt.includes('REFERENCE on the left') || body.prompt.includes('The person looked at the replica');
    const retry = body.prompt.includes('Your previous answer was');
    const kind = refine ? 'refine' : retry ? 'retry' : 'read';
    (refine ? rec.refines : rec.reads).push({ prompt: body.prompt, images: body.images.map((i) => ({ name: i.name })) });
    const out = reply(kind, counts[kind]++, body.prompt);
    if (opts.delayMs) await new Promise((res) => setTimeout(res, opts.delayMs));
    if (typeof out === 'string') await r.fulfill({ json: { text: out, ms: 5 } });
    else await r.fulfill({ status: out.status, json: out.body });
  });
  return rec;
}

export const openStyleFromReferences = async (page: Page) => {
  await page.goto('/images/styles/new');
  await expect(page.getByRole('heading', { name: 'New style from references', level: 1 })).toBeVisible();
};
export const refInput = (page: Page) => page.getByLabel('Choose reference images', { exact: true });

/** Waits until the loop has finished (no phase text) and the closeness panel is on the screen. */
export async function loopDone(page: Page) {
  await expect(page.getByRole('heading', { name: '5. How close it got' })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByRole('button', { name: 'Read references' })).toBeEnabled({ timeout: 180_000 });
}

/** The templates in this browser's storage, read straight from IndexedDB. */
export const storedTemplates = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ id: string; name: string; target: string; spec: Record<string, unknown>; preview: string; singleImage?: boolean }[]>((resolve) => {
        const open = indexedDB.open('creator-style-templates', 1);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('templates')) return resolve([]);
          const q = db.transaction('templates').objectStore('templates').getAll();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => resolve([]);
        };
        open.onerror = () => resolve([]);
      }),
  );

export const saveShot = async (page: Page, name: string, full = true) => {
  fs.mkdirSync(REF_OUT, { recursive: true });
  await page.screenshot({ path: path.join(REF_OUT, name), fullPage: full });
};
