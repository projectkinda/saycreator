// Round 18 F5: REAL writer calls through the app's own path (designLibraryDeck -> provider.write -> /__carousel/write -> the Claude Code command line), the same text and style twice:
// once WITH four named pictures (609x757, 1402x1313, 1107x2400, 2400x1230: the writer is told only their metadata and names, never pixels) and once with none. Skipped unless REAL_WRITER=1.
// At most 4 real calls in total (the wrapper refuses a 5th; a retry counts). Output: out/round-18/writer-with-pictures.md and .json
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(10 * 60_000);
test.skip(process.env.REAL_WRITER !== '1', 'set REAL_WRITER=1 to run real writer calls (4 at most)');
const OUT = 'out/round-18';
const REP = process.env.REPORT_FILE ?? 'out/reports/report-real-editorial.json';

test('writer with four pictures vs without (real calls)', async ({ page }) => {
  const rep = JSON.parse(fs.readFileSync(REP, 'utf8'));
  await page.goto('/images/carousel');
  const rows: any[] = [];
  let total = 0;
  for (const mode of ['pictures', 'none']) {
    const r: any = await page.evaluate(async ({ text, mode, budget }) => {
      const D: any = await import('/src/carousel/designLibrary.ts');
      const W: any = await import('/src/carousel/writer.ts');
      const PR: any = await import('/src/carousel/presets.ts');
      const R: any = await import('/src/reference/report.ts');
      const FA: any = await import('/src/reference/faithful.ts');
      FA.setPictureResolver(async () => 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#888"/></svg>'));
      const providers: any[] = await W.detectProviders();
      const real = providers.find((p) => p.id === 'dev-cli');
      if (!real) return { error: 'no dev-cli writer' };
      W.setWriterEffort(null);
      let calls = 0;
      const provider = { ...real, async write(...a: any[]) { if (calls >= budget) throw new Error('call budget used'); calls++; return real.write(...a); } };
      const images = mode === 'pictures'
        ? [['p1', 609, 757, 'text box'], ['p2', 1402, 1313, 'style step'], ['p3', 1107, 2400, 'phone'], ['p4', 2400, 1230, 'slides step']].map(([id, width, height, label]) => ({ id, width, height, content: 'screenshot', label }))
        : [];
      const t0 = performance.now();
      let res: any, err = '';
      try {
        res = await D.designLibraryDeck({ text, slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'dark-quiet', styles: [] }, { pack: PR.presetPackFor('dark-quiet', false), hasPhoto: images.length > 0, images }, '@maya.designs', provider, new AbortController().signal);
      } catch (e: any) { err = String(e?.message ?? e); }
      const wall = Math.round((performance.now() - t0) / 100) / 10;
      if (!res) return { calls, error: err, wall };
      const lib = res.designed.library;
      const slideTexts = Object.keys(res.designed.slides).sort((a, b) => +a - +b).map((i) => R.visibleTextOf(res.designed.slides[i].built.layers));
      const wc = R.wordingCheckOf(text, slideTexts);
      const pictureSlides = lib.plan.specs.map((s: any, i: number) => (Object.keys(s.fields).some((k) => /^image\d?$/.test(k)) ? `${i + 1}:${s.layout}${s.named ? '*' : ''}` : null)).filter(Boolean);
      return { calls, wall, writes: lib.writes, seconds: lib.seconds, valid: true, matchPercent: wc.matchPercent, layouts: lib.layouts, pictureSlides, hints: lib.plan.specs.map((s: any) => s.hint ?? null), retries: lib.retries ?? [] };
    }, { text: rep.sourceText, mode, budget: 4 - total });
    total += r.calls ?? 0;
    rows.push({ mode, ...r });
    console.log('RUN', mode, JSON.stringify({ calls: r.calls, seconds: r.seconds, error: r.error }));
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/writer-with-pictures.json`, JSON.stringify(rows, null, 1));
  const line = (x: any) => {
    const w = (x.writes ?? [])[0] ?? {};
    return `| ${x.mode === 'pictures' ? 'with 4 named pictures' : 'no pictures'} | ${x.error ? 'FAILED: ' + String(x.error).slice(0, 60) : (w.seconds ?? x.seconds ?? x.wall)} | ${w.requestBytes ?? '-'} B (prompt ${w.promptBytes ?? '-'} B) | ${w.inputTokens ?? '-'} | ${w.outputTokens ?? '-'} | ${w.numTurns ?? '-'} | ${w.durationApiMs ?? '-'} | ${x.valid ? 'yes' : 'no'} | ${x.matchPercent ?? '-'} | ${x.calls} |`;
  };
  fs.writeFileSync(`${OUT}/writer-with-pictures.md`, ['# Writer with pictures vs without (real calls, dev-cli, haiku, dark-quiet, default effort)', '', `Text: sourceText of ${REP} (${rep.sourceText.length} characters), seven slides, the same style both times. Each row is one run of the app's own path.`, '', '| run | seconds | requestBytes | input tokens | output tokens | num_turns | duration_api_ms | JSON valid | wording match % | writer calls |', '|---|---|---|---|---|---|---|---|---|---|', ...rows.map(line), ''].join('\n'));
  expect(total).toBeLessThanOrEqual(4);
});
