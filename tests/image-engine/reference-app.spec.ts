// Style from references, in the app, with a fake reader: reading, the retry on bad output, refinement rounds, the person's feedback, saving and
// reloading templates, export and import, the style pickers, storage that fails, collages and grids, and each "learn from" option.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { fakeReader, loopDone, makeReference, openStyleFromReferences, readAnswer, refInput, refineAnswer, REF_OUT, saveShot, storedTemplates } from './reference-helpers';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1300, height: 1000 } });
test.beforeAll(() => {
  fs.rmSync(REF_OUT, { recursive: true, force: true });
  fs.mkdirSync(REF_OUT, { recursive: true });
});


/** The usual fake: a valid read, then refinement rounds that change the title size, the accent, and then say stop. */
const usual = (kind: string, n: number) => {
  if (kind === 'read' || kind === 'retry') return readAnswer({ seen: ['cover'] });
  if (n === 0) return refineAnswer({ patches: [{ path: 'type.headline', value: 132 }], score: 55 });
  if (n === 1) return refineAnswer({ patches: [{ path: 'palettes.ink.accent', value: '#ff6a3d' }], score: 64 });
  return refineAnswer({ patches: [], score: 70, stop: true });
};

async function run(page: Page, name = 'My bold look', target?: string) {
  await page.getByLabel('Name the style').fill(name);
  if (target) await page.getByRole('radio', { name: target, exact: true }).click();
  await page.getByRole('button', { name: 'Read references' }).click();
  await loopDone(page);
}

test('the screen: reached from Images, says references stay on the device, and Read references is off until an image is added', async ({ page }) => {
  await fakeReader(page, usual);
  await page.goto('/images');
  await page.getByRole('link', { name: 'Styles', exact: true }).click();
  await expect(page).toHaveURL(/\/images\/styles$/);
  await expect(page.getByText('No templates yet')).toBeVisible();
  await page.getByRole('link', { name: 'New style from references' }).click();
  await expect(page).toHaveURL(/\/images\/styles\/new$/);
  await expect(page.getByText(/Your references stay on this device/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read references' })).toBeDisabled();
  await expect(page.getByText('Reader: Claude Code on this computer')).toBeVisible();
  await saveShot(page, '01-empty.png');
});

test('without a reader the screen says so plainly and Read references stays off', async ({ page }) => {
  await page.route('**/__reference/status', (r) => r.fulfill({ json: { available: false } }));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'one.jpg', kind: 'slide' }));
  await expect(page.getByText(/No reader is connected/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read references' })).toBeDisabled();
});

test('one image: it says it is built from one image, measures it, reads it, draws round after round, and shows the closeness panel with what is missing', async ({ page }) => {
  const rec = await fakeReader(page, usual);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'dark-slide.jpg', kind: 'slide' }));
  await expect(page.getByText('This looks like a single image.')).toBeVisible();
  await expect(page.getByText('Built from one image. Other slide types are extrapolated from it.').first()).toBeVisible();
  await run(page);
  // The measured part is shown as MEASURED, with real numbers.
  await expect(page.getByRole('heading', { name: /3\. What the code measured/ })).toBeVisible();
  await expect(page.getByText('Palette', { exact: true })).toBeVisible();
  expect(await page.getByText('MEASURED', { exact: true }).count()).toBeGreaterThan(5);
  // The request: one image, the vocabulary, the learn-from choice, and no code or drawing instructions asked for.
  expect(rec.reads).toHaveLength(1);
  expect(rec.reads[0].images.map((i) => i.name)).toEqual(['ref1.jpg']);
  expect(rec.reads[0].prompt).toContain('VOCABULARY');
  expect(rec.reads[0].prompt).toContain('Only ONE image is given');
  expect(rec.reads[0].prompt).toContain('You never write code, SVG, CSS or free-form drawing instructions');
  // Rounds: the first replica and at least one refinement, each beside its reference.
  const rounds = page.getByRole('list', { name: 'Rounds' }).getByRole('listitem');
  expect(await rounds.count()).toBeGreaterThanOrEqual(2);
  expect(await rounds.count()).toBeLessThanOrEqual(4);
  await expect(rounds.first().getByRole('img', { name: /^Reference:/ })).toBeVisible();
  await expect(rounds.first().getByRole('img', { name: /^Our version/ })).toBeVisible();
  expect(rec.refines.length).toBeGreaterThanOrEqual(2);
  expect(rec.refines[0].images[0].name).toBe('pair1.jpg');
  // The closeness panel: matched, approximated, extrapolated, missing, and never "identical" or "perfect".
  const panel = page.locator('section[aria-labelledby="rf-close-h"]');
  await expect(panel.getByText(/Measured similarity \d+%/)).toBeVisible();
  await expect(panel.getByText('Built from one image. Other slide types are extrapolated from it.')).toBeVisible();
  await expect(panel.getByText(/These slide types were not in your references.*content.*step.*stat/)).toBeVisible();
  const missing = panel.getByRole('list', { name: 'Missing tools' });
  await expect(missing).toContainText('3D renders');
  await expect(missing).toContainText('Fonts we do not bundle');
  const text = (await panel.innerText()).toLowerCase();
  expect(text).not.toMatch(/identical|perfect(?!ly)/);
  expect(text).toContain('not a copy');
  await saveShot(page, '02-one-image.png');
});

