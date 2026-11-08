// REAL writer check of the closing call to action (skipped unless REAL_CLOSING=1): three runs through the dev server's real writer (dev-cli, no API key), one call each (plus the built-in retry).
//   a) style-6, a text with NO action (the product critique)   b) style-4, a text WITH a real action   c) style-7, a text with an email address and a phone number
// Output: out/cta-fix/a.png, b.png, c.png (the last slide of each) + a.json ... + closings.png (the three side by side).
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.skip(!process.env.REAL_CLOSING, 'real model run only when REAL_CLOSING=1');
test.describe.configure({ mode: 'serial' });
test.setTimeout(8 * 60_000);
const OUT = path.resolve(process.cwd(), 'out/cta-fix');
const CRITIQUE = fs.readFileSync('tests/image-engine/fixtures/prose-critique.txt', 'utf8');
const RUNS: { id: string; preset: string; text: string }[] = [
  { id: 'a', preset: 'style-6', text: CRITIQUE },
  { id: 'b', preset: 'style-4', text: 'Most home bakers undercook their sourdough because they trust the clock and not the dough. Look for a dome that springs back slowly when pressed, a crust that sounds hollow when tapped, and a crumb that is open but not gummy. If the loaf is dense, the starter was probably too young or the dough proved for too short a time. Fix one thing at a time and keep notes. If you want me to look at your loaf, book a free call at example.com/call.' },
  { id: 'style-5-closing', preset: 'style-5', text: CRITIQUE },
  { id: 'c', preset: 'style-7', text: 'We are opening a small pottery studio on Elm Street this spring. We will run evening classes for beginners, a weekend open studio for experienced makers, and a shelf where local artists can sell their work. The studio is fully set up with two wheels and a kiln. Every class is capped at eight people so everyone gets time with the teacher. To ask about a place, write to hello@elmpottery.com or call +1 415 555 0134.' },
];

for (const run of RUNS) {
  test(`real closing ${run.id} on ${run.preset}`, async ({ page }) => {
    await page.goto('/images/carousel');
    const r = await page.evaluate(async ({ run }) => {
      const W = await import('/src/carousel/writer.ts');
      const D = await import('/src/carousel/designLibrary.ts');
      const PR = await import('/src/carousel/presets.ts');
      const F = await import('/src/reference/faithful.ts');
      const real = (await W.detectProviders())[0];
      if (!real) throw new Error('no writer available on this server');
      let calls = 0;
      const p = { ...real, async write(prompt: string, signal: AbortSignal, kind?: 'write' | 'draw', images?: any) { calls++; return real.write(prompt, signal, kind, images); } };
      const out = await D.designLibraryDeck({ text: run.text, slides: 7, tone: 'clear', format: 'carousel', styleChoice: run.preset, styles: [] }, { pack: PR.presetPackFor(run.preset, false) as any }, '@maya.designs', p as any, new AbortController().signal);
      const lib: any = out.designed.library;
      const specs = (lib.plan?.specs ?? []) as { layout: string; fields: Record<string, any> }[];
      const last = specs[specs.length - 1];
      const ids = Object.keys(out.designed.slides).sort((a, b) => Number(a) - Number(b));
      const png = await F.svgToPng((out.designed.slides as any)[ids[ids.length - 1]].built.svg, 1080);
      const buf = new Uint8Array(await png.arrayBuffer()); let s = ''; for (const b of buf) s += String.fromCharCode(b);
      return { calls, layouts: specs.map((q) => q.layout), last: { layout: last.layout, headline: last.fields.headline ?? null, button: last.fields.button ?? null, button1: last.fields.button1 ?? null, caption: last.fields.caption ?? null, sub: last.fields.sub ?? null, line: last.fields.line ?? null, contacts: last.fields.contacts ?? null }, retries: lib.retries ?? [], trims: lib.trims ?? [], fallbacks: lib.fallbacks ?? [], flavour: lib.flavour ?? null, png: btoa(s) };
    }, { run });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${run.id}.png`), Buffer.from(r.png, 'base64'));
    fs.writeFileSync(path.join(OUT, `${run.id}.json`), JSON.stringify({ ...run, text: undefined, ...r, png: undefined }, null, 1));
    console.log(`REAL-CLOSING ${run.id} ${run.preset} ` + JSON.stringify({ calls: r.calls, last: r.last, retries: r.retries.map((q: any) => `slide ${q.slide}: ${q.reasons.join('; ').slice(0, 160)}`), trims: r.trims.map((t: any) => `${t.field}: ${String(t.from).slice(0, 40)} -> ${String(t.to).slice(0, 60)}`), fallbacks: r.fallbacks.length, layouts: r.layouts }));
    expect(r.layouts.length).toBeGreaterThanOrEqual(5);
  });
}

test('closings.png: the three last slides side by side', async ({ page }) => {
  await page.goto('/images/carousel');
  const urls = RUNS.filter((r) => ['a', 'b', 'c'].includes(r.id)).map((r) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, `${r.id}.png`)).toString('base64'));
  const png = await page.evaluate(async (urls: string[]) => {
    const imgs = await Promise.all(urls.map((u) => new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; })));
    const w = 450, h = 563;
    const c = document.createElement('canvas'); c.width = imgs.length * (w + 10) + 10; c.height = h + 20;
    const g = c.getContext('2d')!; g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => g.drawImage(im, 10 + i * (w + 10), 10, w, h));
    return c.toDataURL('image/png').split(',')[1];
  }, urls);
  fs.writeFileSync(path.join(OUT, 'closings.png'), Buffer.from(png, 'base64'));
  expect(png.length).toBeGreaterThan(1000);
});
