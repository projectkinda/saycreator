// Round AJ: a closing button label that is only the start of the text's call to action ("Tell me" of "tell me which one you'll try first") takes the action phrase's own start, up to 4 words
// and 20 characters, never ending on a small linking word ("Tell me which one"); a label that is already a whole phrase ("Save this", "Book a call") is kept. Pure code: ZERO model calls.
import { expect, test } from '@playwright/test';

const TEXT = "5 small habits.\n\n1. Shoot at golden hour.\n\nSave this for your next shoot, and tell me which one you'll try first.";

test('AJ1 button labels from the call to action: the phrase start of each clause; a cut-short label grows to it, a whole one is kept; every word is the person\'s', async ({ page }) => {
  await page.goto('/images/carousel');
  const r: any = await page.evaluate(async (TEXT) => {
    const CA: any = await import('/src/carousel/closingAction.ts'); const DL: any = await import('/src/carousel/designLibrary.ts');
    const head = { layout: 'statement', fields: { headline: 'x' }, accents: [] };
    const settle = (s: any, text = TEXT) => { const st = DL.settleClosing([head, s], text); return { f: st.specs[1].fields, notes: st.trims.map((t: any) => DL.trimNote(t)) }; };
    return {
      clauses: CA.clauseLabels(TEXT, DL.ACTION_VERBS),
      more: ['Book a call with me this week.', 'Thanks for reading, save it for later and share it with a friend.'].map((t) => CA.clauseLabels(t, DL.ACTION_VERBS)),
      button: settle({ layout: 'cta-button', fields: { headline: "Tell me which one you'll try first", button: 'Tell me', sub: 'Save this for your next shoot' }, accents: [] }),
      pair: settle({ layout: 'cta-pair', fields: { headline: 'Save this for your next shoot', button1: 'Save this', button2: 'Tell me', line2: "Tell me which one you'll try first." }, accents: [] }),
      whole: settle({ layout: 'cta-button', fields: { headline: 'Save this for your next shoot', button: 'Save this' }, accents: [] }),
      book: settle({ layout: 'cta-button', fields: { headline: 'Book a call', button: 'Book a call' }, accents: [] }, 'Book a call with me this week.'),
    };
  }, TEXT);
  expect(r.clauses).toEqual(['Save this', 'Tell me which one']);
  expect(r.more).toEqual([['Book a call'], ['Save it for later', 'Share it']]);
  expect(r.button.f.button).toBe('Tell me which one');
  expect(r.button.notes.join(' ')).toMatch(/the button "Tell me" was only the start of what your text asks/);
  expect(r.pair.f.button1).toBe('Save this');
  expect(r.pair.f.button2).toBe('Tell me which one');
  expect(r.whole.f.button, 'a whole phrase is kept').toBe('Save this');
  expect(r.whole.notes).toEqual([]);
  expect(r.book.f.button).toBe('Book a call');
  for (const l of [r.button.f.button, r.pair.f.button2]) {
    expect(l.length).toBeLessThanOrEqual(20);
    expect(l.split(' ').length).toBeLessThanOrEqual(4);
  }
});
