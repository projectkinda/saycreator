// The deterministic trim of optional one-line texts (kicker, caption, source, note ...): over the limit by 20% or less -> cut at a word boundary, drop a dangling and/of/the/with,
// keep it only when 60% of the text survives; required fields (headline, title) and anything else still go to the retry. No model call for a kicker one character long.
import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('trimAtWord: word boundary, dangling words, the 20% and 60% rules', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    return {
      boundary: D.trimAtWord('Kickstarter project launch', 24), // 26 chars
      one: D.trimAtWord('Kickstarter project now live', 24), // 28 chars (over by 4)
      dangling: D.trimAtWord('Early backers save with the', 24), // 27 chars: "Early backers save with" then the dangling words go
      dangling2: D.trimAtWord('Backers get hoodie and the', 24),
      over20: D.trimAtWord('Kickstarter project now live today', 24), // 34 chars: over by more than 20%
      under60: D.trimAtWord('Hi Kickstarterprojectlaunches', 24), // only "Hi" would survive
      fits: D.trimAtWord('Short kicker', 24),
      oneWord: D.trimAtWord('Kickstarterlaunchedtodayyy', 24), // no boundary
      exact: D.trimAtWord('Kickstarter project! Hello', 24),
    };
  });
  expect(r.boundary).toBe('Kickstarter project');
  expect(r.one).toBe('Kickstarter project now');
  expect(r.dangling).toBe('Early backers save');
  expect(r.dangling2).toBe('Backers get hoodie');
  expect(r.over20, 'over by more than 20%: the retry decides').toBeNull();
  expect(r.under60, 'under 60% would survive: the retry decides').toBeNull();
  expect(r.fits).toBeNull();
  expect(r.oneWord).toBeNull();
  expect(r.exact).toBe('Kickstarter project!');
});

test('a writer answer with a kicker one character over is trimmed with no retry; a headline over its limit still goes to the retry', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const P = await import('/src/carousel/presets.ts');
    const pack = P.presetPackFor('hot-flat', false);
    const slide = (n: number, over: boolean, longHead: boolean) => ({ layout: n % 2 ? 'statement' : 'big-stat', fields: n % 2 ? { kicker: over ? 'Kickstarter project live' + 'x' : 'Kickstarter project', headline: longHead ? 'A hoodie that flips into a backpack in ten seconds flat, every time' : 'A hoodie that flips', caption: 'One piece. Two jobs.' } : { number: '10', label: 'seconds to flip it', source: 'Measured in our workshop, twice' } });
    const deck = (over: boolean, longHead: boolean) => JSON.stringify({ title: 'T', slides: [slide(1, over, longHead), { layout: 'big-stat', fields: { number: '10', label: 'seconds to flip it', source: 'Measured in our workshop' } }, { layout: 'checklist', fields: { title: 'What you get', items: ['Waterproof shell', 'Fits a laptop', 'Machine washable'] } }, { layout: 'quote', fields: { quote: 'I stopped carrying a bag.', author: 'An early backer' } }, { layout: 'stepper', fields: { title: 'How to flip it', steps: ['Zip', 'Fold', 'Pull'] } }, { layout: 'stat-bar', fields: { number: '30%', label: 'off for early backers', bar: '30' } }, { layout: 'split-text', fields: { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood.' } }, { layout: 'cta-button', fields: { headline: 'Back it today', button: 'Back it now' } }] });
    const run = async (answer: string, retryAnswer: string) => {
      let calls = 0;
      const provider: any = { id: 'dev-cli', label: 'fake', async write() { calls++; return { text: calls === 1 ? answer : retryAnswer, ms: 1 }; } };
      const r = await D.designLibraryDeck({ text: 'x '.repeat(60), slides: 8, tone: 'clear', format: 'carousel', styleChoice: 'a', styles: [] } as any, { pack, hasPhoto: false }, '@h', provider, new AbortController().signal);
      return { calls, trims: r.designed.library!.trims ?? [], adj: r.designed.library!.codeAdjustments.filter((a: string) => /trimmed/.test(a)), kicker: (r.designed.library!.plan!.specs[0].fields as any).kicker, retries: r.designed.library!.retries };
    };
    const kickerOver = await run(deck(true, false), '{}');
    const headOver = await run(deck(false, true), JSON.stringify({ slides: { '1': { layout: 'statement', fields: { headline: 'A hoodie that flips', caption: 'One piece.' } } } }));
    return { kickerOver, headOver };
  });
  expect(r.kickerOver.calls, 'no retry for a kicker one character over').toBe(1);
  expect(r.kickerOver.trims.length).toBe(1);
  expect(r.kickerOver.kicker).toBe('Kickstarter project');
  expect(r.kickerOver.adj.length).toBe(1);
  expect(r.kickerOver.adj[0]).toContain('trimmed to "Kickstarter project"');
  expect(r.kickerOver.retries).toEqual([]);
  expect(r.headOver.calls, 'a headline over its limit is asked for again').toBe(2);
  expect(r.headOver.trims).toEqual([]);
});
