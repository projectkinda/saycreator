// A PDF dropped as a reference: each page becomes one slide picture (a JPEG file, long side about 1400 px). Done in the browser, nothing is uploaded or stored.
export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** Every PDF in the list is replaced by its pages (at most `maxPages` in all); other files stay as they are. */
export async function expandPdfs(files: File[], maxPages: number): Promise<{ files: File[]; note: string }> {
  if (!files.some(isPdf)) return { files, note: '' };
  const out: File[] = [];
  const notes: string[] = [];
  for (const f of files) {
    if (!isPdf(f)) {
      out.push(f);
      continue;
    }
    try {
      const pages = await pdfToImages(f, Math.max(0, maxPages - out.length));
      out.push(...pages.files);
      notes.push(`${f.name}: ${pages.files.length} of ${pages.total} page${pages.total === 1 ? '' : 's'} added as slides.`);
    } catch (e) {
      notes.push(`${f.name} could not be read as a PDF (${(e as Error).message || 'unknown problem'}).`);
    }
  }
  return { files: out, note: notes.join(' ') };
}

export async function pdfToImages(file: File, maxPages: number): Promise<{ files: File[]; total: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const base = file.name.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]/g, '_') || 'deck';
  const out: File[] = [];
  const n = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const scale = 1400 / Math.max(v1.width, v1.height);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('page not drawn'))), 'image/jpeg', 0.88));
    out.push(new File([blob], `${base}-page${i}.jpg`, { type: 'image/jpeg' }));
    page.cleanup();
  }
  const total = doc.numPages;
  await doc.destroy();
  return { files: out, total };
}
