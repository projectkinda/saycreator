// The footer website line (ZERO model calls): a website is drawn ONLY when the person set one in their profile / brand settings. A profile with a handle and no website draws no website text
// (and no globe, no gap); a profile with a website set draws exactly that website. Never a site made up from the handle ("mayadesigns.com", "x.com").
import { expect, test } from '@playwright/test';

test.setTimeout(5 * 60_000);
const PRESETS = ['style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'style-6', 'style-7', 'style-8', 'dark-quiet', 'hot-flat', 'editorial-collage', 'film-paper', 'glass-gradient', 'mono-poster', 'object-neon'];

test('a handle with no website draws no website; a website that is set is drawn exactly', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async (PRESETS) => {
    const L = await import('/src/carousel/layouts/index.ts');
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const rows: any[] = [];
    const textsOf = (svg: string) => [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('text')].map((t) => (t.textContent ?? '').trim()).filter(Boolean);
    for (const p of PRESETS) {
      const base: any = D.styleFromPack(PR.presetPackFor(p, false)).style;
      const f = (L.layoutDef('cta-button')!.samples as any).normal;
      for (const [index, total] of [[1, 8], [7, 8]] as [number, number][]) {
        const none: any = await L.buildSlide('cta-button', 0, f, base, { handle: '@maya.designs', index, total, cut: 'plain' });
        const withSite: any = await L.buildSlide('cta-button', 0, f, { ...base, site: 'https://www.mayadesigns.studio/' }, { handle: '@maya.designs', index, total, cut: 'plain' });
        const t0 = textsOf(none.svg), t1 = textsOf(withSite.svg);
        const siteLike = (t: string) => /\.(com|studio|io|co|net|org)\b/i.test(t);
        rows.push({ tag: `${p}/slide ${index + 1}`, none: t0.filter(siteLike), withSite: t1.filter(siteLike), globeNone: /<ellipse/.test(none.svg), globeSite: /<ellipse/.test(withSite.svg), hasContact: !!base.deco?.contactClosing && index === total - 1 });
      }
    }
    return rows;
  }, PRESETS);
  expect(r.length).toBe(PRESETS.length * 2);
  let drawnSomewhere = false;
  for (const x of r) {
    expect(x.none, `${x.tag}: no website set, no website text`).toEqual([]);
    expect(x.withSite.every((t: string) => t === 'mayadesigns.studio'), `${x.tag}: the website that is set is drawn exactly (host only)`).toBe(true);
    if (x.withSite.length) { drawnSomewhere = true; expect(x.withSite, `${x.tag}: drawn once`).toEqual(['mayadesigns.studio']); }
    if (x.hasContact) { expect(x.globeNone, `${x.tag}: no globe icon without a website`).toBe(false); expect(x.globeSite, `${x.tag}: the globe with a website`).toBe(true); }
  }
  expect(drawnSomewhere, 'at least one preset shows the website line when it is set').toBe(true);
});

test('the deck maker passes the profile website through; none given means none drawn', async ({ page }) => {
  await page.goto('/images/carousel');
  const r = await page.evaluate(async () => {
    const D = await import('/src/carousel/designLibrary.ts');
    const PR = await import('/src/carousel/presets.ts');
    const slides = [{ layout: 'statement', fields: { headline: 'Test the core assumption' }, accents: [] }, { layout: 'big-stat', fields: { number: '68%', label: 'would pay more' }, accents: [] }, { layout: 'comparison', fields: { title: 'Two jobs', leftLabel: 'A', leftText: 'Fast', rightLabel: 'B', rightText: 'Slow' }, accents: [] }, { layout: 'stepper', fields: { title: 'Steps', steps: ['One', 'Two', 'Three'] }, accents: [] }, { layout: 'numbered-list', fields: { title: 'Flaws', items: ['One', 'Two', 'Three'] }, accents: [] }, { layout: 'split-text', fields: { headline: 'Why', paragraph: 'Because it works.' }, accents: [] }, { layout: 'cta-button', fields: { headline: 'Back it today', button: 'Back it now' }, accents: [] }];
    const run = async (preset: string, site?: string) => {
      const provider: any = { id: 'dev-cli', label: 'fake', async write() { return { text: JSON.stringify({ title: 'T', slides }), ms: 1 }; } };
      const res: any = await D.designLibraryDeck({ text: 'Back it on Kickstarter today. '.repeat(8), slides: 7, tone: 'clear', format: 'carousel', styleChoice: preset, styles: [] }, { pack: PR.presetPackFor(preset, false) as any, ...(site ? { site } : {}) }, '@maya.designs', provider, new AbortController().signal);
      return Object.values<any>(res.designed.slides).flatMap((s) => [...new DOMParser().parseFromString(s.built.svg, 'image/svg+xml').querySelectorAll('text')].map((t) => (t.textContent ?? '').trim())).filter((t) => /\.(com|studio)\b/i.test(t));
    };
    return { s4none: await run('style-4'), s4site: await run('style-4', 'mayadesigns.studio'), s7none: await run('style-7') };
  });
  expect(r.s4none, 'style-4 with a handle and no website').toEqual([]);
  expect(r.s7none, 'style-7 with a handle and no website').toEqual([]);
  expect(r.s4site.length, 'style-4 with a website').toBeGreaterThan(0);
  expect(new Set(r.s4site)).toEqual(new Set(['mayadesigns.studio']));
});