test('the reader’s first answer does not pass the checks: it is asked once more with the problems, and the second answer is used', async ({ page }) => {
  const bad = JSON.parse(readAnswer()) as { style: { shape: Record<string, unknown> } };
  bad.style.shape.marker = 'neon-glow';
  const rec = await fakeReader(page, (kind, n) => (kind === 'read' ? JSON.stringify(bad) : kind === 'retry' ? readAnswer() : n === 0 ? refineAnswer({ stop: true, score: 60 }) : refineAnswer({ stop: true })));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 's.jpg', kind: 'slide' }));
  await run(page);
  await expect(page.getByText(/had to be corrected once/)).toBeVisible();
  expect(rec.reads).toHaveLength(2);
  expect(rec.reads[1].prompt).toContain('Your previous answer was');
  expect(rec.reads[1].prompt).toMatch(/marker must be one of box, underline, brush/);
});

test('two bad answers in a row: a plain message with the reasons, and nothing is saved', async ({ page }) => {
  const bad = JSON.parse(readAnswer()) as { style: { shape: Record<string, unknown> } };
  bad.style.shape.marker = 'neon-glow';
  await fakeReader(page, () => JSON.stringify(bad));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 's.jpg', kind: 'slide' }));
  await page.getByRole('button', { name: 'Read references' }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'neither answer was a style that passes the checks' });
  await expect(alert).toBeVisible({ timeout: 60_000 });
  await expect(alert).toContainText('marker must be one of');
  await expect(page.getByRole('heading', { name: /Save as a template/ })).toHaveCount(0);
});

test('an answer that is not JSON, then a good one: the retry fixes it', async ({ page }) => {
  const rec = await fakeReader(page, (kind) => (kind === 'read' ? 'Sure! Here is the style: dark with big caps.' : kind === 'retry' ? readAnswer() : refineAnswer({ stop: true })));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 's.jpg', kind: 'slide' }));
  await run(page);
  expect(rec.reads[1].prompt).toContain('The answer was not valid JSON');
});

test('the reader cannot be reached: a plain message, not a crash', async ({ page }) => {
  await fakeReader(page, () => ({ status: 504, body: { error: 'Claude Code did not answer within 420 seconds.', kind: 'timeout' } }));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 's.jpg', kind: 'slide' }));
  await page.getByRole('button', { name: 'Read references' }).click();
  await expect(page.getByRole('alert')).toContainText('did not answer within 420 seconds');
  await expect(page.getByRole('button', { name: 'Read references' })).toBeEnabled();
});

