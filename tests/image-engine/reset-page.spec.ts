// "Reset page" on the carousel page: after confirming, the page looks like a fresh load, saved styles stay, and a running job is cancelled. A fake reader stands in for the model.
import { expect, test, type Page } from '@playwright/test';
import { toStep } from './ui';
import { fakeReader, labelsAnswer, makeReference, readAnswer, refineAnswer, storedTemplates, wholeSlideAnswer } from './reference-helpers';

test.setTimeout(180_000);
test.use({ viewport: { width: 1300, height: 1000 } });

const usual = (kind: string, n: number, prompt = '') => prompt.includes('[whole-slide:new]') ? wholeSlideAnswer() : (kind === 'read' || kind === 'retry' ? (prompt.includes('describe the scene') || /r\d+T\d+/.test(prompt) ? labelsAnswer(prompt, { seen: ['cover'] }) : readAnswer({ seen: ['cover'] })) : n === 0 ? refineAnswer({ patches: [], score: 70, stop: true }) : refineAnswer({ patches: [], stop: true }));

/** A project with a script and some text, plus one saved template (a Mine style), then a reload. */
async function seed(page: Page) {
  await page.goto('/images/carousel');
  await page.evaluate(async () => {
    const T = await import('/src/reference/templates.ts');
    const B = await import('/src/reference/blank.ts');
    await T.ensureTemplatesLoaded();
    if (T.templates().length === 0) await T.saveTemplate({ name: 'Keep me', target: 'carousel', spec: { ...B.blankStyle(), name: T.styleNameFor('Keep me') }, preview: '' });
  });
  // The project is written before the app starts (once), so the app's own autosave cannot overwrite it.
  const project = await page.evaluate(async () => {
    const Dc = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    return JSON.stringify({ project: { doc: { ...Dc.emptyDoc('editorial-collage'), topic: 'Some text that should disappear', script: S.EXAMPLE }, past: [], future: [] } });
  });
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('creator.carousel.project.v1', p);
    }
  }, project);
  await page.reload();
}
const storedProject = (page: Page) =>
  page.evaluate(() => {
    const p = (JSON.parse(localStorage.getItem('creator.carousel.project.v1') ?? '{}') as { project?: { doc?: { style?: string; topic?: string; script?: unknown } } }).project?.doc;
    return { style: p?.style ?? '', topic: p?.topic ?? '', script: !!p?.script };
  });
const jobs = (page: Page) => page.evaluate(() => { const j = (window as unknown as { __liveJobs: { now: () => { status: string } | null; history: () => unknown[] } }).__liveJobs; return { now: j.now()?.status ?? null, history: j.history().length }; });

test('Reset page asks first; Cancel changes nothing', async ({ page }) => {
  await fakeReader(page, usual);
  await seed(page);
  const messages: string[] = [];
  page.once('dialog', (d) => { messages.push(d.message()); void d.dismiss(); });
  await page.getByRole('button', { name: 'Reset page' }).click();
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toBe('Start over? This clears the reference, the text and the slides on this page. Your saved styles stay.');
  await expect(page.getByRole('list', { name: 'Filmstrip' })).toBeVisible({ timeout: 30_000 });
  expect((await storedProject(page)).script).toBe(true);
});

test('after Reset the page looks like a fresh load and the saved styles are still there', async ({ page }) => {
  await fakeReader(page, usual);
  await seed(page);
  await toStep(page, 3);
  await page.getByRole('button', { name: /^New style/ }).click();
  const quick = page.getByTestId('quick-start');
  await quick.getByLabel('Choose reference images or a PDF').setInputFiles(await makeReference(page, { name: 'one.jpg', kind: 'slide' }));
  await expect(page.getByTestId('quick-count')).toHaveText('1 picture added', { timeout: 60_000 });
  await expect(page.getByRole('list', { name: 'Filmstrip' })).toBeVisible({ timeout: 30_000 });
  expect((await storedTemplates(page)).length).toBe(1);

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Reset page' }).click();

  await expect(page.getByTestId('quick-count'), 'the reference box is closed again').toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Filmstrip' })).toHaveCount(0);
  await expect(page.getByLabel('Your text or topic')).toHaveValue('');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('quick-saved')).toHaveCount(0);
  await expect.poll(async () => await storedProject(page)).toEqual({ style: 'editorial-collage', topic: '', script: false });
  await expect.poll(() => jobs(page)).toEqual({ now: null, history: 0 });
  // The saved style is untouched and still offered.
  expect((await storedTemplates(page)).map((t) => t.name)).toEqual(['Keep me']);
  await toStep(page, 3);
  await expect(page.getByRole('list', { name: 'Styles' }).first().getByText('Keep me', { exact: true })).toBeVisible();
  // A fresh load looks the same.
  await page.reload();
  await expect(page.getByTestId('quick-count')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Filmstrip' })).toHaveCount(0);
});

test('a running job is cancelled by Reset: nothing is saved afterwards and the job record is clear', async ({ page }) => {
  await fakeReader(page, usual, { delayMs: 4000 });
  await seed(page);
  await toStep(page, 3);
  await page.getByRole('button', { name: /^New style/ }).click();
  const quick = page.getByTestId('quick-start');
  await quick.getByLabel('Choose reference images or a PDF').setInputFiles(await makeReference(page, { name: 'one.jpg', kind: 'slide' }));
  const read = quick.getByRole('button', { name: 'Read it' });
  await expect(read).toBeEnabled({ timeout: 60_000 });
  await read.click();
  await expect(quick.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 30_000 });
  // Round E: the whole-picture read (the default) records no Live job, so there is no job to be 'running' here (checked by hand: the box says Reading with Cancel, window.__liveJobs stays empty). What Reset must do is unchanged and is checked below:
  // the read is cancelled, nothing is saved afterwards, the page is fresh. (The old first check, a job in the 'running' state, only held for the older read path.)
  await expect(quick.getByText(/Reading/).first()).toBeVisible();

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Reset page' }).click();

  await expect(page.getByTestId('quick-count')).toHaveCount(0);
  // Wait past the fake reader's delay: a job that was not cancelled would finish and save a style by now.
  await page.waitForTimeout(7000);
  await expect(page.getByTestId('quick-saved')).toHaveCount(0);
  expect((await storedTemplates(page)).map((t) => t.name), 'no style was saved by the cancelled read').toEqual(['Keep me']);
  await expect.poll(() => jobs(page)).toEqual({ now: null, history: 0 });
  expect((await storedProject(page)).style).toBe('editorial-collage');
});
