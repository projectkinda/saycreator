// Image library fixtures. Only src/engine/index.ts may import this file.
import type { ImageItem } from './types';

export const images: ImageItem[] = [
  { id: 'im1', kind: 'thumbnail', title: 'Thumbnail · Option A', ratio: '16:9', caption: '14 → 3 days', poster: { from: '#2A1D20', to: '#2F3E4A' }, textTone: 'light', status: 'ready', note: { ok: true, text: 'Readable on a phone' }, source: 'From “Cutting onboarding from 14 days to 3”', projectId: 'p1', createdAt: 8 },
  { id: 'im2', kind: 'thumbnail', title: 'Thumbnail', ratio: '16:9', caption: 'Stop sending these', poster: { from: '#E9DDD3', to: '#B7A294' }, textTone: 'dark', status: 'ready', note: { ok: false, text: 'Text a bit small' }, source: 'From “Three emails we stopped sending”', projectId: 'p2', createdAt: 7 },
  { id: 'im3', kind: 'carousel', title: 'Carousel · 7 slides', ratio: '4:5', caption: 'Slide 1 of 7', poster: { from: '#2F3E4A', to: '#F2A39B' }, textTone: 'light', status: 'ready', source: 'From “Cutting onboarding from 14 days to 3”', projectId: 'p1', createdAt: 6 },
  { id: 'im4', kind: 'quote', title: 'Quote card', ratio: '1:1', caption: 'Onboarding is the product.', poster: { from: '#F2F2F2', to: '#E5E5E5' }, textTone: 'dark', status: 'ready', source: 'Quote at 1:12', projectId: 'p1', createdAt: 5 },
  { id: 'im5', kind: 'carousel', title: 'Carousel · 5 slides', ratio: '4:5', caption: 'Slide 1 of 5', poster: { from: '#3B3335', to: '#8C7E80' }, textTone: 'light', status: 'needs-review', note: { ok: false, text: '1 number to confirm' }, source: 'From “Pricing page teardown”', projectId: 'p3', createdAt: 4 },
  { id: 'im6', kind: 'thumbnail', title: 'Reel cover', ratio: '9:16', caption: 'Three emails', poster: { from: '#2F3E4A', to: '#F2A39B' }, textTone: 'light', status: 'ready', note: { ok: true, text: 'Safe zones OK' }, source: 'From “Three emails we stopped sending”', projectId: 'p2', createdAt: 3 },
  { id: 'im7', kind: 'quote', title: 'Quote card', ratio: '1:1', caption: 'Ask the customer first.', poster: { from: '#E9DDD3', to: '#C9B5A6' }, textTone: 'dark', status: 'ready', source: 'Made on its own', createdAt: 2 },
  { id: 'im8', kind: 'thumbnail', title: 'Thumbnail', ratio: '16:9', caption: 'Standalone', poster: { from: '#0F0F0F', to: '#2F3E4A' }, textTone: 'light', status: 'draft', source: 'Made on its own', createdAt: 1 },
];
