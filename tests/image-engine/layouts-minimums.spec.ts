// Every layout (all of them, short / normal / long content, both variants, light and dark) is drawn and checked: no text under its role's minimum size, and the content block fills at
// least ~55% of the free area. Role minimums: title 48, body 44, kicker 48 (and the STEP tag, which is a kicker), chrome 36. The failures are printed grouped by layout.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(10 * 60_000);
const OUT = path.resolve(process.cwd(), 'out/layouts-minimums');
const STYLES = `{
  dark: { palette: { bg: '#0A0A0A', text: '#FFFFFF', muted: '#8A8A8A', accent: '#CC0000', surface: '#2A2A2A' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: false, profileHeader: true, underline: false, planes: false }, accentStyle: 'text' },
  light: { palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#D9F77A', surface: '#F0F0F0' }, fonts: { headline: 'Schibsted Grotesk', body: 'Schibsted Grotesk' }, background: 'flat', devices: { marker: true, profileHeader: false, underline: false, planes: false }, accentStyle: 'marker' },
}`;

test('every layout: text at or above its role minimum and a block that fills the free area', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (styles) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const S: any = new Function('return ' + styles)();
    const MIN: Record<string, number> = { title: 48, body: 44, kicker: 48, tag: 48, caption: 44 };
    const small: Record<string, string[]> = {};
    const thin: Record<string, string[]> = {};
    let built = 0;
    for (const id of L.LAYOUT_IDS as string[]) {
      const def = L.layoutDef(id)!;
      for (const [sname, st] of Object.entries<any>(S)) for (const v of [0, 1] as const) for (const len of ['short', 'normal', 'long'] as const) {
        const f = (def.samples as any)[len];
        const b = await L.buildSlide(id, v, f, st, { handle: '@h', index: 2, total: 7, cut: 'plain' });
        built++;
        if (!b.ok) { (small[id] ??= []).push(`${sname}/v${v + 1}/${len}: not drawn (${b.errors[0]})`); continue; }
        const layers = b.layers as any[];
        for (const l of layers) {
          if (l.kind !== 'text' || !l.text) continue;
          const chrome = String(l.name).startsWith('recurring');
          const min = chrome ? 36 : MIN[l.name];
          if (min !== undefined && l.style.size < min) (small[id] ??= []).push(`${sname}/v${v + 1}/${len}: ${chrome ? 'chrome' : l.name} "${String(l.text).slice(0, 18)}" is ${Math.round(l.style.size)} px (< ${min})`);
        }
        // the block: text and shapes in the free area (not the chrome, not the background)
        const boxes = layers.filter((l) => (l.kind === 'text' && !String(l.name).startsWith('recurring') && l.text) || (l.kind !== 'text' && (l.height ?? 0) > 0 && l.height < 1000 && l.y > 100 && l.y < 1260 && !/background|recurring|plane/.test(String(l.name))));
        if (boxes.length && id !== 'photo-led') { // photo-led: the picture area is the content, and it is not a text or shape layer
          const top = Math.min(...boxes.map((q: any) => q.y));
          const bot = Math.max(...boxes.map((q: any) => q.y + q.height));
          const fill = (bot - top) / 1000;
          // a nine-character figure ("1,250,000") can only be set as wide as the page: the caption sits right under it (at most one caption line), so a block of number and caption is shorter than the old
          // one that spread them apart; big-stat with such a figure is held to 45%
          const floor = id === 'big-stat' && len === 'long' ? 0.45 : 0.55;
          if (fill < floor) (thin[id] ??= []).push(`${sname}/v${v + 1}/${len}: fills ${Math.round(fill * 100)}%`);
          // a real run showed numbered-list leaving 40% empty and lead-statement a big gap above its headline: these two are held to the checklist's fill and to a centred block
          if (id === 'numbered-list' && fill < 0.65) (thin[id] ??= []).push(`${sname}/v${v + 1}/${len}: fills ${Math.round(fill * 100)}% (needs 65%)`);
          if (id === 'lead-statement') {
            // no big empty gap inside the block (the old layout held a rule at the top of the slide and the headline 350 px lower)
            const ys = [...boxes].sort((m: any, n: any) => m.y - n.y);
            let big = 0;
            let reach = ys[0].y + ys[0].height;
            for (const q of ys.slice(1)) { big = Math.max(big, q.y - reach); reach = Math.max(reach, q.y + q.height); }
            if (big > 160) (thin[id] ??= []).push(`${sname}/v${v + 1}/${len}: a ${Math.round(big)} px gap inside the block`);
          }
          if ((id === 'numbered-list' || id === 'lead-statement') && Math.abs(top - 120 - (1230 - bot)) > 180) (thin[id] ??= []).push(`${sname}/v${v + 1}/${len}: not centred (${Math.round(top - 120)} px above, ${Math.round(1230 - bot)} px below)`);
        }
      }
    }
    return { small, thin, built };
  }, STYLES);
  fs.mkdirSync(OUT, { recursive: true });
  const group = (m: Record<string, string[]>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { count: v.length, examples: [...new Set(v.map((x) => x.replace(/^[a-z]+\/v\d\//, '')))].slice(0, 4) }]));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ built: r.built, smallText: group(r.small), underfilled: group(r.thin) }, null, 1));
  console.log('MIN ' + JSON.stringify({ built: r.built, smallLayouts: Object.keys(r.small), thinLayouts: Object.keys(r.thin) }));
  expect(r.built).toBeGreaterThanOrEqual(19 * 12);
  expect(group(r.small), 'text under its role minimum').toEqual({});
  expect(group(r.thin), 'content that fills under 55% of the free area').toEqual({});
});
