// Bug: "The last rule of layouts.cover has a when" when a style is built from a reference. The draft step and the cover-place edit rebuild layouts.cover; the last rule must
// have no "when". No model. The validator (format.ts) is not changed.
import { expect, test } from '@playwright/test';

const LAST = /The last rule of layouts\./;
const PLACES = ['top', 'middle', 'bottom'] as const;

test.beforeEach(async ({ page }) => {
  await page.goto('/images/carousel');
});

test('matrix: the draft step for every title placement, and the cover-place edit on every built-in style and placement, leave no "when" on a last rule', async ({ page }) => {
  const r = await page.evaluate(async (places) => {
    const D = await import('/src/reference/draft.ts');
    const E = await import('/src/reference/edit.ts');
    const S = await import('/src/reference/spec.ts');
    const C = await import('/src/carousel/render.ts');
    const failed: string[] = [];
    let n = 0;
    for (const p of places) {
      const m = { background: '#FFFFFF', textColour: '#111111', palette: [], margins: null, titleHeight: null, titlePlacement: p, photo: { present: false } };
      const { spec } = D.draftSpec(m as never);
      n++;
      const errs = S.checkSpec({ ...spec, name: 'mine-test' }).errors.filter((e) => /The last rule of layouts\./.test(e));
      if (errs.length) failed.push(`draft:${p}: ${errs[0].slice(0, 70)}`);
    }
    for (const st of C.getStyles().styles) {
      for (const p of places) {
        const patch = E.coverPlaced(st.spec, p);
        const spec = { ...st.spec, layouts: { ...st.spec.layouts, cover: patch.value as never } };
        n++;
        const errs = S.checkSpec({ ...spec, name: 'mine-test' }).errors.filter((e) => /The last rule of layouts\./.test(e));
        if (errs.length) failed.push(`edit:${st.spec.name}:${p}`);
      }
    }
    return { n, failed };
  }, PLACES);
  console.log('MATRIX', r.n, 'checked; failed:', JSON.stringify(r.failed));
  expect(r.n).toBeGreaterThan(3);
  expect(r.failed).toEqual([]);
});

test('withFallback: a well-formed list is unchanged, a list that ends in a "when" gets a fallback, the input is not mutated', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const L = await import('/src/reference/layoutRules.ts');
    const B = await import('/src/reference/blank.ts');
    const C = await import('/src/carousel/render.ts');
    const good = [{ use: 'a', when: { photo: true } }, { use: 'b' }];
    const same = L.withFallback(good, 'z');
    const bad = [{ use: 'a', when: { photo: true } }, { use: 'b', when: { headlineWordsMax: 9 } }];
    const frozen = JSON.stringify(bad);
    const fixed = L.withFallback(bad, 'z');
    const blank = B.blankStyle();
    const before = JSON.stringify(blank.layouts);
    const norm = L.normaliseLayouts(blank.layouts);
    const builtIn = C.getStyles().styles.map((s) => JSON.stringify(L.normaliseLayouts(s.spec.layouts)) === JSON.stringify(s.spec.layouts));
    const broken = { ...blank.layouts, cover: [{ use: 'cover-photo-full', when: { photo: true } }, { use: 'cover-stack', when: { headlineWordsMax: 9 } }] };
    const nb = L.normaliseLayouts(broken as never);
    return { sameRef: same === good || JSON.stringify(same) === JSON.stringify(good), fixed, mutated: JSON.stringify(bad) !== frozen, empty: L.withFallback([], 'z'), blankSame: JSON.stringify(norm) === before, blankUntouched: JSON.stringify(blank.layouts) === before, builtIn, brokenLast: nb.cover[nb.cover.length - 1], brokenInputKept: broken.cover.length === 2 };
  });
  expect(r.sameRef).toBe(true);
  expect(r.fixed).toEqual([{ use: 'a', when: { photo: true } }, { use: 'b', when: { headlineWordsMax: 9 } }, { use: 'z' }]);
  expect(r.mutated).toBe(false);
  expect(r.empty).toEqual([{ use: 'z' }]);
  expect(r.blankSame, 'the base style layouts are already well-formed: unchanged').toBe(true);
  expect(r.blankUntouched).toBe(true);
  expect(r.builtIn.every(Boolean), 'every built-in style is unchanged by the normaliser').toBe(true);
  expect(r.brokenLast).toEqual({ use: 'cover-stack' });
  expect(r.brokenInputKept).toBe(true);
});
