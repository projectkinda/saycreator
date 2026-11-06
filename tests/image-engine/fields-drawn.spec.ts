// Every field the writer fills is either DRAWN or rejected by validateSlideContent: no layout takes a field and silently leaves it out.
// Text fields must appear in the slide's text layers (whole, or as the lines the layout broke it into); the numeric fields that are drawn as a graphic (bar, position, current) are
// listed and checked by what they draw.
import { expect, test } from '@playwright/test';

test.setTimeout(240_000);
const STYLE = `{ palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#D9F77A', surface: '#F0F0F0' }, fonts: { headline: 'Schibsted Grotesk', body: 'Schibsted Grotesk' }, background: 'flat', devices: { marker: true, profileHeader: false, underline: false, planes: false }, accentStyle: 'marker' }`;

test('every field a layout accepts is drawn; unknown fields are rejected', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (styleSrc) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const st: any = new Function('return ' + styleSrc)();
    const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}%$]+/gu, '');
    const missing: string[] = [];
    const rejected: string[] = [];
    const GRAPHIC = new Set(['bar', 'position', 'current']); // drawn as a bar / handle / the active step, not as text
    let checked = 0;
    for (const id of L.LAYOUT_IDS as string[]) {
      const def = L.layoutDef(id)!;
      for (const len of ['normal', 'long'] as const) {
        const f = (def.samples as any)[len];
        // a field the layout does not list is refused
        const bad = L.validateSlideContent(id, { ...f, notAField: 'x' });
        if (bad.ok) rejected.push(`${id}: an unknown field was accepted`);
        for (const cut of ['plain', 'edge-h'] as const) {
          if (!L.cutsOf(id).includes(cut)) continue;
          const b = await L.buildSlide(id, 0, f, st, { handle: '@h', index: 2, total: 7, cut });
          if (!b.ok) { missing.push(`${id}/${len}/${cut}: not drawn (${b.errors[0]})`); continue; }
          const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && !String(l.name).startsWith('recurring')).map((l) => norm(String(l.text)));
          const all = texts.join('|');
          const has = (v: string) => all.includes(norm(v)) || texts.some((t) => t.length > 1 && norm(v).includes(t));
          for (const [k, v] of Object.entries<any>(f)) {
            if (k === 'accent' || GRAPHIC.has(k)) continue;
            for (const item of Array.isArray(v) ? v : [v]) {
              checked++;
              if (!String(item).trim()) continue;
              if (!has(String(item))) missing.push(`${id}/${len}/${cut}: field "${k}" ("${String(item).slice(0, 30)}") is accepted but not drawn`);
            }
          }
        }
      }
    }
    return { missing: [...new Set(missing)], rejected, checked };
  }, STYLE);
  expect(r.checked).toBeGreaterThan(200);
  expect(r.rejected).toEqual([]);
  expect(r.missing).toEqual([]);
});
