// Where the carousel will be posted. A platform only sets a ceiling on the number of slides and a warning when a script goes
// over it: it never changes what is written or how it is drawn. No platform selected means no ceiling (the usual 7 slides).
export type Platform = 'instagram' | 'linkedin' | 'facebook' | 'x';

/** Working figures for the most slides a post may have. They are the limits the platforms are understood to have now, and may change. */
export const PLATFORMS: { id: Platform; label: string; max: number }[] = [
  { id: 'instagram', label: 'Instagram', max: 20 },
  { id: 'linkedin', label: 'LinkedIn', max: 20 },
  { id: 'facebook', label: 'Facebook', max: 10 },
  { id: 'x', label: 'X', max: 4 },
];

export const platformOf = (p: Platform | null | undefined) => PLATFORMS.find((x) => x.id === p) ?? null;
export const isPlatform = (v: unknown): v is Platform => PLATFORMS.some((p) => p.id === v);

/** A plain sentence when `count` slides is more than the platform allows, otherwise null. */
export function platformWarning(count: number, platform: Platform | null | undefined, what: 'asked' | 'script' = 'script'): string | null {
  const p = platformOf(platform);
  if (!p || count <= p.max) return null;
  return what === 'asked'
    ? `${p.label} allows at most ${p.max} slides in a post, and ${count} are asked for. It will still be made, but it could not be posted as it is.`
    : `This script has ${count} slides, and ${p.label} allows at most ${p.max} in a post. You could cut ${count - p.max} slide${count - p.max === 1 ? '' : 's'}, or post it somewhere else.`;
}
