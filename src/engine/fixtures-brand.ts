// Brand kit and writing voice fixtures. Only src/engine/index.ts may import this file.
import type { BrandKit, VoiceOptions, VoiceProfile } from './types';

export const brandKit: BrandKit = {
  brandId: 'b1',
  colors: { primary: '#0F7B78', text: '#1A2226', background: '#F3F5F6', highlight: '#E8A33D' },
  fonts: { headline: 'Schibsted Grotesk', body: 'Instrument Sans' },
  logo: { name: 'Maya Rao logo', poster: { from: '#1A2226', to: '#0F7B78' } },
  handle: '@mayarao',
};

export const fonts = [
  'Schibsted Grotesk',
  'Instrument Sans',
  'IBM Plex Sans',
  'DM Sans',
  'Work Sans',
  'Lora',
  'Playfair Display',
];

export const voice: VoiceProfile = {
  brandId: 'b1',
  samples: 2,
  tone: ['Direct', 'Warm', 'No hype'],
  sentenceLength: 2,
  wordsUse: ["here's what changed", 'in practice', 'specifically'],
  wordsAvoid: ['game-changer', 'unlock', 'synergy'],
  emoji: 'None',
  example: {
    generic: '🚀 Excited to share how we unlocked a game-changing onboarding process!',
    yours: "We cut onboarding from 14 days to 3. Here's what changed first.",
  },
};

export const voiceOptions: VoiceOptions = {
  tones: ['Direct', 'Warm', 'No hype', 'Playful', 'Formal', 'Bold', 'Curious'],
  emoji: ['None', 'Occasional', 'Often'],
};
