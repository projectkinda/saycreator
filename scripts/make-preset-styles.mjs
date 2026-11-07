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
  rhythm: ['dark', 'light', 'light', 'dark', 'light', 'dark'], byType: { closing: 'dark' }, fonts: { headline: 'Instrument Sans', headlineWeight: 600, body: 'Instrument Sans', bodyWeight: 400, strong: 600 },
  type: { cover: 112, headline: 84, body: 38, small: 32, stat: 300, quote: 72, label: 32, note: 34, byline: 32 }, caseStyle: 'sentence', shape: { radius: 8, outline: 2, stroke: 4, badge: 'circle', marker: 'box', sticker: 'pill', hardShadow: 0, decor: 'orbs' }, chrome: 'page-number',
  gradients: { dark: { angle: 180, stops: [{ at: 0, color: '#000000' }, { at: 0.62, color: '#000000' }, { at: 1, color: '#4F4523' }] }, light: { angle: 180, stops: [{ at: 0, color: '#FAFAFA' }, { at: 0.62, color: '#FAFAFA' }, { at: 1, color: '#FBEDBA' }] } },
  flavour: { cover: 'statement', coverVariant: 1, prefer: ['statement', 'lead-statement', 'split-text', 'quote', 'big-question', 'numbered-list'], avoid: ['stat-grid', 'card-grid', 'feature-slider', 'timeline'], variants: { statement: 1, quote: 1, 'split-text': 0 } }, layouts: L({ step: 'step-pill' }) });

