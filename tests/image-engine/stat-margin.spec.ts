// Stat layouts keep their big numbers inside the same side margins as every other text (ZERO model calls): for every stat layout, both variants, 15 presets, a long figure like "$15-30" included,
// every drawn text (measured in the browser, glyph overhang included) stays between x = 48 and x = 1032.
import { expect, test } from '@playwright/test';

test.setTimeout(10 * 60_000);
const PRESETS = ['dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];

test('stat layouts: every text, the big numbers included, stays inside the side margins in all 15 presets', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PRESETS) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const ids = (L.LAYOUT_IDS as string[]).filter((id) => /^(big-stat|stat-bar|stat-grid|stat-card)$/.test(id));
    const extra: Record<string, any[]> = {
      'big-stat': [{ number: '$15-30', label: 'a month for coaching products', source: 'Versus $5-10 for todo apps' }, { number: '10-15', label: 'minutes before the aha moment' }, { number: '$1,250,000', label: 'raised in a day' }, { number: '68%', label: 'would take a pay cut' }],
      'stat-bar': [{ number: '$15-30', label: 'a month', bar: '30', note: 'for coaching products' }],
    };
    const rows: any[] = [];
    for (const p of PRESETS) {
      const st = D.styleFromPack(PR.presetPackFor(p, false)).style;
      for (const id of ids) {
        const def = L.layoutDef(id)!;
        const sets = [(def.samples as any).normal, (def.samples as any).long, (def.samples as any).short, ...(extra[id] ?? [])];
        for (const v of [0, 1] as const) for (const [k, f] of sets.entries()) {
          const b: any = await L.buildSlide(id, v, f, st, { handle: '@x', index: 3, total: 8, cut: 'plain' });
          if (!b.ok || !b.svg) continue;
          const host = document.createElement('div');
          host.style.cssText = 'position:absolute;left:-9999px;top:0;width:1080px;height:1350px;visibility:hidden';
          host.appendChild(document.importNode(new DOMParser().parseFromString(b.svg, 'image/svg+xml').documentElement, true));
          document.body.appendChild(host);
          const bad: string[] = [];
          host.querySelectorAll('text').forEach((t: any) => {
            const tx = (t.textContent ?? '').trim(); if (!tx || tx.startsWith('@') || /^\d+ \/ \d+$|^swipe|^\d\d$|\.com$/.test(tx)) return; // the chrome has its own margins
            try {
              const bb = t.getBBox();
              // an ancestor translate (the engine shifts shapes and text)
              let dx = 0, e: Element | null = t;
              while (e && e.nodeType === 1) { const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(e.getAttribute('transform') ?? ''); if (m) dx += Number(m[1]); e = e.parentElement; }
              const l = bb.x + dx, rr = bb.x + dx + bb.width;
              if (l < 46 || rr > 1034) bad.push(`"${(t.textContent ?? '').trim().slice(0, 14)}" ${Math.round(l)}..${Math.round(rr)}`);
            } catch { /* not measurable */ }
          });
          host.remove();
          rows.push({ tag: `${p}/${id}/v${v + 1}/${k}${f.number ? ' ' + f.number : ''}`, bad });
        }
      }
    }
    return { rows, ids };
  }, PRESETS);
  const bad = r.rows.filter((x: any) => x.bad.length).map((x: any) => `${x.tag}: ${x.bad.join(', ')}`);
  console.log('STAT layouts ' + r.ids.join(',') + ' rows ' + r.rows.length + ' bad ' + bad.length);
  expect(r.rows.length).toBeGreaterThan(300);
  expect(bad.slice(0, 12)).toEqual([]);
});
