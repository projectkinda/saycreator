// Radial gradients, letter spacing and text runs in the layer engine and the plan (no model). Old plans still validate.
import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('radial gradients, letter spacing and runs render, runs wrap, old plans validate, the SVG reader keeps all three', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const E = await import('/src/image-engine/index.ts');
    const R = await import('/src/reference/recreate.ts');
    await E.loadFonts();
    const font = 'Schibsted Grotesk' as const;
    const ws = E.FONT_WEIGHTS[font];
    const light = ws[0];
    const heavy = ws[ws.length - 1];
    const base = (id: string) => ({ id, rotation: 0, opacity: 1 });
    const plan = (layers: any[], w = 400, h = 400) => ({ schema: 1 as const, revision: 1, canvas: { width: w, height: h, background: '#000000' }, layers });
    const text = (id: string, t: string, width: number, extra: any = {}, style: any = {}) => ({ ...base(id), kind: 'text', x: 10, y: 10, width, height: 300, text: t, style: { font, weight: light, size: 60, color: '#ffffff', align: 'left', lineHeight: 1.2, ...style }, ...extra }) as any;
    const pixels = async (p: any) => {
      const a = new E.FabricAdapter();
      await a.mount(null);
      await a.render(p);
      const bmp = await createImageBitmap(await a.export({ format: 'png', scale: 1 }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height);
      a.dispose();
      return { at: (x: number, y: number) => [...d.data.slice((y * bmp.width + x) * 4, (y * bmp.width + x) * 4 + 3)], d, w: bmp.width, h: bmp.height };
    };

    // 1. radial glow: red in the middle, fading to clear at the radius
    const glow = plan([{ ...base('g'), kind: 'shape', shape: 'rect', x: 0, y: 0, width: 400, height: 400, fill: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ at: 0, color: '#ff0000' }, { at: 1, color: 'rgba(255,0,0,0)' }] } }]);
    const gp = await pixels(glow);
    const centre = gp.at(200, 200);
    const mid = gp.at(200, 100);
    const corner = gp.at(5, 5);

    // 2. letter spacing: the same word is wider, by (letters - 1) * spacing
    const w0 = E.layoutText(text('a', 'IIII', 380)).lines[0].width;
    const w1 = E.layoutText(text('a', 'IIII', 380, {}, { letterSpacing: 30 })).lines[0].width;
    const inkRight = async (ls: number) => {
      const p = await pixels(plan([text('a', 'IIII', 380, {}, { letterSpacing: ls })]));
      let max = 0;
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.d.data[(y * p.w + x) * 4] > 128 && x > max) max = x;
      return max;
    };
    const ink0 = await inkRight(0);
    const ink30 = await inkRight(30);

    // 3. runs: an accent word in the same line; and a run that wraps across two lines
    const sample = 'Tutorials feel like progress';
    const runs = [{ start: 20, end: 28, color: '#ff0000', weight: heavy }];
    const one = E.layoutText(text('r', sample, 780, { runs }, { size: 36 }));
    const wrapped = E.layoutText(text('r', 'Tutorials feel like real progress', 250, { runs: [{ start: 15, end: 33, color: '#ff0000', weight: heavy }] }, { size: 48 }));
    const redOf = (b: any) => b.lines.map((l: any) => (l.segments ?? []).filter((s: any) => s.color === '#ff0000').map((s: any) => s.text).join(' '));
    const rp = await pixels(plan([text('r', sample, 780, { runs }, { size: 36 })], 800, 400));
    let redPixels = 0;
    for (let i = 0; i < rp.d.data.length; i += 4) if (rp.d.data[i] > 180 && rp.d.data[i + 1] < 90 && rp.d.data[i + 2] < 90) redPixels++;

    // 4. old plans: no runs, no spacing, a linear gradient
    const old = plan([{ ...base('b'), kind: 'shape', shape: 'rect', x: 0, y: 0, width: 400, height: 400, fill: { type: 'linear', angle: 180, stops: [{ at: 0, color: '#111111' }, { at: 1, color: '#333333' }] } }, text('t', 'Plain old text here', 380)]);
    const oldBlock = E.layoutText(old.layers[1]);
    const bad = E.validatePlan(plan([text('x', 'abc', 380, { runs: [{ start: 2, end: 9, color: '#ff0000' }, { start: 0, end: 1 }] })]));

    // 5. the SVG reader keeps a radial gradient, letter spacing and inline runs, and no longer says they are not drawn
    const raw = `<svg viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="glow" cx="0.5" cy="0.4" r="0.6"><stop offset="0" stop-color="#d10f0f" stop-opacity="0.8"/><stop offset="1" stop-color="#d10f0f" stop-opacity="0"/></radialGradient></defs><rect x="0" y="0" width="1080" height="1350" fill="#0b0a0a"/><ellipse cx="540" cy="500" rx="500" ry="400" fill="url(#glow)"/><text data-role="title" x="60" y="300" font-family="Schibsted Grotesk" font-size="90" font-weight="400" letter-spacing="6" fill="#ffffff">Tutorials feel like <tspan fill="#d10f0f" font-weight="800">progress</tspan></text></svg>`;
    const s = R.sanitizeSvg(raw);
    const lay = R.svgToLayers(s.svg!, 1080, 1350);
    const glowLayer = lay.layers.find((l: any) => l.kind === 'shape' && l.shape === 'ellipse') as any;
    const title = lay.layers.find((l: any) => l.kind === 'text') as any;
    const remapped = R.remapRuns(sample, runs, 'Ship something real');

    return {
      centre, mid, corner,
      w0, w1, ink0, ink30,
      oneLines: one.lines.length, oneSegs: one.lines[0].segments!.map((x: any) => ({ t: x.text, w: x.weight, c: x.color ?? null })),
      wrappedLines: wrapped.lines.length, wrappedRed: redOf(wrapped), wrappedWidths: wrapped.lines.map((l: any) => Math.ceil(l.width)),
      redPixels,
      oldSegments: oldBlock.lines.some((l: any) => l.segments), oldErrors: E.validatePlan(old), newErrors: E.validatePlan(glow), runPlanErrors: E.validatePlan(plan([text('r', sample, 380, { runs }, { letterSpacing: 4 })])), bad,
      reasons: s.reasons, notes: lay.notes,
      glowFill: glowLayer?.fill, titleStyle: title?.style, titleRuns: title?.runs, titleText: title?.text,
      layerPlanErrors: E.validatePlan(plan(lay.layers.map((l: any) => { const { src, srcAll, slot, name, ...rest } = l; return rest; }), 1080, 1350)),
      remapped,
    };
  });

  // 1. radial glow
  expect(r.centre[0]).toBeGreaterThan(200);
  expect(r.corner[0]).toBeLessThan(40);
  expect(r.mid[0]).toBeGreaterThan(r.corner[0] + 30);
  expect(r.mid[0]).toBeLessThan(r.centre[0]);
  // 2. letter spacing
  expect(Math.abs(r.w1 - r.w0 - 90)).toBeLessThan(1.5);
  expect(r.ink30).toBeGreaterThan(r.ink0 + 60);
  // 3. runs: one line holds a normal and a heavy red segment; a run across a wrap colours both lines and nothing overflows
  expect(r.oneLines).toBe(1);
  expect(r.oneSegs.length).toBeGreaterThanOrEqual(2);
  expect(r.oneSegs[r.oneSegs.length - 1]).toMatchObject({ t: 'progress', c: '#ff0000' });
  expect(r.wrappedLines).toBeGreaterThanOrEqual(2);
  expect(r.wrappedRed.filter(Boolean).length).toBeGreaterThanOrEqual(2);
  expect(Math.max(...r.wrappedWidths)).toBeLessThanOrEqual(250);
  expect(r.redPixels).toBeGreaterThan(200);
  // 4. old plans
  expect(r.oldSegments).toBeFalsy();
  expect(r.oldErrors).toEqual([]);
  expect(r.newErrors).toEqual([]);
  expect(r.runPlanErrors).toEqual([]);
  expect(r.bad.join(' ')).toMatch(/run 1/);
  // 5. the reader keeps all three and the notes no longer say they are not drawn
  expect(r.glowFill).toMatchObject({ type: 'radial' });
  expect(r.glowFill.stops[0].color).toMatch(/^rgba\(209,15,15,0\.8\)$/);
  expect(r.titleStyle.letterSpacing).toBeGreaterThan(0);
  expect(r.titleText).toBe('Tutorials feel like progress');
  expect(r.titleRuns).toMatchObject([{ start: 20, end: 28, color: '#d10f0f' }]);
  expect([...r.reasons, ...r.notes].join(' ')).not.toMatch(/not drawn|drawn as a linear/);
  expect(r.layerPlanErrors).toEqual([]);
  expect(r.remapped).toMatchObject([{ start: 15, end: 19, color: '#ff0000' }]);
});
