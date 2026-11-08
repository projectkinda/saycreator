// REAL writer run 3 (skipped unless REAL_VARIETY3=1): the presets and layouts the first two runs did not reach. 8 carousels through the dev server's real writer (dev-cli, no API key):
// style-7 on E, B, F, C; style-8 on F, C, E; style-7 on B once more with 2 flat generated landscape test pictures supplied (metadata only goes to the writer; the code places the pictures).
// Measurement only: no app code is changed. Outputs: out/real-run-3/<topic>-<preset>[-pics].png/.json and report.md.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.skip(!process.env.REAL_VARIETY3, 'real model run only when REAL_VARIETY3=1');
test.describe.configure({ mode: 'serial' });
test.setTimeout(8 * 60_000);
const OUT = path.resolve(process.cwd(), process.env.REAL_OUT ?? 'out/real-run-3');

const TOPICS: Record<string, { title: string; handle: string; text: string }> = {
  E: {
    title: 'Northbeam launch: two actions and contact details',
    handle: '@northbeam',
    text: `Northbeam 2.0 is live. We rebuilt our reporting tool from scratch so small teams can see where every marketing dollar goes, without a data analyst. The new dashboard connects to your ad accounts in about five minutes, and it explains each number in plain language instead of leaving you with a chart you have to decode. Early customers cut their weekly reporting time from six hours to under one. We are opening the first 200 spots this month. If you want to see it with your own data, book a demo with our team and we will set it up live on a 20-minute call. If you would rather read first, download the guide: it walks through the five reports every small team should look at before spending another dollar. Questions before you decide? Reach us at hello@northbeam.io, find us at northbeam.io, or message @northbeam on any platform. We answer within a day.`,
  },
  B: {
    title: 'Freelancing vs a full-time job',
    handle: '@maya.designs',
    text: `I have done both, so here is the honest comparison. A full-time job gives you a steady salary, health insurance, paid leave and colleagues to learn from. You rarely think about invoices, taxes or where the next project comes from. The cost is control: someone else sets your priorities, your hours are fixed, and your income has a ceiling that moves in small yearly steps. Freelancing flips almost all of it. You choose your clients, your rates and your schedule, and a good month can pay double a salary. But the income is uneven, you carry your own insurance and taxes, and you spend a surprising share of the week on sales, contracts and chasing payments instead of designing. Freelancing suits people who like variety and can handle uncertainty. A job suits people who want stability and a team. Neither is better; they reward different habits.`,
  },
  F: {
    title: 'Why side projects die at month three',
    handle: '@buildinpublic.dan',
    text: `Why do most side projects die at month three? I have started eleven and finished three, so I looked for the pattern. Month one is easy: the idea is new, the evenings are free and every small win feels huge. Month two is a grind, but you can still see the finish line. Month three is where the novelty is gone, the hard parts have shown up, and a new shiny idea starts whispering that it would be so much easier. Most people do not quit because the project is bad. They quit because progress stops being visible. The fix that worked for me was boring: I shrank the goal until it fit into one weekend, shipped something ugly every two weeks, and told one friend what I would finish by Sunday. Visible progress and a tiny audience beat motivation every time.`,
  },
  C: {
    title: 'Remote work, in numbers',
    handle: '@workweekly',
    text: `Remote work is no longer a perk, it is a default for many teams, and the numbers show why. In a survey of 2,500 knowledge workers last year, 68% said they would take a pay cut of up to 10% to keep working from home. Commuting steals an average of 54 minutes a day, which adds up to about 220 hours a year. Companies report that office space costs them roughly $11,000 per employee annually. And yet 31% of managers still say they trust people more when they can see them. One engineering lead told me, "I stopped counting hours at desks and started counting what shipped. My team shipped more in the first quarter after we went remote than in the two before it." The lesson is not that everyone should stay home. It is that trust, clear goals and written communication matter more than where the chair is.`,
  },
};
const ALL_RUNS = [
  { topic: 'E', preset: 'style-7' }, { topic: 'B', preset: 'style-7' }, { topic: 'F', preset: 'style-7' }, { topic: 'C', preset: 'style-7' },
  { topic: 'F', preset: 'style-8' }, { topic: 'C', preset: 'style-8' }, { topic: 'E', preset: 'style-8' },
  { topic: 'B', preset: 'style-7', pics: true },
];
// REAL_ONLY_PICS=1 runs only the picture carousel (the fix-round check)
const RUNS = process.env.REAL_ONLY_PICS ? ALL_RUNS.filter((r) => (r as { pics?: boolean }).pics) : ALL_RUNS;
const nameOf = (r: { topic: string; preset: string; pics?: boolean }) => `${r.topic}-${r.preset}${r.pics ? '-pics' : ''}`;

