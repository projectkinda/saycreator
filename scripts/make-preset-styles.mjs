// Writes the 8 built-in presets style-1 .. style-8 (src/image-engine/styles/style-N/style.json) from the palettes sampled out of the rendered source packs
// (out/styles-src/palettes.json; see scripts/sample-style-palettes.mjs). Only style information is used (colours, type mood, case, rhythm, chrome); no picture or layout is copied.
import fs from 'node:fs';

const pal = (bg, text, muted, accent, onAccent, surface, o = {}) => ({ bg, text, muted, accent, onAccent, marker: o.marker ?? accent, onMarker: o.onMarker ?? onAccent, surface, onSurface: o.onSurface ?? text, line: o.line ?? text });
const L = (over = {}) => ({
  cover: [{ use: 'cover-stack', when: { headlineWordsMax: 7 }, params: over.cover ?? {} }, { use: 'cover-top', params: { visual: 'none', kicker: 'label' } }],
  content: [{ use: 'content-bar', when: { bodyWordsMax: 17 } }, { use: 'content-stack', params: { ruleWidth: 120 } }],
  step: [{ use: over.step ?? 'step-numeral', when: { occurrence: 'odd' } }, { use: (over.step ?? 'step-numeral') === 'step-badge' ? 'step-pill' : 'step-badge', params: (over.step ?? 'step-numeral') === 'step-badge' ? {} : { badgeSize: 160 } }],
  stat: [{ use: 'stat-giant', when: { valueCharsMax: 3 } }, { use: 'stat-card' }],
  checklist: [{ use: 'checklist-lines', when: { itemsMin: 4 } }, { use: 'checklist-icons' }],
  beforeafter: [{ use: 'ba-split', when: { occurrence: 'odd' } }, { use: 'ba-cards' }],
  quote: [{ use: 'quote-centre', when: { quoteCharsMin: 48 } }, { use: 'quote-marks' }],
  closing: [{ use: 'closing-button', when: { headlineWordsMax: 4 } }, { use: 'closing-bar' }],
});
const S = [];
const add = (n, o) => S.push([n, o]);

add(1, { title: 'Mono editorial glow', description: 'Black and white pages with a soft yellow glow, a clean sans headline and calm body copy, for essays and expert takes.',
  tones: ['expert', 'calm', 'clear'], kw: ['essay', 'thoughts', 'insight', 'lesson', 'story', 'opinion', 'founder', 'writing', 'learn', 'think', 'idea', 'mindset', 'quote', 'book', 'why'], types: ['content', 'quote', 'cover'],
  palettes: { dark: pal('#000000', '#FAFAFA', '#B5B2A6', '#FAECA8', '#000000', '#16140D', { marker: '#FAECA8', onMarker: '#000000' }), light: pal('#FAFAFA', '#0A0A0A', '#55534A', '#0A0A0A', '#FAECA8', '#F1EEE3', { marker: '#FAECA8', onMarker: '#0A0A0A' }) },
  rhythm: ['dark', 'light', 'light', 'dark', 'light', 'dark'], byType: { closing: 'dark' }, fonts: { headline: 'Instrument Sans', headlineWeight: 600, body: 'EB Garamond', bodyWeight: 400, strong: 500 },
  type: { cover: 112, headline: 84, body: 42, small: 32, stat: 300, quote: 72, label: 32, note: 34, byline: 32 }, caseStyle: 'sentence', shape: { radius: 8, outline: 2, stroke: 4, badge: 'circle', marker: 'box', sticker: 'pill', hardShadow: 0, decor: 'orbs' }, chrome: 'page-number',
  devices: { glow: { corner: 'br', color: '#FAECA8' }, sideLabel: true, pageIndex: true, footerRow: true },
  flavour: { cover: 'statement', coverVariant: 1, prefer: ['statement', 'prose', 'numbered-stagger', 'quote', 'lead-statement', 'cta-button', 'split-text'], avoid: ['stat-grid', 'card-grid', 'feature-slider', 'timeline', 'pill-stagger', 'statement-pill', 'statement-stacked'], variants: { statement: 1, quote: 1, prose: 0, 'numbered-stagger': 0 } }, layouts: L({ step: 'step-pill' }) });

