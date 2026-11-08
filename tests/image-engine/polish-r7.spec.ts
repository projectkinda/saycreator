// Polish round 7 (ZERO model calls): the caption under a hero number (size, gap), comparison cards sized to their content and centred, numbered lists and numbered points that fill the page with
// their numerals in one column.
import { expect, test } from '@playwright/test';

test.setTimeout(10 * 60_000);
const PRESETS = ['dark-quiet', 'hot-flat', 'style-1', 'style-2', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8'];

test('big-stat and stat-bar: the caption is at least body size, sits within one caption line of the number, and the number stays the biggest element', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PRESETS) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const rows: any[] = [];
    for (const id of PRESETS) {
      const st = D.styleFromPack(PR.presetPackFor(id, false)).style;
      for (const [layout, fields] of [['big-stat', [{ number: '68%', label: 'would take a pay cut', source: 'Survey of 2,500 knowledge workers' }, { number: '10 sec', label: 'to flip into a bag' }, { number: '$11,000', label: 'per employee on office space', source: 'Companies report, roughly each year' }]], ['stat-bar', [{ number: '31%', label: 'of managers still say', bar: '31', note: 'they trust people more when they can see them' }, { number: '$500,000', label: 'for 5% of the company', bar: '5' }]]] as [string, any[]][])
        for (const v of [0, 1] as const) for (const f of fields) {
          const b = await L.buildSlide(layout, v, f, st, { handle: '@x', index: 2, total: 8, cut: 'plain' });
          if (!b.ok) { rows.push({ tag: `${id}/${layout}/v${v + 1}/${f.number}`, err: b.errors[0] }); continue; }
          const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring')).map((l) => ({ name: String(l.name), text: String(l.text), x: l.x, y: l.y, w: l.width, h: l.height, size: l.style.size, lh: l.style.lineHeight }));
          const num = texts.find((t) => t.text === f.number)!;
          const cap = texts.find((t) => t.text === f.label)!;
          const sub = texts.find((t) => t.text === (f.source ?? f.note));
          rows.push({ tag: `${id}/${layout}/v${v + 1}/${f.number}`, capSize: cap.size, subSize: sub?.size ?? null, numSize: num.size, maxOther: Math.max(...texts.filter((t) => t !== num).map((t) => t.size)), gap: Math.round(cap.y - (num.y + num.h)), capLine: Math.round(cap.size * (cap.lh ?? 1.2)) });
        }
    }
    return rows;
  }, PRESETS);
  expect(r.length).toBeGreaterThan(80);
  for (const x of r) {
    expect(x.err, x.tag).toBeUndefined();
    expect(x.capSize, `${x.tag}: caption at least body size`).toBeGreaterThanOrEqual(44);
    if (x.subSize !== null) expect(x.subSize, `${x.tag}: the line under it too`).toBeGreaterThanOrEqual(44);
    expect(x.numSize, `${x.tag}: the number is the biggest element`).toBeGreaterThan(x.maxOther);
    expect(x.gap, `${x.tag}: the caption is within one caption line (${x.capLine}) of the number box`).toBeLessThanOrEqual(x.capLine + 6); // a caption line, give or take a rounding px
  }
  console.log('STAT GAPS ' + JSON.stringify([...new Set(r.map((x: any) => x.gap))].sort((a: number, b: number) => a - b)));
});