for (const run of RUNS) {
  test(`real run ${nameOf(run)}`, async ({ page }) => {
    const T = TOPICS[run.topic];
    await page.goto('/images/carousel');
    const r = await page.evaluate(async ({ T, preset, pics }) => {
      const W = await import('/src/carousel/writer.ts');
      const D = await import('/src/carousel/designLibrary.ts');
      const PR = await import('/src/carousel/presets.ts');
      const F = await import('/src/reference/faithful.ts');
      const PL = await import('/src/carousel/photoLibrary.ts');
      const I = await import('/src/carousel/layouts/images.ts');
      const providers = await W.detectProviders();
      const real = providers[0];
      if (!real) throw new Error('no writer available on this server');
      // two flat generated landscape pictures (no stock): metadata only reaches the writer
      const added: { id: string; width: number; height: number }[] = [];
      if (pics) {
        const flat = async (name: string, w: number, h: number, color: string) => {
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, w, h);
          g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.2, 0, Math.PI * 2); g.fill();
          const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.9));
          return (await PL.addPicture(new File([blob], name + '.jpg', { type: 'image/jpeg' }), 'photo')).meta;
        };
        for (const m of [await flat('landscape-1', 1600, 900, '#2471a3'), await flat('landscape-2', 1500, 1000, '#c0392b')]) added.push({ id: m.id, width: m.width, height: m.height });
      }
      const log: { ms: number; usage?: { input: number; output: number }; promptChars: number; answerChars: number; mentionsPictures: boolean; hasPixels: boolean }[] = [];
      const p = { ...real, async write(prompt: string, signal: AbortSignal, kind?: 'write' | 'draw', images?: any) { const a = await real.write(prompt, signal, kind, images); log.push({ ms: Math.round(a.ms), usage: a.usage, promptChars: prompt.length, answerChars: a.text.length, mentionsPictures: /Pictures available/.test(prompt), hasPixels: /data:image|base64/.test(prompt) }); return a; } };
      const pack = PR.presetPackFor(preset, false);
      const look: any = { pack, ...(pics ? { hasPhoto: true, images: added } : {}) };
      const t0 = performance.now();
      const out = await D.designLibraryDeck({ text: T.text, slides: 7, tone: 'clear', format: 'carousel', styleChoice: preset, styles: [] }, look, T.handle, p as any, new AbortController().signal);
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
      const result = {
        wall, slides: ids.length, layouts: lib.layouts as string[], variants: lib.variants as number[], calls: lib.calls as number, tokens: lib.tokens as { input: number; output: number } | null,
        perCall: log, retries: lib.retries, fallbacks: lib.fallbacks, trims: lib.trims ?? [], adjustments: lib.codeAdjustments, flavour: lib.flavour ?? null, warnings: out.warnings,
        fields: specs.map((s) => Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, I.IMAGE_KEYS.includes(k) ? 'picture ' + (I.parseRef(String(v))?.id ?? '?') : Array.isArray(v) ? v.join(' | ') : String(v)]))),
        pictureSlots: specs.map((s, i) => ({ slide: i + 1, layout: s.layout, pictures: I.IMAGE_KEYS.filter((k: string) => s.fields[k]).map((k: string) => I.parseRef(String(s.fields[k]))?.id) })).filter((q) => q.pictures.length),
        offered: added,
        sheet: c.toDataURL('image/png').split(',')[1],
      };
      for (const m of added) await PL.removePicture(m.id);
      return result;
    }, { T, preset: run.preset, pics: !!run.pics });
    fs.mkdirSync(OUT, { recursive: true });
    const name = nameOf(run);
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.sheet, 'base64'));
    fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ topic: run.topic, title: T.title, preset: run.preset, pics: !!run.pics, ...r, sheet: undefined }, null, 1));
    console.log('REAL ' + name + ' ' + JSON.stringify({ slides: r.slides, calls: r.calls, tokens: r.tokens, wall: r.wall, layouts: r.layouts }));
    expect(r.slides).toBeGreaterThanOrEqual(5);
  });
}

test('report.md', async () => {
  test.skip(!!process.env.REAL_ONLY_PICS, 'single run');
  const rows = RUNS.map((r) => ({ ...r, ...JSON.parse(fs.readFileSync(path.join(OUT, nameOf(r) + '.json'), 'utf8')) }));
  let md = "# Real-writer run 3\n\nWriter: the dev server's real route (dev-cli, no API key). 8 carousels, 7 slides asked for each. Token counts include dev-cli's own overhead.\n\n";
  md += '| Run | Slides | Calls | Tokens in/out | Seconds | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of rows) md += `| ${nameOf(r)} | ${r.slides} | ${r.calls} | ${r.tokens ? r.tokens.input + '/' + r.tokens.output : 'n/a'} | ${r.wall} | ${Array.from({ length: 8 }, (_, i) => (r.layouts[i] ? `${r.layouts[i]} (v${r.variants[i]})` : '')).join(' | ')} |\n`;
  md += '\n## Retries, fallbacks, trims, flavour swaps\n\n';
  for (const r of rows) {
    const bits = [
      ...(r.retries ?? []).map((q: any) => `retry slide ${q.slide}: ${q.reasons.join('; ')}`),
      ...(r.fallbacks ?? []).map((q: any) => `fallback slide ${q.slide} (${q.level}): ${q.reason}`),
      ...(r.trims ?? []).map((q: any) => `trim slide ${q.slide}: ${q.field} "${q.from}" -> ${q.to}`),
      ...((r.flavour?.swaps ?? []) as any[]).map((q) => `flavour swap slide ${q.slide}: ${q.from} -> ${q.to}`),
    ];
    md += `- ${nameOf(r)}: ${bits.length ? bits.join(' / ') : 'none'}\n`;
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  expect(rows.length).toBe(RUNS.length);
});
