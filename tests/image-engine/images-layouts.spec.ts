// The layouts with an optional picture (headline-body-image, image-row, thumb-rows, cover-art, photo-cover, portrait-closing, art-side-text, do-dont). ZERO model calls; static.
//   - each draws WITH a picture (cover fit, rounded) and WITHOUT (its text-only form, never an empty box), both variants, three lengths, four styles
//   - no text over a picture, no overlaps, the margins, minimum sizes, contrast floors, no required text dropped, fill of the free area at least 55%
//   - the picture field is validated, the writer never writes it and is offered these layouts only for a deck that has a picture; gallery and flavour know them
//   - sheet: out/presets-v14/layouts-images.png (each layout with a picture and without)
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(10 * 60_000);
const OUT = path.resolve(process.cwd(), 'out/presets-v14');
const IDS = ['headline-body-image', 'image-row', 'thumb-rows', 'cover-art', 'photo-cover', 'portrait-closing', 'art-side-text', 'do-dont'];

test('each image layout draws with and without a picture: no empty box, no text over a picture, minimums, contrast, nothing dropped, fill', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (IDS) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const FA = await import('/src/reference/faithful.ts');
    const rgb = (c: string) => C.parseColor(c).rgb;
    const ratio = (a: string, b: string) => C.contrastRgb(rgb(a), rgb(b));
    const light: any = { palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#1B5E20', surface: '#F0F0F0', onAccent: '#FFFFFF' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: false, profileHeader: false, underline: false }, accentStyle: 'text', radius: 24 };
    const dark: any = { palette: { bg: '#0A0A0A', text: '#FFFFFF', muted: '#A6A6A6', accent: '#FFD54A', surface: '#242424', onAccent: '#0A0A0A' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: true, profileHeader: false, underline: false }, accentStyle: 'marker' };
    const styles: Record<string, any> = { light, dark, 'style-7': D.styleFromPack(PR.presetPackFor('style-7', false)).style, 'style-4': D.styleFromPack(PR.presetPackFor('style-4', false)).style };
    const MIN: Record<string, number> = { title: 48, body: 44, kicker: 48, tag: 48, caption: 44 };
    const bad: string[] = [];
    const hit = (a: any, b: any, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
    let built = 0, withPic = 0, without = 0;
    const fills: number[] = [];
    for (const id of IDS) {
      const def = L.layoutDef(id)!;
      const imgFields = def.fields.filter((q: any) => q.image).map((q: any) => q.name as string);
      for (const [sn, st] of Object.entries<any>(styles)) for (const v of [0, 1] as const) for (const len of ['short', 'normal', 'long'] as const) for (const mode of ['without', 'with', 'partial'] as const) {
        if (mode === 'partial' && imgFields.length < 2) continue;
        const f0 = { ...(def.samples as any)[len] };
        const f: any = { ...f0 };
        const used = mode === 'without' ? [] : mode === 'with' ? imgFields : [imgFields[0]];
        used.forEach((k: string, i: number) => { f[k] = L.placeholderImage(id === 'portrait-closing' ? 'portrait' : i % 2 ? 'art' : 'photo'); });
        const tag = `${id}/${sn}/v${v + 1}/${len}/${mode}`;
        const b = await L.buildSlide(id, v, f, st, { handle: '@quick.flip', index: 2, total: 8, cut: 'plain' });
        built++;
        if (mode === 'without') without++; else withPic++;
        if (!b.ok) { bad.push(`${tag}: not drawn (${b.errors[0]})`); continue; }
        const imgs = (b.images ?? []) as any[];
        const svgImages = (b.svg.match(/<image /g) ?? []).length;
        // a picture only where one was given: no empty box, no stand-in on a real slide
        if (mode === 'without' && (imgs.length || svgImages)) bad.push(`${tag}: a picture slot was drawn with no picture`);
        if (mode !== 'without' && !imgs.length) bad.push(`${tag}: the picture was not drawn`);
        if (svgImages !== imgs.length) bad.push(`${tag}: ${imgs.length} pictures planned, ${svgImages} drawn`);
        const layers = b.layers as any[];
        const texts = layers.filter((l) => l.kind === 'text' && l.text).map((l) => ({ name: String(l.name), chrome: String(l.name).startsWith('recurring'), x: l.x, y: l.y, w: l.width, h: l.height, size: l.style.size, color: l.style.color, text: String(l.text), runs: l.runs ?? [], hl: l.highlight?.color ?? null }));
        const shapes = layers.filter((l) => l.kind === 'shape' && typeof l.fill === 'string' && /^#[0-9a-f]{6}/i.test(l.fill) && (l.opacity ?? 1) >= 0.95 && l.width * l.height < 1080 * 1350 * 0.9 && !/background/.test(String(l.name))).map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height, fill: l.fill }));
        const bg = (b.fieldBg ?? st.palette.bg) as string;
        const pics = imgs.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
        // the picture is really SEEN: the rendered pixels inside its slot are the picture's colours, not a shape drawn over it
        if (mode === 'with' && len === 'normal') {
          const bmp = await createImageBitmap(await FA.svgToPng(b.svg, 1080));
          const cvs = document.createElement('canvas'); cvs.width = bmp.width; cvs.height = bmp.height;
          const g2 = cvs.getContext('2d')!; g2.drawImage(bmp, 0, 0);
          const tints = [[213, 219, 227], [183, 193, 206], [154, 166, 182], [238, 241, 245]];
          for (const p of pics) {
            let seen = 0;
            for (let a1 = 1; a1 <= 5; a1++) for (let b1 = 1; b1 <= 5; b1++) { const d = g2.getImageData(Math.round(p.x + (p.w * a1) / 6), Math.round(p.y + (p.h * b1) / 6), 1, 1).data; if (tints.some((q) => Math.abs(q[0] - d[0]) + Math.abs(q[1] - d[1]) + Math.abs(q[2] - d[2]) < 40)) seen++; }
            if (seen < 8) bad.push(`${tag}: the picture at (${Math.round(p.x)},${Math.round(p.y)}) is hidden (${seen}/25 samples show it)`);
          }
          // the tick and cross badges of do-dont sit OVER their pictures (not hidden behind them)
          if (id === 'do-dont') for (const p of pics) { const d = g2.getImageData(Math.round(p.x + 52), Math.round(p.y + 52), 1, 1).data; if (tints.some((q) => Math.abs(q[0] - d[0]) + Math.abs(q[1] - d[1]) + Math.abs(q[2] - d[2]) < 40)) bad.push(`${tag}: a badge is hidden behind its picture`); }
        }
        // the pictures: inside the margins, not on each other, and NO text over a picture (so no scrim is needed)
        for (const p of pics) {
          if (p.x < 47 || p.x + p.w > 1033 || p.y < 100 || p.y + p.h > 1250) bad.push(`${tag}: a picture leaves the free field (${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.w)}x${Math.round(p.h)})`);
          for (const t of texts) if (hit(p, t, -2)) bad.push(`${tag}: "${t.text.slice(0, 16)}" is over a picture`);
        }
        for (let i = 0; i < pics.length; i++) for (let j = i + 1; j < pics.length; j++) if (hit(pics[i], pics[j], -1)) bad.push(`${tag}: two pictures overlap`);
        for (const t of texts) { const min = t.chrome ? 36 : MIN[t.name]; if (min !== undefined && t.size < min) bad.push(`${tag}: ${t.chrome ? 'chrome' : t.name} "${t.text.slice(0, 16)}" is ${Math.round(t.size)} px (< ${min})`); }
        for (const t of texts.filter((q) => !q.chrome)) if (t.x < 47 || t.x + t.w > 1033 || t.y < 0 || t.y + t.h > 1351) bad.push(`${tag}: "${t.text.slice(0, 16)}" leaves the margins`);
        for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
          if (texts[i].chrome && texts[j].chrome) continue;
          const a = texts[i], c = texts[j];
          const ov = Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
          if (ov > 0.12 * Math.min(a.w * a.h, c.w * c.h)) bad.push(`${tag}: "${a.text.slice(0, 14)}" overlaps "${c.text.slice(0, 14)}"`);
        }
        for (const t of texts) {
          const cx0 = t.x + t.w / 2, cy0 = t.y + t.h / 2;
          let sh: any = null;
          for (const q of shapes) if (q.x <= cx0 && q.x + q.w >= cx0 && q.y <= cy0 && q.y + q.h >= cy0 && (!sh || q.w * q.h <= sh.w * sh.h)) sh = q;
          const under = sh ? sh.fill : bg;
          const floor = t.size >= 96 ? 3 : 4.5;
          if (/^#/.test(String(t.color)) && ratio(t.color, under) < floor) bad.push(`${tag}: ${t.name} "${t.text.slice(0, 14)}" ${t.color} on ${under} = ${ratio(t.color, under).toFixed(2)}`);
          for (const q of t.runs) { const on = t.hl ?? under; if (/^#/.test(q.color) && ratio(q.color, on) < floor) bad.push(`${tag}: run ${q.color} on ${on} = ${ratio(q.color, on).toFixed(2)}`); }
        }
        // every required text is in the drawn picture
        const doc = new DOMParser().parseFromString(b.svg, 'image/svg+xml');
        const hay = [...doc.querySelectorAll('text')].map((n) => (n.textContent ?? '').toLowerCase()).join(' ');
        for (const fs of def.fields) {
          if (!fs.required || fs.percent || fs.image) continue;
          const val = f[fs.name];
          for (const piece of Array.isArray(val) ? val : [val]) {
            const words = String(piece).toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
            if (!words.every((w: string) => hay.includes(w))) bad.push(`${tag}: required "${fs.name}" is not fully drawn ("${String(piece).slice(0, 22)}")`);
          }
        }
        // fill of the free area: text, shapes and pictures
        const boxes = [...texts.filter((q) => !q.chrome), ...shapes.filter((q) => q.y > 100 && q.y < 1260 && q.h < 1000), ...pics];
        if (boxes.length) { const fill = (Math.max(...boxes.map((q: any) => q.y + q.h)) - Math.min(...boxes.map((q: any) => q.y))) / 1000; fills.push(fill); if (fill < 0.55) bad.push(`${tag}: fills ${Math.round(fill * 100)}%`); }
      }
    }
    return { bad, built, withPic, without, minFill: Math.round(Math.min(...fills) * 100) / 100 };
  }, IDS);
  console.log('IMAGELAYOUTS ' + JSON.stringify({ built: r.built, with: r.withPic, without: r.without, minFill: r.minFill, problems: r.bad.length }));
  expect(r.built).toBeGreaterThan(300);
  expect(r.bad.slice(0, 14), 'problems').toEqual([]);
});

test('the picture field: validated, never written by the writer; the layouts are offered only for a deck with a picture; gallery, picker and flavour know them', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (IDS) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const P = await import('/src/carousel/designLibraryPick.ts');
    const FL = await import('/src/carousel/flavour.ts');
    const PR = await import('/src/carousel/presets.ts');
    const ph = L.placeholderImage('photo');
    const out: any = { registry: IDS.every((i: string) => (L.LAYOUT_IDS as string[]).includes(i)) };
    out.valid = L.validateSlideContent('headline-body-image', { headline: 'The flip', body: 'One zip, ten seconds.', image: ph }).ok;
    out.badUrl = L.validateSlideContent('headline-body-image', { headline: 'The flip', body: 'One zip, ten seconds.', image: 'https://example.com/a.jpg' }).ok;
    out.noImageOk = L.validateSlideContent('image-row', { headline: 'Everyday', paragraph: 'One hoodie, two jobs.' }).ok;
    out.repaired = !!(D.repairFields('headline-body-image', { headline: 'The flip', body: 'One zip, ten seconds.', image: ph }) as any)?.image;
    // the writer never fills a picture field
    const spec = D.toSpec({ layout: 'headline-body-image', fields: { headline: 'The flip', body: 'One zip.', image: 'data:image/png;base64,AAAA', image2: 'x' } });
    out.writerFields = Object.keys(spec!.fields);
    const style = D.styleFromPack(PR.presetPackFor('style-7', false)).style;
    const req: any = { text: 'A launch story about a hoodie.', tone: 'clear', format: 'carousel', slides: 6, styleChoice: 'style-7', styles: [] };
    const without = D.buildLibraryPrompt(req, { hasPhoto: false, pack: PR.presetPackFor('style-7', false) }, style, 'a look', 6);
    const withP = D.buildLibraryPrompt(req, { hasPhoto: true, pack: PR.presetPackFor('style-7', false) }, style, 'a look', 6);
    out.menuWithout = IDS.filter((i: string) => without.includes('- ' + i + ':'));
    out.menuWith = IDS.filter((i: string) => withP.includes('- ' + i + ':'));
    out.fieldNote = /image\? \(a picture the person supplied: never write it, leave it out\)/.test(withP);
    // the deck rotation never picks them without a picture
    const deck = Array.from({ length: 12 }, (_, i) => ({ layout: IDS[i % IDS.length] }));
    out.rotNo = L.rotateVariants(deck as any, { photo: false }).map((p: any) => p.layout).filter((l: string) => IDS.includes(l));
    out.rotYes = L.rotateVariants(deck as any, { photo: true }).map((p: any) => p.layout).filter((l: string) => IDS.includes(l)).length;
    // gallery: greyed for a deck with no picture, enabled with one; a tile shows the neutral stand-in
    const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style, styleNotes: [], plan: { title: 'T', specs: [{ layout: 'split-text', fields: { headline: 'Why we built it', paragraph: 'We sewed the bag into the hood, so one layer does both jobs.' }, accents: [] }] } };
    const res = await D.redrawLibraryDeck(lib, { pack: PR.presetPackFor('style-7', false), hasPhoto: false }, '@h');
    const m0 = P.galleryModel(res.library, { hasPhoto: false }, '@h', 0)!;
    const m1 = P.galleryModel(res.library, { hasPhoto: true }, '@h', 0)!;
    out.galleryOff = m0.entries.filter((e: any) => IDS.includes(e.layout) && e.enabled).map((e: any) => e.layout);
    out.galleryReason = m0.entries.find((e: any) => e.layout === 'photo-cover')?.reason;
    out.galleryOn = m1.entries.filter((e: any) => IDS.includes(e.layout) && e.enabled).map((e: any) => e.layout);
    const tile = await P.drawGalleryTile(res.library, { hasPhoto: true }, '@h', 0, 'photo-cover', 0);
    out.tileHasPicture = typeof tile === 'string' && tile.includes('<image');
    out.families = IDS.map((i: string) => [i, FL.familyOf(i)]);
    out.meaning = { dd: FL.MEANING['do-dont']?.kind, pc: FL.MEANING['portrait-closing']?.kind };
    return out;
  }, IDS);
  expect(r.registry).toBe(true);
  expect(r.valid).toBe(true);
  expect(r.badUrl, 'a picture must be a data: URL').toBe(false);
  expect(r.noImageOk, 'a layout needs no picture').toBe(true);
  expect(r.repaired).toBe(true);
  expect(r.writerFields, 'the writer cannot fill a picture').toEqual(['headline', 'body']);
  expect(r.menuWithout, 'no picture layout is offered without a picture').toEqual([]);
  expect(r.menuWith.length, 'all eight are offered with a picture').toBe(8);
  expect(r.fieldNote).toBe(true);
  expect(r.rotNo, 'the deck rotation never picks one without a picture').toEqual([]);
  expect(r.rotYes).toBeGreaterThan(0);
  expect(r.galleryOff, 'greyed out for a deck with no picture').toEqual([]);
  expect(String(r.galleryReason)).toMatch(/picture/i);
  expect(r.galleryOn, 'enabled in the gallery for a deck with a picture (the layouts that keep the slide paragraph)').toEqual(expect.arrayContaining(['photo-cover', 'headline-body-image', 'image-row']));
  expect(r.tileHasPicture).toBe(true);
  for (const [n, fam] of r.families) expect(fam, `${n} has a family`).toBe('photo');
  expect(r.meaning).toEqual({ dd: 'compare', pc: 'contact' });
});