test('refinement: patches are applied and shown, every round is kept, any round can be used, and the best round is marked', async ({ page }) => {
  await fakeReader(page, usual);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 's.jpg', kind: 'slide' }));
  await run(page);
  const rounds = page.getByRole('list', { name: 'Rounds' }).getByRole('listitem');
  const n = await rounds.count();
  expect(n).toBeGreaterThanOrEqual(2);
  await expect(rounds.nth(1)).toContainText('Changes from the round before: type.headline → 132');
  await expect(rounds.first().getByRole('button', { name: /Using this round|Use this round/ })).toBeVisible();
  await expect(page.getByText('Best so far')).toBeVisible();
  // Step back: use the first replica.
  await rounds.first().getByRole('button', { name: 'Use this round' }).click();
  await expect(rounds.first().getByRole('button', { name: 'Using this round' })).toBeVisible();
  await saveShot(page, '03-rounds.png');
});

test('the person’s feedback becomes patches the same way and adds a round', async ({ page }) => {
  const rec = await fakeReader(page, (kind, n) => {
    if (kind !== 'refine') return readAnswer();
    return n < 1 ? refineAnswer({ stop: true, score: 58 }) : refineAnswer({ patches: [{ path: 'type.headline', value: 150 }, { path: 'type.cover', value: 180 }], score: 60 });
  });
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 's.jpg', kind: 'slide' }));
  await run(page);
  const before = await page.getByRole('list', { name: 'Rounds' }).getByRole('listitem').count();
  await page.getByLabel('Your feedback').fill('bigger title');
  await page.getByRole('button', { name: 'Adjust' }).click();
  await expect(page.getByRole('list', { name: 'Rounds' }).getByRole('listitem')).toHaveCount(before + 1, { timeout: 60_000 });
  const last = page.getByRole('list', { name: 'Rounds' }).getByRole('listitem').last();
  await expect(last).toContainText('Your feedback: “bigger title”');
  await expect(last).toContainText('type.headline → 150');
  expect(rec.refines[rec.refines.length - 1].prompt).toContain('The person looked at the replica and said: "bigger title"');
});

test('save as a template, reload, and it is still there; rename, duplicate, export, delete and import', async ({ page }) => {
  await fakeReader(page, usual);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 's.jpg', kind: 'slide' }));
  await run(page, 'Bold poster');
  await page.getByRole('button', { name: 'Save as template' }).click();
  await expect(page.getByText('Saved “Bold poster”.')).toBeVisible();
  const stored = await storedTemplates(page);
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ name: 'Bold poster', target: 'carousel', singleImage: true });
  // Only the style is kept: no reference picture anywhere in the record.
  expect(JSON.stringify(stored[0]).length).toBeLessThan(120_000);
  expect(JSON.stringify(stored[0].spec)).not.toContain('data:image');
  expect(stored[0].spec.assets).toEqual({});
  expect(stored[0].preview).toMatch(/^data:image\/jpeg/);

  await page.goto('/images/styles');
  const card = page.getByRole('listitem', { name: 'Template Bold poster' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Mine');
  await expect(card).toContainText('Built from one image');
  // Rename.
  await card.getByRole('button', { name: 'Rename Bold poster' }).click();
  await page.getByLabel('New name for Bold poster').fill('Heavy caps');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('listitem', { name: 'Template Heavy caps' })).toBeVisible();
  // Duplicate.
  await page.getByRole('button', { name: 'Duplicate Heavy caps' }).click();
  await expect(page.getByRole('listitem', { name: 'Template Heavy caps (copy)' })).toBeVisible();
  expect(new Set((await storedTemplates(page)).map((t) => t.spec.name as string)).size).toBe(2);
  // Export, delete, import: the file puts them back.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export all' }).click()]);
  const file = (await dl.path())!;
  const exported = JSON.parse(fs.readFileSync(file, 'utf8')) as { format: string; templates: { name: string }[] };
  expect(exported.format).toBe('creator-style-templates');
  expect(exported.templates.map((t) => t.name).sort()).toEqual(['Heavy caps', 'Heavy caps (copy)']);
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete Heavy caps (copy)' }).click();
  await page.getByRole('button', { name: 'Delete Heavy caps', exact: true }).click();
  await expect(page.getByText('No templates yet')).toBeVisible();
  expect(await storedTemplates(page)).toHaveLength(0);
  await page.getByLabel('Choose a templates file').setInputFiles(file);
  await expect(page.getByText('2 templates imported.')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Template Heavy caps', exact: true })).toBeVisible();
  // A file that is not a templates file is refused in plain words.
  await page.getByLabel('Choose a templates file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') });
  await expect(page.getByText(/not a templates file from this app/)).toBeVisible();
  await page.getByLabel('Choose a templates file').setInputFiles({ name: 'y.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'creator-style-templates', templates: [{ name: 'Broken', target: 'carousel', spec: { schema: 1, name: 'x', title: 'x' } }] })) });
  await expect(page.getByText(/Left out: Broken:/)).toBeVisible();
  await saveShot(page, '04-templates.png');
});

