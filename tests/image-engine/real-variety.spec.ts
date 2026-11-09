// REAL writer variety run (skipped unless REAL_VARIETY=1): 4 raw-text topics x 3 presets (style-1, style-4, style-6) = 12 carousels through the dev server's real writer (dev-cli, no API key).
// Measurement only: no app code is changed. Per run: out/real-run/<topic>-<preset>.png (contact sheet), .json (everything recorded); the last test writes out/real-run/report.md.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.skip(!process.env.REAL_VARIETY, 'real model run only when REAL_VARIETY=1');
test.describe.configure({ mode: 'default' }); // was 'serial': one failing test used to skip every test after it in the file; the tests here do not share state
test.setTimeout(8 * 60_000);
const OUT = path.resolve(process.cwd(), process.env.REAL_OUT ?? 'out/real-run');

const TOPICS: Record<string, { title: string; handle: string; text: string }> = {
  A: {
    title: 'How to prepare for a design interview',
    handle: '@maya.designs',
    text: `Most designers walk into an interview with a portfolio and no plan. Here is how I prepare, step by step. First, pick two projects, not six. Choose the ones where you can explain the problem, your decision and the result in under three minutes each. Second, write the story of each one in plain words: what was broken, what you tried, what you shipped, what changed. Third, research the company. Use the product for an hour, write down three things that confuse you and one idea to fix each. Fourth, practise the whiteboard task out loud with a friend, because thinking out loud is a skill and it fades fast. Fifth, prepare five questions for them: how decisions get made, who reviews your work, what success looks like after six months. Finally, the night before, stop. Print your two case studies, pack your charger, sleep. You will remember far more of your own story than you think, and calm beats clever every time.`,
  },
  B: {
    title: 'Freelancing vs a full-time job',
    handle: '@maya.designs',
    text: `I have done both, so here is the honest comparison. A full-time job gives you a steady salary, health insurance, paid leave and colleagues to learn from. You rarely think about invoices, taxes or where the next project comes from. The cost is control: someone else sets your priorities, your hours are fixed, and your income has a ceiling that moves in small yearly steps. Freelancing flips almost all of it. You choose your clients, your rates and your schedule, and a good month can pay double a salary. But the income is uneven, you carry your own insurance and taxes, and you spend a surprising share of the week on sales, contracts and chasing payments instead of designing. Freelancing suits people who like variety and can handle uncertainty. A job suits people who want stability and a team. Neither is better; they reward different habits.`,
  },
  C: {
    title: 'Remote work, in numbers',
    handle: '@workweekly',
    text: `Remote work is no longer a perk, it is a default for many teams, and the numbers show why. In a survey of 2,500 knowledge workers last year, 68% said they would take a pay cut of up to 10% to keep working from home. Commuting steals an average of 54 minutes a day, which adds up to about 220 hours a year. Companies report that office space costs them roughly $11,000 per employee annually. And yet 31% of managers still say they trust people more when they can see them. One engineering lead told me, "I stopped counting hours at desks and started counting what shipped. My team shipped more in the first quarter after we went remote than in the two before it." The lesson is not that everyone should stay home. It is that trust, clear goals and written communication matter more than where the chair is.`,
  },
  D: {
    title: 'Why we stopped writing long meeting notes',
    handle: '@teamcraft',
    text: `For years our team wrote long meeting notes. Every call produced a page of bullet points that nobody opened again. We assumed the notes were the point. They were not. The point was the decisions, and decisions got buried under the discussion that led to them.

So we ran an experiment. For one quarter, every meeting ended with exactly three lines: what we decided, who owns the next step, and by when. Nothing else was allowed in the document. People complained at first because it felt like losing the story of the meeting. But within a month something changed. Follow-ups got faster, because the owner was named in writing. Repeated debates dropped, because the decision was easy to find and quote.

The deeper lesson was about attention. A long note asks the reader to do the summarising. A short note forces the writer to do it, while the meeting is still fresh. That small shift moved the work to the person who had the most context, which is exactly where it belongs.

We still keep the recording for anyone who wants the full story. Almost nobody does. They read the three lines, they know what to do, and they get on with their day.`,
  },
};
const PRESETS = ['style-1', 'style-4', 'style-6'];
const RUNS = Object.keys(TOPICS).flatMap((t) => PRESETS.map((p) => ({ topic: t, preset: p })));

