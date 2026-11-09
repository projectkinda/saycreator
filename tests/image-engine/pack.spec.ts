// Step 17c: style packs. A fake writer answers with several SVG designs (no model). Parsing and limits, the distinct-composition check, Make the set (estimate first),
// a pack from a description, Rebuild as pack on a stored style, and applying a pack to a generated carousel with no model call.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fakeReader, makeReference, refineAnswer, ROOT, storedTemplates } from './reference-helpers';

test.setTimeout(180_000);
const EXAMPLE = fs.readFileSync(path.join(ROOT, 'docs', 'recreate-example.svg'), 'utf8');

// Where each slide type puts its text: different on every type, so the composition check passes.
const POS: Record<string, [string, number, number, number][]> = {
  cover: [['title', 80, 1000, 90], ['body', 80, 1180, 44]],
  step: [['number', 80, 330, 260], ['title', 560, 300, 70], ['body', 560, 560, 44]],
  content: [['title', 80, 140, 64], ['body', 80, 420, 44]],
  list: [['title', 540, 160, 60], ['body', 540, 520, 46]],
  stat: [['number', 120, 760, 300], ['title', 120, 1000, 56]],
  quote: [['title', 140, 480, 70], ['caption', 140, 1160, 36]],
  cta: [['title', 80, 300, 100], ['kicker', 600, 1240, 40]],
};
const packSvgs = (types: string[]) =>
  types
    .map((t, i) => {
      const slots = (POS[t] ?? POS.content).map(([role, x, y, size]) => `<text data-role="${role}" data-min-size="40" data-max-lines="3" x="${x}" y="${y}" font-size="${size}" font-family="Schibsted Grotesk" font-weight="700" fill="$text">${role} words</text>`).join('');
      const pal = i === 0 ? ` data-palette='{"bg":"#101820","text":"#F5F0EB","accent":"#FF8A4C","surface":"#1B2733","muted":"#9AA5B1"}'` : '';
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="${t}"${pal}><rect width="1080" height="1350" fill="$bg"/><g id="motif-${t}"><circle cx="${900 - i * 90}" cy="${160 + i * 40}" r="46" fill="$accent"/></g>${slots}</svg>`;
    })
    .join('\n');
const answer = (kind: string, _n: number, prompt: string) => {
  if (kind === 'refine') return refineAnswer();
  if (prompt.includes('[pack:new]')) {
    const m = /in this order: ([a-z, ]+)\./.exec(prompt);
    return packSvgs((m?.[1] ?? 'cover, content').split(',').map((x) => x.trim()));
  }
  return EXAMPLE;
};

test('a pack answer is parsed into designs with slot limits and palette names; an answer with no palette is refused; identical compositions are flagged', async ({ page }) => {
  await page.goto('/images/carousel');
  const svgs = packSvgs(['cover', 'content', 'stat']);
  const r = await page.evaluate(async (svgs) => {
    const P = await import('/src/reference/pack.ts');
    const ok = await P.parsePack(svgs, 'Test pack');
    const noPal = await P.parsePack(svgs.replace(/data-palette='[^']*'/, ''), 'x');
    const none = await P.parsePack('Sorry, I cannot.', 'x');
    if (!ok.ok) return { ok: false };
    const cover = ok.pack.designs.cover!;
    const title = cover.find((l) => l.name === 'title') as { slot?: { minSize?: number; maxLines?: number }; style: { color: string } };
    const twin = { ...ok.pack, designs: { cover: ok.pack.designs.cover, other: ok.pack.designs.cover } } as never;
    return { ok: true, types: Object.keys(ok.pack.designs), palette: ok.pack.palette, slot: title.slot, colour: title.style.color, distinct: P.distinctCheck(ok.pack).ok, twin: P.distinctCheck(twin), noPal: noPal.ok ? 'accepted' : noPal.reasons.join(' '), none: none.ok ? 'accepted' : none.reasons.join(' ') };
  }, svgs);
  expect(r.ok).toBe(true);
  expect(r.types).toEqual(['cover', 'content', 'stat']);
  expect(r.palette).toMatchObject({ bg: '#101820', accent: '#FF8A4C' });
  expect(r.slot).toMatchObject({ minSize: 40, maxLines: 3 });
  expect(r.colour, 'colours stay palette names').toBe('$text');
  expect(r.distinct).toBe(true);
  expect(r.twin!.ok).toBe(false);
  expect(r.noPal).toMatch(/data-palette/);
  expect(r.none).toMatch(/no <svg>/);
});

test('Rebuild as pack on a stored style: 7 designs with different compositions, the style stays, and the pack fits a 5-slide carousel with no model call', async ({ page }) => {
  const readerCalls: string[] = [];
  page.on('request', (q) => /\/__[a-z-]+\//.test(q.url()) && q.method() === 'POST' && readerCalls.push(q.url()));
  await page.addInitScript(() => localStorage.setItem('creator.devtools', '1')); // the Rebuild buttons are developer tools since round 1
  await page.goto('/images/carousel');
  await page.getByRole('button', { name: /^Rebuild the .* style as a pack$/ }).first().click();
  await expect(page.getByTestId('pack-note')).toContainText('each with its own composition');
  const stored = await storedTemplates(page);
  expect(stored).toHaveLength(1);
  const t = stored[0] as { spec: { name: string }; pack: { designs: Record<string, unknown[]> } };
  expect(Object.keys(t.pack.designs).sort()).toEqual(['content', 'cover', 'cta', 'list', 'quote', 'stat', 'step']);
  expect(JSON.stringify(t.pack)).not.toMatch(/data:|blob:/);
  await expect(page.getByRole('button', { name: /^Rebuild the .* style as a pack$/ }).first()).toBeVisible();
  const r = await page.evaluate(async (styleName) => {
    const D = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    const C = await import('/src/carousel/render.ts');
    const script = {
      ...S.EXAMPLE,
      slides: [
        { type: 'cover', kicker: 'Kick', headline: 'A cover headline that is rather long and needs to wrap and fit its place', sub: 'Sub line' },
        { type: 'step', number: 3, headline: 'Short step', body: 'Do this first. Then do that. Then check the result against what you wanted at the start.' },
        { type: 'checklist', headline: 'Before you post', items: ['Read it out loud', 'Cut one sentence', 'Check the first line', 'Add one example', 'Ask one friend', 'Sleep on it', 'One more item than the list can take'] },
        { type: 'stat', kicker: 'Numbers', value: '87%', label: 'of people skim', note: 'before reading' },
        { type: 'closing', headline: 'Save this', cta: 'Follow for more' },
      ],
    };
    const out = C.composeDoc({ ...D.emptyDoc(styleName), script } as never);
    const res = [];
    for (const s of out.slides) {
      const layers = s.plan.layers as unknown as { kind: string; name?: string; visible?: boolean; text?: string; slot?: unknown; style?: { size: number } }[];
      const texts = layers.filter((l) => l.kind === 'text' && l.visible !== false);
      const blob = await C.renderer.preview(s.plan, 0.25);
      res.push({ type: s.type, titles: texts.filter((l) => l.name === 'title').map((l) => l.text), sizes: texts.map((l) => l.style!.size), slotLeft: layers.some((l) => 'slot' in l), bytes: blob.size, hiddenTag: layers.some((l) => l.name === 'tag' && l.visible === false), notes: ((s as unknown as { notes?: string[] }).notes ?? []).length });
    }
    return res;
  }, t.spec.name);
  expect(r).toHaveLength(5);
  for (const s of r) {
    expect(s.bytes, `${s.type} draws`).toBeGreaterThan(1000);
    expect(s.slotLeft, 'the slot limits never reach the plan').toBe(false);
    for (const z of s.sizes) expect(z).toBeGreaterThanOrEqual(32);
  }
  expect(r[0].titles[0]).toContain('A cover headline');
  expect(r[1].titles[0]).toBe('Short step');
  expect(readerCalls, 'no model call to apply a pack').toHaveLength(0);
});

test('Make the rest of the set (Quick) from a recreated slide: the estimate comes first, one call, a sheet of designs, saved as a template with the Mine tag; a description makes a full pack', async ({ page }) => {
  const rec = await fakeReader(page, answer);
  await page.addInitScript(() => localStorage.setItem('creator.devtools', '1')); // Match a reference is a developer tool since round 1
  await page.goto('/images/carousel');
  await page.getByText('Match a reference', { exact: true }).click();
  await page.getByLabel('Choose a picture to recreate').setInputFiles(await makeReference(page, { name: 'slide.jpg', kind: 'slide' }));
  await page.getByRole('button', { name: 'Recreate', exact: true }).click();
  await expect(page.getByTestId('recreate-status')).toContainText('compared and corrected once', { timeout: 120_000 });
  const maker = page.getByRole('group', { name: 'Make the rest of the set' });
  await expect(maker.getByRole('status', { name: 'Pack estimate' })).toContainText('1 model call');
  await expect(maker.getByRole('status', { name: 'Pack estimate' })).toContainText('cover, content');
  const before = rec.reads.length;
  await maker.getByRole('button', { name: 'Make the set' }).click();
  await expect(maker.getByTestId('pack-status')).toContainText('slide designs made', { timeout: 120_000 });
  expect(rec.reads.length - before, 'one call for the whole set').toBe(1);
  const last = rec.reads[rec.reads.length - 1];
  expect(last.prompt).toContain('[pack:new]');
  expect(last.prompt).toContain('EVERY slide type must have a different composition');
  expect(last.prompt).toContain('<svg'); // the first slide design is sent too
  expect(last.images).toHaveLength(1);
  const sheet = maker.getByRole('list', { name: 'Pack slide types' });
  await expect(sheet.getByRole('listitem', { name: 'Design cover' })).toBeVisible();
  await expect(sheet.getByRole('listitem', { name: 'Design content' })).toBeVisible();
  await maker.getByLabel('Name of the pack').fill('Borcelle pack');
  await maker.getByRole('button', { name: 'Save pack as template' }).click();
  await expect(maker.getByTestId('pack-status')).toContainText('Mine tag');
  const stored = await storedTemplates(page);
  expect(stored).toHaveLength(1);
  expect(Object.keys((stored[0] as { pack: { designs: object } }).pack.designs).sort()).toEqual(['base', 'content', 'cover']);
  // The description path: a full set in one call.
  const box = page.getByLabel('Describe the look', { exact: true });
  await box.fill('Dark navy, warm orange accent, big friendly headlines');
  const dmaker = page.getByRole('group', { name: 'Make a pack from the description' });
  await dmaker.getByRole('radio', { name: /^Full set/ }).click();
  await expect(dmaker.getByRole('status', { name: 'Pack estimate' })).toContainText('7 designs');
  await dmaker.getByRole('button', { name: 'Make the set' }).click();
  await expect(dmaker.getByTestId('pack-status')).toContainText('7 slide designs made', { timeout: 120_000 });
  expect(rec.reads[rec.reads.length - 1].prompt).toContain('Dark navy, warm orange accent');
  await expect(dmaker.getByRole('list', { name: 'Pack slide types' }).getByRole('listitem')).toHaveCount(7);
  await expect(dmaker.getByText(/share a composition/)).toHaveCount(0);
});

test('a text slot never reaches past the slide edge, whatever the sample words measured', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const P = await import('/src/reference/pack.ts');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="cover" data-palette=\'{"bg":"#101820","text":"#F5F0EB"}\'><rect width="1080" height="1350" fill="$bg"/><text data-role="title" data-min-size="48" data-max-lines="3" x="700" y="400" font-size="90" font-family="Schibsted Grotesk" font-weight="700" fill="$text">A sample title that runs far past the right edge of the slide</text><text data-role="body" x="40" y="900" font-size="44" font-family="Instrument Sans" fill="$text">Body</text></svg>';
    const p = await P.parsePack(svg, 'edge');
    if (!p.ok) return { ok: false };
    const s = P.packSlide(p.pack, 'cover', { type: 'cover', headline: 'A different, quite long headline for this slide that must wrap', sub: 'x' }, '@me');
    const t = s.layers.find((l) => l.kind === 'text' && (l as { text: string }).text.startsWith('A different')) as { x: number; width: number };
    return { ok: true, right: t.x + t.width };
  });
  expect(r.ok).toBe(true);
  expect(r.right).toBeLessThanOrEqual(1080);
});
