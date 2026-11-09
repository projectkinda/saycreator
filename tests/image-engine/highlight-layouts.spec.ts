// A highlight that is in the text is drawn on every layout that has a title to mark (it used to reach the drawing only through the layouts that read it themselves).
// ZERO model calls: the layouts are built directly.
import { expect, test } from '@playwright/test';

const CASES: [string, Record<string, unknown>, string][] = [
  ['step-numeral', { step: '2', title: 'Ask what success looks like', body: 'Get one sentence the client would be happy to read in three months.', accent: ['success'] }, 'success'],
  ['statement', { headline: 'Stop storing your life in your head', accent: ['life'] }, 'life'],
  ['split-text', { headline: 'Your brain does not hold things', paragraph: 'It keeps things running all day.', accent: ['brain'] }, 'brain'],
  ['big-stat', { number: '73%', label: 'of briefs miss the goal', accent: ['briefs'] }, 'briefs'],
  ['checklist', { title: 'Before you hit send', items: ['Name the goal', 'Name the owner', 'Name the date'], accent: ['send'] }, 'send'],
  ['comparison', { title: 'Myth and fact', leftLabel: 'Myth', leftText: 'More is better', rightLabel: 'Fact', rightText: 'Less is better', accent: ['fact'] }, 'fact'],
  ['quote', { quote: 'Clear beats clever every time', author: 'An editor', accent: ['Clear'] }, 'clear'],
  ['cta-button', { headline: 'Send this to your next client', button: 'Follow for more', accent: ['client'] }, 'client'],
];

test('a highlight in the text is drawn on step-numeral, statement, split-text, big-stat, checklist, comparison, quote and cta-button (marker style and text-colour style)', async ({ page }) => {
  await page.goto('/images/carousel');
  const out = await page.evaluate(async (cases) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const res: { layout: string; style: string; ok: boolean; marked: boolean; words: string[] }[] = [];
    for (const preset of ['hot-flat', 'dark-quiet']) {
      const base: any = D.styleFromPack(PR.presetPackFor(preset, false)).style;
      for (const [layout, fields, phrase] of cases) {
        const b: any = await L.buildSlide(layout, 0, fields, base, { handle: '@maya', index: 1, total: 7, cut: 'plain' });
        const texts = (b.layers ?? []).filter((l: any) => l.kind === 'text');
        const hit = texts.filter((l: any) => l.highlight || (l.runs && l.runs.length));
        const words = hit.flatMap((l: any) => (l.highlight?.words ?? (l.runs ?? []).map((r: any) => String(l.text).slice(r.start, r.end)))).map((w: string) => w.toLowerCase());
        res.push({ layout, style: preset, ok: !!b.ok, marked: words.some((w: string) => w.includes(phrase.toLowerCase())), words });
      }
    }
    return res;
  }, CASES);
  for (const r of out) {
    expect(r.ok, `${r.layout} in ${r.style} draws`).toBe(true);
    expect(r.marked, `${r.layout} in ${r.style}: the highlight is drawn (marked: ${r.words.join(', ') || 'nothing'})`).toBe(true);
  }
});

test('a highlight that is not in the text draws nothing and breaks nothing; no highlight chosen changes nothing on step-numeral', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const st: any = D.styleFromPack(PR.presetPackFor('hot-flat', false)).style;
    const f = { step: '2', title: 'Ask what success looks like', body: 'Get one sentence.' };
    const a: any = await L.buildSlide('step-numeral', 0, { ...f, accent: ['zebra'] }, st, { handle: '@maya', index: 1, total: 7, cut: 'plain' });
    const b: any = await L.buildSlide('step-numeral', 0, f, st, { handle: '@maya', index: 1, total: 7, cut: 'plain' });
    const marked = (x: any) => (x.layers ?? []).some((l: any) => l.kind === 'text' && (l.highlight || (l.runs && l.runs.length)));
    return { aOk: !!a.ok, aMarked: marked(a), bOk: !!b.ok, bMarked: marked(b) };
  });
  expect(r.aOk && r.bOk).toBe(true);
  expect(r.aMarked, 'a phrase that is not there marks nothing').toBe(false);
  expect(r.bMarked, 'no phrase chosen: nothing is added on this layout').toBe(false);
});
