// Layout inventory of the 8 style packs (REFS/Styles, rendered to out/styles-src): writes out/layouts-inventory/inventory.md and one labelled contact sheet per style.
// The data below was written by LOOKING at every rendered slide (52). Criterion for "equivalent to a library layout": the same fields in the same reading order and alignment.
// Decoration (a pill, a card, a glow, a rule, an avatar, a contact footer) is a device (reference/deco.ts), not a layout. A different arrangement of the same fields is a NEW layout.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// merged layouts (one row each); `lib` = the library layout it is equivalent to, or null (new)
const MERGED = {
  prose: { name: 'prose', what: 'Optional heading (plain, numbered, or none) and 1 to 3 paragraph blocks, optionally with dot bullets, a bold pull line, italic-accent runs or a big closing line. Text only.', fields: 'heading?, paragraphs[1-3], bullets?[2-5], pull?, closing?', img: 'no', lib: null, order: 1,
    variants: 'with heading / no heading; numbered heading ("1. ..."); paragraph size regular or large; pull line (bold, bold-italic or accent colour); italic accent runs; bullets' },
  statement: { name: 'statement (existing)', what: 'Headline (any size, stacked or centred), optional kicker, caption or pill caption. Cards, pills, avatar, rule and contact footer are devices.', fields: 'headline, kicker?, caption?', img: 'no', lib: 'statement', order: 2,
    variants: 'huge stacked display; centred on a card; pill caption; single question line under a rule; avatar chip; contact footer (devices)' },
  'contact-closing': { name: 'contact-closing', what: 'Brand lockup (star + name), headline, a line, then contact: URL / socials / phone, optionally a button.', fields: 'brand, headline, line?, button?, contacts[2-4]', img: 'no (S2 adds a decorative art strip: optional)', lib: null, order: 3, variants: 'with button + socials rows; with underlined URL line' },
  'cta-pair': { name: 'cta-pair', what: 'Centred headline, then two stacked action blocks: a filled button with a line and an arrow, an outlined button with a line and a link.', fields: 'headline, button1, line1, button2, line2, link', img: 'no', lib: null, order: 4, variants: 'filled + outlined' },
  'numbered-stagger': { name: 'numbered-stagger', what: 'Heading, then 2 to 3 numbered items staggered left, right, left.', fields: 'heading, items[2-3]', img: 'no', lib: null, order: 5, variants: 'start left / start right' },
  'bullet-list': { name: 'bullet-list', what: 'Heading, then 3 to 5 bold dot-bullet lines (no icons, no rules).', fields: 'heading, items[3-5]', img: 'no', lib: null, order: 6, variants: 'vertically centred' },
  'pill-stagger': { name: 'pill-stagger', what: 'Centred headline and subline, then 3 to 5 pills staggered across the page.', fields: 'headline, subline, items[3-5]', img: 'no (emoji are stickers: a device)', lib: null, order: 7, variants: 'zig-zag alignment' },
  'headline-card': { name: 'headline-card', what: 'Centred headline and subline, one wide rounded card holding a paragraph, then a paragraph and a bold line.', fields: 'headline, subline, card, paragraph, closing', img: 'no', lib: null, order: 8, variants: '-' },
  'lead-statement': { name: 'lead-statement (existing)', what: 'A small intro line over a big italic statement.', fields: 'lead, headline', img: 'no', lib: 'lead-statement', order: 2, variants: '-' },
  quote: { name: 'quote (existing)', what: 'A large quote with bold runs and an attribution line.', fields: 'quote, author', img: 'no', lib: 'quote', order: 2, variants: 'no big quote-mark graphic (decoration)' },
  'cta-button': { name: 'cta-button (existing)', what: 'Headline, paragraph and a button, left aligned, on a glow.', fields: 'headline, sub, button', img: 'no', lib: 'cta-button', order: 2, variants: '-' },
  'headline-body-image': { name: 'headline-body-image', what: 'Headline (plain or numbered), short body, then one wide image or two side by side. A text-only version is the headline and body alone (prose).', fields: 'headline, body, image[1-2]', img: 'yes: photo, 3D render or illustration', lib: null, order: 9, variants: 'one wide / two side by side / illustration under the text' },
  'image-row': { name: 'image-row', what: 'Centred headline, optional subline, a row of 2 to 3 framed images, then a paragraph under the row.', fields: 'headline, subline?, images[2-3], paragraph', img: 'yes', lib: null, order: 10, variants: '2-up / 3-up portrait' },
  'do-dont-photos': { name: 'do-dont-photos', what: 'Numbered title, body line, then two images side by side with a cross badge (wrong) and a tick badge (right).', fields: 'title, body, wrongImage, rightImage', img: 'yes (a text version: two text cards with the badges)', lib: null, order: 11, variants: 'text cards instead of photos' },
  'cover-art': { name: 'cover-art', what: 'Title (plus a pill subtitle) and one large art piece (a circle crop, or a free illustration).', fields: 'title, subtitle?, art', img: 'yes', lib: null, order: 12, variants: 'circle photo with a small inset circle / free illustration' },
  'thumb-rows': { name: 'thumb-rows', what: 'Four rows, each a small image on the left and two lines of text on the right.', fields: 'rows[4]: image + text', img: 'yes (a text version: number or icon discs)', lib: null, order: 13, variants: '-' },
  'photo-cover': { name: 'photo-cover', what: 'Title with a light and a bold run, an intro paragraph, one wide landscape photo, author footer.', fields: 'title, intro, photo', img: 'yes', lib: null, order: 14, variants: '-' },
  'portrait-closing': { name: 'portrait-closing', what: 'A colour band with the title on the left and a portrait on the right; under it a big heading, paragraphs and a URL.', fields: 'title, portrait, heading, paragraphs, url', img: 'yes (portrait)', lib: null, order: 15, variants: '-' },
  'art-side-text': { name: 'art-side-text', what: 'Right-aligned heading and paragraph, a hand-drawn arrow, a large illustration below.', fields: 'heading, paragraph, art', img: 'yes (the arrow is drawable)', lib: null, order: 16, variants: '-' },
};

