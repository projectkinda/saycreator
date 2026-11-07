// The real hot-flat run (plan in fixtures/hot-flat-app-library.json): the numbered-list slide and the lead-statement slide fill the slide like the other layouts. ZERO model calls.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test('numbered-list and lead-statement from the real run fill the slide', async ({ page }) => {
  const { library: lib } = JSON.parse(fs.readFileSync('tests/image-engine/fixtures/hot-flat-app-library.json', 'utf8'));
  await page.goto('/images/carousel');
  const r = await page.evaluate(async ({ lib }) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const res = await D.redrawLibraryDeck({ ...lib, redraws: 0 }, { pack: PR.presetPackFor('hot-flat', false), hasPhoto: false }, '@harsh.parekh');
    const out: Record<string, any> = {};
    Object.entries<any>(res.slides).forEach(([i, s]) => {
      const layout = res.library.layouts[Number(i)];
      const layers = s.built.layers as any[];
      const boxes = layers.filter((l) => (l.kind === 'text' && !String(l.name).startsWith('recurring') && l.text) || (l.kind !== 'text' && (l.height ?? 0) > 0 && l.height < 1000 && l.y > 100 && l.y < 1260 && !/background|recurring|plane/.test(String(l.name))));
      const top = Math.min(...boxes.map((q) => q.y)), bot = Math.max(...boxes.map((q) => q.y + q.height));
      out[layout + '#' + i] = { fill: (bot - top) / 1000, above: top - 120, below: 1230 - bot, gap: (() => { const ys = [...boxes].sort((m: any, n: any) => m.y - n.y); let big = 0; let reach = ys[0].y + ys[0].height; for (const q of ys.slice(1)) { big = Math.max(big, q.y - reach); reach = Math.max(reach, q.y + q.height); } return big; })() };
    });
    return out;
  }, { lib });
  const nl = Object.entries(r).find(([k]) => k.startsWith('numbered-list'))![1];
  const ls = Object.entries(r).find(([k]) => k.startsWith('lead-statement'))![1];
  // the real run's three short items: the old layout filled 70% (about 40% of the slide empty); a checklist of the same deck fills 80%
  expect(nl.fill, 'numbered-list fills like the checklist of the same deck').toBeGreaterThanOrEqual(0.75);
  expect(Math.abs(nl.above - nl.below)).toBeLessThan(180);
  expect(ls.fill).toBeGreaterThanOrEqual(0.55);
  expect(ls.fill, 'and it is not stretched from the top of the slide to the bottom').toBeLessThan(0.85);
  expect(ls.gap, 'no big gap inside the lead-statement block (the rule, the lead-in, the headline)').toBeLessThanOrEqual(160);
  expect(Math.abs(ls.above - ls.below), 'the lead-statement block is centred, not left hanging at the bottom').toBeLessThan(180);
});
