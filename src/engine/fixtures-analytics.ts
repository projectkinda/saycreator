// Analytics fixtures. Only src/engine/index.ts may import this file.
import type { AnalyticsPost, AnalyticsStat, AnalyticsSuggestion } from './types';

export const stats: AnalyticsStat[] = [
  { id: 's1', label: 'Views, last 28 days', value: '48,210', detail: '+12% vs before' },
  { id: 's2', label: 'Average watched', value: '61%', detail: 'of each video' },
  { id: 's3', label: 'Posts published', value: '11', detail: 'across 3 platforms' },
  { id: 's4', label: 'Profile visits', value: '1,904', detail: '+4%' },
];

/** Shape of a month: a slow build with one spike (index 20). */
export const dailyViews = [
  820, 910, 880, 1040, 1100, 990, 1210, 1350, 1280, 1190, 1420, 1560, 1480, 1390, 1610, 1720, 1650, 1580, 1840, 1930, 4120, 2210, 1980, 1760, 1850, 1920, 2010, 1890,
];
export const peakIndex = 20;

export const insights = [
  'Videos that open with a question held viewers 22% longer than the others.',
  'Posts on Tuesdays and Wednesdays got more views.',
  'Shorter videos (under 45s) were watched to the end more often.',
];

export const suggestions: AnalyticsSuggestion[] = [
  { id: 'g1', text: 'Open the next video with a question', actionLabel: 'Plan it', target: 'calendar' },
  { id: 'g2', text: 'Post the carousel on Wednesday', actionLabel: 'Add to calendar', target: 'calendar' },
  { id: 'g3', text: 'Make a 40-second cut of the pricing video', actionLabel: 'Start', target: 'new-project' },
];

export const posts: AnalyticsPost[] = [
  { id: 'ap1', title: 'Three emails we stopped sending', projectId: 'p2', poster: { from: '#2F3E4A', to: '#F2A39B' }, landscape: false, channel: 'Instagram', views: 18420, watchedPercent: 72, edit: ['Punchy', 'question hook', '0:48'] },
  { id: 'ap2', title: 'Cutting onboarding from 14 days to 3', projectId: 'p1', poster: { from: '#2A1D20', to: '#7A2A30' }, landscape: false, channel: 'LinkedIn', views: 9730, watchedPercent: 58, edit: ['Calm', 'statement hook', '3:02'] },
];