add(2, { title: 'Bold orange', description: 'A full orange ground with a heavy white headline, numbered points and outlined buttons, for lists and how-to tips.',
  tones: ['bold', 'friendly'], kw: ['tips', 'steps', 'how', 'ways', 'list', 'hacks', 'mistakes', 'checklist', 'start', 'launch', 'grow', 'guide', 'learn', 'fast'], types: ['step', 'checklist', 'cover'],
  palettes: { orange: pal('#F76718', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#F76718', '#FF8238', { marker: '#FFFFFF', onMarker: '#F76718', onSurface: '#FFFFFF' }), ink: pal('#2B1308', '#FFFFFF', '#F2CDB8', '#F76718', '#FFFFFF', '#3F2111', { marker: '#F76718', onMarker: '#2B1308', line: '#F76718' }) },
  rhythm: ['orange'], byType: { closing: 'orange' }, fonts: { headline: 'Schibsted Grotesk', headlineWeight: 800, body: 'Instrument Sans', bodyWeight: 500, strong: 600 },
  type: { cover: 136, headline: 100, body: 44, small: 34, stat: 320, quote: 78, label: 32 }, caseStyle: 'sentence', shape: { radius: 10, outline: 4, stroke: 6, badge: 'rounded', marker: 'underline', sticker: 'tag', hardShadow: 0, decor: 'rings' }, chrome: 'strip',
  flavour: { cover: 'statement', coverVariant: 0, prefer: ['numbered-list', 'listicle-numeral', 'step-numeral', 'checklist', 'cta-button', 'stepper', 'statement'], avoid: ['stat-grid', 'card-grid', 'quote', 'timeline'], variants: { statement: 0, checklist: 0, 'cta-button': 0 } }, layouts: L({ step: 'step-numeral' }) });

add(3, { title: 'Cream ink', description: 'Warm cream pages, heavy black type in a three-part header row and a plain black button, for punchy opinions and lists.',
  tones: ['bold', 'expert', 'clear'], kw: ['truth', 'rules', 'opinion', 'mistakes', 'habits', 'lessons', 'founder', 'career', 'advice', 'follow', 'stop', 'never', 'principles'], types: ['content', 'checklist', 'closing'],
  palettes: { cream: pal('#FFF9F1', '#0A0A0A', '#5E5A53', '#0A0A0A', '#FFF9F1', '#F2E9DB', { marker: '#0A0A0A', onMarker: '#FFF9F1' }), ink: pal('#0A0A0A', '#FFF9F1', '#BDB8AE', '#FFF9F1', '#0A0A0A', '#1D1B19', { marker: '#FFF9F1', onMarker: '#0A0A0A' }) },
  rhythm: ['cream'], byType: { closing: 'cream' }, fonts: { headline: 'Schibsted Grotesk', headlineWeight: 800, body: 'Instrument Sans', bodyWeight: 500, strong: 600 },
  type: { cover: 120, headline: 88, body: 42, small: 34, stat: 300, quote: 72, label: 32 }, caseStyle: 'sentence', shape: { radius: 6, outline: 3, stroke: 4, badge: 'square', marker: 'box', sticker: 'pill', hardShadow: 0, decor: 'blocks' }, chrome: 'page-number',
  flavour: { cover: 'statement', coverVariant: 0, prefer: ['statement', 'lead-statement', 'numbered-list', 'checklist', 'split-text', 'cta-button'], avoid: ['stat-grid', 'feature-slider', 'timeline', 'card-grid'], variants: { statement: 0, checklist: 1, 'cta-button': 0 } }, layouts: L({ step: 'step-badge' }) });

add(4, { title: 'Electric blue play', description: 'Saturated blue and white, chunky friendly capitals and a brand footer, for playful launches, promos and announcements.',
  tones: ['bold', 'friendly'], kw: ['launch', 'new', 'sale', 'event', 'app', 'brand', 'announce', 'promo', 'free', 'win', 'fun', 'product', 'offer', 'drop'], types: ['cover', 'content', 'closing'],
  palettes: { blue: pal('#2A06E0', '#FFFFFF', '#D6D0F8', '#FFFFFF', '#2A06E0', '#4626E4', { onSurface: '#FFFFFF', line: '#FFFFFF' }), white: pal('#FFFFFF', '#2A06E0', '#5436E6', '#2A06E0', '#FFFFFF', '#ECE8FC', { line: '#2A06E0' }) },
  rhythm: ['blue', 'blue', 'white', 'blue', 'white', 'blue'], byType: { closing: 'blue' }, fonts: { headline: 'Schibsted Grotesk', headlineWeight: 800, body: 'Instrument Sans', bodyWeight: 500, strong: 600 },
  type: { cover: 150, headline: 104, body: 44, small: 34, stat: 330, quote: 80, label: 32 }, caseStyle: 'upper', shape: { radius: 44, outline: 4, stroke: 6, badge: 'circle', marker: 'box', sticker: 'pill', hardShadow: 0, decor: 'orbs' }, chrome: 'strip',
  flavour: { cover: 'statement', coverVariant: 0, prefer: ['statement', 'big-stat', 'cta-button', 'lead-statement', 'step-numeral', 'checklist'], avoid: ['timeline', 'card-grid', 'quote', 'comparison'], variants: { statement: 0, 'big-stat': 0, 'cta-button': 1 } }, layouts: L({ cover: { bar: 'last' }, step: 'step-badge' }) });

add(5, { title: 'Green elegant serif', description: 'White pages and one deep green card, an italic serif voice and a quiet arrow, for thoughtful, personal teaching.',
  tones: ['calm', 'expert', 'warm'], kw: ['reflect', 'story', 'wellbeing', 'coach', 'leadership', 'think', 'learn', 'life', 'growth', 'habit', 'mindset', 'journal', 'sustainable', 'finance'], types: ['quote', 'content', 'cover'],
  palettes: { white: pal('#FFFFFF', '#00225B', '#4A5C80', '#1E8563', '#FFFFFF', '#E9F3EE', { marker: '#1E8563', onMarker: '#FFFFFF', line: '#1E8563' }), green: pal('#1E8563', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#1E8563', '#2B9473', { line: '#FFFFFF' }) },
  rhythm: ['green', 'white', 'white', 'green', 'white', 'white'], byType: { closing: 'white' }, fonts: { headline: 'Instrument Serif Italic', headlineWeight: 400, body: 'Instrument Sans', bodyWeight: 400, strong: 600 },
  type: { cover: 120, headline: 88, body: 38, small: 32, stat: 300, quote: 78, label: 32, note: 34, byline: 32 }, caseStyle: 'sentence', shape: { radius: 44, outline: 2, stroke: 4, badge: 'circle', marker: 'underline', sticker: 'pill', hardShadow: 0, decor: 'orbs' }, chrome: 'none',
  flavour: { cover: 'lead-statement', coverVariant: 0, prefer: ['lead-statement', 'quote', 'statement', 'split-text', 'big-question'], avoid: ['stat-grid', 'card-grid', 'feature-slider', 'step-numeral'], variants: { statement: 1, quote: 0 } }, layouts: L({ step: 'step-pill' }) });

add(6, { title: 'Cream social profile', description: 'Warm cream pages with a profile header, bold numbered titles and tick-or-cross pairs, for do and do-not lists.',
  tones: ['friendly', 'clear'], kw: ['dos', 'donts', 'myths', 'mistakes', 'vs', 'better', 'habits', 'before', 'after', 'tips', 'creator', 'personal', 'follow', 'routine'], types: ['beforeafter', 'step', 'content'],
  palettes: { cream: pal('#F9FCEC', '#0A0A0A', '#585A4F', '#C2410C', '#FFFFFF', '#E6E8DA', { marker: '#F2C9A8', onMarker: '#0A0A0A', line: '#0A0A0A' }) },
  rhythm: ['cream'], byType: { closing: 'cream' }, fonts: { headline: 'Hanken Grotesk', headlineWeight: 700, body: 'Instrument Sans', bodyWeight: 400, strong: 600 },
  type: { cover: 112, headline: 84, body: 42, small: 34, stat: 300, quote: 70, label: 32 }, caseStyle: 'sentence', shape: { radius: 20, outline: 3, stroke: 5, badge: 'circle', marker: 'box', sticker: 'pill', hardShadow: 0, decor: 'orbs' }, chrome: 'page-number',
  flavour: { cover: 'statement', coverVariant: 0, prefer: ['numbered-list', 'comparison', 'listicle-numeral', 'checklist', 'split-text', 'statement'], avoid: ['stat-grid', 'feature-slider', 'timeline'], variants: { statement: 0, checklist: 0 } }, layouts: L({ step: 'step-badge' }) });

add(7, { title: 'Pink serif stickers', description: 'Hot pink and white with a heavy headline, offset-shadow pills and playful stickers, for fun, social, lifestyle posts.',
  tones: ['friendly', 'bold', 'warm'], kw: ['fun', 'food', 'lifestyle', 'travel', 'beauty', 'party', 'favourites', 'recipe', 'love', 'trend', 'style', 'weekend', 'gift', 'cute'], types: ['cover', 'checklist', 'content'],
  palettes: { pink: pal('#CC2B6E', '#FFFFFF', '#FFF0F6', '#FFFFFF', '#CC2B6E', '#FFFFFF', { onSurface: '#2A2A2A', line: '#2A2A2A' }), white: pal('#FFFFFF', '#2A2A2A', '#5B5B5B', '#CC2B6E', '#FFFFFF', '#FBE9F1', { line: '#2A2A2A' }) },
  rhythm: ['pink', 'white', 'white', 'white', 'white', 'pink'], byType: { closing: 'white' }, fonts: { headline: 'Schibsted Grotesk', headlineWeight: 800, body: 'Instrument Sans', bodyWeight: 500, strong: 600 },
  type: { cover: 130, headline: 92, body: 42, small: 34, stat: 300, quote: 76, label: 32 }, caseStyle: 'sentence', shape: { radius: 60, outline: 3, stroke: 5, badge: 'circle', marker: 'underline', sticker: 'pill', hardShadow: 10, decor: 'orbs' }, chrome: 'none',
  flavour: { cover: 'statement', coverVariant: 1, prefer: ['statement', 'checklist', 'card-grid', 'split-text', 'cta-button', 'numbered-list'], avoid: ['stat-bar', 'stat-grid', 'timeline'], variants: { statement: 1, checklist: 1, 'cta-button': 1 } }, layouts: L({ step: 'step-pill' }) });

add(8, { title: 'Black holographic', description: 'Pure black, thin rules, light sans text and one lavender accent, for modern tech, product and AI topics.',
  tones: ['expert', 'modern', 'premium'], kw: ['ai', 'tech', 'product', 'software', 'future', 'design', 'startup', 'data', 'launch', 'update', 'feature', 'tool', 'automation', 'build'], types: ['cover', 'content', 'stat'],
  palettes: { black: pal('#000000', '#FFFFFF', '#A6A6A6', '#DA88F4', '#000000', '#161616', { marker: '#DA88F4', onMarker: '#000000', line: '#3A3A3A' }) },
  rhythm: ['black'], byType: { closing: 'black' }, fonts: { headline: 'Hanken Grotesk', headlineWeight: 500, body: 'Hanken Grotesk', bodyWeight: 300, strong: 500 },
  type: { cover: 150, headline: 96, body: 42, small: 34, stat: 320, quote: 74, label: 32 }, caseStyle: 'sentence', shape: { radius: 12, outline: 2, stroke: 3, badge: 'circle', marker: 'underline', sticker: 'pill', hardShadow: 0, decor: 'rings' }, chrome: 'none',
  flavour: { cover: 'statement', coverVariant: 0, prefer: ['statement', 'lead-statement', 'big-stat', 'split-text', 'stat-bar', 'quote'], avoid: ['numbered-list', 'listicle-numeral', 'checklist'], variants: { statement: 0, 'big-stat': 1, quote: 0 } }, layouts: L({ step: 'step-pill' }) });

for (const [n, o] of S) {
  const name = `style-${n}`;
  const dir = `src/image-engine/styles/${name}`;
  fs.mkdirSync(dir, { recursive: true });
  const spec = {
    schema: 1, name, title: o.title, description: o.description, suits: { tones: o.tones, keywords: o.kw, slideTypes: o.types }, version: '1.0.0',
    basedOn: { cluster: 'none', note: `Style ${n} of the source packs (REFS/Styles): colours, type mood, case and rhythm read by eye and by sampling the rendered slides. No picture, illustration or layout is copied.` },
    palettes: o.palettes, rhythm: o.rhythm, byType: o.byType, fonts: o.fonts, type: o.type, caseStyle: o.caseStyle, headlineLineHeight: 1.0, shape: o.shape, spacing: { margin: 80, gap: 24, section: 52 }, chrome: o.chrome, layouts: o.layouts, assets: {},
    library: { note: 'Tokens for the layout library (designLibrary.ts); the app template route ignores them.', ...(o.gradients ? { gradients: o.gradients } : {}), flavour: o.flavour },
  };
  fs.writeFileSync(`${dir}/style.json`, JSON.stringify(spec, null, 2) + '\n');
}
console.log('wrote', S.length);
