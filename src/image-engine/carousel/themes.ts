// Three themes made of tokens only. Slides never hard-code a colour, font, size or gap: they read it from here.
import type { Theme } from './types';

/** Warm paper, black ink, one orange accent, thin hand-drawn strokes. */
export const paper: Theme = {
  id: 'paper',
  name: 'Paper',
  mood: 'Light, calm, editorial. Warm off-white, black ink, orange accent, underlined words.',
  base: { bg: '#F6F1E7', text: '#1B1A17', muted: '#575246', accent: '#B93A0A', onAccent: '#FFFFFF', marker: '#FFD84D', onMarker: '#1B1A17', surface: '#EDE5D3', onSurface: '#1B1A17', line: '#1B1A17' },
  hero: { bg: '#1B1A17', text: '#F6F1E7', muted: '#CFC7B4', accent: '#FF8A4C', onAccent: '#1B1A17', marker: '#FFD84D', onMarker: '#1B1A17', surface: '#2B2923', onSurface: '#F6F1E7', line: '#F6F1E7' },
  fonts: { headline: 'Schibsted Grotesk', headlineWeight: 700, body: 'Instrument Sans', bodyWeight: 400, strong: 600 },
  type: { cover: 120, headline: 84, body: 52, small: 34, stat: 300, quote: 76 },
  shape: { radius: 10, outline: 3, stroke: 5, badge: 'circle', marker: 'underline', sticker: 'tag', hardShadow: 0, decor: 'rings' },
  spacing: { margin: 88, gap: 28, section: 64 },
};

/** Deep blue gradients, rounded shapes, mint accent, filled highlight boxes. */
export const midnight: Theme = {
  id: 'midnight',
  name: 'Midnight',
  mood: 'Dark, smooth, modern. Blue gradients, soft round shapes, mint accent, filled highlight boxes.',
  base: { bg: { type: 'linear', angle: 160, stops: [{ at: 0, color: '#0E1B33' }, { at: 1, color: '#16305A' }] }, text: '#F2F6FF', muted: '#A9B8D6', accent: '#5EEAD4', onAccent: '#07201C', marker: '#5EEAD4', onMarker: '#07201C', surface: '#1B3159', onSurface: '#F2F6FF', line: '#35508A' },
  hero: { bg: { type: 'linear', angle: 145, stops: [{ at: 0, color: '#4C1D95' }, { at: 1, color: '#0E7490' }] }, text: '#FFFFFF', muted: '#DCE3F5', accent: '#FDE047', onAccent: '#1F1A00', marker: '#FDE047', onMarker: '#1F1A00', surface: '#3B1A7A', onSurface: '#FFFFFF', line: '#FFFFFF' },
  fonts: { headline: 'Instrument Sans', headlineWeight: 600, body: 'Instrument Sans', bodyWeight: 400, strong: 600 },
  type: { cover: 112, headline: 80, body: 52, small: 34, stat: 300, quote: 72 },
  shape: { radius: 36, outline: 0, stroke: 6, badge: 'rounded', marker: 'box', sticker: 'pill', hardShadow: 0, decor: 'orbs' },
  spacing: { margin: 96, gap: 32, section: 72 },
};

/** Flat yellow and black, hard edges, thick outlines, offset shadows, brush strokes. */
export const pop: Theme = {
  id: 'pop',
  name: 'Pop',
  mood: 'Loud, flat, playful. Yellow and black, hard corners, thick outlines, offset shadows, brush strokes.',
  base: { bg: '#FFD43B', text: '#111111', muted: '#3D3300', accent: '#FF3D81', onAccent: '#111111', marker: '#FFFFFF', onMarker: '#111111', surface: '#FFFFFF', onSurface: '#111111', line: '#111111' },
  hero: { bg: '#111111', text: '#FFD43B', muted: '#E8E0C8', accent: '#FF3D81', onAccent: '#111111', marker: '#FF3D81', onMarker: '#111111', surface: '#262626', onSurface: '#FFD43B', line: '#FFD43B' },
  fonts: { headline: 'Schibsted Grotesk', headlineWeight: 800, body: 'Schibsted Grotesk', bodyWeight: 600, strong: 700 },
  type: { cover: 128, headline: 88, body: 52, small: 34, stat: 320, quote: 76 },
  shape: { radius: 0, outline: 6, stroke: 8, badge: 'square', marker: 'brush', sticker: 'burst', hardShadow: 10, decor: 'blocks' },
  spacing: { margin: 80, gap: 24, section: 56 },
};

export const THEMES: Theme[] = [paper, midnight, pop];
