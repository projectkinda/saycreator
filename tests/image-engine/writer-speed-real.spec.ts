// Round 16 B: REAL writer calls through the app's own path (designLibraryDeck -> provider.write -> /__carousel/write -> the Claude Code command line). Skipped unless REAL_WRITER=1 (it spends real model calls).
// 5 runs with the command line's own default effort and 5 with the lowest effort it supports (`--effort low`, checked with `claude --help`), alternating so drift in the service hits both alike.
// At most 10 real writer calls in total: the provider wrapper refuses an 11th (a retry counts). Output: out/round-16/writer-speed-runs.md and .json
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(30 * 60_000);
test.skip(process.env.REAL_WRITER !== '1', 'set REAL_WRITER=1 to run real writer calls (10 at most)');
const OUT = 'out/round-16';
const REP = process.env.REPORT_FILE ?? 'out/reports/report-real-editorial.json';

test('writer speed: default effort vs low effort, same text, same style (dark-quiet)', async ({ page }) => {
  const rep = JSON.parse(fs.readFileSync(REP, 'utf8'));
  await page.goto('/images/carousel');
  const rows: any[] = [];
  const order = ['default', 'low', 'default', 'low', 'default', 'low', 'default', 'low', 'default', 'low'];
  let total = 0;
  for (const mode of order) {
    if (total >= 10) break;
    const r: any = await page.evaluate(async ({ text, mode, budget }) => {
      const D: any = await import('/src/carousel/designLibrary.ts');
      const W: any = await import('/src/carousel/writer.ts');
      const PR: any = await import('/src/carousel/presets.ts');
      const R: any = await import('/src/reference/report.ts');
      const providers: any[] = await W.detectProviders();
      const real = providers.find((p) => p.id === 'dev-cli');
      if (!real) return { error: 'no dev-cli writer' };
      W.setWriterEffort(mode === 'low' ? 'low' : null);
      let calls = 0;
      const provider = { ...real, async write(...a: any[]) { if (calls >= budget) throw new Error('call budget used'); calls++; return real.write(...a); } };
      const t0 = performance.now();
      let res: any, err = '';
      try {
        res = await D.designLibraryDeck({ text, slides: 7, tone: 'clear', format: 'carousel', styleChoice: 'dark-quiet', styles: [] }, { pack: PR.presetPackFor('dark-quiet', false), hasPhoto: false, images: [] }, '@maya.designs', provider, new AbortController().signal);
      } catch (e: any) { err = String(e?.message ?? e); }
      W.setWriterEffort(null);
      if (!res) return { calls, error: err, seconds: Math.round((performance.now() - t0) / 100) / 10 };
      const lib = res.designed.library;
      const slideTexts = Object.keys(res.designed.slides).sort((a, b) => +a - +b).map((i) => R.visibleTextOf(res.designed.slides[i].built.layers));
      const wc = R.wordingCheckOf(text, slideTexts);
      const fns = R.fieldsNotInSourceOf(text, lib.plan.specs);
      return { calls, writes: lib.writes, seconds: lib.seconds, valid: true, matchPercent: wc.matchPercent, wordsNotInSource: wc.wordsNotInSource.length, fieldsNotInSource: fns.length, layouts: lib.layouts };
    }, { text: rep.sourceText, mode, budget: 10 - total });
    total += r.calls ?? 0;
    rows.push({ mode, ...r });
    console.log('RUN', mode, JSON.stringify({ calls: r.calls, seconds: r.seconds, error: r.error, match: r.matchPercent }));
    if (r.error && /no dev-cli/.test(r.error)) break;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/writer-speed-runs.json`, JSON.stringify(rows, null, 1));
  const line = (x: any, i: number) => {
    const w = (x.writes ?? [])[0] ?? {};
    return `| ${i + 1} | ${x.mode === 'low' ? 'low' : 'default'} | ${x.error ? 'FAILED: ' + String(x.error).slice(0, 60) : (w.seconds ?? x.seconds)} | ${w.outputTokens ?? '-'} | ${w.inputTokens ?? '-'} | ${w.numTurns ?? '-'} | ${w.durationApiMs ?? '-'} | ${w.promptChars ?? '-'} chars / ${w.promptBytes ?? '-'} B (body ${w.requestBytes ?? '-'} B) | ${x.valid ? 'yes' : 'no'} | ${x.matchPercent ?? '-'} | ${x.fieldsNotInSource ?? '-'} | ${x.calls} |`;
  };
  fs.writeFileSync(`${OUT}/writer-speed-runs.md`, ['# Writer speed: default effort vs --effort low (real calls, dev-cli, haiku, dark-quiet)', '', `Text: sourceText of ${REP} (${rep.sourceText.length} characters). Each row is one run of the app's own path (designLibraryDeck -> provider.write -> /__carousel/write). Alternating default / low.`, '', '| run | effort | seconds | output tokens | input tokens | num_turns | duration_api_ms | prompt sent | JSON valid | wording match % | fieldsNotInSource | writer calls |', '|---|---|---|---|---|---|---|---|---|---|---|---|', ...rows.map(line), ''].join('\n'));
  expect(total).toBeLessThanOrEqual(10);
});
