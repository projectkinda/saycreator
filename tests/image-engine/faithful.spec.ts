// Step 17b: the faithful view, text that can grow, text kept clear of a block's edge, lines made with tspans, dashed lines, and the reference sent as it is. No model (fake writer).
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fakeReader, makeReference, refineAnswer, ROOT } from './reference-helpers';

test.setTimeout(180_000);
const EXAMPLE = fs.readFileSync(path.join(ROOT, 'docs', 'recreate-example.svg'), 'utf8');

const SVG = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#F5F0EB"/>${inner}</svg>`;

test('text grows into a big block up to its data-max-size, stays clear of the block edge, and never goes under the floor or above the box', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (svgs) => {
    const R = await import('/src/reference/recreate.ts');
    const out: Record<string, unknown> = {};
    for (const [k, svg] of Object.entries(svgs)) {
      const a = await R.answerToLayers(svg, { w: 1080, h: 1350, ownRoles: [] });
      if (!a.ok) {
        out[k] = { ok: false, reasons: a.reasons };
        continue;
      }
      const filled = R.fillRecreate({ layers: a.result.layers, palette: a.result.palette, canvas: { w: 1080, h: 1350 }, notes: [] }, { body: 'People finish what they have already started. Make the first move tiny and the rest follows.', title: 'to feel automatic' });
      const t = filled.layers.find((l) => l.kind === 'text' && (l as { name: string }).name === 'body') as { x: number; y: number; width: number; height: number; style: { size: number } } | undefined;
      const title = filled.layers.find((l) => l.kind === 'text' && (l as { name: string }).name === 'title') as { x: number; y: number; width: number; height: number } | undefined;
      out[k] = { ok: true, body: t && { size: t.style.size, right: t.x + t.width, bottom: t.y + t.height, x: t.x }, title, notes: filled.notes };
    }
    return out;
  }, {
    // a small sample body (24 px) in a big block: it may grow, to the slot's data-max-size
    grow: SVG('<rect x="100" y="400" width="800" height="600" rx="24" fill="#EADFC6"/><text data-role="body" data-max-size="60" x="130" y="450" font-size="24" font-family="Instrument Sans" fill="#222">A small sample body</text>'),
    // no data-max-size: the role default (body 56) is the ceiling
    dflt: SVG('<rect x="100" y="400" width="800" height="600" rx="24" fill="#EADFC6"/><text data-role="body" x="130" y="450" font-size="24" font-family="Instrument Sans" fill="#222">A small sample body</text>'),
    // a label at the edge of a circle: kept inside it, 4% of the slide from the edge
    stat: SVG('<circle cx="540" cy="600" r="360" fill="#EADFC6"/><text data-role="title" x="330" y="945" font-size="48" font-family="Instrument Sans" fill="#222">of people skim</text><text data-role="body" x="400" y="600" font-size="30" font-family="Instrument Sans" fill="#222">note</text>'),
  });
  const g = r.grow as { ok: boolean; body: { size: number; right: number; bottom: number } };
  expect(g.ok).toBe(true);
  expect(g.body.size, 'grown from the sample size').toBeGreaterThan(24);
  expect(g.body.size, 'never above data-max-size').toBeLessThanOrEqual(60);
  expect(g.body.right, 'inside the block with padding').toBeLessThanOrEqual(900 - 1080 * 0.04 + 1);
  expect(g.body.bottom).toBeLessThanOrEqual(1000 - 1080 * 0.04 + 1);
  expect((r.grow as { notes: string[] }).notes.join(' ')).toMatch(/made bigger/);
  const d = r.dflt as { body: { size: number } };
  expect(d.body.size).toBeLessThanOrEqual(56);
  expect(d.body.size).toBeGreaterThanOrEqual(32);
  const st = r.stat as { title: { x: number; y: number; width: number; height: number } };
  // The circle's inscribed rectangle, less the padding: the label is inside it.
  const inner = { x: 540 - 360 * 0.7071 + 1080 * 0.02, y: 600 - 360 * 0.7071 + 1080 * 0.02, r: 540 + 360 * 0.7071 - 1080 * 0.02, b: 600 + 360 * 0.7071 - 1080 * 0.02 };
  expect(st.title.x).toBeGreaterThanOrEqual(inner.x - 1);
  expect(st.title.x + st.title.width).toBeLessThanOrEqual(inner.r + 1);
  expect(st.title.y + st.title.height).toBeLessThanOrEqual(inner.b + 1);
});

