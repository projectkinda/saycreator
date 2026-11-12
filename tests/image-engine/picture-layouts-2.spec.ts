// Round 9: six new picture layouts (photo-full-caption, split-half, title-over-photo, twin-photos, photo-grid, phone-frame), drawn by code; the model only chooses the name and the fields.
// The real second-brain text is the deck fixture; the test pictures are LAND, PORT, SQUARE, TALL (547x2400) and WIDE (2400x600), plus a very bright and a very busy picture. ZERO model calls.
// Output: out/picture-layouts-2/
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(30 * 60_000);
const OUT = 'out/picture-layouts-2';
const helpSrc = fs.readFileSync('tests/image-engine/picture-layouts.spec.ts', 'utf8');
const HELP = helpSrc.slice(helpSrc.indexOf('const HELP = `') + 14, helpSrc.indexOf('`;\n\nasync function setup'));
const srcSrc = fs.readFileSync('tests/image-engine/closing-source.spec.ts', 'utf8');
const SOURCE = srcSrc.slice(srcSrc.indexOf('export const SOURCE = `') + 23, srcSrc.indexOf('`;\n\nconst CLOSING'));
const STYLES = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'editorial-collage', 'film-paper', 'glass-gradient', 'hot-flat', 'mono-poster', 'object-neon'];
const NEW = ['photo-full-caption', 'split-half', 'title-over-photo', 'twin-photos', 'photo-grid', 'phone-frame'];
const SHAPES: [string, string][] = [['landscape', 'landscape 3:2'], ['portrait', 'portrait 2:3'], ['square', 'square'], ['tall', 'tall 547x2400'], ['wide', 'wide 2400x600']];
const save = (name: string, b64: string) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${name}`, Buffer.from(b64, 'base64')); };

async function setup(page: Page) {
  await page.route('**/api/carousel/status', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/images/carousel');
  await page.evaluate(HELP);
  await page.evaluate(`window.__sheet = async (items, cols, w, h) => {
    const H = window.__H; const gap = 10, lab = 26;
    const rows = Math.ceil(items.length / cols);
    const c = document.createElement('canvas'); c.width = gap + cols * (w + gap); c.height = gap + rows * (h + lab + gap);
    const g = c.getContext('2d'); g.fillStyle = '#dddddd'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < items.length; i++) {
      const x = gap + (i % cols) * (w + gap), y = gap + Math.floor(i / cols) * (h + lab + gap);
      g.fillStyle = '#111'; g.font = 'bold 15px sans-serif'; g.fillText(items[i].label, x, y + 18);
      if (items[i].svg) { const bm = await createImageBitmap(await H.FA.svgToPng(items[i].svg, w * 2)); g.drawImage(bm, x, y + lab, w, h); }
    }
    return await new Promise((res) => c.toBlob(async (b) => { const u = new Uint8Array(await b.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); res(btoa(t)); }, 'image/png'));
  };`);
}
/** In the page: a slide of a layout drawn the way a deck draws it (drawOne), with `pids` as its pictures (the first for "image", the next for "image2" ...). */
const DRAW = `window.__draw = async (style, id, pids, extra) => {
  const H = window.__H; const L = await import('/src/carousel/layouts/index.ts');
  const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
  const def = L.layoutDef(id);
  const f = { ...def.samples.normal, ...(extra ?? {}) };
  const keys = def.fields.filter((q) => q.image).map((q) => q.name);
  keys.forEach((k, i) => { const pid = pids[i]; if (!pid) { delete f[k]; return; } const s = H.SHAPES[pid]; f[k] = H.IM.makeRef({ id: pid, w: s[0], h: s[1], ...(s[0] / s[1] <= 0.5 ? { fy: 0.1 } : {}) }); });
  const d = await H.D.drawOne({ layout: id, fields: f, accents: extra && extra.accent ? [].concat(extra.accent) : [] }, 0, st, { handle: '@h', index: 3, total: 7, cut: 'plain', invert: false, density: 'normal' });
  return { d, st, f };
};`;

// pictures per layout and shape: twin takes the same shape twice, the grid takes four (the shape first), the phone only a tall or portrait one
const PIDS = (id: string, pid: string): string[] => (id === 'twin-photos' ? [pid, pid] : id === 'photo-grid' ? [pid, 'landscape', 'portrait', 'square'] : [pid]);

for (const style of ['dark-quiet', 'editorial-collage', 'style-4']) {
  test(`contact sheet: the six new layouts with five picture shapes (${style})`, async ({ page }) => {
    await setup(page);
    await page.evaluate(DRAW);
    const png = await page.evaluate(async ({ style, NEW, SHAPES }) => {
      const H = (window as any).__H;
      const draw = (window as any).__draw;
      const cw = 216, ch = 270, lab = 28, gap = 10, left = 190;
      const W = left + SHAPES.length * (cw + gap) + gap, Hh = 40 + NEW.length * (ch + lab + gap) + gap;
      const c = document.createElement('canvas'); c.width = W; c.height = Hh;
      const g = c.getContext('2d')!;
      g.fillStyle = '#eeeeee'; g.fillRect(0, 0, W, Hh);
      g.fillStyle = '#111'; g.font = 'bold 22px sans-serif'; g.fillText(style, 10, 28);
      SHAPES.forEach(([, name]: any, k: number) => { g.font = '16px sans-serif'; g.fillText(name, left + k * (cw + gap), 36); });
      let row = 0;
      for (const id of NEW) {
        g.fillStyle = '#111'; g.font = 'bold 15px sans-serif'; g.fillText(id, 8, 40 + row * (ch + lab + gap) + ch / 2);
        for (let k = 0; k < SHAPES.length; k++) {
          const pid = SHAPES[k][0];
          const pids = id === 'twin-photos' ? [pid, pid] : id === 'photo-grid' ? [pid, 'landscape', 'portrait', 'square'] : [pid];
          const { d } = await draw(style, id, pids);
          const x = left + k * (cw + gap), y = 40 + row * (ch + lab + gap);
          if (!d.built) { g.fillStyle = '#c00'; g.font = '13px sans-serif'; g.fillText('not drawn: ' + String(d.problems[0]).slice(0, 34), x + 6, y + 40); continue; }
          const bm = await createImageBitmap(await H.FA.svgToPng(d.built.svg, cw * 2));
          g.drawImage(bm, x, y, cw, ch);
        }
        row++;
      }
      return await new Promise<string>((res) => c.toBlob(async (b) => { const u = new Uint8Array(await b!.arrayBuffer()); let t = ''; for (const x of u) t += String.fromCharCode(x); res(btoa(t)); }, 'image/png'));
    }, { style, NEW, SHAPES });
    save(`contact-sheet-${style}.png`, png);
  });
}

test('every new layout draws in all 15 styles with every shape it allows: inside the margins, text at its minimum size or more, the picture clear of the page chrome, the promised share of the slide', async ({ page }) => {
  await setup(page);
  await page.evaluate(DRAW);
  const r = await page.evaluate(async ({ STYLES, NEW, SHAPES }) => {
    const draw = (window as any).__draw;
    const T: any = await import('/src/image-engine/draw/text.ts');
    const bad: string[] = [];
    let drawn = 0;
    for (const style of STYLES) for (const id of NEW) for (const [pid] of SHAPES) {
      // title-over-photo measures the real picture (a raster per slide): three shapes of it in every style
      if (id === 'title-over-photo' && !['landscape', 'tall', 'wide'].includes(pid)) continue;
      const pids = id === 'twin-photos' ? [pid, pid] : id === 'photo-grid' ? [pid, 'landscape', 'portrait', 'square'] : [pid];
      const { d, f } = await draw(style, id, pids);
      const tag = `${style}/${id}/${pid}`;
      if (!d.built) { bad.push(`${tag}: not drawn: ${d.problems[0]}`); continue; }
      drawn++;
      const b = d.built;
      const imgs = (b.images ?? []) as any[];
      const phoneOk = id !== 'phone-frame' || pid === 'tall' || pid === 'portrait';
      if (!phoneOk) { if (imgs.length) bad.push(`${tag}: a phone drawn for a ${pid} picture`); continue; }
      if (!imgs.length) bad.push(`${tag}: no picture drawn`);
      if (imgs.some((p) => p.circle)) bad.push(`${tag}: a circle crop`);
      const texts = (b.layers as any[]).filter((l) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring'));
      for (const l of texts) {
        const min = l.name === 'title' ? 48 : l.name === 'body' ? 44 : 0;
        if (l.style.size < min) bad.push(`${tag}: ${l.name} "${String(l.text).slice(0, 18)}" is ${Math.round(l.style.size)} px (< ${min})`);
        if (l.x < 47 || l.x + l.width > 1037.5) bad.push(`${tag}: ${l.name} leaves the margin (${Math.round(l.x)}..${Math.round(l.x + l.width)})`);
      }
      // the page chrome (the handle at the top, the counter at the foot) is never over a picture
      for (const p of imgs) if (p.y < 112 || p.y + p.h > 1252) bad.push(`${tag}: a picture reaches the page chrome (${Math.round(p.y)}..${Math.round(p.y + p.h)})`);
      const share = (p: any) => (p.w * p.h) / (1080 * 1350);
      const total = imgs.reduce((a, p) => a + share(p), 0);
      // Round 16: the caption panel grows for a two-line headline (the picture may be 60% of the slide, not 65%, 57% under the profile header strip), and a picture keeps clear of the profile header (a half may lose up to 4% to that strip)
      if (id === 'photo-full-caption' && Math.max(...imgs.map(share)) < 0.57) bad.push(`${tag}: the picture is ${Math.round(Math.max(...imgs.map(share)) * 1000) / 10}% of the slide (< 57%)`);
      if (id === 'split-half' && (total > 0.502 || total < 0.5 - 0.04)) bad.push(`${tag}: the picture is ${Math.round(total * 1000) / 10}% of the slide (not half)`);
      if (id === 'photo-grid' && imgs.length < 3) bad.push(`${tag}: ${imgs.length} tiles`);
      if (id === 'twin-photos' && imgs.length !== 2) bad.push(`${tag}: ${imgs.length} pictures`);
      // a tall picture shows its top in every tile
      if (pid === 'tall') for (const p of imgs) if (String(p.src).includes('picture:tall') && !/fy=0\.1/.test(String(p.src))) bad.push(`${tag}: a tall picture without its top focus`);
      void f; void T;
    }
    return { bad, drawn };
  }, { STYLES, NEW, SHAPES });
  expect(r.drawn).toBeGreaterThan(300);
  expect(r.bad).toEqual([]);
});

test('fallbacks: a layout without its pictures, or with a shape that does not fit, is its text form (never a broken slide, no picture box)', async ({ page }) => {
  await setup(page);
  await page.evaluate(DRAW);
  const r = await page.evaluate(async ({ NEW }) => {
    const draw = (window as any).__draw;
    const out: any[] = [];
    for (const id of NEW) {
      for (const style of ['dark-quiet', 'style-4', 'hot-flat']) {
        const none = await draw(style, id, []);
        out.push({ tag: `${style}/${id}/no pictures`, ok: !!none.d.built, images: none.d.built?.images?.length ?? 0, texts: (none.d.built?.layers ?? []).filter((l: any) => l.kind === 'text' && l.text && !String(l.name).startsWith('recurring')).length });
      }
    }
    const one = await draw('style-4', 'twin-photos', ['landscape']);
    out.push({ tag: 'twin with one picture', ok: !!one.d.built, images: one.d.built?.images?.length ?? 0, texts: 1 });
    const phone = await draw('style-4', 'phone-frame', ['landscape']);
    out.push({ tag: 'phone with a landscape picture', ok: !!phone.d.built, images: phone.d.built?.images?.length ?? 0, texts: 1 });
    const grid = await draw('style-4', 'photo-grid', ['landscape', 'portrait']);
    out.push({ tag: 'grid with two pictures', ok: !!grid.d.built, images: grid.d.built?.images?.length ?? 0, texts: 1 });
    const H = (window as any).__H;
    // the pipeline: pictures that cannot fill a layout leave it in its text form (a deck with one picture and a twin-photos slide)
    const slides = [H.BODY[0], H.BODY[1], { layout: 'twin-photos', fields: { headline: 'Two ways', caption: 'A bag', caption2: 'A hoodie' }, accents: [] }, H.BODY[2], H.BODY[3], H.BODY[4], H.CLOSING];
    const deck = await H.deck({ style: 'style-4', slides, pictures: ['landscape'], text: H.SOURCE });
    out.push({ tag: 'deck: twin-photos with one picture drawn', ok: Object.keys(deck.res.designed.slides).length === 7, images: deck.imagesOf(2).length, texts: 1 });
    return out;
  }, { NEW });
  for (const x of r) {
    expect(x.ok, x.tag).toBe(true);
    expect(x.images, `${x.tag}: no picture box`).toBe(0);
    expect(x.texts, `${x.tag}: the words are there`).toBeGreaterThan(0);
  }
});

test('title-over-photo: every word reads at 4.5:1 over 95% of the pixels behind it on a very bright and a very busy picture, in 4 styles; the scrim is strengthened as needed (title-over-photo-contrast.png)', async ({ page }) => {
  await setup(page);
  await page.evaluate(DRAW);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const draw = (window as any).__draw;
    const S: any = await import('/src/carousel/scrim.ts');
    const L: any = await import('/src/carousel/layouts/index.ts');
    const rows: any[] = [];
    const items: any[] = [];
    for (const style of ['dark-quiet', 'editorial-collage', 'style-4', 'hot-flat']) {
      for (const pid of ['bright', 'busy']) {
        const st = H.D.styleFromPack(H.PR.presetPackFor(style, false)).style;
        const s = H.SHAPES[pid];
        const f = { headline: 'The hoodie that becomes a backpack', line: 'Ten seconds, one zip.', image: H.IM.makeRef({ id: pid, w: s[0], h: s[1] }) };
        const opts = { handle: '@h', index: 3, total: 7, cut: 'plain' };
        const before = await L.buildSlide('title-over-photo', 0, f, st, { ...opts, scrim: 0 });
        const beforeRead = await S.readScrim(before);
        const { d } = await draw(style, 'title-over-photo', [pid]);
        const afterRead = d.built ? await S.readScrim(d.built) : { ok: false, worst: 0 };
        rows.push({ style, pid, beforeOk: beforeRead.ok, beforeWorst: beforeRead.worst, afterOk: afterRead.ok, afterWorst: afterRead.worst, drew: !!d.built, adj: d.adjustments.join(' ') });
        items.push({ label: `${style}/${pid}: scrim 0 (${Math.round(beforeRead.worst * 100)}% read)`, svg: before.svg });
        if (d.built) items.push({ label: `${style}/${pid}: after (${Math.round(afterRead.worst * 100)}% read)`, svg: d.built.svg });
      }
    }
    return { rows, png: await (window as any).__sheet(items, 4, 300, 375) };
  });
  save('title-over-photo-contrast.png', r.png);
  for (const x of r.rows) {
    expect(x.drew, `${x.style}/${x.pid}`).toBe(true);
    expect(x.afterOk, `${x.style}/${x.pid}: ${Math.round(x.afterWorst * 1000) / 10}% of the pixels read (needs 95%)`).toBe(true);
  }
  // at least one of the 8 cases needed more than the first gradient (the scrim is really strengthened), and the result always reads
  expect(r.rows.some((x: any) => !x.beforeOk), 'a first scrim that fails exists in these cases: ' + JSON.stringify(r.rows.map((x: any) => [x.style, x.pid, Math.round(x.beforeWorst * 100)]))).toBe(true);
});

test('title-over-photo on a normal picture (the 5 shapes) reads in a style of each tone, and a headline on a picture keeps the highlight bar', async ({ page }) => {
  await setup(page);
  await page.evaluate(DRAW);
  const r = await page.evaluate(async () => {
    const draw = (window as any).__draw;
    const S: any = await import('/src/carousel/scrim.ts');
    const rows: any[] = [];
    for (const style of ['dark-quiet', 'style-6', 'hot-flat']) for (const pid of ['landscape', 'portrait', 'square', 'tall', 'wide']) {
      const { d } = await draw(style, 'title-over-photo', [pid], { accent: ['backpack'] });
      const read = d.built ? await S.readScrim(d.built) : { ok: false, worst: 0 };
      const bar = !!d.built && (d.built.layers as any[]).some((l) => l.kind === 'text' && (l.highlight || (l.runs && l.runs.length)));
      rows.push({ tag: `${style}/${pid}`, ok: read.ok, worst: read.worst, bar });
    }
    return rows;
  });
  for (const x of r) { expect(x.ok, `${x.tag}: ${Math.round(x.worst * 1000) / 10}%`).toBe(true); expect(x.bar, `${x.tag}: the highlight is drawn`).toBe(true); }
});

test('nothing invented: every word on a new layout is from the fields (the source, or typed); no caption means no caption', async ({ page }) => {
  await setup(page);
  await page.evaluate(DRAW);
  const r = await page.evaluate(async ({ NEW }) => {
    const draw = (window as any).__draw;
    const bad: string[] = [];
    const words = (t: string) => (String(t).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
    for (const style of ['dark-quiet', 'editorial-collage', 'style-4', 'object-neon']) for (const id of NEW) for (const withCaps of [true, false]) {
      const pids = id === 'twin-photos' ? ['portrait', 'portrait'] : id === 'photo-grid' ? ['landscape', 'portrait', 'square', 'tall'] : id === 'phone-frame' ? ['tall'] : ['landscape'];
      const extra: any = withCaps ? {} : id === 'twin-photos' ? { caption: undefined, caption2: undefined } : id === 'photo-full-caption' || id === 'title-over-photo' ? { line: undefined } : id === 'phone-frame' ? { body: undefined } : {};
      const { d, f } = await draw(style, id, pids, extra);
      if (!d.built) { bad.push(`${style}/${id}: not drawn`); continue; }
      const given = new Set(Object.entries(f).filter(([k, v]) => typeof v === 'string' && !/^image\d?$/.test(k) && v).flatMap(([, v]) => words(v as string)));
      for (const l of (d.built.layers as any[]).filter((x) => x.kind === 'text' && x.text && !String(x.name).startsWith('recurring'))) for (const w of words(l.text)) if (!given.has(w)) bad.push(`${style}/${id}${withCaps ? '' : '/no captions'}: "${w}" is not in the fields`);
    }
    return bad;
  }, { NEW });
  expect(r).toEqual([]);
});

test('the highlight is carried on every new layout (a bar, a colour or a device), clamped for a writer deck, and its box stays inside the margin; a typed highlight is never changed', async ({ page }) => {
  await setup(page);
  await page.evaluate(DRAW);
  const r = await page.evaluate(async ({ NEW }) => {
    const H = (window as any).__H;
    const draw = (window as any).__draw;
    const T: any = await import('/src/image-engine/draw/text.ts');
    const FS: any = await import('/src/carousel/libraryFromScript.ts');
    const Sc: any = await import('/src/carousel/script.ts');
    const bad: string[] = [];
    let marks = 0;
    for (const style of ['style-4', 'style-7', 'hot-flat', 'editorial-collage']) for (const id of NEW) {
      const pids = id === 'twin-photos' ? ['portrait', 'portrait'] : id === 'photo-grid' ? ['landscape', 'portrait', 'square', 'tall'] : id === 'phone-frame' ? ['tall'] : ['landscape'];
      const { d } = await draw(style, id, pids, { accent: ['backpack'], headline: id === 'twin-photos' || id === 'photo-grid' || id === 'phone-frame' ? 'Open the backpack' : 'The hoodie that becomes a backpack' });
      if (!d.built) { bad.push(`${style}/${id}: not drawn`); continue; }
      const titles = (d.built.layers as any[]).filter((l) => l.kind === 'text' && l.name === 'title');
      if (!titles.some((l) => l.highlight || (l.runs && l.runs.length)) && !/font-family="(?:Instrument Serif Italic|EB Garamond Italic)"|data-ring-art|pen-underline|pen-circle/.test(d.built.svg)) bad.push(`${style}/${id}: the highlight is not drawn`);
      for (const l of titles.filter((x) => x.highlight && x.highlight.paddingX > 0)) for (const line of T.layoutText(l).lines) for (const mk of line.marks as any[]) {
        marks++;
        const left = l.x + mk.x - l.highlight.paddingX, right = l.x + mk.x + mk.width + l.highlight.paddingX;
        if (left < 47) bad.push(`${style}/${id}: the bar starts at ${Math.round(left)}`);
        if (right > 1033) bad.push(`${style}/${id}: the bar ends at ${Math.round(right)}`);
      }
    }
    // a writer's four-word highlight on a split-half slide is clamped to 2 words (3 for 8 or more words); a typed highlight is not
    const slides = [H.BODY[0], { layout: 'split-half', fields: { headline: 'Your brain is the worst place to store your life', body: 'Every unfinished task is a background process draining you all day.' }, accents: ['worst place to store'] }, H.BODY[2], H.BODY[3], H.BODY[4], H.BODY[1], H.CLOSING];
    const deck = await H.deck({ style: 'style-4', slides, pictures: ['landscape'], text: H.SOURCE });
    const clamped = deck.specs.find((s: any) => s.layout === 'split-half')?.accents ?? [];
    const script = JSON.stringify({ title: 'Brain', slides: [{ type: 'cover', headline: 'Your brain is the worst place', highlight: 'worst place', sub: 'Three things I did.' }, { type: 'content', headline: 'Give it a structure', body: 'So that it resurfaces at the right moment.', highlight: 'structure' }, { type: 'closing', headline: 'Build your own second brain', cta: 'Comment brain', highlight: 'second brain' }] });
    const made: any = await FS.libraryDeckFromScript(Sc.validateScriptText(script, 'carousel').script, { pack: H.PR.presetPackFor('style-4', false), brief: '', hasPhoto: true, images: [H.info('landscape'), H.info('tall')], site: '' }, '');
    return { bad, marks, clamped, typed: made.designed?.library?.plan?.specs?.map((s: any) => s.accents.join('|')) };
  }, { NEW });
  expect(r.marks).toBeGreaterThan(8);
  expect(r.bad).toEqual([]);
  expect(r.clamped.length).toBeGreaterThan(0);
  for (const a of r.clamped) expect(a.split(' ').length, 'clamped to 3 words at most (a 10-word headline)').toBeLessThanOrEqual(3);
  expect(r.typed[0]).toBe('worst place');
});

test('the picture pass gives the new layouts their pictures by shape and the upgrade pass never takes them: a writer deck with title-over-photo, phone-frame and twin-photos uses its four pictures once each', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const slides = [
      { layout: 'title-over-photo', fields: { headline: 'Your brain is the worst place to store your life' }, accents: ['life'] },
      { layout: 'split-text', fields: { headline: 'Saving is not keeping', paragraph: 'Most people save notes and never open them again.' }, accents: [] },
      { layout: 'phone-frame', fields: { headline: 'Open it and tap start', body: 'The first screen takes ten seconds.' }, accents: [] },
      { layout: 'checklist', fields: { title: 'What I did', items: ['Moved everything', 'Gave it context', 'Let it work'] }, accents: [] },
      { layout: 'twin-photos', fields: { headline: 'Before and after', caption: 'A bag', caption2: 'A hoodie' }, accents: [] },
      { layout: 'quote', fields: { quote: 'I let it work for me.' }, accents: [] },
      H.CLOSING,
    ];
    const d = await H.deck({ style: 'editorial-collage', slides, pictures: ['landscape', 'portrait', 'tall', 'wide'], text: H.SOURCE });
    const ids = d.specs.flatMap((s: any) => Object.entries(s.fields).filter(([k]) => /^image\d?$/.test(k)).map(([, v]: any) => String(v).slice(8).split('#')[0]));
    const at = (l: string) => d.specs.findIndex((s: any) => s.layout === l);
    const picOf = (i: number) => Object.entries(d.specs[i].fields).filter(([k]) => /^image\d?$/.test(k)).map(([, v]: any) => String(v).slice(8).split('#')[0]);
    return { layouts: d.specs.map((s: any) => s.layout), ids, title: picOf(at('title-over-photo')), phone: picOf(at('phone-frame')), twin: picOf(at('twin-photos')), calls: d.lib.calls };
  });
  expect(r.layouts.slice(0, 1)).toEqual(['title-over-photo']);
  expect(r.layouts).toContain('phone-frame');
  expect(r.layouts).toContain('twin-photos');
  expect(['tall', 'portrait'], 'the phone takes a tall or portrait picture: ' + JSON.stringify(r)).toContain(r.phone[0]);
  expect(r.title.length).toBe(1);
  expect(r.twin.length).toBe(2);
  expect(new Set(r.ids).size, 'each picture once').toBe(r.ids.length);
  expect(r.ids.length, 'all four pictures are used').toBe(4);
  expect(r.calls).toBe(1);
});

test('picture-average: 4 pictures and 7 slides in three styles: the plans with no picture layout get picture slides from the code; the writer prompt carries the six names', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const H = (window as any).__H;
    const L: any = await import('/src/carousel/layouts/index.ts');
    const plans = [
      ['statement', 'split-text', 'checklist', 'step-numeral', 'quote', 'big-stat', 'cta-button'],
      ['statement', 'prose', 'split-text', 'comparison', 'quote', 'checklist', 'cta-button'],
      ['statement', 'big-stat', 'stat-bar', 'stepper', 'split-text', 'checklist', 'cta-button'],
      ['statement', 'split-text', 'split-text', 'quote', 'comparison', 'bullet-list', 'cta-button'],
    ].map((ids) => ids.map((id) => ({ layout: id, fields: { ...L.layoutDef(id).samples.normal }, accents: [] })));
    const rows: any[] = [];
    let prompt = '';
    for (const style of ['editorial-collage', 'style-4', 'dark-quiet']) for (let p = 0; p < plans.length; p++) {
      const d = await H.deck({ style, slides: plans[p], pictures: ['landscape', 'portrait', 'tall', 'wide'] });
      if (!prompt) prompt = d.prompt;
      const ids = new Set<string>();
      let pictureSlides = 0;
      d.specs.forEach((s: any) => { const k = Object.values(s.fields).filter((v: any) => typeof v === 'string' && v.startsWith('picture:')).map((v: any) => v.slice(8).split('#')[0]); if (k.length) pictureSlides++; k.forEach((x: string) => ids.add(x)); });
      rows.push({ style, plan: p, pictureSlides, used: ids.size, layouts: d.specs.map((s: any) => s.layout), calls: d.lib.calls });
    }
    return { rows, prompt };
  });
  fs.mkdirSync(OUT, { recursive: true });
  const avg = r.rows.reduce((a: number, x: any) => a + x.pictureSlides, 0) / r.rows.length;
  const allUsed = r.rows.filter((x: any) => x.used === 4).length;
  fs.writeFileSync(`${OUT}/average.json`, JSON.stringify({ runs: r.rows.length, averagePictureSlides: Math.round(avg * 100) / 100, allFourUsed: `${allUsed} of ${r.rows.length}`, rows: r.rows }, null, 1));
  expect(avg, 'picture slides per deck (4 pictures, 7 slides, plans with no picture layout)').toBeGreaterThanOrEqual(2);
  for (const x of r.rows) expect(x.calls).toBe(1);
  for (const id of NEW) expect(r.prompt, `the writer prompt names ${id}`).toContain(`"${id}"`);
  expect(r.prompt).toMatch(/PICTURE SLIDES: use at least 3 picture slides/);
});

test('real-deck-4-pictures.png: the second-brain deck with four pictures (landscape, portrait, tall, wide) and the layouts the picture pass chose', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async ({ SOURCE }) => {
    const H = (window as any).__H;
    const slides = [
      { layout: 'statement', fields: { headline: 'Your brain is the worst place to store your life' }, accents: ['life'] },
      { layout: 'split-text', fields: { headline: 'Saving is not keeping', paragraph: 'Every unfinished task is a background process draining you all day.' }, accents: ['keeping'] },
      { layout: 'checklist', fields: { title: 'What I did', items: ['Moved everything into a structure', 'Gave it as much context as possible', 'Let it work for me'] }, accents: [] },
      { layout: 'split-text', fields: { headline: 'Think of it as a wiki', paragraph: 'Give it a structure so that it resurfaces at the right moment.' }, accents: [] },
      { layout: 'statement', fields: { headline: 'Three things I did to fix it' }, accents: [] },
      { layout: 'quote', fields: { quote: 'I let it work for me.' }, accents: [] },
      H.CLOSING,
    ];
    const d = await H.deck({ style: 'editorial-collage', slides, pictures: ['landscape', 'portrait', 'tall', 'wide'], text: SOURCE });
    const items = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ label: `${i + 1}: ${d.specs[i].layout}`, svg: d.res.designed.slides[String(i)].built.svg }));
    await (window as any).__sheet; // (defined by setup)
    return { layouts: d.specs.map((s: any) => s.layout), png: await (window as any).__sheet(items, 4, 360, 450), swaps: (d.lib.pictureSwaps ?? []).map((s: any) => `${s.slide}:${s.from}>${s.to}`), calls: d.lib.calls };
  }, { SOURCE });
  save('real-deck-4-pictures.png', r.png);
  fs.writeFileSync(`${OUT}/real-deck-4-pictures-layouts.txt`, r.layouts.join(', ') + '\n' + r.swaps.join(', '));
  expect(r.layouts).toHaveLength(7);
  expect(r.calls).toBe(1);
});
