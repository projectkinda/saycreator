// Phone-size contrast in the older built-in styles 2, 4, 7 (and 8): every sample slide type, drawn by BOTH routes (the template route and the layout library), must pass the phone-size
// check. The check is the app's own (4.5:1 over 95% of the pixels behind each word); nothing here loosens it. ZERO model calls.
// Writes the list of failures (if any) to out/contrast-fix/failures-<label>.json and the contact sheets out/contrast-fix/<label>-style-N.png.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(600_000);
const LABEL = process.env.CONTRAST_LABEL ?? 'run';
const STYLES: [string, string][] = [['style-2', 'Bold orange'], ['style-4', 'Electric blue play'], ['style-7', 'Pink serif stickers'], ['style-8', 'Black holographic']];
const SCRIPTS = fs.readdirSync('sample-scripts').filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join('sample-scripts', f), 'utf8')));
// the example script as well: it has every slide type
const only = process.env.CONTRAST_STYLES ? process.env.CONTRAST_STYLES.split(',') : STYLES.map(([n]) => n);

test('every sample slide type in styles 2, 4 and 7 (and 8) passes the phone-size check, on the template route and on the layout library', async ({ page }) => {
  await page.goto('/images/carousel');
  fs.mkdirSync('out/contrast-fix', { recursive: true });
  const all: any[] = [];
  for (const [style, title] of STYLES.filter(([n]) => only.includes(n))) {
    const res = await page.evaluate(async ({ style, scripts }) => {
      const R: any = await import('/src/carousel/render.ts');
      const D: any = await import('/src/carousel/doc.ts');
      const PR: any = await import('/src/carousel/presets.ts');
      const FS: any = await import('/src/carousel/libraryFromScript.ts');
      const F: any = await import('/src/reference/faithful.ts');
      const out: any[] = [];
      const sheets: Record<string, string> = {};
      for (const route of ['template', 'library'] as const) {
        const bitmaps: ImageBitmap[] = [];
        for (const [si, script0] of scripts.entries()) {
          const S: any = await import('/src/carousel/script.ts');
          const script = { ...S.validateScriptText(JSON.stringify(script0), 'carousel').script, id: 'sample-' + si };
          let doc: any = { ...D.emptyDoc(style), script };
          if (route === 'library') {
            const pack = PR.presetPackFor(style);
            const look = { pack, brief: '', hasPhoto: false, images: [], site: '' };
            const made: any = await FS.libraryDeckFromScript(script, look, '');
            if (!made.ok) { out.push({ route, script: si, error: made.reason }); continue; }
            doc = { ...doc, script: made.script, designed: { ...made.designed, library: { ...made.designed.library, source: style } } };
          }
          const { slides, margin } = R.composeDoc(doc);
          for (const [i, s] of slides.entries()) {
            const r: any = await R.renderer.render(s, margin);
            if (bitmaps.length < 24) bitmaps.push(await createImageBitmap(r.png));
            for (const l of r.lint.filter((x: any) => !x.pass)) out.push({ route, script: si, slide: i + 1, type: script.slides[i]?.type, layout: s.layout, label: l.label, reason: l.reason, palette: s.palette, bg: s.plan?.canvas?.background, texts: (s.plan?.layers ?? []).filter((x: any) => x.kind === 'text').map((x: any) => ({ t: String(x.text ?? '').slice(0, 24), c: x.style?.color ?? x.color })) });
          }
        }
        const w = 216, h = 270, cols = 7;
        const c = document.createElement('canvas'); c.width = cols * (w + 6) + 6; c.height = Math.ceil(bitmaps.length / cols) * (h + 6) + 6;
        const g = c.getContext('2d')!; g.fillStyle = '#777'; g.fillRect(0, 0, c.width, c.height);
        bitmaps.forEach((b, k) => g.drawImage(b, 6 + (k % cols) * (w + 6), 6 + Math.floor(k / cols) * (h + 6), w, h));
        sheets[route] = c.toDataURL('image/png').split(',')[1];
      }
      void F;
      return { out, sheets };
    }, { style, scripts: SCRIPTS });
    for (const [route, b64] of Object.entries(res.sheets)) fs.writeFileSync(`out/contrast-fix/${LABEL}-${style}-${route}.png`, Buffer.from(b64 as string, 'base64'));
    all.push(...res.out.map((o: any) => ({ style, title, ...o })));
  }
  fs.writeFileSync(`out/contrast-fix/failures-${LABEL}.json`, JSON.stringify(all, null, 2));
  console.log('CONTRAST_FAILURES', all.length);
  for (const f of all.slice(0, 60)) console.log('CF', f.style, f.route, 'script', f.script, 'slide', f.slide, f.type, f.layout ?? '', f.palette ?? '', '|', String(f.reason ?? f.error).slice(0, 110));
  expect(all.filter((f) => f.reason || f.error).map((f) => `${f.style} (${f.route}) script ${f.script} slide ${f.slide} ${f.type}: ${f.reason ?? f.error}`)).toEqual([]);
});

test('the palettes of styles 2, 4, 7 and 8: every text-on-ground pair the layouts use reads at 4.5:1 or more (a static check of the style files, no drawing)', () => {
  const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bad: string[] = [];
  for (const [name] of STYLES) {
    const j = JSON.parse(fs.readFileSync(`src/image-engine/styles/${name}/style.json`, 'utf8'));
    for (const [pn, p] of Object.entries<any>(j.palettes)) {
      for (const [label, fg, bg] of [['text on ground', p.text, p.bg], ['muted on ground', p.muted, p.bg], ['accent on ground', p.accent, p.bg], ['ink on accent', p.onAccent, p.accent], ['ink on marker', p.onMarker, p.marker], ['ink on card', p.onSurface, p.surface]] as [string, string, string][]) {
        const r = ratio(fg, bg);
        if (r < 4.5) bad.push(`${name} ${pn}: ${label} ${fg} on ${bg} = ${r.toFixed(2)}:1`);
      }
    }
  }
  expect(bad).toEqual([]);
});
