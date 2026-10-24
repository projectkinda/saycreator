// Probe: what can run inside a Web Worker? Reports facts only.
self.onmessage = async () => {
  const result: Record<string, unknown> = {
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    workerFonts: typeof (self as unknown as { fonts?: unknown }).fonts !== 'undefined',
    hasDocument: typeof (self as unknown as { document?: unknown }).document !== 'undefined',
  };
  try {
    const fabric = await import('fabric');
    result.fabricImport = 'ok';
    try {
      const c = new fabric.StaticCanvas(undefined, { width: 20, height: 20 });
      c.add(new fabric.Rect({ width: 10, height: 10, fill: 'red' }));
      c.renderAll();
      result.fabricStaticCanvas = 'ok';
    } catch (e) {
      result.fabricStaticCanvas = `failed: ${String(e)}`;
    }
  } catch (e) {
    result.fabricImport = `failed: ${String(e)}`;
  }
  (self as unknown as Worker).postMessage(result);
};
export {};
