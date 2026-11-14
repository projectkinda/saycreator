// Round G part C: a failed contrast check is fixed by a colour on the same layout, never by moving the slide to another layout.
// A fake writer only (ZERO real model calls). The deck is drawn twice from the same plan and the same preset: as it is, and with a neon-green ground and white ink (a brand colour pair
// that fails contrast on every slide). The layout ids must be the same per slide.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);
const OUT = 'out/round-g';

test('C: neon green with white ink ends with the same layouts as the deck without it; every contrast failure is a colour repair', async ({ page }) => {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async () => {
    const D: any = await import('/src/carousel/designLibrary.ts');
    const PR: any = await import('/src/carousel/presets.ts');
    const plan = [
      { layout: 'statement', fields: { headline: 'Most creators do not have a design problem.' }, accents: ['design problem'] },
      { layout: 'split-text', fields: { headline: 'The idea took ten minutes', paragraph: 'The slides took the rest of the night.' }, accents: ['ten minutes'] },
      { layout: 'checklist', fields: { title: 'Three steps', items: ['Paste your text', 'Pick a look', 'Get slides'] }, accents: [] },
      { layout: 'big-stat', fields: { number: '15', label: 'styles to pick from', source: 'Switch the style and your words stay put.' }, accents: [] },
      { layout: 'quote', fields: { quote: 'Change a headline and nothing reruns.', author: 'Say Creator' }, accents: ['nothing reruns'] },
      { layout: 'cta-button', fields: { headline: 'Try it on your next post.', button: 'Comment slides', sub: 'I will send you the link.' }, accents: ['next post'] },
    ];
    const text = 'Most creators do not have a design problem. The idea took ten minutes. The slides took the rest of the night. Three steps: paste your text, pick a look, get slides. 15 styles to pick from. Switch the style and your words stay put. Change a headline and nothing reruns. Try it on your next post. Comment slides and I will send you the link.';
    const run = async (neon: boolean) => {
      let calls = 0;
      const provider: any = { id: 'dev-cli', label: 'fake', async write() { calls++; return { text: JSON.stringify({ title: 'T', slides: plan }), ms: 1 }; } };
      const pack = structuredClone(PR.presetPackFor('style-3', false));
      if (neon) {
        // the pair as given: no ground fix (an empty rhythm), so the failure reaches the phone check
        pack.palette = { bg: '#39FF14', text: '#FFFFFF', accent: '#FFFFFF' };
        pack.look = { ...pack.look, rhythm: [], closing: undefined };
      }
      const res = await D.designLibraryDeck({ text, slides: plan.length, tone: 'clear', format: 'carousel', styleChoice: 'style-3', styles: [] }, { pack, hasPhoto: false, images: [], brief: '', site: '' }, '@saycreator', provider, new AbortController().signal);
      const lib = res.designed.library;
      const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
      const missing: string[] = [];
      plan.forEach((p, i) => {
        const have = (res.designed.slides[String(i)].built.layers as any[]).filter((l) => l.kind === 'text' && l.text && !/recurring/.test(l.id + l.name)).flatMap((l) => words(l.text));
        for (const w of Object.values(p.fields).flatMap((v: any) => (Array.isArray(v) ? v : [v])).flatMap((v: any) => words(String(v)))) if (!have.includes(w)) missing.push(`${i + 1}:${w}`);
      });
      return { calls, layouts: lib.layouts as string[], repairs: lib.repairs ?? [], missing };
    };
    return { control: await run(false), neon: await run(true) };
  });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/repair-run-${process.env.ROUND_G_LABEL ?? 'now'}.json`, JSON.stringify(r, null, 1));
  expect(r.control.calls + r.neon.calls, 'one fake writer call per deck').toBe(2);
  expect(r.neon.layouts, JSON.stringify(r)).toEqual(r.control.layouts);
  // a contrast failure is repaired by colour only
  for (const x of r.neon.repairs) if (/^contrast:/.test(x.failed.join(' '))) expect(x.how, JSON.stringify(x)).toBe('colour');
  expect(r.neon.repairs.filter((x: any) => x.how === 'layout' && x.failed.some((f: string) => f.startsWith('contrast:')))).toEqual([]);
  // no word is cut by the colour repair (an invented name the writer rules drop is dropped in the deck without the brand as well)
  expect(r.neon.missing, 'no word is cut').toEqual(r.control.missing);
});
