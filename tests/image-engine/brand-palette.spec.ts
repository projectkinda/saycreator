// Round G part F: 5 brands x 15 styles. A fake writer only (ZERO real model calls). The deck is drawn from one plan; with a brand it must have: no failed contrast check (gradient headline and text over art
// included), no word cut, the SAME layout ids as the deck without the brand, a plain-words changes list, and a brand switch (a redraw from the stored plan) makes 0 writer calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(15 * 60_000);

const BRANDS = [
  { id: 'yellow', colours: ['#FFE97A', '#333333'] },
  { id: 'neon', colours: ['#39FF14', '#FFFFFF'] },
  { id: 'navy', colours: ['#14213D', '#FCA311'] },
  { id: 'black', colours: ['#111111', '#FFFFFF'] },
  { id: 'blues', colours: ['#2F6BFF', '#3C78FF'] },
];

test('brands: 5 brands x all 15 styles keep the layouts, cut no word, fail no contrast check and a brand switch makes 0 writer calls', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (brands) => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const BP: any = await import('/src/carousel/brandPalette.ts');
    const FC: any = await import('/src/reference/faithfulChecks.ts');
    const names = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];
    const plan = [
      { layout: 'statement', fields: { headline: 'Most creators do not have a design problem.' }, accents: ['design problem'] },
      { layout: 'split-text', fields: { headline: 'The idea took ten minutes', paragraph: 'The slides took the rest of the night.' }, accents: ['ten minutes'] },
      { layout: 'checklist', fields: { title: 'Three steps', items: ['Paste your text', 'Pick a look', 'Get slides'] }, accents: [] },
      { layout: 'big-stat', fields: { number: '15', label: 'styles to pick from', source: 'Switch the style and your words stay put.' }, accents: [] },
      { layout: 'quote', fields: { quote: 'Change a headline and nothing reruns.', author: 'Say Creator' }, accents: ['nothing reruns'] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'I will send you the link.' }, accents: ['next post'] },
    ];
    const text = 'Most creators do not have a design problem. The idea took ten minutes. The slides took the rest of the night. Three steps: paste your text, pick a look, get slides. 15 styles to pick from. Switch the style and your words stay put. Change a headline and nothing reruns. Try it on your next post. Comment slides and I will send you the link.';
    const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    const rows: any[] = [];
    for (const name of names) {
      const run = async (brand: any) => {
        let calls = 0;
        const provider: any = { id: 'dev-cli', label: 'fake', async write() { calls++; return { text: JSON.stringify({ title: 'T', slides: plan }), ms: 1 }; } };
        const base = PR.presetPackFor(name, false);
        const applied = BP.applyBrand(structuredClone(base), brand);
        const look = { pack: applied.pack, hasPhoto: false, images: [], brief: '', site: '' };
        const res = await D.designLibraryDeck({ text, slides: plan.length, tone: 'clear', format: 'carousel', styleChoice: name, styles: [] }, look, '@saycreator', provider, new AbortController().signal);
        const lib = res.designed.library;
        const missing: string[] = [];
        const contrast: string[] = [];
        plan.forEach((p, i) => {
          const b = res.designed.slides[String(i)].built;
          const have = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !/recurring/.test(l.id + l.name)).flatMap((l) => words(l.text));
          for (const w of Object.values(p.fields).flatMap((v: any) => (Array.isArray(v) ? v : [v])).flatMap((v: any) => words(String(v)))) if (!have.includes(w)) missing.push(`${i + 1}:${w}`);
          const type = String(D.scriptSlideOf(lib.layouts[i], lib.plan.specs[i].fields).type ?? 'content');
          const q = FC.faithfulChecks(b.layers, { canvas: { w: 1080, h: 1350 }, bg: b.bg ?? '#FFFFFF', k: 1, slideType: type, prose: /data-layout="prose"/.test(b.svg), svg: b.svg, devices: b.devices }).find((x: any) => x.id === 'contrast');
          if (q && !q.pass) contrast.push(`${i + 1}: ${q.reason}`);
        });
        // the brand switch: the deck is drawn again from its stored plan with another brand pack (no provider is called)
        let redrawCalls = 0;
        let switched: string[] = [];
        if (brand) {
          const other = BP.applyBrand(structuredClone(base), { colours: ['#E11D48', '#111827'] });
          const out = await D.redrawLibraryDeck(lib, { pack: other.pack, hasPhoto: false, images: [], brief: '', site: '' }, '@saycreator');
          redrawCalls = calls - 1;
          switched = Object.values(out.layouts) as string[];
        }
        return { calls, layouts: lib.layouts as string[], missing, contrast, repairs: (lib.repairs ?? []).map((x: any) => `${x.slide}:${x.how}:${x.from}->${x.to}`), changes: applied.changes.map((c: any) => c.text), redrawCalls, switched };
      };
      const control = await run(null);
      for (const b of brands) rows.push({ style: name, brand: b.id, control, got: await run({ colours: b.colours }) });
    }
    return rows;
  }, BRANDS);
  fs.mkdirSync('out/round-g', { recursive: true });
  fs.writeFileSync('out/round-g/brand-palette-results.json', JSON.stringify(r.map((x: any) => ({ style: x.style, brand: x.brand, layouts: x.got.layouts, same: JSON.stringify(x.got.layouts) === JSON.stringify(x.control.layouts), contrast: x.got.contrast, missing: x.got.missing, repairs: x.got.repairs, changes: x.got.changes, calls: x.got.calls, redrawCalls: x.got.redrawCalls })), null, 1));
  expect(r.length).toBe(75);
  for (const x of r) {
    const who = `${x.style} + ${x.brand}`;
    expect(x.got.layouts, `${who}: the layouts of the deck without the brand`).toEqual(x.control.layouts);
    expect(x.got.contrast, `${who}: contrast`).toEqual([]);
    expect(x.got.missing, `${who}: no word is cut (the deck without the brand loses the same ones)`).toEqual(x.control.missing);
    expect(x.got.calls, `${who}: one fake writer call to make the deck`).toBe(1);
    expect(x.got.redrawCalls, `${who}: a brand switch makes 0 writer calls`).toBe(0);
    expect(x.got.switched, `${who}: a brand switch keeps the layouts`).toEqual(x.control.layouts);
    for (const c of x.got.changes) expect(c.length, `${who}: a change is written in words`).toBeGreaterThan(20);
    // a repair for a contrast failure is a colour repair, never a layout swap
    for (const rp of x.got.repairs) expect(rp, `${who}: repairs`).not.toMatch(/:layout:/);
  }
  // no brand: nothing changes (the pack is the same object, so the deck is the control)
  const same = await page.evaluate(async () => {
    const PR: any = await import('/src/carousel/presets.ts');
    const BP: any = await import('/src/carousel/brandPalette.ts');
    return ['style-1', 'style-5', 'style-8'].map((n) => { const p = PR.presetPackFor(n, false); return BP.applyBrand(p, null).pack === p && BP.applyBrand(p, { colours: [] }).pack === p; });
  });
  expect(same).toEqual([true, true, true]);
  // the close pair is said in words
  for (const x of r.filter((y: any) => y.brand === 'blues')) expect(x.got.changes.join(' '), x.style).toContain('very close');
  // a style with an accent ground tells the person about white on neon
  for (const n of ['style-4', 'style-7', 'style-2']) expect(r.find((y: any) => y.style === n && y.brand === 'neon').got.changes.join(' '), n).toContain('so text on slides with that background is black');
});
