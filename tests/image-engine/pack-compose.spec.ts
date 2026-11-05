// Step 16b (no model): packs from different references must not share one skeleton. crossPackCheck finds packs that look alike, the standard compositions are marked
// "Basic", the prompt no longer carries example compositions, and repeated slide types in one carousel get code-side variants (mirrored, colours swapped) that never
// push text under 32 px or off the slide.
import { expect, test } from '@playwright/test';

const PAL = `data-palette='{"bg":"#101820","text":"#F5F0EB","accent":"#FF8A4C","surface":"#1E2A36","muted":"#A0A8B0"}'`;
const txt = (role: string, x: number, y: number, size: number, extra = '') => `<text data-role="${role}" data-min-size="40" data-max-lines="4" x="${x}" y="${y}" font-size="${size}" font-family="Schibsted Grotesk" fill="$text"${extra}>${role} words here</text>`;
const design = (type: string, first: boolean, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="${type}"${first ? ' ' + PAL : ''}><rect width="1080" height="1350" fill="$bg"/>${body}</svg>`;

/** Three different "reference" answers: where the cover and content text sit differs a lot between them. */
const ANSWERS: Record<string, string> = {
  'ref-a.jpg': design('cover', true, `<circle cx="900" cy="220" r="120" fill="$accent"/>${txt('title', 80, 220, 110)}${txt('body', 80, 1100, 44)}`) + design('content', false, `${txt('title', 80, 140, 70)}${txt('body', 80, 360, 44)}`),
  'ref-b.jpg': design('cover', true, `<path d="M0 900 L1080 700 L1080 1350 L0 1350 Z" fill="$accent"/>${txt('title', 540, 640, 120, ' text-anchor="middle"')}${txt('body', 540, 1150, 44, ' text-anchor="middle"')}`) + design('content', false, `${txt('title', 80, 300, 70)}${txt('body', 560, 700, 44)}`),
  'ref-c.jpg': design('cover', true, `<ellipse cx="200" cy="1100" rx="260" ry="160" fill="$accent"/>${txt('title', 80, 880, 100)}${txt('body', 80, 1260, 40)}`) + design('content', false, `${txt('title', 80, 1000, 70)}${txt('body', 80, 120, 44)}`),
};

test.beforeEach(async ({ page }) => {
  await page.goto('/images/carousel');
});

test('the prompt has no example compositions: the cover copies the reference, the other types extend its grid', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const P = await import('/src/reference/pack.ts');
    const ref = P.buildPackPrompt({ kind: 'reference', types: ['cover', 'step'] });
    const desc = P.buildPackPrompt({ kind: 'description', types: ['cover'], description: 'warm' });
    return { ref, desc };
  });
  for (const p of [r.ref, r.desc]) {
    expect(p).not.toMatch(/title low and big|huge number on the left|column of items on a list|giant figure centred/);
    expect(p).toContain('EVERY slide type must have a different composition');
  }
  expect(r.ref).toMatch(/COVER copies the reference/);
  expect(r.ref).toMatch(/extends the reference's own grid, spacing, type scale and motifs/);
});

test('packs built by the code are marked Basic, and a pack from a reference is not', async ({ page }) => {
  const r = await page.evaluate(async ([a]) => {
    const P = await import('/src/reference/pack.ts');
    const C = await import('/src/carousel/render.ts');
    const basic = P.packFromStyle(C.getStyles().styles.find((s) => s.spec.name === 'editorial-collage')!.spec);
    const model = await P.parsePack(a, 'm');
    return { basic: basic.basic, note: basic.notes[0], model: model.ok ? model.pack.basic : 'failed' };
  }, [ANSWERS['ref-a.jpg']] as const);
  expect(r.basic).toBe(true);
  expect(r.note).toMatch(/^Basic pack/);
  expect(r.model).toBeUndefined();
});

test('crossPackCheck finds packs with the same layout for a slide type, and nothing else', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const P = await import('/src/reference/pack.ts');
    const C = await import('/src/carousel/render.ts');
    const styles = C.getStyles().styles.filter((s) => !s.spec.name.startsWith('mine-')).slice(0, 2);
    const a = { ...P.packFromStyle(styles[0].spec), name: 'A' };
    const b = { ...P.packFromStyle(styles[1].spec), name: 'B' };
    const alike = P.crossPackCheck([a, b]);
    // B with its cover and content moved far from A's.
    const moved = { ...b, designs: { ...b.designs, cover: b.designs.cover!.map((l) => (l.kind === 'text' ? { ...l, y: l.y > 600 ? 120 : 900, x: l.x + 300 } : l)), content: b.designs.content!.map((l) => (l.kind === 'text' ? { ...l, y: 1000 - l.y / 2, x: l.x + 300 } : l)) } };
    const after = P.crossPackCheck([a, moved]);
    return { alike: alike.map((x) => x.type), after: after.map((x) => x.type), single: P.crossPackCheck([a]).length };
  });
  expect(r.alike, 'two standard-composition packs match on every type').toEqual(['cover', 'step', 'content', 'list', 'stat', 'quote', 'cta']);
  expect(r.after).not.toContain('cover');
  expect(r.after).not.toContain('content');
  expect(r.single).toBe(0);
});

test('packs built from three different references (mocked reader, no model) share no cover or content composition', async ({ page }) => {
  const r = await page.evaluate(async (answers) => {
    const P = await import('/src/reference/pack.ts');
    const calls: { name: string; prompt: string }[] = [];
    const reader = { id: 'fake', label: 'fake', read: async (c: { prompt: string; images: { name: string }[] }) => (calls.push({ name: c.images[0].name, prompt: c.prompt }), { text: '<inventory>\n1. text: title\n</inventory>\n' + (answers as Record<string, string>)[c.images[0].name], ms: 1 }) } as never;
    const sig = new AbortController().signal;
    const packs = [];
    for (const name of Object.keys(answers)) {
      const text = await P.callPack(reader, P.buildPackPrompt({ kind: 'reference', types: ['cover', 'content'] }), [{ name, mime: 'image/jpeg', base64: 'AAAA' } as never], sig);
      const parsed = await P.parsePack(text, name);
      if (!parsed.ok) return { failed: parsed.reasons };
      packs.push(parsed.pack);
    }
    return { calls: calls.length, designs: packs.map((p) => Object.keys(p.designs)), alike: P.crossPackCheck(packs), distinct: packs.map((p) => P.distinctCheck(p).ok) };
  }, ANSWERS);
  expect(r.failed).toBeUndefined();
  expect(r.calls).toBe(3);
  expect(r.designs).toEqual([['cover', 'content'], ['cover', 'content'], ['cover', 'content']]);
  expect(r.alike).toEqual([]);
  expect(r.distinct).toEqual([true, true, true]);
});

test('variants: a repeated type is mirrored and its colours swapped; text stays on the slide at 32 px or more; the pack still passes distinctCheck', async ({ page }) => {
  const R = await page.evaluate(async ([a, mixed]) => {
    const P = await import('/src/reference/pack.ts');
    const pk = (await P.parsePack(a, 'v')) as { ok: true; pack: import('/src/reference/pack.ts').StylePack };
    const withSlot = { ...pk.pack, imageSlots: { ...pk.pack.imageSlots, cover: [{ id: 'cover-inset', kind: 'inset', x: 600, y: 700, w: 400, h: 400, mask: 'rect', fit: 'cover', focal: { x: 0.5, y: 0.5 } }] } } as import('/src/reference/pack.ts').StylePack;
    const slide = { type: 'cover', kicker: 'K', headline: 'A headline that makes people stop', sub: 'And a line under it' };
    const out: Record<string, unknown> = {};
    for (const n of [0, 1, 2, 3, 4]) {
      const s = P.packSlide(withSlot, 'cover', slide, '@me', { nth: n });
      const texts = s.layers.filter((l) => l.kind === 'text') as unknown as { x: number; width: number; style: { size: number; align: string } }[];
      out[n] = { notes: s.notes.filter((x) => x.startsWith('Variant')), bg: s.bg ?? null, titleX: Math.round(texts[0].x), inside: texts.every((t) => t.x >= -1 && t.x + t.width <= 1081), min: Math.min(...texts.map((t) => t.style.size)), flipped: (s.faithful ?? '').includes('scale(-1,1)'), tspans: (s.faithful ?? '').includes('<tspan'), empty: s.emptySlots?.map((e) => Math.round(e.x)) ?? null };
    }
    const mix = (await P.parsePack(mixed, 'mix')) as { ok: true; pack: import('/src/reference/pack.ts').StylePack };
    const m1 = P.packSlide(mix.pack, 'cover', slide, '@me', { nth: 1 });
    return { out, distinct: P.distinctCheck(pk.pack).ok, mixedNotes: m1.notes.filter((x) => x.startsWith('Variant')), mixedFlip: (m1.faithful ?? '').includes('scale(-1,1)') };
  }, [ANSWERS['ref-a.jpg'], design('cover', true, `<g id="mixed"><circle cx="900" cy="220" r="120" fill="$accent"/>${txt('title', 80, 220, 110)}</g>${txt('body', 80, 1100, 44)}`)] as const);
  const o = R.out as Record<string, { notes: string[]; bg: string | null; titleX: number; inside: boolean; min: number; flipped: boolean; tspans: boolean; empty: number[] | null }>;
  expect(o[0].notes).toEqual([]);
  expect(o[1].notes[0]).toMatch(/mirrored/);
  expect(o[1].titleX, 'the text anchor moved to the other side').not.toBe(o[0].titleX);
  expect(o[1].flipped, 'the drawing is flipped, the letters are not').toBe(true);
  expect(o[1].tspans).toBe(true);
  expect(o[1].empty![0], 'the picture spot moved to the other side').toBe(1080 - 600 - 400);
  expect(o[0].empty![0]).toBe(600);
  expect(o[2].notes[0]).toMatch(/colours swapped/);
  expect(o[2].bg).toBe('#1E2A36');
  expect(o[3].notes[0]).toMatch(/mirrored and colours swapped/);
  expect(o[4].notes).toEqual([]);
  for (const n of ['0', '1', '2', '3', '4']) {
    expect(o[n].inside, `variant ${n}: text on the slide`).toBe(true);
    expect(o[n].min, `variant ${n}: text 32 px or more`).toBeGreaterThanOrEqual(32);
  }
  expect(R.distinct).toBe(true);
  expect(R.mixedNotes, 'a group that mixes drawing and text cannot be flipped safely: no variant').toEqual([]);
  expect(R.mixedFlip).toBe(false);
});

test('a carousel with repeated slide types gets variants; the first slide of each type is as drawn', async ({ page }) => {
  const r = await page.evaluate(async ([a]) => {
    const P = await import('/src/reference/pack.ts');
    const T = await import('/src/reference/templates.ts');
    const B = await import('/src/reference/blank.ts');
    const Dc = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    const C = await import('/src/carousel/render.ts');
    await T.ensureTemplatesLoaded();
    const parsed = (await P.parsePack(a, 'rep')) as { ok: true; pack: import('/src/reference/pack.ts').StylePack };
    const tpl = await T.saveTemplate({ name: 'rep pack', target: 'carousel', spec: { ...B.blankStyle(), name: T.styleNameFor('rep') }, preview: '', pack: parsed.pack });
    const content = (h: string) => ({ type: 'content', headline: h, body: 'Put the thing you need where you will see it.' });
    const script = { ...S.EXAMPLE, slides: [{ type: 'cover', kicker: 'K', headline: 'Why it fails', sub: 'And the fix' }, content('One'), content('Two'), content('Three'), content('Four')] };
    const composed = C.composeDoc({ ...Dc.emptyDoc(tpl.spec.name), script } as never);
    const notes = composed.slides.map((s) => ((s as unknown as { notes?: string[] }).notes ?? []).filter((x) => x.startsWith('Variant')).join(' '));
    await T.deleteTemplate(tpl.id);
    return notes;
  }, [ANSWERS['ref-a.jpg']] as const);
  expect(r[0]).toBe('');
  expect(r[1]).toBe('');
  expect(r[2]).toMatch(/mirrored/);
  expect(r[3]).toMatch(/colours swapped/);
  expect(r[4]).toMatch(/mirrored and colours swapped/);
});

test('a carousel that still names the removed active reference draws with the default style instead of failing', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const Dc = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    const C = await import('/src/carousel/render.ts');
    const doc = { ...Dc.emptyDoc('mine-reference-active'), script: S.EXAMPLE };
    try {
      return { slides: C.composeDoc(doc as never).slides.length, error: '' };
    } catch (e) {
      return { slides: 0, error: String((e as Error).message) };
    }
  });
  expect(r.error).toBe('');
  expect(r.slides).toBeGreaterThan(0);
});
