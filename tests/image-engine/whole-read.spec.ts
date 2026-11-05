// Whole-slide "Read references" (mocked reader, no model): single slides are never split, a real mosaic still is, every slide gets its own read, a failed read is reported and
// not replaced, variants hold all of them while designs point at the first of each type, and the report fields are there.
import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

const svgOf = (type: string, x: number, accent = '#D62828') =>
  `<inventory>title, shapes</inventory><svg viewBox="0 0 1080 1350" data-type="${type}" data-palette='{"bg":"#FFFFFF","text":"#111111","accent":"${accent}","muted":"#888888"}'><rect x="0" y="0" width="1080" height="1350" fill="$bg"/><circle cx="900" cy="200" r="90" fill="$accent" data-cant-draw="3D blob"/><text data-role="title" data-min-size="48" data-max-lines="3" x="${x}" y="${300 + x}" font-family="Schibsted Grotesk" font-size="90" fill="$text">Title ${x}</text><text data-role="body" data-min-size="32" data-max-lines="4" x="${x}" y="900" font-family="Instrument Sans" font-size="40" fill="$text">Body words</text></svg>`;

test('single slides are one read each; a mosaic still splits; failures are reported; variants and report', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ s1 }) => {
    const S = await import('/src/reference/slides.ts');
    const W = await import('/src/reference/wholeRead.ts');
    // pictures made of pixels: a clean 4:5 slide (soft gradient, a block of text-like stripes) and a 2 x 2 mosaic of 4:5 slides separated by white gutters
    const mk = (w: number, h: number, f: (x: number, y: number) => number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y); const k = (y * w + x) * 4; data[k] = v; data[k + 1] = v; data[k + 2] = v; data[k + 3] = 255; }
      return { width: w, height: h, data };
    };
    const slide = mk(720, 900, (x, y) => (y > 300 && y < 420 && (x % 40 < 20) ? 20 : 235 - Math.round(y / 30)));
    const g = 24, cw = 400, ch = 500;
    const noise = (x: number, y: number) => ((x * 7 + y * 13 + ((x >> 3) ^ (y >> 3)) * 29) % 200);
    const mosaic = mk(2 * cw + g, 2 * ch + g, (x, y) => (x >= cw && x < cw + g) || (y >= ch && y < ch + g) ? 255 : noise(x, y));
    const at = (p: typeof slide) => () => ({ p, k: 1 });
    const slideSheet = S.findSheet(at(slide));
    const mosaicSheet = S.findSheet(at(mosaic));

    // mocked reader: nine slides, the 4th fails, the 6th is refused (no svg)
    const names = Array.from({ length: 9 }, (_, i) => `slide${i + 1}.jpg`);
    const types = ['cover', 'step', 'content', 'list', 'stat', 'quote', 'cta', 'step', 'content'];
    const calls: { role?: string; pin?: boolean; images: number }[] = [];
    let live = 0, peak = 0;
    const reader = {
      id: 'api' as const, label: 'mock',
      async read(call: { role?: string; pin?: boolean; prompt: string; images: { name: string }[] }) {
        calls.push({ role: call.role, pin: call.pin, images: call.images.length });
        live++; peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 15));
        live--;
        const n = Number(call.images[0].name.replace(/\D/g, ''));
        if (n === 4) throw new Error('The reader could not be reached.');
        if (n === 6) return { text: 'I cannot draw this.', ms: 1 };
        return { text: s1.replace('data-type="cover"', `data-type="${types[n - 1]}"`).replace(/Title 60/, `Title ${n}`).replace(/x="60"/g, `x="${40 + n * 20}"`), ms: 1 };
      },
    };
    const slides = names.map((name, i) => ({ name, image: { name: `ref${i + 1}.jpg`, mime: 'image/jpeg', base64: 'AA' } }));
    const out = await W.readWholeSlides({ reader, slides, signal: new AbortController().signal, detectedText: slides.map(() => [[0.05, 0.2, 0.8, 0.1]]) });
    const over = W.textOverlap([[0, 0, 0.5, 0.5]], [[0, 0, 50, 100]]);
    const many = await W.readWholeSlides({ reader, slides: Array.from({ length: 15 }, (_, i) => ({ name: `m${i}.jpg`, image: { name: `ref${i + 1}.jpg`, mime: 'image/jpeg', base64: 'AA' } })), signal: new AbortController().signal });
    return {
      slide: { shaped: slideSheet.shaped, sheet: slideSheet.sheet },
      mosaic: { sheet: mosaicSheet.sheet, cells: mosaicSheet.found?.g.cells.length ?? 0 },
      calls: calls.length, allDraw: calls.every((c) => c.role === 'draw' && c.pin === true && c.images === 1), peak,
      report: out.report, over,
      pack: out.pack && { variants: Object.fromEntries(Object.entries(out.pack.variants ?? {}).map(([t, v]) => [t, (v as { fromFile: string }[]).map((x) => x.fromFile)])), designKeys: Object.keys(out.pack.designs), firstOfStep: out.pack.svgs?.step === (out.pack.variants?.step?.[0] as { svg: string }).svg, firstOfContent: out.pack.designs.content === (out.pack.variants?.content?.[0] as { layers: unknown }).layers, palette: out.pack.palette },
      manyCalls: many.report.slides.length,
    };
  }, { s1: svgOf('cover', 60) });

  // nine clean slides are never split into fragments; a real mosaic still is
  expect(r.slide).toEqual({ shaped: true, sheet: false });
  expect(r.mosaic.sheet).toBe(true);
  expect(r.mosaic.cells).toBe(4);
  // one call per slide, each with the one picture, the draw role and the pinned model
  expect(r.calls).toBe(9 + 12);
  expect(r.allDraw).toBe(true);
  expect(r.peak).toBeLessThanOrEqual(3);
  expect(r.manyCalls).toBe(12);
  // failures are named, with the reason, and nothing replaces them
  const bad = r.report.slides.filter((s: { ok: boolean }) => !s.ok);
  expect(bad.map((s: { file: string }) => s.file)).toEqual(['slide4.jpg', 'slide6.jpg']);
  expect(bad[0].reasons.join(' ')).toMatch(/could not be reached/);
  expect(bad[1].reasons.join(' ')).toMatch(/svg|design/i);
  expect(r.report.failed).toBe(2);
  // variants hold all seven that were read; designs point at the first of each type
  expect(r.pack!.variants.step).toEqual(['slide2.jpg', 'slide8.jpg']);
  expect(r.pack!.variants.content).toEqual(['slide3.jpg', 'slide9.jpg']);
  expect(Object.values(r.pack!.variants).flat()).toHaveLength(7);
  expect(r.pack!.firstOfStep).toBe(true);
  expect(r.pack!.firstOfContent).toBe(true);
  expect(r.pack!.palette.accent).toBe('#D62828');
  // report fields
  const ok = r.report.slides[0];
  for (const k of ['file', 'typeRead', 'model', 'seconds', 'ok', 'reasons', 'sanitiser', 'slots', 'imageSlots', 'cantDraw']) expect(ok).toHaveProperty(k);
  expect(ok.typeRead).toBe('cover');
  expect(ok.slots).toBe(2);
  expect(ok.cantDraw).toBe(1);
  expect(ok.textOverlap).not.toBeNull();
  expect(r.report.palette).toBeTruthy();
  expect(r.report.fonts).toBeTruthy();
  expect(r.report.distinctCompositions).toBeGreaterThan(0);
  expect(r.over).toBe(1);
});

test('a failed read shows its real reason: report, console, one line per slide', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const W = await import('/src/reference/wholeRead.ts');
    const R = await import('/src/reference/reader.ts');
    const reader = { id: 'api' as const, label: 'mock', async read(): Promise<{ text: string; ms: number }> { throw new R.ReaderError('failed', 'The API refused the request (401): invalid x-api-key [HTTP 502]'); } };
    const slides = [1, 2].map((i) => ({ name: `s${i}.jpg`, image: { name: `ref${i}.jpg`, mime: 'image/jpeg', base64: 'AA' } }));
    const out = await W.readWholeSlides({ reader, slides, signal: new AbortController().signal });
    return { pack: out.pack, lines: W.failureLines(out.report), report: out.report };
  });
  expect(r.pack).toBeNull();
  expect(r.lines).toHaveLength(2);
  expect(r.lines[0]).toContain('s1.jpg: failed: The API refused the request (401): invalid x-api-key [HTTP 502]');
  expect(r.report.slides[1].reasons.join(' ')).toContain('invalid x-api-key');
  expect(logs.some((l) => l.includes('[whole-read] s2.jpg') && l.includes('invalid x-api-key'))).toBe(true);
});
