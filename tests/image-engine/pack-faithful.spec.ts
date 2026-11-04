// Faithful slides for packs and quote posts: all 7 slide types of a saved pack drawn as the SVG was written, long and short text, empty slots (and the block that belongs to them),
// faithful vs layers difference per design (reported), export PNG size and fonts, quote posts, Make editable, and the phone checks on slot data.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './reference-helpers';

test.setTimeout(240_000);
const OUT = path.join(ROOT, 'out/image-engine/pack');

const POS: Record<string, [string, number, number, number][]> = {
  cover: [['kicker', 80, 140, 40], ['title', 80, 1000, 90], ['body', 80, 1200, 44]],
  step: [['tag', 700, 120, 40], ['number', 80, 330, 260], ['title', 560, 300, 70], ['body', 560, 560, 44]],
  content: [['tag', 760, 140, 40], ['title', 80, 240, 64], ['body', 80, 520, 44]],
  list: [['title', 540, 160, 60], ['body', 540, 520, 46]],
  stat: [['number', 120, 760, 300], ['title', 120, 1000, 56]],
  quote: [['title', 140, 480, 70], ['caption', 140, 1160, 36]],
  cta: [['title', 80, 300, 100], ['kicker', 600, 1240, 40]],
};
const svgs = Object.keys(POS)
  .map((t, i) => {
    const slots = POS[t].map(([role, x, y, size]) => `${role === 'tag' ? `<rect id="tag-pill" x="${x - 20}" y="${y - 50}" width="300" height="70" rx="35" fill="$accent"/>` : ''}<text data-role="${role}" data-min-size="40" data-max-lines="4" x="${x}" y="${y}" font-size="${size}" font-family="Schibsted Grotesk" font-weight="700" fill="$text">${role} words</text>`).join('');
    const pal = i === 0 ? ` data-palette='{"bg":"#101820","text":"#F5F0EB","accent":"#FF8A4C","surface":"#1B2733","muted":"#9AA5B1"}'` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="${t}"${pal}><defs><linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="$surface"/><stop offset="1" stop-color="$bg"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g${i})"/><g id="motif-${t}"><circle cx="${900 - i * 90}" cy="${260 + i * 40}" r="60" fill="$accent"/></g>${slots}</svg>`;
  })
  .join('\n');

const LONG = 'A really quite long headline that goes on and on so the slot has to wrap it over several lines and keep it readable';
const SLIDES = [
  { type: 'cover', kicker: 'Habits', headline: LONG, sub: 'And a long line under it that also needs to wrap nicely onto two lines' },
  { type: 'step', number: 2, headline: 'Short', body: 'Do it.' },
  { type: 'content', headline: 'Why it works', body: LONG + '. ' + LONG },
  { type: 'checklist', headline: 'Before you post', items: ['Read it out loud', 'Cut one sentence', 'Check the first line', 'Add one example', 'Ask one friend', 'Sleep on it'] },
  { type: 'stat', kicker: 'Numbers', value: '87%', label: 'of people skim', note: 'before reading' },
  { type: 'quote', quote: 'Clear beats clever, every single time.', by: 'An editor' },
  { type: 'closing', headline: 'Save this', cta: 'Follow' },
];

