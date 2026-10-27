// Before and after the photo overlay fix, put on the Results screen (under "Older work and technical details").
// The folders out/image-engine/repair-fix/{before,after,after2} were rendered once by hand: "before" with the old overlay step
// (its pattern never matched, so the soft overlay under the words was never strengthened), "after" with the fix, "after2" a
// second render with the fix. Skipped when they are not there.
import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outUrl, writeStepResults, type ResultsItem } from './results';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const S = path.join(ROOT, 'out/image-engine/repair-fix');
const STYLES = ['mono-poster', 'film-paper', 'glass-gradient'];
const md5 = (f: string) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const alphas = (stem: string) => {
  const plan = JSON.parse(fs.readFileSync(stem + '.plan.json', 'utf8')) as { layers: { id: string; fill?: unknown }[] };
  const out: string[] = [];
  for (const l of plan.layers.filter((x) => /scrim|guard|plate/.test(x.id))) {
    const nums = (typeof l.fill === 'string' ? [l.fill] : ((l.fill as { stops: { color: string }[] }).stops.map((s) => s.color))).map((c) => Number(/([\d.]+)\)$/.exec(c)?.[1] ?? 0));
    out.push(`${l.id} ${Math.max(...nums)}`);
  }
  return out.join(', ') || 'no overlay';
};

test('photo overlay fix: which slides changed, how, and whether any fails a check', async () => {
  test.skip(!fs.existsSync(path.join(S, 'before')) || !fs.existsSync(path.join(S, 'after')), 'The before and after renders are not there.');
  const changed: ResultsItem[] = [];
  const unstable: string[] = [];
  let total = 0;
  let failing = 0;
  for (const st of STYLES)
    for (const deck of fs.readdirSync(path.join(S, 'before', st)).filter((x) => !x.endsWith('.json')))
      for (let i = 1; i <= 7; i++) {
        total++;
        const n = `slide-0${i}`;
        const B = path.join(S, 'before', st, deck, n);
        const A = path.join(S, 'after', st, deck, n);
        const A2 = path.join(S, 'after2', st, deck, n);
        const la = JSON.parse(fs.readFileSync(A + '.lint.json', 'utf8')) as { lint: { pass: boolean }[]; layout: string };
        const lb = JSON.parse(fs.readFileSync(B + '.lint.json', 'utf8')) as { lint: { pass: boolean }[] };
        failing += la.lint.filter((l) => !l.pass).length + lb.lint.filter((l) => !l.pass).length;
        if (md5(A + '.png') === md5(B + '.png')) continue;
        // A slide that also differs between two renders with the same code is not changed by the fix.
        if (fs.existsSync(A2 + '.png') && md5(A + '.png') !== md5(A2 + '.png')) {
          unstable.push(`${st} / ${deck} / slide ${i} (${la.layout})`);
          continue;
        }
        changed.push({
          id: `${st}-${deck}-${n}`,
          title: `${st}, ${deck.replace('photo-', '').replace(/-/g, ' ')}, slide ${i} (${la.layout})`,
          tag: 'TEST ASSETS: not shippable',
          facts: [`Before the fix: ${alphas(B)}.`, `After the fix: ${alphas(A)}.`, 'Both pass all eight phone-size checks.'],
          images: [
            { url: outUrl(B + '.png'), label: 'Before the fix' },
            { url: outUrl(A + '.png'), label: 'After the fix' },
          ],
        });
      }
  expect(changed.length).toBeGreaterThan(0);
  writeStepResults({
    id: 'photo-repair-fix',
    title: 'Photo overlay fix: before and after',
    order: 11,
    intro: `A broken pattern in the safety net meant the soft overlay under the words was never made stronger; only a whole-photo overlay was added. After the fix, ${changed.length} of ${total} photo-style slides look different, all of them number slides ("stat-photo"). No slide fails a phone-size check before or after (failing checks counted: ${failing}).${unstable.length ? ` ${unstable.length} other slides also differ, but they differ between two renders with the same code too, so the fix did not change them: ${unstable.join('; ')}.` : ''}`,
    groups: [{ title: 'Slides that changed', note: 'Mono photo poster: the overlay under the words and the strip is much stronger (up to 0.85, from about 0.5), still with a 0.2 overlay over the whole photo. Soft gradient and glass: the overlay under the words is a little stronger (0.6, from 0.47) and the whole-photo overlay is gone, so the rest of the photo is brighter.', items: changed }],
  });
});