// style-local layouts, in the order seen; `slides` are the slide numbers of that pack that use it
const STYLES = {
  1: { title: 'Mono editorial glow', items: [
    { n: 'photo cover', on: 'title (light + bold run) top-left, intro paragraph, one wide landscape photo, author footer', fields: 'title, intro, photo', slides: [1], m: 'photo-cover' },
    { n: 'heading + body + bullets', on: 'heading at the top, body paragraph and 2 dot bullets low on the page', fields: 'heading, paragraph, bullets[2]', slides: [2], m: 'prose' },
    { n: 'paragraphs only', on: 'no heading: 3 paragraphs, vertically centred', fields: 'paragraphs[3]', slides: [3], m: 'prose' },
    { n: 'heading + 2 paragraphs', on: 'two-line heading (light + bold), two paragraphs', fields: 'heading, paragraphs[2]', slides: [4], m: 'prose' },
    { n: 'numbered pair, staggered', on: 'heading, item 1 on the left, item 2 offset to the right', fields: 'heading, items[2]', slides: [5], m: 'numbered-stagger' },
    { n: 'big quote', on: 'huge quote with bold runs, attribution line under it', fields: 'quote, author', slides: [6], m: 'quote' },
    { n: 'closing with button', on: 'glow top-left, headline, paragraph, one button, all left aligned', fields: 'headline, paragraph, button', slides: [7], m: 'cta-button' },
  ] },
  2: { title: 'Bold orange', items: [
    { n: 'cover with circle art', on: 'arrow-line header, 2-line title, one big circular image with a small inset circle', fields: 'title, art', slides: [1], m: 'cover-art' },
    { n: 'numbered title + body + wide image', on: 'arrow-line header, "1. title", one body line, one wide image', fields: 'title, body, image', slides: [2, 4], m: 'headline-body-image' },
    { n: 'numbered title + body + 2 images', on: 'same, with two images side by side', fields: 'title, body, images[2]', slides: [3], m: 'headline-body-image' },
    { n: 'two action blocks', on: 'centred title, a filled button + line + arrow, an outlined button + line + link', fields: 'title, button x2, line x2, link', slides: [5], m: 'cta-pair' },
    { n: 'contact card', on: 'star + brand name, centred title, a line, underlined URL, decorative art strip at the bottom', fields: 'brand, title, line, url', slides: [6], m: 'contact-closing' },
  ] },
  3: { title: 'Cream ink', items: [
    { n: 'cover with pill + illustration', on: 'header row, centred 2-line title, black pill subtitle, large illustration below', fields: 'title, subtitle, art', slides: [1], m: 'cover-art' },
    { n: 'heading + 3 paragraphs + bold line', on: 'heading, three paragraphs, a bold closing line', fields: 'heading, paragraphs[3], closing', slides: [2], m: 'prose' },
    { n: 'numbered heading + 3 paragraphs', on: '"1. heading" and three paragraphs', fields: 'heading, paragraphs[3]', slides: [3], m: 'prose' },
    { n: 'numbered heading + pull line', on: '"2. heading", paragraph, bold-italic pull line, paragraph', fields: 'heading, paragraphs[2], pull', slides: [4], m: 'prose' },
    { n: 'heading + 5 bullets', on: 'heading and five bold dot-bullet lines, centred vertically', fields: 'heading, items[5]', slides: [5], m: 'bullet-list' },
    { n: 'heading + body + illustration', on: 'heading, one paragraph, big black-ink illustration below', fields: 'heading, paragraph, art', slides: [6], m: 'headline-body-image' },
    { n: 'right-aligned text + arrow + illustration', on: 'right-aligned heading and paragraph, hand-drawn arrow, illustration below', fields: 'heading, paragraph, art', slides: [7], m: 'art-side-text' },
  ] },
  4: { title: 'Electric blue play', items: [
    { n: 'stacked display cover', on: 'scalloped edge, 3 huge display words one per line, short paragraph, footer row', fields: 'headline, caption', slides: [1], m: 'statement' },
    { n: 'brand lockup + big paragraph', on: 'star + brand name, one large paragraph', fields: 'brand, paragraph', slides: [2], m: 'prose' },
    { n: 'four thumbnail rows', on: 'four rows: small image left, two lines of text right (white ground)', fields: 'rows[4]: image + text', slides: [3], m: 'thumb-rows' },
    { n: 'two big paragraphs', on: 'two large paragraphs, no heading', fields: 'paragraphs[2]', slides: [4], m: 'prose' },
    { n: 'headline + body + wide image', on: 'display headline, body, one wide image (white ground)', fields: 'headline, body, image', slides: [5], m: 'headline-body-image' },
    { n: 'closing with socials', on: 'star + brand, display title, subline, white button, two social rows and phone / URL', fields: 'brand, title, subline, button, contacts[4]', slides: [6], m: 'contact-closing' },
  ] },
  5: { title: 'Green elegant serif', items: [
    { n: 'green card cover', on: 'full green rounded card: small-caps kicker, centred headline with italic runs, small-caps line, portrait chip at the bottom', fields: 'kicker, headline, line, avatar', slides: [1], m: 'statement' },
    { n: 'italic-led paragraphs + big line', on: 'three paragraphs that start in green italic, a big green line, arrow bottom-right', fields: 'paragraphs[3], closing', slides: [2], m: 'prose' },
    { n: 'intro + big italic statement', on: 'one small intro line over a big green italic statement', fields: 'lead, headline', slides: [3], m: 'lead-statement' },
    { n: 'statement card', on: 'full green card, one short centred statement with an italic first word', fields: 'headline', slides: [4], m: 'statement' },
    { n: 'paragraphs with italic runs', on: 'two to four short paragraphs with green italic runs, arrow bottom-right', fields: 'paragraphs[2-4]', slides: [5, 6], m: 'prose' },
    { n: 'portrait closing', on: 'green top band with the title (left) and a portrait (right), big heading, paragraphs, URL', fields: 'title, portrait, heading, paragraphs, url', slides: [7], m: 'portrait-closing' },
  ] },
  6: { title: 'Cream social profile', items: [
    { n: 'post (profile + paragraphs)', on: 'profile header (avatar, name, handle), three paragraphs with a bold run or a bold last line', fields: 'paragraphs[3]', slides: [1, 7], m: 'prose' },
    { n: 'do / don\'t photos', on: 'profile header, "N. title", body line, two photos with a cross badge (left) and a tick badge (right)', fields: 'title, body, wrongImage, rightImage', slides: [2, 3, 4, 5, 6], m: 'do-dont-photos' },
  ] },
  7: { title: 'Pink serif stickers', items: [
    { n: 'cover with pill', on: 'small-caps kicker, 4-line centred headline with an italic run, white pill caption at the bottom, emoji stickers', fields: 'kicker, headline, caption', slides: [1], m: 'statement' },
    { n: 'headline + 2 framed images + paragraph', on: 'centred headline with a pen circle, optional subline, two framed images with offset shadow, paragraph under them', fields: 'headline, subline?, images[2], paragraph', slides: [2, 6], m: 'image-row' },
    { n: 'staggered pills', on: 'centred headline and subline, five pills staggered left and right with offset shadow', fields: 'headline, subline, items[5]', slides: [3], m: 'pill-stagger' },
    { n: 'headline + card + paragraphs', on: 'centred headline and subline, one wide rounded card with a paragraph, paragraph, bold line', fields: 'headline, subline, card, paragraph, closing', slides: [4], m: 'headline-card' },
    { n: 'headline + 3 portrait images', on: 'headline with a pen circle, subline, three portrait images with offset shadow, paragraph', fields: 'headline, subline, images[3], paragraph', slides: [5], m: 'image-row' },
    { n: 'closing with socials', on: 'small-caps kicker, huge headline, two social rows left, phone and URL right', fields: 'kicker, headline, contacts[4]', slides: [7], m: 'statement' },
  ] },
  8: { title: 'Black holographic', items: [
    { n: 'gradient cover', on: 'header, 3 huge gradient words, short paragraph low, footer row', fields: 'headline, caption', slides: [1], m: 'statement' },
    { n: 'two paragraphs, accent word', on: 'thin rule across the page; two paragraphs under it, one bold lavender word', fields: 'paragraphs[2]', slides: [2], m: 'prose' },
    { n: 'one paragraph', on: 'rule across the page, one light paragraph under it', fields: 'paragraph', slides: [3], m: 'prose' },
    { n: 'paragraph + accent paragraph', on: 'rule, a light paragraph, a bold lavender paragraph', fields: 'paragraph, accent paragraph', slides: [4], m: 'prose' },
    { n: 'single question line', on: 'rule, one question line, empty page', fields: 'question', slides: [5], m: 'statement' },
  ] },
};

