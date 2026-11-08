// REAL writer check of the prose guidance (skipped unless REAL_PROSE=1): the product critique text on style-6 through the dev server's real writer (dev-cli, no API key), 7 slides.
// Records the word count of every prose slide, the layouts, whether the writer split a long passage. Output: out/prose-fix/style-6.png + .json.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.skip(!process.env.REAL_PROSE, 'real model run only when REAL_PROSE=1');
test.setTimeout(8 * 60_000);
const OUT = path.resolve(process.cwd(), 'out/prose-fix');
const NAME = process.env.REAL_PROSE_NAME ?? 'style-6'; // REAL_PROSE_TEXT picks the fixture, REAL_PROSE_NAME the output name

test('real writer: the product critique on style-6', async ({ page }) => {
  const text = fs.readFileSync(`tests/image-engine/fixtures/${process.env.REAL_PROSE_TEXT ?? 'prose-critique'}.txt`, 'utf8');
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ text }) => {
    const W = await import('/src/carousel/writer.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const real = (await W.detectProviders())[0];
    if (!real) throw new Error('no writer available on this server');
    let calls = 0;
    const p = { ...real, async write(prompt: string, signal: AbortSignal, kind?: 'write' | 'draw', images?: any) { calls++; return real.write(prompt, signal, kind, images); } };
    const out = await D.designLibraryDeck({ text, slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'style-6', styles: [] }, { pack: PR.presetPackFor('style-6', false) as any }, '@maya.designs', p as any, new AbortController().signal);
    const lib: any = out.designed.library;
    const specs = (lib.plan?.specs ?? []) as { layout: string; fields: Record<string, unknown>; accents: string[] }[];
    const words = (f: Record<string, unknown>) => Object.entries(f).filter(([k]) => k !== 'accent').flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map(String).join(' ').split(/\s+/).filter(Boolean).length;
    const ids = Object.keys(out.designed.slides).sort((a, b) => Number(a) - Number(b));
    const bms: ImageBitmap[] = [];
    for (const id of ids) bms.push(await createImageBitmap(await F.svgToPng((out.designed.slides as any)[id].built.svg, 1080)));
    const w = 450, h = 563, cols = 4;
    const c = document.createElement('canvas'); c.width = cols * (w + 10) + 10; c.height = Math.ceil(bms.length / cols) * (h + 10) + 10;
    const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
    bms.forEach((u, i) => g.drawImage(u, 10 + (i % cols) * (w + 10), 10 + Math.floor(i / cols) * (h + 10), w, h));
    return { calls, slides: ids.length, layouts: specs.map((s) => s.layout), words: specs.map((s) => words(s.fields)), prose: specs.map((s, i) => (s.layout === 'prose' ? { slide: i + 1, words: words(s.fields), fields: Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, Array.isArray(v) ? v.join(' | ') : String(v)])) } : null)).filter(Boolean), trims: lib.trims ?? [], retries: lib.retries, fallbacks: lib.fallbacks, tokens: lib.tokens, sheet: c.toDataURL('image/png').split(',')[1] };
  }, { text });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${NAME}.png`), Buffer.from(r.sheet, 'base64'));
  fs.writeFileSync(path.join(OUT, `${NAME}.json`), JSON.stringify({ ...r, sheet: undefined }, null, 1));
  console.log('REAL-PROSE ' + JSON.stringify({ calls: r.calls, slides: r.slides, layouts: r.layouts, wordsPerSlide: r.words, prose: r.prose, trims: r.trims, retries: r.retries, fallbacks: r.fallbacks, tokens: r.tokens }));
  expect(r.slides).toBeGreaterThanOrEqual(5);
});