test('comparison: cards sized to their content (no dead zone), text at least 48, the pair centred in the free area, the slide filled', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PRESETS) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const rows: any[] = [];
    const sets = [
      { title: 'Control or stability', leftLabel: 'Full-time job', leftText: 'Steady pay, fixed hours', rightLabel: 'Freelancing', rightText: 'You choose clients and hours' },
      { leftLabel: 'Before', leftText: 'Two bags', rightLabel: 'After', rightText: 'One hoodie' },
      { title: 'Carrying a bag versus Quick Flip', leftLabel: 'Before', leftText: 'A heavy bag that pulls on one shoulder', rightLabel: 'After', rightText: 'One light hoodie that keeps both hands free' },
    ];
    for (const id of PRESETS) {
      const st = D.styleFromPack(PR.presetPackFor(id, false)).style;
      for (const v of [0, 1] as const) for (const [k, f] of sets.entries()) {
        const b = await L.buildSlide('comparison', v, f, st, { handle: '@x', index: 3, total: 8, cut: 'plain' });
        if (!b.ok) { rows.push({ tag: `${id}/v${v + 1}/${k}`, err: b.errors[0] }); continue; }
        const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring') && l.name !== 'title').map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height, size: l.style.size, text: String(l.text) }));
        const cards0 = (b.layers as any[]).filter((l) => l.kind === 'shape' && l.width > 300 && l.height > 150 && l.height < 1000 && !/background|recurring/.test(String(l.name)) && l.width * l.height < 1080 * 1350 * 0.45).map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height }));
        // a hard shadow (style-7) is a second rectangle a few px off the card: one card
        const cards = cards0.filter((c, i) => !cards0.some((o, j) => j < i && Math.abs(o.x - c.x) < 16 && Math.abs(o.y - c.y) < 16 && Math.abs(o.w - c.w) < 8 && Math.abs(o.h - c.h) < 8));
        const field = b.field as any;
        const top = Math.min(...cards.map((c) => c.y)), bottom = Math.max(...cards.map((c) => c.y + c.h));
        const inside = (c: any) => texts.filter((t) => t.x >= c.x - 2 && t.x + t.w <= c.x + c.w + 2 && t.y >= c.y - 2 && t.y + t.h <= c.y + c.h + 2);
        const fillOf = cards.map((c) => { const ts = inside(c); return ts.length ? (Math.max(...ts.map((t) => t.y + t.h)) - Math.min(...ts.map((t) => t.y))) / c.h : 0; });
        const all = [...cards.map((c) => [c.y, c.y + c.h]), ...texts.map((t) => [t.y, t.y + t.h])];
        rows.push({ tag: `${id}/v${v + 1}/${k}`, n: cards.length, maxH: Math.max(...cards.map((c) => c.h)), minText: Math.min(...texts.map((t) => t.size)), midOff: Math.abs((top + bottom) / 2 - (field.y0 + field.y1) / 2), fieldH: field.y1 - field.y0, cardFill: Math.min(...fillOf), fill: (Math.max(...all.map((q) => q[1])) - Math.min(...all.map((q) => q[0]))) / 1000 });
      }
    }
    return rows;
  }, PRESETS);
  expect(r.length).toBeGreaterThan(50);
  for (const x of r) {
    expect(x.err, x.tag).toBeUndefined();
    expect(x.n, `${x.tag}: two cards`).toBe(2);
    expect(x.minText, `${x.tag}: text at least 48`).toBeGreaterThanOrEqual(48);
    expect(x.maxH, `${x.tag}: a card sized to its content (under 700 px; the old cards were about 900)`).toBeLessThanOrEqual(700);
    expect(x.cardFill, `${x.tag}: the words fill at least 45% of the card height`).toBeGreaterThanOrEqual(0.45);
    expect(x.midOff, `${x.tag}: the pair is centred in the free area`).toBeLessThanOrEqual(0.2 * x.fieldH);
  }
  console.log('CMP ' + JSON.stringify({ maxH: Math.max(...r.map((x: any) => x.maxH)), minFill: Math.round(Math.min(...r.map((x: any) => x.cardFill)) * 100), minTotalFill: Math.round(Math.min(...r.map((x: any) => x.fill)) * 100) }));
});

test('numbered-list and numbered-stagger with short items: the text scales up to fill at least 65% of the free area, the numerals are in one column', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PRESETS) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const rows: any[] = [];
    const sets: [string, string, string[]][] = [
      ['numbered-list', 'three', ['Pick two projects', 'Write each story', 'Research the company']],
      ['numbered-list', 'five', ['Pick two', 'Write the story', 'Research them', 'Practise aloud', 'Ask questions']],
      ['numbered-stagger', 'three', ['How decisions get made', 'Who reviews your work', 'What success looks like']],
      ['numbered-stagger', 'two', ['Follow-ups got faster', 'Owners were named in writing']],
    ];
    for (const id of PRESETS) {
      const st = D.styleFromPack(PR.presetPackFor(id, false)).style;
      for (const [layout, name, items] of sets) for (const v of [0, 1] as const) {
        const b = await L.buildSlide(layout, v, { title: 'What changed within a month', items }, st, { handle: '@x', index: 3, total: 8, cut: 'plain' });
        if (!b.ok) { rows.push({ tag: `${id}/${layout}/${name}/v${v + 1}`, err: b.errors[0] }); continue; }
        const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring')).map((l) => ({ name: String(l.name), text: String(l.text), x: l.x, y: l.y, h: l.height, size: l.style.size }));
        const nums = texts.filter((t) => /^[1-5]$/.test(t.text));
        const body = texts.filter((t) => /^body\d*$/.test(t.name) && !/^[1-5]$/.test(t.text));
        const field = b.field as any;
        const shapes = (b.layers as any[]).filter((l) => l.kind === 'shape' && l.y > 100 && l.y < 1260 && l.height < 900 && !/background|recurring/.test(String(l.name))).map((l) => [l.y, l.y + l.height]);
        const ys = [...texts.map((t) => [t.y, t.y + t.h]), ...shapes];
        rows.push({ tag: `${id}/${layout}/${name}/v${v + 1}`, fill: (Math.max(...ys.map((q) => q[1])) - Math.min(...ys.map((q) => q[0]))) / (field.y1 - field.y0), numX: [...new Set(nums.map((n) => Math.round(n.x)))].length, bodyX: [...new Set(body.map((n) => Math.round(n.x)))].length, nums: nums.length, items: items.length, bodySize: Math.min(...body.map((t) => t.size)) });
      }
    }
    return rows;
  }, PRESETS);
  expect(r.length).toBeGreaterThan(70);
  for (const x of r) {
    expect(x.err, x.tag).toBeUndefined();
    expect(x.fill, `${x.tag}: fills at least 65% of the free area`).toBeGreaterThanOrEqual(0.65);
    expect(x.nums, `${x.tag}: a numeral for every item`).toBe(x.items);
    expect(x.numX, `${x.tag}: the numerals are in one column`).toBe(1);
    expect(x.bodyX, `${x.tag}: the items share one left edge (no stagger)`).toBe(1);
    expect(x.bodySize, `${x.tag}: text at least 44`).toBeGreaterThanOrEqual(44);
  }
  console.log('NUMBERED FILL min ' + Math.round(Math.min(...r.map((x: any) => x.fill)) * 100));
});
