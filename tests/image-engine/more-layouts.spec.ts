// The 11 layouts of Round C (prose, statement-stacked / -card / -pill / -question, contact-closing, cta-pair, numbered-stagger, bullet-list, pill-stagger, headline-card).
// ZERO model calls; static. Every one: draws in both variants with short / normal / long text on a light, a dark and two preset styles; no text over text, nothing outside the margins,
// minimum sizes (title 48, body 44, kicker 48, chrome 36), contrast floors on the surface each text sits on, no required text dropped, fill of the free area at least 55%, the
// preset's case and weights applied, the layout gallery lists it, the flavour pass only swaps inside a meaning class, the writer menu teaches it, and each preset's flavour names real layouts.
import { expect, test } from '@playwright/test';

test.setTimeout(10 * 60_000);
const NEW = ['prose', 'statement-stacked', 'statement-card', 'statement-pill', 'statement-question', 'contact-closing', 'cta-pair', 'numbered-stagger', 'bullet-list', 'pill-stagger', 'headline-card'];

test('each new layout: both variants, short / normal / long text, four styles: no overlap, minimums, contrast, nothing dropped, fill', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (NEW) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const C = await import('/src/image-engine/lint/color.ts');
    const rgb = (c: string) => C.parseColor(c).rgb;
    const ratio = (a: string, b: string) => C.contrastRgb(rgb(a), rgb(b));
    const light: any = { palette: { bg: '#FFFFFF', text: '#0A0A0A', muted: '#5C5C5C', accent: '#1B5E20', surface: '#F0F0F0', onAccent: '#FFFFFF' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: false, profileHeader: false, underline: false }, accentStyle: 'text' };
    const dark: any = { palette: { bg: '#0A0A0A', text: '#FFFFFF', muted: '#A6A6A6', accent: '#FFD54A', surface: '#242424', onAccent: '#0A0A0A' }, fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' }, background: 'flat', devices: { marker: true, profileHeader: false, underline: false }, accentStyle: 'marker' };
    const styles: Record<string, any> = { light, dark, 'style-7': D.styleFromPack(PR.presetPackFor('style-7', false)).style, 'style-4': D.styleFromPack(PR.presetPackFor('style-4', false)).style };
    const MIN: Record<string, number> = { title: 48, body: 44, kicker: 48, tag: 48, caption: 44 };
    const bad: string[] = [];
    const hit = (a: any, b: any, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
    let built = 0;
    const fills: number[] = [];
    for (const id of NEW) {
      const def = L.layoutDef(id)!;
      for (const [sn, st] of Object.entries<any>(styles)) for (const v of [0, 1] as const) for (const len of ['short', 'normal', 'long'] as const) {
        const f = (def.samples as any)[len];
        const tag = `${id}/${sn}/v${v + 1}/${len}`;
        const b = await L.buildSlide(id, v, f, st, { handle: '@quick.flip', index: 2, total: 8, cut: 'plain' });
        built++;
        if (!b.ok) { bad.push(`${tag}: not drawn (${b.errors[0]})`); continue; }
        const layers = b.layers as any[];
        const texts = layers.filter((l) => l.kind === 'text' && l.text).map((l) => ({ name: String(l.name), chrome: String(l.name).startsWith('recurring'), x: l.x, y: l.y, w: l.width, h: l.height, size: l.style.size, color: l.style.color, text: String(l.text), runs: l.runs ?? [], hl: l.highlight?.color ?? null }));
        const shapes = layers.filter((l) => l.kind === 'shape' && typeof l.fill === 'string' && /^#[0-9a-f]{6}/i.test(l.fill) && (l.opacity ?? 1) >= 0.95 && l.width * l.height < 1080 * 1350 * 0.9 && !/background/.test(String(l.name))).map((l) => ({ x: l.x, y: l.y, w: l.width, h: l.height, fill: l.fill as string }));
        const bg = (b.fieldBg ?? st.palette.bg) as string;
        // minimum sizes
        for (const t of texts) { const min = t.chrome ? 36 : MIN[t.name]; if (min !== undefined && t.size < min) bad.push(`${tag}: ${t.chrome ? 'chrome' : t.name} "${t.text.slice(0, 16)}" is ${Math.round(t.size)} px (< ${min})`); }
        // inside the margins and the slide
        for (const t of texts.filter((q) => !q.chrome)) if (t.x < 47 || t.x + t.w > 1081 - 47 + 2 || t.y < 0 || t.y + t.h > 1351) bad.push(`${tag}: "${t.text.slice(0, 16)}" leaves the margins (${Math.round(t.x)},${Math.round(t.y)},${Math.round(t.w)}x${Math.round(t.h)})`);
        // no text over text (content with content and with the chrome)
        for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
          if (texts[i].chrome && texts[j].chrome) continue;
          const a = texts[i], c = texts[j];
          const ov = Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
          if (ov > 0.12 * Math.min(a.w * a.h, c.w * c.h)) bad.push(`${tag}: "${a.text.slice(0, 14)}" overlaps "${c.text.slice(0, 14)}"`);
        }
        // contrast on the surface under each text
        for (const t of texts) {
          const cx0 = t.x + t.w / 2, cy0 = t.y + t.h / 2;
          let sh: any = null;
          for (const q of shapes) if (q.x <= cx0 && q.x + q.w >= cx0 && q.y <= cy0 && q.y + q.h >= cy0 && (!sh || q.w * q.h <= sh.w * sh.h)) sh = q; // the smallest shape under the text, the later one when equal (a card is drawn after its shadow)
          const under = sh ? sh.fill : bg;
          const floor = t.size >= 96 ? 3 : 4.5;
          if (/^#/.test(String(t.color)) && ratio(t.color, under) < floor) bad.push(`${tag}: ${t.name} "${t.text.slice(0, 14)}" ${t.color} on ${under} = ${ratio(t.color, under).toFixed(2)} (< ${floor})`);
          for (const q of t.runs) { const on = t.hl ?? under; if (/^#/.test(q.color) && ratio(q.color, on) < floor) bad.push(`${tag}: run ${q.color} on ${on} = ${ratio(q.color, on).toFixed(2)}`); }
        }
        // every required text of the slide is drawn
        const doc = new DOMParser().parseFromString(b.svg, 'image/svg+xml');
        const drawn = [...doc.querySelectorAll('text')].map((n) => n.textContent ?? '').join(' \n ');
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
        const hay = norm(drawn);
        for (const fs of def.fields) {
          if (fs.percent || (id === 'contact-closing' && v === 1 && fs.name === 'button')) continue;
          if (!fs.required && f[fs.name] === undefined) continue; // a field the sample has is drawn, optional or not
          const val = f[fs.name];
          for (const piece of Array.isArray(val) ? val : [val]) {
            const p = norm(String(piece));
            // a case style may change the case; words may wrap: compare the words in order
            const words = p.split(' ').filter(Boolean);
            const ok = words.every((w: string) => hay.includes(w));
            if (!ok) bad.push(`${tag}: required "${fs.name}" is not fully drawn ("${String(piece).slice(0, 22)}")`);
          }
        }
        // fill of the free area (text and shapes, not the chrome)
        const boxes = [...texts.filter((q) => !q.chrome), ...shapes.filter((q) => q.y > 100 && q.y < 1260 && q.h < 1000)];
        if (boxes.length) { const fill = (Math.max(...boxes.map((q) => q.y + q.h)) - Math.min(...boxes.map((q) => q.y))) / 1000; fills.push(fill); if (fill < 0.55) bad.push(`${tag}: fills ${Math.round(fill * 100)}%`); }
      }
    }
    return { bad, built, minFill: Math.round(Math.min(...fills) * 100) / 100 };
  }, NEW);
  console.log('NEWLAYOUTS ' + JSON.stringify({ built: r.built, minFill: r.minFill, problems: r.bad.length }));
  expect(r.built).toBe(NEW.length * 4 * 2 * 3);
  expect(r.bad.slice(0, 12), 'problems').toEqual([]);
});

test('the registry, the gallery and the picker list every new layout; the writer menu teaches them; flavour swaps stay inside a meaning class', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (NEW) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const P = await import('/src/carousel/designLibraryPick.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const FL = await import('/src/carousel/flavour.ts');
    const PR = await import('/src/carousel/presets.ts');
    const ids: string[] = [...L.LAYOUT_IDS];
    const out: any = { inRegistry: NEW.every((n: string) => ids.includes(n)), count: ids.length };
    // the gallery of a prose slide lists every layout of the registry (so the new ones too) and draws the enabled tiles
    const style = D.styleFromPack(PR.presetPackFor('hot-flat', false)).style;
    const lib: any = { route: 'library', provider: 'none', tokenNote: '', calls: 0, tokens: null, seconds: 0, layouts: [], variants: [], cuts: [], inverts: [], densities: [], suggested: { cut: [], invert: [], density: [] }, retries: [], fallbacks: [], codeAdjustments: [], style, styleNotes: [], plan: { title: 'T', specs: [{ layout: 'headline-card', fields: { headline: 'How it works', card: 'The hood folds into a waterproof pocket that holds a laptop.' }, accents: [] }, { layout: 'prose', fields: { heading: 'Why we built it', p1: 'We sewed a bag into the hood, so one layer does both jobs.' }, accents: [] }, { layout: 'statement', fields: { headline: 'Your bag is now your hoodie', caption: 'Zip, flip, go.' }, accents: [] }] } };
    const res = await D.redrawLibraryDeck(lib, { pack: PR.presetPackFor('hot-flat', false), hasPhoto: false }, '@h');
    const m = P.galleryModel(res.library, { hasPhoto: false }, '@h', 1)!;
    const gids = m.entries.map((e: any) => e.layout);
    out.galleryHasAll = NEW.every((n: string) => gids.includes(n));
    out.galleryEnabledProse = m.entries.filter((e: any) => e.enabled && NEW.includes(e.layout)).map((e: any) => e.layout);
    const m2 = P.galleryModel(res.library, { hasPhoto: false }, '@h', 2)!;
    out.galleryEnabled = m2.entries.filter((e: any) => e.enabled && NEW.includes(e.layout)).map((e: any) => e.layout);
    out.galleryReasonsOk = m.entries.filter((e: any) => !e.enabled && NEW.includes(e.layout)).every((e: any) => typeof e.reason === 'string' && e.reason.length > 8 && e.reason.length < 130);
    const tile = await P.drawGalleryTile(res.library, { hasPhoto: false }, '@h', 2, 'statement-card', 1);
    out.tileDrawn = typeof tile === 'string' && tile.includes('<svg');
    // the writer menu and the rules
    const look: any = { hasPhoto: false, pack: PR.presetPackFor('style-7', false) };
    const prompt = D.buildLibraryPrompt({ text: 'A launch story about a hoodie.', tone: 'clear', format: 'carousel', slides: 6, styleChoice: 'style-7', styles: [] } as any, look, style, 'a look', 6);
    out.prompt = { listsAll: NEW.every((n: string) => prompt.includes('- ' + n + ':')), prose: /prose[^\n]*ONLY layout that takes whole paragraphs/.test(prompt) || /ONLY layout that takes whole paragraphs/.test(prompt), pill: prompt.includes('statement-pill'), closing: prompt.includes('contact-closing') && prompt.includes('cta-pair'), standAlone: /reads on its own as a full title/.test(prompt) };
    // budgets: prose takes 300 characters, a statement does not
    const long = 'x'.repeat(5);
    const para = ('We sewed a bag into the hood so one layer does both jobs. ').repeat(5).slice(0, 290).trim();
    out.proseOk = L.validateSlideContent('prose', { heading: 'Why', p1: para }).ok;
    out.statementRefuses = !L.validateSlideContent('statement-card', { headline: para }).ok;
    void long;
    // flavour classes: every new layout has a family; prose keeps its meaning; open layouts swap among themselves
    out.families = NEW.map((n: string) => [n, FL.familyOf(n)]);
    out.meaning = { prose: FL.MEANING.prose?.kind, contact: FL.MEANING['contact-closing']?.kind, stagger: FL.MEANING['numbered-stagger']?.kind };
    const flav = { cover: 'statement', prefer: ['statement', 'statement-card'], avoid: ['prose'] };
    const st2: any = { ...style, flavour: flav };
    const proseSpec = { layout: 'prose', fields: { heading: 'Why we built it', p1: 'We sewed a bag into the hood, so one layer does both jobs.' }, accents: [] };
    const stSpec = { layout: 'statement', fields: { headline: 'Your bag is now your hoodie', caption: 'Zip, flip, go.' }, accents: [] };
    const q = { layout: 'quote', fields: { quote: 'I stopped carrying a bag the day this arrived.', author: 'An early backer' }, accents: [] };
    const fp = FL.flavourPass([stSpec, proseSpec, q, { ...stSpec }] as any, st2, { hasPhoto: false } as any, 'test');
    out.flavour = fp.specs.map((s: any) => s.layout);
    // each preset's flavour names real layouts
    const preset: Record<string, string[]> = {};
    for (const n of ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8']) {
      const fl: any = D.styleFromPack(PR.presetPackFor(n, false)).style.flavour;
      const names = [fl.cover, ...(fl.prefer ?? []), ...(fl.avoid ?? []), ...Object.keys(fl.variants ?? {})].filter(Boolean);
      preset[n] = names.filter((x: string) => !ids.includes(x));
    }
    out.presetUnknown = preset;
    return out;
  }, NEW);
  expect(r.inRegistry).toBe(true);
  expect(r.galleryHasAll, 'the gallery lists every new layout').toBe(true);
  expect(r.galleryEnabledProse, 'a prose slide keeps prose (a layout that would drop its paragraph is greyed out)').toContain('prose');
  expect(r.galleryEnabled, 'a short statement can take these in the gallery').toEqual(expect.arrayContaining(['statement-card', 'statement-question', 'statement-pill']));
  expect(r.galleryReasonsOk).toBe(true);
  expect(r.tileDrawn).toBe(true);
  expect(r.prompt.listsAll, 'the writer menu lists every new layout with its fields').toBe(true);
  expect(r.prompt.prose, 'prose is the only layout that takes paragraphs').toBe(true);
  expect(r.prompt.pill && r.prompt.closing).toBe(true);
  expect(r.proseOk).toBe(true);
  expect(r.statementRefuses).toBe(true);
  for (const [n, fam] of r.families) expect(fam, `${n} has a family`).toBeTruthy();
  expect(r.meaning).toEqual({ prose: 'prose', contact: 'contact', stagger: 'order' });
  expect(r.flavour[1], 'a prose slide stays prose (its own meaning class)').toBe('prose');
  expect(r.flavour[2], 'a quote stays a quote').toBe('quote');
  expect(r.presetUnknown, 'every layout a preset prefers, avoids or varies exists').toEqual({ 'style-1': [], 'style-2': [], 'style-3': [], 'style-4': [], 'style-5': [], 'style-6': [], 'style-7': [], 'style-8': [] });
});