test('a text made with tspans keeps its lines, a dashed line becomes dashes, and a stretched text is said', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (svg) => {
    const R = await import('/src/reference/recreate.ts');
    const a = await R.answerToLayers(svg, { w: 1080, h: 1350, ownRoles: [] });
    if (!a.ok) return { ok: false };
    const text = a.result.layers.find((l) => l.kind === 'text') as { text: string };
    const dashed = a.result.layers.find((l) => l.kind === 'path') as { d: string };
    return { ok: true, text: text.text, dashes: (dashed.d.match(/M/g) ?? []).length, notes: a.result.notes };
  }, SVG('<text data-role="title" x="80" y="300" font-size="70" font-family="Instrument Serif" fill="#222"><tspan x="80" y="300">Name what</tspan><tspan x="80" y="380">you want</tspan></text><path d="M80 600 C300 580 500 620 1000 590" stroke="#C4623F" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="2 22"/><text data-role="caption" x="80" y="900" font-size="40" textLength="600" lengthAdjust="spacingAndGlyphs" font-family="Space Mono" fill="#222">stretched</text>'));
  expect(r.ok).toBe(true);
  expect(r.text, 'two lines, not one glued word').toBe('Name what\nyou want');
  expect(r.dashes, 'a dotted line is many short strokes').toBeGreaterThan(20);
  expect(r.notes!.join(' ')).toMatch(/stretched to a set length/);
});

test('the faithful view: the picture as written is the main preview until Make editable; the words go into the slots by the same fit; the reference is sent as the file is', async ({ page }) => {
  const rec = await fakeReader(page, (kind: string) => (kind === 'refine' ? refineAnswer() : EXAMPLE));
  await page.goto('/images/carousel');
  const f = await page.evaluate(async (svg) => {
    const R = await import('/src/reference/recreate.ts');
    const F = await import('/src/reference/faithful.ts');
    const a = await R.answerToLayers(svg, { w: 1080, h: 1350, ownRoles: [] });
    if (!a.ok) return { ok: false };
    const filled = R.fillRecreate({ layers: a.result.layers, palette: a.result.palette, canvas: { w: 1080, h: 1350 }, notes: [] }, { title: 'My own long headline for this slide', kicker: '@me', tag: '', body: 'one', caption: '', number: '' });
    const s = R.sanitizeSvg(svg);
    const out = F.faithfulSvg(s.svg!, 1080, filled.slots, filled.hidden);
    const png = await F.svgToPng(out, 540);
    return { ok: true, hasOwn: out.includes('My own long headline') || out.includes('My own long') , gone: !out.includes('Focus Block Example'), tagGone: !out.includes('STEP 3'), noScript: !/script|onload|href/.test(out), png: png.size, type: png.type };
  }, EXAMPLE);
  expect(f.ok).toBe(true);
  expect(f.hasOwn).toBe(true);
  expect(f.gone, 'the sample words are replaced').toBe(true);
  expect(f.tagGone, 'a tag with no words is removed').toBe(true);
  expect(f.noScript).toBe(true);
  expect(f.png).toBeGreaterThan(2000);
  expect(f.type).toBe('image/png');
  await page.getByText('Match a reference', { exact: true }).click();
  const file = await makeReference(page, { name: 'slide.jpg', kind: 'slide' });
  await page.getByLabel('Choose a picture to recreate').setInputFiles(file);
  await page.getByRole('button', { name: 'Recreate', exact: true }).click();
  await expect(page.getByTestId('recreate-status')).toContainText('compared and corrected once', { timeout: 120_000 });
  const view = page.getByRole('img', { name: 'The recreated slide' });
  await expect(view).toHaveAttribute('src', /^data:image\/png/);
  await page.getByRole('button', { name: 'Make editable' }).click();
  await expect(page.getByTestId('recreate-status')).toContainText('Now drawn from editable layers');
  await expect(page.getByRole('button', { name: 'Make editable' })).toHaveCount(0);
});

test('a reference not bigger than 1400 px is sent as the file is, and a bigger one is brought down to 1400', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const P = await import('/src/reference/RecreatePanel.tsx');
    const make = async (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = '#336699';
      g.fillRect(0, 0, w, h);
      const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.9));
      return new File([blob], 'ref.jpg', { type: 'image/jpeg' });
    };
    const b64 = async (f: File) => btoa(String.fromCharCode(...new Uint8Array(await f.arrayBuffer())));
    const small = await make(900, 1100);
    const sent = await P.referenceAt1400(small);
    const big = await make(2400, 3000);
    const sentBig = await P.referenceAt1400(big);
    const img = new Image();
    img.src = sentBig.url;
    await img.decode();
    return { same: sent.url.split(',')[1] === (await b64(small)), bigSide: Math.max(img.naturalWidth, img.naturalHeight) };
  });
  expect(r.same, 'the file as it is, not drawn again').toBe(true);
  expect(r.bigSide).toBe(1400);
});
