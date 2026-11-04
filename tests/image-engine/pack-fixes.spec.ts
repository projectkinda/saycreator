// Step 17b item 7: pack problems found in 17c. Long lists stay readable, blocks of empty slots are hidden, every design needs text slots (one retry), and packs can be renamed, exported and imported.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fakeReader, makeReference, refineAnswer, ROOT } from './reference-helpers';

test.setTimeout(180_000);
const EXAMPLE = fs.readFileSync(path.join(ROOT, 'docs', 'recreate-example.svg'), 'utf8');

const svg = (type: string, withText: boolean, x: number, i: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="${type}"${i === 0 ? ` data-palette='{"bg":"#101820","text":"#F5F0EB","accent":"#FF8A4C"}'` : ''}><rect width="1080" height="1350" fill="$bg"/><circle cx="${900 - i * 90}" cy="200" r="40" fill="$accent"/>${withText ? `<text data-role="title" data-min-size="48" data-max-lines="3" x="${x}" y="${300 + i * 200}" font-size="80" font-family="Schibsted Grotesk" fill="$text">${type} words</text>` : ''}</svg>`;

test('a long list keeps readable items: the slot grows or the list splits in two columns, never tiny', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const P = await import('/src/reference/pack.ts');
    const C = await import('/src/carousel/render.ts');
    const spec = C.getStyles().styles.find((s) => s.spec.name === 'editorial-collage')!.spec;
    const pack = P.packFromStyle(spec);
    const items = (n: number) => Array.from({ length: n }, (_, i) => `Item number ${i + 1} of the list`);
    const out: Record<string, unknown> = {};
    for (const n of [3, 5, 7, 12]) {
      const s = P.packSlide(pack, 'checklist', { type: 'checklist', headline: 'Before you post', items: items(n) }, '@me');
      const body = s.layers.filter((l) => l.kind === 'text' && l.name === 'body') as unknown as { x: number; y: number; width: number; height: number; style: { size: number }; text: string }[];
      out[n] = { columns: body.length, sizes: body.map((b) => b.style.size), bottoms: body.map((b) => Math.round(b.y + b.height)), xs: body.map((b) => Math.round(b.x)), lines: body.map((b) => b.text.split('\n').length), notes: s.notes };
    }
    return out;
  });
  for (const n of ['3', '5', '7', '12'] as const) {
    const o = r[n] as { columns: number; sizes: number[]; bottoms: number[] };
    for (const z of o.sizes) expect(z, `${n} items`).toBeGreaterThanOrEqual(40);
    for (const b of o.bottoms) expect(b).toBeLessThanOrEqual(1350 * 0.93 + 2);
  }
  const seven = r['7'] as { columns: number; xs: number[]; lines: number[]; notes: string[] };
  // Seven short items fit this style's list slot at a readable size; a longer list grows the slot or splits in two columns (said in the notes).
  expect(seven.columns).toBeLessThanOrEqual(2);
  const twelve = r['12'] as { columns: number; xs: number[]; lines: number[]; notes: string[]; bottoms: number[] };
  expect(twelve.notes.join(' ')).toMatch(/taller|two columns|smallest readable/);
  if (twelve.columns === 2) {
    expect(twelve.xs[1]).toBeGreaterThan(twelve.xs[0]);
    expect(twelve.lines[0] + twelve.lines[1]).toBe(12);
  }
  if (seven.columns === 2) {
    expect(seven.xs[1]).toBeGreaterThan(seven.xs[0]);
    expect(seven.lines[0] + seven.lines[1]).toBe(7);
  }
});

test('a block or graphic that belongs to an empty slot is hidden with it', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const P = await import('/src/reference/pack.ts');
    const C = await import('/src/carousel/render.ts');
    const pack = P.packFromStyle(C.getStyles().styles.find((s) => s.spec.name === 'editorial-collage')!.spec);
    const vis = (layers: { name?: string; visible?: boolean }[], name: string) => layers.find((l) => l.name === name)?.visible !== false;
    const noCaption = P.packSlide(pack, 'content', { type: 'content', headline: 'Why', body: 'Because.' }, '@me').layers as unknown as { name: string; visible?: boolean }[];
    const withTag = P.packSlide(pack, 'step', { type: 'step', number: 2, headline: 'Do it', body: 'Now.' }, '@me').layers as unknown as { name: string; visible?: boolean }[];
    const noKicker = P.packSlide(pack, 'cta', { type: 'closing', headline: 'Save', cta: 'Follow' }, '').layers as unknown as { name: string; visible?: boolean }[];
    return { corner: vis(noCaption, 'corner'), body: vis(noCaption, 'body'), background: vis(noCaption, 'background'), tagPill: vis(withTag, 'tag-pill'), button: vis(noKicker, 'button') };
  });
  expect(r.corner, 'the block under the empty caption').toBe(false);
  expect(r.body).toBe(true);
  expect(r.background, 'the background is never hidden').toBe(true);
  expect(r.tagPill, 'a tag with words keeps its pill').toBe(true);
  expect(r.button, 'the button behind an empty handle').toBe(false);
});

test('a design with no text slots is asked for once more; the answer is merged, and the extra call is counted', async ({ page }) => {
  let packCalls = 0;
  const rec = await fakeReader(page, (kind: string, _n: number, prompt: string) => {
    if (kind === 'refine') return refineAnswer();
    if (prompt.includes('[pack:new]')) {
      packCalls++;
      if (packCalls === 1) return `${svg('cover', true, 80, 0)}\n${svg('content', false, 80, 1)}`;
      return svg('content', true, 500, 1);
    }
    return EXAMPLE;
  });
  await page.goto('/images/carousel');
  await page.getByText('Match a reference', { exact: true }).click();
  await page.getByLabel('Choose a picture to recreate').setInputFiles(await makeReference(page, { name: 'slide.jpg', kind: 'slide' }));
  await page.getByRole('button', { name: 'Recreate', exact: true }).click();
  await expect(page.getByTestId('recreate-status')).toContainText('compared and corrected once', { timeout: 120_000 });
  const maker = page.getByRole('group', { name: 'Make the rest of the set' });
  await expect(maker.getByRole('status', { name: 'Pack estimate' })).toContainText('2 if a design comes without text');
  const before = rec.reads.length;
  await maker.getByRole('button', { name: 'Make the set' }).click();
  await expect(maker.getByTestId('pack-status')).toContainText('asked once more for content', { timeout: 120_000 });
  expect(rec.reads.length - before).toBe(2);
  expect(rec.reads[rec.reads.length - 1].prompt).toContain('no text slots');
  expect(rec.reads[rec.reads.length - 1].prompt).toContain('Make ONLY the slide types listed above again');
  await expect(maker.getByRole('list', { name: 'Pack slide types' }).getByRole('listitem', { name: 'Design content' })).toBeVisible();
  await expect(maker.getByText(/Pack calls used: 2 of 3/)).toBeVisible();
});

test('a pack can be renamed, exported, deleted and imported again, and it shows with the Mine tag in the style picker', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const T = await import('/src/reference/templates.ts');
    const P = await import('/src/reference/pack.ts');
    const B = await import('/src/reference/blank.ts');
    const C = await import('/src/carousel/render.ts');
    await T.ensureTemplatesLoaded();
    const pack = P.packFromStyle(C.getStyles().styles.find((s) => s.spec.name === 'editorial-collage')!.spec);
    const t = await T.saveTemplate({ name: 'First name', target: 'carousel', spec: { ...B.blankStyle(), name: T.styleNameFor('First name') }, preview: '', pack });
    await T.renameTemplate(t.id, 'Renamed pack');
    const renamed = T.templates().find((x) => x.id === t.id)!;
    const text = await T.exportTemplates([t.id]).text();
    await T.deleteTemplate(t.id);
    const gone = T.templates().length;
    const imp = await T.importTemplates(text);
    const back = imp.added[0];
    return { renamed: renamed.name, packKept: Object.keys(renamed.pack!.designs).length, exported: text.includes('"pack"') && text.includes('"designs"'), gone, added: imp.added.length, rejected: imp.rejected, name: back?.name, designs: Object.keys(back?.pack?.designs ?? {}).length, mine: back?.spec.name.startsWith('mine-'), newName: back?.spec.name !== t.spec.name };
  });
  expect(r.renamed).toBe('Renamed pack');
  expect(r.packKept).toBe(7);
  expect(r.exported).toBe(true);
  expect(r.gone).toBe(0);
  expect(r.rejected).toEqual([]);
  expect(r.added).toBe(1);
  expect(r.name).toBe('Renamed pack');
  expect(r.designs, 'the designs came back with the import').toBe(7);
  expect(r.mine).toBe(true);
  expect(r.newName, 'an imported copy never collides with a style already here').toBe(true);
  await page.reload();
  const picker = page.getByRole('list', { name: 'Styles' });
  await expect(picker.getByText('Renamed pack', { exact: true })).toBeVisible();
  await expect(picker.getByRole('listitem').filter({ hasText: 'Renamed pack' }).getByText('Mine', { exact: true })).toBeVisible();
});
