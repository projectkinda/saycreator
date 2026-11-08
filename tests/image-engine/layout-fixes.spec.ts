// Three layout fixes (ZERO model calls; static):
//   1. statement-card, short / normal / long text, both variants, four styles: the text sits inside the card with at least 40 px of padding on every side, the card stays inside the
//      free field and no chrome (handle, page counter, swipe cue) is inside the card
//   2. numbered-stagger, big numerals: the numerals are bold and at least twice the body size, and the stagger is even (every second item is the same offset further right)
//   3. prose and bullet-list fill at least 65% of the free area, short, normal and long text
import { expect, test } from '@playwright/test';

test.setTimeout(10 * 60_000);

async function build(page: any, ids: string[], lens: string[]) {
  return page.evaluate(async ({ ids, lens }: any) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const FW = await import('/src/image-engine/fonts.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const light: any = { palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#1B5E20', surface: '#F0F0F0', onAccent: '#FFFFFF' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: false, profileHeader: false, underline: false }, accentStyle: 'text' };
    const dark: any = { palette: { bg: '#0A0A0A', text: '#FFFFFF', muted: '#A6A6A6', accent: '#FFD54A', surface: '#242424', onAccent: '#0A0A0A' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: true, profileHeader: false, underline: false }, accentStyle: 'marker' };
    const styles: Record<string, any> = { light, dark, 'style-7': D.styleFromPack(PR.presetPackFor('style-7', false)).style, 'style-4': D.styleFromPack(PR.presetPackFor('style-4', false)).style };
    const out: any[] = [];
    for (const id of ids) {
      const def = L.layoutDef(id)!;
      for (const [sn, st] of Object.entries<any>(styles)) for (const v of [0, 1] as const) for (const len of lens) {
        const f = (def.samples as any)[len];
        const b = await L.buildSlide(id, v, f, st, { handle: '@quick.flip', index: 2, total: 8, cut: 'plain' });
        const layers = (b.layers ?? []) as any[];
        const texts = layers.filter((l) => l.kind === 'text' && l.text).map((l) => ({ name: String(l.name), chrome: String(l.name).startsWith('recurring'), x: l.x, y: l.y, w: l.width, h: l.height, size: l.style.size, weight: l.style.weight, text: String(l.text) }));
        const shapes = layers.filter((l) => l.kind === 'shape' && !/background/.test(String(l.name))).map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height, fill: l.fill }));
        const ink: any[] = [];
        { const doc = new DOMParser().parseFromString(b.svg ?? '<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'); const cv = document.createElement('canvas').getContext('2d')!; doc.querySelectorAll('text[data-role]').forEach((tn) => { const size = Number(tn.getAttribute('font-size')); const fam = tn.getAttribute('font-family'); const wt = tn.getAttribute('font-weight'); tn.querySelectorAll('tspan').forEach((ts) => { const f2 = ts.getAttribute('font-family') ?? fam; cv.font = `${wt} ${size}px "${f2}"`; const w = cv.measureText(ts.textContent ?? '').width; const x = Number(ts.getAttribute('x')); const y = Number(ts.getAttribute('y')); ink.push({ text: ts.textContent, x, y: y - size * 0.8, w, h: size * 0.95 }); }); }); }
        out.push({ id, sn, v, len, ink, maxW: Math.max(...FW.FONT_WEIGHTS[st.fonts.headline]), ok: b.ok, errors: b.errors, texts, shapes, field: b.field, tag: `${id}/${sn}/v${v + 1}/${len}` });
      }
    }
    return out;
  }, { ids, lens });
}

test('statement-card: text inside the card with 40 px of padding, the card inside the field, no chrome in the card', async ({ page }) => {
  await page.goto('/images/carousel');
  const rows = await build(page, ['statement-card'], ['short', 'normal', 'long']);
  const bad: string[] = [];
  const mins: number[] = [];
  for (const r of rows) {
    if (!r.ok) { bad.push(`${r.tag}: not drawn (${r.errors[0]})`); continue; }
    const cards = r.shapes.filter((s: any) => s.w >= 900 && s.h >= 500);
    // the card: the one drawn last among the big ones (an offset shadow is drawn before it)
    const card = cards[cards.length - 1];
    if (!card) { bad.push(`${r.tag}: no card`); continue; }
    if (card.y < 150 || card.y + card.h > 1210) bad.push(`${r.tag}: the card leaves the free field (${Math.round(card.y)}..${Math.round(card.y + card.h)})`);
    // the drawn text itself (each line measured in its font) keeps 40 px from the card edge
    for (const t of r.ink) {
      const pad = Math.min(t.x - card.x, card.x + card.w - (t.x + t.w), t.y - card.y, card.y + card.h - (t.y + t.h));
      mins.push(pad);
      if (pad < 40) bad.push(`${r.tag}: the line "${String(t.text).slice(0, 16)}" is ${Math.round(pad)} px from the card edge (< 40)`);
    }
    for (const t of r.texts) {
      if (t.chrome) {
        const ov = t.x < card.x + card.w && t.x + t.w > card.x && t.y < card.y + card.h && t.y + t.h > card.y;
        if (ov) bad.push(`${r.tag}: chrome "${t.text}" is inside the card`);
        continue;
      }
      // the layer boxes stay inside the card too (the engine may widen a box a little)
      if (t.x < card.x || t.x + t.w > card.x + card.w || t.y < card.y || t.y + t.h > card.y + card.h) bad.push(`${r.tag}: the box of "${t.text.slice(0, 16)}" leaves the card`);
    }
  }
  console.log('CARD rows ' + rows.length + ' min padding ' + Math.round(Math.min(...mins)));
  expect(rows.length).toBe(3 * 4 * 2);
  expect(bad.slice(0, 10)).toEqual([]);
});