test('a saved pack draws all 7 slide types faithfully: words fit, empty slots hide their block, export size and fonts, difference from the layers reported, Make editable', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/images/carousel');
  const r = await page.evaluate(
    async ([svgs, SLIDES]) => {
      const P = await import('/src/reference/pack.ts');
      const T = await import('/src/reference/templates.ts');
      const B = await import('/src/reference/blank.ts');
      const D = await import('/src/carousel/doc.ts');
      const S = await import('/src/carousel/script.ts');
      const C = await import('/src/carousel/render.ts');
      const parsed = await P.parsePack(svgs as string, 'Faithful test');
      if (!parsed.ok) return { ok: false, reasons: parsed.reasons };
      await T.ensureTemplatesLoaded();
      const tpl = await T.saveTemplate({ name: 'Faithful test', target: 'carousel', spec: { ...B.blankStyle(), name: T.styleNameFor('faithful-test') }, preview: '', pack: parsed.pack });
      const kept = { svgs: Object.keys(tpl.pack!.svgs ?? {}), metaCover: (tpl.pack!.slotMeta!.cover ?? []).map((m) => m.role) };
      const script = { ...S.EXAMPLE, slides: SLIDES };
      const doc = { ...D.emptyDoc(tpl.spec.name), script };
      const composed = C.composeDoc(doc as never);
      const small = async (b: Blob) => {
        const bm = await createImageBitmap(b);
        const c = new OffscreenCanvas(108, 135);
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(bm, 0, 0, 108, 135);
        return { data: g.getImageData(0, 0, 108, 135).data, w: bm.width, h: bm.height };
      };
      const rows = [];
      for (const [i, s] of composed.slides.entries()) {
        const fa = C.faithfulOf(s);
        const rendered = await C.renderer.render(s, composed.margin);
        const f = await small(rendered.png);
        const l = await small(await C.renderer.preview(s.plan, 0.25));
        let d = 0;
        for (let k = 0; k < f.data.length; k += 4) d += (Math.abs(f.data[k] - l.data[k]) + Math.abs(f.data[k + 1] - l.data[k + 1]) + Math.abs(f.data[k + 2] - l.data[k + 2])) / 765;
        const svg = fa?.svg ?? '';
        const tsp = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
        rows.push({
          type: s.type,
          faithful: !!fa,
          w: f.w,
          h: f.h,
          diffPct: Math.round((d / (f.data.length / 4)) * 1000) / 10,
          text: tsp.join(' '),
          hasPill: svg.includes('rx="35"'),
          fonts: [...new Set([...svg.matchAll(/font-family="([^"]+)"/g)].map((m) => m[1]))],
          sizes: [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1])),
          lint: rendered.lint.map((x) => `${x.id}:${x.pass ? 'pass' : 'FAIL'}`),
          warnings: rendered.warnings.length,
          png: await new Promise<string>((res) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result));
            fr.readAsDataURL(rendered.png);
          }),
          i,
        });
      }
      const ed = C.composeDoc({ ...doc, choices: { '2': { editable: true } } } as never).slides[2];
      const edDiff = { faithful: !!C.faithfulOf(ed), note: ed.notes.find((n: string) => n.startsWith('Made editable')) ?? '' };
      const q = C.composeDoc({ ...D.emptyDoc(tpl.spec.name), format: 'quote', script: { ...S.EXAMPLE, slides: [{ type: 'quote', quote: 'Clear beats clever, every single time.', by: 'An editor' }] } } as never);
      const qr = await C.renderer.render(q.slides[0], q.margin);
      const qb = await createImageBitmap(qr.png);
      const fontsLoaded = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))];
      return { ok: true, kept, rows, edDiff, quote: { faithful: !!C.faithfulOf(q.slides[0]), w: qb.width, h: qb.height }, fontsLoaded };
    },
    [svgs, SLIDES] as const,
  );
  expect(r.ok, JSON.stringify(r)).toBe(true);
  const res = r as Extract<typeof r, { rows: unknown }>;
  expect(res.kept.svgs.sort()).toEqual(['content', 'cover', 'cta', 'list', 'quote', 'stat', 'step']);
  expect(res.kept.metaCover).toEqual(['kicker', 'title', 'body']);
  expect(res.rows).toHaveLength(7);
  for (const row of res.rows) {
    expect(row.faithful, `${row.type} is faithful`).toBe(true);
    expect([row.w, row.h], `${row.type} export size`).toEqual([1080, 1350]);
    expect(row.fonts).toEqual(['Schibsted Grotesk']);
    for (const z of row.sizes) expect(z).toBeGreaterThanOrEqual(32);
    expect(row.lint.length).toBeGreaterThan(0);
    expect(row.warnings, 'the checks that cannot run are listed').toBe(1);
    fs.writeFileSync(path.join(OUT, `faithful-${row.i + 1}-${row.type}.png`), Buffer.from(row.png.split(',')[1], 'base64'));
  }
  expect(res.rows[0].text.replace(/\s+/g, ' ')).toContain('goes on and on so the slot has to wrap it over several lines');
  expect(res.rows[2].hasPill, 'the empty tag slot hides its pill').toBe(false);
  expect(res.rows[1].hasPill, 'a step with a number keeps its tag pill').toBe(true);
  expect(res.rows[5].text).toContain('Clear beats clever');
  expect(res.edDiff.faithful).toBe(false);
  expect(res.edDiff.note).toContain('Made editable');
  expect(res.quote).toEqual({ faithful: true, w: 1080, h: 1080 });
  expect(res.fontsLoaded).toContain('Schibsted Grotesk');
  const report = res.rows.map((x) => ({ type: x.type, diffFromLayersPct: x.diffPct, checks: x.lint.join(' ') }));
  fs.writeFileSync(path.join(OUT, 'faithful-vs-layers.json'), JSON.stringify(report, null, 1));
  console.log('FAITHFUL VS LAYERS', JSON.stringify(report));
});
