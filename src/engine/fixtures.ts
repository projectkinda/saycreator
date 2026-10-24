// Fixture data for the mock engine. Only src/engine/index.ts may import this file.
import type {
  Brand,
  Check,
  DirectionPreset,
  DirectorNote,
  Idea,
  PlanEntry,
  Project,
  StyleSuggestion,
  ThumbnailOption,
  TrendCard,
  VideoStyle,
} from './types';

export const brands: Brand[] = [{ id: 'b1', name: 'Maya Rao', initials: 'MR' }];

export const userName = 'Maya';
export const credits = { used: 760, total: 2000 }; // shown as 1,240 left of 2,000

export const projects: Project[] = [
  {
    id: 'p1',
    brandId: 'b1',
    title: 'Cutting onboarding from 14 days to 3',
    durationSec: 182,
    source: 'upload',
    status: 'choose-style',
    step: 2,
    stepLabel: 'Choose a style',
    poster: { from: '#2A1D20', to: '#7A2A30' },
    resolution: { width: 1080, height: 1920 },
    updatedAt: 'Today',
    madeFrom: { videos: 0, thumbnails: 0, posts: 0 },
  },
  {
    id: 'p2',
    brandId: 'b1',
    title: 'Three emails we stopped sending',
    durationSec: 48,
    source: 'upload',
    status: 'thumbnail',
    step: 4,
    stepLabel: 'Thumbnail',
    poster: { from: '#2F3E4A', to: '#F2A39B' },
    resolution: { width: 1080, height: 1920 },
    updatedAt: 'Yesterday',
    madeFrom: { videos: 1, thumbnails: 3, posts: 4 },
  },
  {
    id: 'p3',
    brandId: 'b1',
    title: 'Pricing page teardown',
    durationSec: 75,
    source: 'record',
    status: 'render-failed',
    step: 3,
    stepLabel: 'Render needs a retry',
    poster: { from: '#3B3335', to: '#8C7E80' },
    resolution: { width: 720, height: 1280 },
    updatedAt: 'Mon',
    madeFrom: { videos: 0, thumbnails: 0, posts: 0 },
  },
  {
    id: 'p4',
    brandId: 'b1',
    title: 'Founder Q&A, October',
    durationSec: 2530,
    source: 'upload',
    status: 'listening',
    step: 1,
    stepLabel: 'Listening to it now',
    poster: { from: '#E9DDD3', to: '#C9B5A6' },
    resolution: { width: 1920, height: 1080 },
    updatedAt: 'Mon',
    madeFrom: { videos: 0, thumbnails: 0, posts: 0 },
  },
];

export const week: PlanEntry[] = [
  { id: 'w1', day: 'Today', channel: 'LinkedIn', title: 'Post: 14 days to 3', status: 'ready' },
  { id: 'w2', day: 'Tue', status: 'empty' },
  {
    id: 'w3',
    day: 'Wed',
    channel: 'Instagram',
    title: 'Reel: Three emails we stopped sending',
    status: 'needs-thumbnail',
  },
  { id: 'w4', day: 'Wed', channel: 'X', title: 'Thread: onboarding in 7 posts', status: 'ready' },
  {
    id: 'w5',
    day: 'Thu',
    channel: 'Instagram',
    title: 'Suggested: carousel from 14 days to 3',
    status: 'suggested',
  },
];

export const trends: TrendCard[] = [
  {
    id: 'tr1',
    kind: 'Format',
    title: 'Talking head with an on-screen checklist',
    summary: 'Short cuts, and a checklist that builds line by line.',
    source: 'Source: curated format library · updated Monday',
    image: { from: '#0F0F0F', to: '#2F3E4A' },
  },
  {
    id: 'tr2',
    kind: 'Topic',
    title: 'We replaced our onboarding call',
    summary: 'Rising in SaaS operator posts this week.',
    source: 'Source: news and RSS · 14 articles',
    image: { from: '#E9DDD3', to: '#B7A294' },
  },
  {
    id: 'tr3',
    kind: 'Hook',
    title: "Here's what nobody tells you about…",
    summary: 'Question-first hooks in your niche.',
    source: 'Source: public trend pages',
  },
];