for (const run of RUNS) {
  test(`real run ${run.topic} on ${run.preset}`, async ({ page }) => {
    const T = TOPICS[run.topic];
    await page.goto('/images/carousel');
    const r = await page.evaluate(async ({ T, preset }) => {
      const W = await import('/src/carousel/writer.ts');
      const D = await import('/src/carousel/designLibrary.ts');
      const PR = await import('/src/carousel/presets.ts');
      const F = await import('/src/reference/faithful.ts');
      const providers = await W.detectProviders();
      const real = providers[0];
      if (!real) throw new Error('no writer available on this server');
      const log: { ms: number; usage?: { input: number; output: number }; promptChars: number; answerChars: number }[] = [];
      const p = { ...real, async write(prompt: string, signal: AbortSignal, kind?: 'write' | 'draw', images?: any) { const a = await real.write(prompt, signal, kind, images); log.push({ ms: Math.round(a.ms), usage: a.usage, promptChars: prompt.length, answerChars: a.text.length }); return a; } };
      const pack = PR.presetPackFor(preset, false);
      const t0 = performance.now();
      const out = await D.designLibraryDeck({ text: T.text, slides: 7, tone: 'clear', format: 'carousel', styleChoice: preset, styles: [] }, { pack: pack as any }, T.handle, p as any, new AbortController().signal);
      const wall = Math.round((performance.now() - t0) / 100) / 10;
      const lib: any = out.designed.library;
      const ids = Object.keys(out.designed.slides).sort((a, b) => Number(a) - Number(b));
      const bms: ImageBitmap[] = [];
      for (const id of ids) bms.push(await createImageBitmap(await F.svgToPng((out.designed.slides as any)[id].built.svg, 1080)));
      const w = 300, h = 375;
      const c = document.createElement('canvas');
      c.width = bms.length * (w + 10) + 10;
      c.height = h + 20;
      const g = c.getContext('2d')!;
      g.fillStyle = '#888';
      g.fillRect(0, 0, c.width, c.height);
      bms.forEach((u, i) => g.drawImage(u, 10 + i * (w + 10), 10, w, h));
      const specs = (lib.plan?.specs ?? []) as { layout: string; fields: Record<string, unknown> }[];
      return {
        wall,
        slides: ids.length,
        layouts: lib.layouts as string[],
        variants: lib.variants as number[],
        cuts: lib.cuts as string[],
        inverts: lib.inverts as string[],
        calls: lib.calls as number,
        tokens: lib.tokens as { input: number; output: number } | null,
        perCall: log,
        retries: lib.retries,
        fallbacks: lib.fallbacks,
        trims: lib.trims ?? [],
        adjustments: lib.codeAdjustments,
        flavour: lib.flavour ?? null,
        notes: out.designed.notes,
        warnings: out.warnings,
        fields: specs.map((s) => Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, Array.isArray(v) ? v.join(' | ') : String(v)]))),
        sheet: c.toDataURL('image/png').split(',')[1],
      };
    }, { T, preset: run.preset });
    fs.mkdirSync(OUT, { recursive: true });
    const name = `${run.topic}-${run.preset}`;
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.sheet, 'base64'));
    fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ topic: run.topic, title: T.title, preset: run.preset, ...r, sheet: undefined }, null, 1));
    console.log('REAL ' + name + ' ' + JSON.stringify({ slides: r.slides, calls: r.calls, tokens: r.tokens, wall: r.wall, layouts: r.layouts }));
    expect(r.slides).toBeGreaterThanOrEqual(5);
  });
}

test('report.md', async () => {
  const rows = RUNS.map((r) => ({ ...r, ...JSON.parse(fs.readFileSync(path.join(OUT, `${r.topic}-${r.preset}.json`), 'utf8')) }));
  let md = '# Real-writer variety run\n\nWriter: the dev server\'s real route (dev-cli, no API key). 12 carousels: 4 topics x 3 presets, 7 slides asked for each. Token counts from dev-cli include its own overhead (system prompt, tools, cache reads), so they are inflated.\n\n';
  md += '## One row per carousel: layout (variant) per slide\n\n| Topic | Preset | Slides | Calls | Tokens in/out | Seconds | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) {
    const cells = Array.from({ length: 8 }, (_, i) => (r.layouts[i] ? `${r.layouts[i]} (v${r.variants[i]})` : ''));
    md += `| ${r.topic} ${r.title} | ${r.preset} | ${r.slides} | ${r.calls} | ${r.tokens ? r.tokens.input + '/' + r.tokens.output : 'n/a'} | ${r.wall} | ${cells.join(' | ')} |\n`;
  }
  md += '\n## Retries, fallbacks, trims, flavour swaps\n\n';
  for (const r of rows) {
    const bits = [
      ...(r.retries ?? []).map((q: any) => `retry slide ${q.slide}: ${q.reasons.join('; ')}`),
      ...(r.fallbacks ?? []).map((q: any) => `fallback slide ${q.slide} (${q.level}): ${q.reason}`),
      ...(r.trims ?? []).map((q: any) => `trim slide ${q.slide}: ${q.field} ${q.from.length} -> ${q.to.length} chars`),
      ...((r.flavour?.swaps ?? []) as any[]).map((q) => `flavour swap slide ${q.slide}: ${q.from} -> ${q.to}`),
    ];
    md += `- ${r.topic}-${r.preset}: ${bits.length ? bits.join(' / ') : 'none'}\n`;
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  expect(rows.length).toBe(12);
});