test('numbered-stagger, big numerals: bold numerals at least twice the body size and an even stagger', async ({ page }) => {
  await page.goto('/images/carousel');
  const rows = await build(page, ['numbered-stagger'], ['short', 'normal', 'long']);
  const bad: string[] = [];
  let checked = 0;
  for (const r of rows.filter((q) => q.v === 1)) {
    if (!r.ok) { bad.push(`${r.tag}: not drawn (${r.errors[0]})`); continue; }
    const nums = r.texts.filter((t: any) => /^\d$/.test(t.text.trim())).sort((a: any, b: any) => a.y - b.y);
    const body = r.texts.filter((t: any) => t.name.startsWith('body') && !/^\d$/.test(t.text.trim()));
    const bodySize = Math.max(...body.map((t: any) => t.size));
    checked++;
    nums.forEach((n: any) => {
      if (n.weight < Math.min(700, r.maxW)) bad.push(`${r.tag}: numeral ${n.text} is weight ${n.weight} (the heaviest of its font is ${r.maxW})`);
      if (n.size < 2 * bodySize) bad.push(`${r.tag}: numeral ${n.text} is ${Math.round(n.size)} px, body ${Math.round(bodySize)} (needs 2x)`);
    });
    // the stagger: x alternates between x0 and x0 + the same offset; the texts keep the same width
    nums.forEach((n: any, i: number) => { if (Math.abs(n.x - (48 + (i % 2) * 140)) > 1) bad.push(`${r.tag}: numeral ${i + 1} starts at ${Math.round(n.x)} (the even stagger is ${48 + (i % 2) * 140})`); });
    const widths = new Set(body.filter((t: any) => t.size >= 44 && t.w < 900).map((t: any) => Math.round(t.w)));
    if (widths.size > 1) bad.push(`${r.tag}: the item widths differ (${[...widths].join(', ')})`);
  }
  console.log('STAGGER checked ' + checked);
  expect(checked).toBe(4 * 3);
  expect(bad.slice(0, 10)).toEqual([]);
});

test('prose and bullet-list fill at least 65% of the free area, short normal and long text, both variants', async ({ page }) => {
  await page.goto('/images/carousel');
  const rows = await build(page, ['prose', 'bullet-list'], ['short', 'normal', 'long']);
  const bad: string[] = [];
  const fills: number[] = [];
  const inks: number[] = [];
  for (const r of rows) {
    if (!r.ok) { bad.push(`${r.tag}: not drawn (${r.errors[0]})`); continue; }
    const boxes = [...r.texts.filter((t: any) => !t.chrome), ...r.shapes.filter((s: any) => s.y > 100 && s.y < 1260 && s.h < 1000)];
    const fill = (Math.max(...boxes.map((q: any) => q.y + q.h)) - Math.min(...boxes.map((q: any) => q.y))) / 1000;
    fills.push(fill);
    if (fill < 0.65) bad.push(`${r.tag}: fills ${Math.round(fill * 100)}% (< 65%)`);
    // the same measured on the drawn lines (the ink), and whether the block is centred in the free area: no empty bottom third
    const inkTop = Math.min(...r.ink.map((q: any) => q.y)), inkBot = Math.max(...r.ink.map((q: any) => q.y + q.h));
    const inkFill = (inkBot - inkTop) / 1000;
    inks.push(inkFill);
    const above = inkTop - 190, below = 1190 - inkBot;
    if (inkFill < 0.62) bad.push(`${r.tag}: the drawn text fills ${Math.round(inkFill * 100)}% (< 62%)`);
    if (Math.abs(above - below) > 130) bad.push(`${r.tag}: not centred: ${Math.round(above)} px above, ${Math.round(below)} px below`);
  }
  console.log('FILL min boxes ' + Math.round(Math.min(...fills) * 100) + '%, min ink ' + Math.round(Math.min(...inks) * 100) + '% of ' + fills.length);
  expect(rows.length).toBe(2 * 4 * 2 * 3);
  expect(bad.slice(0, 12)).toEqual([]);
});
