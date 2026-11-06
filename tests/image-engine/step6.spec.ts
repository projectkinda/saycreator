// Round 6: no empty plane, one accent colour per deck across the Shapes modes, a picker that never offers a layout that drops core text, and the two numeral layouts as one family.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(300_000);
const STYLE = `{ palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#D9F77A', surface: '#F0F0F0' }, fonts: { headline: 'Schibsted Grotesk', body: 'Schibsted Grotesk' }, background: 'flat', devices: { marker: true, profileHeader: false, underline: false, planes: true }, accentStyle: 'marker' }`;

test('(a) no layout x cut x content leaves a plane with no text or shape: the slide is drawn plain instead', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (styleSrc) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const T = await import('/src/image-engine/draw/text.ts');
    const st: any = new Function('return ' + styleSrc)();
    const bad: string[] = [];
    let planes = 0, plain = 0, built = 0;
    for (const id of L.LAYOUT_IDS as string[]) for (const cut of L.cutsOf(id) as string[]) {
      if (cut === 'plain') continue;
      for (const len of ['short', 'normal', 'long'] as const) for (const v of [0, 1] as const) {
        const b: any = await L.buildSlide(id, v, (L.layoutDef(id)!.samples as any)[len], st, { handle: '@h', index: 2, total: 7, cut });
        if (!b.ok) continue;
        built++;
        if (b.cut === 'plain') { plain++; continue; }
        planes++;
        const g = b.geometry;
        // independent check: something drawn on the plane (the plane shape itself and the background are not content)
        const items = (b.layers as any[]).filter((l) => !String(l.name).startsWith('recurring') && !/background/.test(String(l.name)) && l.kind !== 'image' && l.height < 700 && (l.kind !== 'text' || l.text));
        const on = items.some((l) => g.on(l.x + l.width / 2, (l.kind === 'text' ? l.y + T.layoutText(l).height / 2 : l.y + l.height / 2)));
        if (!on) bad.push(`${id}/${cut}/${len}/v${v + 1}: an empty ${cut} plane is drawn`);
      }
    }
    return { bad, planes, plain, built };
  }, STYLE);
  expect(r.built).toBeGreaterThan(300);
  expect(r.planes, 'planes that carry content are still drawn').toBeGreaterThan(50);
  expect(r.plain, 'combinations that cannot carry the plane are drawn plain').toBeGreaterThan(20);
  expect(r.bad).toEqual([]);
});

test('(b) the accent colour is the same in Shapes off, subtle and bold', async ({ page }) => {
  const lib = JSON.parse(fs.readFileSync('out/designed-library-real/quickflip-dark/report.json', 'utf8')).library;
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (lib) => {
    const D = await import('/src/carousel/designLibrary.ts');
    const st = lib.style;
    const hue = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return { sat: mx - mn, h: mx === mn ? 0 : mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4 }; };
    const modes: Record<string, string[]> = {};
    for (const shapes of ['off', 'subtle', 'bold']) {
      const pack: any = { name: 'stub', palette: { ...st.palette }, fonts: { ...st.fonts }, motifs: [], designs: {}, canvas: { w: 1080, h: 1350 }, notes: [], svgs: { cover: '<svg><radialGradient id="g"/></svg>' }, devices: { marker: false, profileHeader: false, underline: true, slides: 1, counts: { marker: 0, profileHeader: 0, underline: 0 } }, overrides: { shapes } };
      const res = await D.redrawLibraryDeck({ ...lib, redraws: 0 }, { pack, hasPhoto: false }, '@quick.flip');
      const cols = new Set<string>();
      for (const s of Object.values<any>(res.slides)) for (const l of s.built.layers as any[]) if (l.kind === 'text') {
        const cs = [...(l.runs ?? []).map((x: any) => x.color), l.name === 'number' ? l.style.color : ''].filter(Boolean) as string[];
        // an accent TEXT colour: a red (hue 0, saturated) that is not the plain brand red used on shapes
        for (const c of cs) if (/^#[0-9a-f]{6}$/i.test(c) && hue(c).sat > 0.5 && (hue(c).h < 0.3 || hue(c).h > 5.7)) cols.add(c.toUpperCase());
      }
      modes[shapes] = [...cols].sort();
    }
    return modes;
  }, lib);
  const all = new Set(Object.values(r).flat());
  expect(all.size, 'one accent text colour in all three modes: ' + JSON.stringify(r)).toBe(1);
  for (const m of ['off', 'subtle', 'bold']) expect(r[m].length).toBe(1);
});

