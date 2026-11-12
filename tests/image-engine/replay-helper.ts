// The replay of a saved library plan, run in the page (shared by report-replay.spec.ts and round-15.spec.ts; not a spec itself).
/** The replay, run in the page. */
export const REPLAY = String.raw`window.__REPLAY = async (rep, opts) => {
  const D = await import('/src/carousel/designLibrary.ts');
  const PR = await import('/src/carousel/presets.ts');
  const F = await import('/src/reference/faithful.ts');
  const C = await import('/src/reference/faithfulChecks.ts');
  const T = await import('/src/carousel/layouts/textFits.ts');
  const L = rep.designed.library;
  const specs = L.plan.specs;
  const sizes = {};
  for (const s of specs) for (const v of Object.values(s.fields)) { const m = /^picture:([^#]+)#w=(\d+)&h=(\d+)/.exec(String(v)); if (m) sizes[m[1]] = [Number(m[2]), Number(m[3])]; }
  for (const p of (opts.extra ?? [])) sizes[p.id] = [p.w, p.h];
  const urls = {};
  const shot = (w, h, k) => {
    const rows = Array.from({ length: 14 }, (_, i) => '<rect x="' + w * 0.1 + '" y="' + (h * 0.14 + i * h * 0.05) + '" width="' + w * (0.3 + ((i * 37 + k * 11) % 50) / 100) + '" height="' + h * 0.016 + '" fill="#333"/>').join('');
    return 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice"><rect width="' + w + '" height="' + h + '" fill="#ffffff"/><rect width="' + w + '" height="' + h * 0.07 + '" fill="#1d1d1f"/><rect y="' + h * 0.07 + '" width="' + w * 0.2 + '" height="' + h + '" fill="#ececf0"/>' + rows + '</svg>');
  };
  Object.entries(sizes).forEach(([id, [w, h]], k) => { urls[id] = shot(w, h, k); });
  F.setPictureResolver(async (ref) => urls[ref.slice('picture:'.length).split('#')[0]] ?? null);
  const images = Object.entries(sizes).map(([id, [width, height]]) => ({ id, width, height, content: opts.content ?? 'screenshot' }));
  const strip = (f) => Object.fromEntries(Object.entries(f).filter(([k]) => !['image', 'image2', 'image3', 'image4', 'image5', 'image6'].includes(k)));
  let calls = 0;
  const provider = { id: 'dev-cli', label: 'fake: the saved plan', async write() { calls++; return { text: JSON.stringify({ title: L.plan.title, slides: specs.map((s) => ({ ...s, fields: strip(s.fields) })) }), ms: 1 }; } };
  const look = { pack: PR.presetPackFor(rep.style, false), hasPhoto: images.length > 0, images, brief: '', site: '' };
  const res = await D.designLibraryDeck({ text: rep.sourceText, slides: specs.length, tone: 'clear', format: 'carousel', styleChoice: rep.style, styles: [] }, look, '@maya.designs', provider, new AbortController().signal);
  const lib = res.designed.library;
  const ids = Object.keys(res.designed.slides).sort((a, b) => Number(a) - Number(b));
  const bms = [];
  const slides = [];
  for (const id of ids) {
    const s = res.designed.slides[id];
    const b = s.built;
    bms.push(await createImageBitmap(await F.svgToPng(b.svg, 1080)));
    const type = res.script?.slides?.[Number(id)]?.type ?? 'content';
    const lint = C.faithfulChecks(b.layers, { canvas: { w: 1080, h: 1350 }, bg: b.bg ?? '#FFFFFF', k: 1, slideType: type, prose: /data-layout="prose"/.test(b.svg) });
    const isRec = (l) => /recurring/.test(l.id + ' ' + l.name);
    const fit = T.textFitProblems(b.layers.filter((l) => !isRec(l)), b.layers.filter(isRec));
    const texts = b.layers.filter((l) => l.kind === 'text' && l.visible !== false && l.role !== 'decor' && l.text && !isRec(l));
    const over = texts.filter((l) => { const q = T.textBox(l); return q && (b.images ?? []).some((im) => q.x0 < im.x + im.w - 2 && q.x1 > im.x + 2 && q.y0 < im.y + im.h - 2 && q.y1 > im.y + 2); }).map((l) => l.name);
    slides.push({ slide: Number(id) + 1, layout: lib.layouts[Number(id)], over, failed: lint.filter((q) => !q.pass).map((q) => q.id + ': ' + q.reason), fit, images: (b.images ?? []).map((i) => String(i.id ?? i.src ?? '')), boxes: texts.map((l) => [l.name, Math.round(l.x), Math.round(l.y), Math.round(l.width), Math.round(l.height)]) });
  }
  const w = 450, h = 563, cols = 4;
  const c = document.createElement('canvas'); c.width = cols * (w + 10) + 10; c.height = Math.ceil(bms.length / cols) * (h + 10) + 10;
  const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
  bms.forEach((u, i) => g.drawImage(u, 10 + (i % cols) * (w + 10), 10 + Math.floor(i / cols) * (h + 10), w, h));
  return { calls, swaps: lib.pictureSwaps ?? [], fallbacks: lib.fallbacks, retries: lib.retries, notes: res.designed.notes, layouts: lib.layouts, plan: lib.plan.specs, repairs: lib.repairs ?? [], codeAdjustments: lib.codeAdjustments, slides, sheet: c.toDataURL('image/png').split(',')[1], pictureUse: lib.pictureUse };
};`;