export const ideas: Idea[] = [
  {
    id: 'i1',
    title: 'Turn 14 days to 3 into a 5-slide carousel',
    detail: 'From your latest video. 4 key moments found.',
  },
  {
    id: 'i2',
    title: 'Answer the pricing question in 30 seconds',
    detail: 'Asked 3 times in your Q&A recording.',
  },
  {
    id: 'i3',
    title: 'Write the article behind your onboarding video',
    detail: 'About 900 words, based on the transcript.',
  },
];

export const styleSuggestions: StyleSuggestion[] = [
  { id: 's1', name: 'Punchy explainer', description: 'Fast cuts, bold captions, emphasis zooms.', preset: 'punchy' },
  { id: 's2', name: 'Calm walkthrough', description: 'Steady pace, clean captions, soft music.', preset: 'calm' },
  { id: 's3', name: 'Cinematic story', description: 'Longer shots, slow push-ins, minimal captions.', preset: 'cinematic' },
];

export const directorNotes: Record<DirectionPreset, DirectorNote[]> = {
  punchy: [
    { id: 'n1', text: 'Cuts about every 2 seconds', alternative: 'Calmer pace' },
    { id: 'n2', text: 'Emphasis zoom on 4 key words', alternative: 'Fewer zooms' },
    { id: 'n3', text: 'Bold captions, one phrase at a time', alternative: 'Smaller captions' },
    { id: 'n4', text: 'Music dips under your voice', alternative: 'Keep music steady' },
  ],
  calm: [
    { id: 'n1', text: 'Cuts about every 4 seconds', alternative: 'Faster pace' },
    { id: 'n2', text: 'One gentle push-in at the key point', alternative: 'Add emphasis zooms' },
    { id: 'n3', text: 'Clean captions at the bottom', alternative: 'Bolder captions' },
    { id: 'n4', text: 'Soft music, low volume', alternative: 'Louder music' },
  ],
  cinematic: [
    { id: 'n1', text: 'Longer shots with slow push-ins', alternative: 'Cut sooner' },
    { id: 'n2', text: 'Letterbox and a light film look', alternative: 'Remove the look' },
    { id: 'n3', text: 'Minimal captions, key lines only', alternative: 'Show all captions' },
    { id: 'n4', text: 'Room tone and a slow score', alternative: 'Simpler audio' },
  ],
};

export const checks: Check[] = [
  { id: 'c1', label: 'Pacing OK', severity: 'ok' },
  { id: 'c2', label: 'Captions OK', severity: 'ok' },
  {
    id: 'c3',
    label: '1 soft zoom',
    severity: 'warn',
    detail: 'At 0:31 the zoom crops a 720p clip and may look soft.',
    fixLabel: 'Reduce zoom',
    fixPatch: { label: 'Reduce zoom', ops: [{ path: 'zoom.max', value: 1.2 }] },
  },
];

export const thumbnails: ThumbnailOption[] = [
  {
    id: 'th1',
    label: 'Option A',
    headline: '14 → 3 days',
    poster: { from: '#2A1D20', to: '#2F3E4A' },
    phoneCheck: { ok: true, note: 'Readable on a phone' },
    selected: true,
  },
  {
    id: 'th2',
    label: 'Option B',
    headline: '3 days. Not 14.',
    poster: { from: '#E9DDD3', to: '#B7A294' },
    phoneCheck: { ok: false, note: 'Text a bit small' },
    selected: false,
  },
  {
    id: 'th3',
    label: 'Option C',
    poster: { from: '#3B3335', to: '#8C7E80' },
    phoneCheck: { ok: true, note: 'Readable on a phone' },
    selected: false,
  },
];

export const videoStyles: VideoStyle[] = [
  { id: 'vs1', name: 'Fast talking head', description: 'Cuts about every 2 seconds, emphasis zooms, bold captions.', origin: 'suggested', fromReference: false, poster: { from: '#2A1D20', to: '#7A2A30' } },
  { id: 'vs2', name: 'Calm explainer', description: 'Cuts every 4 seconds, one gentle push-in, clean captions.', origin: 'suggested', fromReference: false, poster: { from: '#2F3E4A', to: '#F2A39B' } },
  { id: 'vs3', name: "Like Sam's reel", description: 'Copied: pacing, caption timing. Approximated: fonts, custom effects.', origin: 'mine', fromReference: true, poster: { from: '#3B3335', to: '#8C7E80' } },
];
