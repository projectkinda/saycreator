// Asset library fixtures. Only src/engine/index.ts may import this file.
import type { AssetItem, AssetKind, Gradient } from './types';

const g = (from: string, to: string): Gradient => ({ from, to });
const ok = (text: string) => ({ tone: 'ok' as const, text });

function a(
  n: number,
  name: string,
  kind: AssetKind,
  poster: Gradient,
  note: AssetItem['note'],
  usedIn: number,
  extra: Partial<AssetItem> = {},
): AssetItem {
  return { id: `as${n}`, name, kind, status: 'ready', note, poster, usedIn, createdAt: 100 - n, ...extra };
}

export const assets: AssetItem[] = [
  a(1, 'Notion template', 'product', g('#E9DDD3', '#B7A294'), ok('Cut out'), 3),
  a(2, 'Figma plugin', 'product', g('#2F3E4A', '#F2A39B'), ok('Cut out'), 1),
  a(3, 'Logo, dark', 'logo', g('#F2F2F2', '#E5E5E5'), ok('Transparent'), 0, { usedEverywhere: true }),
  a(4, 'Pricing screenshot', 'screenshot', g('#3B3335', '#8C7E80'), { tone: 'warn', text: 'Low resolution' }, 0),
  a(5, 'Onboarding checklist', 'screenshot', g('#2A1D20', '#7A2A30'), { tone: 'progress', text: 'Labelling…' }, 0, { status: 'processing' }),
  a(6, 'Soft office loop', 'music', g('#F2F2F2', '#E5E5E5'), { tone: 'plain', text: 'Music' }, 2, { durationSec: 130 }),
  a(7, 'Dashboard hero shot', 'product', g('#2F3E4A', '#0F0F0F'), ok('Cut out'), 2),
  a(8, 'Mobile app mockup', 'product', g('#E9DDD3', '#C9B5A6'), ok('Cut out'), 0),
  a(9, 'Team photo', 'product', g('#C9B5A6', '#8C7E80'), { tone: 'warn', text: 'Background not removed' }, 0),
  a(10, 'Packaging box', 'product', g('#3B3335', '#E9DDD3'), ok('Cut out'), 1),
  a(11, 'Logo, light', 'logo', g('#0F0F0F', '#2F3E4A'), ok('Transparent'), 0, { usedEverywhere: true }),
  a(12, 'Logo mark', 'logo', g('#F2A39B', '#E9DDD3'), { tone: 'warn', text: 'No transparent background' }, 0),
  a(13, 'Settings screen', 'screenshot', g('#2F3E4A', '#8C7E80'), ok('Ready'), 1),
  a(14, 'Upbeat intro', 'music', g('#F2F2F2', '#E5E5E5'), { tone: 'plain', text: 'Music' }, 0, { durationSec: 45 }),
];