const OUT = path.resolve('out/layouts-inventory');
fs.mkdirSync(OUT, { recursive: true });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tag = (m) => (MERGED[m].lib ? `EQUIVALENT: library "${MERGED[m].lib}"` : 'NEW');
const imgTag = (m) => (/^yes/.test(MERGED[m].img) ? 'needs imagery' : 'text only');

// totals per merged layout
const tot = {};
for (const [n, s] of Object.entries(STYLES)) for (const it of s.items) { const t = (tot[it.m] ??= { slides: 0, styles: {}, local: 0 }); t.slides += it.slides.length; t.styles[n] = (t.styles[n] ?? 0) + it.slides.length; t.local++; }
const allSlides = Object.values(tot).reduce((a, t) => a + t.slides, 0);
const ids = Object.keys(MERGED).sort((a, b) => MERGED[a].order - MERGED[b].order || a.localeCompare(b));
const newTextOnly = ids.filter((m) => !MERGED[m].lib && !/^yes/.test(MERGED[m].img));
const newImg = ids.filter((m) => !MERGED[m].lib && /^yes/.test(MERGED[m].img));
const equiv = ids.filter((m) => MERGED[m].lib);

let md = `# Layout inventory of the 8 style packs\n\nAll 52 rendered slides were opened and looked at (out/styles-src/style-1 to style-8). Criterion: a layout is **equivalent** to a library layout only when it has the same fields in the same reading order and alignment. Decoration (pill, card, glow, rule, avatar, contact footer, stickers) is a *device* (reference/deco.ts), not a layout. A different arrangement of the same fields is **new**.\n\n`;
md += `## Totals\n\n- Slides inspected: ${allSlides}\n- Style-local layouts (before merging): ${Object.values(STYLES).reduce((a, s) => a + s.items.length, 0)}\n- Distinct layouts after merging across styles: **${ids.length}**\n  - already in the library (equivalent): ${equiv.length} (${equiv.map((m) => MERGED[m].lib).join(', ')}), used by ${equiv.reduce((a, m) => a + tot[m].slides, 0)} slides\n  - NEW and text only (buildable now): **${newTextOnly.length}** (${newTextOnly.join(', ')}), ${newTextOnly.reduce((a, m) => a + tot[m].slides, 0)} slides\n  - NEW and needing imagery: **${newImg.length}** (${newImg.join(', ')}), ${newImg.reduce((a, m) => a + tot[m].slides, 0)} slides\n- Buildable now in total: ${equiv.length + newTextOnly.length} layouts (${equiv.length} exist, ${newTextOnly.length} to build) covering ${[...equiv, ...newTextOnly].reduce((a, m) => a + tot[m].slides, 0)} of ${allSlides} slides.\n\n`;
md += `## Merged layouts (one row each)\n\n| # | Layout | What is on the slide | Fields | Imagery | Variants (from the packs) | Slides (total / by style) | Library |\n|---|---|---|---|---|---|---|---|\n`;
ids.forEach((m, i) => {
  const t = tot[m], M = MERGED[m];
  md += `| ${i + 1} | **${M.name}** | ${M.what} | ${M.fields} | ${M.img} | ${M.variants} | ${t.slides} / ${Object.entries(t.styles).map(([s, c]) => `S${s}:${c}`).join(' ')} | ${tag(m)} |\n`;
});
md += `\n## Proposed build order (most reusable first)\n\nText only, buildable now:\n\n`;
const order = [['prose', '16 slides in 6 of 8 styles; the page every pack leans on. Variants carry heading / no heading / numbered / pull line / italic runs / bullets.'], ['statement', 'exists; needs variants only: huge stacked display, centred card, pill caption, single question under a rule (7 slides, 5 styles). Mostly devices already built.'], ['contact-closing', '2 slides (S2, S4); the contact block device already exists, this adds the lockup + title + button + socials arrangement.'], ['cta-pair', '1 slide (S2); also a second CTA arrangement for every preset.'], ['numbered-stagger', '1 slide (S1)'], ['bullet-list', '1 slide (S3); could also serve as a 4th checklist variant'], ['pill-stagger', '1 slide (S7); needs the offset-shadow pill device (built)'], ['headline-card', '1 slide (S7); needs the card + offset shadow (built)']];
order.forEach(([m, why], i) => (md += `${i + 1}. **${m}**: ${why}\n`));
md += `\nNeeds imagery (photo, 3D, illustration, portrait slots), after the above:\n\n`;
const iorder = [['headline-body-image', '5 slides in 3 styles; the text-only version is prose, so it can ship first as headline + body with an image slot that stays empty'], ['do-dont-photos', '5 slides (S6); a text-card version with the cross and tick badges needs no photo'], ['image-row', '3 slides (S7); a card-row text version is possible'], ['cover-art', '2 slides (S2, S3)'], ['thumb-rows', '1 slide (S4); a text version with number discs is possible'], ['photo-cover', '1 slide (S1)'], ['portrait-closing', '1 slide (S5)'], ['art-side-text', '1 slide (S3); the hand-drawn arrow is drawable']];
iorder.forEach(([m, why], i) => (md += `${order.length + i + 1}. **${m}**: ${why}\n`));
md += `\n## Per style\n`;
for (const [n, s] of Object.entries(STYLES)) {
  md += `\n### Style ${n}: ${s.title} (${s.items.reduce((a, it) => a + it.slides.length, 0)} slides, ${s.items.length} distinct layouts)\n\n| # | Local layout | What is on the slide | Fields | Imagery | Slides in this pack | Merged into | Library |\n|---|---|---|---|---|---|---|---|\n`;
  s.items.forEach((it, i) => (md += `| ${n}${'abcdefgh'[i]} | ${it.n} | ${it.on} | ${it.fields} | ${imgTag(it.m)} | ${it.slides.length} (${it.slides.join(', ')}) | ${MERGED[it.m].name} | ${tag(it.m)} |\n`));
}
fs.writeFileSync(path.join(OUT, 'inventory.md'), md);