test('sheet: out/presets-v14/layouts-images.png: each image layout with a picture and without', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('/images/carousel');
  const b64 = await page.evaluate(async (IDS) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const F = await import('/src/reference/faithful.ts');
    const style = D.styleFromPack(PR.presetPackFor('hot-flat', false)).style;
    const cols: [string, 0 | 1, boolean][] = [['with a picture, v1', 0, true], ['with a picture, v2', 1, true], ['no picture, v1', 0, false], ['no picture, v2', 1, false]];
    const w = 270, h = 338, labelW = 210;
    const c = document.createElement('canvas'); c.width = labelW + cols.length * (w + 10) + 10; c.height = IDS.length * (h + 10) + 40;
    const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif';
    cols.forEach(([t], i) => g.fillText(t, labelW + 10 + i * (w + 10), 24));
    for (let r = 0; r < IDS.length; r++) {
      const id = IDS[r];
      const def = L.layoutDef(id)!;
      g.fillStyle = '#ffd54a'; g.font = 'bold 18px sans-serif'; g.fillText(id, 12, 40 + r * (h + 10) + 30);
      g.fillStyle = '#fff'; g.font = '13px sans-serif'; def.variants.forEach((vn: string, k: number) => g.fillText('v' + (k + 1) + ': ' + vn, 12, 40 + r * (h + 10) + 54 + k * 18));
      for (let i = 0; i < cols.length; i++) {
        const [, v, pic] = cols[i];
        const f: any = { ...(def.samples as any).normal };
        if (pic) def.fields.filter((q: any) => q.image).forEach((q: any, k: number) => { f[q.name] = L.placeholderImage(id === 'portrait-closing' ? 'portrait' : k % 2 ? 'art' : 'photo'); });
        const out = await D.drawOne({ layout: id, fields: f, accents: [] }, v, style, { handle: '@quick.flip', index: 2, total: 8, cut: 'plain', invert: false, density: 'normal' });
        if (!out.built) continue;
        const bm = await createImageBitmap(await F.svgToPng(out.built.svg, 540));
        g.drawImage(bm, labelW + 10 + i * (w + 10), 40 + r * (h + 10), w, h);
      }
    }
    return c.toDataURL('image/png').split(',')[1];
  }, IDS);
  fs.writeFileSync(path.join(OUT, 'layouts-images.png'), Buffer.from(b64, 'base64'));
});
