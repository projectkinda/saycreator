// Shared by the Make-a-thumbnail app specs: open the screen, add pictures like a person does, read the saved project.
import { expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
export const APP_OUT = path.join(ROOT, 'out/image-engine/thumb-app');
export const STORE_KEY = 'creator.thumbnail.project.v1';

export const openThumb = async (page: Page) => {
  await page.goto('/images/thumbnail');
  await expect(page.getByRole('heading', { name: 'Make a thumbnail', level: 1 })).toBeVisible();
};
export const photoInput = (page: Page) => page.getByLabel('Choose a photo', { exact: true });
export const titleInput = (page: Page) => page.getByLabel(/^Title \(up to 4 words\)/);
export const optionCards = (page: Page) => page.getByRole('listitem', { name: /^Option \d+:/ });
export const savedProject = (page: Page) =>
  page.evaluate((k) => {
    const t = localStorage.getItem(k);
    return t ? (JSON.parse(t) as { project: { doc: Record<string, unknown> & { photos: { id: string; name: string }[] }; past: { label: string }[]; future: { label: string }[] } }).project : null;
  }, STORE_KEY);

/** Every option is drawn and checked. */
export async function allDrawn(page: Page, min = 3) {
  await expect.poll(async () => optionCards(page).count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(min);
  const n = await optionCards(page).count();
  await expect(page.locator('.tn-card[data-status="ready"]')).toHaveCount(n, { timeout: 60_000 });
  await expect(page.locator('.tn-card').getByText(/^Phone check:/)).toHaveCount(n, { timeout: 60_000 });
  return n;
}
export const srcs = (page: Page) => page.locator('.tn-card .tn-pic img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
export const layouts = (page: Page) => page.locator('.tn-card').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.layout));

/** Waits until the saved project satisfies a condition. */
export async function whenSaved(page: Page, ok: (d: Record<string, unknown>) => boolean) {
  await expect.poll(async () => {
    const p = await savedProject(page);
    return p ? ok(p.doc) : false;
  }, { timeout: 20_000 }).toBe(true);
}

/** Drags the subject pointer to a share of the picture it sits on. */
export async function dragPointer(page: Page, pointer: Locator, to: { x: number; y: number }) {
  const frame = pointer.locator('xpath=ancestor::div[contains(@class,"cr-focal")]');
  await frame.scrollIntoViewIfNeeded();
  const box = (await frame.boundingBox())!;
  const dot = (await pointer.boundingBox())!;
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to.x, box.y + box.height * to.y, { steps: 6 });
  await page.mouse.up();
}

export const realPhoto = (file: string) => {
  const p = path.join(ROOT, 'test-images', file);
  return fs.existsSync(p) ? p : null;
};

/** Stands in for the dev writer: the status route says it is there, the write route answers with the given text. */
export async function fakeWriter(page: Page, answer: string | ((prompt: string, n: number) => string)) {
  let n = 0;
  const prompts: string[] = [];
  await page.route('**/__carousel/status', (r) => r.fulfill({ json: { available: true } }));
  await page.route('**/__carousel/write', async (r) => {
    const body = JSON.parse(r.request().postData() ?? '{}') as { prompt?: string };
    prompts.push(body.prompt ?? '');
    await r.fulfill({ json: { text: typeof answer === 'string' ? answer : answer(body.prompt ?? '', n++), ms: 5 } });
  });
  return prompts;
}
