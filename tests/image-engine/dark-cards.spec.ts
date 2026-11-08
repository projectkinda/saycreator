// Dark cards (ZERO model calls): on the dark grounds of style-1 and film-paper a card slide's card is told apart from the ground: at least 1.15:1 in colour, or else it carries the hairline outline.
// Measured on the drawn SVG (card fill vs ground) and on the rendered pixels (a pixel inside the card vs one in the ground). Sheet: out/ring-fix/dark-cards.png.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(5 * 60_000);

test('dark cards: card against ground is at least 1.15:1, or the card has its hairline', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lum = (h: string) => { const c = rgb(h).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    const rows: any[] = [];
    const bms: ImageBitmap[] = [];
    for (const preset of ['style-1', 'film-paper']) {
      const st: any = D.styleFromPack(PR.presetPackFor(preset, false)).style;
      const darkGround = (st.rhythm as any[]).findIndex((g) => cr(g.bg, '#000000') < 3); // the first dark ground of the rhythm
      for (const [layout, fields] of [
        ['statement-card', { kicker: 'Verdict', headline: 'Build the smallest version first', caption: 'It tests the core assumption.' }],
        ['comparison', { title: 'Two different jobs', leftLabel: 'Todo app user', leftText: 'Wants speed and a task in 3 taps', rightLabel: 'Coaching user', rightText: 'Will answer 18 questions and invest time' }],
        ['card-grid', { title: 'What you get', cardTitles: ['A bag in the hood', 'Waterproof pocket', 'Ten second flip'], cardLines: ['One layer', 'Keeps it dry', 'Zip and go'] }],
      ] as [string, any][]) {
        for (const v of [0, 1] as const) {
          const b: any = await L.buildSlide(layout, v, fields, st, { handle: '@x', index: 3, total: 8, cut: 'plain', ground: darkGround });
          const tag = `${preset}/${layout}/v${v + 1}`;
          if (!b.ok || !b.svg) { rows.push({ tag, skip: b.errors?.[0] ?? 'not drawn' }); continue; }
          const doc = new DOMParser().parseFromString(b.svg, 'image/svg+xml');
          const bg = (doc.querySelector('rect#bg')?.getAttribute('fill') ?? '').toUpperCase();
          const pal = st.rhythm[darkGround];
          const surface = String(pal.surface).toUpperCase();
          // cards: big rects filled with the card colour
          const cards = [...doc.querySelectorAll('rect')].filter((e) => (e.getAttribute('fill') ?? '').toUpperCase() === surface && Number(e.getAttribute('width')) > 250 && Number(e.getAttribute('height')) > 120);
          if (!cards.length) { rows.push({ tag, skip: 'no card in this variant' }); continue; }
          const bm = await createImageBitmap(await F.svgToPng(b.svg, 1080)); bms.push(bm);
          const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const g = cv.getContext('2d', { willReadFrequently: true })!; g.drawImage(bm, 0, 0, 1080, 1350);
          const c0 = cards[0];
          const cx = Number(c0.getAttribute('x')) + Number(c0.getAttribute('width')) / 2, cy = Number(c0.getAttribute('y')) + 24;
          const dyT = /translate\(\s*[-\d.]+[ ,]+([-\d.]+)/.exec(c0.getAttribute('transform') ?? '')?.[1];
          const p = g.getImageData(Math.round(cx), Math.round(cy + Number(dyT ?? 0)), 1, 1).data;
          const q = g.getImageData(8, 700, 1, 1).data;
          rows.push({ tag, ground: bg, card: surface, cardVsGround: Number(cr(surface, bg).toFixed(2)), pixelCard: hex(p[0], p[1], p[2]), pixelGround: hex(q[0], q[1], q[2]), pixelRatio: Number(cr(hex(p[0], p[1], p[2]), hex(q[0], q[1], q[2])).toFixed(2)), hairline: cards.every((e) => e.getAttribute('stroke-opacity') !== null || e.getAttribute('stroke') !== null), n: cards.length });
        }
      }
    }
    const w = 300, h = 375, cols = 4;
    const c = document.createElement('canvas'); c.width = cols * (w + 10) + 10; c.height = Math.ceil(bms.length / cols) * (h + 10) + 10;
    const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
    bms.forEach((u, i) => g.drawImage(u, 10 + (i % cols) * (w + 10), 10 + Math.floor(i / cols) * (h + 10), w, h));
    return { rows, sheet: c.toDataURL('image/png').split(',')[1] };
  });
  fs.mkdirSync('out/ring-fix', { recursive: true });
  fs.writeFileSync('out/ring-fix/dark-cards.png', Buffer.from(r.sheet, 'base64'));
  const rows = r.rows.filter((x: any) => !x.skip);
  console.log('DARK CARDS ' + JSON.stringify(r.rows));
  expect(rows.length).toBeGreaterThanOrEqual(6);
  for (const x of rows) expect(x.cardVsGround >= 1.15 || x.hairline, `${x.tag}: card ${x.card} on ${x.ground} is ${x.cardVsGround}:1 and has ${x.hairline ? 'a hairline' : 'no hairline'}`).toBe(true);
});
