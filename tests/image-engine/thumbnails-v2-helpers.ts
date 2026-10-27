// Shared by the thumbnail v2 tests: the cases, where the pictures go, and the calls into the harness page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import type { LintResult, Plan } from '../../src/image-engine/types';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
export const OUT = path.join(ROOT, 'out/image-engine/thumbs-v2');
export const IMAGES = path.join(ROOT, 'test-images');

export const NEW_CHECKS = ['subject', 'focal', 'overlap', 'legible'];
export const ALL_CHECKS = ['words', 'readable', 'contrast', 'overlay', 'margins', 'resolution', 'crop', 'brightness', 'sharpness', ...NEW_CHECKS];
export const STYLES = ['hot-flat', 'mono-poster', 'object-neon', 'glass-gradient', 'film-paper', 'editorial-collage'];

/** The test photos and the title for each. `subject` is where a person would drag the pointer (on the face), as a share of the photo; the first photo is left to the guess. */
export interface Case {
  file: string;
  title: string;
  emphasis?: string;
  subject?: { x: number; y: number };
  aspects: ('16:9' | '9:16')[];
}
export const CASES: Case[] = [
  { file: 'GCKR3575.JPG', title: 'Ride Before Sunrise', aspects: ['16:9', '9:16'] },
  { file: 'wp13065863-mahesh-babu-guntur-kaaram-wallpapers.jpg', title: '5 Rules For Dust', subject: { x: 0.5, y: 0.25 }, aspects: ['16:9', '9:16'] },
  { file: 'GHWd3WIW0AICE11.jpg', title: 'The Quiet Genius', subject: { x: 0.5, y: 0.34 }, aspects: ['16:9'] },
  { file: 'filters_quality(95)format(webp) (1).jpg', title: 'Two Sides Of Him', subject: { x: 0.52, y: 0.56 }, aspects: ['16:9'] },
  { file: 'wp13337965-guntur-kaaram-wallpapers.jpg', title: 'Calm Before Storm', subject: { x: 0.47, y: 0.45 }, aspects: ['16:9'] },
];

export const url = (file: string) => '/test-images/' + encodeURIComponent(file);
export const slug = (s: string) => s.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
export const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as { __ie: Record<string, (...x: unknown[]) => unknown> }).__ie[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
export const save = (rel: string, dataUrl: string) => {
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), Buffer.from(dataUrl.replace(/^data:[^,]+,/, ''), 'base64'));
};

export interface RunOption {
  id: string;
  layout: string;
  plan: Plan;
  option: unknown;
  notes: string[];
  subjects: { x: number; y: number; r: number; of: string }[];
  elementsUsed: string[];
  lint: LintResult[];
  ms: number;
  png: string;
  phone: string;
}
export interface Run {
  subject: { x: number; y: number; guessed?: boolean };
  composeMs: number;
  options: RunOption[];
}
export const run = (page: Page, args: Record<string, unknown>) => call<Run>(page, 'thumbV2Run', args);
export const presentCases = () => CASES.filter((c) => fs.existsSync(path.join(IMAGES, c.file)));
