// Step 16a (no model): look first, then draw. The <inventory> block is stripped before parsing, the block check counts plain <rect> shapes and asks for ONE more draw call
// when a non-rectangular reference came back as boxes, and READER_DRAW_MODEL picks the model for draw calls only.
import { expect, test } from '@playwright/test';
import { readerModel } from '../../server/reference-reader';

const svg = (shapes: string, type = 'cover') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" data-type="${type}" data-palette='{"bg":"#101820","text":"#F5F0EB","accent":"#FF8A4C"}'><rect width="1080" height="1350" fill="$bg"/>${shapes}<text data-role="title" data-min-size="48" data-max-lines="3" x="80" y="300" font-size="80" font-family="Schibsted Grotesk" fill="$text">Words</text></svg>`;
const RECTS = '<rect x="10" y="10" width="100" height="100" fill="$accent"/><rect x="200" y="10" width="100" height="100" fill="$accent"/><rect x="400" y="10" width="100" height="100" fill="$accent"/><rect data-image-slot="inset" x="0" y="600" width="500" height="500"/>';
const ROUND = '<circle cx="100" cy="100" r="50" fill="$accent"/><path d="M0 0 L100 0 L50 80 Z" fill="$accent"/><ellipse cx="300" cy="100" rx="60" ry="30" fill="$accent"/><rect x="400" y="10" width="100" height="100" fill="$accent"/>';
const INVENTORY = '<inventory>\n1. photo: cut-out person, x 40 y 20 w 50 h 70, rotation 0, shape: arch\n2. shape: a <rect> looking blob, pink\n</inventory>\n';

const ROUND_REF = { photos: [{ id: 'p', box: { x: 0, y: 0, w: 50, h: 50 }, shape: 'circle' }], shapes: [{ id: 's', box: { x: 0, y: 0, w: 10, h: 10 }, colour: '#fff', kind: 'pill' }], graphics: [], texts: [], background: { kind: 'flat', colours: ['#fff'] }, size: { width: 1, height: 1 }, notes: [] };
const BOXY_REF = { ...ROUND_REF, photos: [{ id: 'p', box: { x: 0, y: 0, w: 50, h: 50 }, shape: 'rect' }], shapes: [{ id: 's', box: { x: 0, y: 0, w: 10, h: 10 }, colour: '#fff', kind: 'rect' }] };

test.beforeEach(async ({ page }) => {
  await page.goto('/images/carousel');
});

test('the inventory block is stripped before parsing (closed, unclosed, none)', async ({ page }) => {
  const r = await page.evaluate(async ([inv, s]) => {
    const P = await import('/src/reference/pack.ts');
    const plain = P.stripInventory(s);
    const closed = P.stripInventory(inv + s);
    const unclosed = P.stripInventory('<inventory>\n1. photo\n' + s);
    const parsed = await P.parsePack(inv + s, 'x');
    return { plain: plain === s, closed: closed === s, unclosed: unclosed === s, noTag: !closed.includes('inventory'), ok: parsed.ok, designs: parsed.ok ? Object.keys(parsed.pack.designs) : parsed.reasons };
  }, [INVENTORY, svg(ROUND)] as const);
  expect(r).toEqual({ plain: true, closed: true, unclosed: true, noTag: true, ok: true, designs: ['cover'] });
});

test('the prompt asks for the inventory first on a reference, and says when <rect> is allowed', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const P = await import('/src/reference/pack.ts');
    const ref = P.buildPackPrompt({ kind: 'reference', types: ['cover'] });
    const desc = P.buildPackPrompt({ kind: 'description', types: ['cover'], description: 'warm' });
    const old = P.buildPackPrompt({ kind: 'reference', types: ['cover'], inventory: false });
    const blk = P.buildPackPrompt({ kind: 'reference', types: ['cover'], blocks: '8 of 9 drawn shapes were <rect>.' });
    return { ref, desc: desc.includes('<inventory>'), old: old.includes('<inventory>'), rule: [ref, desc, old].every((p) => /Use <rect> only for things that really are rectangles/.test(p) || /<rect> ONLY for things that really are rectangles/.test(p)), blk: blk.includes('8 of 9 drawn shapes') };
  });
  expect(r.ref).toContain('<inventory>');
  expect(r.ref).toMatch(/rotation/);
  expect(r.ref).toMatch(/real shape/i);
  expect(r.desc).toBe(false);
  expect(r.old).toBe(false);
  expect(r.rule).toBe(true);
  expect(r.blk).toBe(true);
});