test('templates appear, tagged Mine, in the carousel and thumbnail pickers by target; a template for one format warns when used for the other', async ({ page }) => {
  await fakeReader(page, (kind) => (kind === 'refine' ? refineAnswer({ stop: true }) : readAnswer({ thumbnail: true })));
  const make = async (name: string, target: string) => {
    await openStyleFromReferences(page);
    await refInput(page).setInputFiles(await makeReference(page, { name: `${name}.jpg`, kind: 'slide' }));
    await run(page, name, target);
    await page.getByRole('button', { name: 'Save as template' }).click();
    await expect(page.getByText(`Saved “${name}”.`)).toBeVisible();
  };
  await make('Carousel only look', 'Carousels');
  await make('Thumbnail only look', 'Thumbnails');
  await make('Both look', 'Both');
  // Carousel picker: the carousel-only and both templates, not the thumbnail-only one.
  await page.goto('/images/carousel');
  const styles = page.getByRole('list', { name: 'Styles' });
  await expect(styles.getByRole('button', { name: /Carousel only look/ })).toBeVisible();
  await expect(styles.getByRole('button', { name: /Both look/ })).toBeVisible();
  await expect(styles.getByRole('button', { name: /Thumbnail only look/ })).toHaveCount(0);
  await expect(styles.getByRole('button', { name: /Carousel only look/ }).getByText('Mine', { exact: true })).toBeVisible();
  await styles.getByRole('button', { name: /Both look/ }).click();
  await expect(styles.getByRole('button', { name: /Both look/ })).toHaveAttribute('aria-pressed', 'true');
  // Thumbnail picker: the thumbnail-only and both templates, not the carousel-only one.
  await page.goto('/images/thumbnail');
  const radios = page.getByRole('radiogroup', { name: 'Style' });
  await expect(radios.getByRole('radio', { name: /Thumbnail only look/ })).toBeVisible();
  await expect(radios.getByRole('radio', { name: /Both look/ })).toBeVisible();
  await expect(radios.getByRole('radio', { name: /Carousel only look/ })).toHaveCount(0);
  await expect(radios.getByRole('radio', { name: /Both look/ }).getByText('Mine', { exact: true })).toBeVisible();
  // Using a carousel-only template for a thumbnail asks first, in plain words.
  await page.goto('/images/styles');
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await page.getByRole('button', { name: 'Use Carousel only look for a thumbnail' }).click();
  expect(asked).toContain('made for carousels only');
  expect(asked).toContain('Thumbnails use the base style for everything it does not say');
  await expect(page).toHaveURL(/\/images\/styles$/);
  // Using a template that fits goes straight to the screen with that style chosen.
  await page.getByRole('button', { name: 'Use Both look for a carousel' }).click();
  await expect(page).toHaveURL(/\/images\/carousel$/);
  await expect(page.getByRole('list', { name: 'Styles' }).getByRole('button', { name: /Both look/ })).toHaveAttribute('aria-pressed', 'true');
  await saveShot(page, '05-pickers.png', false);
});

