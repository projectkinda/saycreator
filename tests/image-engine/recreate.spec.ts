// Step 17: Recreate mode. A fake writer answers with the example SVG (no model). The whitelist, the layers, the person's words in them, the cap and the template are tested.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fakeReader, makeReference, refineAnswer, ROOT, storedTemplates } from './reference-helpers';

test.setTimeout(180_000);
const EXAMPLE = fs.readFileSync(path.join(ROOT, 'docsrecreate-example.svg.svg'), 'utf8');

test('the whitelist keeps drawing and drops everything else, and says why a picture is refused', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (example) => {
    const R = await import('/src/reference/recreate.ts');
    const evil = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 686 857" onload="alert(1)">
      <script>alert(2)</script><foreignObject><div>x</div></foreignObject>
      <image href="https://example.com/a.png" width="10" height="10"/><image xlink:href="data:image/png;base64,AAAA" width="10" height="10"/>
      <rect width="686" height="857" fill="#112233" onclick="x()"/>
      <text x="10" y="50" font-size="40" font-family="Comic Sans, cursive" fill="javascript:alert(3)" data-role="title">Hello</text>
      <path d="M0 0 L10 10" stroke="url(https://evil.example/x)"/><circle cx="5" cy="5" r="5" fill="#fff"/></svg>`;
    const a = R.sanitizeSvg(evil);
    const empty = R.sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g/></svg>');
    const none = R.sanitizeSvg('I cannot do that.');
    const big = R.sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${'<rect width="1" height="1"/>'.repeat(9000)}</svg>`);
    const ex = R.sanitizeSvg(example);
    return { svg: a.svg, reasons: a.reasons, empty: empty.reasons, none: none.reasons, big: big.reasons, exStats: ex.stats, exHasStyle: ex.svg?.includes('<style') ?? null, exFill: /fill="#FF8A4C"/.test(ex.svg ?? ''), wished: ex.wished };
  }, EXAMPLE);
  for (const bad of ['script', 'foreignObject', 'onload', 'onclick', 'href', 'data:', 'javascript', 'evil.example', 'example.com', '<image']) expect(r.svg, bad).not.toContain(bad);
  expect(r.svg).toContain('Hello');
  expect(r.svg).toContain('font-family="Instrument Sans"');
  expect(r.reasons.join(' ')).toMatch(/not allowed/);
  expect(r.empty.join(' ')).toMatch(/nearly empty/);
  expect(r.none.join(' ')).toMatch(/no <svg>/);
  expect(r.big.join(' ')).toMatch(/over the/);
  expect(r.exStats.texts).toBe(9);
  expect(r.exHasStyle, 'the style rules are copied onto the elements, then dropped').toBe(false);
  expect(r.exFill, 'the class colours were applied').toBe(true);
});

test('the example becomes layers: a background, text with roles, graphics as paths, palette names; the person\'s words fill the text slots and a long title shrinks and says so', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (example) => {
    const R = await import('/src/reference/recreate.ts');
    const res = await R.answerToLayers(example, { w: 1080, h: 1350, ownRoles: [] });
    if (!res.ok) return { ok: false, reasons: res.reasons };
    const L = res.result.layers;
    const spec = { layers: L, palette: res.result.palette, canvas: { w: 1080, h: 1350 }, notes: [] };
    const filled = R.fillRecreate(spec, { kicker: '@maya', tag: '', title: 'A much longer headline than the reference had, to see it fit', body: 'one\ntwo', caption: '', number: '' });
    return {
      ok: true,
      kinds: L.map((l) => l.kind),
      names: [...new Set(L.map((l) => l.name))],
      title: L.find((l) => l.name === 'title'),
      bg: L.find((l) => l.id === 'bg'),
      palette: res.result.palette,
      tokens: L.some((l) => JSON.stringify(l).includes('"$')),
      filledTitle: (filled.layers.find((l) => l.kind === 'text' && l.name === 'title') as { text: string } | undefined)?.text,
      notes: filled.notes,
      hidden: filled.layers.filter((l) => l.visible === false).length,
      first: L[0]?.kind,
    };
  }, EXAMPLE);
  expect(r.ok, JSON.stringify(r)).toBe(true);
  expect(r.kinds!.filter((k) => k === 'path').length).toBeGreaterThan(10);
  expect(r.kinds!.filter((k) => k === 'text').length).toBeGreaterThanOrEqual(4);
  expect(r.bg).toMatchObject({ kind: 'shape', fill: '$bg' });
  expect(r.palette).toMatchObject({ bg: '#F5F0EB' });
  expect(r.tokens).toBe(true);
  expect(r.title).toMatchObject({ kind: 'text', text: 'Focus Block Example' });
  expect((r.title as { style: { font: string } }).style.font).toBe('Instrument Serif Italic');
  expect(r.filledTitle).toContain('much longer headline');
  expect(r.notes!.join(' ')).toMatch(/title text was made smaller|title text wraps/);
  expect(r.hidden, 'roles with no words are hidden, not left with the reference text').toBeGreaterThan(0);
});