// contact sheets
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
for (const [n, s] of Object.entries(STYLES)) {
  const cards = s.items.map((it, i) => {
    const src = pathToFileURL(path.resolve(`out/styles-src/style-${n}/${it.slides[0]}.png`)).href;
    const m = MERGED[it.m];
    return `<div class="c"><div class="l">${n}${'abcdefgh'[i]}</div><img src="${src}" width="270" height="338"><div class="t"><b>${esc(it.n)}</b><br>${esc(it.on)}<br><span>slides ${it.slides.join(', ')} of ${s.items.reduce((a, x) => a + x.slides.length, 0)}</span><br><span class="m ${m.lib ? 'e' : /^yes/.test(m.img) ? 'i' : 'n'}">${m.lib ? 'library: ' + m.lib : 'NEW'} · ${imgTag(it.m)} · merged: ${esc(m.name)}</span></div></div>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#2b2b2b;font:13px/1.35 system-ui,sans-serif;color:#eee;padding:16px;width:${4 * 300 + 16}px}h1{font-size:20px;margin:0 0 12px}.g{display:flex;flex-wrap:wrap;gap:16px}.c{width:270px;position:relative}.c img{display:block;border-radius:4px;background:#888}.l{position:absolute;left:6px;top:6px;background:#000c;color:#fff;font-weight:700;padding:2px 8px;border-radius:10px}.t{padding-top:6px}.t span{color:#aaa}.m{display:inline-block;margin-top:3px;padding:1px 6px;border-radius:4px;font-weight:600}.m.n{background:#2f6f3f}.m.i{background:#8a5a12}.m.e{background:#3a4f8a}</style><h1>Style ${n}: ${esc(s.title)} (${s.items.length} distinct layouts)</h1><div class="g">${cards}</div>`;
  const f = path.join(OUT, `_s${n}.html`);
  fs.writeFileSync(f, html);
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(f).href);
  await page.waitForLoadState('load');
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path: path.join(OUT, `style-${n}.png`), fullPage: true });
  await page.close();
  fs.unlinkSync(f);
}
await browser.close();
console.log('layouts', ids.length, 'newTextOnly', newTextOnly.length, 'newImg', newImg.length, 'equiv', equiv.length, 'slides', allSlides);