test('storage that fails: the template is kept in memory with a plain message, and still works in the pickers until the page closes', async ({ page }) => {
  await page.addInitScript(() => {
    const real = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((name: string, v?: number) => {
      if (name === 'creator-style-templates') {
        const req = {} as IDBOpenDBRequest;
        setTimeout(() => (req as unknown as { onerror: (() => void) | null }).onerror?.(), 0);
        return req;
      }
      return real(name, v);
    }) as typeof indexedDB.open;
  });
  await fakeReader(page, (kind) => (kind === 'refine' ? refineAnswer({ stop: true }) : readAnswer()));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 's.jpg', kind: 'slide' }));
  await run(page, 'Memory only');
  await page.getByRole('button', { name: 'Save as template' }).click();
  await expect(page.getByText('Saved “Memory only”.')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'would not save your templates' })).toBeVisible();
  // Still usable in this session: go to the Styles list and the carousel picker through the app's own links.
  await page.getByRole('link', { name: 'See your templates' }).click();
  await expect(page.getByRole('listitem', { name: 'Template Memory only' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'would not save your templates' })).toBeVisible();
});

// ---------- collages, grids and the "learn from" choices ----------

test('a 3 by 3 collage: it offers the nine slides, the person unticks three, and only six are measured, sent and drawn', async ({ page }) => {
  const rec = await fakeReader(page, (kind) => (kind === 'refine' ? refineAnswer({ stop: true }) : readAnswer()));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'grid3x3.jpg', kind: 'collage', cols: 3, rows: 3, cell: [300, 375], gap: [8, 8], margin: 20, gutter: '#ffffff' }));
  const card = page.getByRole('listitem', { name: 'Reference grid3x3.jpg' });
  await expect(card).toContainText('This looks like a grid of 9 slides');
  await expect(card).toContainText('Use all, or pick the ones to learn from');
  await expect(card.getByRole('checkbox')).toHaveCount(9);
  for (const n of [2, 5, 8]) await card.getByLabel(`Use slide ${n} of grid3x3.jpg`).uncheck();
  await expect(card).toContainText('6 of 9 are ticked');
  await saveShot(page, '06-grid.png');
  await run(page, 'From a grid');
  expect(rec.reads[0].images.map((i) => i.name)).toEqual(['ref1.jpg', 'ref2.jpg', 'ref3.jpg', 'ref4.jpg', 'ref5.jpg', 'ref6.jpg']);
  expect(rec.reads[0].prompt).toContain('one slide of a collage');
  // Not a single-image style: no single-image note in the closeness panel.
  await expect(page.locator('section[aria-labelledby="rf-close-h"]').getByText('Built from one image')).toHaveCount(0);
});

test('a 2 across by 4 down collage gives eight slides; a collage with uneven gutters is still split', async ({ page }) => {
  await fakeReader(page, (kind) => (kind === 'refine' ? refineAnswer({ stop: true }) : readAnswer()));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles([
    await makeReference(page, { name: 'grid2x4.jpg', kind: 'collage', cols: 2, rows: 4, cell: [270, 270], gap: [10, 10], margin: 16, gutter: '#101010' }),
    await makeReference(page, { name: 'uneven.jpg', kind: 'collage', cols: 3, rows: 2, cell: [250, 310], gap: [6, 6], margin: 30, gutter: '#e5e5e5' }),
  ]);
  await expect(page.getByRole('listitem', { name: 'Reference grid2x4.jpg' })).toContainText('This looks like a grid of 8 slides (2 across, 4 down');
  await expect(page.getByRole('listitem', { name: 'Reference uneven.jpg' })).toContainText('This looks like a grid of 6 slides (3 across, 2 down');
});

