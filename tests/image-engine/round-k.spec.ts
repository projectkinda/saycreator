// Round K part 3b: the user's 8-block post must never draw a paragraph twice on one slide (a headline and, again, the same words as the body). It did once, in a build before Round 10, on the old
// template route; this spec keeps it from coming back on either route. No writer call: the post is pasted as paragraphs.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
// the post, read from script-route.spec.ts (importing it would run that file's tests here too)
const POST = fs.readFileSync('tests/image-engine/script-route.spec.ts', 'utf8').match(/export const POST = `([\s\S]*?)`;/)![1];

test.setTimeout(5 * 60_000);
const IDS = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

test('K3: the script both routes draw from never has a headline whose words come again in its body', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const slides: any[] = await page.evaluate(async (text) => {
    const P: any = await import('/src/carousel/pasted.ts');
    return P.scriptFromBlocks(P.slideBlocks(text), 'carousel', '').script.slides;
  }, POST);
  expect(slides.length).toBe(7);
  for (const [i, s] of slides.entries()) {
    const head = norm(String(s.headline ?? ''));
    for (const k of ['body', 'sub', 'cta']) {
      const other = norm(String(s[k] ?? ''));
      if (!head || !other) continue;
      expect(other === head || other.includes(head) || head.includes(other), `slide ${i + 1}: the ${k} repeats the headline ("${head}")`).toBe(false);
    }
  }
});

test('K3: drawn in all 15 styles, no slide shows its headline again as body text', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any[] = await page.evaluate(async ({ text, ids }) => {
    const P: any = await import('/src/carousel/pasted.ts');
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const n = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const out: any[] = [];
    for (const style of ids) {
      const built = P.scriptFromBlocks(P.slideBlocks(text), 'carousel', '');
      const made: any = await FS.libraryDeckFromScript(built.script, { pack: PR.presetPackFor(style, false), brief: '', hasPhoto: false, images: [], site: '' }, '');
      if (!made.ok) { out.push({ style, error: made.reason }); continue; }
      for (const k of Object.keys(made.designed.slides)) {
        const layers = made.designed.slides[k].built.layers.filter((l: any) => l.kind === 'text' && l.name !== 'recurring');
        const title = layers.find((l: any) => l.name === 'title');
        if (!title) continue;
        const t = n(String(title.text));
        for (const l of layers) {
          if (l === title) continue;
          const o = n(String(l.text));
          if (o.length > 12 && (o === t || o.includes(t) || (t.length > 12 && t.includes(o)))) out.push({ style, slide: +k + 1, title: t, other: o });
        }
      }
    }
    return out;
  }, { text: POST, ids: IDS });
  expect(r, 'a slide that draws its headline twice').toEqual([]);
});
