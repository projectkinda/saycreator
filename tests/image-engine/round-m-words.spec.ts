// Round M part 1: every word of a slide's plan is drawn. (1) the layouts the decks use, x 15 styles, with and without a picture, drawn alone and through the redraw a style switch uses;
// (2) the fallback when the writer gives a field the layout does not have: the slide keeps every word (the prose layout), and the report says why. A FAKE writer only: no real model call.
import { expect, test } from '@playwright/test';

test.setTimeout(10 * 60_000);
const LAYOUTS = ['statement', 'cover-art', 'photo-cover', 'photo-full-caption', 'title-over-photo', 'split-half', 'headline-body-image', 'list-under-band', 'numbered-list', 'cta-button', 'stepper', 'split-text', 'checklist', 'pill-stagger', 'prose', 'art-side-text', 'phone-frame'];
const STYLES = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];

const WORDS = `(t) => String(t).toLowerCase().replace(/[’']/g, "'").match(/[\\p{L}\\p{N}']+/gu) ?? []`;

test('M1: every plan word is drawn: the deck layouts x 15 styles, with and without a picture, drawn alone and through the redraw', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const bad: string[] = await page.evaluate(async ({ LAYOUTS, STYLES, WORDS }) => {
    const DL: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const LIB: any = await import('/src/carousel/layouts/library.ts');
    const F: any = await import('/src/reference/faithful.ts');
    const fonts: any = await import('/src/image-engine/fonts.ts'); await fonts.loadFonts();
    // eslint-disable-next-line no-eval
    const words = (0, eval)(WORDS);
    F.setPictureResolver(async () => 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#8aa4c0"/></svg>'));
    const isImg = (k: string) => /^image\d*$/.test(k);
    const missingOf = (spec: any, layers: any[]) => {
      const have = new Map<string, number>();
      for (const t of layers.filter((l) => l.kind === 'text' && l.name !== 'recurring')) for (const w of words(t.text)) have.set(w, (have.get(w) || 0) + 1);
      const miss: string[] = [];
      for (const w of Object.entries(spec.fields).filter(([k]) => !isImg(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [v])).flatMap((x: any) => words(x))) { const c = have.get(w) || 0; if (c <= 0) miss.push(w); else have.set(w, c - 1); }
      return miss;
    };
    const out: string[] = [];
    for (const st of STYLES) {
      const pack = PR.presetPackFor(st, false, null);
      const { style } = DL.styleFromPack(structuredClone(pack));
      for (const id of LAYOUTS) {
        const def = LIB.layoutDef(id);
        if (!def) { out.push(`${id}: no such layout`); continue; }
        const takesPic = def.fields.some((f: any) => isImg(f.name));
        for (const pic of takesPic ? [true, false] : [false]) {
          const fields = Object.fromEntries(Object.entries(def.samples.normal).filter(([k]) => pic || !isImg(k)).map(([k, v]) => [k, isImg(k) ? 'picture:pz#w=1200&h=900&fx=0.5&fy=0.5&z=1&k=p' : v]));
          const spec = { layout: id, fields, accents: [] };
          const d = await DL.drawOne(spec, 0, style, { handle: '@x', index: 2, total: 7, cut: 'plain', invert: false, density: 'normal' });
          if (!d.built) out.push(`${st} ${id}${pic ? ' with picture' : ''}: not drawn (${(d.problems || []).join('; ')})`);
          else { const m = missingOf(spec, d.built.layers); if (m.length) out.push(`${st} ${id}${pic ? ' with picture' : ''}: missing ${m.join(' ')}`); }
          const o = await DL.redrawLibraryDeck({ plan: { title: 't', specs: [spec] }, layouts: [id], variants: [1], style: null, source: st }, { pack, hasPhoto: pic, images: pic ? [{ id: 'pz', width: 1200, height: 900, content: 'photo' }] : [], site: '' }, '@x');
          if (!o.slides['0']) out.push(`${st} ${id}${pic ? ' with picture' : ''}: not drawn by the redraw`);
          else { const m = missingOf(spec, o.slides['0'].built.layers); if (m.length) out.push(`${st} ${id}${pic ? ' with picture' : ''} (redraw): missing ${m.join(' ')}`); }
        }
      }
    }
    return out;
  }, { LAYOUTS, STYLES, WORDS });
  expect(bad).toEqual([]);
});

test('M1: a writer field the layout does not have never loses words: the slide is drawn with every word, and the report says why', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (WORDS) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    // eslint-disable-next-line no-eval
    const words = (0, eval)(WORDS);
    const plan = { title: 'T', slides: [
      { layout: 'statement', fields: { headline: "Most creators don't have a design problem.", subtitle: 'They have a "this takes two hours" problem.' }, accents: [] },
      { layout: 'split-text', fields: { headline: 'The idea took ten minutes', paragraph: 'The slides took the rest of the night.', footnote: 'And then the evening was gone, every single time.' }, accents: [] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'I will send you the link.' }, accents: [] },
    ] };
    const text = "Most creators don't have a design problem. They have a \"this takes two hours\" problem. The idea took ten minutes. The slides took the rest of the night. And then the evening was gone, every single time. Try it on your next post. Comment slides and I will send you the link.";
    const provider = { id: 'dev-cli', label: 'fake', async write() { return { text: JSON.stringify(plan), ms: 1 }; } };
    const res = await D.designLibraryDeck({ text, slides: 3, tone: 'clear', format: 'carousel', styleChoice: 'editorial-collage', styles: [] }, { pack: PR.presetPackFor('editorial-collage', false, null), hasPhoto: false, images: [], brief: '', site: '' }, '@x', provider, new AbortController().signal);
    const lib = res.designed.library;
    const missing = plan.slides.map((s, i) => { const have = words(res.designed.slides[String(i)].built.layers.filter((l: any) => l.kind === 'text').map((l: any) => l.text).join(' ')); return Object.values(s.fields).flatMap((v: any) => words(v)).filter((w: string) => !have.includes(w)); });
    return { missing, fallbacks: lib.fallbacks, prose: D.proseFieldsOf({ headline: 'A short heading', body: 'One. Two two. Three three three.' }), keeps: [D.keepsAllWords({ a: 'one two' }, { b: 'two one' }), D.keepsAllWords({ a: 'one two two' }, { b: 'one two' })] };
  }, WORDS);
  expect(r.missing).toEqual([[], [], []]);
  expect(r.fallbacks.map((f: any) => f.layout)).toEqual(['prose', 'prose']);
  for (const f of r.fallbacks) expect(f.level).toContain('every word');
  expect(r.prose).toEqual({ heading: 'A short heading', p1: 'One. Two two. Three three three.' });
  expect(r.keeps).toEqual([true, false]);
});
