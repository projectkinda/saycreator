// How big the pictures sent to the reader are. Smaller pictures travel and are looked at faster, but too small and the reader misses detail.
// The numbers below are what the screen uses; the profiles exist so a test can compare them on the same references (see the Results screen).
export const PROFILES = {
  /** What the screen used before the speed work. */
  before: { pairH: 900, itemPx: 1100 },
  /** What it uses now. */
  now: { pairH: 760, itemPx: 1000 },
  /** The smallest tried. */
  small: { pairH: 560, itemPx: 720 },
} as const;
export type ProfileName = keyof typeof PROFILES;

export const speed: { profile: ProfileName; pairH: number; itemPx: number } = { profile: 'now', ...PROFILES.now };
export function setProfile(p: ProfileName) {
  speed.profile = p;
  speed.pairH = PROFILES[p].pairH;
  speed.itemPx = PROFILES[p].itemPx;
}
if (typeof window !== 'undefined') (window as unknown as { __speed: unknown }).__speed = { speed, setProfile };

/** Switches used by the real before-and-after measurement: the free layout (boxes from the detection) can be turned off to get the old behaviour. */
export const flags = { free: true };
if (typeof window !== 'undefined') (window as unknown as { __flags: unknown }).__flags = flags;
