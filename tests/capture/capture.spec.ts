import { expect, test } from '@playwright/test';

async function openReady(page: import('@playwright/test').Page) {
  await page.goto('/videos/record');
  await expect(page.getByRole('heading', { name: 'Record' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose devices' }).click();
  await expect(page.getByRole('button', { name: 'Turn camera off' })).toBeVisible();
}

test('requests fake devices and switches between camera and audio only', async ({ page }) => {
  await openReady(page);
  await expect(page.getByLabel('Camera preview')).toBeVisible();
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(page.getByText('Camera off · audio only')).toBeVisible();
  await page.getByRole('button', { name: 'Turn camera on' }).click();
  await expect(page.getByRole('button', { name: 'Turn camera off' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('creator.capture.cameraOn'))).toBe('true');
});

test('records chunks, advances and backs through beats, and saves a manifest', async ({ page }) => {
  await openReady(page);
  await page.getByPlaceholder('Paste your script…').fill('First thought.\n\nSecond thought.');
  await page.getByRole('button', { name: 'Make beats' }).click();
  await expect(page.getByText('2 beats · beat 1')).toBeVisible();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(1700);
  await page.keyboard.press('Space');
  await expect(page.getByText('2 beats · beat 2')).toBeVisible();
  await page.getByRole('button', { name: 'Back one beat' }).click();
  await expect(page.getByText('2 beats · beat 1')).toBeVisible();
  await page.getByRole('button', { name: 'Retake this beat' }).click();
  await page.getByRole('button', { name: 'Done with this beat' }).click();
  await page.waitForTimeout(1700);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Save accepted takes' })).toBeVisible();
  const takeButton = page.getByRole('button', { name: /Take 1/ }).first();
  if (await takeButton.isVisible()) await takeButton.click();
  await page.getByRole('button', { name: 'Save accepted takes' }).click();
  await expect(page.getByText('Recording and manifest saved on this device.')).toBeVisible();

  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('creator-capture-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return new Promise<{ manifest: unknown; chunks: number }>((resolve, reject) => {
      const tx = db.transaction(['manifests', 'chunks'], 'readonly');
      const manifests = tx.objectStore('manifests').getAll(); const chunks = tx.objectStore('chunks').getAll();
      tx.oncomplete = () => resolve({ manifest: manifests.result[0], chunks: chunks.result.length }); tx.onerror = () => reject(tx.error);
    });
  });
  expect(stored.chunks).toBeGreaterThan(0);
  expect(stored.manifest).toMatchObject({ source: 'laptop', version: 1, beats: [{ text: 'First thought.' }, { text: 'Second thought.' }] });
});

test('offers recovery when an unfinished session has saved chunks', async ({ page }) => {
  await page.goto('/videos/record');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('creator-capture-v1', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('sessions', { keyPath: 'sessionId' }); const chunks = request.result.createObjectStore('chunks', { keyPath: ['sessionId', 'index'] }); chunks.createIndex('sessionId', 'sessionId'); request.result.createObjectStore('manifests', { keyPath: 'sessionId' }); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['sessions', 'chunks'], 'readwrite');
    tx.objectStore('sessions').put({ sessionId: 'recover-me', createdAt: new Date().toISOString(), mimeType: 'video/webm', cameraOn: true, complete: false, chunks: 1 });
    tx.objectStore('chunks').put({ sessionId: 'recover-me', index: 0, blob: new Blob(['saved'], { type: 'video/webm' }) });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  });
  await page.reload();
  await expect(page.getByText('Unfinished recording found')).toBeVisible();
  await page.getByRole('button', { name: 'Recover recording' }).click();
  await expect(page.getByRole('link', { name: 'Play or download recording' })).toBeVisible();
});