test('the block check counts plain rects (not the background, not image slots) and needs a non-rectangular reference', async ({ page }) => {
  const r = await page.evaluate(
    async ([rects, round, roundRef, boxyRef]) => {
      const P = await import('/src/reference/pack.ts');
      const a = P.rectShare(`<inventory><rect/><rect/></inventory>${rects}`);
      const b = P.rectShare(round);
      return { a, b, boxyRef: P.blockCheck(rects, boxyRef as never).blocky, roundRef: P.blockCheck(rects, roundRef as never).blocky, mixed: P.blockCheck(round, roundRef as never).blocky, notRect: [P.notRectangular(roundRef as never), P.notRectangular(boxyRef as never), P.notRectangular(null)] };
    },
    [svg(RECTS), svg(ROUND), ROUND_REF, BOXY_REF] as const,
  );
  expect(r.a).toEqual({ shapes: 3, rects: 3, share: 1 });
  expect(r.b.shapes).toBe(4);
  expect(r.b.rects).toBe(1);
  expect(r.boxyRef, 'a rectangular reference is never retried').toBe(false);
  expect(r.roundRef, 'boxes from a round reference are retried').toBe(true);
  expect(r.mixed, 'a mostly round drawing is fine').toBe(false);
  expect(r.notRect).toEqual([true, false, false]);
});

test('ONE retry with the check result in the prompt (mocked reader, no model)', async ({ page }) => {
  const r = await page.evaluate(
    async ([rects, round, roundRef, boxyRef]) => {
      const P = await import('/src/reference/pack.ts');
      const sig = new AbortController().signal;
      const make = (answers: string[]) => {
        const prompts: string[] = [];
        return { prompts, reader: { id: 'fake', label: 'fake', read: async (c: { prompt: string }) => (prompts.push(c.prompt), { text: answers[Math.min(prompts.length - 1, answers.length - 1)], ms: 1 }) } as never };
      };
      const run = async (text: string, detected: unknown, answers: string[], canRetry = true) => {
        const m = make(answers);
        const out = await P.retryIfBlocky({ reader: m.reader, text, detected: detected as never, build: (blocks) => P.buildPackPrompt({ kind: 'reference', types: ['cover'], blocks }), images: [], signal: sig, canRetry });
        return { calls: m.prompts.length, retried: out.retried, kept: out.text === text, prompt: m.prompts[0] ?? '' };
      };
      return {
        blocky: await run(rects, roundRef, [round]),
        stillBlocky: await run(rects, roundRef, [rects]),
        boxy: await run(rects, boxyRef, [round]),
        fine: await run(round, roundRef, [round]),
        capped: await run(rects, roundRef, [round], false),
      };
    },
    [svg(RECTS), svg(ROUND), ROUND_REF, BOXY_REF] as const,
  );
  expect(r.blocky.calls).toBe(1);
  expect(r.blocky.retried).toBe(true);
  expect(r.blocky.kept, 'the better second answer is used').toBe(false);
  expect(r.blocky.prompt).toMatch(/3 of 3 drawn shapes \(100%\) were <rect>/);
  expect(r.stillBlocky.calls, 'never a second retry').toBe(1);
  expect(r.boxy.calls).toBe(0);
  expect(r.fine.calls).toBe(0);
  expect(r.capped.calls, 'the cap stops it').toBe(0);
});

test('READER_DRAW_MODEL is used for draw calls only, then READER_MODEL, then CAROUSEL_MODEL', () => {
  const env = (o: Record<string, string>) => o as NodeJS.ProcessEnv;
  expect(readerModel(env({ READER_DRAW_MODEL: 'opus', READER_MODEL: 'haiku' }), 'draw')).toBe('opus');
  expect(readerModel(env({ READER_DRAW_MODEL: 'opus', READER_MODEL: 'haiku' }), 'read')).toBe('haiku');
  expect(readerModel(env({ READER_DRAW_MODEL: 'opus', READER_MODEL: 'haiku' }))).toBe('haiku');
  expect(readerModel(env({ READER_MODEL: 'haiku' }), 'draw')).toBe('haiku');
  expect(readerModel(env({ CAROUSEL_MODEL: 'sonnet' }), 'draw')).toBe('sonnet');
  expect(readerModel(env({}), 'draw')).toBe('');
  expect(readerModel(env({ READER_DRAW_MODEL: 'opus' }), 'read')).toBe('');
});