test('Recreate in the carousel: one read, one look-and-fix by itself, one Improve, then the cap; layers are listed and editable with undo; a template keeps no pixels', async ({ page }) => {
  const rec = await fakeReader(page, (kind: string) => (kind === 'refine' ? refineAnswer() : EXAMPLE));
  await page.goto('/images/carousel');
  await page.getByText('Match a reference', { exact: true }).click();
  const mode = page.getByRole('radiogroup', { name: 'Reference mode' });
  await expect(mode.getByRole('radio', { name: /^Recreate/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Choose a picture to recreate').setInputFiles(await makeReference(page, { name: 'slide.jpg', kind: 'slide' }));
  const calls = page.getByRole('status', { name: 'Recreate model calls' });
  await expect(calls).toHaveText('Model calls: 0 of 3');
  await page.getByRole('button', { name: 'Recreate', exact: true }).click();
  await expect(calls).toHaveText('Model calls: 2 of 3', { timeout: 120_000 });
  await expect(page.getByTestId('recreate-status')).toContainText('compared and corrected once', { timeout: 60_000 });
  expect(rec.reads).toHaveLength(2);
  expect(rec.reads[0].prompt).toContain('[recreate:new]');
  expect(rec.reads[0].prompt).toContain('Instrument Serif Italic');
  expect(rec.reads[0].images).toHaveLength(1);
  expect(rec.reads[1].prompt).toContain('[recreate:fix]');
  expect(rec.reads[1].images, 'the reference and the render go back').toHaveLength(2);
  await expect(page.getByRole('group', { name: 'Reference' })).toContainText('Recreated look');
  // Layers by role and name, editable by hand, with undo.
  const layers = page.getByRole('list', { name: 'Layers' });
  await expect(layers.getByRole('listitem', { name: 'Layer title' })).toBeVisible();
  const before = await layers.getByRole('listitem').count();
  await page.getByRole('button', { name: 'Delete title' }).click();
  await expect(layers.getByRole('listitem')).toHaveCount(before - 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(layers.getByRole('listitem')).toHaveCount(before);
  // One more correction with the person's words, then the limit.
  await page.getByLabel('Your words for the correction').fill('the title is smaller than mine');
  await page.getByRole('button', { name: /^Improve/ }).click();
  await expect(calls).toHaveText('Model calls: 3 of 3', { timeout: 120_000 });
  expect(rec.reads[2].prompt).toContain('the title is smaller than mine');
  await expect(page.getByRole('button', { name: /^Improve/ })).toBeDisabled();
  await expect(page.getByText(/The limit of 3 model calls/)).toBeVisible();
  // Save: layers and palette only.
  await page.getByRole('button', { name: 'Save as template' }).click();
  await expect(page.getByTestId('recreate-status')).toContainText('no reference pixels');
  const stored = await storedTemplates(page);
  expect(stored).toHaveLength(1);
  const t = stored[0] as { recreate?: unknown };
  expect(t.recreate).toBeTruthy();
  expect(JSON.stringify(t.recreate)).not.toMatch(/data:|blob:/);
  expect(rec.reads).toHaveLength(3);
});
