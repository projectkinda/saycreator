// Two text rules (ZERO model calls):
//   1. no dummy text anywhere in src/: "Lorem", "ipsum", "dolor" and "dignissimos" never appear in a layout default, sample, writer menu, style or fixture
//   2. in every layout, variant, text length and style the title is at least as big as any body text (figures such as numerals and "10 sec", and the chrome, are not body text)
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(10 * 60_000);

test('no dummy text (Lorem, ipsum, dolor, dignissimos) anywhere in src/', () => {
  const root = path.resolve(process.cwd(), 'src');
  const hits: string[] = [];
  let files = 0;
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (/\.(woff2?|ttf|otf|png|jpe?g|gif|webp|ico|mp4|zip)$/i.test(e.name)) continue;
      const buf = fs.readFileSync(p);
      if (buf.length > 4_000_000 || buf.subarray(0, 4096).includes(0)) continue;
      files++;
      const text = buf.toString('utf8');
      const m = /lorem|ipsum|dolor|dignissimos/i.exec(text);
      if (m) hits.push(`${path.relative(process.cwd(), p)}: "${m[0]}" near "${text.slice(Math.max(0, m.index - 20), m.index + 30).replace(/\s+/g, ' ')}"`);
    }
  };
  walk(root);
  console.log('SCANNED ' + files + ' files in src/');
  expect(files).toBeGreaterThan(100);
  expect(hits).toEqual([]);
});

test('every layout: the title is at least as big as the body text, in both variants, three lengths, two styles', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const light: any = { palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#1B5E20', surface: '#F0F0F0', onAccent: '#FFFFFF' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: false, profileHeader: false, underline: false }, accentStyle: 'text' };
    const dark: any = { palette: { bg: '#0A0A0A', text: '#FFFFFF', muted: '#A6A6A6', accent: '#FFD54A', surface: '#242424', onAccent: '#0A0A0A' }, fonts: { headline: 'Barlow Condensed', body: 'Instrument Sans' }, weights: { headline: 700, body: 500 }, background: 'flat', devices: { marker: true, profileHeader: false, underline: false }, accentStyle: 'marker' };
    const bad: string[] = [];
    let compared = 0;
    for (const id of L.LAYOUT_IDS as string[]) {
      const def = L.layoutDef(id)!;
      for (const [sn, st] of Object.entries<any>({ light, dark })) for (const v of [0, 1] as const) for (const len of ['short', 'normal', 'long'] as const) {
        const b = await L.buildSlide(id, v, (def.samples as any)[len], st, { handle: '@h', index: 2, total: 8, cut: 'plain' });
        if (!b.ok) continue;
        const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring')).map((l) => ({ name: String(l.name), size: l.style.size as number, text: String(l.text) }));
        const titles = texts.filter((t) => t.name === 'title');
        // figures (a digit-only numeral, "10 sec", "$500,000") are the hero of their slide, not body text
        const body = texts.filter((t) => /^body/.test(t.name) && !/^\W*\d[\d.,\s]*\S{0,5}$/.test(t.text));
        if (!titles.length || !body.length) continue;
        compared++;
        const T = Math.max(...titles.map((t) => t.size)), B = Math.max(...body.map((t) => t.size));
        if (T < B) bad.push(`${id}/${sn}/v${v + 1}/${len}: title ${Math.round(T)} px < body ${Math.round(B)} px ("${body.find((t) => t.size === B)!.text.slice(0, 20)}")`);
      }
    }
    return { bad, compared };
  });
  console.log('TITLE>=BODY compared ' + r.compared + ', violations ' + r.bad.length + ' ' + JSON.stringify(r.bad.slice(0, 12)));
  expect(r.compared).toBeGreaterThan(200);
  expect(r.bad.slice(0, 15)).toEqual([]);
});