test('(c) the picker never offers a layout that drops the slide\'s required text', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const K = await import('/src/carousel/layoutMap.ts');
    const L = await import('/src/carousel/layouts/index.ts');
    const bad: string[] = [];
    let offered = 0;
    const flat = (f: any) => Object.entries(f).filter(([k]) => k !== 'accent').flatMap(([, v]) => (Array.isArray(v) ? v : [v])).map((x) => String(x).trim()).filter(Boolean);
    for (const id of L.LAYOUT_IDS as string[]) for (const len of ['short', 'normal', 'long'] as const) {
      const f = (L.layoutDef(id)!.samples as any)[len];
      const spec = { layout: id, fields: f, accents: [] };
      const core = L.layoutDef(id)!.fields.filter((x: any) => x.required).flatMap((x: any) => (Array.isArray(f[x.name]) ? f[x.name] : [f[x.name]])).map((x: any) => String(x ?? '').trim()).filter(Boolean);
      for (const o of K.layoutOptions(spec as any, { hasPhoto: true })) {
        if (o.current) continue;
        offered++;
        const shown = flat(o.fields);
        for (const t of core) if (!shown.some((u: string) => u === t || u.includes(t))) bad.push(`${id}/${len} -> ${o.layout} loses "${t.slice(0, 28)}"`);
        if (o.droppedCore.length) bad.push(`${id} -> ${o.layout}: droppedCore not empty`);
      }
    }
    const stepper = K.layoutOptions({ layout: 'stepper', fields: { title: 'How to flip it', steps: ['Zip the hood in', 'Fold the sleeves', 'Pull the straps'] }, accents: [] } as any, { hasPhoto: false }).map((o: any) => o.layout);
    return { bad, offered, stepper };
  });
  expect(r.offered).toBeGreaterThan(20);
  expect(r.bad).toEqual([]);
  // a stepper's steps are core: nothing that would leave only the title is offered
  for (const no of ['statement', 'lead-statement', 'big-question', 'split-text']) expect(r.stepper).not.toContain(no);
  expect(r.stepper).toEqual(expect.arrayContaining(['stepper', 'checklist', 'numbered-list']));
});

test('(d) step-numeral and listicle-numeral are ONE family for the neighbours rule', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const L = await import('/src/carousel/layouts/index.ts');
    const F = await import('/src/carousel/flavour.ts');
    const deck = ['statement', 'step-numeral', 'listicle-numeral', 'step-numeral', 'listicle-numeral', 'checklist', 'cta-button'].map((layout) => ({ layout }));
    const out = L.rotateVariants(deck as any, {});
    const seq = out.map((x: any) => x.layout);
    const adj = seq.filter((l: string, i: number) => i > 0 && L.neighbourFamily(l) === L.neighbourFamily(seq[i - 1])).length;
    return { same: L.neighbourFamily('step-numeral') === L.neighbourFamily('listicle-numeral'), other: L.neighbourFamily('checklist') !== L.neighbourFamily('stepper'), flavour: F.familyOf('step-numeral') === F.familyOf('listicle-numeral'), seq, adj, notes: out.map((x: any) => x.note).filter(Boolean) };
  });
  expect(r.same).toBe(true);
  expect(r.flavour).toBe(true);
  expect(r.other).toBe(true);
  expect(r.adj, 'no two neighbouring slides in the numeral family: ' + r.seq.join(', ')).toBe(0);
  expect(r.notes.length).toBeGreaterThan(0);
});
