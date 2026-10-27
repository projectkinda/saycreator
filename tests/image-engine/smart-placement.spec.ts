// Smart element placement. Elements follow what each slide says: element_tags per slide in the script (written by hand for now),
// a planner interface a model fills later, patches that change the tags, a lint that flags an unrelated element, and a
// placement that prefers a related element or none. Every slide is its own file; no contact sheets.
// The sample is 4 hand-tagged decks. It shows the mechanism works on them; it does not prove it generalises.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTagPatch, briefOf, checkElementTags, expandTags, linkScore, planTags, plannerPrompt, scriptPlanner, VOCABULARY, type ElementPlanner } from '../../src/image-engine/styles/tags';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/image-engine/smart-placement');
const TEST_DIR = path.join(ROOT, 'test-assets');
const DECKS = fs.readdirSync(path.join(ROOT, 'tests/image-engine/carousels')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/image-engine/carousels', f), 'utf8')));
const STYLES = ['hot-flat', 'editorial-collage', 'object-neon'];

interface Lint { id: string; pass: boolean; reason: string }
interface Slide { id: string; type: string; layout: string; palette: string; notes: string[]; plan: { layers: { id: string; kind: string; element?: string; name?: string }[]; meta?: { elementTags?: string[] } }; lint: Lint[]; elementsUsed: string[]; elementTags: string[] | null; elementLinks: { id: string; related: boolean | null; score: number }[]; png: string; phone: string; warnings: { code: string }[] }
interface TA { name: string; url: string; width: number; height: number; tags: string[] }

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const write = (rel: string, data: string | Buffer) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), data);
};
const IMG = /\.(png|jpe?g|webp|svg|gif)$/i;
const realTestAssets = () => (fs.existsSync(TEST_DIR) ? fs.readdirSync(TEST_DIR).filter((f) => IMG.test(f)) : []);
const tagsOf = (name: string) => name.toLowerCase().replace(/\.[^.]+$/, '').split(/[^a-z]+/).filter((w) => w.length > 1);

test.describe.configure({ mode: 'serial' });