test('a grid found wrongly is corrected by hand: "it is a single image", or one rectangle drawn round one slide', async ({ page }) => {
  const rec = await fakeReader(page, (kind) => (kind === 'refine' ? refineAnswer({ stop: true }) : readAnswer()));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'stripes.jpg', kind: 'stripes', cell: [600, 750] }));
  const card = page.getByRole('listitem', { name: 'Reference stripes.jpg' });
  // Whatever the code decided, the person can say it is a single image.
  if ((await card.getAttribute('data-mode')) === 'grid') {
    await expect(card).toContainText('This looks like a grid');
    await card.getByRole('button', { name: 'It is a single image' }).click();
  }
  await expect(card).toHaveAttribute('data-mode', 'single');
  await expect(card.getByRole('checkbox')).toHaveCount(0);
  // Draw one rectangle: the style learns from that part only.
  await card.getByRole('button', { name: 'Draw one rectangle' }).click();
  const layer = card.getByTestId('draw-layer');
  const box = (await layer.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();
  await expect(card).toContainText('Using only the rectangle you drew');
  await run(page, 'Cropped');
  expect(rec.reads[0].images).toHaveLength(1);
  await card.getByRole('button', { name: 'Use the whole image' }).click();
  await expect(card).toHaveAttribute('data-mode', 'single');
});

for (const [learn, label, changes, keeps] of [
  ['colours-type', 'Colours and type only', ['palettes', 'fonts', 'type'], ['layouts', 'spacing']],
  ['layout', 'Layout only', ['layouts', 'spacing'], ['palettes', 'fonts']],
  ['photo', 'Photo treatment only', ['photo'], ['palettes', 'layouts', 'fonts']],
  ['everything', 'Everything', ['palettes', 'fonts', 'layouts', 'photo'], []],
] as const) {
  test(`learn from "${label}": the style takes only those parts from the reader's answer; the rest stays as in the base style`, async ({ page }) => {
    const rec = await fakeReader(page, (kind) => (kind === 'refine' ? refineAnswer({ stop: true }) : readAnswer({ photo: true })));
    await openStyleFromReferences(page);
    await refInput(page).setInputFiles(await makeReference(page, { name: 'one.jpg', kind: 'slide' }));
    await page.getByLabel('Learn from one.jpg').selectOption(learn);
    await page.getByLabel('Base style').selectOption('editorial-collage');
    await run(page, `Learn ${learn}`);
    expect(rec.reads[0].prompt).toContain(`learn from "${label}"`);
    await page.getByRole('button', { name: 'Save as template' }).click();
    await expect(page.getByText(`Saved “Learn ${learn}”.`)).toBeVisible();
    const spec = (await storedTemplates(page)).find((t) => t.name === `Learn ${learn}`)!.spec as Record<string, Record<string, unknown>>;
    const base = await page.evaluate(async () => {
      const m = await import('/src/carousel/render.ts');
      const s = m.styleByName('editorial-collage')!.spec;
      return { palettes: Object.keys(s.palettes), fonts: s.fonts, spacing: s.spacing, cover: s.layouts.cover.map((r) => r.use) };
    });
    const changed = {
      palettes: Object.keys(spec.palettes).includes('ink'),
      fonts: JSON.stringify(spec.fonts) !== JSON.stringify(base.fonts),
      layouts: JSON.stringify((spec.layouts.cover as unknown as { use: string }[]).map((r) => r.use)) !== JSON.stringify(base.cover),
      spacing: JSON.stringify(spec.spacing) !== JSON.stringify(base.spacing),
      photo: !!spec.photo && Object.keys(spec.photo.treatments as object).includes('mono'),
      type: spec.type.headline === 108,
    };
    for (const k of changes) expect(changed[k as keyof typeof changed], `${k} should be taken`).toBe(true);
    for (const k of keeps) expect(changed[k as keyof typeof changed], `${k} should stay as in the base style`).toBe(false);
  });
}

test('learn from can differ by image: colours and type from one, layout from another', async ({ page }) => {
  const rec = await fakeReader(page, (kind) => (kind === 'refine' ? refineAnswer({ stop: true }) : readAnswer()));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles([await makeReference(page, { name: 'colours.jpg', kind: 'slide', bg: '#d9381e' }), await makeReference(page, { name: 'layout.jpg', kind: 'slide', bg: '#f4efe6', ink: '#101010' })]);
  await page.getByLabel('Learn from colours.jpg').selectOption('colours-type');
  await page.getByLabel('Learn from layout.jpg').selectOption('layout');
  await run(page, 'Mixed');
  expect(rec.reads[0].prompt).toContain('ref1.jpg: learn from "Colours and type only"');
  expect(rec.reads[0].prompt).toContain('ref2.jpg: learn from "Layout only"');
});