add(2, { title: 'Bold orange', description: 'A full orange ground with a heavy white headline, numbered points and outlined buttons, for lists and how-to tips.',
  tones: ['bold', 'friendly'], kw: ['tips', 'steps', 'how', 'ways', 'list', 'hacks', 'mistakes', 'checklist', 'start', 'launch', 'grow', 'guide', 'learn', 'fast'], types: ['step', 'checklist', 'cover'],
  palettes: { orange: pal('#F76718', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#F76718', '#FF8238', { marker: '#FFFFFF', onMarker: '#F76718', onSurface: '#FFFFFF' }), deep: pal('#C2410C', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#C2410C', '#D6571E', { marker: '#FFFFFF', onMarker: '#C2410C', onSurface: '#FFFFFF' }), ink: pal('#2B1308', '#FFFFFF', '#F2CDB8', '#F76718', '#FFFFFF', '#3F2111', { marker: '#F76718', onMarker: '#2B1308', line: '#F76718' }) },
  rhythm: ['orange', 'deep', 'deep', 'ink', 'deep', 'orange'], byType: { closing: 'deep' }, fonts: { headline: 'Barlow Condensed', headlineWeight: 700, body: 'Instrument Sans', bodyWeight: 500, strong: 600 },
  type: { cover: 170, headline: 120, body: 44, small: 34, stat: 320, quote: 78, label: 32 }, caseStyle: 'sentence', shape: { radius: 10, outline: 4, stroke: 6, badge: 'rounded', marker: 'underline', sticker: 'tag', hardShadow: 0, decor: 'rings' }, chrome: 'strip', devices: { arrowHeader: true, outlinedButton: true },
  flavour: { cover: 'statement', coverVariant: 0, prefer: ['statement', 'prose', 'numbered-list', 'listicle-numeral', 'step-numeral', 'cta-pair', 'contact-closing', 'checklist'], avoid: ['stat-grid', 'card-grid', 'quote', 'timeline', 'pill-stagger', 'statement-pill'], variants: { statement: 0, prose: 0, checklist: 0, 'cta-pair': 0 } }, layouts: L({ step: 'step-numeral' }) });

add(3, { title: 'Cream ink', description: 'Warm cream pages, heavy black type in a three-part header row and a plain black button, for punchy opinions and lists.',
  tones: ['bold', 'expert', 'clear'], kw: ['truth', 'rules', 'opinion', 'mistakes', 'habits', 'lessons', 'founder', 'career', 'advice', 'follow', 'stop', 'never', 'principles'], types: ['content', 'checklist', 'closing'],
  palettes: { cream: pal('#FFF9F1', '#0A0A0A', '#5E5A53', '#0A0A0A', '#FFF9F1', '#F2E9DB', { marker: '#0A0A0A', onMarker: '#FFF9F1' }), ink: pal('#0A0A0A', '#FFF9F1', '#BDB8AE', '#FFF9F1', '#0A0A0A', '#1D1B19', { marker: '#FFF9F1', onMarker: '#0A0A0A' }) },
  rhythm: ['cream', 'cream', 'cream', 'ink'], byType: { closing: 'cream' }, fonts: { headline: 'Schibsted Grotesk', headlineWeight: 800, body: 'Instrument Sans', bodyWeight: 500, strong: 600 },
  type: { cover: 120, headline: 88, body: 42, small: 34, stat: 300, quote: 72, label: 32 }, caseStyle: 'sentence', shape: { radius: 6, outline: 3, stroke: 4, badge: 'square', marker: 'box', sticker: 'pill', hardShadow: 0, decor: 'blocks' }, chrome: 'page-number', devices: { headerRow: true },
  flavour: { cover: 'statement', coverVariant: 0, prefer: ['statement', 'prose', 'bullet-list', 'numbered-list', 'lead-statement', 'cta-button'], avoid: ['stat-grid', 'feature-slider', 'timeline', 'card-grid', 'pill-stagger', 'statement-pill'], variants: { statement: 0, prose: 0, 'bullet-list': 0, 'cta-button': 0 } }, layouts: L({ step: 'step-badge' }) });

add(4, { title: 'Electric blue play', description: 'Saturated blue and white, chunky friendly capitals and a brand footer, for playful launches, promos and announcements.',
  tones: ['bold', 'friendly'], kw: ['launch', 'new', 'sale', 'event', 'app', 'brand', 'announce', 'promo', 'free', 'win', 'fun', 'product', 'offer', 'drop'], types: ['cover', 'content', 'closing'],
  palettes: { blue: pal('#2A06E0', '#FFFFFF', '#D6D0F8', '#FFFFFF', '#2A06E0', '#4626E4', { onSurface: '#FFFFFF', line: '#FFFFFF' }), white: pal('#FFFFFF', '#2A06E0', '#5436E6', '#2A06E0', '#FFFFFF', '#ECE8FC', { line: '#2A06E0' }) },
  rhythm: ['blue', 'blue', 'white', 'blue', 'white', 'blue'], byType: { closing: 'blue' }, fonts: { headline: 'Lilita One', headlineWeight: 400, body: 'Instrument Sans', bodyWeight: 500, strong: 600 },
  type: { cover: 150, headline: 104, body: 44, small: 34, stat: 330, quote: 80, label: 32 }, caseStyle: 'upper', shape: { radius: 44, outline: 4, stroke: 6, badge: 'circle', marker: 'box', sticker: 'pill', hardShadow: 0, decor: 'orbs' }, chrome: 'strip', devices: { scallop: true, footerRow: true, contactClosing: true },
  flavour: { cover: 'statement-stacked', coverVariant: 0, prefer: ['statement-stacked', 'prose', 'bullet-list', 'big-stat', 'contact-closing', 'cta-button', 'step-numeral'], avoid: ['timeline', 'card-grid', 'quote', 'comparison', 'statement-question'], variants: { 'statement-stacked': 0, prose: 1, 'bullet-list': 1, 'contact-closing': 0 } }, layouts: L({ cover: { bar: 'last' }, step: 'step-badge' }) });

add(5, { title: 'Green elegant serif', description: 'White pages and a deep green rounded card, an upright serif with italic accent words, for thoughtful, personal teaching.',
  tones: ['calm', 'expert', 'warm'], kw: ['reflect', 'story', 'wellbeing', 'coach', 'leadership', 'think', 'learn', 'life', 'growth', 'habit', 'mindset', 'journal', 'sustainable', 'finance'], types: ['quote', 'content', 'cover'],
  palettes: { white: pal('#FFFFFF', '#00225B', '#4A5C80', '#16694B', '#FFFFFF', '#E3F0EA', { marker: '#16694B', onMarker: '#FFFFFF', line: '#16694B' }), green: pal('#1E8563', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#1E8563', '#2B9473', { line: '#FFFFFF' }) },
  rhythm: ['green', 'white', 'white', 'green', 'white', 'white'], byType: { closing: 'white' }, fonts: { headline: 'EB Garamond', headlineWeight: 600, body: 'EB Garamond', bodyWeight: 500, strong: 500 },
  type: { cover: 128, headline: 92, body: 44, small: 32, stat: 300, quote: 78, label: 32, note: 34, byline: 32 }, caseStyle: 'sentence', shape: { radius: 44, outline: 2, stroke: 4, badge: 'circle', marker: 'underline', sticker: 'pill', hardShadow: 0, decor: 'orbs' }, chrome: 'none', devices: { insetCard: { page: '#FFFFFF', margin: 28, radius: 40 }, italicAccent: true },
  closingLayout: { layout: 'statement-card', variant: 1, avoid: ['headline-card', 'prose', 'split-text', 'lead-statement', 'numbered-stagger', 'bullet-list'] },
  flavour: { cover: 'statement-card', coverVariant: 0, prefer: ['statement-card', 'prose', 'lead-statement', 'quote', 'split-text', 'statement-question'], avoid: ['stat-grid', 'card-grid', 'feature-slider', 'step-numeral', 'pill-stagger', 'statement-stacked'], variants: { 'statement-card': 0, prose: 0, quote: 0 } }, layouts: L({ step: 'step-pill' }) });

add(6, { title: 'Cream social profile', description: 'Warm cream pages with a profile header and bold numbered titles, for do and do-not lists.',
  tones: ['friendly', 'clear'], kw: ['dos', 'donts', 'myths', 'mistakes', 'vs', 'better', 'habits', 'before', 'after', 'tips', 'creator', 'personal', 'follow', 'routine'], types: ['beforeafter', 'step', 'content'],
  palettes: { cream: pal('#F9FCEC', '#0A0A0A', '#585A4F', '#8F2F0E', '#FFFFFF', '#E6E8DA', { marker: '#F2C9A8', onMarker: '#0A0A0A', line: '#0A0A0A' }) },
  rhythm: ['cream'], byType: { closing: 'cream' }, fonts: { headline: 'Hanken Grotesk', headlineWeight: 700, body: 'Instrument Sans', bodyWeight: 400, strong: 600 },
  type: { cover: 112, headline: 84, body: 42, small: 34, stat: 300, quote: 70, label: 32 }, caseStyle: 'sentence', shape: { radius: 20, outline: 3, stroke: 5, badge: 'circle', marker: 'underline', sticker: 'pill', hardShadow: 0, decor: 'orbs' }, chrome: 'page-number', devices: { profileHeader: true },
  flavour: { cover: 'statement', coverVariant: 0, prefer: ['prose', 'numbered-list', 'comparison', 'listicle-numeral', 'checklist', 'statement', 'numbered-stagger'], avoid: ['stat-grid', 'feature-slider', 'timeline', 'statement-stacked', 'pill-stagger'], variants: { statement: 0, prose: 0, checklist: 0 } }, layouts: L({ step: 'step-badge' }) });

add(7, { title: 'Pink serif stickers', description: 'Hot pink and white with a heavy headline, offset-shadow pills and playful stickers, for fun, social, lifestyle posts.',
  tones: ['friendly', 'bold', 'warm'], kw: ['fun', 'food', 'lifestyle', 'travel', 'beauty', 'party', 'favourites', 'recipe', 'love', 'trend', 'style', 'weekend', 'gift', 'cute'], types: ['cover', 'checklist', 'content'],
  palettes: { pink: pal('#CC2B6E', '#FFFFFF', '#FFF0F6', '#FFE9A8', '#CC2B6E', '#FFFFFF', { onSurface: '#2A2A2A', line: '#2A2A2A' }), white: pal('#FFFFFF', '#2A2A2A', '#5B5B5B', '#CC2B6E', '#FFFFFF', '#FBE9F1', { line: '#2A2A2A' }) },
  rhythm: ['pink', 'white', 'white', 'white', 'white', 'pink'], byType: { closing: 'white' }, fonts: { headline: 'Playfair Display', headlineWeight: 800, body: 'Instrument Sans', bodyWeight: 500, strong: 600 },
  type: { cover: 130, headline: 92, body: 42, small: 34, stat: 300, quote: 76, label: 32 }, caseStyle: 'sentence', shape: { radius: 60, outline: 3, stroke: 5, badge: 'circle', marker: 'underline', sticker: 'pill', hardShadow: 10, decor: 'orbs' }, chrome: 'none', devices: { hardShadow: 10, shadow: 'accent', penCircle: true, stickers: true },
  flavour: { cover: 'statement-pill', coverVariant: 0, prefer: ['statement-pill', 'pill-stagger', 'headline-card', 'prose', 'bullet-list', 'contact-closing', 'cta-button'], avoid: ['stat-bar', 'stat-grid', 'timeline', 'statement-stacked'], variants: { 'statement-pill': 0, 'pill-stagger': 0, 'headline-card': 0, prose: 1 } }, layouts: L({ step: 'step-pill' }) });

add(8, { title: 'Black holographic', description: 'Pure black, thin rules, light sans text and one lavender accent, for modern tech, product and AI topics.',
  tones: ['expert', 'modern', 'premium'], kw: ['ai', 'tech', 'product', 'software', 'future', 'design', 'startup', 'data', 'launch', 'update', 'feature', 'tool', 'automation', 'build'], types: ['cover', 'content', 'stat'],
  palettes: { black: pal('#000000', '#FFFFFF', '#A6A6A6', '#DA88F4', '#000000', '#161616', { marker: '#DA88F4', onMarker: '#000000', line: '#3A3A3A' }) },
  rhythm: ['black'], byType: { closing: 'black' }, fonts: { headline: 'Hanken Grotesk', headlineWeight: 500, body: 'Hanken Grotesk', bodyWeight: 300, strong: 500 },
  type: { cover: 150, headline: 96, body: 42, small: 34, stat: 320, quote: 74, label: 32 }, caseStyle: 'sentence', shape: { radius: 12, outline: 2, stroke: 3, badge: 'circle', marker: 'underline', sticker: 'pill', hardShadow: 0, decor: 'rings' }, chrome: 'none', devices: { gradientText: ['#D63DF2', '#F58FD6', '#6FA8F5', '#7FE8D2'], rule: 'lower-two-thirds', footerRow: true, contactClosing: true },
  flavour: { cover: 'statement', coverVariant: 0, prefer: ['statement', 'prose', 'statement-question', 'lead-statement', 'big-stat', 'quote', 'contact-closing'], avoid: ['numbered-list', 'listicle-numeral', 'checklist', 'pill-stagger', 'statement-pill'], variants: { statement: 0, prose: 1, 'statement-question': 0, 'big-stat': 1 } }, layouts: L({ step: 'step-pill' }) });

// Vector art of each preset's own pack (src/image-engine/art), placed in safe zones and recoloured to the preset's palette (devices.art). Only the items the pack really used.
// Style 3 (one text backing bar), style 6 (pictures only) and style 8 (two hairlines) have little or no vector art: see out/art-inventory/inventory.md.
const ART = {
  1: [{ item: 'style-1/background-1', zone: 'corner-tr', w: 380, bleed: 0.3 }, { item: 'style-1/sticker-4', zone: 'corner-br', w: 110, on: 'inner' }, { item: 'style-1/sticker-2', zone: 'corner-bl', w: 130, on: 'inner' }],
  2: [{ item: 'style-2/sticker-2', zone: 'corner-tr', w: 110, on: 'inner' }, { item: 'style-2/divider-1', zone: 'divider-low', w: 405, on: 'inner' }, { item: 'style-2/sticker-1', zone: 'corner-br', w: 90, on: 'last' }],
  4: [{ item: 'style-4/frame-1', zone: 'top-edge', w: 1080, on: 'inner' }, { item: 'style-4/corner-1', zone: 'corner-br', w: 110, on: 'first' }, { item: 'style-4/sticker-1', zone: 'corner-bl', w: 120, on: 'inner' }],
  5: [{ item: 'style-5/divider-1', zone: 'divider-low', w: 150, on: 'inner' }, { item: 'style-5/corner-1', zone: 'corner-br', w: 60, on: 'inner' }],
  7: [{ item: 'style-7/sticker-1', zone: 'corner-tr', w: 190, on: 'inner' }, { item: 'style-7/sticker-2', zone: 'corner-bl', w: 170, on: 'inner' }, { item: 'style-7/sticker-3', zone: 'corner-br', w: 150, on: 'last' }],
  8: [{ item: 'style-8/divider-2', zone: 'divider-low', w: 984, on: 'inner' }, { item: 'style-8/divider-1', zone: 'divider-high', w: 984, on: 'inner' }],
};
for (const [n, o] of S) {
  const name = `style-${n}`;
  const dir = `src/image-engine/styles/${name}`;
  fs.mkdirSync(dir, { recursive: true });
  const spec = {
    schema: 1, name, title: o.title, description: o.description, suits: { tones: o.tones, keywords: o.kw, slideTypes: o.types }, version: '1.0.0',
    basedOn: { cluster: 'none', note: `Style ${n} of the source packs (REFS/Styles): colours, type mood, case and rhythm read by eye and by sampling the rendered slides. No picture, illustration or layout is copied.` },
    palettes: o.palettes, rhythm: o.rhythm, byType: o.byType, fonts: o.fonts, type: o.type, caseStyle: o.caseStyle, headlineLineHeight: 1.0, shape: o.shape, spacing: { margin: 80, gap: 24, section: 52 }, chrome: o.chrome, layouts: o.layouts, assets: {},
    library: { note: 'Tokens for the layout library (designLibrary.ts); the app template route ignores them.', ...(o.gradients ? { gradients: o.gradients } : {}), flavour: o.flavour, ...(o.devices || ART[n] ? { devices: { ...(o.devices ?? {}), ...(ART[n] ? { art: ART[n] } : {}) } } : {}), ...(o.closingLayout ? { byType: { closing: o.closingLayout } } : {}) },
  };
  fs.writeFileSync(`${dir}/style.json`, JSON.stringify(spec, null, 2) + '\n');
}
console.log('wrote', S.length);
