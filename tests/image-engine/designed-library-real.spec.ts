// REAL model runs of the library route (skipped unless REAL_LIBRARY=1): two references, 7 slides each, through the dev server's real writer endpoint.
// Saves per reference in out/designed-library/<name>/: slide-1..7.png, sheet.png, report.json, and every prompt and answer.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.skip(!process.env.REAL_LIBRARY, 'real model run only when REAL_LIBRARY=1');
test.setTimeout(20 * 60_000);
const OUT = path.resolve(process.cwd(), 'out/designed-library');

const layer = (o: Record<string, unknown>) => ({ kind: 'shape', id: 'p', name: 'shape', role: 'decor', rotation: 0, opacity: 1, shape: 'rect', ...o });
const base = { motifs: [], designs: {}, canvas: { w: 1080, h: 1350 }, notes: [] };
const REFS = [
  {
    name: 'quickflip-dark',
    handle: '@quick.flip',
    // the dark Quick Flip style: near-black ground with a soft red glow, a red accent, colour planes, a profile header
    pack: { ...base, name: 'Quick Flip (dark)', palette: { bg: '#0A0A0A', text: '#FFFFFF', accent: '#F02A2A', muted: '#A3A3A3', surface: '#1C1C1C' }, fonts: { headline: 'Schibsted Grotesk', body: 'Schibsted Grotesk' }, svgs: { cover: '<svg><radialGradient id="g"/></svg>' }, variants: { cover: [{ svg: '', layers: [layer({ x: -60, y: 950, width: 1200, height: 500, fill: '#F02A2A' })], imageSlots: [], slotMeta: [], fromFile: 'a' }] }, devices: { marker: false, profileHeader: true, underline: false, slides: 1, counts: { marker: 0, profileHeader: 1, underline: 0 } } },
    text: "Quick Flip is a Kickstarter project: a hoodie that flips into a backpack in 10 seconds. Slide the zip and bite the clasp, and the hoodie locks into a backpack. To flip it, zip the hood into the pocket, fold the sleeves behind you, then pull the straps and go. The shell is waterproof, it fits a 16-inch laptop, it is machine washable and it flips in 10 seconds. The team is raising $500,000 for 5% of the company and is open to 20 backers only. Early backers save 30%. One early backer said: \"I stopped carrying a bag the day this arrived.\"",
  },
  {
    name: 'harsh-light',
    handle: '@harsh.parekh',
    // the light lime style: white ground, lime accent set on a marker bar, a profile header, an accent underline, no planes
    pack: { ...base, name: 'Harsh Parekh (light lime)', palette: { bg: '#FFFFFF', text: '#0A0A0A', accent: '#D4F76A', muted: '#5C5C5C', surface: '#F1F1F1' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, svgs: { cover: '<svg></svg>' }, variants: { cover: [{ svg: '', layers: [layer({ x: 48, y: 400, width: 300, height: 100, fill: '#D4F76A' })], imageSlots: [], slotMeta: [], fromFile: 'a' }] }, devices: { marker: true, profileHeader: true, underline: true, slides: 1, counts: { marker: 1, profileHeader: 1, underline: 1 } } },
    text: 'Accounts that fix their headline get about 3x more replies. Fix your profile in 15 minutes with three edits that make people stop scrolling and start replying. Step 1: rewrite your headline: skip the job title and say who you help and how. Step 2: lead with a result: open with one number or outcome, not a list of adjectives. Step 3: pin one proof post: feature your best post at the top, because people decide in seconds. Before you hit save, check that you have a clear, well-lit photo, a headline that names who you help, and current contact info. Save this and fix it tonight.',
  },
];

for (const ref of REFS) {
  test('real library run: ' + ref.name, async ({ page }) => {
    await page.goto('/images/carousel');
    const r = await page.evaluate(async ({ ref }) => {
      const W = await import('/src/carousel/writer.ts');
      const D = await import('/src/carousel/designLibrary.ts');
      const F = await import('/src/reference/faithful.ts');
      const providers = await W.detectProviders();
      const real = providers[0];
      if (!real) throw new Error('no writer available on this server');
      const log: { prompt: string; answer: string; ms: number; usage?: { input: number; output: number } }[] = [];
      const p = { ...real, async write(prompt: string, signal: AbortSignal, kind?: 'write' | 'draw', images?: any) { const a = await real.write(prompt, signal, kind, images); log.push({ prompt, answer: a.text, ms: Math.round(a.ms), usage: a.usage }); return a; } };
      const t0 = performance.now();
      const out = await D.designLibraryDeck({ text: ref.text, slides: 7, tone: 'bold', format: 'carousel', styleChoice: 'auto', styles: [] }, { pack: ref.pack as any }, ref.handle, p as any, new AbortController().signal);
      const wall = Math.round((performance.now() - t0) / 100) / 10;
      const pngs: string[] = [];
      const urls: ImageBitmap[] = [];
      const ids = Object.keys(out.designed.slides).sort((a, b) => Number(a) - Number(b));
      for (const id of ids) {
        const blob = await F.svgToPng((out.designed.slides as any)[id].built.svg, 1080);
        urls.push(await createImageBitmap(blob));
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        pngs.push(btoa(s));
      }
      const w = 300;
      const h = 375;
      const c = document.createElement('canvas');
      c.width = urls.length * (w + 10) + 10;
      c.height = h + 20;
      const g = c.getContext('2d')!;
      g.fillStyle = '#888';
      g.fillRect(0, 0, c.width, c.height);
      urls.forEach((u, i) => g.drawImage(u, 10 + i * (w + 10), 10, w, h));
      return { wall, report: out.designed.library, script: out.script, notes: out.designed.notes, log, pngs, sheet: c.toDataURL('image/png').split(',')[1], note: out.note };
    }, { ref });
    const dir = path.join(OUT, ref.name);
    fs.mkdirSync(dir, { recursive: true });
    r.pngs.forEach((b, i) => fs.writeFileSync(path.join(dir, `slide-${i + 1}.png`), Buffer.from(b, 'base64')));
    fs.writeFileSync(path.join(dir, 'sheet.png'), Buffer.from(r.sheet, 'base64'));
    r.log.forEach((l, i) => {
      fs.writeFileSync(path.join(dir, `call${i + 1}-prompt.txt`), l.prompt);
      fs.writeFileSync(path.join(dir, `call${i + 1}-answer.txt`), l.answer);
    });
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ kind: 'say-creator-library-report', carousel: ref.name, handle: ref.handle, wallSeconds: r.wall, calls: r.report!.calls, perCall: r.log.map((l) => ({ ms: l.ms, usage: l.usage ?? null, promptChars: l.prompt.length, answerChars: l.answer.length })), library: r.report, notes: r.notes, modelNote: r.note, script: r.script }, null, 2));
    console.log(ref.name, JSON.stringify({ calls: r.report!.calls, tokens: r.report!.tokens, wall: r.wall, layouts: r.report!.layouts, cuts: r.report!.cuts, inverts: r.report!.inverts, densities: r.report!.densities, retries: r.report!.retries, fallbacks: r.report!.fallbacks, adjustments: r.report!.codeAdjustments }));
    expect(r.pngs.length).toBe(7);
  });
}
