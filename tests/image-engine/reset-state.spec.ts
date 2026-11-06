// Reset page empties everything the page keeps (active reference, pack, report, pictures, cutouts, picture-slot images, reader answers, pasted text, in-memory call state); saved styles stay.
import { expect, test } from '@playwright/test';

test.setTimeout(120_000);
test.use({ viewport: { width: 1300, height: 1000 } });

const COUNTS = `
  const count = (db, store) => new Promise((res) => {
    const r = indexedDB.open(db, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(store, { keyPath: store === 'reads' ? 'key' : 'id' });
    r.onsuccess = () => { const t = r.result.transaction(store, 'readonly').objectStore(store).count(); t.onsuccess = () => { res(t.result); r.result.close(); }; t.onerror = () => res(-1); };
    r.onerror = () => res(-1);
  });
`;

test('Reset page leaves no active reference, pack, pictures, report or caches; saved styles stay', async ({ page }) => {
  await page.goto('/images/carousel');
  const seeded = await page.evaluate(async (counts) => {
    const A = await import('/src/reference/active.ts');
    const B = await import('/src/reference/blank.ts');
    const T = await import('/src/reference/templates.ts');
    const put = (db: string, store: string, value: object) => new Promise<void>((res, rej) => {
      const r = indexedDB.open(db, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(store, { keyPath: store === 'reads' ? 'key' : 'id' });
      r.onsuccess = () => { const t = r.result.transaction(store, 'readwrite'); t.objectStore(store).put(value); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
      r.onerror = () => rej(r.error);
    });
    await T.ensureTemplatesLoaded();
    if (T.templates().length === 0) await T.saveTemplate({ name: 'Keep me', target: 'carousel', spec: { ...B.blankStyle(), name: T.styleNameFor('Keep me') }, preview: '' });
    const pack = { name: 'Ref', palette: { bg: '#000000', text: '#ffffff' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, motifs: [], designs: {}, brief: 'Palette: ground #000000.', canvas: { w: 1080, h: 1350 }, notes: [] } as any;
    A.setActiveReference({ spec: B.blankStyle(), thumb: 'x', learn: 'everything', target: 'carousel', ratioNote: null, photoRegion: null, source: 'pack', pack, report: { files: [{ name: 'a.jpg', width: 1, height: 1 }], thumbs: ['x'], images: { 'a.jpg': 'data:image/jpeg;base64,AA' } }, whole: { route: 'whole-slide', slides: [], palette: {}, fonts: null, distinctCompositions: 0, failed: 0 } as any });
    await put('creator-carousel-pictures', 'pictures', { id: 'p1', kind: 'photo', name: 'a', original: new Blob(['x']), work: new Blob(['x']), width: 1, height: 1, workWidth: 1, workHeight: 1, addedAt: 1 });
    await put('creator-cutouts', 'cutouts', { id: 'c1' });
    await put('creator-images', 'images', { id: 'o1', blob: new Blob(['x']) });
    await put('creator-reader-cache', 'reads', { key: 'k1' });
    localStorage.setItem('creator.carousel.paste.v1', 'old pasted text');
    sessionStorage.setItem('creator.skeleton', 'layout-3');
    const D = await import('/src/carousel/designed.ts');
    const n = async (db: string, store: string) => (await eval('(' + counts.replace(/^\s*const count = /, '').replace(/;\s*$/, '') + ')')(db, store)) as number;
    return { pack: !!A.activeReference()?.pack, report: !!A.activeReference()?.report, pics: await n('creator-carousel-pictures', 'pictures'), cut: await n('creator-cutouts', 'cutouts'), imgs: await n('creator-images', 'images'), reads: await n('creator-reader-cache', 'reads'), templates: T.templates().length, lastReq: D.lastRequestBytes() };
  }, COUNTS);
  expect(seeded).toMatchObject({ pack: true, report: true, pics: 1, cut: 1, imgs: 1, reads: 1 });
  expect(seeded.templates).toBeGreaterThanOrEqual(1);

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Reset page' }).click();
  await expect.poll(() => page.evaluate(async () => !(await import('/src/reference/active.ts')).activeReference()), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1500); // the page waits a moment for cancelled jobs, then clears the stores

  const after = await page.evaluate(async (counts) => {
    const A = await import('/src/reference/active.ts');
    const T = await import('/src/reference/templates.ts');
    const Rp = await import('/src/reference/report.ts');
    const Dc = await import('/src/carousel/doc.ts');
    const S = await import('/src/carousel/script.ts');
    const n = async (db: string, store: string) => (await eval('(' + counts.replace(/^\s*const count = /, '').replace(/;\s*$/, '') + ')')(db, store)) as number;
    const act = A.activeReference();
    const rep = JSON.parse((await Rp.buildReport({ doc: { ...Dc.emptyDoc('editorial-collage'), script: { ...S.EXAMPLE, slides: S.EXAMPLE.slides.slice(0, 3) } } as any, includeRefs: true, verdicts: {}, note: '' })).json);
    await T.ensureTemplatesLoaded();
    return {
      reference: act, pack: act?.pack ?? null, activeReport: act?.report ?? null, whole: act?.whole ?? null,
      pics: await n('creator-carousel-pictures', 'pictures'), cut: await n('creator-cutouts', 'cutouts'), imgs: await n('creator-images', 'images'), reads: await n('creator-reader-cache', 'reads'),
      paste: localStorage.getItem('creator.carousel.paste.v1'), skeleton: sessionStorage.getItem('creator.skeleton'),
      reportFiles: rep.referenceFiles, reportRead: rep.read, reportWhole: rep.wholeRead,
      templates: T.templates().length, lastReq: (await import('/src/carousel/designed.ts')).lastRequestBytes(),
    };
  }, COUNTS);
  expect(after.reference).toBeNull();
  expect(after.pack).toBeNull();
  expect(after.activeReport).toBeNull();
  expect(after.whole).toBeNull();
  expect(after.pics).toBe(0);
  expect(after.cut).toBe(0);
  expect(after.imgs).toBe(0);
  expect(after.reads).toBe(0);
  expect(after.paste).toBeNull();
  expect(after.skeleton).toBeNull();
  expect(after.reportFiles).toEqual([]);
  expect(after.reportWhole).toBeNull();
  expect(after.lastReq).toBeNull();
  expect(after.templates).toBeGreaterThanOrEqual(1); // the saved style stays
});