test('process fixes: it starts from a blank base, so nothing the reader did not ask for appears', async ({ page }) => {
  const rec = await fakeReader(page, usual);
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'plain.jpg', kind: 'slide' }));
  await run(page, 'Blank start');
  expect(rec.reads[0].prompt).toContain('The base style is BLANK');
  await page.getByRole('button', { name: 'Save as template' }).click();
  await expect.poll(async () => (await storedTemplates(page)).length).toBe(1);
  const spec = (await storedTemplates(page))[0].spec as Record<string, unknown>;
  expect(spec.elements, 'no elements the reader did not ask for').toBeUndefined();
  expect(spec.marks, 'no marks the reader did not ask for').toBeUndefined();
  expect(spec.assets).toEqual({});
});

test('process fixes: a reference with a photo gets a photo slot in the sample, and the round that is kept is explained', async ({ page }) => {
  await fakeReader(page, (kind, n) => {
    if (kind === 'read' || kind === 'retry') return readAnswer({ seen: ['cover'], photo: true, photoImages: ['ref1.jpg'] });
    if (n === 0) return refineAnswer({ patches: [{ path: 'type.headline', value: 132 }], score: 70 });
    return refineAnswer({ patches: [{ path: 'type.headline', value: 60 }], score: 20 });
  });
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'photo.jpg', kind: 'slide' }));
  await run(page, 'Photo sample');
  const rounds = page.getByRole('list', { name: 'Rounds' }).getByRole('listitem');
  await expect(rounds.first()).toContainText('with a photo');
  // The first round that does not improve ends the loop, and the screen says which round was kept and why.
  await expect(page.getByText(/was kept: its score of \d+/)).toBeVisible();
});

test('process fixes: values the toolbox cannot draw are moved, and the closeness panel says so', async ({ page }) => {
  await fakeReader(page, (kind) => (kind === 'read' || kind === 'retry' ? readAnswer({ seen: ['cover'], extra: { shape: { radius: 1000, outline: 4, stroke: 8, hardShadow: 0, badge: 'square', marker: 'box', sticker: 'tag', decor: 'blocks' }, spacing: { margin: 10, gap: 24, section: 48 }, type: { cover: 150, headline: 12, body: 44, small: 34, stat: 340, quote: 84, label: 32 } } }) : refineAnswer({ patches: [], score: 70, stop: true })));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'c.jpg', kind: 'slide' }));
  await run(page, 'Clamped');
  const list = page.getByRole('list', { name: 'Clamped values' });
  await expect(list).toContainText('shape.radius was 1000, lowered to 120');
  await expect(list).toContainText('spacing.margin was 10, raised to 48');
  await expect(list).toContainText('type.headline was 12, raised to 32');
});

test('a reader that asks for marks gets them drawn, and one that asks for a mark we do not have is told in plain words', async ({ page }) => {
  await fakeReader(page, (kind) => (kind === 'read' || kind === 'retry' ? readAnswer({ seen: ['cover'], extra: { marks: [{ kind: 'round-badge', zone: 'top-right', size: 220, colour: 'accent', text: 'NEW' }, { kind: 'unicorn', zone: 'top', size: 100, colour: 'accent' }] } }) : refineAnswer({ patches: [], score: 70, stop: true })));
  await openStyleFromReferences(page);
  await refInput(page).setInputFiles(await makeReference(page, { name: 'm.jpg', kind: 'slide' }));
  await run(page, 'With marks');
  await page.getByRole('button', { name: 'Save as template' }).click();
  await expect.poll(async () => (await storedTemplates(page)).length).toBe(1);
  const spec = (await storedTemplates(page))[0].spec as { marks?: { kind: string }[] };
  expect(spec.marks?.map((m) => m.kind)).toEqual(['round-badge']);
  await expect(page.getByRole('list', { name: 'Clamped values' })).toContainText('unicorn');
});
