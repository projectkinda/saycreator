// The neutral base every reference style starts from: plain white, one font, no decorations, no elements, no photo treatments, no page
// chrome. Whatever a style has beyond this came from what the reader asked for, so nothing can be left over from another style.
import type { StyleSpec } from '../image-engine/styles/format';

export const BLANK_NAME = 'blank';
export const BLANK_TITLE = 'Blank (plain white, nothing added)';

export function blankStyle(): StyleSpec {
  const palette = { bg: '#FFFFFF', text: '#111111', muted: '#555555', accent: '#111111', onAccent: '#FFFFFF', marker: '#111111', onMarker: '#FFFFFF', surface: '#F2F2F2', onSurface: '#111111', line: '#111111' };
  // The photo layouts are there so that a slide that has a photo uses one; they only apply when a slide has a photo or a photo hint.
  const photo = { treatment: 'plain' };
  return {
    schema: 1,
    name: BLANK_NAME,
    title: BLANK_TITLE,
    description: 'A plain white style with no decoration, used as the starting point for a style made from references.',
    version: '1.0.0',
    basedOn: { cluster: 'blank', note: 'No reference: a neutral base.' },
    palettes: { plain: palette },
    rhythm: ['plain'],
    fonts: { headline: 'Schibsted Grotesk', headlineWeight: 700, body: 'Instrument Sans', bodyWeight: 500, strong: 600 },
    type: { cover: 130, headline: 96, body: 44, small: 34, stat: 300, quote: 76, label: 32 },
    caseStyle: 'sentence',
    headlineLineHeight: 1.05,
    shape: { radius: 0, outline: 0, stroke: 6, hardShadow: 0, badge: 'square', marker: 'box', sticker: 'tag', decor: 'blocks' },
    spacing: { margin: 72, gap: 24, section: 48 },
    chrome: 'none',
    layouts: {
      cover: [{ use: 'cover-photo-full', when: { photo: true }, params: photo }, { use: 'cover-top', when: { headlineWordsMax: 7 } }, { use: 'cover-stack' }],
      content: [{ use: 'content-photo-frame', when: { photo: true }, params: { ...photo, frame: 'plain' } }, { use: 'content-bar', when: { bodyWordsMax: 14 } }, { use: 'content-stack' }],
      step: [{ use: 'step-numeral', when: { headlineWordsMax: 4 } }, { use: 'step-badge' }],
      stat: [{ use: 'stat-photo', when: { photo: true }, params: photo }, { use: 'stat-giant' }],
      checklist: [{ use: 'checklist-lines', when: { itemsMax: 3 } }, { use: 'checklist-icons' }],
      beforeafter: [{ use: 'ba-split', when: { indexMax: 3 } }, { use: 'ba-cards' }],
      quote: [{ use: 'quote-photo-blur', when: { photo: true }, params: photo }, { use: 'quote-centre', when: { quoteCharsMin: 80 } }, { use: 'quote-marks' }],
      closing: [{ use: 'closing-bar', when: { indexMax: 4 } }, { use: 'closing-button' }],
    },
    assets: {},
    photo: { treatments: { plain: [] }, overlay: '#000000' },
  };
}
