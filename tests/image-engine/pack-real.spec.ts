// Step 17c, REAL (REAL_PACK=1): one Quick pack from a full-size reference (its first slide is recreated first) and one full pack from a description. A sheet of all the
// slide types side by side, and the pack applied to a 5-slide carousel. Reference files are read from the private test-assets folder and never stored in the repo.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './reference-helpers';

const OUT = path.join(ROOT, 'out/image-engine/pack');
test.skip(process.env.REAL_PACK !== '1', 'Real runs are opt-in (REAL_PACK=1): they use model time.');
test.describe.configure({ mode: 'serial' });
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

const FILE = path.join(ROOT, 'test-assets', 'WhatsApp Image 2026-10-27 at 11.30.42 AM (2).jpeg');
const RUNS = [
  { id: 'from-reference', kind: 'reference', size: 'quick' },
  { id: 'from-description', kind: 'description', size: 'full', description: 'A warm, friendly coaching brand: cream paper, deep green and terracotta, big soft serif headlines, hand-drawn underlines and small leaf doodles.' },
];

// PACK_ONLY=<id> runs one of them.
for (const run of RUNS.filter((r) => !process.env.PACK_ONLY || r.id === process.env.PACK_ONLY)) {
  test(`real pack: ${run.id}`, async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto('/images/carousel');
    const b64 = run.kind === 'reference' ? fs.readFileSync(FILE).toString('base64') : '';
    const replay = process.env.PACK_REPLAY ? fs.readFileSync(process.env.PACK_REPLAY, 'utf8') : '';
    const r = await page.evaluate(async ([run, b64, replay]) => {
      const I = await import('/src/reference/images.ts');
      const R = await import('/src/reference/recreate.ts');
      const P = await import('/src/reference/pack.ts');
      const M = await import('/src/reference/PackMaker.tsx');
      const D = await import('/src/reference/reader.ts');
      const T = await import('/src/reference/templates.ts');
      const B = await import('/src/reference/blank.ts');
      const Dc = await import('/src/carousel/doc.ts');
      const S = await import('/src/carousel/script.ts');
      const C = await import('/src/carousel/render.ts');
      const reader = (await D.detectReaders())[0];
      const sig = new AbortController().signal;
      const asUrl = (b: Blob) => new Promise<string>((res) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.readAsDataURL(b); });
      let ref: { url: string; width: number; height: number } | null = null;
      let first: { svg: string; layers: unknown[] } | null = null;
      let calls = 0;
      let seconds1 = 0;
      const out: Record<string, unknown> = { id: run.id, size: run.size };
      if (run.kind === 'reference') {
        const bm = await I.bitmapOf(new Blob([Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0))]));
        ref = await I.jpegUrl(bm, null, 1400);
        out.refSize = [ref.width, ref.height, Math.round((ref.url.length * 3) / 4 / 1000)];
        const ctx = { w: 1080, h: 1350, ownRoles: [] as string[] };
        const t0 = performance.now();
        const text = await R.callRecreate(reader, R.buildRecreatePrompt(ctx), [I.readerImageOf(ref.url, 'reference.jpg')], sig);
        calls++;
        seconds1 = (performance.now() - t0) / 1000;
        const a = await R.answerToLayers(text, ctx);
        if (!a.ok) return { ...out, ok: false, reasons: a.reasons };
        first = { svg: a.result.svg, layers: a.result.layers };
      }
      const types = run.size === 'quick' ? ['cover', 'content'] : [...P.PACK_TYPES];
      const t1 = performance.now();
      const prompt = P.buildPackPrompt({ kind: run.kind as 'reference' | 'description', types: types as never, description: (run as { description?: string }).description, firstSvg: first?.svg });
      // PACK_REPLAY=<file> answers from a saved model answer, so a fix can be measured again with no model call.
      const text = replay ? (replay as string) : await P.callPack(reader, prompt, ref ? [I.readerImageOf(ref.url, 'reference.jpg')] : [], sig);
      (window as unknown as { __packText?: string }).__packText = text;
      calls++;
      const seconds2 = (performance.now() - t1) / 1000;
      const parsed = await P.parsePack(text, run.id);
      if (!parsed.ok) return { ...out, ok: false, reasons: parsed.reasons, raw: text.slice(0, 600), seconds2 };
      const pack = { ...parsed.pack, ...(first ? { designs: { ...parsed.pack.designs, base: first.layers } } : {}) } as never as import('/src/reference/pack.ts').StylePack;
      const check = P.distinctCheck(pack);
      // Does any text slot reach past the slide when a slide's own words are in it? (the longest samples of each type)
      const LONG: Record<string, Record<string, unknown>> = { cover: { type: 'cover', kicker: 'A rather long kicker line', headline: 'Why your morning routine keeps failing every single week', sub: 'And the small fix that finally works for people' }, step: { type: 'step', number: 3, headline: 'Start with five minutes only', body: 'Pick one habit. Do it for five minutes only. Stop while it still feels easy.' }, content: { type: 'content', headline: 'Make it obvious and easy to start', body: 'Put the thing you need where you will see it. The easier it is to start, the more often you will.' }, quote: { type: 'quote', quote: 'Clear beats clever, every single time, even when clever is more fun to write.', by: 'An editor' } };
      const overflow: Record<string, number> = {};
      for (const [t, sl] of Object.entries(LONG)) {
        const lay = P.packSlide(pack, String(sl.type), sl, '@yourname').layers as unknown as { kind: string; visible?: boolean; x: number; y: number; width: number; height: number }[];
        overflow[t] = lay.filter((l) => l.kind === 'text' && l.visible !== false && (l.x < -1 || l.x + l.width > pack.canvas.w + 1 || l.y + l.height > pack.canvas.h + 1)).length;
      }
      // The sheet: every slide type side by side.
      const thumbs = await M.packThumbs(pack, 0.3);
      const bms = await Promise.all(thumbs.map((t) => createImageBitmap(t.blob)));
      const lw = ref ? await I.bitmapFromUrl(ref.url) : null;
      const cw = 330;
      const ch = Math.round(cw * 1.25);
      const sheet = new OffscreenCanvas(cw * (bms.length + (lw ? 1 : 0)) + 10 * (bms.length + 2), ch + 50);
      const g = sheet.getContext('2d')!;
      g.fillStyle = '#e8e8e8';
      g.fillRect(0, 0, sheet.width, sheet.height);
      g.fillStyle = '#111';
      g.font = '16px sans-serif';
      let x = 10;
      if (lw) {
        const k = Math.min(cw / lw.width, ch / lw.height);
        g.drawImage(lw, x, 30, lw.width * k, lw.height * k);
        g.fillText('reference', x, 20);
        x += cw + 10;
      }
      bms.forEach((b, i) => {
        g.drawImage(b, x, 30, cw, ch);
        g.fillText(thumbs[i].type, x, 20);
        x += cw + 10;
      });
      // Apply it to a generated 5-slide carousel (no model call).
      await T.ensureTemplatesLoaded();
      const tpl = await T.saveTemplate({ name: `${run.id} pack`, target: 'carousel', spec: { ...B.blankStyle(), name: T.styleNameFor(run.id) }, preview: '', pack });
      const script = {
        ...S.EXAMPLE,
        slides: [
          { type: 'cover', kicker: 'Habits', headline: 'Why your morning routine keeps failing', sub: 'And the small fix that works' },
          { type: 'step', number: 1, headline: 'Start with five minutes', body: 'Pick one habit. Do it for five minutes only. Stop while it still feels easy.' },
          { type: 'content', headline: 'Make it obvious', body: 'Put the thing you need where you will see it. The easier it is to start, the more often you will.' },
          { type: 'stat', kicker: 'The numbers', value: '66 days', label: 'to feel automatic', note: 'on average, not 21' },
          { type: 'closing', headline: 'Save this for Monday', cta: 'Follow for one tip a week' },
        ],
      };
      const doc = { ...Dc.emptyDoc(tpl.spec.name), script };
      const t2 = performance.now();
      const composed = C.composeDoc(doc as never);
      const applyMs = performance.now() - t2;
      const sb: ImageBitmap[] = [];
      const notes: string[] = [];
      for (const s of composed.slides) {
        sb.push(await createImageBitmap(await C.renderer.preview(s.plan, 0.3)));
        notes.push(...(((s as unknown as { notes?: string[] }).notes) ?? []));
      }
      const sheet2 = new OffscreenCanvas(cw * sb.length + 10 * (sb.length + 1), ch + 20);
      const g2 = sheet2.getContext('2d')!;
      g2.fillStyle = '#e8e8e8';
      g2.fillRect(0, 0, sheet2.width, sheet2.height);
      sb.forEach((b, i) => g2.drawImage(b, 10 + i * (cw + 10), 10, cw, ch));
      return {
        ...out,
        ok: true,
        calls,
        seconds: { firstSlide: Math.round(seconds1 * 10) / 10, pack: Math.round(seconds2 * 10) / 10 },
        designs: Object.keys(pack.designs),
        palette: pack.palette,
        fonts: pack.fonts,
        alike: check.alike,
        overflow,
        packJson: JSON.stringify(pack),
        textSlots: Object.fromEntries(Object.entries(pack.designs).map(([k, v]) => [k, (v as { kind: string; name: string }[]).filter((l) => l.kind === 'text').map((l) => l.name)])),
        packNotes: pack.notes.slice(0, 8),
        problems: parsed.problems,
        applyMs: Math.round(applyMs),
        applyNotes: notes,
        sheet: await asUrl(await sheet.convertToBlob({ type: 'image/png' })),
        sheet2: await asUrl(await sheet2.convertToBlob({ type: 'image/png' })),
      };
    }, [run, b64, replay] as const).catch(async (e) => {
      const raw = await page.evaluate(() => (window as unknown as { __packText?: string }).__packText ?? '').catch(() => '');
      if (raw) fs.writeFileSync(path.join(OUT, `raw-${run.id}.txt`), raw);
      throw e;
    });
    const { sheet, sheet2, packJson, ...rest } = r as Record<string, unknown> & { sheet?: string; sheet2?: string; packJson?: string };
    const rawNow = await page.evaluate(() => (window as unknown as { __packText?: string }).__packText ?? '');
    if (rawNow) fs.writeFileSync(path.join(OUT, `raw-${run.id}.txt`), rawNow);
    if (packJson) fs.writeFileSync(path.join(OUT, `pack-${run.id}.json`), packJson);
    if (sheet) fs.writeFileSync(path.join(OUT, `sheet-${run.id}.png`), Buffer.from(sheet.split(',')[1], 'base64'));
    if (sheet2) fs.writeFileSync(path.join(OUT, `applied-${run.id}.png`), Buffer.from(sheet2.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(OUT, `${run.id}.json`), JSON.stringify(rest, null, 1));
    console.log('PACK', JSON.stringify(rest).slice(0, 2200));
    expect((r as { ok: boolean }).ok, JSON.stringify(rest).slice(0, 600)).toBe(true);
  });
}