test.describe('tags and planner (no browser)', () => {
  test('every sample slide has 2 to 4 valid element_tags, all from the planner vocabulary', async () => {
    for (const d of DECKS) {
      expect(d.slides).toHaveLength(7);
      for (const [i, s] of d.slides.entries()) {
        expect(checkElementTags(s.element_tags), `${d.id} slide ${i + 1}`).toEqual([]);
        for (const t of s.element_tags) expect(VOCABULARY, `${d.id} slide ${i + 1} tag ${t}`).toContain(t);
      }
    }
  });
  test('planTags reads the hand-written tags; a model planner is called per slide with the slide copy and role, and bad answers are rejected', async () => {
    const deck = DECKS.find((d) => d.id === 'howto-linkedin')!;
    expect((await planTags(deck, scriptPlanner))[1]).toEqual(deck.slides[1].element_tags);
    const seen: string[] = [];
    const fake: ElementPlanner = { name: 'fake', pickTags: (b) => { seen.push(`${b.index}:${b.role}`); return ['money', 'growth']; } };
    const got = await planTags(deck, fake);
    expect(got).toHaveLength(7);
    expect(seen[0]).toBe('1:hook');
    expect(seen[5]).toBe('6:proof number');
    const bad: ElementPlanner = { name: 'bad', pickTags: () => ['money'] };
    await expect(planTags(deck, bad)).rejects.toThrow(/Slide 1: element_tags must have 2 to 4 tags/);
    const prompt = plannerPrompt(briefOf(deck.slides[5], 5, 7));
    expect(prompt).toContain('Role: proof number');
    expect(prompt).toContain('more replies');
    expect(prompt).toContain('money, growth');
  });
  test('links: a concept reaches its element tags, other words reach only themselves, and unrelated tags score 0', () => {
    expect(linkScore(['money'], ['coin', 'objects'])).toBe(1);
    expect(linkScore(['growth', 'people'], ['chart', 'team'])).toBe(2);
    expect(linkScore(['money'], ['rocket', 'trophy'])).toBe(0);
    expect(linkScore(['banana'], ['banana'])).toBe(1);
    expect(expandTags(['time']).has('clock')).toBe(true);
  });
  test('patches change a slide’s tags, are checked in plain words, and undo is another patch', () => {
    const deck = DECKS.find((d) => d.id === 'howto-linkedin')!;
    const before = JSON.stringify(deck);
    const r = applyTagPatch(deck, { label: 'Money, not profile', changes: [{ slide: 2, tags: ['money', 'growth'] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.script.slides[1].element_tags).toEqual(['money', 'growth']);
    expect(JSON.stringify(deck)).toBe(before); // the original is untouched
    const back = applyTagPatch(r.script, r.inverse);
    expect(back.ok && JSON.stringify(back.script)).toBe(before);
    const bad = applyTagPatch(deck, { label: 'x', changes: [{ slide: 9, tags: ['a'] }, { slide: 1, tags: ['one'] }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reasons.join(' ')).toMatch(/there is no slide 9/);
      expect(bad.reasons.join(' ')).toMatch(/Step 2: element_tags must have 2 to 4 tags/);
    }
    // A slide with no tags can be tagged, and undo takes them off again.
    const bare = structuredClone(deck);
    delete bare.slides[0].element_tags;
    const tagged = applyTagPatch(bare, { label: 'Tag it', changes: [{ slide: 1, tags: ['idea', 'time'] }] });
    expect(tagged.ok).toBe(true);
    if (tagged.ok) {
      const undone = applyTagPatch(tagged.script, tagged.inverse);
      expect(undone.ok && undone.script.slides[0].element_tags).toBeUndefined();
    }
  });
});

test.describe('lint and placement (in the browser)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
    await page.goto('/tests/image-engine/harness/index.html');
    await page.waitForFunction(() => (window as unknown as { __ie?: { ready: boolean } }).__ie?.ready === true);
  });

  test('the lint flags an unrelated element, accepts a related one, never flags plain decoration, and says nothing without tags', async ({ page }) => {
    const rocket = (await call<{ id: string }[]>(page, 'elementFind', { tags: ['rocket'], kinds: ['object'] }))[0];
    const arrow = (await call<{ id: string }[]>(page, 'elementFind', { tags: ['arrow'], kinds: ['code'] }))[0];
    const plan = (el: string, tags?: string[]) => ({ schema: 1, revision: 1, canvas: { width: 1080, height: 1350, background: '#ffffff' }, ...(tags ? { meta: { elementTags: tags } } : {}), layers: [{ id: 'e', kind: 'element', element: el, x: 400, y: 600, width: 200, height: 200, rotation: 0, opacity: 1, role: 'decor' }] });
    const related = async (el: string, tags?: string[]) => (await call<{ lint: Lint[] }>(page, 'styleCheckPlan', plan(el, tags), 'hot-flat')).lint.find((l) => l.id === 'related');
    const bad = await related(rocket.id, ['people', 'time']);
    expect(bad?.pass).toBe(false);
    expect(bad?.reason).toMatch(/^Unrelated element: fluent:rocket/);
    expect((await related(rocket.id, ['growth', 'money']))?.pass).toBe(true);
    expect((await related(arrow.id, ['people', 'time']))?.pass).toBe(true);
    expect(await related(rocket.id)).toBeUndefined();
  });

  test('an unknown tag in a style rule or plan is handled: plans without meta still validate, bad meta is refused', async ({ page }) => {
    const base = { schema: 1, revision: 1, canvas: { width: 100, height: 100, background: '#ffffff' }, layers: [] };
    expect(await call<string[]>(page, 'validate', base)).toEqual([]);
    expect(await call<string[]>(page, 'validate', { ...base, meta: { elementTags: ['a', 'b'] } })).toEqual([]);
    expect((await call<string[]>(page, 'validate', { ...base, meta: { elementTags: 'x' } })).join(' ')).toMatch(/meta\.elementTags/);
  });

  test('with tags, pictures follow the slide: every picture of a thing links to the slide tags, in every style and deck. Without tags the old way is random.', async ({ page }) => {
    test.setTimeout(240_000);
    const rows: unknown[] = [];
    for (const style of STYLES)
      for (const deck of DECKS) {
        const smart = await call<{ elementLinks: Slide['elementLinks']; elementTags: string[] | null; notes: string[]; type: string }[]>(page, 'styleCompose', deck, style, { elements: 'shippable' });
        const random = await call<{ elementLinks: Slide['elementLinks'] }[]>(page, 'styleCompose', deck, style, { elements: 'shippable', elementMatching: 'ignore' });
        smart.forEach((s, i) => {
          for (const l of s.elementLinks ?? []) expect(l.related, `${style} ${deck.id} slide ${i + 1}: ${l.id} for ${s.elementTags?.join(', ')}`).not.toBe(false);
          rows.push({ style, deck: deck.id, slide: i + 1, smartUnrelated: (s.elementLinks ?? []).filter((l) => l.related === false).length, randomUnrelated: (random[i].elementLinks ?? []).filter((l) => l.related === false).length, smartPictures: (s.elementLinks ?? []).filter((l) => l.related === true).length, noMatch: s.notes.filter((n) => /links to this slide/.test(n)).length });
        });
      }
    write('placement-summary.json', JSON.stringify(rows, null, 2));
    const sum = (k: string) => (rows as Record<string, number>[]).reduce((n, r) => n + r[k], 0);
    expect(sum('smartUnrelated')).toBe(0);
    expect(sum('smartPictures')).toBeGreaterThan(5); // it does place related pictures, not only nothing
  });

  test('changing a slide’s tags with a patch changes which element is picked', async ({ page }) => {
    const deck = DECKS.find((d) => d.id === 'howto-linkedin');
    const a = await call<{ elementsUsed: string[]; elementTags: string[] }[]>(page, 'styleCompose', deck, 'editorial-collage', { elements: 'shippable' });
    const r = applyTagPatch(deck, { label: 'Money on slide 6', changes: [{ slide: 6, tags: ['money', 'speed'] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = await call<{ elementsUsed: string[]; elementLinks: Slide['elementLinks']; elementTags: string[] }[]>(page, 'styleCompose', r.script, 'editorial-collage', { elements: 'shippable' });
    expect(b[5].elementTags).toEqual(['money', 'speed']);
    expect(b[5].elementsUsed).not.toEqual(a[5].elementsUsed);
    for (const l of b[5].elementLinks) expect(l.related).not.toBe(false);
  });

  test('SMART PLACEMENT: every slide of every element style as its own file, smart and the old random way, plus hot-flat before the starburst fix', async ({ page }) => {
    test.setTimeout(900_000);
    for (const s of STYLES) fs.rmSync(path.join(OUT, s), { recursive: true, force: true });
    const save = (slides: Slide[], style: string, mode: string, deck: { id: string; title: string }, label: string) =>
      slides.forEach((s, i) => {
        const base = `${style}/${mode}/${deck.id}/slide-${String(i + 1).padStart(2, '0')}`;
        write(`${base}.png`, Buffer.from(s.png, 'base64'));
        write(`${base}-phone.png`, Buffer.from(s.phone, 'base64'));
        write(`${base}.plan.json`, JSON.stringify(s.plan, null, 2));
        const failed = s.lint.filter((l) => !l.pass);
        write(`${base}.lint.json`, JSON.stringify({ style, script: deck.id, scriptTitle: deck.title, index: i + 1, type: s.type, mode, label, elementTags: s.elementTags, elementsUsed: s.elementsUsed, elementLinks: s.elementLinks, notes: s.notes, warnings: s.warnings, pass: failed.length === 0, lint: s.lint }, null, 2));
      });
    for (const style of STYLES)
      for (const deck of DECKS) {
        save(await call<Slide[]>(page, 'styleRun', deck, style, { elements: 'shippable' }), style, 'smart', deck, 'SHIPPABLE, follows the slide');
        save(await call<Slide[]>(page, 'styleRun', deck, style, { elements: 'shippable', elementMatching: 'ignore' }), style, 'random', deck, 'SHIPPABLE, old random pick');
      }
    for (const deck of DECKS) save(await call<Slide[]>(page, 'styleRun', deck, 'hot-flat', { elements: 'shippable', variant: 'before-starbursts' }), 'hot-flat', 'before-starbursts', deck, 'SHIPPABLE, before the starburst colour fix');

    // TEST version: only when the private folder has pictures.
    const files = realTestAssets();
    fs.mkdirSync(OUT, { recursive: true });
    if (files.length === 0) write('test-assets-skipped.json', JSON.stringify({ skipped: true, reason: 'test-assets/ has no pictures, so there is no TEST version to put beside the SHIPPABLE one.', checkedAt: new Date().toISOString() }, null, 2));
    else {
      const sizes = await call<{ url: string; width: number; height: number }[]>(page, 'probeImages', files.map((f) => '/test-assets/' + encodeURIComponent(f)));
      const assets: TA[] = files.map((f, i) => ({ name: f, url: sizes[i].url, width: sizes[i].width, height: sizes[i].height, tags: tagsOf(f) }));
      for (const style of STYLES) for (const deck of DECKS) save(await call<Slide[]>(page, 'styleRun', deck, style, { elements: 'test', testAssets: assets }), style, 'test', deck, 'TEST ASSETS: not shippable');
    }

    // The checks did not get worse: nothing fails that did not already fail in the previous step, and 'related' never fails.
    for (const style of STYLES)
      for (const deck of DECKS)
        for (let i = 1; i <= 7; i++) {
          const n = String(i).padStart(2, '0');
          const smart = JSON.parse(fs.readFileSync(path.join(OUT, style, 'smart', deck.id, `slide-${n}.lint.json`), 'utf8')).lint as Lint[];
          expect(smart.find((l) => l.id === 'related'), `${style} ${deck.id} ${n}`).toBeDefined();
          expect(smart.find((l) => l.id === 'related')?.pass, `${style} ${deck.id} ${n}`).toBe(true);
          const prev = path.join(ROOT, 'out/image-engine/asset-recreation', style, 'shippable', deck.id, `slide-${n}.lint.json`);
          if (!fs.existsSync(prev)) continue;
          // The words-per-slide check came after the previous step, so it is not in that baseline (the awkward deck is meant to fail it).
          const was = new Set((JSON.parse(fs.readFileSync(prev, 'utf8')).lint as Lint[]).filter((l) => !l.pass).map((l) => l.id));
          for (const f of smart.filter((l) => !l.pass && l.id !== 'words')) expect(was.has(f.id), `${style}/${deck.id}/${n}: new failure ${f.id}: ${f.reason}`).toBe(true);
        }
  });
});
